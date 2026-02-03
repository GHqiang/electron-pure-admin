/**
 * H5UME出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现 H5UME 系列出票逻辑
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - H5UmeCinemaManage: 影院管理模块
 * - H5UmeSeatManage: 座位管理模块
 * - H5UmeOrderManage: 订单管理模块
 * - H5UmeCardQuanManage: 卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module h5ume/buyTicket
 */
import {
  formatErrInfo,
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  subDecimal,
  trial,
  mockDelay
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import H5UmeSeatManage from "./seatManage.js";
import H5UmeOrderManage from "./orderManage.js";
import H5UmeCinemaManage from "./cinemaManage.js";
import H5UmeCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";

const tokens = platTokens();

export default class H5UmeBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
    this.usableCardList = [];
    this.curPhone = "";
  }

  /**
   * 初始化依赖模块
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
    this.cinemaManage = new H5UmeCinemaManage(this.order, this.logger);
    this.seatManage = new H5UmeSeatManage(
      this.order,
      this.logger,
      this.isTestOrder
    );
    const getCurrentParams = () => ({
      list: this.currentParamsList,
      inx: this.currentParamsInx
    });
    this.orderManage = new H5UmeOrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder,
      getCurrentParams
    );
    this.cardQuanManage = new H5UmeCardQuanManage(this.order, this.logger);
    // 设置 seatManage 的 getCurrentParams
    this.seatManage.setGetCurrentParams(getCurrentParams);
    // 设置 cardQuanManage 的 isTestOrder
    this.cardQuanManage.setIsTestOrder(this.isTestOrder);
  }

  /**
   * 获取影院登录信息并设置当前token
   */
  async getCinemaLoginInfo() {
    const { appFlag } = this;
    const targetLoginList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );

    this.currentParamsList = targetLoginList.sort((a, b) => {
      // 优先按 first 字段排序
      if (a.first === "1" && b.first !== "1") return -1;
      if (a.first !== "1" && b.first === "1") return 1;

      // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
      if (a.first === "1" && b.first === "1") {
        if (a.mobile === tokens.userInfo?.phone) return -1;
        if (b.mobile === tokens.userInfo?.phone) return 1;
        return 0;
      }

      // 如果 first 都不是 '1'，则按 mobile 字段排序
      if (a.mobile === tokens.userInfo?.phone) return -1;
      if (b.mobile === tokens.userInfo?.phone) return 1;

      return 0;
    });
    this.logger.infoSave("获取该影院登录信息返回", {
      targetLoginList,
      currentParamsList: this.currentParamsList
    });
    this.currentParamsInx = 0;
    this.currentSessionId =
      this.currentParamsList[this.currentParamsInx]?.session_id || "";
    this.currentPhone =
      this.currentParamsList[this.currentParamsInx]?.mobile || "";
  }

  // getOrderOfferRule 和 checkOfferRuleRes 已提取到基类 BaseBuyTicket

  /**
   * 一键买票核心流程
   */
  async oneClickBuyTicket(item) {
    const { appFlag } = this;
    this.logger.info("一键买票待下单信息", item);
    let {
      id: order_id,
      order_number,
      city_name,
      cinema_name,
      cinema_code,
      film_name,
      hall_name,
      show_time,
      lockseat,
      ticket_num,
      supplier_end_price,
      rewards,
      supplierCode,
      plat_name,
      otherParams
    } = item;
    // otherParams主要是为了换号出票时不用再走之前流程
    let {
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds, // 锁定座位id
      areaTotalPrice = 0,
      seatList,
      lockOrderId, // 锁座返回订单id，用于创建订单
      orderId, // 创建订单返回订单id
      total_price,
      offerRule,
      targetShow
    } = otherParams || {};
    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = offerRule?.rewards || 0;
    }
    try {
      if (this.currentParamsInx === 0) {
        // 首次出票：获取影院、电影、场次、座位信息
        // 2、获取目标城市影院列表
        let cityCinemaList = await this.cinemaManage.getCityCinemaList();
        if (!cityCinemaList?.length) {
          this.logger.errorSave("获取城市影院列表失败");
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        let cinemaList =
          cityCinemaList?.map(item => item.cinemaList)?.flat() || [];
        if (!cinemaList?.length) {
          this.logger.errorSave("获取全部影院列表失败", {
            cityCinemaList
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        // 3、获取目标影院
        let targetCinema = cinemaList.find(
          item => cinema_code && item.cinemaCode === cinema_code
        );
        if (!targetCinema) {
          targetCinema = getTargetCinemaCommon({
            app_name: appFlag,
            plat_cinema_code: cinema_code,
            cinema_list: cinemaList
          });
        }
        if (!targetCinema) {
          this.logger.errorSave("获取目标影院失败", {
            cinema_name,
            cinemaList,
            appFlag,
            city_name
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        cinemaLinkId = targetCinema.cinemaLinkId;
        if (cinemaLinkId) {
          if (offerRule.offer_type != 1) {
            const usableCards = await this.cardQuanManage.getUsableCardList(
              cinemaLinkId,
              ticket_num
            );
            if (usableCards?.length) {
              this.usableCardList = usableCards;
              let cardLinkMobile = usableCards.map(item => item.mobile);
              this.currentParamsList = this.currentParamsList.sort((a, b) => {
                if (
                  cardLinkMobile.includes(a.mobile) &&
                  !cardLinkMobile.includes(b.mobile)
                ) {
                  return -1; // a靠前
                }
                if (
                  !cardLinkMobile.includes(a.mobile) &&
                  cardLinkMobile.includes(b.mobile)
                ) {
                  return 1;
                }
                return 0;
              });
            }
            this.logger.infoSave("登录信息按照可用卡列表排序后", {
              currentParamsList: this.currentParamsList
            });
          } else {
            const sortMobileList =
              await this.cardQuanManage.getSortPhoneByQuanTypeList(
                appFlag,
                offerRule?.quan_flag,
                offerRule?.quan_value,
                ticket_num
              );
            if (sortMobileList?.length) {
              this.currentParamsList = this.currentParamsList.sort((a, b) => {
                const indexA = sortMobileList.indexOf(a.mobile);
                const indexB = sortMobileList.indexOf(b.mobile);
                if (indexA !== -1 && indexB === -1) return -1;
                if (indexA === -1 && indexB !== -1) return 1;
                return 0;
              });
              this.logger.infoSave("登录信息按照可用券数量关联手机号排序后", {
                currentParamsList: this.currentParamsList,
                sortMobileList
              });
            }
          }
        }
        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`);
        this.curPhone = phone;
        this.cardQuanManage.curPhone = phone;
        // 4、获取目标影院放映列表
        const movie_data = await this.cinemaManage.getMoviePlayInfo({
          cinemaLinkId
        });

        if (!movie_data?.length) {
          this.logger.errorSave("获取目标影院放映列表失败");
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        this.logger.infoSave("获取影院放映信息成功");
        // 5、获取目标影片信息
        let movieInfo = getMovieInfoFromFilmName({
          filmName: film_name,
          movieData: movie_data?.map(item => ({
            ...item,
            filmName: item.filmName
          }))
        });
        if (!movieInfo) {
          this.logger.errorSave("获取目标影片信息失败", {
            film_name,
            movie_data
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        // 6、获取目标影片的放映日期
        const { filmId } = movieInfo;
        const playDateList = await this.cinemaManage.getMoviePlayDate({
          cinemaLinkId,
          filmId
        });
        if (!playDateList?.length) {
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        let targetShowInfo = playDateList?.find(item =>
          item.schedules?.some(
            itemA => +new Date(+itemA.showTime) === +new Date(show_time)
          )
        );
        // 获取某个放映日期的场次列表
        const showList = targetShowInfo?.schedules || [];
        let start_time = show_time.split(" ")[1].slice(0, 5);
        // 解决同一时间多场次问题
        let targetShowList = showList.filter(
          itemA => +new Date(+itemA.showTime) === +new Date(show_time)
        );
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hallName,
              hall_name,
              "hall_name"
            );
            return {
              ...item,
              ...repeatedCharsResult
            };
          });
          targetShowList = targetShowList.sort(
            (a, b) => b.similarity - a.similarity
          );
          targetShow = targetShowList[0];
          this.logger.infoSave("同一时间多场次", { targetShowList });
        }
        if (!targetShow) {
          this.logger.errorSave("匹配影片放映日期失败", {
            showList,
            start_time
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        this.logger.infoSave("出票时获取电影放映信息", { targetShow });
        // 8、获取座位布局
        hallId = targetShow.hallId;
        scheduleId = targetShow.scheduleId;
        scheduleKey = targetShow.scheduleKey;
        const areaRes = await this.seatManage.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey,
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        seatList = areaRes?.seats || [];
        let areaInfoList = areaRes?.areaInfos || [];
        areaInfoList = areaInfoList.map(item => {
          let settlePrice = item.areaPrice || 0 + (item.sareaServiceFee || 0);
          return {
            ...item,
            settlePrice,
            areaSettlePrice: settlePrice
          };
        });
        if (!seatList?.length) {
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        // 9、匹配作为ids
        const targetSeatRes = await this.seatManage.getTargetSeat({
          lockseat,
          seatList,
          ticket_num,
          areaInfoList
        });
        if (targetSeatRes?.error || !targetSeatRes?.targeSeatList) {
          this.logger.errorSave("获取目标座位失败", {
            error: targetSeatRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        seatIds = targetSeatRes.seatIds;
        areaTotalPrice = targetSeatRes.areaTotalPrice;
      } else {
        // 换号出票
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinemaLinkId,
          orderId,
          lockOrderId,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (orderId) {
          isCancel = await this.orderManage.cancelOrder(unlockSeatInfo);
        } else {
          isCancel = await this.orderManage.releaseSeat(unlockSeatInfo);
        }
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          const transferParams =
            await this.orderManage.transferOrder(unlockSeatInfo);
          return { offerRule, transferParams };
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
        if (offerRule.old_quan_value) {
          offerRule.quan_value = offerRule.old_quan_value;
        }
        this.curPhone = phone;
        this.cardQuanManage.curPhone = phone;
      }
      // 4、锁定座位
      let params = {
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.map(item => item.seatId).join("|"),
        seatList,
        lockseat,
        plat_name,
        order_number
      };
      let lockRes;
      try {
        lockRes = await this.seatManage.lockSeatHandle(params); // 锁定座位
      } catch (error) {
        this.logger.error("锁定座位失败准备试错2次，间隔5秒", error);
        // 非这两种情况才需要走重试，这两种情况已经走帮助锁座逻辑了
        let isTrial = !["座位旁边不要留空", "座位中间不要留空"].includes(
          error?.msg
        );
        if (isTrial) {
          // 试错3次，间隔5秒
          // 锁定座位尝试配置
          let delayConfig = {
            lieren: [10, 5],
            mangguo: [10, 5],
            sheng: [10, 5],
            mayi: [10, 5],
            yangcong: [10, 5],
            haha: [6, 5],
            yinghuasuan: [6, 5],
            shangzhan: [6, 5],
            shoutu: [20, 12],
            mahua: [10, 5]
          };
          lockRes = await trial(
            inx => this.seatManage.lockSeatHandle(params, inx),
            delayConfig[plat_name]?.[0] || 10,
            delayConfig[plat_name]?.[1] || 5
          );
        }
        if (!lockRes) {
          if (isTrial) {
            this.logger.infoSave("首次锁定座位失败轮询尝试后仍失败，走转单");
          }
          const transferParams = await this.orderManage.transferOrder({
            cinemaLinkId,
            lockOrderId
          });
          return { offerRule, transferParams };
        }
        if (isTrial) {
          this.logger.infoSave("首次锁定座位失败试错后锁定成功");
        }
      }

      lockOrderId = lockRes?.lockOrderId;
      const orderInfoRes = await this.orderManage.getOptimalCardQuanCompose({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.map(item => item.seatId).join("|"),
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      if (!orderInfoRes) {
        this.logger.error("获取最优卡券组合失败");
        const transferParams = await this.orderManage.transferOrder({
          cinemaLinkId,
          lockOrderId
        });
        return { offerRule, transferParams };
      }
      let cardList = orderInfoRes?.cards || [];
      cardList = JSON.parse(JSON.stringify(cardList));
      if (cardList?.length && offerRule.offer_type != "1") {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(
              itemA => itemA.card_num === item.cardNumber
            )
          );
        }
      }
      const { canUseCoupon, preferCoupons } =
        orderInfoRes?.preferCouponInfo || {};
      let quanList = canUseCoupon ? preferCoupons || [] : [];
      // USEFUL 表示优惠券有效且可用，CANCEL 表示优惠券已被取消或不可用
      quanList = quanList.filter(item => item.state == "USEFUL");
      let activities = orderInfoRes?.privileges || [];
      this.logger.infoSave("获取最优卡券组合返回", {
        "cardList(从可用卡列表过滤后的卡:)": cardList?.map(item => ({
          cardNumber: item.cardNumber,
          balance: item.balance
        })),
        oldCardList: orderInfoRes?.cards?.map(item => ({
          cardNumber: item.cardNumber,
          balance: item.balance,
          cardName: item.cardName,
          cinemaLinkId: item.cinemaLinkId
        })),
        quanList: quanList.slice(0, 10),
        activities,
        canUseCoupon,
        preferCoupons: preferCoupons?.slice(0, 10)
      });
      // 原总价
      total_price = activities.find(
        item => item.payMethod === ""
      )?.originalTicketTotalPrice;
      // 7、使用优惠券或者会员卡
      let member_discount_list = activities.filter(
        item => item.cardInfos?.length
      );
      if (member_discount_list.length) {
        this.logger.infoSave("会员卡支付-优惠活动列表", {
          member_discount_list: JSON.parse(JSON.stringify(member_discount_list))
        });
        member_discount_list = member_discount_list.filter(item => {
          let privilegeTotalPrice = item.privilegeTotalPrice;
          // cardInfos里面可能有多个卡号，要保证有卡余额大于活动时的支付价格
          let cardInfos = item.cardInfos.map(itemC => ({
            ...itemC,
            balance: cardList.find(
              itemA => itemA.cardNumber == itemC.cardNumber
            )?.balance
          }));
          return cardInfos.some(item => item.balance >= privilegeTotalPrice);
        });
        this.logger.infoSave("会员卡支付-优惠活动列表（根据卡余额过滤后）", {
          member_discount_list: JSON.parse(JSON.stringify(member_discount_list))
        });
        // 从小到大排序
        member_discount_list = member_discount_list.sort(
          (a, b) => a.privilegeTotalPrice - b.privilegeTotalPrice
        );
      }
      let target_card_info = member_discount_list[0];
      let member_total_price, cardInfos;
      if (target_card_info) {
        // 非固定报价时总价才会优惠活动的原总价
        if (offerRule.offer_type != "1") {
          total_price = target_card_info.originalTicketTotalPrice;
        }
        member_total_price = target_card_info.privilegeTotalPrice;
        cardInfos = target_card_info.cardInfos;
        cardInfos = cardInfos.map(itemC => ({
          ...itemC,
          balance: cardList.find(itemA => itemA.cardNumber == itemC.cardNumber)
            ?.balance
        }));
        // 从大到小排序
        cardInfos = cardInfos.sort((a, b) => b.balance - a.balance);
      }
      // 如果会员价为0时，取报价记录里的真实会员价
      if (member_total_price === undefined && offerRule.offer_type != "1") {
        member_total_price =
          (offerRule.real_member_price * 1000 * 100 * ticket_num) / 1000;
      }
      this.logger.infoSave("会员总价计算相关信息", {
        total_price,
        member_total_price,
        ticket_num,
        real_member_price: offerRule.real_member_price,
        cardInfos
      });
      let {
        card_id,
        cardNum,
        profit = 0,
        useQuan = [],
        quanStock
      } = await this.cardQuanManage.useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        total_price,
        member_total_price, // 会员总价
        rewards,
        appFlag,
        cinemaLinkId,
        plat_name,
        getCurrentParams: () => ({
          list: this.currentParamsList,
          inx: this.currentParamsInx
        }),
        currentParamsInx: this.currentParamsInx
      });
      this.logger.infoSave("使用会员卡或优惠券返回", {
        card_id,
        useQuan,
        profit,
        quanStock
      });
      let failMsg;
      if (offerRule.offer_type === "1") {
        if (!useQuan?.length) {
          failMsg = "无可用优惠券";
        }
        if (offerRule.quan_fee > 0 && !card_id && useQuan?.length) {
          failMsg = "无可补券手续费的会员卡";
        }
      } else {
        if (!card_id) {
          failMsg = "无可用会员卡";
        }
      }
      // 使用优惠券及会员卡
      if (failMsg) {
        let { err_msg: errMsg, err_info: errInfo } =
          this.logger.getLastErrMsgAndInfo();
        if (errMsg) {
          failMsg = failMsg + "-" + errMsg;
        }
        this.logger.errorSave(failMsg, {
          cardList,
          quanList: quanList.slice(0, 10),
          supplier_end_price,
          ticket_num,
          total_price,
          activities
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.orderManage.transferOrder({
            cinemaLinkId,
            lockOrderId
          });
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              cinemaLinkId,
              hallId,
              scheduleId,
              lockOrderId,
              scheduleKey,
              seatIds,
              areaTotalPrice,
              seatList,
              offerRule,
              targetShow
            }
          });
        }
      }
      let payAmount = member_total_price; // 会员支付价
      // 个人中心用券时
      let quanDiscountAmount =
        quanList?.[0]?.discountValue || useQuan?.[0]?.discountAmount || 0;
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        if (offerRule.quan_fee > 0) {
          // 支付价格要乘以100
          payAmount = (+offerRule.quan_fee * 1000 * ticket_num) / 10 || 0;
          let realPayAmount = (quanDiscountAmount * 1000 * ticket_num) / 1000;
          this.logger.infoSave("券补钱总价计算相关信息", {
            total_price,
            realPayAmount,
            quanInfo: quanList[0],
            quan_fee: offerRule.quan_fee,
            ticket_num
          });
        } else {
          payAmount = 0;
        }
        if (offerRule.is_store == "1" && quanStock - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.cardQuanManage.getNewQuan({
            cinemaLinkId,
            quan_value: offerRule.quan_value,
            quan_flag: offerRule.quan_flag,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (quanStock - Number(ticket_num)),
            session_id:
              this.currentParamsList[this.currentParamsInx].session_id,
            asyncFlag: 1,
            plat_name,
            order_number
          });
        }
      }
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      let tickets, payments;
      if (offerRule.offer_type !== "1" && card_id) {
        if (target_card_info) {
          card_id = cardInfos?.[0]?.cardNumber;
        }
        payments = [{ payMethod: "CARD", payCardNumber: card_id }];
        const minItem = activities.reduce((min, current) => {
          const currentPrivilegeTotalPrice = +current.privilegeTotalPrice;
          const minPrivilegeTotalPrice = +min.privilegeTotalPrice;
          return currentPrivilegeTotalPrice < minPrivilegeTotalPrice
            ? current
            : min;
        }, activities[0]);
        tickets = minItem?.ticketInfos?.map(item => ({
          seatId: item.seatId,
          activityId: item.activityId
        }));
      } else if (offerRule.offer_type == "1" && quan_code) {
        payments = useQuan.map(item => ({
          payMethod: "COUPON",
          couponCodeParams:
            item.couponCode +
            "-" +
            item.couponType +
            (item.concreteProductType == "COMMON" ? "-TICKET" : "")
        }));
        if (offerRule.quan_fee > 0 && card_id) {
          payments.push({ payMethod: "CARD", payCardNumber: card_id });
        }
        tickets = activities
          .find(
            item =>
              item.payMethod === "" &&
              item.privilegeTypes?.[0] == "ORIGINAL_PRICE"
          )
          ?.ticketInfos?.map(item => ({
            seatId: item.seatId,
            activityId: item.activityId
          }));
      }
      tickets = JSON.stringify(tickets);
      payments = JSON.stringify(payments);
      // 特殊券
      if (useQuan?.[0]?.concreteProductType == "COMMON") {
        // 支付前核销查询优惠券信息
        await this.orderManage.checkQuan({
          couponCodes: useQuan.map(item => item.couponCode).join(),
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          seatIds: seatIds.map(item => item.seatId).join("|"),
          commonCouponJson: JSON.stringify(
            useQuan.map(item => ({
              couponCode: item.couponCode,
              concreteProductType: "TICKET"
            }))
          )
        });
      }
      // 测试模式下，纯用券场景特殊处理：创建订单就等于支付成功，所以在创建订单前处理
      if (
        this.isTestOrder &&
        offerRule.offer_type === "1" &&
        useQuan?.length &&
        !card_id
      ) {
        const buyParams = {
          orderHeaderId: lockOrderId,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
          appFlag: this.appFlag,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          tickets,
          totalPrice: total_price || areaTotalPrice,
          payAmount,
          payments,
          orderInfo: {
            order_number,
            plat_name,
            supplier_end_price,
            ticket_num,
            card_id,
            quan_code: quan_code || undefined,
            paymentAmount: payAmount,
            profit,
            rewards
          }
        };
        console.log("========== 测试模式（用券场景）：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave(
          "测试模式（用券场景）：购买参数（创建订单前）",
          buyParams
        );
        console.log(
          "测试模式（用券场景）：用券时创建订单即支付成功，跳过创建订单，直接释放座位"
        );

        // 释放座位
        if (lockOrderId) {
          try {
            const releaseParams = {
              cinemaLinkId,
              lockOrderId,
              session_id:
                this.currentParamsList[this.currentParamsInx]?.session_id
            };
            this.logger.infoSave(
              "测试模式（用券场景）：开始释放座位",
              releaseParams
            );
            const releaseRes =
              await this.orderManage.releaseSeat(releaseParams);
            this.logger.infoSave("测试模式（用券场景）：释放座位返回", {
              res: releaseRes,
              params: releaseParams
            });
            console.log("测试模式（用券场景）：释放座位成功", releaseRes);
          } catch (error) {
            this.logger.errorSave("测试模式（用券场景）：释放座位异常", {
              error: formatErrInfo(error)
            });
            console.error("测试模式（用券场景）：释放座位失败", error);
          }
        }

        return { offerRule };
      }
      // 7、创建订单
      const createOrderRes = await this.orderManage.createOrder({
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        lockOrderId,
        tickets,
        totalPrice: total_price || areaTotalPrice,
        payAmount,
        payments,
        card_id
      });
      orderId = createOrderRes?.orderId;
      if (!orderId) {
        // 从订单列表获取到目标订单
        await mockDelay(3);
        const orderInfo = await this.orderManage.getOrderInfoByOrderList({
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        orderId = orderInfo?.orderId;
      }
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let cardNo = card_id;
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (!orderId) {
        this.logger.error("创建订单失败，单个订单直接出票结束,走转单逻辑");
        const transferParams = await this.orderManage.transferOrder({
          cinemaLinkId,
          lockOrderId
        });
        return { offerRule, transferParams };
      }
      this.logger.infoSave("创建订单成功");

      // 测试模式下不购买，打印购买参数并取消订单释放座位（对齐 SFC、UME、LMA）
      if (this.isTestOrder && card_id) {
        const buyParams = {
          orderId,
          orderHeaderId: lockOrderId,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
          appFlag: this.appFlag,
          cinemaLinkId,
          orderInfo: {
            order_number,
            plat_name,
            supplier_end_price,
            ticket_num,
            card_id,
            quan_code: quan_code || undefined,
            paymentAmount: payAmount,
            profit,
            rewards
          }
        };
        console.log("========== 测试模式：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave("测试模式：购买参数", buyParams);

        // 取消订单释放座位
        if (orderId) {
          try {
            const cancelParams = {
              cinemaLinkId,
              orderId,
              session_id:
                this.currentParamsList[this.currentParamsInx]?.session_id
            };
            this.logger.infoSave(
              "测试模式：开始取消订单释放座位",
              cancelParams
            );
            const cancelRes = await this.orderManage.cancelOrder(cancelParams);
            this.logger.infoSave("测试模式：取消订单返回", {
              res: cancelRes,
              params: cancelParams
            });
            console.log("测试模式：取消订单成功，座位已释放", cancelRes);
          } catch (error) {
            this.logger.errorSave("测试模式：取消订单异常", {
              error: formatErrInfo(error),
              orderId
            });
            console.error("测试模式：取消订单失败", error);
          }
        } else if (lockOrderId) {
          try {
            const releaseParams = {
              cinemaLinkId,
              lockOrderId,
              session_id:
                this.currentParamsList[this.currentParamsInx]?.session_id
            };
            this.logger.infoSave("测试模式：开始释放座位", releaseParams);
            const releaseRes =
              await this.orderManage.releaseSeat(releaseParams);
            this.logger.infoSave("测试模式：释放座位返回", {
              res: releaseRes,
              params: releaseParams
            });
            console.log("测试模式：释放座位成功", releaseRes);
          } catch (error) {
            this.logger.errorSave("测试模式：释放座位异常", {
              error: formatErrInfo(error)
            });
            console.error("测试模式：释放座位失败", error);
          }
        }

        return { offerRule };
      }

      payAmount = Number(payAmount) / 100;
      // 支付前校验用券价格
      if (
        offerRule.offer_type == "1" &&
        useQuan?.length &&
        payAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          payAmount,
          quan_fee_total,
          quan_fee,
          ticket_num
        });
        const transferParams = await this.orderManage.transferOrder({
          cinemaLinkId,
          orderId
        });
        return { offerRule, transferParams };
      }
      // 报价记录里的真实会员价
      let real_member_price = offerRule?.real_member_price || 0;
      let real_member_total_price =
        (real_member_price * 1000 * ticket_num) / 1000;
      // 支付前校验用卡价格
      if (offerRule.offer_type !== "1" && card_id) {
        if (payAmount > real_member_total_price) {
          if (subDecimal(payAmount, real_member_total_price) < profit) {
            this.logger.infoSave(
              "用完卡发现支付金额大于会员价*票数，利润需减去差值",
              {
                payAmount,
                real_member_total_price,
                profit
              }
            );
            profit = subDecimal(
              profit,
              subDecimal(payAmount, real_member_total_price)
            );
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              payAmount,
              real_member_total_price,
              ticket_num
            });
            if (this.currentParamsInx === this.currentParamsList.length - 1) {
              const transferParams = await this.orderManage.transferOrder({
                cinemaLinkId,
                orderId
              });
              return { offerRule, transferParams };
            } else {
              this.logger.infoSave("非最后一次用卡用券失败，走换号");
              this.currentParamsInx++;
              return await this.oneClickBuyTicket({
                ...item,
                otherParams: {
                  cinemaLinkId,
                  hallId,
                  scheduleId,
                  orderId,
                  scheduleKey,
                  seatIds,
                  areaTotalPrice,
                  seatList,
                  offerRule,
                  targetShow
                }
              });
            }
          }
        } else if (payAmount < real_member_total_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_total_price * 1000 - payAmount * 1000) *
              member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
        cardNo = card_id;
      }
      // 8、购买电影票
      let buyTicketRes;
      if (card_id) {
        const { session_id, member_pwd } =
          this.currentParamsList[this.currentParamsInx] || {};
        buyTicketRes = await this.orderManage.buyTicket({
          cinemaLinkId,
          cardNo,
          orderId,
          session_id,
          member_pwd,
          orderInfo: this.order
        });
        this.logger.infoSave("订单购买返回", { buyTicketRes });
        const buyRes = buyTicketRes?.buyRes;
        if (!buyRes) {
          this.logger.error("订单购买失败，单个订单直接出票结束走转单逻辑");
          let errInfo = buyTicketRes?.error
            ? JSON.stringify(buyTicketRes?.error)
            : "";
          let errMsgList = ["timeout", "Request failed", "已下单成功"];
          if (errMsgList.some(item => errInfo?.includes(item))) {
            this.logger.infoSave("订单购买返回超时或异常当成功处理", {
              buyTicketRes
            });
          } else {
            this.logger.errorSave("订单购买异常", {
              error: buyTicketRes?.error
            });
            const transferParams = await this.orderManage.transferOrder({
              cinemaLinkId,
              orderId
            });
            return { offerRule, transferParams };
          }
        }
        this.logger.infoSave("订单购买成功");
        if (card_id) {
          // 更新卡使用量
          await svApi.updateDayUsage({
            app_name: appFlag,
            card_id,
            add_count: ticket_num,
            plat_name
          });
        }
      } else {
        buyTicketRes = {
          code: 1,
          msg: "纯用券时不需要购买"
        };
      }
      if (offerRule.offer_type === "1" && useQuan?.length) {
        // 更新券库存
        this.cardQuanManage.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.curPhone,
          isPay: 1
        });
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.orderManage.lastHandle({
        orderId,
        cinemaLinkId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        orderInfo: item,
        lockseat,
        isUseQuan: useQuan?.length
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      this.logger.info("一键买票完成");
      if (profit) {
        profit = Number(profit).toFixed(2);
      }
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code,
        card_id,
        cardNum,
        offerRule,
        mobile: this.currentParamsList[this.currentParamsInx]?.mobile || ""
      };
    } catch (error) {
      this.logger.errorSave("一键买票异常", { error: formatErrInfo(error) });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: formatErrInfo(error)
      });
      return { offerRule };
    }
  }
}

window.h5UmeTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new H5UmeBuyTicket(order, logger, isTestOrder);
};
// 订单一键出票测试：
// window.h5UmeTicketObj(order, true).singleTicket()
