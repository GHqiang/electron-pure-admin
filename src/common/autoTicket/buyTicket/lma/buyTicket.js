/**
 * LMA出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现 LMA 系列出票逻辑
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - LmaCinemaManage: 影院管理模块
 * - LmaSeatManage: 座位管理模块
 * - LmaOrderManage: 订单管理模块
 * - LmaCardQuanManage: 卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module lma/buyTicket
 */
import {
  mockDelay,
  formatErrInfo,
  sendWxPusherMessage,
  subDecimal,
  mulDecimal // 高精度乘法(避免手续费精度丢失)
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index";
import { getPlatFeeRate } from "../common/offerHelper";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import LmaSeatManage from "./seatManage.js";
import LmaOrderManage from "./orderManage.js";
import LmaCinemaManage from "./cinemaManage.js";
import LmaCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";
import { syncCardAfterPayment } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

const tokens = platTokens();

export default class LmaBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
  }

  /**
   * 初始化依赖模块
   * 初始化 platManage、cinemaManage、seatManage、orderManage、cardQuanManage
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder); // 平台管理模块
    this.cinemaManage = new LmaCinemaManage(this.order, this.logger); // 影院管理模块
    this.seatManage = new LmaSeatManage(
      this.order,
      this.logger,
      this.isTestOrder
    ); // 座位管理模块
    this.orderManage = new LmaOrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder
    ); // 订单管理模块
    this.cardQuanManage = new LmaCardQuanManage(this.order, this.logger); // 卡券管理模块
  }

  /**
   * 获取影院登录信息并设置当前token
   *
   * 从 getCinemaLoginInfoList() 获取该影院的登录信息列表，按优先级排序：
   * 1. first="1" 的优先
   * 2. 当前用户手机号优先
   *
   * 设置 this.currentParamsList 和 this.currentParamsInx = 0
   *
   * @returns {Promise<void>}
   */
  async getCinemaLoginInfo() {
    const { appFlag } = this;
    let targetLoginList = this.getLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );

    this.currentParamsList = targetLoginList
      .sort((a, b) => {
        // 优先按 first 字段排序
        if (a.first === "1" && b.first !== "1") return -1;
        if (a.first !== "1" && b.first === "1") return 1;

        // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
        if (a.first === "1" && b.first === "1") {
          if (a.mobile === tokens.userInfo.phone) return -1;
          if (b.mobile === tokens.userInfo.phone) return 1;
          return 0;
        }

        if (a.mobile === tokens.userInfo.phone) return -1;
        if (b.mobile === tokens.userInfo.phone) return 1;

        return 0;
      })
      .map(item => ({ ...item, lmaToken: item.session_id }));

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
   *
   * @param {Object} item - 订单信息
   * @param {number} item.id - 订单ID
   * @param {string} item.order_number - 订单号
   * @param {string} item.city_name - 城市名称
   * @param {string} item.cinema_name - 影院名称
   * @param {string|number} item.cinema_code - 影院编码
   * @param {string} item.film_name - 电影名称
   * @param {string} item.hall_name - 影厅名称
   * @param {string} item.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss
   * @param {string} item.lockseat - 座位信息，格式：如 "7排1座" 或 "7排1座,7排2座"
   * @param {number} item.ticket_num - 票数
   * @param {number} item.supplier_end_price - 中标价
   * @param {number} item.rewards - 奖励百分比
   * @param {string} item.supplierCode - 供应商编码
   * @param {string} item.plat_name - 平台名称
   * @param {Object} [item.otherParams] - 其他参数（换号出票时复用）
   * @param {Object} item.otherParams.offerRule - 报价规则
   * @param {string|number} item.otherParams.city_id - 城市ID
   * @param {string|number} item.otherParams.cinema_id - 影院ID
   * @param {string} item.otherParams.short_code - 影片编码
   * @param {string|number} item.otherParams.show_id - 场次ID
   * @param {Array} item.otherParams.seat_arr - 座位数组
   * @param {string} item.otherParams.order_str - 锁座订单号
   * @param {string} item.otherParams.start_day - 放映日期
   * @param {string} item.otherParams.start_time - 放映时间
   *
   * @returns {Promise<Object|undefined>} 出票结果：
   *   - profit: 利润
   *   - qrcode: 取票码
   *   - submitRes: 上传取票码结果
   *   - quan_code: 使用的券码
   *   - card_id: 使用的卡号
   *   - cardNum: 卡号（同card_id）
   *   - offerRule: 报价规则
   *   - transferParams: 转单参数（失败时）
   *   失败返回 undefined 或包含 transferParams 的对象
   */
  async oneClickBuyTicket(item) {
    const { appFlag } = this;
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
      offerRule,
      city_id,
      cinema_id,
      short_code,
      show_id,
      seat_arr,
      order_str,
      start_day,
      start_time
    } = otherParams || {};

    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = offerRule?.rewards || 0;
    }

    try {
      this.logger.info("一键买票待下单信息", item);

      if (this.currentParamsInx === 0) {
        // 首次出票：获取影院、电影、场次、座位信息
        // 使用cinemaManage获取购票前影院信息（复用 getMovieInfo 的完整缓存逻辑）
        const cinemaInfoRes = await this.cinemaManage.getBuyPrevCinemaInfo();
        if (cinemaInfoRes?.error) {
          this.logger.errorSave("获取购票前影院信息异常", {
            error: cinemaInfoRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }
        cinema_id = cinemaInfoRes.cinema_id;
        city_id = cinemaInfoRes.city_id;
        short_code = cinemaInfoRes.short_code;
        show_id = cinemaInfoRes.show_id;
        start_day = cinemaInfoRes.start_day;
        start_time = cinemaInfoRes.start_time;

        // 按照券库存进行登录信息排序
        if (offerRule.offer_type == 1) {
          const sortMobileList = await this.getSortPhoneByQuanTypeList(
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

        // 纯用卡出票：指定卡号绑定的登录账号绝对优先（先于 first 标记与当前用户手机号）
        if (offerRule.offer_type != "1") {
          const priorityMobiles =
            await this.cardQuanManage.getPriorityCardMobileList();
          if (priorityMobiles.length) {
            this.currentParamsList = this.currentParamsList.sort((a, b) => {
              const aHit = priorityMobiles.includes(a.mobile);
              const bHit = priorityMobiles.includes(b.mobile);
              if (aHit && !bHit) return -1;
              if (!aHit && bHit) return 1;
              return 0; // 组内保持 getCinemaLoginInfo 已排好的顺序
            });
            this.logger.infoSave("登录信息按指定卡号优先排序后", {
              currentParamsList: this.currentParamsList,
              priorityMobiles
            });
          }
        }

        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`, {
          currentParamsList: this.currentParamsList
        });
        this.curPhone = phone;

        // 使用seatManage获取座位布局
        const seatDataRes = await this.seatManage.getSeatLayout({
          cinema_id,
          show_id,
          lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
        });
        let seatList = seatDataRes?.seatData || [];
        if (!seatList?.length || seatDataRes?.error) {
          this.logger.errorSave("获取座位布局异常", {
            error: seatDataRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }

        short_code = seatDataRes.short_code;
        let label_arr = seatDataRes?.label_arr || [];

        // 使用seatManage获取目标座位
        const targetSeatRes = await this.seatManage.getTargetSeat({
          lockseat,
          seatList,
          label_arr,
          ticket_num
        });
        if (targetSeatRes?.errorCode === "TARGET_SEAT_FAILED") {
          this.logger.errorSave("获取目标座位失败", {
            error: targetSeatRes?.error
          });
          // 获取目标座位失败，猎人订单走申请换座
          if (
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
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }
        if (targetSeatRes?.error || !targetSeatRes?.seat_arr) {
          // getTargetSeat异常，直接转单
          this.logger.errorSave("获取目标座位异常", {
            error: targetSeatRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }
        seat_arr = targetSeatRes.seat_arr;
      } else {
        // 换号出票
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        this.curPhone = phone;
        // 换号时等待1秒，避免被风控检测到一个ip快速换号
        await mockDelay(1);
      }

      let card_id, cardNum;
      let card_balance;

      // 如果需要用卡，锁座前就得准备好卡
      if (
        offerRule.offer_type != "1" ||
        (offerRule.offer_type == "1" && offerRule.quan_fee)
      ) {
        const useCardRes = await this.cardQuanManage.useCardHandle({
          city_id,
          cinema_id,
          offerRule,
          ticket_num,
          supplier_end_price,
          currentParamsList: this.currentParamsList,
          currentParamsInx: this.currentParamsInx
        });
        if (!useCardRes?.card_id) {
          if (this.currentParamsInx === this.currentParamsList.length - 1) {
            console.error("锁定座位前用卡异常", "走转单逻辑");
            const transferParams = await this.orderManage.transferOrder(
              null,
              this.currentParamsList[this.currentParamsInx]?.lmaToken
            );
            return { transferParams };
          } else {
            let otherParams = {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time,
              short_code
            };
            this.logger.infoSave("锁定座位前用卡异常，走换号", {
              otherParams
            });
            this.currentParamsInx++;
            return await this.oneClickBuyTicket({
              ...item,
              otherParams
            });
          }
        }
        card_id = useCardRes.card_id;
        cardNum = useCardRes.card_id;
        card_balance = useCardRes.card_balance;
        this.logger.infoSave("锁座前用卡成功", useCardRes);
      }

      // 卢米埃需要锁座前用券
      const useQuanRes = await this.cardQuanManage.useQuanHandle({
        city_id,
        cinema_id,
        ticket_num,
        offerRule,
        show_id,
        seat_arr,
        supplier_end_price,
        rewards,
        plat_name,
        order_number,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx
      });

      if (useQuanRes?.error) {
        this.logger.errorSave("锁定座位前用券异常", {
          error: useQuanRes?.error
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error("锁定座位前用券异常", "走转单逻辑");
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        } else {
          let otherParams = {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_arr,
            start_day,
            start_time,
            short_code
          };
          this.logger.infoSave("锁定座位前用券异常，走换号", {
            otherParams
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams
          });
        }
      }

      let { quan_code, quanStock } = useQuanRes || {};

      // 锁定座位/创建订单
      let lockRes;
      try {
        lockRes = await this.seatManage.lockseatByApp({
          cinema_id,
          show_id,
          short_code,
          seat_arr,
          quan_code,
          lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
        });
      } catch (error) {
        console.error("锁定座位失败", error);
        if (formatErrInfo(error)?.includes("超过会员购票限制")) {
          // 更新月使用量限制
          await this.cardQuanManage.updateMonthlyLimit(item, card_id);
          sendWxPusherMessage({
            orderInfo: this.order,
            msgType: 6,
            cardNoByPwdError: card_id,
            failReason:
              "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量"
          });
        }
        const { err_info: errInfo } = this.logger.getLastErrMsgAndInfo();
        if (
          !this._hasAppliedChangeSeat &&
          dictStore.dictInfo.supportChangeSeatPlatList.includes(plat_name) &&
          ["座位已被锁定"].some(item => errInfo.includes(item))
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
        // catch 时 lockRes 必为 undefined，直接走转单逻辑
        this.logger.infoSave("锁定座位失败走转单");
        const transferParams = await this.orderManage.transferOrder(
          null,
          this.currentParamsList[this.currentParamsInx]?.lmaToken
        );
        return { offerRule, transferParams };
      }

      order_str = lockRes?.data?.order_str;
      if (!card_id && !quan_code) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            "优惠券和会员卡都无法使用，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.logger.errorSave("优惠券和会员卡都无法使用");
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time,
              short_code
            }
          });
        }
      }

      this.logger.infoSave("使用优惠券或者会员卡成功");

      // 计算订单价格
      const priceRes = await this.orderManage.priceCalculation({
        order_str,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
      });
      let priceInfo = priceRes?.price;
      if (priceRes?.error) {
        this.logger.errorSave(
          "使用优惠券或会员卡后计算订单价格异常：" + priceRes?.errMsg,
          {
            error: priceRes?.error
          }
        );
      }

      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
            "走转单逻辑"
          );
          const transferParams = await this.orderManage.transferOrder(
            { order_str },
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次创建订单前计算价格失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time,
              short_code
            }
          });
        }
      }

      this.logger.infoSave("计算订单价格返回", { priceRes });
      let paymentAmount = Number(priceInfo.price_str?.replace("￥", "") || 0);
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (offerRule.offer_type === "1" && paymentAmount > quan_fee_total) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee_total,
          ticket_num,
          quan_fee
        });
        const transferParams = await this.orderManage.transferOrder(
          { order_str },
          this.currentParamsList[this.currentParamsInx]?.lmaToken
        );
        return { offerRule, transferParams };
      }

      // 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
      const feeRate = getPlatFeeRate(this.order);
      let shouxufei = mulDecimal(Number(supplier_end_price || 0), feeRate);

      // 计算利润
      let profit;
      if (offerRule.offer_type !== "1") {
        profit = supplier_end_price - offerRule?.member_price - shouxufei;
        profit = Number(profit) * Number(ticket_num);
      } else {
        profit = Number(supplier_end_price) - offerRule.quan_cost - shouxufei;
        profit = (profit * 100 * ticket_num) / 100;
      }

      if (rewards > 0) {
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
          10000;
        profit += rewardPrice;
      }
      profit = profit.toFixed(2);

      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (paymentAmount > real_member_price) {
          this.logger.infoSave(
            "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量",
            {
              paymentAmount,
              real_member_price,
              ticket_num
            }
          );
          sendWxPusherMessage({
            orderInfo: this.order,
            msgType: 6,
            cardNoByPwdError: card_id,
            failReason:
              "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量"
          });
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
            const transferParams = await this.orderManage.transferOrder(
              { order_str },
              this.currentParamsList[this.currentParamsInx]?.lmaToken
            );
            return { offerRule, transferParams };
          }
        }
      }

      this.logger.infoSave("订单支付前计算订单价格成功");

      let order_num = order_str;
      // 测试情况下不进行购买，但需要取消订单释放座位
      if (this.isTestOrder) {
        // 打印购买参数
        const buyParams = {
          order_num: order_num,
          lmaToken: this.currentParamsList[this.currentParamsInx]?.lmaToken,
          appFlag: this.appFlag,
          orderInfo: {
            order_number: order_number,
            plat_name: plat_name,
            supplier_end_price: supplier_end_price,
            ticket_num: ticket_num,
            card_id: card_id,
            quan_code: quan_code,
            paymentAmount: paymentAmount,
            profit: profit,
            rewards: rewards
          }
        };
        console.log("========== 测试模式：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave("测试模式：购买参数", buyParams);

        // 取消订单释放座位
        if (order_str) {
          try {
            const cancelParams = {
              order_str: order_str,
              lmaToken: this.currentParamsList[this.currentParamsInx]?.lmaToken
            };
            this.logger.infoSave(
              "测试模式：开始取消订单释放座位",
              cancelParams
            );
            const cancelRes = await this.appApi.cannelOneOrder(cancelParams);
            this.logger.infoSave("测试模式：取消订单返回", {
              res: cancelRes,
              params: cancelParams
            });
            console.log("测试模式：取消订单成功，座位已释放", cancelRes);
          } catch (error) {
            this.logger.errorSave("测试模式：取消订单异常", {
              error: formatErrInfo(error),
              order_str: order_str
            });
            console.error("测试模式：取消订单失败", error);
          }
        } else {
          this.logger.warnSave("测试模式：order_str 为空，无法取消订单");
          console.warn("测试模式：order_str 为空，无法取消订单");
        }

        return { offerRule };
      }

      // 购买电影票
      const buyTicketRes = await this.orderManage.buyTicket({
        order_num,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
      });
      this.logger.infoSave("订单购买返回", buyTicketRes);
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        console.error("订单购买失败，单个订单直接出票结束", "走转单逻辑");
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", buyTicketRes);
        } else {
          this.logger.errorSave("订单购买异常", {
            error: buyTicketRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            { order_str },
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { offerRule, transferParams };
        }
      }
      this.logger.infoSave("订单购买成功");

      // 更新卡日使用量
      if (card_id) {
        await this.cardQuanManage.updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number,
          add_count: ticket_num
        });
        const oldBalance = parseFloat(
          (card_balance || "").replace("￥", "") || "0"
        );
        this.logger.infoSave("支付卡信息", {
          cardId: card_id, // lma card_id和card_num是一个值
          cardNo: card_id,
          cardBalance: oldBalance,
          paymentAmount
        });
        syncCardAfterPayment({
          appFlag: this.appFlag,
          cardId: card_id, // lma card_id和card_num是一个值
          cardBalance: oldBalance,
          paymentAmount,
          logger: this.logger
        }).catch(e =>
          this.logger.warn?.("出票后同步LMA卡余额异常(不影响主流程)", e)
        );
      }

      // 更新非入库券的券库存
      if (offerRule.offer_type === "1" && quan_code) {
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
      let qrcode;
      try {
        qrcode = await this.orderManage.payOrder({
          order_num,
          lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken,
          inx: 1
        });
      } catch (error) {
        this.logger.errorSave("获取订单支付结果异常", { error });
      }

      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        sendWxPusherMessage({
          orderInfo: item,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "获取订单支付结果，取票码不存在，准备开始异步轮询获取"
        });
        // 异步轮询获取取票码
        this.orderManage.asyncFetchQrcodeSubmit({
          order_num,
          lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken,
          app_name: appFlag,
          plat_name,
          order_number,
          orderInfo: item,
          profit
        });
        return { offerRule };
      }

      this.logger.infoSave("非异步获取订单支付结果成功");
      const submitRes = await this.orderManage.getQrcodeUploadByPlat({
        qrcode,
        orderInfo: item,
        flag: 1
      });

      if (submitRes) {
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }

      console.log("一键买票完成");
      if (profit) {
        profit = Number(profit).toFixed(2);
      }

      // 避免存入数组
      if (quan_code) {
        quan_code = JSON.parse(quan_code)
          .map(item => item.code)
          .join(",");
      }
      return {
        profit,
        qrcode,
        submitRes,
        quan_code,
        card_id,
        cardNum,
        offerRule,
        mobile: this.currentParamsList[this.currentParamsInx]?.mobile || ""
      };
    } catch (error) {
      this.logger.errorSave("一键买票异常", { error });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: JSON.stringify(error)
      });
      return { offerRule };
    }
  }

  // 获取排序手机号（按券库存）
  async getSortPhoneByQuanTypeList(
    app_name,
    quan_flag,
    quan_value,
    ticket_num
  ) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let quanValueList = quan_value?.split(",");
      let targetQuanList = quanTypeList.filter(item =>
        quanValueList.includes(item.quan_value)
      );
      const useMobileList = this.getLoginInfoList()
        .filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      this.logger.infoSave("获取影院目标券信息返回", {
        targetQuanList: JSON.parse(JSON.stringify(targetQuanList)),
        quan_flag,
        quan_value,
        useMobileList
      });

      targetQuanList.forEach(item => {
        let quanStockList = item?.quanStockList;
        if (quanStockList) {
          quanStockList = JSON.parse(quanStockList);
          quanStockList = quanStockList.map(itemA => ({
            ...itemA,
            quan_stock: itemA.quan_stock || 0
          }));
          quanStockList = quanStockList.filter(
            itemA =>
              useMobileList.includes(itemA.phone) &&
              itemA.quan_stock >= ticket_num
          );
          item.quanStockList = quanStockList;
        }
      });
      targetQuanList = targetQuanList.filter(
        item => !!item.quanStockList.length
      );
      let sortMobileList = this.getSortedPhones(targetQuanList, quanValueList);
      if (sortMobileList) {
        this.logger.infoSave("获取排序手机列表返回", {
          sortMobileList
        });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
    }
    return [];
  }

  // 获取排序手机号
  getSortedPhones(targetQuanList, quanValueList) {
    try {
      const sortedByQuanValue = [...targetQuanList].sort((a, b) => {
        return (
          quanValueList.indexOf(a.quan_value) -
          quanValueList.indexOf(b.quan_value)
        );
      });
      const fullySorted = sortedByQuanValue.map(item => ({
        ...item,
        quanStockList: [...item.quanStockList].sort(
          (a, b) => b.quan_stock - a.quan_stock
        )
      }));
      const phoneSet = new Set();
      const uniqueSortedPhones = [];
      fullySorted.forEach(item => {
        item.quanStockList.forEach(stock => {
          if (!phoneSet.has(stock.phone)) {
            phoneSet.add(stock.phone);
            uniqueSortedPhones.push(stock.phone);
          }
        });
      });
      return uniqueSortedPhones;
    } catch (error) {
      this.logger.infoSave("获取按照券库存及顺序排序手机号异常", {
        error,
        targetQuanList,
        quanValueList
      });
      return [];
    }
  }
}
// 测试报价实例的方法
window.lmaTicketObj = (orderJson, isTestOrder) => {
  const logger = new Logger({ logType: 3 });
  return new LmaBuyTicket(orderJson, logger, isTestOrder);
};
// 订单一键出票测试：
// window.lmaTicketObj(order, true).singleTicket()
