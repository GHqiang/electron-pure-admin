// 出票队列基类
// 提取所有平台出票队列的公共逻辑

import {
  getCurrentTime,
  logUpload,
  sendWxPusherMessage
} from "@/utils/utils.js";
import Logger from "../logger.js";
import StrategyFactory from "@/common/autoTicket/buyTicket/index";
import svApi from "@/api/sv-api";
import refreshLocalOfferRuleList, {
  queryAppOfferRuleList
} from "@/common/ruleStoreRefresh";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
import {
  GET_APP_TYPE_LIST,
  GET_APP_INFO,
  LIERENR_REWARDS
} from "@/common/constant";
import { getPlatFeeRate } from "@/common/autoTicket/buyTicket/common/offerHelper";
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import { useDataTableStore } from "@/store/offerRule";
const offerRules = useDataTableStore();
const { offerRuleList } = storeToRefs(offerRules);

import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

/** 跨实例去重：挂载到 window 确保模块即使被重复加载也共享同一去重 Map */
const GLOBAL_HANDLED_TTL = 30 * 60 * 1000;

const getGlobalMap = () => {
  if (!window.__ticketGlobalHandledOrders) {
    window.__ticketGlobalHandledOrders = new Map();
  }
  return window.__ticketGlobalHandledOrders;
};

const getGlobalOrderKey = (appFlag, order) =>
  `${appFlag}::${order.plat_name}::${order.order_number}`;

const isGloballyHandled = (appFlag, order) => {
  const key = getGlobalOrderKey(appFlag, order);
  const ts = getGlobalMap().get(key);
  if (!ts) return false;
  if (Date.now() - ts > GLOBAL_HANDLED_TTL) {
    getGlobalMap().delete(key);
    return false;
  }
  return true;
};

const markGloballyHandled = (appFlag, order) => {
  getGlobalMap().set(getGlobalOrderKey(appFlag, order), Date.now());
};

/**
 * 出票队列基类
 * 所有平台出票队列都应继承此类
 */
export default class BaseTicketQueue {
  /**
   * 构造函数
   * @param {string} appFlag - 影院标识
   * @param {boolean} isTestOrder - 是否为测试订单模式
   * @param {Object} platformAdapter - 平台适配器实例（可选）
   */
  constructor(appFlag, isTestOrder = false, platformAdapter = null) {
    this.appFlag = appFlag;
    this.isTestOrder = isTestOrder;
    this.platformAdapter = platformAdapter;
    this.queue = [];
    this.isRunning = false;
    this.handledOrders = new Map();
    this.prevOrderNumber = "";
    this.eventName = `newOrder_${appFlag}`;
    this.isStart = false;
    this.logger = new Logger({ logType: 3 });
    this._boundHandleNewOrder = this.handleNewOrder.bind(this);
    this._listenerAttached = false;
  }

  /** 供工厂绑定 window 事件时使用 */
  getEventHandler() {
    return this._boundHandleNewOrder;
  }

  attachListener() {
    if (this._listenerAttached) return;
    // window 级别防重：即使模块被重复加载产生新实例，也不重复注册同名事件
    // 使用 Map 记录事件名→handler 函数，确保只有真正注册了监听器的实例才能移除它
    if (!window.__ticketEventHandlers) {
      window.__ticketEventHandlers = new Map();
    }
    if (window.__ticketEventHandlers.has(this.eventName)) {
      this.logger.warn(`事件 ${this.eventName} 已被其他实例注册，跳过重复绑定`);
      // 注意：不设置 _listenerAttached = true，因为本实例并未实际注册监听器
      // 这样 detachListener 在本实例上是空操作，不会误删其他实例的监听器
      return;
    }
    window.addEventListener(this.eventName, this._boundHandleNewOrder);
    window.__ticketEventHandlers.set(this.eventName, this._boundHandleNewOrder);
    this._listenerAttached = true;
  }

