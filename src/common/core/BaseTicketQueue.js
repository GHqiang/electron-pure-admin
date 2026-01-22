// 出票队列基类
// 提取所有平台出票队列的公共逻辑

import { getCurrentTime, formatErrInfo } from "@/utils/utils.js";
import Logger from "../logger.js";
import StrategyFactory from "../autoTicket/buyTicket/index.js";

/**
 * 出票队列基类
 * 所有平台出票队列都应继承此类
 */
export default class BaseTicketQueue {
  /**
   * 构造函数
   * @param {string} appFlag - 影院标识
   * @param {Object} platformAdapter - 平台适配器实例（可选）
   */
  constructor(appFlag, platformAdapter = null) {
    this.appFlag = appFlag;
    this.platformAdapter = platformAdapter;
    this.queue = [];
    this.isRunning = false;
    this.handledOrders = new Map();
    this.prevOrderNumber = "";
    this.eventName = `newOrder_${appFlag}`;
    this.isStart = false;
    this.logger = new Logger({ logType: 3 });
    
    // 监听新订单事件
    window.addEventListener(this.eventName, this.handleNewOrder.bind(this));
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
  handleNewOrder(event) {
    if (!this.isStart) return;
    
    const isAgain = event.detail?.isAgain;
    let order = event.detail;
    
    if (isAgain) {
      order = event.detail?.order;
    }

    // 检查是否已经处理过此订单
    if (
      !isAgain &&
      this.handledOrders.has(order.plat_name + "_" + order.order_number)
    ) {
      this.logger.warn("订单已被处理过，忽略重复消息", order);
      return;
    }

    let des = "自动出票队列获取到新的待出票订单";
    if (!isAgain) {
      this.handledOrders.set(order.plat_name + "_" + order.order_number, 1);
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
      this.logger.logUpload();
    }

    // 添加新订单到队列
    this.queue.push(order);
    
    if (!this.isRunning) {
      this.startProcessingQueue();
    }
  }

  /**
   * 开始处理队列
   */
  async startProcessingQueue() {
    this.isRunning = true;
    
    while (this.queue.length > 0 && this.isRunning) {
      const order = this.queue.shift();
      
      if (order) {
        const logger = new Logger({ logType: 3 });
        
        if (!order.isAgain && this.prevOrderNumber === order.order_number) {
          logger.warn("当前订单重复执行,直接执行下个");
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
      logger.error("订单执行出票异常", error);
      throw error;
    }
  }

  /**
   * 保存出票记录（子类实现）
   * @param {Object} order - 订单信息
   * @param {Object} ticketRes - 出票结果
   * @param {Logger} logger - 日志实例
   * @returns {Promise<void>}
   */
  async saveTicketRecord(order, ticketRes, logger) {
    throw new Error(`影院 ${this.appFlag} 未实现 saveTicketRecord 方法`);
  }

  /**
   * 停止队列运行
   */
  stop() {
    this.isRunning = false;
    this.isStart = false;
    this.logger.warn("自动出票队列停止");
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
