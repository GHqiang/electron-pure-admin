/**
 * 万达订单管理模块
 *
 * 职责：
 * - createOrder: 锁座+创建订单 (create_order.api)
 * - priceCalculation: 查询订单全价 (queryOrderStatus → totalPrice)
 * - buyTicket: 合并支付 (merge_payment.api, 含卡券 requestInfo)
 * - payOrder: 轮询取票码 (queryOrderStatus → ticketCode)
 * - cancelOrder / releaseSeat / transferOrder / queryOrderByUserId
 *
 * @module wanda/orderManage
 */
import { formatErrInfo, mockDelay } from "@/utils/utils";
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
   * 计算订单价格（查询 Wanda 订单全价，作为成本基准）
   * Wanda API: POST /order/query_by_userid.api  {orderId}
   * 出参: orderInf[{ticketAmount, salesAmount, subTicketOrderInfo[{seatInfo[{hallPrice}]}]}]
   */
  async priceCalculation({ orderId, session_id }) {
    try {
      const orderRes = await this.queryOrderByUserId({ orderId, session_id });
      if (!orderRes?.orderInf?.length) return null;
      this.logger.infoSave("查询订单详情", orderRes);
      const orderInfo =
        orderRes.orderInf.find(item => item.orderId === orderId) || {};
      const totalPrice = Number(
        orderInfo.ticketAmount || orderInfo.salesAmount || 0
      );
      return {
        total_price: totalPrice
      };
    } catch (error) {
      this.logger.errorSave("万达计算订单价格异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 创建订单（锁座+创建）
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
   * 购买订单（合并支付，含卡券 requestInfo）
   */
  async buyTicket({ orderId, mobilePhone, cinemaId, requestInfo, session_id }) {
    try {
      const res = await this.appApi.mergePayment(
        {
          orderId,
          mobilePhone,
          cinemaId,
          requestInfo: JSON.stringify(requestInfo)
        },
        { data: { wanda_token: session_id } }
      );
      this.logger.infoSave("万达合并支付返回", res);
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达合并支付异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取支付结果（轮询取票码）
   */
  async payOrder({ orderId, session_id }) {
    for (let i = 0; i < 15; i++) {
      await mockDelay(2);
      const statusRes = await this.queryOrderStatus({ orderId, session_id });
      if (!statusRes) continue;
      const { orderStatus, subTicketOrderStatus = [] } = statusRes;
      const subOrder = subTicketOrderStatus[0];
      if (orderStatus === 40 || subOrder?.orderStatus === 40) {
        return {
          ticketCode: subOrder?.ticketCode || statusRes.ticketCode,
          orderId
        };
      }
      if (orderStatus === 30 || subOrder?.orderStatus === 30) {
        this.logger.errorSave("万达出票失败", { orderStatus, subOrder });
        return null;
      }
      this.logger.infoSave(`第${i + 1}次轮询: orderStatus=${orderStatus}`);
    }
    return null;
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
   * 查询订单详情（含价格/座位信息）
   * Wanda API: POST /order/query_by_userid.api {orderId}
   */
  async queryOrderByUserId({ orderId, session_id }) {
    try {
      const res = await this.appApi.queryOrderByUserId(
        { orderId },
        { data: { wanda_token: session_id } }
      );
      return res?.data || {};
    } catch (error) {
      this.logger.errorSave("万达查询用户订单异常", {
        error: formatErrInfo(error)
      });
      return {};
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
   * 释放座位 = 取消订单
   */
  async releaseSeat(data, orderNum = 0) {
    try {
      let orderId, session_id;
      if (typeof data === "object" && data !== null) {
        orderId = data.orderId || data.order_id;
        session_id = data.session_id;
      } else {
        orderId = data;
        session_id = orderNum;
      }
      if (!orderId) return true;
      return await this.cancelOrder({ orderId, session_id });
    } catch (error) {
      this.logger.errorSave("万达释放座位异常", {
        error: formatErrInfo(error)
      });
    }
  }

  /**
   * 转单
   */
  async transferOrder(extra = {}) {
    return;
    try {
      return await this.platManage.orderTransferByPlat(
        extra?.reason || "出票失败",
        extra
      );
    } catch (error) {
      this.logger.errorSave("万达转单异常", { error: formatErrInfo(error) });
      return null;
    }
  }
}
