// 出票队列基类
// 提取所有平台出票队列的公共逻辑

import { getCurrentTime, formatErrInfo, logUpload } from "@/utils/utils.js";
import Logger from "../logger.js";
import StrategyFactory from "@/common/autoTicket/buyTicket/index";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
import { GET_APP_TYPE_LIST, LIERENR_REWARDS } from "@/common/constant";
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import { useDataTableStore } from "@/store/offerRule";
const offerRules = useDataTableStore();
const { offerRuleList } = storeToRefs(offerRules);

import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

/** 跨实例去重：防止历史泄漏的重复监听器再次处理同一订单 */
const globalHandledOrders = new Map();
const GLOBAL_HANDLED_TTL = 30 * 60 * 1000;

const getGlobalOrderKey = (appFlag, order) =>
  `${appFlag}::${order.plat_name}::${order.order_number}`;

const isGloballyHandled = (appFlag, order) => {
  const key = getGlobalOrderKey(appFlag, order);
  const ts = globalHandledOrders.get(key);
  if (!ts) return false;
  if (Date.now() - ts > GLOBAL_HANDLED_TTL) {
    globalHandledOrders.delete(key);
    return false;
  }
  return true;
};

const markGloballyHandled = (appFlag, order) => {
  globalHandledOrders.set(getGlobalOrderKey(appFlag, order), Date.now());
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
    window.addEventListener(this.eventName, this._boundHandleNewOrder);
    this._listenerAttached = true;
  }

  detachListener() {
    if (!this._listenerAttached) return;
    window.removeEventListener(this.eventName, this._boundHandleNewOrder);
    this._listenerAttached = false;
  }

  /**
   * 启动队列
   */
  async start() {
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
    }

    console.warn(des, order);
    this.logger.warn("新的待出票订单", order);
    this.logger.init(order);
    this.logger.infoSave(des, {
      newOrders: order,
      sjc: +new Date()
    });
    if (!this.isTestOrder) {
      await this.logger.logUpload();
    }
    // 添加新订单到队列
    this.queue.push(order);

    if (!this.isRunning) {
      this.isRunning = true;
      void this.startProcessingQueue();
    }
  }

  async lierenRuleCheck(order) {
    const { plat_name, app_name } = order;
    try {
      let platRuleId = order.rule_id;
      let appOfferRuleList = toRaw(offerRuleList.value);
      if (appOfferRuleList) {
        appOfferRuleList = appOfferRuleList
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
      }

      // 1、获取启用的规则列表（只有满足规则才报价）
      let useRuleList = appOfferRuleList.filter(
        item =>
          ["1", "3"].includes(item.status) && item.shadowLineName == app_name
      );

      let targetRule = useRuleList.find(item => item.platRuleId == platRuleId);
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
        this.logger.infoSave(
          "机器未找到匹配的报价规则，先允许出票，后面有报价记录校验"
        );
      }
    } catch (error) {
      this.logger.errorSave("猎人报价规则检查异常", { error, order });
    }
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
      console.warn("猎人固定报价规则添加报价记录成功", serOrderInfo);
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
          logger.warnSave("当前订单重复执行,直接执行下个", {
            prevOrderNumber: this.prevOrderNumber,
            order_number: order.order_number
          });
          if (!this.isTestOrder) {
            await logger.logUpload();
          }
        } else {
          logger.init(order);
          const res = await this.orderHandle(order, logger);
          this.prevOrderNumber = order.order_number;

          logger.infoSave(
            `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}`,
            { res }
          );

          if (!this.isTestOrder) {
            await this.saveTicketRecord(order, res, logger);
          } else {
            await logger.logUpload();
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
    try {
      logger.infoSave(
        `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`
      );

      if (this.isRunning) {
        const buyTicket = StrategyFactory.createSeatStrategy(
          order,
          logger,
          this.isTestOrder
        );

        const res = await buyTicket.singleTicket();
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
   * @returns {Promise<void>}
   */
  async saveTicketRecord(order, ticketRes, logger) {
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
        mobile = ""
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
        logUpload({ plat_name: order?.plat_name || "", app_name: this.appFlag, order_number: order?.order_number || "", type: 3 }, [
          { opera_time: getCurrentTime(), des: "saveTicketRecord-errMsg为空诊断", level: "warn", info: {
            hasRes: !!ticketRes,
            resKeys: ticketRes ? Object.keys(ticketRes) : [],
            logListLen: logger.logList?.length,
            logErrorCount: logger.logList?.filter(l => l.level === "error")?.length || 0,
            lastLogEntry: [...(logger.logList || [])].reverse()?.[0] || null
          }}
        ]);
      }

      if (order.isAgain) {
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
              err_msg: "重新出票成功"
            }
          });
        } else {
          await svApi.updateTicketRecord({
            whereObj: {
              order_number: order.order_number,
              plat_name: order.plat_name,
              user_id
            },
            updateObj: { order_status: 2, err_msg: "重新出票失败" }
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
        rule_id: offerRule?.plat_rule_id || offerRule?.offer_rule_id || ""
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
      await logger.logUpload();
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