  detachListener() {
    if (!this._listenerAttached) return;
    // 只有本实例是监听器的实际注册者时才移除（通过函数引用精确比对）
    if (
      window.__ticketEventHandlers?.get(this.eventName) ===
      this._boundHandleNewOrder
    ) {
      window.removeEventListener(this.eventName, this._boundHandleNewOrder);
      window.__ticketEventHandlers.delete(this.eventName);
    }
    this._listenerAttached = false;
  }

  /**
   * 启动队列
   */
  async start() {
    // 防止重复启动导致 handledOrders 被清空，破坏防重机制
    if (this.isStart) {
      this.logger.warn(`${this.appFlag}队列已在运行中，忽略重复启动`);
      return;
    }
    this.prevOrderNumber = "";
    this.queue = [];
    this.handledOrders = new Map();
    this.isStart = true;
    this.logger.warn(`${this.appFlag}队列启动，开始监听是否有新订单`);
  }

  /**
   * 处理新订单
   * @param {CustomEvent} event - 订单事件
   */
  async handleNewOrder(event) {
    if (!this.isStart) return;

    const isAgain = event.detail?.isAgain;
    let order = event.detail;

    if (isAgain) {
      order = event.detail?.order;
    }

    // 2026-08-21：出票侧订单源头补全系列标识——平台订单/重出快照无 app_type_code 字段，
    // logger.init 的同步判定（_applyV3FlagsSync，localStorage 字典缓存）与异步反查都依赖它；
    // 缺失时 v3Mode 判定完成前日志误入 L1（opera_record 出现 info）且不进 L2 明细。
    // 报价侧各队列已在构建订单时补全（GET_APP_INFO 全量影线配置反查），此处对齐统一补全，
    // 所有 logger.init(order) 调用点（队列 logger/每单新 logger）自动受益，无需逐点 v3Ready。
    if (!order.app_type_code) {
      order.app_type_code = GET_APP_INFO(
        order.app_name || order.appName
      )?.app_type_code;
    }

    // ACK 必须在重复检查之前发送：即使订单被拦截不重复出票，
    // 也要告知消息发送方"已收到"，避免 BaseOrderFetcher 超时告警
    const ackEventName = `newOrderAck_${this.appFlag}_${order.order_number}`;
    const ackEvent = new CustomEvent(ackEventName, {
      detail: {
        appFlag: this.appFlag,
        orderNumber: order.order_number,
        platName: order.plat_name,
        isStart: this.isStart,
        queueLength: this.queue.length,
        timestamp: Date.now()
      }
    });
    window.dispatchEvent(ackEvent);

    // 检查是否已经处理过此订单（实例内 + 全局，防止重复监听器）
    const orderKey = order.plat_name + "_" + order.order_number;
    if (!isAgain && this.handledOrders.has(orderKey)) {
      this.logger.warn("订单已被处理过，忽略重复消息", order);
      return;
    }
    if (!isAgain && isGloballyHandled(this.appFlag, order)) {
      this.logger.warn("订单已被全局处理过，忽略重复监听器消息", order);
      return;
    }

    let des = "自动出票队列获取到新的待出票订单";
    if (!isAgain) {
      this.handledOrders.set(orderKey, 1);
      markGloballyHandled(this.appFlag, order);
      const fixedOfferToPlatList =
        dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];
      if (
        order.plat_name === "lieren" &&
        order.rule_id &&
        fixedOfferToPlatList.includes("lieren")
      ) {
        // 根据平台报价规则获取本地报价规则生成报价记录方便走后续流程
        await this.lierenRuleCheck(order);
      }
    } else {
      des = "自动出票队列获取到重新出票的订单";
      order.isAgain = true;
      // 透传换座重新出票标识(拉单换座成功后派发),buyTicket 据此跳过再次申请换座
      // 手动重新出票(HistoryTicketRecord.vue)不带此标识,可正常申请换座
      if (event.detail?.isFromChangeSeat) {
        order.isFromChangeSeat = true;
      }
    }

