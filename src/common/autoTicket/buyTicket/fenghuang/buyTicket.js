// 买票主流程
import {
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  randomNumByLength
} from "@/utils/utils";
import svApi from "@/api/sv-api";
// 引入获取payToken方法（window.getPayToken）
import "@/utils/fenghuang-payToken";

// 统一日志类
import Logger from "@/common/logger";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { user_id }
} = platTokens();
import SeatManage from "./seatManage";
import OrderManage from "./orderManage";
import CinemaManage from "./cinemaManage";
import CardQuanManage from "./cardQuanManage";
import PlatManage from "../platManage";
export default class BuyTicket {
  constructor(order, logger, isTestOrder) {
    this.appFlag = order.app_name; // 影线标识
    this.order = order; // 订单信息
    this.isTestOrder = isTestOrder; // 是否是测试订单
    this.currentParamsList = [];
    this.currentParamsInx = 0;
    this.currentSessionId = "";
    this.currentPhone = "";
    this.logger = logger; // 日志模块
    this.platManage = new PlatManage(order, logger, isTestOrder); // 平台管理模块
    this.seatManage = new SeatManage(order, logger, isTestOrder); // 座位管理模块
    this.orderManage = new OrderManage(
      order,
      logger,
      this.platManage,
      isTestOrder
    ); // 订单管理模块
  }
  // 单个订单出票（向外暴漏的唯一方法）
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
          // 转单逻辑待补充
          return await this.orderManage.transferOrder();
        }
      }
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
    }
  }

  // 1、获取影院登录信息并设置当前token
  getCinemaLoginInfo() {
    this.currentParamsList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === this.appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );
    this.logger.infoSave("获取该影院登录信息返回", {
      currentParamsList: this.currentParamsList
    });
    this.currentParamsInx = 0;
    this.currentSessionId =
      this.currentParamsList[this.currentParamsInx].session_id;
    this.currentPhone = this.currentParamsList[this.currentParamsInx].mobile;
  }

  // 2、获取订单报价规则
  async getOrderOfferRule() {
    // 测试专用
    if (this.isTestOrder) {
      // offerRule = { offer_type: "1", quan_value: "35" };
      this.offerRule = {
        offer_type: "2",
        member_price: "18",
        real_member_price: 19.9
      };
      return;
    }
    const { app_name, order_number, plat_name } = this.order;
    try {
      // 1、获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: user_id,
        order_status: "1",
        app_name,
        order_number,
        plat_name
      });
      this.offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logger.errorSave("获取该订单报价记录异常", { error });
    }
  }
  // 3、校验报价规则是否需要出票
  checkOfferRuleRes() {
    const { offerRule } = this;
    if (
      !offerRule ||
      offerRule?.rule_status === "3" ||
      offerRule?.quan_value === "jinbaojia"
    ) {
      let str = "获取该订单报价记录失败，微信通知手动出票";
      if (offerRule?.rule_status === "3") {
        str = "该订单报价规则为仅报价，需手动出票";
      } else if (offerRule?.quan_value === "jinbaojia") {
        str = "该订单报价规则用券类型为仅报价券，需手动出票";
      }
      this.logger.errorSave(str, { offerRule });
      // 发送微信消息
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return false;
    }
    return true;
  }

  // 一键买票核心流程
  async oneClickBuyTicket(changePhoneBuyParams) {
    const { appFlag } = this;
    let buyTicketInfo = JSON.parse(JSON.stringify(changePhoneBuyParams)); // 换号购买参数
    this.logger.infoSave("即将开始一键买票信息", this.order);
    if (buyTicketInfo) {
      this.logger.infoSave("换号出票携带参数信息", buyTicketInfo);
    }
    let {
      order_number,
      lockseat,
      ticket_num,
      supplier_end_price,
      rewards,
      plat_name
    } = this.order;
    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = this.offerRule?.rewards || 0;
    }
    this.cardQuanManage = new CardQuanManage(this.order, this.logger); // 卡券管理模块
    try {
      if (this.currentParamsInx === 0) {
        // 影院信息模块（获取购票前相关信息）
        this.cinemaManage = new CinemaManage(
          this.order,
          this.logger,
          this.offerRule,
          this.currentParamsList
        );

        // 1、获取购票前的影院信息
        buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo({
          cardQuanManage: this.cardQuanManage
        });
        if (!buyTicketInfo) {
          this.logger.infoSave("获取购票前的影院信息失败");
          return await this.orderManage.transferOrder();
        }
        this.logger.infoSave("获取购票前的影院信息返回", buyTicketInfo);
        this.logger.info("targetShow===>", buyTicketInfo.targetShow);
        // 由于登录信息顺序会被cinemaManage.js调整，故需要重新赋值
        this.currentParamsList = buyTicketInfo.currentParamsList;
        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`);
        // 库里维护的可用会员卡列表
        this.usableCardList = buyTicketInfo.usableCardList;
        // 2、获取购票座位信息
        const targetSeatRes =
          await this.seatManage.getTargetSeat(buyTicketInfo);
        if (!targetSeatRes) {
          return await this.orderManage.transferOrder();
        }
        buyTicketInfo.targetSeatCodes = targetSeatRes.seatCodes;
        buyTicketInfo.areaInfoList = targetSeatRes.areaInfoList;
      } else {
        // 换号出票操作（取消上个号的订单）
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinemaLinkId: buyTicketInfo.cinemaLinkId,
          lockOrderId: buyTicketInfo.lockOrderId,
          order_num: buyTicketInfo.order_num,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (buyTicketInfo.order_num) {
          isCancel = await this.orderManage.cancelOrder(unlockSeatInfo);
        } else {
          isCancel = await this.orderManage.releaseSeat(unlockSeatInfo);
        }
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          return await this.orderManage.transferOrder();
        }
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        // 换号时恢复原先券类型
        if (this.offerRule.old_quan_value) {
          this.offerRule.quan_value = this.offerRule.old_quan_value;
        }
      }
      this.currentSessionId =
        this.currentParamsList[this.currentParamsInx].session_id;
      this.currentPhone = this.currentParamsList[this.currentParamsInx].mobile;
      this.currentMemberPwd =
        this.currentParamsList[this.currentParamsInx].member_pwd;
      // 锁定座位前延迟一秒
      // await mockDelay(1);
      const {
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        targetShow,
        targetSeatCodes,
        areaInfoList
      } = buyTicketInfo;
      this.logger.infoSave("座位价格相关信息", {
        areaInfoList
      });
      // 3、锁定座位
      let lockSeatParams = {
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        seatCodes: targetSeatCodes.map(item => item.seatCode),
        lockseat,
        plat_name,
        order_number,
        session_id: this.currentSessionId
      };
      const lockRes = await this.seatManage.lockseatByApp(lockSeatParams);
      if (!lockRes) {
        return await this.orderManage.transferOrder();
      }
      buyTicketInfo.lockOrderId = lockRes.lockOrderId;
      const { lockOrderId } = buyTicketInfo;
      // 4、使用优惠券或者会员卡（仅判断是否有可用卡及券）
      // 座位支付总价格
      let seatPayTotalPrice = this.cardQuanManage.getSeatPrice({
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        seats: JSON.stringify(
          targetSeatCodes.map(item => ({
            areaId: item.areaId,
            seatCode: item.seatCode
          }))
        ),
        fenghuangToken: this.currentSessionId
      });
      seatPayTotalPrice = seatPayTotalPrice / 100;
      const cardQuanRes = await this.cardQuanManage.useQuanOrCard({
        buyTicketInfo,
        offerRule: this.offerRule,
        seatPayTotalPrice,
        rewards,
        session_id: this.currentSessionId,
        currentPhone: this.currentPhone,
        usableCardList: this.usableCardList
      });
      this.logger.infoSave("用卡用券返回", cardQuanRes);
      let {
        card_id = "",
        cardNum,
        useQuan = [],
        profit = 0,
        quanStock
      } = cardQuanRes || {};
      // 由于offerRule可能被useQuanOrCard调整，后续使用地方需注意
      let { offerRule } = this;
      const { offer_type } = offerRule;
      if (!card_id && !useQuan?.length) {
        let errMsg = this.logger.getLastErrMsg();
        let str = offer_type === "1" ? "无可用优惠券" : "无可用会员卡";
        if (errMsg) {
          str = str + "-" + errMsg;
        }
        this.logger.errorSave(str, {
          supplier_end_price,
          ticket_num
        });
        // 转单或换号处理
        const transparams = {
          cinemaLinkId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 5、计算价格
      let quan_code = useQuan.map(item => ({
        promotionType: "COUPON",
        promoCode: item.couponCode,
        productType: "TICKET"
      }));
      const calcRes = await this.orderManage.pripriceCalculation({
        ...buyTicketInfo,
        cardNum,
        promotions: JSON.stringify(quan_code),
        session_id: this.currentSessionId
      });
      if (!calcRes) {
        this.logger.info("计算价格异常，走转单或换号处理");
        // 转单或换号处理
        const transparams = {
          cinemaLinkId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 实际支付价格
      const paymentAmount =
        (calcRes?.settlement?.totalDiscountedPrice || 0) / 100;
      this.logger.infoSave("实际支付价格", { paymentAmount });
      // 6、校验是否可以创建订单
      // 用券时总价为0
      if (offer_type === "1") {
        if (offerRule.quan_fee > 0) {
          this.logger.infoSave("券补钱总价计算相关信息", {
            quan_fee: offerRule.quan_fee,
            paymentAmount,
            ticket_num
          });
        }
        // yaolai绑券逻辑不一样，暂不处理
        if (offerRule.is_store == "1" && useQuan.length - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.cardQuanManage.getNewQuan({
            cinemaLinkId,
            quanValue: offerRule.quan_value,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (useQuan.length - Number(ticket_num)),
            session_id: this.currentSessionId,
            asyncFlag: 1
          });
        }
      }
      if (this.isTestOrder) {
        this.logger.infoSave("测试单暂不购买");
        return { offerRule };
      }
      // 支付前校验用券价格
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (
        offer_type === "1" &&
        useQuan?.length &&
        paymentAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee,
          ticket_num
        });
        // 转单或换号处理
        const transparams = {
          cinemaLinkId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (paymentAmount > real_member_price) {
          this.logger.errorSave("用完卡发现支付金额大于会员价*票数，走转单", {
            paymentAmount,
            real_member_price,
            ticket_num
          });
          // 转单或换号处理
          const transparams = {
            cinemaLinkId,
            lockOrderId,
            session_id: this.currentSessionId
          };
          return await this.transferOrChangePhone(transparams, buyTicketInfo);
        } else if (paymentAmount < real_member_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_price * 1000 - paymentAmount * 1000) *
              member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
      }
      // 7、创建订单
      let payments = [];
      let paymentsList = calcRes?.settlement?.payments;
      let promotions = [];
      if (offer_type === "1" && useQuan?.length && !quan_fee_total) {
        promotions = calcRes.settlement.promotions;
        if (promotions?.length) {
          promotions[0].productType = "TICKET";
        }
        let payInfo = paymentsList?.find(
          item => item.paymentType === "WECHAT_MINI_PROGRAM"
        );
        if (payInfo) {
          payments.push({
            paymentType: payInfo.paymentType,
            payAmount: 0,
            payConfigId: payInfo.payConfigId,
            // payCode: "0b3Oq1ll2VFCYf4Gznnl2FQ3SI1Oq1lP" // 需要破解生成逻辑
            payCode: randomNumByLength(32) // 生成32位随机字符串作为支付码
          });
        }
      } else if (offer_type === "2" && card_id) {
        promotions = calcRes.settlement.promotions;
        let payInfo = paymentsList?.find(item => item.cardNo === cardNum);
        if (payInfo) {
          payments.push({
            paymentType: payInfo.paymentType,
            payCode: payInfo.cardNo,
            payToken: window.getPayToken(this.currentMemberPwd),
            payAmount: calcRes.settlement.totalDiscountedPrice
          });
        }
      }

      const createOrderRes = await this.orderManage.createOrder({
        cinemaLinkId,
        cardNum,
        lockOrderId,
        cinemaLinkId,
        scheduleKey,
        scheduleId,
        lockOrderId,
        seats: JSON.stringify(
          targetSeatCodes.map(item => ({
            areaId: item.areaId,
            seatCode: item.seatCode
          }))
        ),
        totalOriginalPrice: calcRes.settlement.totalOriginalPrice,
        totalPayAmount: calcRes.settlement.totalDiscountedPrice,
        promotions: JSON.stringify(promotions),
        payments: JSON.stringify(payments),
        phoneNumber: this.currentPhone,
        session_id: this.currentSessionId
      });
      let order_num = createOrderRes?.orderId;
      if (!order_num) {
        this.logger.info("创建订单失败，单个订单直接出票结束走转单");
        // 转单或换号处理
        const transparams = {
          cinemaLinkId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      this.logger.infoSave("创建订单支付成功", {
        order_num,
        profit,
        card_id,
        offerRule
      });
      buyTicketInfo.order_num = order_num;
      if (card_id) {
        // 更新卡使用量
        updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number
        });
      }
      if (offerRule.offer_type === "1" && useQuan?.length) {
        // 更新券库存
        this.cardQuanManage.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.currentPhone
        });
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.orderManage.getQrcodeUploadByPlat({
        order_num,
        session_id: this.currentSessionId
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      console.log("一键买票完成");
      if (profit) {
        profit = Number(profit).toFixed(2);
      }
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code: quan_code?.join(),
        card_id,
        cardNum,
        offerRule,
        mobile: this.currentPhone
      };
    } catch (error) {
      this.logger.errorSave("一键买票异常", formatErrInfo(error));
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: JSON.stringify(error)
      });
      return { offerRule: this.offerRule };
    }
  }

  // 转单或换号处理
  async transferOrChangePhone(params, buyTicketInfo) {
    const { offerRule, currentParamsInx, currentParamsList } = this;
    if (currentParamsInx === currentParamsList.length - 1) {
      const transferParams = await this.orderManage.transferOrder(params);
      return { offerRule, transferParams };
    } else {
      this.logger.infoSave("非最后一次用卡用券失败，走换号");
      this.currentParamsInx++;
      return await this.oneClickBuyTicket(buyTicketInfo);
    }
  }
}
// 更新卡当天使用量
const updateCardDayUse = ({ app_name, card_id, plat_name, order_number }) => {
  let error;
  try {
    svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id
    });
  } catch (err) {
    error = err;
  }
  let logger = new Logger({ logType: 3 });
  logger.init({
    plat_name,
    app_name,
    order_number
  });
  logger.infoSave("订单用卡购买后更新当天使用量", {
    app_name,
    card_id,
    error
  });
  logger.logUpload();
};
