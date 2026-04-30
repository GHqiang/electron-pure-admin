// 报价队列基类
// 提取所有平台报价队列的公共逻辑

import { GET_APP_TYPE_LIST } from "@/common/constant.js";
import Logger from "../logger.js";
import getOfferPriceFun from "../autoTicket/commonOfferHandle.js";
import { dynamicPrice, getCurrentTime } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();
const tokens = platTokens();

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
  }

  /**
   * 启动队列
   * 模板方法，定义队列启动流程
   */
  async start() {
    this.isRunning = true;
    this.handledOrders = new Map();
    this.queue = [];

    while (this.isRunning) {
      const fetchDelay = await this.getFetchInterval();
      await this.fetchOrders(fetchDelay);
    }
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
  async getOfferConcurrencyPerSeries() {
    return dictStore.dictInfo.offerConcurrencyPerSeries || 2; // 默认每系列限2个订单并发报价
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
    this.handledOrders.set(item.order_number, 1);

    // 如果 handledOrders 的大小超过了100，则移除最早添加的条目
    if (this.handledOrders.size > 100) {
      const firstKey = this.handledOrders.keys().next().value;
      if (firstKey !== undefined) {
        this.handledOrders.delete(firstKey);
      }
    }

    const logger = new Logger({ logType: 1 });
    logger.init(item);
    logger.infoSave("新的待报价订单", { newOrder: item, oldOrder });
    logger.logUpload();

    this.insertOrderIntoQueue(item);

    if (!this.isOfferRunning && this.isRunning) {
      this.startProcessingQueue();
    }
  }

  /**
   * 插入队列（按截止时间排序）
   * @param {Object} order - 订单信息
   */
  insertOrderIntoQueue(order) {
    const index = this.queue.findIndex(
      item => order.offer_end_time < item.offer_end_time
    );

    if (index === -1) {
      this.queue.push(order);
    } else {
      this.queue.splice(index, 0, order);
    }
  }

  /**
   * 从队列中找第一个可执行的订单：未过期且其系列当前运行数未达上限
   * @returns {{ order: Object, index: number } | null}
   */
  findNextOrderToRun() {
    const minOfferHandleEndTime = dictStore.dictInfo.minOfferHandleEndTime;
    const limit = this._offerConcurrencyPerSeries ?? 2;
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
      if ((this.runningCountBySeries.get(sk) || 0) >= limit) continue;
      return { order, index: i };
    }
    return null;
  }

  /**
   * 开始处理队列（按系列有限并发：不同系列并行，同系列限并发）
   */
  async startProcessingQueue() {
    this.isOfferRunning = true;
    this.runningCountBySeries.clear();
    this._offerConcurrencyPerSeries = await this.getOfferConcurrencyPerSeries();

    const tryStartOne = () => {
      while (this.isRunning) {
        const next = this.findNextOrderToRun();
        if (!next) break;
        const { order, index } = next;
        this.queue.splice(index, 1);
        const sk = this.getSeriesKey(order);
        this.runningCountBySeries.set(
          sk,
          (this.runningCountBySeries.get(sk) || 0) + 1
        );
        const p = this.orderHandle(order);
        p.finally(() => {
          this.runningCountBySeries.set(
            sk,
            Math.max(0, (this.runningCountBySeries.get(sk) || 0) - 1)
          );
          tryStartOne();
        });
      }
      const allIdle = [...this.runningCountBySeries.values()].every(
        c => c === 0
      );
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
    };

    tryStartOne();
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
          dictStore.dictInfo.offerHandleTimeout || 15 * 1000;
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
          // logger.infoSave("开始处理订单", { order });
          logger.infoSave("订单报价链路开始", {
            order_number: order.order_number,
            app_name: order.app_name,
            offerHandleTimeout,
            orderHandleStartAt
          });
          // 为防止下游接口异常导致 Promise 长时间不结束，这里增加整体超时保护，避免队列被单个订单永久阻塞
          offerResult = await Promise.race([
            this.singleOffer({
              order,
              offerList: [], // 动态调价暂时不用先传空
              logger
            }),
            new Promise((resolve, reject) =>
              setTimeout(() => {
                logger.infoSave(
                  `订单报价处理超时，超过${offerHandleTimeout}ms 未完成`
                );
                resolve();
                // reject(
                //   new Error(
                //     `订单报价处理超时，超过${offerHandleTimeout}ms 未完成`
                //   )
                // );
              }, offerHandleTimeout)
            )
          ]);
          logger.infoSave("订单报价链路竞速结果", {
            order_number: order.order_number,
            elapsedMs: Date.now() - orderHandleStartAt,
            hasOfferResult: !!offerResult,
            hasSubmitResult: !!offerResult?.res,
            hasOfferRule: !!offerResult?.offerRule,
            err_msg: offerResult?.err_msg || ""
          });
        }
        console.warn("订单处理完成", offerResult);
        await this.addOrderHandleRecord(order, offerResult, logger);
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
  async singleOffer({ order, offerList = [], logger }) {
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
      if (order.plat_name === "lieren" && res?.message === "已自动报价") {
        log.errorSave("猎人已自动报价");
        return { offerRule };
      }
      return { res, offerRule };
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
   * 添加订单处理记录
   * @param {Object} order - 订单信息
   * @param {Object} offerResult - 报价结果
   * @param {Object} logger - 该订单的 logger 实例（并发安全）
   * @returns {Promise<void>}
   */
  async addOrderHandleRecord(order, offerResult, logger) {
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
        offer_from: 2, // 1-平台报价 2-机器报价
        adjust_price: offerResult?.offerRule?.adjustPrice,
        price_spread: offerResult?.offerRule?.price_spread
      };

      const targetInfo = GET_APP_TYPE_LIST().find(item =>
        item.app_name_list.includes(serOrderInfo.app_name)
      );

      if (targetInfo) {
        serOrderInfo.app_type = targetInfo.app_type_code;
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
