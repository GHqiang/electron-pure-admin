/**
 * LMA订单管理模块
 *
 * 职责：
 * - 订单价格计算
 * - 订单购买
 * - 获取支付结果（取票码）
 * - 上传取票码到平台
 * - 转单逻辑
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - PlatManage: 平台管理模块（用于上传取票码、转单）
 *
 * @module lma/orderManage
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  mockDelay,
  trial
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO } from "@/common/constant";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";

export default class LmaOrderManage {
  constructor(order, logger, platManage, isTestOrder) {
    this.logger = logger;
    this.platManage = platManage;
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder;
  }

  // 价格计算
  async priceCalculation({ order_str, lmaToken }) {
    let params = {
      order_str,
      lmaToken
    };
    try {
      // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
      await mockDelay(1);
      this.logger.infoSave("计算订单价格参数", params);
      const res = await this.appApi.priceCalculation(params);
      this.logger.infoSave("计算订单价格返回", res);
      let price = res.data;
      return {
        price
      };
    } catch (error) {
      this.logger.errorSave("计算订单价格异常", { error, params });
      return {
        error,
        errMsg: "计算订单价格异常:" + JSON.stringify(params)
      };
    }
  }

  // 创建订单（LMA锁座即创建订单，此方法保留接口兼容）
  async createOrder(params) {
    // LMA的锁座即创建订单，锁座逻辑在 seatManage.lockseatByApp 中已处理
    // 保留此方法用于接口兼容
    return params;
  }

  // 购买
  async buyTicket({ order_num, lmaToken }) {
    try {
      let params = {
        order_str: order_num, // 订单号
        lmaToken
      };
      this.logger.infoSave("订单购买参数", params);
      const buyRes = await this.appApi.buyTicket(params);
      this.logger.infoSave("订单购买返回", buyRes);
      return {
        buyRes
      };
    } catch (error) {
      this.logger.errorSave("订单购买异常", { error });
      return {
        error
      };
    }
  }

  // 获取支付结果（取票码）
  async payOrder({ order_num, lmaToken, inx = 1 }) {
    try {
      let params = {
        order_str: order_num, // 订单号
        lmaToken
      };
      if (inx == 1) {
        this.logger.infoSave("获取支付结果传参", { params });
      }
      const res = await this.appApi.payOrder(params);
      this.logger.infoSave(`第${inx}次获取支付结果返回`, { res });
      let qrcode = res.data?.booking_id || "";
      if (qrcode) {
        return qrcode;
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      this.logger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
      return Promise.reject(error);
    }
  }

  // 上传取票码
  async getQrcodeUploadByPlat({ qrcode, orderInfo, flag = 1 }) {
    try {
      // 提交取票码
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag,
        logger: this.logger,
        orderInfo: JSON.parse(JSON.stringify(orderInfo))
      });
      if (!submitRes || submitRes?.error) {
        this.logger.errorSave("订单提交取票码失败");
        let errInfo = formatErrInfo(submitRes?.error);
        sendWxPusherMessage({
          orderInfo,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return null;
      }
      return submitRes;
    } catch (error) {
      this.logger.errorSave("提交取票码异常", { error });
      return null;
    }
  }

  // 转单
  async transferOrder(unlockSeatInfo, lmaToken) {
    const { appFlag } = this;
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { order_str } = unlockSeatInfo;
      if (order_str && lmaToken) {
        // 取消订单释放座位
        try {
          let params = {
            order_str,
            ...(lmaToken && { lmaToken })
          };
          const res = await this.appApi.cannelOneOrder(params);
          this.logger.infoSave("取消订单返回", {
            res,
            params
          });
        } catch (error) {
          this.logger.errorSave("取消订单异常", {
            error,
            params: { order_str, lmaToken }
          });
          sendWxPusherMessage({
            orderInfo: this.order,
            transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
            failReason: formatErrInfo(error)
          });
        }
      }
    }
    // 获取转单原因
    const errInfoObj = this.logger.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");
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
      return null;
    }
    return await this.platManage.orderTransferByPlat(errMsg, errInfo);
  }

  // 更新卡余额
  async updateCardBalance(data) {
    const { card_id, card_balance, paymentAmount } = data;
    const params = {
      card_id,
      app_name: "lma",
      balance: "" + (card_balance - paymentAmount)
    };
    try {
      if (card_id && card_balance && paymentAmount) {
        const res = await svApi.updateCardBalance(params);
        this.logger.infoSave("更新卡余额返回", {
          res,
          params
        });
      }
    } catch (error) {
      this.logger.infoSave("更新卡余额异常", {
        error,
        params
      });
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    order_num,
    lmaToken,
    app_name,
    plat_name,
    order_number,
    orderInfo,
    profit
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init({ plat_name, order_number, app_name });
    logger.errorSave("异步轮询获取取票码并提交方法开始执行");
    try {
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.payOrder({
            order_num,
            lmaToken,
            inx,
            logger
          }),
        9,
        20,
        "",
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        logger.errorSave("系统延迟轮询3分钟后获取取票码仍失败");
        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.payOrder({
              order_num,
              lmaToken,
              inx,
              logger
            }),
          21,
          20,
          "",
          7 * 60
        );
      }
      if (!qrcode) {
        logger.errorSave("系统延迟轮询10分钟后获取取票码仍失败");
        // 上送异步轮询获取取票码失败日志
        logger.logUpload();
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟轮询10分钟后获取取票码仍失败"
          }
        });
        return;
      }
      await this.getQrcodeUploadByPlat({
        qrcode,
        orderInfo,
        flag: 2
      });
      // 上送异步轮询获取取票码成功日志
      logger.logUpload();
      // 更新出票结果
      svApi.updateTicketRecord({
        whereObj: {
          order_number,
          plat_name
        },
        updateObj: {
          qrcode,
          order_status: "1",
          err_msg: "系统延迟后轮询获取提交取票码成功",
          ...(profit ? { profit } : {})
        }
      });
    } catch (error) {
      logger.errorSave("异步轮询获取取票码上传提交异常", { error });
      // 上送异步轮询获取取票码异常日志
      logger.logUpload();
    }
  }
}
