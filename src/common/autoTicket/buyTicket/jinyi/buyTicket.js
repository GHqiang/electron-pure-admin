/**
 * 金逸出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现金逸系列出票逻辑
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - CinemaManage: 影院管理模块
 * - SeatManage: 座位管理模块
 * - OrderManage: 订单管理模块
 * - CardQuanManage: 卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module jinyi/buyTicket
 */
import {
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage,
  randomNumByLength,
  subDecimal
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
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import SeatManage from "./seatManage";
import OrderManage from "./orderManage";
import CinemaManage from "./cinemaManage";
import CardQuanManage from "./cardQuanManage";
import PlatManage from "../platManage";
import { syncCardAfterPayment } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

/**
 * 金逸出票类
 * 继承 BaseBuyTicket，实现金逸系列出票逻辑
 */
class JinyiBuyTicket extends BaseBuyTicket {
  /**
   * 构造函数
   * @param {Object} order - 订单信息
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.usableCardList = []; // 可用会员卡列表
    this.currentMemberPwd = ""; // 当前会员密码
  }

  /**
   * 初始化依赖模块
   * 在 BaseBuyTicket 构造函数中会自动调用此方法
   * 注意：cinemaManage 和 cardQuanManage 需要延迟初始化（首次调用 oneClickBuyTicket 时），
   * 因为它们需要 offerRule 和 currentParamsList，这些在 getOrderOfferRule() 之后才可用
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
    this.seatManage = new SeatManage(this.order, this.logger, this.isTestOrder);
    this.orderManage = new OrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder
    );
    // cinemaManage 和 cardQuanManage 延迟初始化
  }

  /**
   * 获取影院登录信息并设置当前token
   * 从 getCinemaLoginInfoList() 获取该影院的登录信息列表
   * 设置 this.currentParamsList 和 this.currentParamsInx = 0
   */
  getCinemaLoginInfo() {
    this.currentParamsList = this.getLoginInfoList().filter(
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
    if (this.currentParamsList.length > 0) {
      this.currentSessionId =
        this.currentParamsList[this.currentParamsInx].session_id;
      this.currentPhone = this.currentParamsList[this.currentParamsInx].mobile;
      this.currentMemberPwd =
        this.currentParamsList[this.currentParamsInx].member_pwd;
    } else {
      this.currentSessionId = "";
      this.currentPhone = "";
      this.currentMemberPwd = "";
    }
  }

  // getOrderOfferRule 和 checkOfferRuleRes 已提取到基类 BaseBuyTicket

  /**
   * 一键买票核心流程
   * @param {Object} item - 参数对象（兼容旧格式 changePhoneBuyParams）
   * @param {Object} item.otherParams - 其他参数（新格式）
   * @param {Object} item.otherParams.offerRule - 报价规则（新格式）
   * @returns {Promise<Object|undefined>} 出票结果或undefined
   */
  async oneClickBuyTicket(item) {
    const { appFlag } = this;
    // 兼容旧格式：如果传入的是 changePhoneBuyParams 格式，则直接使用
    // 新格式：item 包含 otherParams.offerRule
    let changePhoneBuyParams = item;
    if (item.otherParams?.offerRule) {
      // 新格式：从 otherParams 中提取 offerRule 并合并到主对象
      changePhoneBuyParams = { ...item };
      // offerRule 已经在基类的 singleTicket 中设置到 this.offerRule
    }

    let buyTicketInfo = JSON.parse(JSON.stringify(changePhoneBuyParams)); // 换号购买参数
    if (buyTicketInfo && this.currentParamsInx) {
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

    // 延迟初始化 cardQuanManage 和 cinemaManage（首次调用时）
    if (!this.cardQuanManage) {
      this.cardQuanManage = new CardQuanManage(this.order, this.logger);
    }
    try {
      if (this.currentParamsInx === 0) {
        // 影院信息模块（获取购票前相关信息）
        if (!this.cinemaManage) {
          this.cinemaManage = new CinemaManage(
            this.order,
            this.logger,
            this.offerRule,
            this.currentParamsList
          );
        }

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
        // 库里维护的可用会员卡列表(已按余额倒序)
        this.usableCardList = buyTicketInfo.usableCardList;
        // 2、获取购票座位信息
        const targetSeatRes =
          await this.seatManage.getTargetSeat(buyTicketInfo);
        if (!targetSeatRes) {
          // 座位列表为空，直接转单
          return await this.orderManage.transferOrder();
        }
        if (targetSeatRes.errorCode === "TARGET_SEAT_FAILED") {
          // 获取目标座位失败，猎人订单走申请换座
          if (
            plat_name === "lieren" &&
            dictStore.dictInfo.lierenIsSupportChangeSeat === 1
          ) {
            this.logger.infoSave("获取目标座位失败，猎人订单走申请换座逻辑");
            const isApplyChangeSeat =
              await this.platManage.applyChangeSeat(item);
            return {
              transferParams: { transfer_fee: 0 },
              offerRule: this.offerRule,
              isApplyChangeSeat
            };
          }
          return await this.orderManage.transferOrder();
        }
        buyTicketInfo.targetSeatCodes = targetSeatRes.seatCodes;
        buyTicketInfo.areaInfoList = targetSeatRes.areaInfoList;
      } else {
        // 换号出票操作（取消上个号的订单）
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinema_id: buyTicketInfo.cinema_id,
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
        // 取消订单释放座位成功后请求对应值，以免下次换号时携带过去
        buyTicketInfo.order_num = "";
        buyTicketInfo.lockOrderId = "";
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
        // 换号时等待1秒，避免被风控检测到一个ip快速换号
        await mockDelay(1);
      }
      this.currentSessionId =
        this.currentParamsList[this.currentParamsInx].session_id;
      this.currentPhone = this.currentParamsList[this.currentParamsInx].mobile;
      this.currentMemberPwd =
        this.currentParamsList[this.currentParamsInx].member_pwd;
      // 记录当前使用的手机号，出票失败消息会带上（最后失败的手机号）
      if (this.order) {
        this.order.last_fail_phone = this.currentPhone || "";
      }
      // 锁定座位前延迟一秒
      // await mockDelay(1);
      const {
        cinema_id,
        schedule_id,
        scheduleId,
        targetShow,
        targetSeatCodes,
        areaInfoList
      } = buyTicketInfo;
      this.logger.infoSave("座位价格相关信息", {
        areaInfoList
      });
      let seatlableList = [];
      try {
        let defaultPrice = areaInfoList.find(
          item => item.area_name == "默认区"
        )?.area_price;
        const areaInfoListPrice = areaInfoList
          .filter(item => item.area_name != "默认区")
          ?.map(item =>
            Object.entries(item.seats)
              .map(itemA => itemA[1])
              .map(itemB =>
                itemB.detail.map(itemC => ({
                  ...itemC,
                  area_price: item.area_price,
                  area_no: item.area_no
                }))
              )
          )
          .flat()
          .flat();
        console.log("areaInfoListPrice", areaInfoListPrice, defaultPrice);
        targetSeatCodes.forEach(item => {
          const price = areaInfoListPrice.find(
            itemA => itemA.seat_no == item.seat_no
          )?.area_price;
        });
        seatlableList = targetSeatCodes.map(item => {
          let targetSeatInfo = areaInfoListPrice.find(
            itemA => itemA.seat_no == item.seat_no
          );
          if (!targetSeatInfo) {
            targetSeatInfo = areaInfoList.find(
              item => item.area_name == "默认区"
            );
          }
          return (
            targetSeatInfo.area_no +
            ":" +
            item.row +
            ":" +
            item.col +
            ":" +
            item.seat_no
          );
        });
      } catch (error) {
        console.log("座位价格逻辑执行异常", error);
      }

      console.log("seatlableList", seatlableList);
      // 3、锁定座位
      let lockSeatParams = {
        cinema_id,
        schedule_id,
        seatCodes: seatlableList,
        lockseat,
        plat_name,
        order_number,
        session_id: this.currentSessionId
      };
      const lockRes = await this.seatManage.lockseatByApp(lockSeatParams);
      if (!lockRes) {
        const { err_info: errInfo } = this.logger.getLastErrMsgAndInfo();
        if (
          plat_name == "lieren" &&
          dictStore.dictInfo.lierenIsSupportChangeSeat == 1 &&
          ["座位已被锁定", "座位无效或已被锁定"].some(item =>
            errInfo.includes(item)
          )
        ) {
          // 走申请座位逻辑
          const isApplyChangeSeat = await this.platManage.applyChangeSeat(item);
          return {
            transferParams: {
              transfer_fee: 0
            },
            offerRule: this.offerRule,
            isApplyChangeSeat
          };
        }
        return await this.orderManage.transferOrder();
      }
      // 锁座id即创建订单id，但是不会真正创建订单，也不会真正锁座，后面不会有释放座位和取消座位的接口
      buyTicketInfo.lockOrderId = lockRes.data?.order_id;
      const { lockOrderId } = buyTicketInfo;
      // 3、获取锁座价格明细
      const targetCardId = this.usableCardList?.filter(
        item => item.mobile === this.currentPhone
      )?.[0]?.card_id; // 目标手机号余额最多的可用卡
      const calcParams = {
        cinema_id,
        card_id: targetCardId,
        lockOrderId,
        session_id: this.currentSessionId
      };
      this.logger.infoSave("获取锁座价格明细参数", calcParams);
      const calcResult = await this.orderManage.priceCalculation(calcParams);
      // 座位支付总价格
      let seatPayTotalPrice = calcResult?.data?.ticket_total_price;
      this.logger.infoSave("座位支付总价格", { seatPayTotalPrice });
      // 4、使用优惠券或者会员卡（仅判断是否有可用卡及券）
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
        canUseCardList = [], // 可用会员卡列表
        useQuan = [],
        profit = 0,
        quanStock
      } = cardQuanRes || {};
      // 由于offerRule可能被useQuanOrCard调整，后续使用地方需注意
      let { offerRule } = this;
      const { offer_type } = offerRule;
      if (!canUseCardList?.length && !useQuan?.length) {
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
          cinema_id,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 5、计算价格
      let quan_code = useQuan.map(item => item.couponCode).join(",");
      const calcRes = await this.orderManage.priceCalculation({
        ...buyTicketInfo,
        cinema_id,
        card_id: canUseCardList[0]?.card_id,
        quan_code,
        lockOrderId,
        session_id: this.currentSessionId
      });
      if (!calcRes) {
        this.logger.info("计算价格异常，走转单或换号处理");
        // 转单或换号处理
        const transparams = {
          cinema_id,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 实际支付价格
      let paymentAmount = calcRes?.data?.ticket_payment_total_price;
      this.logger.infoSave("实际支付价格", { paymentAmount });
      // 校验卡余额是否足够
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num * 100) / 1000;
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
        if (offerRule.is_store == "1" && quanStock - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.cardQuanManage.getNewQuan({
            cinema_id,
            quan_value: offerRule.quan_value,
            quan_flag: offerRule.quan_flag,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (quanStock - Number(ticket_num)),
            session_id: this.currentSessionId,
            asyncFlag: 1
          });
        }
      }
      // 支付前校验用券价格
      if (
        offer_type === "1" &&
        useQuan?.length &&
        paymentAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee_total,
          quan_fee,
          ticket_num
        });
        // 转单或换号处理
        const transparams = {
          cinema_id,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
      this.logger.infoSave("真实会员价价格", { real_member_price });
      if (offerRule.offer_type !== "1" && canUseCardList?.length) {
        if (paymentAmount > real_member_price) {
          if (subDecimal(paymentAmount, real_member_price) < profit) {
            this.logger.infoSave(
              "用完卡发现支付金额大于会员价*票数，利润需减去差值",
              {
                paymentAmount,
                real_member_price,
                profit
              }
            );
            profit = subDecimal(
              profit,
              subDecimal(paymentAmount, real_member_price)
            );
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              paymentAmount,
              real_member_price,
              ticket_num
            });
            // 转单或换号处理
            const transparams = {
              cinema_id,
              lockOrderId,
              session_id: this.currentSessionId
            };
            return await this.transferOrChangePhone(transparams, buyTicketInfo);
          }
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
      let card_id, cardNum;
      if (offer_type === "1" && useQuan?.length) {
      }
      if (offer_type === "2" && canUseCardList?.length) {
        card_id = canUseCardList[0]?.card_id;
        cardNum = canUseCardList[0]?.card_no_show;
      }
      if (this.isTestOrder) {
        this.logger.infoSave("测试单暂不购买");
        return { offerRule };
      }
      const createOrderRes = await this.orderManage.createOrder({
        cinema_id,
        lockOrderId,
        phoneNumber: this.currentPhone,
        session_id: this.currentSessionId
      });
      let order_num = createOrderRes?.order_id;
      if (!order_num) {
        // 从订单列表获取到目标订单
        await mockDelay(3);
        const orderInfo = await this.orderManage.getOrderInfoByOrderList({
          session_id: this.currentSessionId
        });
        order_num = orderInfo?.order_id;
      }
      if (!order_num) {
        if (createOrderRes?.isTimeout) {
          this.logger.infoSave("支付订单超时当成功处理");
        } else {
          this.logger.info("创建订单失败，单个订单直接出票结束走转单");
          // 转单或换号处理
          const transparams = {
            cinema_id,
            lockOrderId,
            session_id: this.currentSessionId
          };
          const transferParams =
            await this.orderManage.transferOrder(transparams);
          return { offerRule, transferParams };
        }
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
        await updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number,
          add_count: ticket_num
        });
        // 同步出票后的卡余额
        const cardBalance = canUseCardList?.find(
          item => item.card_id == card_id
        )?.cardAmount;
        this.logger.infoSave("支付卡信息", {
          cardId: card_id,
          cardNo: cardNum,
          cardBalance,
          paymentAmount
        });
        syncCardAfterPayment({
          appFlag: this.appFlag,
          cardId: card_id,
          cardBalance,
          paymentAmount,
          logger: this.logger
        }).catch(e =>
          this.logger.warn?.("出票后同步金逸卡余额异常(不影响主流程)", e)
        );
      }
      if (offerRule.offer_type === "1" && useQuan?.length) {
        // 更新券库存
        this.cardQuanManage.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_desc: offerRule.quan_desc,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.currentPhone
        });
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.orderManage.getQrcodeUploadByPlat({
        order_num,
        cinema_id,
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
        quan_code: quan_code,
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

window.jinyiTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new JinyiBuyTicket(order, logger, isTestOrder);
};
const testOrder = {
  id: "12412221440316515",
  supplier_end_price: 36,
  city_name: "武汉",
  cinema_addr: "市南区香港中路69号麦凯乐八楼",
  cinema_name: "金逸影城（光美荟聚IMAX店）",
  hall_name: "2号激光厅",
  film_name: "消失的人",
  show_time: "2026-05-24 19:35:00",
  cinema_code: "42018901",
  order_number: "12412221440316515",
  lockseat: "2排1座",
  plat_name: "lieren",
  app_name: "jinyiguangmei",
  appName: "jinyiguangmei",
  ticket_num: 1,
  rewards: 0,
  is_urgent: false,
  cinema_group: "",
  offer_end_time: 1778931000000
};
// 订单一键出票测试：
// window.jinyiTicketObj(order, true).singleTicket()
export default JinyiBuyTicket;

/**
 * 更新卡当天使用量
 *
 * */
const updateCardDayUse = ({
  app_name,
  card_id,
  plat_name,
  order_number,
  add_count
}) => {
  let error;
  try {
    svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id,
      add_count,
      plat_name
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
