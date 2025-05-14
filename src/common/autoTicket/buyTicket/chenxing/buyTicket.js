// 买票主流程
import {
  getCurrentTime,
  formatTimeOfTime,
  convertFullwidthToHalfwidth,
  getTargetCinema,
  mockDelay, // 模拟延时
  logUpload, // 日志上传
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  findMostRepeatedChars,
  couponInfoSpecial
} from "@/utils/utils";
import svApi from "@/api/sv-api";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
import SeatManage from "./seatManage";
import OrderManage from "./orderManage";
import CinemaManage from "./cinemaManage";
import PlatManage from "./platManage";
export default class BuyTicket {
  constructor(order, logger, isTestOrder, offerRule) {
    this.appFlag = order.app_name; // 影线标识
    this.order = order; // 订单信息
    this.offerRule = offerRule; // 订单信息
    this.isTestOrder = isTestOrder; // 是否是测试订单
    this.currentParamsList = [];
    this.currentParamsInx = 0;
    this.currentSessionId = "";
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
    this.logger.warn("单个待出票订单信息", this.order);
    // 1、获取影院登录信息并设置当前token
    this.getCinemaLoginInfo();
    // 2、获取该订单报价规则
    await this.getOrderOfferRule();
    this.logger.infoSave("订单报价记录信息", {
      offerRule: this.offerRule
    });
    // 3、校验报价规则是否允许出票
    const isNeedBuyTicket = this.checkOfferRuleRes();
    if (!isNeedBuyTicket) {
      return {
        offerRule: this.offerRule
      };
    }
    // 4、平台解锁座位（测试单无需解锁）
    if (!this.isTestOrder) {
      const unlockRes = await this.platManage.unlockSeatByPlat(order);
      if (!unlockRes) {
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
    // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
    if (result) {
      console.warn("单个订单出票完成");
      return result;
    } else {
      console.warn("单个订单出票失败");
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
    this.currentSessionId = this.currentParamsList[this.currentParamsInx];
  }

  // 2、获取订单报价规则
  async getOrderOfferRule() {
    // 测试专用
    if (this.isTestOrder) {
      // offerRule = { offer_type: "1", quan_value: "35" };
      this.offerRule = { offer_type: "2", member_price: "29.9" };
      return;
    }
    const { appFlag, order_number, plat_name } = this.order;
    try {
      // 1、获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: user_id,
        order_status: "1",
        app_name: appFlag,
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
    let buyTicketInfo = changePhoneBuyParams; // 换号购买参数
    this.logger.info("即将开始一键买票信息", this.order);
    let {
      id: order_id,
      order_number,
      lockseat,
      ticket_num,
      supplier_end_price,
      rewards,
      supplierCode,
      plat_name,
      otherParams
    } = this.order;
    // otherParams主要是为了换号出票时不用再走之前流程
    let {
      cinemaLinkId,
      filmUniqueId,
      scheduleId,
      scheduleKey,
      seatList,
      areaInfoList,
      targeSeatList,
      showDate,
      orderCode,
      orderDate,
      orderHeaderId,
      lockOrderId,
      total_price,
      ticketDetail,
      offerRule,
      targetShow
    } = otherParams || {};
    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = this.offerRule?.rewards || 0;
    }
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
        buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo();
        if (!buyTicketInfo) {
          this.logger.infoSave("获取购票前的影院信息失败");
          return await this.orderManage.transferOrder();
        }
        this.logger.infoSave("获取购票前的影院信息返回", buyTicketInfo);
        this.logger.info("targetShow===>", buyTicketInfo.targetShow);
        // 由于登录信息顺序会被cinemaManage.js调整，故需要重新赋值
        this.currentParamsList = buyTicketInfo.currentParamsList;
        this.currentSessionId = this.currentParamsList[this.currentParamsInx];
        // 2、获取购票座位信息
        const targetSeatCodes =
          await this.seatManage.getTargetSeat(buyTicketInfo);
        buyTicketInfo.targetSeatCodes = targetSeatCodes;
      } else {
        // 换号出票操作（取消上个号的订单）
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinemaCode: buyTicketInfo.cinemaCode,
          cinemaId: buyTicketInfo.cinemaId,
          lockOrderId: buyTicketInfo.lockOrderId,
          orderHeaderId: buyTicketInfo.createOrderId,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (buyTicketInfo.createOrderId) {
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
        this.curPhone = phone;
      }
      this.currentSessionId =
        this.currentParamsList[this.currentParamsInx].session_id;
      // 锁定座位前延迟一秒
      // await mockDelay(1);
      const { cinemaCode, cinemaId, filmId, targetShow, targetSeatCodes } =
        buyTicketInfo;
      const { featureAppNo } = targetShow;
      // 3、锁定座位
      let lockSeatParams = {
        cinemaCode,
        cinemaId,
        filmId,
        unifiedCode: cinemaCode,
        featureAppNo,
        seatInfos: targetSeatCodes,
        seatList,
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
      // orderDate = lockRes.autoUnlockDatetime;
      // 4、使用优惠券或者会员卡
      const { standardPrice, serviceAddFee } = targetShow;
      console.warn("standardPrice", standardPrice);
      let {
        card_id = "",
        cardNum,
        useQuan = [],
        profit = 0,
        quanStock
      } = await this.useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        handlingFee: serviceAddFee, // 手续费
        rewards,
        appFlag,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        cinemaCode,
        cinemaLinkId,
        plat_name
      });
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      // 券抵扣金额
      let quanDiscountAmount = useQuan?.[0]?.discountAmount || 0;
      // 使用优惠券及会员卡
      if (!card_id && !useQuan?.length) {
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        let str = "无可用会员卡";
        if (offerRule.offer_type === "1") {
          str = "无可用优惠券";
        }
        if (errMsg) {
          str = str + "-" + errMsg;
        }
        console.error(str);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: str,
          level: "error",
          info: {
            cardList,
            quanList: quanList.slice(0, 10),
            supplier_end_price,
            ticket_num
          }
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaId,
            lockOrderId
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "非最后一次用卡用券失败，走换号",
            levle: "info"
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              orderHeaderId,
              cinemaLinkId,
              cinemaCode,
              filmUniqueId,
              scheduleId,
              scheduleKey,
              showDate,
              ticketDetail,
              offerRule,
              targetShow,
              areaInfoList,
              targeSeatList
            }
          });
        }
      }
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        if (offerRule.quan_fee > 0) {
          total_price =
            (+areaSettlePriceMin + handlingFee - quanDiscountAmount) / 100 || 0;
          total_price = (total_price * 1000 * ticket_num) / 1000;
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "券补钱总价计算相关信息",
            level: "info",
            info: {
              total_price,
              quan_fee: offerRule.quan_fee,
              areaSettlePriceMin,
              handlingFee,
              quanDiscountAmount,
              ticket_num
            }
          });
        } else {
          total_price = 0;
        }
        // yaolai绑券逻辑不一样，暂不处理
        if (offerRule.is_store == "1" && quanList.length - ticket_num < 15) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "本次出票后券小于15，开始异步绑定券",
            level: "info"
          });
          this.getNewQuan({
            cinemaCode,
            cinemaLinkId,
            quanValue: offerRule.quan_value,
            black_quans: offerRule.black_quans,
            quanNum: 15 - (quanList.length - Number(ticket_num)),
            session_id:
              this.currentParamsList[this.currentParamsInx].session_id,
            asyncFlag: 1,
            asyncBandQuanList: [],
            plat_name,
            order_number
          });
        }
      } else {
        // 座位价格-卡优惠价格
        let card_discount_price =
          cardList.find(item => item.cardNo == card_id)?.discountAmount || 0;
        card_discount_price = card_discount_price / 100;
        total_price = originalAmount - card_discount_price;
      }

      // 7、创建订单
      const createOrderRes = await this.createOrder({
        cinemaCode,
        cinemaLinkId,
        orderHeaderId,
        coupon: useQuan,
        card_id,
        activityId,
        total_price,
        cardList,
        timestamp
      });
      let order_num = createOrderRes?.payOrderCode;
      let paymentAmount = createOrderRes?.paymentAmount;
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let cardNo, paymentWay;
      // 纯用券不补钱是优惠券，只要补钱或者纯用卡就是会员卡
      if (!quan_fee && offerRule.offer_type == 1) {
        paymentWay =
          createOrderRes?.paymentList?.find(item => item.paymentWayId == 3)
            ?.paymentMethodCode || "Z0010";
      } else {
        paymentWay =
          createOrderRes?.paymentList?.find(item => item.paymentWayId == 2)
            ?.paymentMethodCode || "Z0006";
      }
      if (paymentAmount > 0 && quan_fee > 0 && offerRule.offer_type == 1) {
        // 支付方式里返回的有会员卡方式和可用列表
        let memberCardList =
          createOrderRes?.paymentList?.find(item => item.memberCardList)
            ?.memberCardList || [];
        memberCardList = memberCardList.filter(
          item => item.cardAmount >= quan_fee * 100 * ticket_num
        );
        // 取最大余额
        memberCardList = memberCardList.sort(
          (a, b) => b.cardAmount - a.cardAmount
        );
        cardNo = memberCardList[0]?.cardNo;
        if (!cardNo) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "创建订单时发现没有可以补券手续费的卡，走转单",
            level: "error",
            info: {
              paymentList: createOrderRes?.paymentList,
              quan_fee
            }
          });
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (!order_num) {
        console.error("创建订单失败，单个订单直接出票结束", "走转单逻辑");
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaId,
          lockOrderId
        });
        return { offerRule, transferParams };
      }
      console.warn("创建订单成功", order_num, profit, card_id, offerRule);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单成功",
        level: "info"
      });
      if (this.isTestOrder) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "测试单暂不购买",
          level: "info"
        });
        return { offerRule };
      }
      // 支付前校验用券价格
      if (
        offerRule.offer_type === "1" &&
        useQuan?.length &&
        paymentAmount > quan_fee_total
      ) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "用完券发现支付金额大于券手续费*票数，走转单",
          level: "error",
          info: {
            paymentAmount,
            quan_fee,
            ticket_num
          }
        });
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (paymentAmount > real_member_price) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "用完卡发现支付金额大于会员价*票数，走转单",
            level: "error",
            info: {
              paymentAmount,
              real_member_price,
              ticket_num
            }
          });
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
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
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        cinemaCode,
        cinemaLinkId,
        card_id,
        useQuan,
        paymentWay,
        cardNo,
        orderHeaderId,
        orderCode,
        orderDate,
        appFlag,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "订单购买返回",
        level: "info",
        info: buyTicketRes
      });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        console.error("订单购买失败，单个订单直接出票结束", "走转单逻辑");
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "订单购买返回超时当成功处理",
            level: "info",
            info: buyTicketRes
          });
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "订单购买失败",
            level: "error",
            info: {
              error: buyTicketRes?.error
            }
          });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "订单购买成功",
        level: "info"
      });
      // 此处是为了解决创建订单时card_id是cardNo，更新卡使用量是用的card_id是cardInstanceId，要和后台会员卡列表维护那的id保持一致
      if (card_id) {
        card_id =
          cardList.find(item => item.cardNo === card_id)?.cardInstanceId || "";
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
        this.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.curPhone,
          isPay: 1
        });
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.lastHandle({
        orderHeaderId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        orderInfo: item,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单最后处理成功:获取取票码并上传",
          level: "info"
        });
      }
      console.log("一键买票完成");
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code,
        card_id,
        cardNum,
        offerRule
      };
    } catch (error) {
      console.error("一键买票异常", error, this.logList);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "一键买票异常",
        level: "error",
        info: {
          error
        }
      });
      sendWxPusherMessage({
        plat_name: item.plat_name,
        order_number: item.order_number,
        city_name: item.city_name,
        cinema_name: item.cinema_name,
        film_name: item.film_name,
        show_time: item.show_time,
        lockseat: item.lockseat,
        hall_name: item.hall_name,
        supplier_end_price: item.supplier_end_price,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: JSON.stringify(error)
      });
      return { offerRule };
    }
  }
}
