// 订单管理模块
import {
  formatErrInfo,
  mockDelay,
  trial,
  sendWxPusherMessage
} from "@/utils/utils";
import { wandaAesDecrypt } from "@/utils/wandaAesDecrypt";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";

export default class OrderManage {
  constructor(order, logger, platManage, isTestOrder) {
    this.logger = logger; // 日志模块
    this.platManage = platManage; // 平台管理模块
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder; // 是否是测试订单
  }

  // 转单
  async transferOrder(unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    this.logger.infoSave("金逸无释放座位及取消订单接口");
    if (unlockSeatInfo) {
      // 2、取消订单(创建订单id存在时)
      if (unlockSeatInfo.orderId) await this.cancelOrder(unlockSeatInfo);
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
    // if (this.isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
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
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
      return null;
    }
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
    let params = { orderId, wanda_token: session_id };
    try {
      const res = await this.appApi.queryOrderByUserId(params);
      this.logger.infoSave("查询用户订单返回", { res, params });
      const orderRes = res?.data || {};
      if (!orderRes?.orderInf?.length) return null;
      // this.logger.infoSave("查询订单详情", orderRes);
      const orderInfo =
        orderRes.orderInf.find(item => item.orderId === orderId) || {};
      this.logger.infoSave("计算价格返回", orderInfo);
      return orderInfo;
    } catch (error) {
      this.logger.errorSave("万达计算订单价格异常", {
        error: formatErrInfo(error)
      });
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
  async createOrder({
    orderId,
    mobilePhone,
    cinemaId,
    requestInfo,
    session_id
  }) {
    let params = {
      orderId,
      mobilePhone,
      cinemaId,
      requestInfo: JSON.stringify(requestInfo),
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("购买订单参数", params);
      const res = await this.appApi.mergePayment(params);

      // merge_payment 返回 data 是 AES-ECB 密文，需解密
      let resData = res;
      if (res && typeof res.data === "string" && res.code === 0) {
        const decrypted = wandaAesDecrypt(res.data);
        if (decrypted) {
          try {
            resData = { ...res, data: JSON.parse(decrypted) };
          } catch (e) {
            this.logger.errorSave("解密支付结果JSON失败", {
              error: e?.message
            });
          }
        }
      }

      this.logger.infoSave("购买订单返回", resData);
      return {
        success: resData.data?.bizCode === 0,
        tradeNo: resData.data?.tradeNo
      };
    } catch (error) {
      this.logger.errorSave("购买订单异常", {
        error: formatErrInfo(error)
      });
      if (
        formatErrInfo(error).includes("超时") ||
        formatErrInfo(error).includes("timeout of")
      ) {
        this.logger.infoSave("订单支付接口超时，请关注该订单购买出票情况");
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "订单支付接口超时，请关注该订单购买出票情况",
          failReason: formatErrInfo(error)
        });
        return { isTimeout: true };
      }
    }
  }

  // 获取购票信息
  async getPayResult(data) {
    let { orderId, session_id, logger, inx = 1 } = data || {};
    let qrcode;
    try {
      let params = {
        orderId,
        wanda_token: session_id
      };
      logger.info("获取支付结果参数", params);
      if (inx == 1) {
        logger.infoSave("获取支付结果参数", params);
      }
      // 用 query_by_userid 获取订单详情（含取票码 electronicCode）
      const res = await this.appApi.queryOrderByUserId(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, res);

      const orderInf = res?.data?.orderInf || res?.orderInf || [];
      const orderInfo =
        orderInf.find(o => o.orderId === orderId) || orderInf[0] || {};
      const { orderStatus, subTicketOrderInfo = [] } = orderInfo;
      const subOrder = subTicketOrderInfo[0];

      // orderStatus >= 40 表示支付已发起/完成，可尝试获取取票码
      if (orderStatus && orderStatus == 100) {
        qrcode =
          subOrder?.electronicCode?.[0] ||
          subOrder?.snackExchangeCode ||
          subOrder?.verifyCode ||
          "";
      }
      if (orderStatus === 30) {
        logger.errorSave("万达出票失败", { orderStatus, subOrder });
      }
      if (qrcode) {
        logger.infoSave("获取取票码成功", { qrcode });
        return qrcode;
      }
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, formatErrInfo(error));
    }
    return Promise.reject("获取支付结果不存在");
  }

  /**
   * 最后处理：获取取票码并上传，失败则异步轮询
   */
  async getQrcodeUploadByPlat({ order_num, session_id }) {
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderId: order_num,
          session_id,
          logger: this.logger
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        this.asyncFetchQrcodeSubmit({
          order_num,
          session_id
        });
        return;
      }
      this.logger.infoSave("非异步获取订单支付结果成功");
      const { order_number, plat_name } = this.order;
      const submitRes = await this.submitQrcode({
        qrcode,
        order_number,
        plat_name,
        flag: 1,
        logger: this.logger
      });
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("获取取票码并上传发现异常", formatErrInfo(error));
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({ order_num, session_id }) {
    let logger = new Logger({ logType: 3 });
    logger.init(this.order);
    const { plat_name, order_number } = this.order;
    let conPrefix = "";
    try {
      logger.infoSave("异步轮询获取取票码并提交方法开始执行");
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderId: order_num,
            session_id,
            logger,
            inx
          }),
        9,
        20,
        conPrefix,
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        logger.errorSave("系统延迟轮询3分钟后获取取票码仍失败");

        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.getPayResult({
              orderId: order_num,
              session_id,
              logger,
              inx
            }),
          21,
          20,
          conPrefix,
          7 * 60
        );
      }
      if (!qrcode) {
        logger.errorSave("系统延迟轮询7分钟后获取取票码仍失败");
        logger.logUpload();
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟轮询7分钟后获取取票码仍失败"
          }
        });
        return;
      }
      await this.submitQrcode({
        qrcode,
        order_number,
        plat_name,
        flag: 2,
        logger
      });
      logger.logUpload();
    } catch (error) {
      console.warn("异步轮询获取取票码上传提交异常", error);
      logger.logUpload();
    }
  }

  // 上传取票码
  async submitQrcode({ qrcode, order_number, plat_name, flag, logger }) {
    try {
      // 10、提交取票码
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag,
        logger,
        orderInfo: JSON.parse(JSON.stringify(this.order))
      });
      if (!submitRes || submitRes?.error) {
        logger.errorSave("订单提交取票码失败，单个订单直接出票结束");

        let errInfo = submitRes?.error;
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return;
      }
      if (flag !== 1) {
        // 异步提交 -更新出票结果
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            qrcode,
            order_status: "1",
            err_msg: "系统延迟后轮询获取提交取票码成功"
          }
        });
      }
      return submitRes;
    } catch (error) {
      logger.errorSave("提交取票码异常", error);
    }
  }
}
