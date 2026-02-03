// 平台适配器基类
// 提供统一的平台操作接口，子类实现平台特定的逻辑

import { getPlatformConfig } from "../platform/configs/platform-config.js";
import Logger from "../logger.js";

/**
 * 平台适配器基类
 * 所有平台适配器都应继承此类
 */
export default class BasePlatformAdapter {
  /**
   * 构造函数
   * @param {string} platName - 平台名称
   * @param {Object} apiInstance - 平台API实例
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(platName, apiInstance, logger, isTestOrder = false) {
    this.platName = platName;
    this.api = apiInstance;
    this.logger = logger || new Logger({ logType: 1 });
    this.isTestOrder = isTestOrder;
    this.config = getPlatformConfig(platName);
    if (!this.config) {
      throw new Error(`未找到平台配置: ${platName}`);
    }
  }

  /**
   * 获取当前调用应使用的 logger：若调用方传入 options.logger 则使用调用方的，便于日志统一上传
   * @param {Object} [options] - 可选，{ logger?: Logger }
   * @returns {Logger}
   */
  _getLogger(options = {}) {
    return options?.logger ?? this.logger;
  }

  /**
   * 获取待报价/出票订单列表
   * 子类必须实现此方法
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    throw new Error(`平台 ${this.platName} 未实现 fetchOrderList 方法`);
  }

  /**
   * 提交报价
   * 子类必须实现此方法
   * @param {Object} params - 报价参数
   * @returns {Promise<Object>} 提交结果
   */
  async submitOffer(params) {
    throw new Error(`平台 ${this.platName} 未实现 submitOffer 方法`);
  }

  /**
   * 解锁座位
   * 提供默认实现，子类可覆盖
   * @param {Object} order - 订单信息
   * @param {number} retryCount - 重试次数
   * @param {Object} [options] - 可选，{ logger?: Logger } 传入则使用调用方 logger，便于日志统一上传
   * @returns {Promise<Object>} 解锁结果
   */
  async unlockSeat(order, retryCount = 3, options = {}) {
    if (!this.config.features.unlockBeforeTicket) {
      return { msg: "无需解锁" };
    }
    const log = this._getLogger(options);
    try {
      const params = this.config.params.unlockParams(order);
      log.infoSave("解锁座位参数", params);

      const apiMethod = this.api[this.config.api.unlockSeat];
      if (!apiMethod) {
        throw new Error(`API方法不存在: ${this.config.api.unlockSeat}`);
      }

      const res = await apiMethod.call(this.api, params);
      log.infoSave("解锁座位成功", res);
      return res;
    } catch (error) {
      return this.handleUnlockError(error, order, retryCount, options);
    }
  }

  /**
   * 确认接单
   * 提供默认实现，子类可覆盖
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async confirmOrder(order) {
    if (!this.config.features.needConfirmOrder) {
      return { msg: "无需确认接单" };
    }

    // 子类实现具体逻辑
    return this.doConfirmOrder(order);
  }

  /**
   * 执行确认接单（子类实现）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(order) {
    // 默认实现：无需确认接单
    return { msg: "无需确认接单" };
  }

  /**
   * 提交取票码
   * 提供默认实现，子类可覆盖
   * @param {Object} order - 订单信息
   * @param {string} qrcode - 取票码
   * @param {Object} [options] - 可选，{ logger?: Logger } 传入则使用调用方 logger
   * @returns {Promise<Object>} 提交结果
   */
  async submitTicketCode(order, qrcode, options = {}) {
    const log = this._getLogger(options);
    try {
      const params = this.config.params.submitParams(order, qrcode);
      log.infoSave("提交取票码参数", params);

      const apiMethod = this.api[this.config.api.submitTicket];
      if (!apiMethod) {
        throw new Error(`API方法不存在: ${this.config.api.submitTicket}`);
      }

      const res = await apiMethod.call(this.api, params);
      log.infoSave("提交取票码返回", res);
      return res;
    } catch (error) {
      log.errorSave("提交取票码异常", { error });
    }
  }

  /**
   * 转单
   * 提供默认实现，子类可覆盖
   * @param {Object} order - 订单信息
   * @param {string} reason - 转单原因
   * @param {Object} [options] - 可选，{ logger?: Logger } 传入则使用调用方 logger
   * @returns {Promise<Object>} 转单结果
   */
  async transferOrder(order, reason = "价格过低无法出票", options = {}) {
    const log = this._getLogger(options);
    try {
      const params = this.config.params.transferParams(order, reason);
      log.warn("转单参数", params);

      const apiMethod = this.api[this.config.api.transferOrder];
      if (!apiMethod) {
        throw new Error(`API方法不存在: ${this.config.api.transferOrder}`);
      }

      const res = await apiMethod.call(this.api, params);
      log.infoSave("转单成功", { res });
      return res;
    } catch (error) {
      log.errorSave("转单异常", { error });
    }
  }

  /**
   * 统一处理解锁错误
   * @param {Error} error - 错误对象
   * @param {Object} order - 订单信息
   * @param {number} retryCount - 剩余重试次数
   * @param {Object} [options] - 可选，{ logger?: Logger }
   * @returns {Promise<Object>} 处理结果
   */
  async handleUnlockError(error, order, retryCount, options = {}) {
    const log = this._getLogger(options);
    const errorMsg = error?.msg || error?.message || "";

    // 已解锁的情况
    if (errorMsg.includes("已经解锁") || errorMsg.includes("已解锁")) {
      log.infoSave("座位已解锁", { error });
      return { msg: "已解锁" };
    }

    // 无需解锁的情况
    if (
      errorMsg.includes("暂无锁座记录") ||
      errorMsg.includes("未锁座") ||
      errorMsg.includes("无需解锁") ||
      errorMsg.includes("该座位未锁座成功，故无法解锁")
    ) {
      log.infoSave("座位无需解锁", { error });
      return { msg: "无需解锁" };
    }

    // 座位没有被锁
    if (errorMsg === "当前订单座位没有被锁") {
      log.infoSave("座位没有被锁", { error });
      return { msg: "座位没有被锁" };
    }

    // 重试逻辑
    if (retryCount > 0) {
      log.warn(`解锁失败，剩余重试次数: ${retryCount}`, { error });
      await new Promise(resolve => setTimeout(resolve, 3000));
      return this.unlockSeat(order, retryCount - 1, options);
    }

    log.errorSave("解锁座位失败，重试次数已用完", { error });
    return Promise.reject(error);
  }

  /**
   * 转换订单格式
   * 使用配置中的转换函数
   * @param {Object} order - 原始订单
   * @returns {Object} 转换后的订单
   */
  transformOrder(order) {
    if (this.config.transformOrder) {
      return this.config.transformOrder(order);
    }
    return {
      ...order,
      plat_name: this.platName
    };
  }
}
