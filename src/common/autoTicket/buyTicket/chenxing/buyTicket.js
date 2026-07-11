/**
 * 晨星出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现晨星系列出票逻辑
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
 * @module chenxing/buyTicket
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  subDecimal,
  mockDelay
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { GET_APP_INFO } from "@/common/constant";
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
 * 晨星出票类
 * 继承 BaseBuyTicket，实现晨星系列出票逻辑
 */
class ChenxingBuyTicket extends BaseBuyTicket {
  /**
   * 构造函数
   * @param {Object} order - 订单信息
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.api_version = GET_APP_INFO(order.app_name)?.api_version;
    this.usableCardList = []; // 可用会员卡列表
  }

  /**
   * 初始化依赖模块
   * 在 BaseBuyTicket 构造函数中会自动调用此方法
   * 注意：cinemaManage 和 cardQuanManage 需要延迟初始化（首次调用 oneClickBuyTicket 时），
   * 因为它们需要 offerRule 和 currentParamsList，这些在 getOrderOfferRule() 之后才可用
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
    this.seatManage = new SeatManage(this.order, this.logger);
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
        const phone = this.currentParamsList[0]?.mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`);
        // 库里维护的可用会员卡列表
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
            dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name)
          ) {
            this.logger.infoSave("获取目标座位失败，订单走申请换座逻辑");
            const isApplyChangeSeat = await this.platManage.applyChangeSeat({
              ...item,
              logger: this.logger
            });
            if (isApplyChangeSeat) {
              return {
                transferParams: { transfer_fee: 0 },
                offerRule: this.offerRule,
                isApplyChangeSeat
              };
            }
          }
          return await this.orderManage.transferOrder();
        }
        buyTicketInfo.targetSeatCodes = targetSeatRes.seatCodes;
        buyTicketInfo.discountList = targetSeatRes.discountList;
        buyTicketInfo.areaInfoList = targetSeatRes.areaInfoList;
        buyTicketInfo.cinemaPlanDto = targetSeatRes.cinemaPlanDto;
      } else {
        // 换号出票操作（取消上个号的订单）
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinemaCode: buyTicketInfo.cinemaCode,
          cinemaId: buyTicketInfo.cinemaId,
          lockOrderId: buyTicketInfo.lockOrderId,
          order_num: buyTicketInfo.order_num,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1]?.session_id
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
        const phone = this.currentParamsList[this.currentParamsInx]?.mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        // 换号时恢复原先券类型
        if (this.offerRule?.old_quan_value) {
          this.offerRule.quan_value = this.offerRule.old_quan_value;
        }
        // 换号时等待1秒，避免被风控检测到一个ip快速换号
        await mockDelay(1);
      }
      this.currentSessionId =
        this.currentParamsList[this.currentParamsInx]?.session_id || "";
      this.currentPhone =
        this.currentParamsList[this.currentParamsInx]?.mobile || "";
      // 记录当前使用的手机号，出票失败消息会带上（最后失败的手机号）
      if (this.order) {
        this.order.last_fail_phone = this.currentPhone || "";
      }
      const {
        cinemaCode,
        cinemaId,
        filmId,
        targetShow,
        targetSeatCodes,
        discountList,
        cinemaPlanDto,
        areaInfoList
      } = buyTicketInfo;
      this.logger.infoSave("座位价格相关信息", {
        discountList,
        cinemaPlanDto,
        areaInfoList
      });
      const { featureAppNo } = targetShow;
      // 3、锁定座位
      let lockSeatParams = {
        cinemaCode,
        cinemaId,
        filmId,
        featureAppNo,
        sessionCode: targetShow.sessionId,
        seatInfos: targetSeatCodes,
        seatCodes: targetSeatCodes,
        lockseat,
        plat_name,
        order_number,
        session_id: this.currentSessionId
      };
      const lockRes = await this.seatManage.lockseatByApp(lockSeatParams);
      if (!lockRes) {
        const { err_info: errInfo } = this.logger.getLastErrMsgAndInfo();
        if (
          dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name) &&
          ["锁座失败", "座位已销售"].some(item => errInfo.includes(item))
        ) {
          // 走申请座位逻辑
          const isApplyChangeSeat = await this.platManage.applyChangeSeat({
            ...item,
            logger: this.logger
          });
          if (isApplyChangeSeat) {
            return {
              transferParams: {
                transfer_fee: 0
              },
              offerRule: this.offerRule,
              isApplyChangeSeat
            };
          }
        }
        return await this.orderManage.transferOrder();
      }
      buyTicketInfo.lockOrderId = lockRes.lockOrderId;
      const { lockOrderId } = buyTicketInfo;
      // 4、使用优惠券或者会员卡（仅判断是否有可用卡及券）
      let { standardPrice: basePrice, serviceAddFee } = targetShow;
      this.logger.warn("会员价及手续费", { basePrice, serviceAddFee });
      const { api_version } = this;
      if (api_version === "3.0C") {
        serviceAddFee = cinemaPlanDto?.serviceAddFee;
        if (discountList?.length) {
          // 取最低价
          basePrice = discountList
            .filter(item => item.cardLevelCode)
            .map(item => item.price - item.cinemaPayAmount)
            .sort((a, b) => a - b)?.[0];
          this.logger.infoSave("从有卡优惠活动里取最低价", { basePrice });
          if (!basePrice) {
            basePrice = discountList
              .filter(item => !item.cardLevelCode)
              .map(item => item.price - item.cinemaPayAmount)
              .sort((a, b) => a - b)?.[0];
            this.logger.infoSave("从无卡优惠活动里取最低价", {
              basePrice,
              discountList
            });
          }
        } else {
          basePrice = cinemaPlanDto?.standardPrice;
        }
      } else {
        this.logger.infoSave("获取到座位价格信息列表", { areaInfoList });
        if (areaInfoList?.length) {
          // 取最高价
          basePrice = areaInfoList
            .map(item => item.areaPrice)
            .sort((a, b) => b - a)?.[0];
          this.logger.infoSave("取最高座位价格", { basePrice });
        }
      }
      this.logger.infoSave("会员服务费", { serviceAddFee });
      if (serviceAddFee) {
        basePrice = +basePrice + Number(serviceAddFee);
        this.logger.infoSave("最低价格+会员服务费", { basePrice });
      }
      const cardQuanRes = await this.cardQuanManage.useQuanOrCard({
        buyTicketInfo,
        offerRule: this.offerRule,
        basePrice,
        rewards,
        session_id: this.currentSessionId,
        currentPhone: this.currentPhone,
        usableCardList: this.usableCardList
      });
      this.logger.infoSave("用卡用券返回", cardQuanRes);
      let {
        card_id = "",
        cardNum = "",
        useCardList = [],
        useQuan = [],
        profit = 0,
        quanStock
      } = cardQuanRes || {};
      // 由于offerRule可能被useQuanOrCard调整，后续使用地方需注意
      let { offerRule } = this;
      const { offer_type } = offerRule;
      if (!useCardList?.length && !useQuan?.length) {
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
          cinemaCode,
          cinemaId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 5、计算价格拿到目标卡
      // 预计支付价格
      let real_member_price = offerRule?.real_member_price || 0;
      real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
      let quan_code = useQuan.map(item => item.couponCode);
      const calcRes = await this.orderManage.priceCalculation({
        ...buyTicketInfo,
        cardNum,
        useCardList,
        real_member_price,
        quan_code,
        session_id: this.currentSessionId
      });
      if (!calcRes) {
        this.logger.info("计算价格异常，走转单或换号处理");
        // 转单或换号处理
        const transparams = {
          cinemaCode,
          cinemaId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      card_id = calcRes?.cardNum;
      cardNum = calcRes?.cardNum;
      // 用卡余额
      let cardBalance = useCardList.find(
        item => item.cardNo == cardNum
      )?.cardAmount;
      // 实际支付价格
      const paymentAmount = calcRes?.priceDetail?.totalRealPayAmount;
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
        if (offerRule.is_store == "1" && quanStock - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券", {
            quanStock,
            ticket_num
          });
          this.cardQuanManage.getNewQuan({
            cinemaCode,
            cinemaId,
            quan_value: offerRule.quan_value,
            quan_flag: offerRule.quan_flag,
            quan_desc: offerRule.quan_desc,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (quanStock - Number(ticket_num)),
            session_id: this.currentSessionId,
            asyncFlag: 1
          });
        }
      }
      // 7、创建订单
      const createOrderRes = await this.orderManage.createOrder({
        cinemaCode,
        cinemaId,
        cardNum,
        lockOrderId,
        session_id: this.currentSessionId
      });
      let order_num = createOrderRes?.orderNumber;
      if (api_version == "C") {
        order_num = createOrderRes?.businessSystemFlowNumber;
      }
      if (!order_num) {
        this.logger.info("创建订单失败，单个订单直接出票结束走转单");
        // 转单或换号处理
        const transparams = {
          cinemaCode,
          cinemaId,
          lockOrderId,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      this.logger.infoSave("创建订单成功", {
        order_num,
        profit,
        card_id,
        offerRule
      });
      buyTicketInfo.order_num = order_num;

      // 测试模式下不购买，打印购买参数并取消订单释放座位
      if (this.isTestOrder) {
        const buyParams = {
          order_num,
          session_id: this.currentSessionId,
          appFlag: this.appFlag,
          cinemaCode,
          cinemaId,
          orderInfo: {
            order_number,
            plat_name,
            supplier_end_price,
            ticket_num,
            card_id,
            quan_code: quan_code?.join(),
            paymentAmount,
            profit
          }
        };
        console.log("========== 测试模式：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave("测试模式：购买参数", buyParams);

        // 测试模式下取消订单并释放座位
        const unlockSeatInfo = {
          cinemaCode,
          cinemaId,
          lockOrderId,
          order_num,
          session_id: this.currentSessionId
        };
        if (order_num) {
          try {
            this.logger.infoSave("测试模式：开始取消订单", unlockSeatInfo);
            const cancelRes =
              await this.orderManage.cancelOrder(unlockSeatInfo);
            this.logger.infoSave("测试模式：取消订单返回", {
              res: cancelRes,
              params: unlockSeatInfo
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
            this.logger.infoSave("测试模式：开始释放座位", unlockSeatInfo);
            const releaseRes =
              await this.orderManage.releaseSeat(unlockSeatInfo);
            this.logger.infoSave("测试模式：释放座位返回", {
              res: releaseRes,
              params: unlockSeatInfo
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
          cinemaCode,
          cinemaId,
          order_num,
          session_id: this.currentSessionId
        };
        return await this.transferOrChangePhone(transparams, buyTicketInfo);
      }
      // 支付前校验用卡价格
      if (offerRule.offer_type !== "1" && card_id) {
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
              cinemaCode,
              cinemaId,
              order_num,
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
      // 8、购买电影票
      const buyTicketRes = await this.orderManage.buyTicket({
        cinemaCode,
        cinemaId,
        cinemaName: buyTicketInfo.cinemaName,
        cardNo: cardNum,
        quan_code,
        amount: paymentAmount,
        order_num,
        member_pwd: this.currentParamsList[this.currentParamsInx]?.member_pwd,
        session_id: this.currentSessionId
      });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理");
        } else {
          // 转单或换号处理
          const transparams = {
            cinemaCode,
            cinemaId,
            order_num,
            session_id: this.currentSessionId
          };
          return await this.transferOrChangePhone(transparams, buyTicketInfo);
        }
      }
      if (card_id) {
        // 更新卡使用量
        await updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number,
          add_count: ticket_num
        });
        this.logger.infoSave("支付卡信息", {
          cardId: card_id,
          cardNo: card_id,
          cardBalance,
          paymentAmount
        });
        // 同步出票后的卡余额（paymentAmount 为卡实际支付额）
        syncCardAfterPayment({
          appFlag: this.appFlag,
          cardId: card_id,
          cardBalance,
          paymentAmount,
          logger: this.logger
        }).catch(e =>
          this.logger.warn?.("出票后同步辰星卡余额异常(不影响主流程)", e)
        );
      }
      if (offerRule.offer_type === "1" && useQuan?.length) {
        this.logger.infoSave("辰星 出票成功，准备更新券库存", {
          ticket_num,
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.currentPhone
        });
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
        cinemaCode,
        cinemaId,
        cardNum,
        order_num,
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

  /**
   * 转单或换号处理
   * @param {Object} params - 转单参数
   * @param {Object} buyTicketInfo - 购票信息
   * @returns {Promise<Object>} 转单结果
   */
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

export default ChenxingBuyTicket;

/**
 * 更新卡当天使用量
 * @param {Object} params - 参数对象
 * @param {string} params.app_name - 应用名称
 * @param {string} params.card_id - 卡ID
 * @param {string} params.plat_name - 平台名称
 * @param {string} params.order_number - 订单号
 * @param {number} params.add_count - 增加数量
 */
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

window.chenxingTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new ChenxingBuyTicket(order, logger, isTestOrder);
};
// 订单一键出票测试：
// window.chenxingTicketObj(order, true).singleTicket()
