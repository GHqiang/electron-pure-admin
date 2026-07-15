// 报价队列基类
// 提取所有平台报价队列的公共逻辑

import { GET_APP_TYPE_LIST, getOfferFailType } from "@/common/constant.js";
import Logger from "../logger.js";
import getOfferPriceFun from "../autoTicket/commonOfferHandle.js";
import { dynamicPrice, getCurrentTime } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { dictTable } from "@/store/dictTable";
import { extractThirdPartyIds } from "./extractThirdPartyIds.js";
const dictStore = dictTable();
const tokens = platTokens();

// 导出供单测使用
export { extractThirdPartyIds };

/**
 * 报价队列基类
 * 所有平台报价队列都应继承此类
 */
export default class BaseOfferQueue {
  /**
   * 构造函数
   * @param {Object} platformAdapter - 平台适配器实例
   * @param {string} platName - 平台名称
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(platformAdapter, platName, isTestOrder = false) {
    this.platformAdapter = platformAdapter;
    this.platName = platName;
    this.isTestOrder = isTestOrder;
    this.queue = [];
    this.isRunning = false;
    this.isOfferRunning = false;
    this.handledOrders = new Map();
    /** 按系列统计当前正在执行的订单数，用于同系列并发控制 */
    this.runningCountBySeries = new Map();
    /** 按系列记录当前正在执行的订单号集合，与 runningCountBySeries 同步维护，用于诊断日志 */
    this.runningOrdersBySeries = new Map();
    /** 平台已报价缓存：避免对已由平台自动报价的订单重复走查询链 */
    this._platformQuotedCache = { data: [], fetchedAt: 0 };
    /** 拉单防重入标志：防止 fetchOrders 并发执行 */
    this.isFetching = false;
    /** 拉单定时器引用，stop 时清理 */
    this._fetchTimer = null;
  }

  /**
   * 启动队列
   * 模板方法，定义队列启动流程
   *
   * 拉单与调度解耦：拉单由独立定时器驱动，不再阻塞调度器。
   * 调度器由 handleNewOrder 在新订单入队时按需启动（空闲时触发 startProcessingQueue）。
   */
  async start() {
    // 防止重复启动产生多个并发轮询循环
    if (this.isRunning) {
      console.warn("报价队列已在运行中，忽略重复启动");
      return;
    }
    this.isRunning = true;
    this.handledOrders = new Map();
    this.queue = [];

    // 拉单独立定时触发，不阻塞调度器
    this._startFetchLoop();
  }

  /**
   * 启动拉单循环（非阻塞，与调度器解耦）
   *
   * 每隔 getFetchInterval() 秒触发一次拉单。
   * 用 isFetching 标志防止 fetchOrders 并发执行：
   *   - 若上一次拉单尚未完成，本轮跳过，仅调度下一轮
   *   - 子类 fetchOrders 内部的 mockDelay 由调用方传 0 跳过，间隔由定时器控制
   */
  _startFetchLoop() {
    const tick = () => {
      if (!this.isRunning) return;

      // 防重入：上一次拉单未完成则跳过本轮，仅调度下一轮
      if (!this.isFetching) {
        this.isFetching = true;
        // 传 0 跳过子类内部的 mockDelay，拉单间隔由定时器控制
        this.fetchOrders(0)
          .catch(e => console.error("拉单异常", e))
          .finally(() => {
            this.isFetching = false;
          });
      }

      // 无论本轮是否执行拉单，都调度下一轮（间隔支持运行时字典调整）
      this.getFetchInterval().then(
        delay => {
          if (!this.isRunning) return;
          this._fetchTimer = setTimeout(tick, delay * 1000);
        },
        () => {
          // getFetchInterval 内部已有 try/catch，此处兜底防止调度链断裂
          if (!this.isRunning) return;
          this._fetchTimer = setTimeout(tick, 5 * 1000);
        }
      );
    };

    // 立即执行第一次拉单
    tick();
  }

  /**
   * 获取订单获取间隔
   * @returns {Promise<number>} 间隔时间（秒）
   */
  async getFetchInterval() {
    try {
      const platQueueRule = window.localStorage.getItem("platQueueRule");
      if (!platQueueRule) {
        return 5; // 默认5秒
      }

      const rules = JSON.parse(platQueueRule);
      const rule = rules.find(item => item.platName === this.platName);

      return rule?.getInterval || 5;
    } catch (error) {
      console.error("获取获取间隔异常", error);
      return 5;
    }
  }

  /**
   * 获取订单所属系列 key，用于按系列控制并发（不同系列并行，同系列限并发）
   * 子类可按需重写，例如改为 app_type_code
   * @param {Object} order - 订单信息
   * @returns {string} 系列标识
   */
  getSeriesKey(order) {
    const seriesKey = dictStore.dictInfo.offerConcurrencySeriesKey;
    if (seriesKey) {
      return order[seriesKey] || "default";
    }
    return order?.app_name ?? "default";
  }

  /**
   * 获取每系列并发数上限
   * @returns {Promise<number>}
   */
  getOfferConcurrencyPerSeries() {
    return dictStore.dictInfo.offerConcurrencyPerSeries || 2; // 默认每系列限2个订单并发报价
  }

  /**
   * 获取指定系列的并发上限
   * 优先使用 bigChainSeriesConcurrency 字典字段中的专属配置，
   * 未配置时回退到全局 offerConcurrencyPerSeries
   * 无参调用时返回全局默认值（向后兼容）
   * @param {string} [sk] - 系列标识（app_name / app_type_code 等）
   * @returns {number}
   */
  _getSeriesConcurrencyLimit(sk) {
    const baseLimit =
      this._offerConcurrencyPerSeries ??
      dictStore.dictInfo.offerConcurrencyPerSeries ??
      2;

    // 解析大连锁专属并发配置
    const bigChainConfig = dictStore.dictInfo.bigChainSeriesConcurrency;
    if (bigChainConfig) {
      try {
        const configMap =
          typeof bigChainConfig === "string"
            ? JSON.parse(bigChainConfig)
            : bigChainConfig;
        if (sk && configMap[sk] && typeof configMap[sk] === "number") {
          return configMap[sk];
        }
      } catch (e) {
        console.warn("解析 bigChainSeriesConcurrency 失败，使用全局默认值", e);
      }
    }

    return baseLimit;
  }

  /**
   * 记录某系列正在执行的订单号（与 runningCountBySeries 同步维护）
   * @param {string} sk - 系列标识
   * @param {string} orderNumber - 订单号
   */
  _addRunningOrder(sk, orderNumber) {
    if (!this.runningOrdersBySeries.has(sk)) {
      this.runningOrdersBySeries.set(sk, new Set());
    }
    this.runningOrdersBySeries.get(sk).add(orderNumber);
  }

  /**
   * 移除某系列已完成的订单号（与 runningCountBySeries 同步维护）
   * @param {string} sk - 系列标识
   * @param {string} orderNumber - 订单号
   */
  _removeRunningOrder(sk, orderNumber) {
    const set = this.runningOrdersBySeries.get(sk);
    if (set) {
      set.delete(orderNumber);
      if (set.size === 0) {
        this.runningOrdersBySeries.delete(sk);
      }
    }
  }

  /**
   * 获取某系列正在执行的订单号列表（用于诊断日志）
   * @param {string} sk - 系列标识
   * @returns {string[]} 订单号数组，无则空数组
   */
  _getRunningOrders(sk) {
    const set = this.runningOrdersBySeries.get(sk);
    return set ? [...set] : [];
  }

  /**
   * 判断指定系列是否为大连锁系列（在 bigChainSeriesConcurrency 中有专属配置）
   * @param {string} sk - 系列标识
   * @returns {boolean}
   */
  _isBigChainSeries(sk) {
    try {
      const bigChainConfig = dictStore.dictInfo.bigChainSeriesConcurrency;
      if (!bigChainConfig) return false;
      const configMap =
        typeof bigChainConfig === "string"
          ? JSON.parse(bigChainConfig)
          : bigChainConfig;
      return sk && typeof configMap[sk] === "number";
    } catch {
      return false;
    }
  }

  /**
   * 判断订单是否满足调度条件（距截止、系列并发由调用方另判）
   * @param {Object} order
   * @param {number} now
   * @returns {boolean}
   */
  _isOrderDeadlineRunnable(order, now = Date.now()) {
    const skipCheck =
      this.platformAdapter?.config?.features?.skipOfferEndTimeCheck === true;
    if (skipCheck) return true;
    const minOfferHandleEndTime = dictStore.dictInfo.minOfferHandleEndTime;
    if (!order.offer_end_time) return true;
    return order.offer_end_time - now > minOfferHandleEndTime;
  }

  /**
   * 队列中排在本单之前、同系列且可被调度器选中的订单（仅同系列排队）
   * @param {Object} order
   * @returns {string[]} 同系列前方待调度订单号
   */
  _getRunnableSameSeriesAhead(order) {
    const sk = this.getSeriesKey(order);
    const idx = this.queue.findIndex(
      o => o.order_number === order.order_number
    );
    if (idx <= 0) return [];
    const now = Date.now();
    const ahead = [];
    for (let i = 0; i < idx; i++) {
      const o = this.queue[i];
      if (this.getSeriesKey(o) !== sk) continue;
      if (!this._isOrderDeadlineRunnable(o, now)) continue;
      ahead.push(o.order_number);
    }
    return ahead;
  }

  /**
   * 同系列调度阻塞原因（不含其他影院/类型的全局排队）
   * @param {Object} order
   * @returns {string[]}
   */
  _getSeriesBlockReasons(order) {
    const sk = this.getSeriesKey(order);
    const limit = Number(this._getSeriesConcurrencyLimit(sk)) || 2;
    const running = this.runningCountBySeries.get(sk) || 0;
    const reasons = [];
    const now = Date.now();

    if (!this._isOrderDeadlineRunnable(order, now)) {
      const remain = order.offer_end_time - now;
      reasons.push(
        `【本单不可调度】距报价截止过近(剩余${remain}ms，需大于${dictStore.dictInfo.minOfferHandleEndTime}ms)`
      );
      return reasons;
    }

    if (running >= limit) {
      const isBigChain = this._isBigChainSeries(sk);
      reasons.push(
        `【同系列阻塞】${sk}${isBigChain ? "(大连锁)" : ""} 已有 ${running} 单正在报价，达到并发上限 ${limit}，本单需等同系列报完`
      );
    }

    const aheadSameSeries = this._getRunnableSameSeriesAhead(order);
    if (aheadSameSeries.length > 0) {
      reasons.push(
        `【同系列排队】${sk} 前面还有 ${aheadSameSeries.length} 单同系列待调度(订单号: ${aheadSameSeries.join("、")})，本单需等它们先跑`
      );
    }

    if (!reasons.length) {
      if (this.isOfferRunning) {
        reasons.push(
          `【同系列畅通】${sk} 当前无同系列阻塞(${running}/${limit})，可与其它系列并行，无需等同系列其它单`
        );
      } else {
        reasons.push(`【同系列畅通】${sk} 调度器空闲，本单将尽快开始报价`);
      }
    }

    return reasons;
  }

  /**
   * 同系列调度结论（一行中文，便于日志检索）
   * @param {Object} order
   * @returns {string}
   */
  _buildSeriesDelaySummary(order) {
    const reasons = this._getSeriesBlockReasons(order);
    const blocked = reasons.some(
      r => r.includes("阻塞") || r.includes("排队") || r.includes("不可调度")
    );
    if (blocked) return reasons.join("；");
    return reasons[0] || "同系列无阻塞";
  }

  /**
   * 构建入队时的同系列调度快照
   * @param {Object} order
   * @returns {Object}
   */
  _buildScheduleSnapshot(order) {
    const sk = this.getSeriesKey(order);
    const limit = Number(this._getSeriesConcurrencyLimit(sk)) || 2;
    const running = this.runningCountBySeries.get(sk) || 0;
    const aheadSameSeries = this._getRunnableSameSeriesAhead(order);
    const globalPos = this.queue.findIndex(
      o => o.order_number === order.order_number
    );
    return {
      // 说明: "入队时【同系列】调度诊断：仅分析本系列是否被同类型挡住，其它系列排队不计入阻塞",
      调度结论: this._buildSeriesDelaySummary(order),
      // 订单号: order.order_number,
      // 系列标识: sk,
      本系列正在报价数: running,
      本系列正在报价订单号: this._getRunningOrders(sk),
      本系列并发上限: limit,
      本系列是否大连锁: this._isBigChainSeries(sk),
      // 同系列阻塞原因: this._getSeriesBlockReasons(order),
      同系列前方排队订单: aheadSameSeries
      // 调度器是否在运行: this.isOfferRunning,
      // 各系列正在报价数: Object.fromEntries(this.runningCountBySeries),
      // 各系列正在报价订单号: Object.fromEntries(
      //   [...this.runningOrdersBySeries.entries()].map(([k, v]) => [k, [...v]])
      // )
      // 全局队列仅供参考: {
      //   总队列长度: this.queue.length,
      //   本单在总队列排位: globalPos >= 0 ? globalPos + 1 : null,
      //   备注: "总排位含其它系列订单，不代表本系列需等待这么多单"
      // }
    };
  }

  /**
   * 获取订单（子类实现）
   * @param {number} fetchDelay - 获取间隔
   * @returns {Promise<void>}
   */
  async fetchOrders(fetchDelay) {
    throw new Error(`平台 ${this.platName} 未实现 fetchOrders 方法`);
  }

  /**
   * 处理新订单（通用逻辑）
   * @param {Object} item - 订单信息
   * @param {Object} oldOrder - 旧订单信息（可选）
   */
  handleNewOrder(item, oldOrder = null) {
    // 增加报价截止时间判断，小于等于阈值则不处理
    // 部分平台（如蚂蚁旧版）通过 skipOfferEndTimeCheck 跳过该判断，保持兼容
    const skipCheck =
      this.platformAdapter?.config?.features?.skipOfferEndTimeCheck === true;
    if (!skipCheck) {
      if (
        item.offer_end_time &&
        item.offer_end_time - new Date().getTime() <=
          dictStore.dictInfo.minOfferQueueEndTime
      ) {
        return;
      }
    }

    console.warn("新的待报价订单", item);

    // 去重检查：订单已在 handledOrders 或队列中，跳过
    const orderKey = `${item.plat_name}_${item.order_number}`;
    if (this.handledOrders.has(orderKey)) {
      return;
    }
    // 也检查是否已在队列中（兜底：handledOrders 被淘汰时也能拦住）
    if (this.queue.some(o => o.order_number === item.order_number)) {
      return;
    }
    this.handledOrders.set(orderKey, 1);

    // 如果 handledOrders 的大小超过了容量上限（字典可配，默认500），则移除最早添加的条目
    const handledOrdersCapacity =
      Number(dictStore.dictInfo.handledOrdersCapacity) || 500;
    if (this.handledOrders.size > handledOrdersCapacity) {
      const firstKey = this.handledOrders.keys().next().value;
      if (firstKey !== undefined) {
        this.handledOrders.delete(firstKey);
      }
    }

    const logger = new Logger({ logType: 1 });
    logger.init(item);
    logger.infoSave("新的待报价订单", { newOrder: item, oldOrder });
    item._offerEnqueueAt = Date.now();

    this.insertOrderIntoQueue(item);

    if (this.isOfferRunning) {
      // 调度器运行中：本系列不阻塞则立即派出，不等 finish 回调唤醒
      const sk = this.getSeriesKey(item);
      const limit = this._getSeriesConcurrencyLimit(sk);
      const running = this.runningCountBySeries.get(sk) || 0;
      if (running < limit) {
        // 路径①：本系列畅通，立即派出
        const idx = this.queue.findIndex(
          o => o.order_number === item.order_number
        );
        if (idx !== -1) this.queue.splice(idx, 1);
        this.runningCountBySeries.set(sk, running + 1);
        this._addRunningOrder(sk, item.order_number);
        const p = this.orderHandle(item);
        p.finally(() => {
          this.runningCountBySeries.set(
            sk,
            Math.max(0, (this.runningCountBySeries.get(sk) || 0) - 1)
          );
          this._removeRunningOrder(sk, item.order_number);
          // 订单完成后批量唤醒队列中其他畅通订单（含 allIdle 检查与 isOfferRunning 释放）
          this._dispatchBatch();
        });
        // 立即派出当前单后，批量扫队列把所有畅通的一起派
        // 覆盖场景：tryStartOne 尚在 getOfferConcurrencyPerSeries 未执行时，
        // 队列中已有其他畅通订单可一并派出
        this._dispatchBatch();
      } else {
        // 路径②：本系列阻塞，进队列等待
        item._offerEnqueueBlockReasons = this._getSeriesBlockReasons(item);
        item._offerEnqueueDelaySummary = this._buildSeriesDelaySummary(item);
        const snapshot = this._buildScheduleSnapshot(item);
        snapshot.调度路径 = "②本系列阻塞";
        logger.infoSave(`订单入队-调度诊断`, snapshot);
      }
    } else {
      // 路径③：调度器空闲，触发 startProcessingQueue
      const sk = this.getSeriesKey(item);
      const limit = this._getSeriesConcurrencyLimit(sk);
      logger.infoSave("订单入队-调度诊断", {
        调度路径: "③触发调度器启动",
        系列标识: sk,
        本系列并发上限: limit,
        队列长度: this.queue.length,
        说明: "调度器空闲，触发 startProcessingQueue"
      });
    }

    logger.logUpload();

    if (!this.isOfferRunning && this.isRunning) {
      this.startProcessingQueue();
    }
  }

  /**
   * 插入队列（按 offer_end_time 升序，二分查找插入位置）
   * 队列保持升序不变量：所有已入队元素的 offer_end_time 单调不降
   * @param {Object} order - 订单信息
   */
  insertOrderIntoQueue(order) {
    // 二分查找第一个 offer_end_time > order.offer_end_time 的位置
    // 与原 findIndex 语义一致：相等时插入到后方（稳定排序）
    let lo = 0,
      hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (order.offer_end_time < this.queue[mid].offer_end_time) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    // lo == hi 即插入位置：splice 在该处插入
    // 注：offer_end_time 为 undefined 时比较结果为 false，会落到 lo=hi=queue.length（末尾），与原 findIndex 行为一致
    this.queue.splice(lo, 0, order);
  }

  /**
   * 从队列中找第一个可执行的订单：未过期且其系列当前运行数未达上限
   * @returns {{ order: Object, index: number } | null}
   */
  findNextOrderToRun() {
    const minOfferHandleEndTime = dictStore.dictInfo.minOfferHandleEndTime;
    const now = Date.now();
    // 某些平台（如蚂蚁）offer_end_time 不准，通过 skipOfferEndTimeCheck 跳过过期判断
    const skipCheck =
      this.platformAdapter?.config?.features?.skipOfferEndTimeCheck === true;
    for (let i = 0; i < this.queue.length; i++) {
      const order = this.queue[i];
      if (!skipCheck && order.offer_end_time - now <= minOfferHandleEndTime) {
        continue;
      }
      const sk = this.getSeriesKey(order);
      const seriesLimit = this._getSeriesConcurrencyLimit(sk);
      if ((this.runningCountBySeries.get(sk) || 0) >= seriesLimit) continue;
      return { order, index: i };
    }
    return null;
  }

  /**
   * 开始处理队列（按系列有限并发：不同系列并行，同系列限并发）
   */
  startProcessingQueue() {
    this.isOfferRunning = true;
    this.runningCountBySeries.clear();
    this.runningOrdersBySeries.clear();
    this._offerConcurrencyPerSeries = this.getOfferConcurrencyPerSeries();
    this._dispatchBatch();
  }

  /**
   * 批量派出队列中所有可执行的订单
   * 同步 while 循环：不断调用 findNextOrderToRun 直到无可执行订单
   * 每个 orderHandle 完成后在 finally 中继续调用本方法唤醒下一轮
   * 全部系列空闲时释放 isOfferRunning 标志
   *
   * 注意：若 isOfferRunning 为 false（如被 finally 释放）但有可派订单，
   * 本方法会重新置 true，防止 handleNewOrder 误判调度器空闲而重复触发
   * startProcessingQueue（其内部 runningCountBySeries.clear() 会导致计数错乱）
   */
  _dispatchBatch() {
    if (!this.isRunning) return;
    if (!this.isOfferRunning) {
      this.isOfferRunning = true;
    }
    while (this.isRunning) {
      const next = this.findNextOrderToRun();
      if (!next) {
        if (this.queue.length > 0) {
          const blockedSummary = this.queue.map(order => ({
            订单号: order.order_number,
            系列: this.getSeriesKey(order),
            同系列调度结论: this._buildSeriesDelaySummary(order)
          }));
          console.warn("队列暂无可调度订单(按同系列诊断)", {
            说明: "以下为队列内各单同系列阻塞情况",
            platName: this.platName,
            队列长度: this.queue.length,
            各系列正在报价数: Object.fromEntries(this.runningCountBySeries),
            每系列并发上限: this._getSeriesConcurrencyLimit(),
            blockedSummary
          });
        }
        break;
      }
      const { order, index } = next;
      this.queue.splice(index, 1);
      const sk = this.getSeriesKey(order);
      this.runningCountBySeries.set(
        sk,
        (this.runningCountBySeries.get(sk) || 0) + 1
      );
      this._addRunningOrder(sk, order.order_number);
      const p = this.orderHandle(order);
      p.finally(() => {
        this.runningCountBySeries.set(
          sk,
          Math.max(0, (this.runningCountBySeries.get(sk) || 0) - 1)
        );
        this._removeRunningOrder(sk, order.order_number);
        this._dispatchBatch();
      });
    }
    const allIdle = [...this.runningCountBySeries.values()].every(c => c === 0);
    // 当所有系列都空闲时，无论当前队列中是否还有「暂时不可执行」的订单，
    // 都认为本轮调度已经结束，释放 isOfferRunning 标记，
    // 以便后续新订单到来时可以重新触发队列启动，避免队列进入“假运行”阻塞状态。
    if (allIdle) {
      if (this.queue.length > 0) {
        console.warn(
          "当前无执行中的报价任务，但队列中仍有未满足执行条件的订单，等待下一轮调度",
          this.queue
        );
      }
      this.isOfferRunning = false;
    }
  }

  /**
   * 处理订单（通用逻辑）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 处理结果
   */
  async orderHandle(order) {
    const logger = new Logger({ logType: 1 });
    try {
      if (this.isRunning || this.isTestOrder) {
        logger.init(order);
        const orderHandleStartAt = Date.now();
        let offerResult;
        const minOfferHandleEndTime = dictStore.dictInfo.minOfferHandleEndTime;
        const offerHandleTimeout =
          this.platformAdapter?.config?.features?.offerHandleTimeout != null
            ? this.platformAdapter.config.features.offerHandleTimeout
            : dictStore.dictInfo.offerHandleTimeout || 15 * 1000;
        if (
          order.offer_end_time - new Date().getTime() <=
            minOfferHandleEndTime &&
          order.plat_name !== "mayi"
        ) {
          logger.errorSave(
            `订单报价截止时间小于等于${minOfferHandleEndTime}毫秒，跳过报价`,
            {
              offer_end_time: order.offer_end_time,
              current_time: new Date().getTime()
            }
          );
        } else {
          // 平台同步报价检查：查最近50条报价记录，若当前订单已被平台报价则跳过
          const platformCheckStartAt = Date.now();
          const platformQuoteRecord = await this._checkPlatformAlreadyQuoted(
            order,
            logger
          );
          const platformCheckDurationMs = Date.now() - platformCheckStartAt;
          if (platformQuoteRecord) {
            logger.infoSave("平台已报价，跳过报价流程");
            await this.addOrderHandleRecord(
              order,
              {
                offerRule: {},
                err_msg: "平台已报价"
              },
              logger,
              {
                offer_duration: Date.now() - orderHandleStartAt,
                queue_wait_ms: order._offerEnqueueAt
                  ? orderHandleStartAt - order._offerEnqueueAt
                  : null,
                offer_from: 1,
                plat_rule_id: platformQuoteRecord.rule_id || null
              }
            );
            logger.logUpload();
            return;
          }

          // logger.infoSave("开始处理订单", { order });
          const queueWaitMs = order._offerEnqueueAt
            ? orderHandleStartAt - order._offerEnqueueAt
            : null;
          const sk = this.getSeriesKey(order);
          const seriesRunning = this.runningCountBySeries.get(sk) || 0;
          logger.infoSave("订单报价链路开始", {
            入队到开跑耗时ms: queueWaitMs,
            本系列正在报价数: seriesRunning,
            本系列正在报价订单号: this._getRunningOrders(sk)
          });
          if (queueWaitMs != null && queueWaitMs >= 1000) {
            logger.infoSave(
              `订单等待${(queueWaitMs / 1000).toFixed(1)}秒后开始报价`
            );
          }
          // 超时保护：超过 offerHandleTimeout 直接结束，不再等待报价结果
          // 若 submitOffer 已在超时前发出，singleOffer 内部会在完成后自行补写成功报价记录
          const singleOfferStartAt = Date.now();
          const timeoutFlag = { value: false };
          offerResult = await Promise.race([
            this.singleOffer({
              order,
              offerList: [], // 动态调价暂时不用先传空
              logger,
              timeoutFlag
            }),
            new Promise(resolve =>
              setTimeout(() => {
                timeoutFlag.value = true;
                logger.infoSave(
                  `订单报价处理超时，超过${offerHandleTimeout}ms 未完成`
                );
                resolve();
              }, offerHandleTimeout)
            )
          ]);
          const singleOfferDurationMs = Date.now() - singleOfferStartAt;
          logger.infoSave("订单报价链路竞速结果", {
            order_number: order.order_number,
            总耗时ms: Date.now() - orderHandleStartAt,
            平台已报价检查耗时ms: platformCheckDurationMs,
            报价执行净耗时ms: singleOfferDurationMs,
            hasOfferResult: !!offerResult,
            hasSubmitResult: !!offerResult?.res,
            hasOfferRule: !!offerResult?.offerRule,
            err_msg: offerResult?.err_msg || ""
          });
        }
        console.warn("订单处理完成", offerResult);
        await this.addOrderHandleRecord(order, offerResult, logger, {
          offer_duration: Date.now() - orderHandleStartAt,
          queue_wait_ms: order._offerEnqueueAt
            ? orderHandleStartAt - order._offerEnqueueAt
            : null
        });
        logger.logUpload();
        return offerResult;
      } else {
        console.warn("订单报价队列已停止");
      }
    } catch (error) {
      logger.errorSave("订单执行报价异常", { error });
      logger.logUpload();
      console.error("订单执行报价异常", error);
    }
  }

  /**
   * 单个报价（通用逻辑）
   * @param {Object} params - 报价参数
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果
   */
  async singleOffer({ order, offerList = [], logger, timeoutFlag }) {
    const log = logger ?? this.logger;
    let offerRule;
    try {
      log.infoSave("进入 singleOffer", {
        order_number: order.order_number,
        app_name: order.app_name,
        plat_name: order.plat_name
      });
      // 获取报价价格
      const offerExample = getOfferPriceFun({
        appFlag: order.app_name,
        plat_name: this.platName,
        isTestOrder: this.isTestOrder
      });

      if (!offerExample) {
        console.error("获取报价实例失败");
        return;
      }

      const result = await offerExample.getEndOfferPrice({
        order,
        offerList
      });

      // 超时检查：getEndOfferPrice 耗时过长已超时，不再继续后续提交流程
      if (timeoutFlag?.value) {
        log.infoSave("getEndOfferPrice 完成后检测到已超时，跳过提交报价");
        return {
          offerRule: result?.offerRule,
          err_msg: "报价处理超时，已跳过提交"
        };
      }

      log.infoSave("getEndOfferPrice 返回", {
        order_number: order.order_number,
        hasResult: !!result,
        hasEndPrice: !!result?.endPrice,
        hasOfferRule: !!result?.offerRule,
        err_msg: result?.err_msg || ""
      });

      // result: {endPrice, offerRule} | {offerRule, err_msg, err_info} | {err_msg, err_info}
      if (!result) {
        console.error("获取最终报价返回空");
        return;
      }

      const { endPrice, err_msg, err_info, app_name } = result || {};
      offerRule = result?.offerRule;
      if (!endPrice) {
        return { offerRule, err_msg, err_info };
      }

      // 特殊处理：wanxiangh5
      if (app_name === "wanxiangh5") {
        order.app_name = app_name;
      }

      // 动态调价处理
      const finalPrice = await dynamicPrice({
        order,
        offerRule,
        logger: log
      });
      offerRule.offer_end_amount = finalPrice;

      // 按平台配置决定是否需要获取规则ID
      let rule_id, member_price;
      if (this.platformAdapter.config.features.isNeedRuleId) {
        rule_id = await this.getRuleId(order, log, offerRule);
      }
      if (rule_id) {
        member_price = finalPrice - 1;
      }

      // 提交报价（部分平台如麻花需要 offerRule 计算 isDirectGetOrder）
      const offerParams = this.platformAdapter.config.params.offerParams({
        order,
        price: finalPrice,
        ruleId: rule_id,
        memberPrice: member_price,
        offerRule
      });
      log.infoSave("准备提交报价", {
        order_number: order.order_number,
        finalPrice,
        hasRuleId: !!rule_id
      });

      // 最终防线：提交前再次检查超时标志
      if (timeoutFlag?.value) {
        log.infoSave("提交报价前检测到已超时，放弃提交");
        return { offerRule, err_msg: "报价处理超时，已放弃提交" };
      }

      if (this.isTestOrder) {
        log.infoSave("测试单不提交报价", offerParams);
        return { res: { msg: "测试单暂不报价" }, offerRule };
      }
      const res = await this.platformAdapter.submitOffer(offerParams, {
        logger: log
      });
      // 赋值报价返回的待确认订单id，以便出票时好反推出来报价订单号
      if (order.plat_name === "yinghuasuan" && res?.data?.quote_id) {
        order.id = res?.data?.quote_id;
      }
      log.infoSave("提交报价结果", { res, order });

      // 猎人特殊处理：已自动报价视为失败，直接返回
      if (order.plat_name === "lieren" && res?.message === "已自动报价") {
        log.errorSave("猎人已自动报价");
        return { offerRule };
      }

      // 超时兜底：若 submitOffer 在超时后才返回，但提交本身成功了，
      // 此时 orderHandle 的 Promise.race 已超时结算并写入失败记录，
      // 这里补写一条成功报价记录到 offer_record 表，确保出票流程能查到
      if (timeoutFlag?.value && res) {
        log.infoSave("提交报价在超时后完成，补写成功报价记录");
        await this.addOrderHandleRecord(
          order,
          { res, offerRule, cinemaInfo: result?.cinemaInfo, cacheHit: result?.cacheHit },
          logger,
          { offer_from: 2 }
        );
      }

      return {
        res,
        offerRule,
        cinemaInfo: result?.cinemaInfo,
        cacheHit: result?.cacheHit
      };
    } catch (error) {
      log.errorSave("单个报价异常", { error });
      return { offerRule };
    }
  }

  /**
   * 获取规则ID（子类实现）
   * @param {Object} order - 订单信息
   * @returns {Promise<string|number|null>} 规则ID
   */
  async getRuleId(order) {
    throw new Error(`平台 ${this.platName} 未实现 getRuleId 方法`);
  }

  /**
   * 检查平台是否已对该订单报价（避免重复走城市/影院/会员价等查询链）
   * 仅对 fixedOfferToPlatList 字典中配置的平台生效，每 30s 刷新一次缓存
   * @param {Object} order - 订单信息
   * @param {Object} logger - 日志实例
   * @returns {Promise<Object|null>} 匹配到的报价记录或 null
   */
  async _checkPlatformAlreadyQuoted(order, logger) {
    try {
      const fixedOfferToPlatList =
        dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];
      if (!fixedOfferToPlatList.includes(order.plat_name)) return null;

      const now = Date.now();
      if (now - this._platformQuotedCache.fetchedAt > 30000) {
        const res = await this.platformAdapter.api.queryOfferRecord({
          page: 1,
          limit: 50
        });
        this._platformQuotedCache.data = res?.data || [];
        this._platformQuotedCache.fetchedAt = now;
        logger.infoSave("刷新平台已报价缓存", {
          count: this._platformQuotedCache.data.length
        });
      }

      const matchedRecord = this._platformQuotedCache.data.find(
        r => r.order_number === order.order_number
      );
      if (matchedRecord) {
        logger.infoSave("平台已报价-命中", {
          order_number: order.order_number,
          rule_id: matchedRecord.rule_id
        });
      }
      return matchedRecord || null;
    } catch (error) {
      logger.infoSave("检查平台报价状态异常，放行继续报价", {
        error: error?.message
      });
      return null; // 异常时放行，不阻塞报价
    }
  }

  /**
   * 添加订单处理记录
   * @param {Object} order - 订单信息
   * @param {Object} offerResult - 报价结果
   * @param {Object} logger - 该订单的 logger 实例（并发安全）
   * @param {Object} [extra] - 额外字段（如 offer_duration 报价链路耗时ms）
   * @returns {Promise<void>}
   */
  async addOrderHandleRecord(order, offerResult, logger, extra = {}) {
    const log = logger ?? this.logger;
    try {
      // offerResult: { res, offerRule } || { offerRule } || undefined
      const errInfoObj = log.getLastErrMsgAndInfo();
      log.infoSave("准备写入报价记录", {
        order_number: order.order_number,
        hasOfferResult: !!offerResult,
        hasSubmitResult: !!offerResult?.res,
        hasOfferRule: !!offerResult?.offerRule
      });

      const serOrderInfo = {
        plat_name: this.platName,
        app_name:
          order.app_name || offerResult?.offerRule?.shadowLineName || "",
        order_id: order.id,
        order_number: order.order_number,
        tpp_price: order.tpp_price,
        supplier_max_price: order.supplier_max_price,
        city_name: order.city_name,
        cinema_addr: order.cinema_addr,
        ticket_num: order.ticket_num,
        cinema_name: order.cinema_name,
        hall_name: order.hall_name,
        film_name: order.film_name,
        show_time: order.show_time,
        cinema_code: order.cinema_code,
        cinema_group: order.cinema_group,
        offer_type: offerResult?.offerRule?.offerType,
        rule_status: offerResult?.offerRule?.status,
        offer_end_amount: offerResult?.offerRule?.offer_end_amount,
        member_price: offerResult?.offerRule?.cost_price,
        real_member_price: offerResult?.offerRule?.real_member_price,
        member_discount: offerResult?.offerRule?.member_discount,
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        processing_time: getCurrentTime(),
        err_msg: offerResult?.err_msg || errInfoObj?.err_msg || "",
        err_info: offerResult?.err_info || errInfoObj?.err_info || "",
        rewards: order.rewards,
        rule: tokens.userInfo.rule,
        offer_rule_id: offerResult?.offerRule?.id,
        offer_from: extra.offer_from ?? 2, // 1-平台报价 2-机器报价
        adjust_price: offerResult?.offerRule?.adjustPrice,
        price_spread: offerResult?.offerRule?.price_spread,
        offer_duration: extra.offer_duration ?? null,
        queue_wait_ms: extra.queue_wait_ms ?? null
      };
      // 提取第三方 ID 集合（跨订单复用）：仅成功报价且解析出 cinemaInfo 时写入
      const thirdPartyIds = offerResult?.cinemaInfo
        ? extractThirdPartyIds(offerResult.cinemaInfo, serOrderInfo.app_name)
        : null;
      if (thirdPartyIds) {
        serOrderInfo.third_party_ids = JSON.stringify(thirdPartyIds);
      }
      // 缓存命中来源（0=未命中，1=本地缓存命中，2=远端缓存命中），用于统计缓存命中率
      serOrderInfo.cache_hit = offerResult?.cacheHit ?? 0;
      // 仅平台报价时才上送 plat_rule_id
      if (extra.offer_from == 1 && extra.plat_rule_id) {
        serOrderInfo.plat_rule_id = extra.plat_rule_id;
      }

      const targetInfo = GET_APP_TYPE_LIST().find(item =>
        item.app_name_list.includes(serOrderInfo.app_name)
      );

      if (targetInfo) {
        serOrderInfo.app_type = targetInfo.app_type_code;
      }

      // 仅失败时上送失败原因分类
      if (serOrderInfo.order_status != 1) {
        serOrderInfo.err_type = getOfferFailType(serOrderInfo.err_msg);
      }

      // 检查测试订单标志
      const shouldSave = !this.isTestOrder;
      if (shouldSave) {
        console.warn("数据库存储当前订单报价记录", serOrderInfo);
        await svApi.addOfferRecord(serOrderInfo);
        log.infoSave("报价记录入库成功", {
          order_number: order.order_number,
          order_status: serOrderInfo.order_status
        });
      }
    } catch (error) {
      console.error("添加订单处理记录异常", error);
      log.errorSave("添加订单处理记录异常", { error });
    }
  }

  /**
   * 停止队列运行
   */
  stop() {
    this.isRunning = false;
    // 清理拉单定时器，防止停止后仍触发拉单
    if (this._fetchTimer) {
      clearTimeout(this._fetchTimer);
      this._fetchTimer = null;
    }
    console.warn("主动停止订单自动报价队列");
  }

  /**
   * 获取待报价订单列表（子类实现）
   * @returns {Promise<Array>} 订单列表
   */
  async getStayOfferList() {
    throw new Error(`平台 ${this.platName} 未实现 getStayOfferList 方法`);
  }
}