    this.logger.warn("新的待出票订单", order);
    this.logger.init(order);
    // 订单入口快照：订单全量展示（排查取字段用），体积由 sanitize/后端截断兜底
    this.logger.infoSave(des, {
      newOrders: order,
      sjc: +new Date()
    });
    // 添加新订单到队列（优先入队启动出票，日志上传不阻塞出票流程）
    // 入队前打戳，用于计算队列等待耗时
    order._ticketEnqueueAt = Date.now();
    this.queue.push(order);

    // 调度诊断：让排查时能看到"本单前面排了几单、调度器是否在跑"
    this.logger.infoSave("出票订单入队-调度诊断", {
      订单号: order.order_number,
      调度路径: this.isRunning ? "排队等待" : "立即启动调度器",
      队列长度: this.queue.length,
      本单在队列位置: this.queue.length,
      调度器是否运行: this.isRunning,
      上一单订单号: this.prevOrderNumber || null,
      说明: this.isRunning
        ? "调度器运行中，本单排队等待，前单完成后自动取出"
        : "调度器空闲，将立即启动 startProcessingQueue"
    });

    if (!this.isRunning) {
      this.isRunning = true;
      void this.startProcessingQueue();
    }
    // 日志上传异步执行，不阻塞出票
    if (!this.isTestOrder) {
      this.logger.logUpload().catch(() => {});
    }
  }

  async lierenRuleCheck(order) {
    const { plat_name, app_name } = order;
    try {
      // 先查该订单是否已有报价记录：有则说明是机器自己报的价（非猎人主动报价），无需本地匹配补记录，直接缓存复用后返回
      // （已确认：不存在机器报价成功中标后还未写入报价记录的情况，故查到即视为机器报价）
      try {
        const offerRes = await svApi.queryOfferInfo({
          user_id: tokens.userInfo?.user_id,
          order_status: "1",
          app_name,
          order_number: order.order_number,
          plat_name
        });
        const cachedOfferRule = offerRes?.data?.offerInfo;
        if (cachedOfferRule) {
          // 缓存到 order，出票阶段 getOrderOfferRule 优先读取，省一次接口
          order._cachedOfferRule = cachedOfferRule;
          this.logger.infoSave(
            "该订单已有报价记录，为机器自己报价，跳过猎人规则匹配",
            { order_number: order.order_number, hasOfferRule: true }
          );
          return;
        }
      } catch (err) {
        // 查询异常不阻塞后续匹配逻辑，但出票阶段会重新查询兜底
        this.logger.errorSave("查询订单报价记录异常，继续走规则匹配", {
          error: err,
          order_number: order.order_number
        });
      }

      // 查不到报价记录 → 猎人平台主动报价，需本地匹配规则补全报价记录
      const platRuleId = order.rule_id;

      // 将规则列表展开为该平台的匹配列表（报价金额 + 平台维度字段如 platRuleId 提升到顶层）
      const expandPlatOfferList = ruleList =>
        (ruleList || [])
          .filter(item =>
            item.platOfferList?.length
              ? item.platOfferList
                  .map(item => item.platName)
                  .includes(plat_name)
              : item.orderForm.split(",").includes(plat_name)
          )
          .map(itemA => {
            return {
              ...itemA,
              offerAmount:
                itemA.offerType === "1"
                  ? itemA.platOfferList?.find(
                      item => item.platName === plat_name
                    )?.value
                  : "",
              ...(itemA.platOfferList?.find(
                item => item.platName === plat_name
              ) || {})
            };
          });
      // 组装当前规则 store 中该平台的规则匹配列表
      const buildAppOfferRuleList = () =>
        expandPlatOfferList(toRaw(offerRuleList.value)) || [];

      // 1、获取启用的规则列表（只有满足规则才报价）
      const getUseRuleList = appOfferRuleList =>
        appOfferRuleList.filter(
          item =>
            ["1", "3"].includes(item.status) && item.shadowLineName == app_name
        );

      let appOfferRuleList = buildAppOfferRuleList();
      let useRuleList = getUseRuleList(appOfferRuleList);

      let targetRule = useRuleList.find(item => item.platRuleId == platRuleId);
      // 本地规则 store 只在登录/规则页刷新，长跑机器可能持有过期快照：
      // 匹配失败时分两步恢复，避免全量查询拖慢出票：
      // 1) 先按 app_name 轻量查询该影线规则，同步等待匹配结果；
      // 2) 异步刷新全量规则 store（不阻塞出票），保证后续订单匹配直接用最新数据
      let appRuleQueried = false;
      let appRules = null;
      if (!targetRule) {
        appRules = await queryAppOfferRuleList(app_name);
        appRuleQueried = true;
        if (appRules?.length) {
          const appUseRuleList = getUseRuleList(expandPlatOfferList(appRules));
          targetRule = appUseRuleList.find(
            item => item.platRuleId == platRuleId
          );
        }
        // 无论本次匹配是否成功，都异步刷新全量 store，避免后续订单再走慢路径
        this.refreshOfferRuleList().catch(() => {});
      }
      // 只有匹配到规则且是固定报价才会去补全报价记录
      if (targetRule && targetRule.offerType == 1) {
        // 补全报价记录的订单在出票时不按用户隔离登录信息
        if (dictStore.dictInfo.lierenOfferTicketIsSplitUser == 0) {
          order.need_unsplit_login = true;
        }
        this.logger.infoSave(
          "机器找到匹配的固定报价规则，准备补全报价记录后出票",
          {
            platRuleId,
            targetRule
          }
        );
        await this.lierenOfferRecordAdd(targetRule, order);
      } else {
        // 匹配失败诊断：区分"未找到platRuleId"与"找到但非固定报价"，输出本地规则上下文便于排查本地与远端数据为何对不上
        const matchDiag = targetRule
          ? `找到规则但offerType=${targetRule.offerType}非固定报价(1)`
          : `未找到platRuleId=${platRuleId}的规则`;
        // 诊断明细：优先用按影线查询到的最新规则（store 可能过期），取每条规则的id/影子线路/状态/报价类型/liers平台规则id
        const diagSource =
          appRuleQueried && appRules?.length
            ? appRules
            : appOfferRuleList || [];
        const diagList = diagSource
          .map(item => ({
            id: item.id,
            shadowLineName: item.shadowLineName,
            status: item.status,
            offerType: item.offerType,
            lierenPlatRuleId: item.platOfferList?.find(
              p => p.platName === plat_name
            )?.platRuleId
          }))
          .filter(
            item => item.shadowLineName === app_name && item.lierenPlatRuleId
          );
        const failReason = `猎人报价规则匹配失败：${matchDiag}，app_name=${app_name}，本地规则总数=${appOfferRuleList?.length || 0}，命中shadowLineName的规则数=${useRuleList.length}，已按影线查询重试=${appRuleQueried ? "是" : "否"}，规则明细=${JSON.stringify(diagList)}`;
        this.logger.infoSave(
          "机器未找到匹配的报价规则，先允许出票，后面有报价记录校验",
          {
            platRuleId,
            app_name,
            appOfferRuleListCount: appOfferRuleList?.length || 0,
            useRuleListCount: useRuleList.length,
            appRuleQueried,
            matchDiag,
            diagList
          }
        );
        // 匹配失败说明本地规则与猎人平台不一致，立即推送告警开发排查
        sendWxPusherMessage({
          orderInfo: order,
          transferTip: "猎人报价规则匹配失败，需开发排查本地与远端数据一致性",
          failReason
        }).catch(() => {});
      }
    } catch (error) {
      this.logger.errorSave("猎人报价规则检查异常", { error, order });
    }
  }

  /**
   * 刷新本地报价规则列表（SV 侧规则变更后，出票时本地 store 可能过期，
   * 重新拉取启用/仅报价规则更新 store，供 lierenRuleCheck 匹配重试）
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshOfferRuleList() {
    return await refreshLocalOfferRuleList(this.logger);
  }

  async lierenOfferRecordAdd(offerRule, order) {
    try {
      const serOrderInfo = {
        plat_name: order.plat_name,
        app_name: order.app_name,
        order_id: order.id,
        order_number: order.order_number,
        tpp_price: order.tpp_price,
        supplier_max_price: +order.supplier_end_price + 20, // 假值无参考意义
        city_name: order.city_name,
        cinema_addr: order.cinema_addr,
        ticket_num: order.ticket_num,
        cinema_name: order.cinema_name,
        hall_name: order.hall_name,
        film_name: order.film_name,
        show_time: order.show_time,
        cinema_code: order.cinema_code,
        cinema_group: order.cinema_group,
        offer_type: offerRule?.offerType,
        rule_status: offerRule?.status,
        offer_end_amount: order.supplier_end_price,
        // member_price: offerRule?.cost_price, // 成本价
        // real_member_price: offerRule?.real_member_price,
        // member_discount: offerRule?.member_discount,

        quan_value: offerRule?.quanValue, // 用券类型
        rewards: LIERENR_REWARDS[order.order_urgent] || 0, // 0-普通 1-加急 2-特急 3-vip
        fee_rate: getPlatFeeRate(order),

        order_status: 1,
        processing_time: getCurrentTime(),
        // err_msg: "",
        // err_info: "",
        rule: tokens.userInfo.rule,
        offer_rule_id: offerRule?.id,
        plat_rule_id: order.rule_id, // 新增一个平台报价规则id用来区分是否走的平台报价
        offer_from: 1 // 1-平台报价 2-机器报价
        // adjust_price: offerResult?.offerRule?.adjustPrice,
        // price_spread: offerResult?.offerRule?.price_spread
      };

      const targetInfo = GET_APP_TYPE_LIST().find(item =>
        item.app_name_list.includes(serOrderInfo.app_name)
      );

      if (targetInfo) {
        serOrderInfo.app_type = targetInfo.app_type_code;
      }
      this.logger.infoSave("补全猎人报价记录入参", serOrderInfo);
      await svApi.addOfferRecord(serOrderInfo);
    } catch (error) {
      this.logger.errorSave("补全猎人报价记录异常", { error, rule, order });
    }
  }
  /**
   * 开始处理队列
   */
  async startProcessingQueue() {
    while (this.queue.length > 0 && this.isRunning) {
      const order = this.queue.shift();

      if (order) {
        const logger = new Logger({ logType: 3 });

        if (!order.isAgain && this.prevOrderNumber === order.order_number) {
          logger.init(order);
          // 2026-08-21：同 handleNewOrder 修复——判定完成前写日志会误入 L1
          logger.warnSave("当前订单重复执行,直接执行下个", {
            prevOrderNumber: this.prevOrderNumber,
            order_number: order.order_number
          });
          if (!this.isTestOrder) {
            // V3 P1-2：日志上传入队即返回，出票不等待（失败已有本地兜底 + 微信告警）
            logger.logUpload().catch(() => {});
          }
        } else {
          logger.init(order);
          const orderHandleStartAt = Date.now();
          const queueWaitMs = order._ticketEnqueueAt
            ? orderHandleStartAt - order._ticketEnqueueAt
            : null;
          const res = await this.orderHandle(order, logger);
          const ticketHandleDurationMs = Date.now() - orderHandleStartAt;
          this.prevOrderNumber = order.order_number;

          logger.infoSave(
            `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}`,
            { res }
          );

          logger.infoSave("出票链路耗时统计", {
            订单号: order.order_number,
            队列等待耗时ms: queueWaitMs,
            出票执行耗时ms: ticketHandleDurationMs,
            总耗时ms:
              queueWaitMs != null ? ticketHandleDurationMs + queueWaitMs : null
          });

          if (!this.isTestOrder) {
            await this.saveTicketRecord(order, res, logger, {
              ticket_queue_wait_ms: queueWaitMs,
              ticket_handle_duration_ms: ticketHandleDurationMs
            });
          } else {
            // V3 P1-2：同左，入队即返回
            logger.logUpload().catch(() => {});
          }
        }
      }
    }

    this.isRunning = false;
  }

  /**
   * 处理订单（子类可覆盖）
   * @param {Object} order - 订单信息
   * @param {Logger} logger - 日志实例
   * @returns {Promise<Object>} 处理结果
   */
  async orderHandle(order, logger) {
    const ticketHandleStartAt = Date.now();
    const queueWaitMs = order._ticketEnqueueAt
      ? ticketHandleStartAt - order._ticketEnqueueAt
      : null;
    try {
      logger.infoSave(`订单开始出票`, {
        订单号: order.order_number,
        上个订单号: this.prevOrderNumber,
        队列等待耗时ms: queueWaitMs,
        队列前方剩余: this.queue.length
      });

      if (this.isRunning) {
        const buyTicket = StrategyFactory.createSeatStrategy(
          order,
          logger,
          this.isTestOrder
        );

        // 超时提醒：字典 ticketHandleTimeout > 0 时启用
        // 超时不中断 singleTicket，仅发微信告警提醒人工介入，队列继续等待结果
        const ticketHandleTimeout =
          Number(dictStore.dictInfo.ticketHandleTimeout) || 0;
        let timeoutTimer = null;
        if (ticketHandleTimeout > 0) {
          timeoutTimer = setTimeout(() => {
            logger.errorSave("订单出票超时提醒", {
              订单号: order.order_number,
              超时阈值ms: ticketHandleTimeout,
              已耗时ms: Date.now() - ticketHandleStartAt,
              影院: order.cinema_name
            });
            sendWxPusherMessage({
              orderInfo: order,
              failReason: `出票执行超时，已耗时${Date.now() - ticketHandleStartAt}ms（阈值${ticketHandleTimeout}ms）`,
              transferTip: "出票超时提醒，请人工跟踪该订单状态"
            }).catch(e => console.error("超时微信告警发送失败", e));
          }, ticketHandleTimeout);
        }

        const res = await buyTicket.singleTicket();
        if (timeoutTimer) clearTimeout(timeoutTimer);

        logger.infoSave("订单出票执行完成", {
          订单号: order.order_number,
          出票执行耗时ms: Date.now() - ticketHandleStartAt,
          是否成功: !res?.err_msg
        });
        // result: { profit, submitRes, qrcode, quan_code, card_id, cardNum, quanType, offerRule, mobile }
        return res;
      } else {
        logger.warn("订单出票队列已停止");
      }
    } catch (error) {
      logger.errorSave("订单执行出票异常", { error });
    }
  }

  /**
   * 保存出票记录（默认实现：写入/更新远端出票记录；子类可覆盖）
   * @param {Object} order - 订单信息
   * @param {Object} ticketRes - 出票结果 { submitRes, profit, qrcode, quan_code, card_id, cardNum, offerRule, mobile }
   * @param {Logger} logger - 日志实例
   * @param {Object} [extra={}] - 额外耗时字段 { ticket_queue_wait_ms, ticket_handle_duration_ms }
   * @returns {Promise<void>}
   */
  async saveTicketRecord(order, ticketRes, logger, extra = {}) {
    try {
      const { userInfo: { rule, user_id } = {} } = platTokens() || {};
      const res = ticketRes || {};
      const {
        submitRes,
        offerRule,
        profit = "",
        qrcode = "",
        quan_code = "",
        card_id = "",
        cardNum = "",
        mobile = "",
        // V3 L0：用券用卡快照（各系列 buyTicket 采集挂到 ticketRes）
        // ⚠️ 此处不设默认 ""：paymentAmount/cardBalance 对应 DECIMAL 列，严格模式下 "" 触发
        //   ERROR 1366 致整条 ticket_record 入库失败；未采集时保持 undefined，由下方
        //   `?? null` 兜底写入 NULL（字符串列 use_path/coupons 同理，undefined→空串/空数组）。
        paymentAmount,
        cardBalance,
        coupons,
        usePath
      } = res;
      let { err_msg: errMsg, err_info: errInfo } =
        logger.getLastErrMsgAndInfo() || {};
      // fallback: 从出票结果中取错误信息（某些场景logger可能已被logUpload清空）
      if (!errMsg && res?.errMsg) {
        errMsg = res.errMsg;
        errInfo = res.errInfo || "";
      }
      if (submitRes) {
        errMsg = "";
        errInfo = "";
      }

      // 诊断日志：出票失败时记录logger状态便于排查
      if (!submitRes && !errMsg) {
        logUpload(
          {
            plat_name: order?.plat_name || "",
            app_name: this.appFlag,
            order_number: order?.order_number || "",
            type: 3
          },
          [
            {
              opera_time: getCurrentTime(),
              des: "saveTicketRecord-errMsg为空诊断",
              level: "warn",
              info: {
                hasRes: !!ticketRes,
                resKeys: ticketRes ? Object.keys(ticketRes) : [],
                logListLen: logger.logList?.length,
                logErrorCount:
                  logger.logList?.filter(l => l.level === "error")?.length || 0,
                lastLogEntry: [...(logger.logList || [])].reverse()?.[0] || null
              }
            }
          ]
        );
      }

      if (order.isAgain) {
        // 重新出票过程中再次申请换座：保持 order_status=9，等待下次拉单检测换座结果
        // 否则 order_status 会被置为 2(失败)，导致后续拉单过滤掉该订单无法继续出票
        if (res.isApplyChangeSeat) {
          await svApi.updateTicketRecord({
            whereObj: {
              order_number: order.order_number,
              plat_name: order.plat_name,
              user_id
            },
            updateObj: {
              order_status: 9, // 申请换座中
              change_seat_info: `申请换座中，原座位：${order.lockseat}`
            }
          });
          return;
        }
        const order_status = submitRes ? 1 : 2;
        if (order_status === 1) {
          await svApi.updateTicketRecord({
            whereObj: {
              order_number: order.order_number,
              plat_name: order.plat_name,
              user_id
            },
            updateObj: {
              order_status: 1,
              profit: res?.profit ?? "",
              qrcode: res?.qrcode ?? "",
              quan_type: res?.quanType ?? "",
              quan_value: offerRule?.quan_value ?? "",
              quan_code: res?.quan_code ?? "",
              card_id: res?.card_id ?? "",
              card_num: res?.cardNum ?? "",
              mobile: res?.mobile,
              err_msg: "重新出票成功",
              // V3 L0：重新出票成功后回写用券用卡快照（数值列传 null 防 DECIMAL 1366）
              payment_amount: res?.paymentAmount ?? null,
              card_balance: res?.cardBalance ?? null,
              coupons:
                typeof res?.coupons === "string"
                  ? res.coupons
                  : JSON.stringify(res?.coupons ?? []),
              use_path: res?.usePath ?? ""
            }
          });
        } else {
          await svApi.updateTicketRecord({
            whereObj: {
              order_number: order.order_number,
              plat_name: order.plat_name,
              user_id
            },
            updateObj: {
              order_status: 2,
              // V3：失败原因带真实根因（getLastErrMsgAndInfo 优先根因缓存，非降级动作）
              err_msg: errMsg ? `重新出票失败-${errMsg}` : "重新出票失败",
              ...(res?.profit ? { profit: res.profit } : {})
            }
          });
        }
        return;
      }

      const {
        plat_name,
        id: order_id,
        order_number,
        ticket_num,
        cinema_group,
        city_name,
        cinema_addr,
        cinema_name,
        hall_name,
        film_name,
        lockseat,
        show_time,
        supplier_end_price,
        tpp_price,
        cinema_code,
        plat_order_sn
      } = order;

      let order_status =
        offerRule?.rule_status === "3" ? "4" : submitRes ? "1" : "2";
      let change_seat_info;
      // 如果申请换座了则更新订单的换座信息及状态
      if (res.isApplyChangeSeat) {
        order_status = "9"; // 申请换座中
        change_seat_info = `申请换座中，原座位：${order.lockseat}`;
      }
      const serOrderInfo = {
        plat_name,
        app_name: this.appFlag,
        order_id,
        plat_order_sn,
        order_number,
        tpp_price,
        supplier_end_price,
        supplier_max_price: offerRule?.supplier_max_price ?? "",
        city_name,
        cinema_addr,
        ticket_num,
        cinema_name,
        hall_name,
        film_name,
        lockseat: lockseat ?? offerRule?.lockseat,
        show_time,
        cinema_group,
        offer_type: offerRule?.offer_type ?? "",
        cinema_code,
        quan_value: offerRule?.quan_value ?? "",
        order_status,
        processing_time: getCurrentTime(),
        profit,
        qrcode,
        quan_code,
        card_id,
        card_num: cardNum,
        err_msg: submitRes ? "" : errMsg ?? "",
        err_info: submitRes ? "" : errInfo ?? "",
        rewards: offerRule?.rewards ?? 0,
        transfer_fee: res?.transferParams?.transfer_fee ?? "",
        mobile,
        rule,
        offer_from: offerRule?.plat_rule_id ? 1 : 2, // 1-平台报价 2-机器报价
        rule_id: offerRule?.plat_rule_id || offerRule?.offer_rule_id || "",
        ticket_queue_wait_ms: extra.ticket_queue_wait_ms ?? null,
        ticket_handle_duration_ms: extra.ticket_handle_duration_ms ?? null,
        // V3 L0：用券用卡快照（各系列 buyTicket 采集挂到 ticketRes）
        // 数值列（payment_amount/card_balance）兜底 null：列 DEFAULT NULL 接收 NULL；
        //   ⚠️ 不能兜底 ""——MySQL 严格模式（STRICT_TRANS_TABLES，8.0 默认）下 DECIMAL 列
        //   插入 '' 报 ERROR 1366 致整条 INSERT 失败（出票记录丢失）。
        // 字符串列兜底空串/空数组，防止动态 INSERT 出现 undefined 绑定参数
        payment_amount: paymentAmount ?? null,
        card_balance: cardBalance ?? null,
        coupons:
          typeof coupons === "string" ? coupons : JSON.stringify(coupons ?? []),
        use_path: usePath ?? ""
      };
      const targetAppInfo = GET_APP_TYPE_LIST().find(item =>
        item.app_name_list.includes(serOrderInfo.app_name)
      );
      if (targetAppInfo) {
        serOrderInfo.app_type = targetAppInfo.app_type_code;
      }
      await svApi.addTicketRecord(serOrderInfo);
    } catch (error) {
      logger.errorSave("保存出票记录异常", { error });
    } finally {
      // V3 P1-2：日志上传入队即返回，出票不等待（err_msg 已在上方捕获进 serOrderInfo，不受影响）
      logger.logUpload().catch(() => {});
    }
  }

  /**
   * 停止队列运行
   */
  stop() {
    this.isRunning = false;
    this.isStart = false;
    this.logger.warn("自动出票队列停止");
  }

  destroy() {
    this.stop();
    this.detachListener();
  }

  /**
   * 测试发送新订单
   * @param {Object} order - 测试订单
   */
  testSendNewOrder(order) {
    this.isTestOrder = true;
    this.start();

    const newOrder = order || this.getDefaultTestOrder();
    const eventName = `newOrder_${this.appFlag}`;
    const newOrderEvent = new CustomEvent(eventName, { detail: newOrder });
    window.dispatchEvent(newOrderEvent);
    this.logger.info(`发送测试订单——${this.appFlag}:`, newOrder);
  }

  /**
   * 获取默认测试订单（子类可覆盖）
   * @returns {Object} 测试订单
   */
  getDefaultTestOrder() {
    return {
      plat_name: "lieren",
      id: "12412221440316515",
      tpp_price: 42,
      supplier_end_price: 32,
      city_name: "南京",
      cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
      ticket_num: 1,
      cinema_name: "金逸影城(光美美一城店)",
      hall_name: "1号激光厅",
      film_name: "阿凡达3",
      show_time: "2025-12-30 19:00:00",
      rewards: 0,
      is_urgent: false,
      cinema_group: "",
      cinema_code: "35061501",
      order_number: "2025071815072984896",
      offer_end_time: 1734849690000,
      app_name: this.appFlag,
      appName: this.appFlag,
      lockseat: "1排1座"
    };
  }
}
