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
    if (unlockSeatInfo) {
      // 1、释放座位(仅锁座id存在时)
      if (!unlockSeatInfo.order_num) await this.releaseSeat(unlockSeatInfo);
      // 2、取消订单(创建订单id存在时)
      if (unlockSeatInfo.order_num) await this.cancelOrder(unlockSeatInfo);
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

  // 释放座位
  async releaseSeat(unlockSeatInfo) {
    const { cinemaLinkId, lockOrderId, session_id } = unlockSeatInfo;
    try {
      let params = {
        cinemaLinkId,
        lockOrderId,
        pageInit: false,
        fenghuangToken: session_id
      };
      this.logger.infoSave("释放座位参数", params);
      const res = await this.appApi.releaseSeat(params);
      this.logger.infoSave("释放座位成功", { res });
      return res;
    } catch (error) {
      this.logger.infoSave("释放座位异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "释放座位失败，建议手动释放座位，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }
  // 取消订单
  async cancelOrder(unlockSeatInfo) {
    const { cinemaCode, cinemaId, order_num, session_id } = unlockSeatInfo;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        orderCode: order_num,
        orderNumber: order_num,
        ...(session_id && { session_id })
      };
      this.logger.info("取消订单参数", params);
      const res = await this.appApi.cancelOrder(params);
      this.logger.infoSave("取消订单成功", { res });
      return res;
    } catch (error) {
      this.logger.infoSave("取消订单异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }

  // 计算价格
  async pripriceCalculation(data) {
    let {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      targetSeatCodes,
      lockOrderId,
      promotions,
      session_id
    } = data;
    let params = {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      lockOrderId,
      seats: JSON.stringify(
        targetSeatCodes.map(item => ({
          areaId: item.areaId,
          seatCode: item.seatCode
        }))
      ),
      pageInit: true,
      fenghuangToken: session_id
    };
    // 优惠券参数处理
    if (promotions) {
      params.promotions = promotions;
      delete params.pageInit;
    }
    try {
      this.logger.infoSave("计算价格参数", params);
      let res =
        await this.appApi[
          !promotions ? "priceCalculation" : "priceCalculationByQuan"
        ](params);
      this.logger.infoSave("计算价格返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("计算价格异常", error);
    }
  }
  // 创建订单
  async createOrder(data) {
    let {
      cinemaLinkId,
      scheduleKey,
      scheduleId,
      lockOrderId,
      seats,
      totalOriginalPrice,
      totalPayAmount,
      promotions,
      payments,
      phoneNumber,
      session_id,
      isTimeoutRetry = 1 // 默认超时重试
    } = data;
    try {
      let outerId = randomNumByLength(16);
      let params = {
        seats,
        promotions,
        totalOriginalPrice,
        totalPayAmount,
        cinemaLinkId,
        phoneNumber,
        scheduleId,
        scheduleKey,
        lockOrderId,
        payments,
        outerId,
        closeOuterId: outerId,
        fenghuangToken: session_id
      };
      this.logger.infoSave("创建订单参数", params);
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave("创建订单返回", res);
      return res;
    } catch (error) {
      this.logger.infoSave("创建订单异常", formatErrInfo(error));
      if (error?.msg?.includes("超时") && isTimeoutRetry === 1) {
        this.logger.infoSave("创建订单接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const createOrderRes = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (createOrderRes) {
            this.logger.infoSave("创建订单接口重试成功", createOrderRes);
            return createOrderRes;
          }
        } catch (error) {
          this.logger.infoSave("创建订单接口重试失败", formatErrInfo(error));
        }
      }
    }
  }

  // 获取取票码并上传
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

  // 获取购票信息
  async getPayResult(data) {
    let { orderId, session_id, logger, inx = 1 } = data || {};
    let qrcode;
    try {
      let params = {
        orderId,
        operationType: "TICKET",
        pageInit: true,
        fenghuangToken: session_id
      };
      logger.info("获取支付结果参数", params);
      if (inx == 1) {
        logger.infoSave("获取支付结果参数", params);
      }
      const res = await this.appApi.queryOrderDetail(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, res);
      qrcode = res?.ticket?.pickupCode;
      if (qrcode) {
        return qrcode;
      }
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, formatErrInfo(error));
    }
    return Promise.reject("获取支付结果不存在");
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
        logger
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
