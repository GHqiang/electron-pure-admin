// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage,
  mockDelay,
  trial
} from "@/utils/utils";
import md5 from "@/utils/md5";
import { APP_API_OBJ } from "@/common/index";
import { GE_APP_INFO } from "@/common/constant";
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
    this.api_version = GE_APP_INFO(order.app_name)?.api_version;
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
    const { cinemaCode, cinemaId, lockOrderId, session_id } = unlockSeatInfo;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        lockOrderId,
        ...(session_id && { session_id })
      };
      this.logger.info("释放座位参数", params);
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
      cinemaCode,
      cinemaId,
      lockOrderId,
      activityKey,
      quan_code,
      session_id,
      useCardList = [],
      real_member_price, // 预计支付价格
      firstCalc = true,
      isTrial = true
    } = data;
    let cardNum = useCardList?.[0]?.cardNo;
    let params = {
      cinemaCode,
      cinemaId,
      lockOrderId,
      addRetailGoods: [],
      addEquityGoods: [],
      orderGoodsType: 1,
      defaultCardNo: cardNum,
      firstCalc: firstCalc || false, // 是否是首次计算(首次会默认用券)
      session_id
    };
    const { api_version } = this;
    if (quan_code?.length) {
      params.activityKey = "";
      if (api_version == "3.0C") {
        params.ticketCouponCode = quan_code.join();
        params.optType = 0;
      } else if (api_version === "C") {
        params.ticketCodes = quan_code;
      }
    } else {
      params.activityKey = activityKey || "";
      if (api_version === "C") {
        params.limitConsume = false;
      }
    }
    let res;
    try {
      this.logger.infoSave("计算价格参数", params);
      // 通过优惠调用时无需再调用之前的价格计算接口
      if (!(activityKey && isTrial === false)) {
        res = await this.appApi.priceCalculation(params);
        this.logger.infoSave("计算价格返回", JSON.parse(JSON.stringify(res)));
      }
      params = { ...params, firstCalc: false };
      // this.logger.infoSave("计算价格参数1", params);
      res = await this.appApi.priceCalculation(params);
      this.logger.infoSave("计算价格返回1", res);
      if (!quan_code?.length && cardNum) {
        // 用卡
        if (api_version === "C" && isTrial) {
          let activityList = res?.data?.activityList || [];
          if (activityList.length) {
            activityKey = activityList
              .filter(item => (item.cardNum ? item.cardNum === cardNum : true))
              .sort(
                (a, b) => b.discountAmount - a.discountAmount
              )?.[0]?.activityKey;
            this.logger.infoSave("计算价格获取到优惠活动key", { activityKey });
            if (activityKey) {
              return this.pripriceCalculation({
                ...data,
                activityKey,
                isTrial: false
              });
            }
          }
        }
        const paymentAmount = res?.data?.priceDetail?.totalRealPayAmount;
        if (paymentAmount == real_member_price) {
          return {
            ...res?.data,
            cardNum
          };
        } else {
          if (useCardList?.length > 1) {
            this.logger.infoSave(
              "辰星计算价格和预计支付价格不符，准备换卡计算",
              {
                paymentAmount,
                real_member_price
              }
            );
            return await this.pripriceCalculation({
              ...data,
              useCardList: useCardList.slice(1)
            });
          } else {
            return {
              ...res?.data,
              cardNum
            };
          }
        }
      }
      return res?.data;
    } catch (error) {
      this.logger.errorSave("计算价格异常", error);
    }
  }
  // 创建订单
  async createOrder(data) {
    let {
      cinemaCode,
      cinemaId,
      cardNum,
      lockOrderId,
      session_id,
      isTimeoutRetry = 1 // 默认超时重试
    } = data;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        defaultCardNo: cardNum,
        lockOrderId,
        shareCode: "",
        session_id
      };
      this.logger.infoSave("创建订单参数", params);
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave("创建订单返回", res);
      let createOrderRes = res.data;
      // order_num = res.data?.orderNumber || "";
      return createOrderRes;
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
  // 订单购买
  async buyTicket({
    cinemaCode,
    cinemaId,
    cinemaName,
    cardNo,
    quan_code,
    amount,
    order_num,
    member_pwd,
    session_id
  }) {
    const { appFlag } = this;
    let appInfo = GE_APP_INFO(appFlag);
    let open_id = appInfo?.sfc_open_id;
    let params = {
      cinemaCode,
      cinemaId,
      cinemaName,
      defaultCardNo: cardNo,
      amount, // 原价
      orderNo: order_num, // 创建订单号
      businessSystemFlowNumber: "5" + new Date().getTime(), // 自定义流水号
      businessSystemName: "C_TRADE",
      payTerminal: "APPLET",
      payTerminalType: "Applet",
      payChannel: appInfo?.channelCode,
      payChannelName: appInfo?.channelName, // 先不传试试
      goodBody: !quan_code?.length ? "影票" : "影院商品",
      openId: open_id,
      openID: open_id, // 小程序openid每个小程序一个
      // ipAddress: "127.0.0.1", // 先不传试试
      payWay: !quan_code?.length ? "MEMBER_CARD_PAY" : "NO_CASH", // 支付方式
      cardNumber: cardNo,
      orderType: 1,
      password: md5.hex_md5(member_pwd), // 卡密码
      orderNumber: order_num,
      session_id
    };
    if (this.api_version === "C") {
      params.businessSystemCode = "online_directly_trade_settle";
      params.channelUid = appInfo?.channelCode;
      delete params.defaultCardNo;
    }
    try {
      this.logger.infoSave("订单购买参数", params);
      const buyRes = await this.appApi.buyTicket(params);
      this.logger.infoSave("订单购买返回", buyRes);
      return {
        buyRes
      };
    } catch (error) {
      this.logger.errorSave("订单购买异常", formatErrInfo(error));
      if (
        formatErrInfo(error)?.includes("密码") &&
        formatErrInfo(error)?.includes("错误")
      ) {
        this.logger.infoSave("发送密码配置错误提醒");
        sendWxPusherMessage({
          orderInfo: this.order,
          msgType: 5,
          cardNoByPwdError: cardNo,
          failReason: "密码输入错误，请检查卡号密码是否正确"
        });
      }
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
      }
      return {
        error
      };
    }
  }

  // 获取取票码并上传
  async getQrcodeUploadByPlat({
    cinemaCode,
    cinemaId,
    cardNum,
    order_num,
    session_id
  }) {
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          cinemaCode,
          cinemaId,
          cardNum,
          orderCode: order_num,
          session_id,
          logger: this.logger
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        this.asyncFetchQrcodeSubmit({
          cinemaCode,
          cinemaId,
          cardNum,
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
    let {
      cinemaCode,
      cinemaId,
      cardNum,
      orderCode,
      session_id,
      logger,
      inx = 1
    } = data || {};
    let qrcode;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        defaultCardNo: cardNum,
        orderCode,
        orderNumber: orderCode,
        session_id
      };
      logger.info("获取支付结果参数", params);
      if (inx == 1) {
        logger.infoSave("获取支付结果参数", params);
      }
      const res = await this.appApi.queryOrderDetail(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, res);
      qrcode = res?.data?.printNo?.slice(-8); // 取后8位
      if (this.api_version == "C") {
        qrcode = res?.data?.getCode?.slice(-8); // 取后8位
      }
      if (qrcode) {
        return qrcode;
      }
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, formatErrInfo(error));
    }
    return Promise.reject("获取支付结果不存在");
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    cinemaCode,
    cinemaId,
    cardNum,
    order_num,
    session_id
  }) {
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
            cinemaCode,
            cinemaId,
            cardNum,
            orderCode: order_num,
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
              cinemaCode,
              cinemaId,
              cardNum,
              orderCode: order_num,
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
