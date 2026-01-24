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
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  subDecimal,
  getTargetCinemaCommon,
  formatTimeStrByLma,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  isNextDay,
  getPreviousDay
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO, NO_FEE_PLAT_LIST } from "@/common/constant";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import LmaSeatManage from "./seatManage.js";
import LmaOrderManage from "./orderManage.js";
import LmaCinemaManage from "./cinemaManage.js";
import LmaCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";

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
    let targetLoginList = getCinemaLoginInfoList().filter(
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

  /**
   * 获取订单报价规则
   *
   * 从报价记录中获取该订单对应的报价规则，设置到 this.offerRule
   *
   * @returns {Promise<void>}
   */
  async getOrderOfferRule() {
    const { app_name, order_number, plat_name, offer_order_number } =
      this.order;
    try {
      // 获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: tokens.userInfo.user_id,
        order_status: "1",
        app_name,
        order_number: plat_name != "mahua" ? order_number : offer_order_number,
        plat_name
      });
      this.offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logger.errorSave("获取该订单报价记录异常", { error });
    }
  }

  /**
   * 校验报价规则是否需要出票
   *
   * 检查 this.offerRule 是否存在且允许出票：
   * - rule_status="3" 表示仅报价，不允许出票
   * - quan_value="jinbaojia" 表示仅报价券，不允许出票
   *
   * @returns {boolean} true=允许出票，false=不允许出票（会发送微信通知）
   */
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
        // 使用cinemaManage获取购票前影院信息
        const cinemaInfoRes = await this.cinemaManage.getBuyPrevCinemaInfo({
          cinema_code,
          appFlag
        });
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

        const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
          cinema_id
        });
        if (!movieDataRes || !movieDataRes.film?.length) {
          this.logger.errorSave("获取影院放映列表异常", {
            error: movieDataRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }
        let movie_data = movieDataRes.film || [];

        let movieInfo = getMovieInfoFromFilmName({
          filmName: film_name,
          movieData: movie_data?.map(item => ({
            ...item,
            filmName: item.title
          }))
        });
        if (!movieInfo) {
          this.logger.errorSave("获取目标影片信息失败", {
            film_name,
            movie_data
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }
        short_code = movieInfo?.short_code;

        let playDateListRes = await this.cinemaManage.getMoviePlayDate({
          cinema_id,
          short_code
        });
        let playDateList = playDateListRes || [];
        if (!playDateList?.length) {
          this.logger.errorSave("获取影院放映日期异常", {
            error: playDateListRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }

        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1].slice(0, 5);

        if (isNextDay(start_day, start_time, "lma")) {
          start_day = getPreviousDay(start_day);
        }

        let targetDate = playDateList?.find(
          item => formatTimeStrByLma(item.date) === start_day
        );
        if (!targetDate) {
          this.logger.errorSave("匹配影片放映日期失败", {
            playDateList,
            start_day
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }

        let showList = targetDate?.session || [];
        let targetShowList = showList.filter(
          item => item.start_time === start_time
        );
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.screen_name,
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
          this.logger.errorSave("匹配影片放映场次失败", {
            showList,
            start_time
          });
          const transferParams = await this.orderManage.transferOrder(
            null,
            this.currentParamsList[this.currentParamsInx]?.lmaToken
          );
          return { transferParams };
        }

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

        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`, {
          currentParamsList: this.currentParamsList
        });
        this.curPhone = phone;
        show_id = targetShow.session_id;

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
        if (targetSeatRes?.error || !targetSeatRes?.seat_arr) {
          this.logger.errorSave("获取目标座位失败", {
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
      const priceRes = await this.orderManage.pripriceCalculation({
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

      // 手续费
      let shouxufei = (supplier_end_price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }

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
            console.log("测试模式：开始取消订单释放座位", cancelParams);
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

      // 更新卡余额
      if (card_id && card_balance) {
        this.orderManage.updateCardBalance({
          card_id,
          card_balance: card_balance?.replace("￥", "") || 0,
          paymentAmount
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
          orderInfo: item
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

      return {
        profit,
        qrcode,
        submitRes,
        quan_code,
        card_id,
        cardNum,
        offerRule
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
      let useMobileList = getCinemaLoginInfoList()
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

  /**
   * 验证待出票订单JSON
   *
   * 用于验证待出票订单的格式和核心方法的可执行性
   *
   * 执行流程：订单格式验证 → 登录信息获取 → 报价规则获取 → 影院信息获取 →
   *         电影信息获取 → 座位信息获取 → 按券库存排序登录信息（如果需要） →
   *         用卡流程（如果需要） → 用券流程
   *
   * 不执行流程：锁座（创建订单） → 价格计算 → 购买订单 → 上传取票码 → 转单
   *
   * 注意：验证会实际执行用卡（切换卡）和用券（绑定券）操作，会产生副作用
   *
   * @param {Object} orderJson - 待出票订单JSON
   * @param {string} orderJson.order_number - 订单号（必填）
   * @param {string} orderJson.plat_name - 平台名称（必填）
   * @param {string} orderJson.app_name - 影院标识（必填）
   * @param {string} orderJson.city_name - 城市名称（必填）
   * @param {string} orderJson.cinema_name - 影院名称（必填）
   * @param {string|number} orderJson.cinema_code - 影院编码（必填）
   * @param {string} orderJson.film_name - 电影名称（必填）
   * @param {string} orderJson.hall_name - 影厅名称（必填）
   * @param {string} orderJson.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss（必填）
   * @param {string} orderJson.lockseat - 座位信息，格式：如 "7排1座" 或 "7排1座,7排2座"（必填）
   * @param {number} orderJson.ticket_num - 票数（必填）
   * @param {number} orderJson.supplier_end_price - 中标价（必填）
   * @param {number} [orderJson.rewards] - 奖励百分比，默认0（可选）
   *
   * @returns {Promise<Object>} 验证结果：
   *   - valid: boolean，是否通过验证
   *   - errMsg: string，错误信息（验证失败时）
   *   - steps: Object，验证步骤结果
   *     - orderFormat: boolean，订单格式验证
   *     - loginInfo: boolean，登录信息获取
   *     - offerRule: boolean，报价规则获取
   *     - cinemaInfo: boolean，影院信息获取
   *     - movieInfo: boolean，电影信息获取
   *     - seatInfo: boolean，座位信息获取
   *     - sortLoginInfo: boolean，按券库存排序登录信息（如果需要）
   *     - useCard: boolean，用卡流程验证
   *     - useQuan: boolean，用券流程验证
   *   - cardInfo: Object，用卡信息（如果用卡成功）
   *   - quanInfo: Object，用券信息（如果用券成功）
   */
  async validateTicketOrder() {
    let orderJson = JSON.parse(JSON.stringify(this.order));
    const result = {
      valid: false,
      errMsg: "",
      steps: {}
    };

    try {
      // 1. 验证订单格式
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

      // 验证字段类型
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

      // 2. 验证登录信息获取
      this.order = orderJson;
      await this.getCinemaLoginInfo();
      if (!this.currentParamsList || this.currentParamsList.length === 0) {
        result.errMsg = "获取登录信息失败，无可用登录账号";
        result.steps.loginInfo = false;
        return result;
      }
      result.steps.loginInfo = true;

      // 3. 验证报价规则获取
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

      // 4. 验证影院信息获取
      const cinemaInfoRes = await this.cinemaManage.getBuyPrevCinemaInfo({
        cinema_code: orderJson.cinema_code,
        appFlag: this.appFlag
      });
      if (cinemaInfoRes?.error || !cinemaInfoRes?.cinema_id) {
        result.errMsg = `获取影院信息失败：${cinemaInfoRes?.error || "未知错误"}`;
        result.steps.cinemaInfo = false;
        return result;
      }
      result.steps.cinemaInfo = true;

      // 5. 验证电影信息获取
      const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
        cinema_id: cinemaInfoRes.cinema_id
      });
      if (!movieDataRes || !movieDataRes.film?.length) {
        result.errMsg = "获取电影放映信息失败";
        result.steps.movieInfo = false;
        return result;
      }

      // 匹配目标电影
      const movieInfo = getMovieInfoFromFilmName({
        filmName: orderJson.film_name,
        movieData: movieDataRes.film?.map(item => ({
          ...item,
          filmName: item.title
        }))
      });
      if (!movieInfo) {
        result.errMsg = "匹配目标电影失败";
        result.steps.movieInfo = false;
        return result;
      }

      // 获取放映日期和场次
      const playDateList = await this.cinemaManage.getMoviePlayDate({
        cinema_id: cinemaInfoRes.cinema_id,
        short_code: movieInfo.short_code
      });
      if (!playDateList?.length) {
        result.errMsg = "获取放映日期失败";
        result.steps.movieInfo = false;
        return result;
      }

      let start_day = orderJson.show_time.split(" ")[0];
      let start_time = orderJson.show_time.split(" ")[1]?.slice(0, 5);
      if (isNextDay(start_day, start_time, "lma")) {
        start_day = getPreviousDay(start_day);
      }

      const targetDate = playDateList?.find(
        item => formatTimeStrByLma(item.date) === start_day
      );
      if (!targetDate) {
        result.errMsg = "匹配放映日期失败";
        result.steps.movieInfo = false;
        return result;
      }

      const showList = targetDate?.session || [];
      const targetShowList = showList.filter(
        item => item.start_time === start_time
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList.forEach(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.screen_name,
            orderJson.hall_name,
            "hall_name"
          );
          item.similarity = repeatedCharsResult.similarity;
        });
        targetShowList.sort((a, b) => b.similarity - a.similarity);
        targetShow = targetShowList[0];
      }
      if (!targetShow) {
        result.errMsg = "匹配放映场次失败";
        result.steps.movieInfo = false;
        return result;
      }
      result.steps.movieInfo = true;

      // 6. 验证座位信息获取
      const seatDataRes = await this.seatManage.getSeatLayout({
        cinema_id: cinemaInfoRes.cinema_id,
        show_id: targetShow.session_id,
        lmaToken: this.currentParamsList[0]?.lmaToken
      });
      if (seatDataRes?.error || !seatDataRes?.seatData?.length) {
        result.errMsg = `获取座位布局失败：${seatDataRes?.error || "未知错误"}`;
        result.steps.seatInfo = false;
        return result;
      }

      const targetSeatRes = await this.seatManage.getTargetSeat({
        lockseat: orderJson.lockseat,
        seatList: seatDataRes.seatData,
        label_arr: seatDataRes.label_arr || [],
        ticket_num: orderJson.ticket_num
      });
      if (
        targetSeatRes?.error ||
        !targetSeatRes?.seat_arr ||
        targetSeatRes.seat_arr.length !== orderJson.ticket_num
      ) {
        result.errMsg = `获取目标座位失败：${targetSeatRes?.error || "座位数量不匹配"}`;
        result.steps.seatInfo = false;
        return result;
      }
      result.steps.seatInfo = true;

      // 保存座位信息，后续用卡用券需要
      const seat_arr = targetSeatRes.seat_arr;
      const short_code = seatDataRes.short_code;
      const show_id = targetShow.session_id;
      const city_id = cinemaInfoRes.city_id;
      const cinema_id = cinemaInfoRes.cinema_id;

      // 7. 按券库存排序登录信息（如果需要）
      if (this.offerRule.offer_type == 1 || this.offerRule.offerType == "1") {
        const sortMobileList = await this.getSortPhoneByQuanTypeList(
          this.appFlag,
          this.offerRule?.quan_flag,
          this.offerRule?.quan_value || this.offerRule?.quanValue,
          orderJson.ticket_num
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
        result.steps.sortLoginInfo = true;
      }

      // 8. 验证用卡流程（如果需要）
      const offerType = this.offerRule.offer_type || this.offerRule.offerType;
      if (offerType != "1" || (offerType == "1" && this.offerRule.quan_fee)) {
        const useCardRes = await this.cardQuanManage.useCardHandle({
          city_id,
          cinema_id,
          offerRule: this.offerRule,
          ticket_num: orderJson.ticket_num,
          supplier_end_price: orderJson.supplier_end_price,
          currentParamsList: this.currentParamsList,
          currentParamsInx: this.currentParamsInx
        });
        if (!useCardRes?.card_id) {
          result.errMsg = "用卡流程失败，无可用卡或卡余额不足";
          result.steps.useCard = false;
          return result;
        }
        result.steps.useCard = true;
        result.cardInfo = {
          card_id: useCardRes.card_id,
          card_balance: useCardRes.card_balance
        };
      } else {
        result.steps.useCard = true; // 不需要用卡，标记为通过
      }

      // 9. 验证用券流程
      const useQuanRes = await this.cardQuanManage.useQuanHandle({
        city_id,
        cinema_id,
        ticket_num: orderJson.ticket_num,
        offerRule: this.offerRule,
        show_id,
        seat_arr,
        supplier_end_price: orderJson.supplier_end_price,
        rewards: orderJson.rewards || 0,
        plat_name: orderJson.plat_name,
        order_number: orderJson.order_number,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx
      });

      if (useQuanRes?.error) {
        result.errMsg = `用券流程失败：${useQuanRes.error}`;
        result.steps.useQuan = false;
        return result;
      }
      result.steps.useQuan = true;
      if (useQuanRes?.quan_code) {
        result.quanInfo = {
          quan_code: useQuanRes.quan_code,
          quanStock: useQuanRes.quanStock
        };
      }

      // 注意：价格计算需要 order_str（锁座后才能获取），所以验证时不执行价格计算
      // 锁座（创建订单）及后续流程（购买、上传取票码）都不执行

      result.valid = true;
      return result;
    } catch (error) {
      result.errMsg = `验证过程异常：${formatErrInfo(error)}`;
      return result;
    }
  }
}
// 测试报价实例的方法
window.lmaTicketObj = (orderJson, isTestOrder) => {
  const logger = new Logger({ logType: 3 });
  return new LmaBuyTicket(orderJson, logger, isTestOrder);
};
// 订单出票管理相关方法组装校验：
// window.lmaTicketObj(order, true).validateTicketOrder()

// 订单一键出票测试：
// window.lmaTicketObj(order, true).singleTicket()
