/**
 * 万达订单管理模块
 *
 * 职责：
 * - 创建订单（锁座）
 * - 确认订单（绑定手机）
 * - 查询订单状态
 * - 取消订单
 *
 * @module wanda/orderManage
 */
import { formatErrInfo } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class WandaOrderManage {
  constructor(order, logger, platManage, isTestOrder, getCurrentParams) {
    this.logger = logger;
    this.platManage = platManage;
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder;
    this.getCurrentParams = getCurrentParams;
  }

  /**
   * 创建订单（锁座）
   */
  async createOrder(orderParams) {
    const { dId, retailerCode, mobile, seatId, session_id } = orderParams;
    try {
      const res = await this.appApi.createOrder(
        { dId, retailerCode, mobile, seatId },
        { data: { wanda_token: session_id } }
      );
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达创建订单异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 确认订单（绑定手机号）
   */
  async confirmOrder({ orderId, mobilePhone, session_id }) {
    try {
      const res = await this.appApi.confirmOrder(
        { orderId, mobilePhone, json: true },
        { data: { wanda_token: session_id } }
      );
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达确认订单异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 查询订单状态
   */
  async queryOrderStatus({ orderId, session_id }) {
    try {
      const res = await this.appApi.queryOrderStatus(
        { orderId },
        { data: { wanda_token: session_id } }
      );
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达查询订单状态异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder({ orderId, session_id }) {
    try {
      const res = await this.appApi.cancelOrder(
        { orderId, json: true },
        { data: { wanda_token: session_id } }
      );
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达取消订单异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 转单（无法出票时）
   */
  async transferOrder(extra = {}) {
    try {
      return await this.platManage.orderTransferByPlat(
        extra?.reason || "出票失败",
        extra
      );
    } catch (error) {
      this.logger.errorSave("万达转单异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 释放座位
   */
  async releaseSeat(orderId, session_id) {
    try {
      return await this.cancelOrder({ orderId, session_id });
    } catch (error) {
      this.logger.errorSave("万达释放座位异常", {
        error: formatErrInfo(error)
      });
    }
  }
}
