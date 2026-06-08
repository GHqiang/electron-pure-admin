/**
 * 万达订单管理模块
 *
 * 职责：
 * - createOrder: 锁座+创建订单 (create_order.api)
 * - priceCalculation: 查询订单全价 (queryOrderStatus → totalPrice)
 * - buyTicket: 合并支付 (merge_payment.api, 含卡券 requestInfo)
 * - payOrder: 轮询取票码 (queryOrderStatus → ticketCode)
 * - cancelOrder / transferOrder / queryOrderByUserId
 *
 * @module wanda/orderManage
 */
import {
  formatErrInfo,
  mockDelay,
  trial,
  sendWxPusherMessage
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";

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
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 包含 total_price 的对象，或 null（查询失败）
   *
   * 逻辑说明：
   * - 调用 queryOrderByUserId 获取订单详情
   * - 从订单详情中提取 ticketAmount 或 salesAmount 作为 total_price
   * - 返回 { total_price } 供后续报价规则使用
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
      this.logger.infoSave("订单总价", { totalPrice });
      return {
        total_price: totalPrice
      };
    } catch (error) {
      this.logger.errorSave("万达计算订单价格异常", {
        error: formatErrInfo(error)
      });
    }
  }

  /**
   * 创建订单（锁座+创建）
   * @param {Object} orderParams - 订单参数对象
   * @param {string} orderParams.dId - 场次 ID
   * @param {string} orderParams.retailerCode - 影院代码
   * @param {string} orderParams.mobile - 用户手机号
   * @param {string} orderParams.seatId - 座位 ID
   * @param {string} orderParams.session_id - 会话 ID
   * @return {Object|null} 创建订单结果对象，或 null（创建失败）
   *
   * 逻辑说明：
   * - 调用 createOrder API 创建订单
   * - 传入必要参数（dId, retailerCode, mobile, seatId, wanda_token）
   * - 返回创建订单结果，供后续支付使用
   */
  async createOrder(orderParams) {
    const { dId, retailerCode, mobile, seatId, session_id } = orderParams;
    let params = {
      dId,
      retailerCode,
      mobile,
      seatId,
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("万达创建订单参数", params);
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave("万达创建订单返回", res);
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
   * @param {Object} params - 购买参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.mobilePhone - 用户手机号
   * @param {string} params.cinemaId - 影院 ID
   * @param {Object} params.requestInfo - 卡券 requestInfo 对象
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 购买结果对象，或 null（购买失败）
   *
   * 逻辑说明：
   * - 调用 mergePayment API 进行合并支付
   * - 传入必要参数（orderId, mobilePhone, cinemaId, requestInfo, wanda_token）
   * - 返回购买结果，供后续轮询支付结果使用
   */
  async buyTicket({ orderId, mobilePhone, cinemaId, requestInfo, session_id }) {
    let params = {
      orderId,
      mobilePhone,
      cinemaId,
      requestInfo: JSON.stringify(requestInfo),
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("万达购买订单参数", params);
      const res = await this.appApi.mergePayment(params);
      this.logger.infoSave("万达支付返回", res);
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达合并支付异常", {
        error: formatErrInfo(error)
      });
    }
  }

  /**
   * 获取支付结果（轮询取票码）
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @param {number} [params.retryTimes=15] - 最大轮询次数
   * @param {number} [params.delaySeconds=2] - 每次轮询间隔秒数
   * @return {Object|null} 包含 ticketCode 的对象，或 null（支付失败或出票失败）
   *
   * 逻辑说明：
   * - 进行轮询，调用 queryOrderStatus 查询订单状态
   * - 如果 orderStatus 或 subOrder.orderStatus 为 40，表示出票成功，返回 ticketCode
   * - 如果 orderStatus 或 subOrder.orderStatus 为 30，表示出票失败，记录日志并返回 null
   * - 轮询次数达到上限仍未出票，记录日志并返回 null
   */
  async payOrder({ orderId, session_id, retryTimes = 15, delaySeconds = 2 }) {
    for (let i = 0; i < retryTimes; i++) {
      await mockDelay(delaySeconds);
      const statusRes = await this.queryOrderStatus({ orderId, session_id });
      if (!statusRes) continue;
      const { orderStatus, subTicketOrderStatus = [] } = statusRes;
      const subOrder = subTicketOrderStatus[0];
      if (orderStatus === 40 || subOrder?.orderStatus === 40) {
        const ticketCode = subOrder?.ticketCode || statusRes.ticketCode;
        this.logger.infoSave("万达出票成功", {
          ticketCode,
          orderStatus,
          subOrder
        });
        return {
          ticketCode,
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
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 订单状态对象，或 null（查询失败）
   */
  async queryOrderStatus({ orderId, session_id }) {
    let params = { orderId, wanda_token: session_id };
    try {
      const res = await this.appApi.queryOrderStatus(params);
      this.logger.infoSave("查询订单状态返回", { res, params });
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达查询订单状态异常", {
        error: formatErrInfo(error),
        params
      });
      return null;
    }
  }

  /**
   * 查询订单详情（含价格/座位信息）
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 订单详情对象，或 null（查询失败）
   * Wanda API: POST /order/query_by_userid.api {orderId}
   */
  async queryOrderByUserId({ orderId, session_id }) {
    let params = { orderId, wanda_token: session_id };
    try {
      const res = await this.appApi.queryOrderByUserId(params);
      this.logger.infoSave("查询用户订单返回", { res, params });
      return res?.data || {};
    } catch (error) {
      this.logger.errorSave("万达查询用户订单异常", {
        error: formatErrInfo(error),
        params
      });
      return {};
    }
  }

  /**
   * 取消订单
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 取消订单结果对象，或 null（取消失败）
   */
  async cancelOrder({ orderId, session_id }) {
    let params = { orderId, wanda_token: session_id };
    try {
      const res = await this.appApi.cancelOrder(params);
      this.logger.infoSave("取消订单返回", { res, params });
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达取消订单异常", {
        error: formatErrInfo(error),
        params
      });
      return null;
    }
  }

  /**
   * 转单
   */
  async transferOrder(unlockSeatInfo = {}) {
    try {
      this.logger.infoSave("开始准备转单", unlockSeatInfo);
      if (unlockSeatInfo) {
        const { orderId } = unlockSeatInfo;
        const currentParams = this.getCurrentParams();
        const current = currentParams?.list?.[currentParams?.inx] || {};
        const session_id = unlockSeatInfo.session_id ?? current.session_id;
        if (orderId) {
          await this.cancelOrder({ orderId, session_id });
        }
      }
      // 3、平台转单
      // 获取转单原因
      const errInfoObj = this.logger.logList
        .filter(item => item.level === "error")
        .reverse()?.[0];
      let errMsg = errInfoObj?.des || "";
      let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
      let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
      // 关闭自动转单只针对座位异常生效
      let des = "自动转单处于关闭状态，只取消订单释放座位，需手动出票或转单";
      if (this.order.isAgain) {
        des = "重新出票失败，不转单只取消订单释放座位，需手动出票或转单";
      }
      if (this.isTestOrder || isAutoTransfer !== "1" || this.order.isAgain) {
        this.logger.infoSave("自动转单处于关闭状态");
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: des,
          failReason: `${errMsg}——${errInfo}`
        });
        return;
      }
      return await this.platManage.orderTransferByPlat(errMsg, errInfo);
    } catch (error) {
      this.logger.errorSave("万达转单异常", { error: formatErrInfo(error) });
      return null;
    }
  }

  /**
   * 最后处理：获取取票码并上传，失败则异步轮询
   */
  async lastHandle({ orderId, session_id, orderInfo }) {
    try {
      const payOrderRes = await this.payOrder({
        orderId,
        session_id,
        retryTimes: 3,
        delaySeconds: 1
      });
      if (payOrderRes?.ticketCode) {
        this.logger.infoSave("同步获取取票码成功");
        const submitRes = await this.platManage.submitTicketCode(
          orderInfo?.order_number,
          payOrderRes.ticketCode
        );
        return { submitRes, qrcode: payOrderRes.ticketCode };
      }

      // 同步获取失败，启动异步轮询
      this.logger.errorSave("获取订单支付结果，取票码不存在，启动异步轮询");
      sendWxPusherMessage({
        orderInfo,
        transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
        failReason: "获取订单支付结果，取票码不存在，准备开始异步轮询获取"
      });
      this.asyncFetchQrcodeSubmit({ orderId, session_id, orderInfo });
    } catch (error) {
      this.logger.errorSave("万达 lastHandle 异常", {
        error: formatErrInfo(error)
      });
    }
  }

  /**
   * 异步轮询获取取票码并提交
   * 每 20 秒轮询一次，先试 9 次（3 分钟），失败再试 21 次（7 分钟）
   */
  async asyncFetchQrcodeSubmit({ orderId, session_id, orderInfo }) {
    const asyncLogger = new Logger({ logType: 3 });
    asyncLogger.init({
      plat_name: orderInfo?.plat_name,
      order_number: orderInfo?.order_number,
      app_name: this.appFlag
    });
    asyncLogger.errorSave("万达异步轮询获取取票码开始执行");

    const pollFn = () =>
      this.queryOrderStatus({ orderId, session_id }).then(res => {
        if (!res) return null;
        const { subTicketOrderStatus = [] } = res;
        const subOrder = subTicketOrderStatus[0];
        if (res.orderStatus === 40 || subOrder?.orderStatus === 40) {
          return subOrder?.ticketCode || res.ticketCode;
        }
        return null;
      });

    try {
      // 第一阶段：9 次 × 20 秒 = 3 分钟
      let ticketCode = await trial(pollFn, 9, 20, "", 3 * 60);

      if (!ticketCode) {
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询 3 分钟后获取取票码仍失败"
        });
        asyncLogger.errorSave("系统延迟轮询 3 分钟后获取取票码仍失败");

        // 第二阶段：21 次 × 20 秒 = 7 分钟
        ticketCode = await trial(pollFn, 21, 20, "", 7 * 60);
      }

      if (!ticketCode) {
        asyncLogger.errorSave("系统延迟轮询 10 分钟后获取取票码仍失败");
        asyncLogger.logUpload();
        svApi.updateTicketRecord({
          whereObj: {
            order_number: orderInfo?.order_number,
            plat_name: orderInfo?.plat_name
          },
          updateObj: { err_msg: "系统延迟轮询 10 分钟后获取取票码仍失败" }
        });
        return;
      }

      await this.platManage.submitTicketCode(
        orderInfo?.order_number,
        ticketCode
      );
      asyncLogger.infoSave("异步轮询获取取票码成功并已上传");
      // 上送异步轮询获取取票码成功日志
      asyncLogger.logUpload();
    } catch (error) {
      asyncLogger.errorSave("万达异步轮询异常", {
        error: formatErrInfo(error)
      });
      asyncLogger.logUpload();
    }
  }
}
