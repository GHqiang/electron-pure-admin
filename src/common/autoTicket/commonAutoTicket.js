// 统一出票队列（适配所有）
import {
  getCurrentTime,
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage
} from "@/utils/utils";
import svApi from "@/api/sv-api";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { GET_APP_TYPE_LIST } from "@/common/constant";
// 统一日志类
import Logger from "@/common/logger";
// 统一购票模块
import StrategyFactory from "@/common/autoTicket/buyTicket/index";
//是否是测试订单
let isTestOrder = true;

// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.appFlag = appFlag; // 影线标识
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`; // 监听事件名
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isStart = false; // 是否启动

    this.logger = new Logger({ logType: 3 }); // 日志管理模块
    // 监听新订单
    window.addEventListener(this.eventName, this.handleNewOrder.bind(this));
  }

  // 启动队列
  async start() {
    this.prevOrderNumber = "";
    this.queue = [];
    this.handledOrders = new Map();
    this.isStart = true; // 是否启动
    this.logger.warn("队列启动，开始监听是否有新订单");
  }

  // 测试新订单
  testSendNewOrder(order) {
    const { appFlag } = this;
    isTestOrder = true;
    this.start();
    let newOrder = order || {
      plat_name: "mayi",
      id: "12412221440316515",
      tpp_price: 42,
      supplier_end_price: 32,
      city_name: "太原",
      cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
      ticket_num: 1,
      cinema_name: "太原时代影城华景天地IMAX店",
      hall_name: "5号激光厅",
      film_name: "人生开门红",
      film_img:
        "https://gw.alicdn.com/tfscom/i4/O1CN01e8PcvF1NESAgdEsnM_!!6000000001538-0-alipicbeacon.jpg_120x120.jpg",
      show_time: "2025-05-22 21:20:00",
      rewards: 0,
      is_urgent: false,
      cinema_group: "",
      cinema_code: 33018961,
      order_number: "12412221440316515",
      offer_end_time: 1734849690000,
      app_name: "taiyuanshidai",
      appName: "taiyuanshidai",
      lockseat: "1排10座"
    };

    // 动态生成事件名称
    const eventName = `newOrder_${appFlag}`;
    // 创建一个事件对象
    const newOrderEvent = new CustomEvent(eventName, { detail: newOrder });
    window.dispatchEvent(newOrderEvent);
    this.logger.info(`发送测试订单——${appFlag}:`, newOrder);
  }

  // 处理新订单
  handleNewOrder(event) {
    const { isStart } = this;
    if (!isStart) return;
    const order = event.detail;
    // 检查是否已经处理过此订单
    if (this.handledOrders.has(order.plat_name + "_" + order.order_number)) {
      this.logger.warn("订单已被处理过，忽略重复消息", order);
      return;
    }

    // 标记此订单为已处理
    this.handledOrders.set(order.plat_name + "_" + order.order_number, 1);
    this.logger.warn("新的待出票订单", order);
    this.logger.init(order); // 设置日志的订单标识信息
    this.logger.infoSave("自动出票队列获取到新的待出票订单", {
      newOrders: order,
      sjc: +new Date()
    });
    if (!isTestOrder) {
      this.logger.logUpload();
    }
    // 添加新订单到队列
    this.queue.push(order);
    if (!this.isRunning) {
      this.startProcessingQueue();
    }
  }

  // 开始队列上传
  async startProcessingQueue() {
    const { appFlag } = this;
    this.isRunning = true;
    while (this.queue.length > 0 && this.isRunning) {
      // 取出队列首部订单并从队列里去掉
      const order = this.queue.shift();
      if (order) {
        if (this.prevOrderNumber === order.order_number) {
          this.logger.warn("当前订单重复执行,直接执行下个");
        } else {
          // 处理订单
          this.logger.init(order);
          const res = await this.orderHandle(order);
          this.prevOrderNumber = order.order_number;
          // res: { profit, submitRes, qrcode, quan_code, card_id, cardNum, offerRule, mobile } || undefined
          this.logger.infoSave(
            `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}`,
            { res }
          );
          if (!isTestOrder) {
            let errMsg = "",
              errInfo = "";
            if (!res?.submitRes) {
              const errInfoObj = this.logger.logList
                .filter(item => item.level === "error")
                .reverse()?.[0];
              errMsg = errInfoObj?.des || "";
              errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
            }
            let params = {
              order,
              ticketRes: res,
              appFlag,
              errMsg,
              errInfo,
              mobile: res.mobile
            };
            await addOrderHandleRecored(params);
            this.logger.infoSave("订单出票结束，远端已添加出票记录");
            this.logger.logUpload();
          }
        }
      }
    }
    this.isRunning = false;
  }

  // 处理订单
  async orderHandle(order, delayTime) {
    try {
      this.logger.infoSave(
        `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`,
        {
          order,
          delayTime
        }
      );
      // await mockDelay(delayTime);
      this.logger.info(`订单处理 ${order.id}`);
      if (this.isRunning) {
        const buyTicket = StrategyFactory.createSeatStrategy(
          order,
          this.logger,
          isTestOrder
        );
        // 开发时测试使用
        window.buyTicket = buyTicket;
        const res = await buyTicket.singleTicket();
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, cardNum, quanType, offerRule, mobile }
        return res;
      } else {
        this.logger.warn("订单出票队列已停止");
      }
    } catch (error) {
      this.logger.error("订单执行出票异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    this.isStart = false;
    this.logger.warn("自动出票队列停止");
  }
  // 添加订单处理记录
  async addOrderHandleRecored({
    ticketRes: res,
    order,
    appFlag,
    errMsg,
    errInfo
  }) {
    try {
      // res：{ profit, submitRes, qrcode, quan_code, card_id, offerRule, mobile }
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
        tpp_price
      } = order;

      const {
        submitRes,
        offerRule,
        transferParams,
        profit = "",
        qrcode = "",
        quan_code = "",
        card_id = "",
        cardNum = "",
        mobile = ""
      } = res || {};
      let order_status = submitRes ? "1" : "2";
      if (offerRule?.rule_status === "3") {
        order_status = "4";
      }
      const serOrderInfo = {
        plat_name,
        app_name: appFlag,
        order_id,
        order_number,
        tpp_price,
        supplier_end_price,
        supplier_max_price: offerRule?.supplier_max_price || "",
        city_name,
        cinema_addr,
        ticket_num,
        cinema_name,
        hall_name,
        film_name,
        lockseat,
        show_time,
        cinema_group,
        offer_type: offerRule?.offer_type || "",
        // cinema_code: order.cinema_code,
        quan_value: offerRule?.quan_value || "",
        order_status,
        // remark: '',
        processing_time: getCurrentTime(),
        profit,
        qrcode,
        quan_code,
        card_id,
        card_num: cardNum,
        err_msg: submitRes ? "" : errMsg || "",
        err_info: submitRes ? "" : errInfo || "",
        rewards: offerRule?.rewards || 0, // 奖励百分比
        transfer_fee: transferParams?.transfer_fee || "", // 转单手续费
        mobile, // 出票手机号
        rule: rule
      };
      // 目标影院类型信息
      let targetAppInfo = GET_APP_TYPE_LIST().find(item =>
        item.app_name_list.includes(serOrderInfo.app_name)
      );
      if (targetAppInfo) {
        serOrderInfo.app_type = targetAppInfo.app_type_code;
      }
      await svApi.addTicketRecord(serOrderInfo);
    } catch (error) {
      this.logger.error("添加订单处理记录异常", error);
      if (error?.code === 0 && error?.msg === "订单重复") {
        sendWxPusherMessage({
          msgType: 2,
          transferTip: "疑似队列重复，请重新登录机器"
        });
      }
    }
  }
}
// // 生成出票队列实例
// const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);
export default OrderAutoTicketQueue;
