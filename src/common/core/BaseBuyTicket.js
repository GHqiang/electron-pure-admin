// 出票基类
// 提取所有影院系列出票的公共逻辑

import { formatErrInfo, mockDelay } from "@/utils/utils.js";
import Logger from "../logger.js";

/**
 * 出票基类
 * 所有影院系列的出票类都应继承此类
 */
export default class BaseBuyTicket {
  /**
   * 构造函数
   * @param {Object} order - 订单信息
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(order, logger, isTestOrder) {
    this.appFlag = order.app_name; // 影线标识
    this.order = order; // 订单信息
    this.isTestOrder = isTestOrder; // 是否是测试订单
    this.logger = logger; // 日志模块
    this.currentParamsList = []; // 当前登录参数列表
    this.currentParamsInx = 0; // 当前登录参数索引
    this.currentSessionId = ""; // 当前session_id
    this.currentPhone = ""; // 当前手机号
    this.offerRule = null; // 报价规则

    // 初始化模块（子类实现）
    this.initModules();
  }

  /**
   * 初始化依赖模块（子类实现）
   * 子类需要在此方法中初始化 platManage、seatManage、orderManage 等模块
   */
  initModules() {
    // 子类需要实现此方法
    throw new Error(`影院系列 ${this.appFlag} 未实现 initModules 方法`);
  }

  /**
   * 单个订单出票（模板方法，唯一暴露给外部的方法）
   * @returns {Promise<Object|undefined>} 出票结果或undefined
   */
  async singleTicket() {
    try {
      this.logger.infoSave("单个待出票订单信息", this.order);

      // 1、获取影院登录信息并设置当前token
      await this.getCinemaLoginInfo();

      // 2、获取该订单报价规则
      await this.getOrderOfferRule();
      this.logger.infoSave("订单报价记录信息", {
        offerRule: JSON.parse(JSON.stringify(this.offerRule))
      });

      // 3、校验报价规则是否允许出票
      const isNeedBuyTicket = this.checkOfferRuleRes();
      if (!isNeedBuyTicket) {
        this.logger.infoSave("校验报价规则不允许出票");
        return {
          offerRule: this.offerRule
        };
      }
      this.logger.infoSave("校验报价规则允许出票");

      // 4、平台解锁座位(重新出票不需要解锁座位)
      if (!this.isTestOrder && !this.order.isAgain) {
        this.logger.infoSave("开始准备解锁座位");
        const unlockRes = await this.platManage.unlockSeatByPlat();
        if (!unlockRes) {
          this.logger.infoSave("平台解锁失败准备走转单逻辑");
          this.logger.error("平台解锁失败走转单逻辑");
          return await this.orderManage.transferOrder();
        }
      }

      this.offerRule.lockseat = this.order.lockseat;

      // 5、一键买票
      await mockDelay(1); // 解锁成功后延迟1秒再执行
      const result = await this.oneClickBuyTicket({
        ...this.order,
        otherParams: {
          offerRule: this.offerRule
        }
      });

      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule, mobile } || undefined
      if (result) {
        console.warn("单个订单出票完成");
        return result;
      } else {
        console.warn("单个订单出票失败");
      }
    } catch (error) {
      this.logger.errorSave("单个订单出票执行出错", formatErrInfo(error));
    } finally {
      console.warn("单个订单出票流程结束", this.logger.logList);
    }
  }

  /**
   * 获取影院登录信息并设置当前token（子类实现）
   * @returns {Promise<void>}
   */
  async getCinemaLoginInfo() {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getCinemaLoginInfo 方法`);
  }

  /**
   * 获取订单报价规则（子类实现）
   * @returns {Promise<void>}
   */
  async getOrderOfferRule() {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getOrderOfferRule 方法`);
  }

  /**
   * 校验报价规则是否允许出票（子类实现）
   * @returns {boolean} 是否允许出票
   */
  checkOfferRuleRes() {
    throw new Error(`影院系列 ${this.appFlag} 未实现 checkOfferRuleRes 方法`);
  }

  /**
   * 一键买票核心流程（子类实现）
   * @param {Object} params - 参数对象
   * @param {Object} params.otherParams - 其他参数
   * @param {Object} params.otherParams.offerRule - 报价规则
   * @returns {Promise<Object|undefined>} 出票结果或undefined
   */
  async oneClickBuyTicket(params) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 oneClickBuyTicket 方法`);
  }
}
