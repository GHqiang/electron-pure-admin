/**
 * SFC系列出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现 SFC 系列（app_type_code: sfc_applet）的出票逻辑
 * - 处理 SFC 系列下所有具体影院（appFlag）的出票流程
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 说明：
 * - 影院系列（app_type_code）：sfc_applet，代表 SFC 系列的所有影院
 * - 具体影院（appFlag/app_name）：如 lieren、mangguo、sheng 等，每个影院共享相同的出票逻辑
 * - StrategyFactory 根据订单的 app_type_code 选择本类，本类内部通过 this.appFlag 区分具体影院
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - SfcCinemaManage: SFC系列影院管理模块
 * - SfcSeatManage: SFC系列座位管理模块
 * - SfcOrderManage: SFC系列订单管理模块
 * - SfcCardQuanManage: SFC系列卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module sfc/buyTicket
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  subDecimal,
  trial,
  getOfferRuleById,
  mockDelay
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
import { syncCardAfterPayment } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";
// 使用公共工具
import {
  sortLoginByCardPhones,
  sortLoginByQuanPhones
} from "../common/loginHelper.js";
import { getLockSeatRetryConfig } from "../common/retryConfig.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

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
   * 使用公共工具 loginHelper 统一排序逻辑
   */
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

  // getOrderOfferRule 和 checkOfferRuleRes 已提取到基类 BaseBuyTicket

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
      plat_name !== "mahua" && plat_name !== "piaosheng"
        ? order_number
        : item.offer_order_number || order_number;
    let rewards = rewardsFromItem;
    if (!rewards || Number(rewards) === 0) {
      rewards = offerRule?.rewards || 0;
    }

    const transferWithUnlock = async unlockInfo => {
      const base = unlockInfo || {};
      const session_id =
        base.session_id ??
        this.currentParamsList[this.currentParamsInx]?.session_id;
      return await this.orderManage.transferOrder({ ...base, session_id });
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
        // 首次出票：获取影院、影片、场次信息（复用 getMovieInfo 的缓存逻辑）
        const cinemaInfoRes = await this.cinemaManage.getBuyPrevCinemaInfo();
        if (cinemaInfoRes?.error) {
          this.logger.errorSave("获取购票前影院信息异常", {
            error: cinemaInfoRes?.error
          });
          return { transferParams: await transferWithUnlock({}) };
        }
        city_id = cinemaInfoRes.city_id;
        cinema_id = cinemaInfoRes.cinema_id;
        show_id = cinemaInfoRes.show_id;
        start_day = cinemaInfoRes.start_day;
        start_time = cinemaInfoRes.start_time;

        // 使用公共工具按卡/券排序登录信息
        let isUseQuan = offerRule?.offer_type == "1";
        let auto_quan_info;
        if (offerRule?.offer_type != "1") {
          const ruleInfo = getOfferRuleById(offerRule.offer_rule_id);
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
        // 非固定报价或者灵活用券时按照卡券优先排序登录信息
        if (!(isUseQuan || auto_quan_info)) {
          const usableCards = await this.cardQuanManage.getUsableCardList?.(
            cinema_id,
            ticket_num
          );
          if (usableCards?.length) {
            this.usableCardList = usableCards;
            const cardLinkMobile = usableCards.map(c => c.mobile);
            this.currentParamsList = sortLoginByCardPhones(
              this.currentParamsList,
              cardLinkMobile
            );
          }
        } else {
          let quan_flag = offerRule?.quan_flag || auto_quan_info?.quan_flag;
          let quan_value = offerRule?.quan_value || auto_quan_info?.quan_value;
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
          }
        }

        this.currentPhone =
          this.currentParamsList[this.currentParamsInx]?.mobile;
        this.logger.infoSave(`首次出票手机号-${this.currentPhone}`);
        // 记录当前使用的手机号，出票失败消息会带上（最后失败的手机号）
        this.order.last_fail_phone = this.currentPhone || "";

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
        if (targetList?.length != ticket_num) {
          this.logger.errorSave("获取目标座位失败", { targetList, ticket_num });
          // 猎人订单：申请换座
          if (
            !this.order.isFromChangeSeat &&
            !this._hasAppliedChangeSeat &&
            dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name)
          ) {
            this._hasAppliedChangeSeat = true;
            this.logger.infoSave("获取目标座位失败，订单走申请换座逻辑");
            const isApplyChangeSeat = await this.platManage.applyChangeSeat({
              ...item,
              logger: this.logger
            });
            if (isApplyChangeSeat === true) {
              return {
                transferParams: { transfer_fee: 0 },
                offerRule: this.offerRule,
                isApplyChangeSeat
              };
            }
          }
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
        // 换号时恢复原先券类型
        if (offerRule?.old_quan_value) {
          offerRule.quan_value = offerRule.old_quan_value;
        }
        // 换号时等待1秒，避免被风控检测到一个ip快速换号
        await mockDelay(1);
      }

      // 记录当前使用的手机号，出票失败消息会带上（最后失败的手机号）
      this.order.last_fail_phone = this.currentPhone || "";

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
        const cfg = getLockSeatRetryConfig(plat_name);
        const res = await trial(
          inx => this.seatManage.lockSeatHandle({ ...lockParams }, inx),
          cfg[0],
          cfg[1],
          ""
        );
        if (!res) {
          const { err_info: errInfo } = this.logger.getLastErrMsgAndInfo();
          if (
            !this.order.isFromChangeSeat &&
            !this._hasAppliedChangeSeat &&
            dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name) &&
            ["座位锁定失败", "座位已被锁定或售出"].some(item =>
              errInfo.includes(item)
            )
          ) {
            // 走申请座位逻辑
            this._hasAppliedChangeSeat = true;
            const isApplyChangeSeat = await this.platManage.applyChangeSeat({
              ...item,
              logger: this.logger
            });
            if (isApplyChangeSeat === true) {
              return {
                transferParams: {
                  transfer_fee: 0
                },
                offerRule: this.offerRule,
                isApplyChangeSeat
              };
            }
          }
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
        // 使用基类通用方法处理换号/转单
        return await this.fallbackWithChangePhoneOrTransfer({
          reason: "使用卡券失败",
          unlockOrCancelParams: unlockInfo(),
          rebuildParams: {
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
        priceInfo,
        cardList,
        quanStock
      } = useRes;
      this.logger.infoSave("使用卡券成功", useRes);
      if (!card_id && !quan_code && !member_coupon_id && !coupon_id) {
        const errInfoObj = this.logger.logList
          ?.filter(l => l.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        const str =
          offerRule?.offer_type === "1" ? "无可用优惠券" : "无可用会员卡";
        this.logger.errorSave(errMsg ? `${str}-${errMsg}` : str);
        // 使用基类通用方法处理换号/转单
        return await this.fallbackWithChangePhoneOrTransfer({
          reason: str,
          unlockOrCancelParams: unlockInfo(),
          rebuildParams: {
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
        priceInfo = priceRes?.defaultCardPrice || priceRes?.price;
        if (priceRes?.error) {
          this.logger.errorSave("计算订单价格异常", { error: priceRes?.error });
        }
      }
      if (!priceInfo) {
        this.logger.infoSave("计算订单价格失败，走转单或换号");
        // 使用基类通用方法处理换号/转单
        return await this.fallbackWithChangePhoneOrTransfer({
          reason: "计算订单价格失败",
          unlockOrCancelParams: unlockInfo(),
          rebuildParams: {
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
          }
        });
      }

      const promo_id = priceInfo?.promo_id || "0";
      let payType = "online";
      if (priceInfo?.default_card) payType = "cardPay";
      const pay_money = Number(priceInfo.total_price || priceInfo.price || 0);

      // 使用基类通用方法校验用券价格
      const couponCheck = this.validateCouponPrice({
        offerRule,
        ticket_num,
        paymentAmount: pay_money,
        useQuan: useRes?.useQuan || []
      });
      if (!couponCheck.ok) {
        this.logger.errorSave(couponCheck.reason, {
          pay_money,
          quan_fee_total: couponCheck.quan_fee_total,
          ticket_num
        });
        return {
          offerRule,
          transferParams: await transferWithUnlock(unlockInfo())
        };
      }

      // 使用基类通用方法校验用卡价格与利润
      if (offerRule?.offer_type !== "1" && card_id) {
        const cardCheck = this.validateCardPriceAndProfit({
          offerRule,
          ticket_num,
          paymentAmount: pay_money,
          profit
        });
        if (!cardCheck.ok) {
          this.logger.errorSave(cardCheck.reason, {
            pay_money,
            ticket_num
          });
          return {
            offerRule,
            transferParams: await transferWithUnlock(unlockInfo())
          };
        }
        profit = cardCheck.profit;
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
        this.logger.errorSave("创建订单失败，走转单或换号");
        // 使用基类通用方法处理换号/转单
        return await this.fallbackWithChangePhoneOrTransfer({
          reason: "创建订单失败",
          unlockOrCancelParams: unlockInfo(),
          rebuildParams: {
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
          }
        });
      }

      // 测试模式下不购买，使用基类统一处理
      if (this.isTestOrder) {
        const unlockInfoForTest = () => ({
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time,
          order_num,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id
        });
        return await this.handleTestMode({
          order_num,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
          city_id,
          cinema_id,
          show_id,
          card_id,
          quan_code: quan_code || member_coupon_id || coupon_id,
          paymentAmount: pay_money,
          profit,
          unlockInfo: unlockInfoForTest
        });
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
      if (card_id) {
        let cardBalance = cardList?.find(
          item => (this.isV3App ? item.member_id : item.id) == card_id
        )?.balance;
        this.logger.infoSave("支付卡信息", {
          cardId: card_id,
          cardNo: cardNum,
          cardBalance: cardBalance,
          paymentAmount: pay_money
        });
        // 同步出票后的卡余额
        syncCardAfterPayment({
          appFlag: this.appFlag,
          cardId: card_id,
          cardBalance: cardBalance,
          paymentAmount: pay_money,
          logger: this.logger
        }).catch(e =>
          this.logger.warn?.("出票后同步SFC卡余额异常(不影响主流程)", e)
        );
      }
      // 更新券库存（与其他系列一致：用了券就扣减，无论入库券还是非入库券）
      if (offerRule?.offer_type === "1" && quan_code) {
        await this.cardQuanManage.updateQuanStock?.({
          quan_stock: quanStock - ticket_num,
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
        lockseat,
        profit
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
        offerRule,
        mobile:
          this.currentPhone ||
          this.currentParamsList[this.currentParamsInx]?.mobile ||
          ""
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
   * 测试模式下取消订单或释放座位（供基类 handleTestMode 调用）
   * @param {Object} ctx - 上下文对象，包含 order_num, unlockInfo 等
   */
  async cancelOrReleaseOrderForTest(ctx) {
    const { order_num, unlockInfo } = ctx || {};
    // SFC 特殊逻辑：有订单号取消订单，没订单号释放座位
    if (order_num) {
      const cancelParams = unlockInfo
        ? unlockInfo()
        : {
            city_id: ctx.city_id,
            cinema_id: ctx.cinema_id,
            show_id: ctx.show_id,
            order_num,
            session_id: ctx.session_id
          };
      this.logger.infoSave("测试模式：开始取消订单", cancelParams);
      const cancelRes = await this.orderManage.cancelOrder(cancelParams);
      this.logger.infoSave("测试模式：取消订单返回", {
        res: cancelRes,
        params: cancelParams
      });
      console.log("测试模式：取消订单成功，座位已释放", cancelRes);
    } else {
      const releaseParams = unlockInfo
        ? unlockInfo()
        : {
            city_id: ctx.city_id,
            cinema_id: ctx.cinema_id,
            show_id: ctx.show_id,
            session_id: ctx.session_id
          };
      this.logger.infoSave("测试模式：开始释放座位", releaseParams);
      const releaseRes = await this.orderManage.releaseSeat(releaseParams, 1);
      this.logger.infoSave("测试模式：释放座位返回", {
        res: releaseRes,
        params: releaseParams
      });
      console.log("测试模式：释放座位成功", releaseRes);
    }
  }
}

window.sfcTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new SfcBuyTicket(order, logger, isTestOrder);
};
// 订单一键出票测试：
// window.sfcTicketObj(order, true).singleTicket()

export default SfcBuyTicket;
