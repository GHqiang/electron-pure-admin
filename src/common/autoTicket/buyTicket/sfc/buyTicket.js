/**
 * SFC出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现 SFC 系列出票逻辑
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - SfcCinemaManage: 影院管理模块
 * - SfcSeatManage: 座位管理模块
 * - SfcOrderManage: 订单管理模块
 * - SfcCardQuanManage: 卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module sfc/buyTicket
 */
import {
  formatErrInfo,
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  isNextDay,
  getPreviousDay,
  subDecimal,
  trial
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index";
import { sfcV3AppList } from "@/common/constant";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import { encode } from "@/utils/sfc-member-password";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import SfcSeatManage from "./seatManage.js";
import SfcOrderManage from "./orderManage.js";
import SfcCinemaManage from "./cinemaManage.js";
import SfcCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";

const tokens = platTokens();

class SfcBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
    this.isV3App = sfcV3AppList.includes(this.appFlag);
    this.cityList = [];
    this.usableCardList = [];
  }

  /**
   * 初始化依赖模块
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
    this.cinemaManage = new SfcCinemaManage(this.order, this.logger);
    this.seatManage = new SfcSeatManage(
      this.order,
      this.logger,
      this.isTestOrder
    );
    const getCurrentParams = () => ({
      list: this.currentParamsList,
      inx: this.currentParamsInx
    });
    this.orderManage = new SfcOrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder,
      getCurrentParams,
      this.seatManage
    );
    this.cardQuanManage = new SfcCardQuanManage(
      this.order,
      this.logger,
      this.orderManage
    );
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

    const sorted = targetLoginList.slice().sort((a, b) => {
      if (a.first === "1" && b.first !== "1") return -1;
      if (a.first !== "1" && b.first === "1") return 1;
      if (a.first === "1" && b.first === "1") {
        if (a.mobile === tokens.userInfo?.phone) return -1;
        if (b.mobile === tokens.userInfo?.phone) return 1;
        return 0;
      }
      if (a.mobile === tokens.userInfo?.phone) return -1;
      if (b.mobile === tokens.userInfo?.phone) return 1;
      return 0;
    });

    this.currentParamsList.length = 0;
    this.currentParamsList.push(...sorted);

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

  /**
   * 获取订单报价规则
   */
  async getOrderOfferRule() {
    const { app_name, order_number, plat_name, offer_order_number } =
      this.order;
    try {
      const offerRes = await svApi.queryOfferInfo({
        user_id: tokens.userInfo?.user_id,
        order_status: "1",
        app_name,
        order_number: plat_name !== "mahua" ? order_number : offer_order_number,
        plat_name
      });
      this.offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logger.errorSave("获取该订单报价记录异常", { error });
    }
  }

  /**
   * 校验报价规则是否允许出票
   */
  checkOfferRuleRes() {
    const { offerRule } = this;
    if (
      !offerRule ||
      offerRule?.rule_status === "3" ||
      offerRule?.quan_value === "jinbaojia"
    ) {
      let str = "获取该订单报价记录失败，微信通知手动出票";
      if (offerRule?.rule_status === "3")
        str = "该订单报价规则为仅报价，需手动出票";
      else if (offerRule?.quan_value === "jinbaojia")
        str = "该订单报价规则用券类型为仅报价券，需手动出票";
      this.logger.errorSave(str, { offerRule });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return false;
    }
    return true;
  }

  /**
   * 一键买票核心流程
   */
  async oneClickBuyTicket(item) {
    const { appFlag } = this;
    const {
      id: order_id,
      order_number,
      city_name,
      cinema_name,
      cinema_code,
      hall_name,
      film_name,
      show_time,
      lockseat,
      ticket_num,
      supplier_end_price,
      rewards: rewardsFromItem,
      supplierCode,
      plat_name,
      otherParams
    } = item;

    let {
      offerRule,
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      start_day,
      start_time,
      order_num
    } = otherParams || {};

    const order_number_key =
      plat_name !== "mahua"
        ? order_number
        : item.offer_order_number || order_number;
    let rewards = rewardsFromItem;
    if (!rewards || Number(rewards) === 0) {
      rewards = offerRule?.rewards || 0;
    }

    const transferWithUnlock = async unlockInfo => {
      return await this.orderManage.transferOrder({
        ...unlockInfo,
        session_id: this.currentParamsList[this.currentParamsInx]?.session_id
      });
    };

    const unlockInfo = () => ({
      city_id,
      cinema_id,
      show_id,
      start_day,
      start_time,
      order_num,
      session_id: this.currentParamsList[this.currentParamsInx]?.session_id
    });

    try {
      this.logger.infoSave("一键买票待下单信息", item);

      if (this.currentParamsInx === 0) {
        const cityListRes = await this.cinemaManage.getCityList();
        this.cityList = cityListRes || [];
        if (!this.cityList?.length) {
          this.logger.errorSave("获取城市列表异常", { cityListRes });
          return { transferParams: await transferWithUnlock({}) };
        }
        city_id = this.cityList.find(
          item => item.name?.indexOf(city_name) !== -1
        )?.id;

        const cinemaListRes = await this.cinemaManage.getCityCinemaList({
          city_id
        });
        const cinemaList = cinemaListRes?.cinemaList || [];
        if (!cinemaList?.length) {
          this.logger.errorSave("获取城市影院列表异常", {
            error: cinemaListRes?.error
          });
          return { transferParams: await transferWithUnlock({}) };
        }
        const cinemaIdRes = getTargetCinemaCommon({
          app_name: appFlag,
          plat_cinema_code: cinema_code,
          cinema_list: cinemaList
        });
        cinema_id = cinemaIdRes?.id;
        if (!cinema_id) {
          this.logger.errorSave("获取目标影院失败", {
            error: cinemaIdRes?.error,
            cinema_name,
            cinemaList,
            appFlag,
            city_name
          });
          return { transferParams: await transferWithUnlock({}) };
        }

        if (offerRule?.offer_type !== "1") {
          const usableCards = await this.cardQuanManage.getUsableCardList?.(
            cinema_id,
            ticket_num
          );
          if (usableCards?.length) {
            this.usableCardList = usableCards;
            const cardLinkMobile = usableCards.map(c => c.mobile);
            this.currentParamsList = this.currentParamsList.sort((a, b) => {
              const aIn = cardLinkMobile.includes(a.mobile);
              const bIn = cardLinkMobile.includes(b.mobile);
              if (aIn && !bIn) return -1;
              if (!aIn && bIn) return 1;
              return 0;
            });
          }
        } else {
          const sortMobileList =
            await this.cardQuanManage.getSortPhoneByQuanTypeList?.(
              appFlag,
              offerRule?.quan_flag,
              offerRule?.quan_value,
              ticket_num
            );
          if (sortMobileList?.length) {
            this.currentParamsList = this.currentParamsList.sort((a, b) => {
              const iA = sortMobileList.indexOf(a.mobile);
              const iB = sortMobileList.indexOf(b.mobile);
              if (iA !== -1 && iB === -1) return -1;
              if (iA === -1 && iB !== -1) return 1;
              return 0;
            });
          }
        }

        this.currentPhone =
          this.currentParamsList[this.currentParamsInx]?.mobile;
        this.logger.infoSave(`首次出票手机号-${this.currentPhone}`);

        const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
          city_id,
          cinema_id
        });
        const movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取影院放映列表失败", {
            error: movieDataRes?.error
          });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }

        const movieInfo = getMovieInfoFromFilmName({
          filmName: film_name,
          movieData: movie_data.map(m => ({ ...m, filmName: m.movie_name }))
        });
        if (!movieInfo) {
          this.logger.errorSave("获取目标影片信息失败", {
            film_name,
            movie_data
          });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }

        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1]?.slice(0, 5) || "";
        if (isNextDay(start_day, start_time, "sfc")) {
          start_day = getPreviousDay(start_day);
        }

        let showList = movieInfo?.shows?.[start_day] || [];
        let targetShowList = showList.filter(s => s.start_time === start_time);
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(s => ({
            ...s,
            ...findMostRepeatedChars(s.hall_name, hall_name, "hall_name")
          }));
          targetShowList.sort(
            (a, b) => (b.similarity || 0) - (a.similarity || 0)
          );
          targetShow = targetShowList[0];
        }
        if (!targetShow) {
          this.logger.errorSave("匹配影片放映场次失败", {
            movieInfo,
            show_time
          });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }
        show_id = targetShow.show_id;

        const sessionId =
          this.currentParamsList[this.currentParamsInx]?.session_id;
        const seatDataRes = await this.seatManage.getSeatLayout({
          city_id,
          cinema_id,
          show_id,
          session_id: sessionId
        });
        const seatList = seatDataRes?.seatData || [];
        if (!seatList?.length) {
          this.logger.errorSave("获取座位布局异常", {
            error: seatDataRes?.error
          });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }

        const seatName = lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号");
        const selectSeatList = seatName.split(",");
        const targetList = seatList.filter(s => selectSeatList.includes(s[5]));
        if (targetList?.length !== ticket_num) {
          this.logger.errorSave("获取目标座位失败", { targetList, ticket_num });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }
        seat_ids = targetList.map(s => s[0]).join(",");
      } else {
        const prevSession =
          this.currentParamsList[this.currentParamsInx - 1]?.session_id;
        const unlockSeatInfo = {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time,
          order_num,
          session_id: prevSession
        };
        let isCancel;
        if (order_num) {
          isCancel = await this.orderManage.cancelOrder(unlockSeatInfo);
        } else {
          isCancel = await this.orderManage.releaseSeat(unlockSeatInfo, 1);
        }
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockSeatInfo)
          };
        }
        this.currentPhone =
          this.currentParamsList[this.currentParamsInx]?.mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${this.currentPhone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        if (offerRule?.old_quan_value)
          offerRule.quan_value = offerRule.old_quan_value;
      }

      const lockParams = {
        order_id,
        plat_name,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id: this.currentParamsList[this.currentParamsInx]?.session_id
      };

      try {
        await this.seatManage.lockSeatHandle(lockParams);
      } catch (lockErr) {
        this.logger.errorSave("锁定座位失败准备试错", { error: lockErr });
        const delayConfig = {
          lieren: [6, 5],
          mangguo: [6, 5],
          sheng: [6, 5],
          mayi: [10, 5],
          yangcong: [10, 5],
          haha: [6, 5],
          yinghuasuan: [6, 5],
          shangzhan: [6, 5],
          shoutu: [20, 12],
          mahua: [10, 5]
        };
        const cfg = delayConfig[plat_name] || [6, 5];
        const res = await trial(
          inx => this.seatManage.lockSeatHandle({ ...lockParams }, inx),
          cfg[0],
          cfg[1],
          ""
        );
        if (!res) {
          this.logger.infoSave("首次锁定座位失败轮询尝试后仍失败，走转单");
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
      }

      const useRes = await this.cardQuanManage.useQuanOrCard?.({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        offerRule,
        rewards,
        plat_name,
        order_number: order_number_key,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx,
        order: this.order,
        logger: this.logger,
        appFlag: this.appFlag,
        isV3App: this.isV3App,
        curPhone: this.currentPhone,
        usableCardList: this.usableCardList
      });

      if (!useRes) {
        this.logger.errorSave("使用卡券失败");
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
        this.currentParamsInx++;
        return await this.oneClickBuyTicket({
          ...item,
          otherParams: {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            start_day,
            start_time
          }
        });
      }

      let {
        card_id,
        cardNum,
        quanType,
        quan_code,
        coupon_id,
        member_coupon_id,
        profit,
        priceInfo
      } = useRes;

      if (!card_id && !quan_code && !member_coupon_id && !coupon_id) {
        const errInfoObj = this.logger.logList
          ?.filter(l => l.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        const str =
          offerRule?.offer_type === "1" ? "无可用优惠券" : "无可用会员卡";
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          this.logger.errorSave(errMsg ? `${str}-${errMsg}` : str);
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
        this.currentParamsInx++;
        return await this.oneClickBuyTicket({
          ...item,
          otherParams: {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            start_day,
            start_time
          }
        });
      }

      const session_id =
        this.currentParamsList[this.currentParamsInx]?.session_id;
      if (!priceInfo) {
        const priceRes = await this.orderManage.priceCalculation({
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          card_id,
          quan_code,
          member_coupon_id,
          coupon_id,
          session_id,
          appFlag
        });
        priceInfo = priceRes?.price;
        if (priceRes?.error) {
          this.logger.errorSave("计算订单价格异常", { error: priceRes?.error });
        }
      }
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          this.logger.errorSave("计算订单价格失败，走转单");
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
        this.currentParamsInx++;
        return await this.oneClickBuyTicket({
          ...item,
          otherParams: {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            start_day,
            start_time
          }
        });
      }

      const promo_id = priceInfo?.promo_id || "0";
      let payType = "online";
      if (priceInfo?.default_card) payType = "cardPay";
      const pay_money = Number(priceInfo.total_price || priceInfo.price || 0);

      const quan_fee = Number(offerRule?.quan_fee || 0);
      const quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (offerRule?.offer_type === "1" && pay_money > quan_fee_total) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          pay_money,
          quan_fee_total,
          ticket_num,
          quan_fee
        });
        return {
          offerRule,
          transferParams: await transferWithUnlock(unlockInfo())
        };
      }

      let real_member_price =
        Number(offerRule?.real_member_price || 0) * ticket_num;
      if (offerRule?.offer_type !== "1" && card_id) {
        if (pay_money > real_member_price) {
          const diff = subDecimal(pay_money, real_member_price);
          if (diff < profit) {
            profit = subDecimal(profit, diff);
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              pay_money,
              real_member_price,
              ticket_num
            });
            return {
              offerRule,
              transferParams: await transferWithUnlock(unlockInfo())
            };
          }
        } else if (pay_money < real_member_price) {
          const member_discount = Number(offerRule?.member_discount || 100);
          profit =
            Number(profit) +
            ((real_member_price - pay_money) * member_discount) / 100;
          profit = Number(profit).toFixed(2);
        }
      }

      const seat_info = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");

      order_num = await this.orderManage.createOrder({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        seat_info,
        pay_money,
        card_id,
        coupon: quan_code,
        quan_flag: offerRule?.quan_flag,
        plat_name,
        order_number: order_number_key,
        member_coupon_id,
        coupon_id,
        promo_id,
        payType
      });

      if (!order_num) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          this.logger.errorSave("创建订单失败，走转单");
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
        this.currentParamsInx++;
        return await this.oneClickBuyTicket({
          ...item,
          otherParams: {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            start_day,
            start_time
          }
        });
      }

      // 测试模式下不购买，打印购买参数并取消订单释放座位（对齐 LMA）
      if (this.isTestOrder) {
        const buyParams = {
          order_num,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
          appFlag: this.appFlag,
          city_id,
          cinema_id,
          show_id,
          orderInfo: {
            order_number: order_number_key,
            plat_name,
            supplier_end_price,
            ticket_num,
            card_id,
            quan_code: quan_code || undefined,
            member_coupon_id: member_coupon_id || undefined,
            coupon_id: coupon_id || undefined,
            paymentAmount: pay_money,
            profit,
            rewards
          }
        };
        console.log("========== 测试模式：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave("测试模式：购买参数", buyParams);

        // SFC 特殊逻辑：有订单号取消订单，没订单号释放座位
        if (order_num) {
          try {
            const cancelParams = unlockInfo();
            this.logger.infoSave("测试模式：开始取消订单", cancelParams);
            const cancelRes = await this.orderManage.cancelOrder(cancelParams);
            this.logger.infoSave("测试模式：取消订单返回", {
              res: cancelRes,
              params: cancelParams
            });
            console.log("测试模式：取消订单成功，座位已释放", cancelRes);
          } catch (error) {
            this.logger.errorSave("测试模式：取消订单异常", {
              error: formatErrInfo(error),
              order_num
            });
            console.error("测试模式：取消订单失败", error);
          }
        } else {
          try {
            const releaseParams = unlockInfo();
            this.logger.infoSave("测试模式：开始释放座位", releaseParams);
            const releaseRes = await this.orderManage.releaseSeat(
              releaseParams,
              1
            );
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

      const cur = this.currentParamsList[this.currentParamsInx] || {};
      const pay_password = cur.member_pwd ? encode(cur.member_pwd) : "";

      const buyTicketRes = await this.orderManage.buyTicket({
        city_id,
        cinema_id,
        order_num,
        pay_money,
        session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
        card_id,
        pay_password,
        orderInfo: this.order
      });

      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        if (formatErrInfo(buyTicketRes?.error)?.indexOf("timeout") !== -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", buyTicketRes);
        } else {
          this.logger.errorSave("订单购买异常", buyTicketRes);
          return {
            offerRule,
            transferParams: await transferWithUnlock({
              ...unlockInfo(),
              order_num
            })
          };
        }
      }

      const isOnlyUseCard = card_id && !quanType;
      if (offerRule?.offer_type !== "1" && isOnlyUseCard) {
        await svApi.updateCardDayUse?.({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number: order_number_key,
          add_count: ticket_num
        });
      }
      if (offerRule?.offer_type === "1" && offerRule?.is_store != 1) {
        await this.cardQuanManage.updateQuanStock?.({
          ticket_num,
          quan_flag: offerRule?.quan_flag,
          quan_value: offerRule?.quan_value,
          app_name: appFlag,
          phone: this.currentPhone,
          isPay: 1
        });
      }

      const lastRes = await this.orderManage.lastHandle({
        city_id,
        cinema_id,
        order_num,
        order_id,
        app_name: appFlag,
        card_id: isOnlyUseCard ? card_id : undefined,
        order_number: order_number_key,
        supplierCode,
        plat_name,
        session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
        orderInfo: item,
        lockseat
      });

      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.infoSave("订单最后处理成功: 获取取票码并上传");
      }

      let qc = quan_code;
      if (!qc && quanType) qc = coupon_id || member_coupon_id;
      if (profit) profit = Number(profit).toFixed(2);

      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code: qc,
        card_id,
        cardNum,
        quanType,
        offerRule
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

  /**
   * 验证待出票订单JSON
   *
   * 用于验证待出票订单的格式和核心方法的可执行性
   *
   * 执行流程：订单格式验证 → 登录信息获取 → 报价规则获取 → 城市/影院信息获取 →
   *         按卡券排序登录信息（如需要）→ 电影/场次信息获取 → 座位信息获取 → 用卡/用券流程
   *
   * 不执行：锁座 → 创建订单 → 价格计算 → 购买 → 上传取票码 → 转单
   *
   * 注意：验证会实际执行用卡、用券（如绑定券等）操作，会产生副作用
   *
   * @returns {Promise<Object>} 验证结果：
   *   - valid: boolean，是否通过验证
   *   - errMsg: string，错误信息（验证失败时）
   *   - steps: Object，验证步骤结果
   *     - orderFormat, loginInfo, offerRule, cinemaInfo, movieInfo, seatInfo,
   *       sortLoginInfo, useQuanOrCard
   *   - cardInfo: Object，用卡信息（如适用）
   *   - quanInfo: Object，用券信息（如适用）
   */
  async validateTicketOrder() {
    const orderJson = JSON.parse(JSON.stringify(this.order));
    const result = { valid: false, errMsg: "", steps: {} };

    try {
      const requiredFields = [
        "order_number",
        "plat_name",
        "app_name",
        "city_name",
        "cinema_name",
        "cinema_code",
        "film_name",
        "hall_name",
        "show_time",
        "lockseat",
        "ticket_num",
        "supplier_end_price"
      ];
      const missingFields = requiredFields.filter(field => !orderJson[field]);
      if (missingFields.length > 0) {
        result.errMsg = `缺少必填字段：${missingFields.join(", ")}`;
        return result;
      }
      if (
        typeof orderJson.ticket_num !== "number" ||
        orderJson.ticket_num <= 0
      ) {
        result.errMsg = "ticket_num 必须是大于0的数字";
        return result;
      }
      if (
        typeof orderJson.supplier_end_price !== "number" ||
        orderJson.supplier_end_price <= 0
      ) {
        result.errMsg = "supplier_end_price 必须是大于0的数字";
        return result;
      }
      result.steps.orderFormat = true;

      this.order = orderJson;
      await this.getCinemaLoginInfo();
      if (!this.currentParamsList?.length) {
        result.errMsg = "获取登录信息失败，无可用登录账号";
        result.steps.loginInfo = false;
        return result;
      }
      result.steps.loginInfo = true;

      await this.getOrderOfferRule();
      if (!this.offerRule) {
        result.errMsg = "获取报价规则失败";
        result.steps.offerRule = false;
        return result;
      }
      if (!this.checkOfferRuleRes()) {
        result.errMsg =
          "报价规则不允许出票（rule_status=3 或 quan_value=jinbaojia）";
        result.steps.offerRule = false;
        return result;
      }
      result.steps.offerRule = true;

      const { appFlag } = this;
      const {
        city_name,
        cinema_code,
        film_name,
        hall_name,
        show_time,
        lockseat,
        ticket_num,
        supplier_end_price,
        rewards
      } = orderJson;
      let offerRule = this.offerRule;
      const order_number_key =
        orderJson.plat_name !== "mahua"
          ? orderJson.order_number
          : orderJson.offer_order_number || orderJson.order_number;

      const cityListRes = await this.cinemaManage.getCityList();
      this.cityList = cityListRes || [];
      if (!this.cityList?.length) {
        result.errMsg = "获取城市列表失败";
        result.steps.cinemaInfo = false;
        return result;
      }
      let city_id = this.cityList.find(
        item => item.name?.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        result.errMsg = "匹配城市失败";
        result.steps.cinemaInfo = false;
        return result;
      }

      const cinemaListRes = await this.cinemaManage.getCityCinemaList({
        city_id
      });
      const cinemaList = cinemaListRes?.cinemaList || [];
      if (!cinemaList?.length) {
        result.errMsg = "获取城市影院列表失败";
        result.steps.cinemaInfo = false;
        return result;
      }
      const cinemaIdRes = getTargetCinemaCommon({
        app_name: appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.id;
      if (!cinema_id) {
        result.errMsg = "匹配目标影院失败";
        result.steps.cinemaInfo = false;
        return result;
      }
      result.steps.cinemaInfo = true;

      if (offerRule?.offer_type !== "1") {
        const usableCards = await this.cardQuanManage.getUsableCardList?.(
          cinema_id,
          ticket_num
        );
        if (usableCards?.length) {
          this.usableCardList = usableCards;
          const cardLinkMobile = usableCards.map(c => c.mobile);
          this.currentParamsList = this.currentParamsList.sort((a, b) => {
            const aIn = cardLinkMobile.includes(a.mobile);
            const bIn = cardLinkMobile.includes(b.mobile);
            if (aIn && !bIn) return -1;
            if (!aIn && bIn) return 1;
            return 0;
          });
        }
      } else {
        const sortMobileList =
          await this.cardQuanManage.getSortPhoneByQuanTypeList?.(
            appFlag,
            offerRule?.quan_flag,
            offerRule?.quan_value,
            ticket_num
          );
        if (sortMobileList?.length) {
          this.currentParamsList = this.currentParamsList.sort((a, b) => {
            const iA = sortMobileList.indexOf(a.mobile);
            const iB = sortMobileList.indexOf(b.mobile);
            if (iA !== -1 && iB === -1) return -1;
            if (iA === -1 && iB !== -1) return 1;
            return 0;
          });
        }
      }
      result.steps.sortLoginInfo = true;

      this.currentPhone = this.currentParamsList[this.currentParamsInx]?.mobile;

      const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
        city_id,
        cinema_id
      });
      const movie_data = movieDataRes?.movieData || [];
      if (!movie_data?.length) {
        result.errMsg = "获取影院放映列表失败";
        result.steps.movieInfo = false;
        return result;
      }
      const movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data.map(m => ({ ...m, filmName: m.movie_name }))
      });
      if (!movieInfo) {
        result.errMsg = "匹配目标影片失败";
        result.steps.movieInfo = false;
        return result;
      }
      let start_day = show_time.split(" ")[0];
      let start_time = show_time.split(" ")[1]?.slice(0, 5) || "";
      if (isNextDay(start_day, start_time, "sfc")) {
        start_day = getPreviousDay(start_day);
      }
      let showList = movieInfo?.shows?.[start_day] || [];
      let targetShowList = showList.filter(s => s.start_time === start_time);
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(s => ({
          ...s,
          ...findMostRepeatedChars(s.hall_name, hall_name, "hall_name")
        }));
        targetShowList.sort(
          (a, b) => (b.similarity || 0) - (a.similarity || 0)
        );
        targetShow = targetShowList[0];
      }
      if (!targetShow) {
        result.errMsg = "匹配放映场次失败";
        result.steps.movieInfo = false;
        return result;
      }
      result.steps.movieInfo = true;
      const show_id = targetShow.show_id;

      const sessionId =
        this.currentParamsList[this.currentParamsInx]?.session_id;
      const seatDataRes = await this.seatManage.getSeatLayout({
        city_id,
        cinema_id,
        show_id,
        session_id: sessionId
      });
      const seatList = seatDataRes?.seatData || [];
      if (!seatList?.length) {
        result.errMsg = "获取座位布局失败";
        result.steps.seatInfo = false;
        return result;
      }
      const seatName = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");
      const selectSeatList = seatName.split(",");
      const targetList = seatList.filter(s => selectSeatList.includes(s[5]));
      if (targetList?.length !== ticket_num) {
        result.errMsg = "匹配目标座位失败或数量不一致";
        result.steps.seatInfo = false;
        return result;
      }
      result.steps.seatInfo = true;
      const seat_ids = targetList.map(s => s[0]).join(",");

      const useRes = await this.cardQuanManage.useQuanOrCard?.({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        offerRule,
        rewards: rewards ?? offerRule?.rewards ?? 0,
        plat_name: orderJson.plat_name,
        order_number: order_number_key,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx,
        order: this.order,
        logger: this.logger,
        appFlag,
        isV3App: this.isV3App,
        curPhone: this.currentPhone,
        usableCardList: this.usableCardList
      });

      if (!useRes) {
        result.errMsg = "用卡/用券流程失败";
        result.steps.useQuanOrCard = false;
        return result;
      }
      const { card_id, quan_code, coupon_id, member_coupon_id, profit } =
        useRes;
      if (!card_id && !quan_code && !member_coupon_id && !coupon_id) {
        result.errMsg =
          offerRule?.offer_type === "1"
            ? "无可用优惠券或券不足"
            : "无可用会员卡或卡余额不足";
        result.steps.useQuanOrCard = false;
        return result;
      }
      result.steps.useQuanOrCard = true;
      if (card_id) result.cardInfo = { card_id };
      if (quan_code || coupon_id || member_coupon_id) {
        result.quanInfo = {
          quan_code: quan_code || coupon_id || member_coupon_id,
          profit
        };
      }

      result.valid = true;
      return result;
    } catch (error) {
      result.errMsg = `验证过程异常：${formatErrInfo(error)}`;
      return result;
    }
  }
}

window.sfcTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new SfcBuyTicket(order, logger, isTestOrder);
};
// 订单出票管理相关方法组装校验：
// window.sfcTicketObj(order, true).validateTicketOrder()
// 订单一键出票测试：
// window.sfcTicketObj(order, true).singleTicket()

export default SfcBuyTicket;
