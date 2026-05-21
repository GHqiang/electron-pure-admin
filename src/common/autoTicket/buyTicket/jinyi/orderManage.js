// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage,
  mockDelay,
  trial,
  randomNumByLength
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
// 统一日志类
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
    // if (unlockSeatInfo) {
    //   // 1、释放座位(仅锁座id存在时)
    //   if (!unlockSeatInfo.order_num) await this.releaseSeat(unlockSeatInfo);
    //   // 2、取消订单(创建订单id存在时)
    //   if (unlockSeatInfo.order_num) await this.cancelOrder(unlockSeatInfo);
    // }

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

  // 释放座位
  async releaseSeat(unlockSeatInfo) {
    this.logger.infoSave("无释放座位接口", unlockSeatInfo);
    return { msg: "无释放座位接口" };
  }
  // 取消订单
  async cancelOrder(unlockSeatInfo) {
    this.logger.infoSave("无取消订单接口", unlockSeatInfo);
    return { msg: "无取消订单接口" };
  }

  // 计算价格
  async priceCalculation(data) {
    let { cinema_id, card_id, quan_code, lockOrderId, session_id } = data;
    let params = {
      session_id,
      cinema_id,
      order_id: lockOrderId,
      discount_id: 0,
      discount_type: "MARKETING",
      card_id: card_id,
      pay_type: "MEMBER",
      rewards: [],
      use_rewards: "Y",
      use_limit_cards: "N",
      limit_cards: [],
      voucher_code: "",
      voucher_code_type: "",
      ticket_pack_goods: ""
    };
    if (quan_code) {
      params.discount_type = "";
      params.voucher_code = quan_code;
      params.voucher_code_type = "VISTAX_VOUCHER";
    }
    let res;
    try {
      this.logger.infoSave("计算价格参数", JSON.parse(JSON.stringify(params)));
      res = await this.appApi.priceCalculation(params);
      this.logger.infoSave("计算价格返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("计算价格异常", error);
      if (formatErrInfo(error).includes("券码不存在") && res) {
        return {
          ...res,
          quanEmptyFlag: 1
        };
      }
    }
  }
  // 创建订单
  async createOrder(data) {
    let {
      cinema_id,
      lockOrderId,
      phoneNumber,
      session_id,
      retryCount = 0
    } = data;
    try {
      let params = {
        // order_id	260314205810011160
        // mobile	15237761435
        // pay_type	MEMBER
        cinema_id,
        pay_type: "MEMBER",
        order_id: lockOrderId,
        mobile: phoneNumber,
        session_id
      };
      this.logger.infoSave("创建订单参数", params);
      const res = await this.appApi.buyTicket(params);
      this.logger.infoSave("创建订单返回", res);
      if (retryCount) {
        this.logger.infoSave("重试后创建订单成功");
      }
      return { order_id: lockOrderId };
    } catch (error) {
      this.logger.errorSave("创建订单异常", formatErrInfo(error));
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

  // 从个人中心获取购买订单信息
  async getOrderInfoByOrderList({
    session_id,
    order_id,
    retryCount = 1,
    isRetry = true // 是否允许重试，异步查询时不允许
  }) {
    const MAX_RETRY_COUNT = 3;
    try {
      const params = {
        session_id
      };
      this.logger.infoSave("获取订单列表参数", params);
      const res = await this.appApi.getOrderList(params);
      let orderList = res?.data?.orders || [];
      this.logger.infoSave("获取订单列表返回", {
        orderList: orderList.slice(0, 5)
      });
      let targerOrder = orderList.find(item => item.order_id === order_id);
      if (targerOrder) {
        this.logger.infoSave("从订单列表获取到目标订单", { targerOrder });
        return targerOrder;
      }
      // 重试2次获取订单列表
      if (!targerOrder && retryCount < MAX_RETRY_COUNT && isRetry) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          order_id,
          retryCount: retryCount + 1
        });
      }
    } catch (error) {
      this.logger.errorSave("从订单列表获取到目标订单异常", { error });
      // 重试2次获取订单列表
      if (retryCount < MAX_RETRY_COUNT && isRetry) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          order_id,
          retryCount: retryCount + 1
        });
      }
    }
  }
  // 获取取票码并上传
  async getQrcodeUploadByPlat({ order_num, cinema_id, session_id }) {
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderId: order_num,
          session_id,
          cinema_id,
          logger: this.logger
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        this.asyncFetchQrcodeSubmit({
          order_num,
          cinema_id,
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

  // 获取购票信息
  async getPayResult(data) {
    let { orderId, session_id, cinema_id, logger, inx = 1 } = data || {};
    let qrcode;
    try {
      if (!orderId) {
        const targetOrder = await this.getOrderInfoByOrderList({
          session_id,
          order_id: orderId,
          isRetry: false
        });
        if (targetOrder?.ticket_code) {
          return targetOrder?.ticket_code;
        }
      } else {
        let params = {
          order_id: orderId,
          cinema_id,
          version: "tp_version",
          session_id
        };
        logger.info("获取支付结果参数", params);
        if (inx == 1) {
          logger.infoSave("获取支付结果参数", params);
        }
        const res = await this.appApi.getOrderInfo(params);
        logger.infoSave(`第${inx}次获取支付结果返回`, res);
        qrcode = res?.data?.ticket_code;
        if (qrcode) {
          return qrcode;
        }
      }
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, formatErrInfo(error));
    }
    return Promise.reject("获取支付结果不存在");
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({ order_num, cinema_id, session_id }) {
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
            cinema_id,
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
              cinema_id,
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
