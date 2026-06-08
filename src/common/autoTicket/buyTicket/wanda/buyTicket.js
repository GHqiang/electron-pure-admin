/**
 * 万达出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket，实现万达系列的出票流程
 * - 登录信息获取、报价规则获取、影院/排期/座位解析
 * - 锁座、创建订单、确认出票、获取取票码
 *
 * @module wanda/buyTicket
 */
import { mockDelay, getOfferRuleById, subDecimal } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import Logger from "@/common/logger";
import svApi from "@/api/sv-api";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import WandaSeatManage from "./seatManage.js";
import WandaOrderManage from "./orderManage.js";
import WandaCinemaManage from "./cinemaManage.js";
import WandaCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";
import {
  sortLoginByCardPhones,
  sortLoginByQuanPhones
} from "../common/loginHelper.js";

class WandaBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
    this.usableCardList = [];
  }

  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
    this.cinemaManage = new WandaCinemaManage(this.order, this.logger);
    this.seatManage = new WandaSeatManage(
      this.order,
      this.logger,
      this.isTestOrder
    );
    const getCurrentParams = () => ({
      list: this.currentParamsList,
      inx: this.currentParamsInx
    });
    this.orderManage = new WandaOrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder,
      getCurrentParams
    );
    this.cardQuanManage = new WandaCardQuanManage(
      this.order,
      this.logger,
      this.orderManage
    );
  }

  async getCinemaLoginInfo() {
    const { appFlag } = this;
    this.currentParamsList = this.getLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );
    this.logger.infoSave("获取该影院登录信息返回", {
      currentParamsList: this.currentParamsList
    });
    this.currentParamsInx = 0;
    this.currentSessionId =
      this.currentParamsList[this.currentParamsInx]?.session_id || "";
    this.currentPhone =
      this.currentParamsList[this.currentParamsInx]?.mobile || "";
  }

  async oneClickBuyTicket(item) {
    const { appFlag } = this;
    let {
      order_number,
      lockseat,
      ticket_num,
      supplier_end_price,
      rewards,
      plat_name,
      otherParams
    } = item;

    // 换号出票需要用到的字段
    let { offerRule, city_id, cinema_id, show_id, seat_ids, order_num } =
      otherParams || {};

    if (!rewards || Number(rewards) === 0) {
      rewards = offerRule?.rewards || 0;
    }

    // 转单工具函数（带解锁信息）
    const transferWithUnlock = async unlockInfo => {
      return await this.orderManage.transferOrder(unlockInfo);
    };

    const unlockInfo = () => ({
      cinema_id,
      show_id,
      session_id: this.currentParamsList[this.currentParamsInx]?.session_id
    });

    try {
      this.logger.infoSave("一键买票待下单信息", item);

      // ========== 首次出票：解析影院/影片/座位 ==========
      if (this.currentParamsInx === 0) {
        // 获取电影排期信息
        const movieInfo = await this.cinemaManage.getMovieInfo(this.order);
        console.log("获取电影排期信息", movieInfo);
        if (!movieInfo) {
          this.logger.errorSave("获取电影排期信息异常");
          return { transferParams: await transferWithUnlock({}) };
        }
        city_id = movieInfo.city_id;
        cinema_id = movieInfo.cinema_id;
        show_id = movieInfo.showtimeId;

        // 🔑 按可用卡券排序登录信息
        const isUseQuan = offerRule?.offer_type == "1";
        let auto_quan_info;
        if (offerRule?.offer_type != "1") {
          const ruleInfo = getOfferRuleById(offerRule?.offer_rule_id);
          if (ruleInfo) {
            const { autoUseQuanStatus, autoUseQuanPrice, auto_quan_value } =
              ruleInfo;
            if (
              autoUseQuanStatus === "1" &&
              supplier_end_price > autoUseQuanPrice &&
              auto_quan_value
            ) {
              auto_quan_info = await this.cardQuanManage.getQuanInfo(
                auto_quan_value,
                appFlag
              );
            }
          }
        }
        if (!(isUseQuan || auto_quan_info)) {
          const usableCards = await this.cardQuanManage.getCardList(
            this.currentParamsList[this.currentParamsInx]
          );
          if (usableCards?.length) {
            this.usableCardList = usableCards;
            const cardLinkMobile = usableCards.map(c => c.mobile);
            this.currentParamsList = sortLoginByCardPhones(
              this.currentParamsList,
              cardLinkMobile
            );
            this.currentSessionId =
              this.currentParamsList[this.currentParamsInx]?.session_id || "";
            this.currentPhone =
              this.currentParamsList[this.currentParamsInx]?.mobile || "";
            this.logger.infoSave("按可用会员卡手机号排序登录信息", {
              currentParamsList: this.currentParamsList,
              usableCards
            });
          }
        } else {
          const quan_flag = offerRule?.quan_flag || auto_quan_info?.quan_flag;
          const quan_value =
            offerRule?.quan_value || auto_quan_info?.quan_value;
          const sortMobileList =
            await this.cardQuanManage.getSortPhoneByQuanTypeList?.(
              appFlag,
              quan_flag,
              quan_value,
              ticket_num
            );
          if (sortMobileList?.length) {
            this.currentParamsList = sortLoginByQuanPhones(
              this.currentParamsList,
              sortMobileList
            );
            this.currentSessionId =
              this.currentParamsList[this.currentParamsInx]?.session_id || "";
            this.currentPhone =
              this.currentParamsList[this.currentParamsInx]?.mobile || "";
            this.logger.infoSave("按可用优惠券手机号排序登录信息", {
              currentParamsList: this.currentParamsList,
              quan_flag,
              quan_value,
              ticket_num
            });
          }
        }
        this.logger.infoSave(`首次出票手机号-${this.currentPhone}`);

        // 获取座位布局
        const sessionId =
          this.currentParamsList[this.currentParamsInx]?.session_id;
        const seatLayout = await this.seatManage.getSeatLayout({
          dId: show_id,
          json: true
        });
        if (!seatLayout) {
          this.logger.errorSave("获取座位布局异常");
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }

        // 订单指定了座位：用 lockseat 匹配
        const allSeats = [];
        (seatLayout.area || []).forEach(area => {
          (area.seat || []).forEach(s => allSeats.push(s));
        });
        const targetSeatRes = await this.seatManage.getTargetSeat({
          lockseat,
          seatList: allSeats,
          ticket_num
        });
        if (targetSeatRes?.error || !targetSeatRes?.seat_ids) {
          this.logger.errorSave("获取目标座位失败", { lockseat, ticket_num });
          return { transferParams: await transferWithUnlock(unlockInfo()) };
        }
        seat_ids = targetSeatRes.seat_ids;
      } else {
        // ========== 换号重试：先释放旧座位 ==========
        const prevSession =
          this.currentParamsList[this.currentParamsInx - 1]?.session_id;
        const unlockSeatInfo = { cinema_id, show_id, session_id: prevSession };
        const isCancel = await this.orderManage.cancelOrder(
          unlockSeatInfo,
          order_num
        );
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
            currentParamsInx: this.currentParamsInx
          }
        );
        await mockDelay(1);
      }

      // 记录当前手机号
      this.order.last_fail_phone = this.currentPhone || "";

      // ========== 创建订单（锁座+创建订单） ==========
      const orderRes = await this.orderManage.createOrder({
        dId: show_id,
        retailerCode: "MX",
        mobile: this.currentPhone,
        seatId: seat_ids,
        session_id: this.currentSessionId
      });
      if (!orderRes) {
        return {
          offerRule,
          transferParams: await transferWithUnlock(unlockInfo())
        };
      }
      order_num = orderRes.orderId;
      console.log("createOrder 返回 orderId", order_num);

      if (!order_num) {
        this.logger.errorSave("订单创建失败");
        // 无可用卡券，尝试换号
        if (this.currentParamsInx < this.currentParamsList.length - 1) {
          this.logger.infoSave("非最后一次创建订单失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_ids
            }
          });
        }
        return {
          offerRule: this.offerRule,
          transferParams: await transferWithUnlock(unlockInfo())
        };
      }
      // ========== 获取锁座后订单价格（从 Wanda 订单取真实全价） ==========
      const priceRes = await this.orderManage.priceCalculation({
        orderId: order_num,
        session_id: this.currentSessionId
      });
      const priceInfo = priceRes || {};

      let seatTotalPrice = priceInfo.total_price || 0;
      seatTotalPrice = seatTotalPrice / 100;
      this.logger.infoSave("订单价格", {
        seatTotalPrice,
        orderPrice: JSON.stringify(priceInfo)
      });

      // ========== 使用卡券 ==========
      const useRes = await this.cardQuanManage.useQuanOrCard({
        cinema_id,
        show_id,
        seat_ids,
        seatTotalPrice,
        ticket_num,
        supplier_end_price,
        offerRule,
        rewards,
        plat_name,
        orderId: order_num,
        order_number,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx,
        order: this.order,
        logger: this.logger,
        appFlag: this.appFlag,
        curPhone: this.currentPhone,
        usableCardList: this.usableCardList,
        session_id: this.currentSessionId
      });

      // 无可用卡券：走换号或转单
      if (
        !useRes ||
        (!useRes.card_id &&
          !useRes.quan_code &&
          !useRes.member_coupon_id &&
          !useRes.coupon_id)
      ) {
        const errInfoObj = this.logger.logList
          ?.filter(l => l.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        const str =
          offerRule?.offer_type === "1" ? "无可用优惠券" : "无可用会员卡";
        this.logger.errorSave(errMsg ? `${str}-${errMsg}` : str);
        // 无可用卡券，尝试换号
        if (this.currentParamsInx < this.currentParamsList.length - 1) {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              order_num
            }
          });
        }
        return {
          offerRule: this.offerRule,
          transferParams: await transferWithUnlock({
            orderId: order_num,
            session_id: this.currentSessionId
          })
        };
      }

      let {
        card_id,
        cardNum,
        quan_code,
        coupon_id,
        member_coupon_id,
        profit,
        priceInfo: usePriceInfo
      } = useRes;
      // useQuanOrCard 可能返回自己的 priceInfo，优先使用
      if (usePriceInfo) {
        priceInfo.total_price =
          usePriceInfo.total_price || priceInfo.total_price;
        priceInfo.price = usePriceInfo.price || priceInfo.price;
      }
      this.logger.infoSave("使用卡券成功", {
        card_id,
        quan_code,
        profit,
        priceInfo
      });

      // ========== 价格校验 ==========
      const pay_money = Number(priceInfo.total_price || priceInfo.price || 0);
      this.logger.infoSave("订单支付金额", { pay_money });

      // ========== 价格校验 ==========
      // 用券价格校验
      const couponCheck = this.validateCouponPrice({
        offerRule,
        ticket_num,
        paymentAmount: pay_money,
        useQuan: useRes?.useQuan || []
      });
      this.logger.infoSave("用券价格校验结果", { couponCheck, cardCheck });
      if (!couponCheck.ok) {
        this.logger.errorSave(couponCheck.reason, { pay_money, ticket_num });
        return {
          offerRule,
          transferParams: await transferWithUnlock({
            orderId: order_num,
            session_id: this.currentSessionId
          })
        };
      }

      // 用卡价格与利润校验
      if (offerRule?.offer_type !== "1" && card_id) {
        const cardCheck = this.validateCardPriceAndProfit({
          offerRule,
          ticket_num,
          paymentAmount: pay_money,
          profit
        });
        this.logger.infoSave("用卡价格校验结果", { pay_money, cardCheck });
        if (!cardCheck.ok) {
          this.logger.errorSave(cardCheck.reason, { pay_money, ticket_num });
          return {
            offerRule,
            transferParams: await transferWithUnlock({
              orderId: order_num,
              session_id: this.currentSessionId
            })
          };
        }
        profit = cardCheck.profit;
      }

      // ========== 测试模式：取消订单释放座位 ==========
      if (this.isTestOrder) {
        this.logger.infoSave("测试模式：打印参数并取消订单", {
          order_num,
          show_id,
          seat_ids,
          seatTotalPrice,
          mobile: this.currentPhone,
          profit,
          supplier_end_price,
          card_id,
          quan_code,
          pay_money,
          requestInfo: useRes.requestInfo
        });
        await this.orderManage.cancelOrder({
          orderId: order_num,
          session_id: this.currentSessionId
        });
        return { offerRule: this.offerRule };
      }

      // ========== 购买订单（合并支付） ==========
      const payRes = await this.orderManage.buyTicket({
        orderId: order_num,
        mobilePhone: this.currentPhone,
        cinemaId: cinema_id,
        requestInfo: useRes.requestInfo || {},
        session_id: this.currentSessionId
      });
      if (!payRes) {
        this.logger.errorSave("万达合并支付失败，走转单");
        return {
          offerRule: this.offerRule,
          transferParams: await transferWithUnlock({
            orderId: order_num,
            session_id: this.currentSessionId
          })
        };
      }

      // ========== 获取取票码（同步 + 异步轮询） ==========
      const lastRes = await this.orderManage.lastHandle({
        orderId: order_num,
        session_id: this.currentSessionId,
        orderInfo: this.order
      });

      const ticketCode = lastRes?.qrcode;

      // ========== 后处理 ==========
      if (offerRule?.offer_type !== "1" && card_id) {
        await svApi
          .updateCardDayUse?.({
            app_name: this.appFlag,
            card_id,
            plat_name,
            order_number,
            add_count: ticket_num
          })
          .catch(e =>
            this.logger.errorSave("更新卡日使用量异常", { error: e })
          );
      }
      if (offerRule?.offer_type === "1" && offerRule?.is_store != 1) {
        await this.cardQuanManage
          .updateQuanStock?.({
            ticket_num,
            quan_flag: offerRule?.quan_flag,
            quan_value: offerRule?.quan_value,
            app_name: this.appFlag,
            phone: this.currentPhone,
            isPay: 1
          })
          .catch(e => this.logger.errorSave("更新券库存异常", { error: e }));
      }

      return {
        profit,
        submitRes: lastRes?.submitRes,
        qrcode: ticketCode,
        offerRule: this.offerRule,
        mobile: this.currentPhone,
        card_id,
        quan_code,
        cardNum
      };
    } catch (error) {
      this.logger.errorSave("一键买票异常", { error: error?.message });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: formatErrInfo(error)
      });
      return { offerRule };
    }
  }
}

window.wandaTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new WandaBuyTicket(order, logger, isTestOrder);
};
const testOrder = {
  id: 21147810,
  order_number: "2026060721255948231",
  ticket_num: 1,
  city_name: "南京",
  cinema_name: "万达影城(江宁太阳城CINITY店)",
  hall_name: "口味王-1号激光厅",
  film_name: "火遮眼",
  show_time: "2026-06-11 18:30",
  lockseat: "4排1座",
  cinema_code: "32019011",
  supplier_end_price: 35,
  rewards: 0,
  cinema_group: "万达",
  end_time: 1780839976,
  plat_name: "mayi",
  app_name: "wanda",
  appName: "wanda",
  isNewOrder: true
};

// 订单一键出票测试：
// window.wandaTicketObj(order, true).singleTicket()

export default WandaBuyTicket;
