// 报价基类
// 提取所有影院系列报价的公共逻辑

import { formatErrInfo } from "@/utils/utils.js";
import Logger from "../logger.js";

/**
 * 报价基类
 * 所有影院系列的报价类都应继承此类
 */
export default class BaseOfferPrice {
  /**
   * 构造函数
   * @param {Object} params - 参数对象
   * @param {string} params.appFlag - 影院标识
   * @param {string} params.plat_name - 平台标识
   */
  constructor({ appFlag, plat_name }) {
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.logger = null; // 日志实例，在initModules中初始化
  }

  /**
   * 初始化依赖模块（子类实现）
   * @param {Object} order - 订单信息
   */
  initModules(order) {
    // 子类需要实现此方法，初始化 logger、cardQuanManage、cinemaManage、seatManage 等
    throw new Error(`影院系列 ${this.appFlag} 未实现 initModules 方法`);
  }

  /**
   * 获取最终报价信息（模板方法，唯一暴露给外部的方法）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果 { endPrice, offerRule, order_number } 或 { err_msg, err_info, endPrice: null, offerRule }
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 1. 初始化模块
      this.initModules(order);

      // 2. 获取最终匹配的报价规则
      let offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.buildErrorResponse();
      }
      this.logger.infoSave("最终匹配到的报价规则", offerRule);

      // 3. 获取成本价
      const cost_price = await this.getCostPrice(offerRule);
      if (!cost_price) {
        this.logger.errorSave("获取成本价失败");
        return this.buildErrorResponse(offerRule);
      }
      offerRule.cost_price = cost_price; // 成本价

      // 4. 计算最终报价
      const endPrice = await this.calculateFinalPrice({
        cost_price,
        supplier_max_price: order.supplier_max_price,
        price: this.getOfferBasePrice(offerRule),
        rewards: order.rewards,
        offerType: offerRule.offerType,
        offerList,
        offerRule
      });

      if (!endPrice) {
        return this.buildErrorResponse(offerRule);
      }

      // 5. 组装返回结果
      offerRule.offer_end_amount = endPrice;
      this.logger.infoSave(`最终报价金额：${endPrice}`);

      // 6. 增加一个quanValue的过滤，依据最大券成本过滤
      if (
        offerRule.offerType === "1" &&
        offerRule?.maxCostPrice &&
        this.quanInfoList?.length > 1
      ) {
        offerRule.quanValue = offerRule.quanValue
          .split(",")
          .filter(item => {
            let targetQuanCost = this.quanInfoList.find(
              quanInfo => quanInfo.quan_value === item
            )?.quan_cost;
            return targetQuanCost < offerRule?.maxCostPrice;
          })
          .join();
      }
      console.warn("this.logger.logList", this.logger.logList);
      return this.buildSuccessResponse(endPrice, offerRule, order.order_number);
    } catch (error) {
      this.logger?.errorSave("获取最终报价信息方法执行异常", error);
      return this.buildErrorResponse();
    }
  }

  /**
   * 获取基础报价金额
   * @param {Object} offerRule - 报价规则
   * @returns {number} 基础报价金额
   */
  getOfferBasePrice(offerRule) {
    return Number(offerRule.offerAmount || offerRule.memberOfferAmount);
  }

  /**
   * 构建错误响应
   * @param {Object} offerRule - 报价规则（可选）
   * @returns {Object} 错误响应 { err_msg, err_info, endPrice: null, offerRule }
   */
  buildErrorResponse(offerRule) {
    const { err_msg, err_info } = this.logger?.getLastErrMsgAndInfo() || {
      err_msg: "",
      err_info: ""
    };
    this.logger?.logUpload();
    return { err_msg, err_info, endPrice: null, offerRule };
  }

  /**
   * 构建成功响应
   * @param {number} endPrice - 最终报价
   * @param {Object} offerRule - 报价规则
   * @param {string} orderNumber - 订单号
   * @returns {Object} 成功响应 { endPrice, offerRule, order_number }
   */
  buildSuccessResponse(endPrice, offerRule, orderNumber) {
    this.logger?.logUpload();
    return {
      endPrice,
      offerRule,
      order_number: orderNumber
    };
  }

  /**
   * 获取最终匹配的报价规则（子类实现）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object|null>} 报价规则或null
   */
  async getEndMatchOfferRule(order) {
    throw new Error(
      `影院系列 ${this.appFlag} 未实现 getEndMatchOfferRule 方法`
    );
  }

  /**
   * 获取成本价（子类实现）
   * @param {Object} offerRule - 报价规则
   * @returns {Promise<number|null>} 成本价或null
   */
  async getCostPrice(offerRule) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getCostPrice 方法`);
  }

  /**
   * 获取会员价（子类实现，仅加价规则需要）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Object} params.movieData - 电影数据（可选）
   * @returns {Promise<Object|null>} 会员价信息或null
   */
  async getMemberPrice({ order, movieData }) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getMemberPrice 方法`);
  }

  /**
   * 计算最终报价（子类实现）
   * @param {Object} params - 参数对象
   * @param {number} params.cost_price - 成本价
   * @param {number} params.supplier_max_price - 平台最高限价
   * @param {number} params.price - 基础报价
   * @param {number} params.rewards - 奖励比例
   * @param {string} params.offerType - 报价类型
   * @param {Array} params.offerList - 报价列表
   * @param {Object} params.offerRule - 报价规则
   * @returns {Promise<number|null>} 最终报价或null
   */
  async calculateFinalPrice(params) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 calculateFinalPrice 方法`);
  }
}
