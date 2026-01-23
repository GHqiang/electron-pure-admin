// 报价队列基类
// 提取所有平台报价队列的公共逻辑

import { MIN_ALLOW_OFFER_SJC, GET_APP_TYPE_LIST } from "@/common/constant.js";
import Logger from "../logger.js";
import getOfferPriceFun from "../autoOffer/commonOfferHandle.js";
import { dynamicPrice, getCurrentTime, formatErrInfo } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

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
    // 增加报价截止时间判断，小于等于1秒则不处理
    if (
      item.offer_end_time &&
      item.offer_end_time - new Date().getTime() <= MIN_ALLOW_OFFER_SJC
    ) {
      return;
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
   * 开始处理队列（通用逻辑）
   */
  async startProcessingQueue() {
    this.isOfferRunning = true;

    while (this.queue.length > 0 && this.isRunning) {
      const order = this.queue.shift();

      if (order) {
        await this.orderHandle(order);
      }
    }

    this.isOfferRunning = false;
  }

  /**
   * 处理订单（通用逻辑）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 处理结果
   */
  async orderHandle(order) {
    try {
      if (this.isRunning) {
        this.logger = new Logger({ logType: 1 });
        this.logger.init(order);
        const offerResult = await this.singleOffer({
          order,
          offerList: [] // 动态调价暂时不用先传空
        });

        await this.addOrderHandleRecord(order, offerResult);
        this.logger.logUpload();
        return offerResult;
      } else {
        console.warn("订单报价队列已停止");
      }
    } catch (error) {
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
  async singleOffer({ order, offerList = [] }) {
    try {
      // 获取报价价格
      const offerExample = getOfferPriceFun({
        appFlag: order.app_name,
        plat_name: this.platName
      });

      if (!offerExample) {
        console.error("获取报价实例失败");
        return;
      }

      const result = await offerExample.getEndOfferPrice({
        order,
        offerList
      });

      // result: {endPrice, offerRule} | {offerRule, err_msg, err_info} | {err_msg, err_info}
      if (!result) {
        console.error("获取最终报价返回空");
        return;
      }

      const { endPrice, offerRule, err_msg, err_info, app_name } = result || {};

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
        logger: this.logger
      });
      offerRule.offer_end_amount = finalPrice;

      // 按平台配置决定是否需要获取规则ID
      let rule_id, member_price;
      if (this.platformAdapter.config.features.isNeedRuleId) {
        rule_id = await this.getRuleId(order);
      }
      if (rule_id) {
        member_price = finalPrice - 1;
      }

      // 提交报价
      const res = await this.platformAdapter.submitOffer(
        this.platformAdapter.config.params.offerParams(
          order,
          finalPrice,
          rule_id,
          member_price
        )
      );

      return { res, offerRule };
    } catch (error) {
      this.logger.errorSave("单个报价异常", { error, order });
      throw error;
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
   * @returns {Promise<void>}
   */
  async addOrderHandleRecord(order, offerResult) {
    try {
      // offerResult: { res, offerRule } || { offerRule } || undefined
      const errInfoObj = this.logger.getLastErrMsgAndInfo();

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
      }
    } catch (error) {
      console.error("添加订单处理记录异常", error);
      this.logger.errorSave("添加订单处理记录异常", { error });
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
