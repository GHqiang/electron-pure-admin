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
import {
  mockDelay,
  getOfferRuleById,
  sendWxPusherMessage,
  subDecimal,
  formatErrInfo
} from "@/utils/utils";
import Logger from "@/common/logger";
import svApi from "@/api/sv-api";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import SeatManage from "./seatManage.js";
import OrderManage from "./orderManage.js";
import CinemaManage from "./cinemaManage.js";
import CardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";
import { dictTable } from "@/store/dictTable";
import { syncCardAfterPayment } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";
const dictStore = dictTable();

import {
  sortLoginByCardPhones,
  sortLoginByQuanPhones
} from "../common/loginHelper.js";

class WandaBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.usableCardList = []; // 可用会员卡列表
  }

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
    } else {
      this.currentSessionId = "";
      this.currentPhone = "";
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

    // 换号出票需要用到的字段
    let { offerRule, city_id, cinema_id, show_id, seat_ids, order_num } =
      buyTicketInfo || {};

    try {
      this.logger.infoSave("一键买票待下单信息", item);

      // ========== 首次出票：解析影院/影片/座位 ==========
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
        buyTicketInfo.session_id = this.currentParamsList[0].session_id;

        // 库里维护的可用会员卡列表(已按余额倒序)
        this.usableCardList = buyTicketInfo.usableCardList;

        city_id = buyTicketInfo.city_id;
        cinema_id = buyTicketInfo.cinema_id; // 影院id,同storeId
        show_id = buyTicketInfo.show_id; // 场次id同showtimeId

        // 2、获取购票座位信息
        let targetSeatRes =
          await this.seatManage.getTargetSeat(buyTicketInfo);
        if (!targetSeatRes) {
          // 座位列表为空，直接转单
          return await this.orderManage.transferOrder();
        }
        if (targetSeatRes.errorCode === "TARGET_SEAT_FAILED") {
          // 获取目标座位失败，猎人订单走申请换座
          let retrySeatResolved = false; // 申请换座返回"有原座"后重新获取座位成功
          if (
            !this.order.isFromChangeSeat &&
            !this._hasAppliedChangeSeat &&
            dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name)
          ) {
            this.logger.infoSave("获取目标座位失败，订单走申请换座逻辑");
            this._hasAppliedChangeSeat = true;
            const isApplyChangeSeat = await this.platManage.applyChangeSeat({
              ...item,
              logger: this.logger
            });
            if (isApplyChangeSeat === true) {
              return {
                transferParams: { transfer_fee: 0 },
                offerRule: this.offerRule,
                isApplyChangeSeat: true
              };
            }
            if (isApplyChangeSeat?.retryLock) {
              // 申请换座返回"有原座"：座位可能已释放，等2秒重新获取座位布局后继续锁座
              this.logger.infoSave(
                '申请换座返回"有原座"，等待2秒后重新获取座位继续出票'
              );
              await mockDelay(2);
              targetSeatRes =
                await this.seatManage.getTargetSeat(buyTicketInfo);
              if (
                targetSeatRes &&
                targetSeatRes.errorCode !== "TARGET_SEAT_FAILED"
              ) {
                retrySeatResolved = true;
              } else {
                this.logger.errorSave("有原座重新获取座位仍失败，走转单");
              }
            }
          } else {
            this.logger.infoSave(
              "获取目标座位失败，但本次出票已申请过换座，不再重复申请，直接转单"
            );
          }
          // 未通过 retryLock 拿到座位，直接转单
          if (!retrySeatResolved) {
            return await this.orderManage.transferOrder();
          }
          // retryLock 拿到座位，继续往下走锁座流程
        }
        buyTicketInfo.targetSeatCodes = targetSeatRes.seatCodes;

        buyTicketInfo.areaInfoList = targetSeatRes.areaInfoList;
        // salesPrice 对比：场次级 member_price vs 区域级 seat.salesPrice
        // 小程序用场次级 this.salesPrice，若两者不一致可能导致万达锁座失败(subOrderStatus=20)
        try {
          const _showLevelPrice = buyTicketInfo.member_price;
          const _seatLevelPrices = targetSeatRes.seatCodes.map(
            s => s.salesPrice
          );
          this.logger.infoSave("锁座salesPrice对比", {
            showLevelPrice: _showLevelPrice,
            seatLevelPrices: _seatLevelPrices,
            isConsistent:
              _seatLevelPrices.length > 0 &&
              _seatLevelPrices.every(p => p === _showLevelPrice)
          });
        } catch (error) {}
        // 锁座-创建订单座位编码
        buyTicketInfo.seat_ids = targetSeatRes.seatCodes
          .map(s => `${s.seatId},${s.salesPrice || 0},undefined,0`)
          .join("|");
        // 座位区域和座位号，用卡用券时要用
        buyTicketInfo.partition = targetSeatRes.seatCodes
          .map(s => `${s.areaCode}-${s.seatId}`)
          .join("|");
      } else {
        // ========== 换号重试：先释放旧座位 ==========
        // 换号出票操作（取消上个号的订单）
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          orderId: buyTicketInfo.order_num,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (buyTicketInfo.order_num) {
          isCancel = await this.orderManage.cancelOrder(unlockSeatInfo);
        }
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          return await this.orderManage.transferOrder();
        }
        // 取消订单释放座位成功后请求对应值，以免下次换号时携带过去
        buyTicketInfo.order_num = "";
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
      // 记录当前使用的手机号，出票失败消息会带上（最后失败的手机号）
      if (this.order) {
        this.order.last_fail_phone = this.currentPhone || "";
      }
      console.warn("锁座前的buyTicketInfo", buyTicketInfo);
      // ========== 创建订单（锁座 + 验证订单状态 + 重试） ==========
      // 全部锁座+验证+重试逻辑已封装到 orderManage.lockAndCreateOrder
      let lockResult = await this.orderManage.lockAndCreateOrder({
        dId: buyTicketInfo.show_id,
        mobile: this.currentPhone,
        seatId: buyTicketInfo.seat_ids,
        session_id: this.currentSessionId
      });

      if (!lockResult.success) {
        // 锁座验证全部失败 → 等价于获取目标座位失败
        // 省和猎人走申请换座，其它平台直接转单
        this.logger.errorSave("锁座验证全部失败，视为获取目标座位失败");
        if (
          !this.order.isFromChangeSeat &&
          !this._hasAppliedChangeSeat &&
          dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name)
        ) {
          this.logger.infoSave("获取目标座位失败，订单走申请换座逻辑");
          this._hasAppliedChangeSeat = true;
          const applyRes = await this.platManage.applyChangeSeat({
            ...item,
            logger: this.logger
          });

          if (applyRes?.retryLock) {
            // 申请换座返回"有原座"：原座可能已被释放（之前锁失败是因座位被临时占用）
            // 等2秒缓冲后用原 seatId 重新锁座1次，成功则继续主流程出票
            this.logger.infoSave(
              '申请换座返回"有原座"，等待2秒后重新锁座继续出票'
            );
            await mockDelay(2);
            lockResult = await this.orderManage.lockAndCreateOrder({
              dId: buyTicketInfo.show_id,
              mobile: this.currentPhone,
              seatId: buyTicketInfo.seat_ids,
              session_id: this.currentSessionId
            });
            if (lockResult.success) {
              this.logger.infoSave("有原座重新锁座成功，继续出票流程");
              // 不 return，往下走主流程（价格计算→用卡用券→支付）
            } else {
              this.logger.errorSave("有原座重新锁座仍失败，走转单");
              return await this.orderManage.transferOrder();
            }
          } else if (applyRes === true) {
            // 申请换座成功（平台已受理换座申请）
            return {
              transferParams: { transfer_fee: 0 },
              offerRule: this.offerRule,
              isApplyChangeSeat: true
            };
          } else {
            // 申请换座其他失败，走转单
            return await this.orderManage.transferOrder();
          }
        } else if (this._hasAppliedChangeSeat) {
          this.logger.infoSave(
            "锁座失败，但本次出票已申请过换座，不再重复申请，直接转单"
          );
          return await this.orderManage.transferOrder();
        } else {
          return await this.orderManage.transferOrder();
        }
      }

      order_num = lockResult.order_num;
      buyTicketInfo.order_num = order_num;

      // ========== 获取锁座后订单价格（从 Wanda 订单取真实全价） ==========
      // 3、获取锁座价格明细;
      const calcParams = {
        orderId: order_num,
        session_id: this.currentSessionId
      };
      const calcResult = await this.orderManage.priceCalculation(calcParams);
      if (!calcResult) {
        this.logger.info("获取锁座价格明细异常，走转单或换号处理");
        // 转单或换号处理
        const transparams = {
          orderId: order_num,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 座位支付总价格：订单总价 = 卖品 + 票款
      let seatPayTotalPrice = calcResult.ticketAmount + calcResult.snackAmount;

      seatPayTotalPrice = seatPayTotalPrice / 100;

      let channelFee =
        buyTicketInfo.targetSeatCodes
          .map(item => item.channelFee)
          .reduce((acc, cur) => acc + cur, 0) / 100;

      this.logger.infoSave("座位支付总价格和渠道费", {
        seatPayTotalPrice,
        channelFee
      });

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
      offerRule = this.offerRule;
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
          orderId: order_num,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 5、计算最终支付价格（对照小程序 calcRealPayPrice，统一用元）
      const orderPrice = seatPayTotalPrice; // 元（已 /100）

      let couponDeduction = 0; // 券抵扣额(元)
      let cardPayPrice = 0; // 卡支付额(元)
      // 用券手续费，即补钱金额
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      // 与 cardQuanManage.js 保持一致，quan_fee 已是元，乘以票数即为总补钱金额（元）
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;

      if (offer_type === "1" && useQuan?.length) {
        // 兑换券全抵扣，支付额 = 0 + 手续费
        couponDeduction = orderPrice;
        // 如果券需要补钱，券抵扣金额就是订单总价-补钱金额
        if (quan_fee_total) {
          couponDeduction = orderPrice - quan_fee_total;
          const maxCardBalance = (canUseCardList[0]?.balance || 0) / 100;
          // 用券补钱场景卡抵扣金额
          cardPayPrice = Math.min(maxCardBalance, quan_fee_total);
          if (quan_fee_total > maxCardBalance) {
            this.logger.errorSave("最大卡余额不够支付券手续费");
            // 转单或换号处理
            const transparams = {
              orderId: order_num,
              session_id: this.currentSessionId
            };
            return await this.transferOrChangePhone(transparams, buyTicketInfo);
          }
        }
      }

      if (offer_type !== "1" && canUseCardList?.length) {
        // balance 是分 → 元
        const cardBalance = (canUseCardList[0]?.balance || 0) / 100;
        const remaining = orderPrice - couponDeduction;
        cardPayPrice = Math.min(cardBalance, remaining);
      }

      let paymentAmount = orderPrice - couponDeduction - cardPayPrice;
      if (paymentAmount < 0) paymentAmount = 0;

      // 券码,保存出票记录用
      let quan_code = useQuan.map(item => item.couponCode).join(",");

      this.logger.infoSave("最终支付价格计算", {
        orderPrice,
        couponDeduction,
        cardPayPrice,
        paymentAmount,
        unit: "元"
      });
      if (cardPayPrice && paymentAmount > 0) {
        this.logger.errorSave("会员卡余额不足");
        // 转单或换号处理
        const transparams = {
          orderId: order_num,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
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
          orderId: order_num,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
      this.logger.infoSave("真实会员价价格", { real_member_price });
      if (offerRule.offer_type !== "1" && canUseCardList?.length) {
        // 用卡场景利润计算时实际支付金额应等于卡抵扣金额，直接用卡抵扣金额对比计算就行
        if (cardPayPrice > real_member_price) {
          if (subDecimal(cardPayPrice, real_member_price) < profit) {
            this.logger.infoSave(
              "用完卡发现支付金额大于会员价*票数，利润需减去差值",
              {
                cardPayPrice,
                real_member_price,
                profit
              }
            );
            profit = subDecimal(
              profit,
              subDecimal(cardPayPrice, real_member_price)
            );
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              cardPayPrice,
              real_member_price,
              ticket_num
            });
            // 转单或换号处理
            const transparams = {
              orderId: order_num,
              session_id: this.currentSessionId
            };
            return await this.transferOrChangePhone(transparams, buyTicketInfo);
          }
        } else if (cardPayPrice < real_member_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_price * 1000 - cardPayPrice * 1000) *
              member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
      }
      console.warn("经过支付价格校验后的利润", profit);
      // 7、创建订单
      let card_id, cardNum;
      if (offer_type === "2" && canUseCardList?.length && cardPayPrice > 0) {
        card_id = canUseCardList[0]?.cardNo;
        cardNum = canUseCardList[0]?.cardNo;
      }
      // 支付参数：对照 APP 端 merge_payment 抓包格式
      const requestInfo = {};

      // activity 区块：小程序走 ticket-api-prd-mx（微信云，支持 %uXXXX 编码），
      // 但本系统通过 front-gateway-c 代理，%uXXXX 中文编码会导致 500。
      // 测试验证不带 activity 可正常完成卡支付，故跳过。
      // 如需 activity（如 detailtype=2 积分抵扣），须将 merge_payment 路由到 ticket-api-prd-mx。

      // storedCardPayments：仅当实际用卡支付时（cardPayPrice > 0），纯券时不加
      // 只取余额最高的卡（canUseCardList 已按余额倒序），避免多卡重复扣款
      if (canUseCardList?.length && cardPayPrice > 0) {
        const payCard = canUseCardList[0];
        requestInfo.storedCardPayments = [
          {
            paymentType: 1,
            cardNumber: payCard.cardNo,
            ticketType: payCard.cardTypeCode || "",
            ticketTypeName: payCard.cardTypeName || "",
            paymentPrice: Math.round(cardPayPrice * 100)
          }
        ];
      }

      // ★ 对照小程序 confirm/index.js:1829：
      // cardPayment 只在有活动优惠（activity）时才设置，纯卡支付只传 storedCardPayments。
      // 当前 activity 区块已跳过，故 cardPayment 不传。
      // 如需支持 activity 积分抵扣等场景，在此处 conditionally 添加：
      // if (activitySelected) { requestInfo.cardPayment = { ... }; }

      // ticketVoucher：券（对照小程序 convertDataStructure）
      if (useQuan?.length) {
        const quan = useQuan[0];
        // discountPrice 不能超过订单总价（分），否则 merge_payment 返回 93330020
        const maxDiscount = Math.round(orderPrice * 100);
        const rawDiscount = quan.price || Math.round(couponDeduction * 100);
        const discountPrice = Math.min(rawDiscount, maxDiscount);
        // allotseat 存在时直接用（selectcoupon 一次性选所有券，allotseat 已涵盖全部票）；
        // 不存在时兜底用券码拼接（与原逻辑一致）
        const voucher =
          useQuan[0].allotseat || useQuan.map(q => q.couponCode).join(",");
        requestInfo.ticketVoucher = {
          voucher,
          discountPrice
        };
        this.logger.infoSave("券抵扣金额（已封顶）", {
          rawDiscount,
          maxDiscount,
          discountPrice,
          orderPrice,
          ticketNum: ticket_num
        });
      }

      // externalPayment: 仅当第三方支付额 > 0（不传 paymentType，走默认支付方式）
      if (paymentAmount > 0) {
        requestInfo.externalPayment = {
          paymentPrice: Math.round(paymentAmount * 100)
        };
      }

      requestInfo.orderId = String(order_num);

      // merge_payment 使用当前登录用户的 session_id（小程序凭证）
      const payParams = {
        orderId: order_num,
        mobilePhone: this.currentPhone,
        cinemaId: cinema_id,
        requestInfo, // orderManage.createOrder 内部会 JSON.stringify
        session_id: this.currentSessionId
      };

      this.logger.infoSave("支付参数", payParams);
      if (this.isTestOrder) {
        // 直接取消订单，方便测试
        await this.orderManage.cancelOrder({
          orderId: order_num,
          session_id: this.currentSessionId
        });
        this.logger.infoSave("测试单暂不购买");
        return { offerRule };
      }
      const createOrderRes = await this.orderManage.createOrder(payParams);
      // 支付成功判断：bizCode === 0
      if (!createOrderRes?.success) {
        console.warn("购买失败先取消");
        if (createOrderRes?.isTimeout) {
          this.logger.infoSave("支付订单超时当成功处理");
        } else {
          this.logger.info("创建订单失败，单个订单直接出票结束走转单");
          // 转单或换号处理
          const transparams = {
            orderId: order_num,
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
        tradeNo: createOrderRes?.tradeNo,
        offerRule
      });
      // 交易流水号
      buyTicketInfo.tradeNo = createOrderRes?.tradeNo;
      if (!createOrderRes?.tradeNo) {
        this.logger.infoSave(
          "[支付] merge_payment 未返回 tradeNo（可能为同步扣款，无需轮询）",
          { order_num }
        );
      }
      // V3 L0：支付前卡余额（提升到外层声明，供 return 采集 use_path/card_balance）
      let cardBalance = null;
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
        const oldBalance =
          (canUseCardList?.find(item => item.cardNo == card_id)?.balance || 0) /
          100; // 元
        // V3 L0：支付前卡余额采集（供 return 组装 use_path/card_balance）
        cardBalance = oldBalance;
        this.logger.infoSave("支付卡信息", {
          cardId: card_id,
          cardNo: card_id,
          cardBalance: oldBalance,
          paymentAmount: cardPayPrice
        });
        syncCardAfterPayment({
          appFlag: this.appFlag,
          cardId: card_id,
          cardBalance: oldBalance,
          paymentAmount: cardPayPrice,
          logger: this.logger
        }).catch(e =>
          this.logger.warn?.("出票后同步万达卡余额异常(不影响主流程)", e)
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
      // 最后处理：获取支付结果上传取票码（传入 tradeNo 以触发储值卡支付轮询）
      const lastRes = await this.orderManage.getQrcodeUploadByPlat({
        order_num,
        tradeNo: createOrderRes?.tradeNo,
        session_id: this.currentSessionId,
        profit
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      console.log("一键买票完成");
      if (profit) {
        profit = Number(profit).toFixed(2);
      }
      // V3 L0：用券用卡快照采集（挂 ticketRes，BaseTicketQueue.saveTicketRecord 收口入库）
      const couponsSnapshot = (useQuan || []).slice(0, 10).map(item => ({
        couponType: item.couponType,
        couponCode: item.couponCode,
        couponName: item.couponName
      }));
      const usePath = this.buildTicketUsePath({
        offer_type,
        useQuan: useQuan || [],
        cardNum,
        cardBalance,
        paymentAmount,
        currentParamsInx: this.currentParamsInx
      });
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code: quan_code,
        card_id,
        cardNum,
        offerRule,
        mobile: this.currentPhone,
        // 数值列传 null（非 ""）：saveTicketRecord 收口处 ?? null 兜底，
        // "" 会绕过 ?? 且被 MySQL 严格模式拒绝写入 DECIMAL 列（ERROR 1366）
        paymentAmount: paymentAmount ?? null,
        cardBalance: cardBalance ?? null,
        coupons: couponsSnapshot,
        usePath
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

  /**
   * V3 L0：拼装一句话用券用卡路径（入库 use_path，供详情页直接可读）
   * @private
   */
  buildTicketUsePath({
    offer_type,
    useQuan,
    cardNum,
    cardBalance,
    paymentAmount,
    currentParamsInx
  }) {
    const steps = [];
    if (currentParamsInx > 0) {
      steps.push(`换号${currentParamsInx}次`);
    }
    if (offer_type === "1" && useQuan?.length) {
      steps.push(`用券${useQuan.length}张`);
      if (cardNum) {
        steps.push(
          `卡尾号${String(cardNum).slice(-4)}付券手续费${paymentAmount ?? ""}`
        );
      } else {
        steps.push(`实付${paymentAmount ?? ""}`);
      }
    } else if (cardNum) {
      steps.push(`用卡尾号${String(cardNum).slice(-4)}`);
      if (cardBalance != null && cardBalance !== "") {
        steps.push(`支付前余额${cardBalance}`);
      }
      steps.push(`实付${paymentAmount ?? ""}`);
    }
    return steps.join("→");
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

window.wandaTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new WandaBuyTicket(order, logger, isTestOrder);
};
const testOrder = {
  id: "12607100956217463",
  supplier_end_price: 32,
  city_name: "南京",
  cinema_addr: "太仓市上海东路188号万达广场四楼",
  ticket_num: 1,
  cinema_name: "南京万达影城江宁太阳城店",
  hall_name: "7号激光厅",
  film_name: "功夫女足",
  show_time: "2026-07-12 12:30:00",
  rewards: 0,
  is_urgent: 0,
  cinema_group: "c_wanda",
  cinema_code: "32019011",
  order_number: "12607100956217461",
  lockseat: "3排1座",
  plat_name: "mayi",
  app_name: "wanda",
  appName: "wanda",
  isNewOrder: true
};

// 订单一键出票测试：
// window.wandaTicketObj(order, true).singleTicket()

export default WandaBuyTicket;
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
