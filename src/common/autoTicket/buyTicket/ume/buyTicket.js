/**
 * UME出票主流程模块
 *
 * 职责：
 * - 继承 BaseBuyTicket 基类，实现 UME 系列出票逻辑
 * - 出票流程编排：登录信息获取、报价规则获取、影院/场次/座位解析、卡券使用、锁座、购买、取票码上传
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - BaseBuyTicket: 出票基类，提供模板方法
 * - UmeCinemaManage: 影院管理模块
 * - UmeSeatManage: 座位管理模块
 * - UmeOrderManage: 订单管理模块
 * - UmeCardQuanManage: 卡券管理模块
 * - PlatManage: 平台管理模块
 *
 * @module ume/buyTicket
 */
import {
  mockDelay,
  formatErrInfo,
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  subDecimal,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  getPreviousDay,
  trial
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index";
import { TEST_NEW_PLAT_LIST } from "@/common/constant";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import UmeSeatManage from "./seatManage.js";
import UmeOrderManage from "./orderManage.js";
import UmeCinemaManage from "./cinemaManage.js";
import UmeCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";

const tokens = platTokens();

export default class UmeBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
    this.usableCardList = [];
    this.curPhone = "";
  }

  /**
   * 初始化依赖模块
   * 初始化 platManage、cinemaManage、seatManage、orderManage、cardQuanManage
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder); // 平台管理模块
    this.cinemaManage = new UmeCinemaManage(this.order, this.logger); // 影院管理模块
    this.seatManage = new UmeSeatManage(
      this.order,
      this.logger,
      this.isTestOrder
    ); // 座位管理模块
    const getCurrentParams = () => ({
      list: this.currentParamsList,
      inx: this.currentParamsInx
    });
    this.orderManage = new UmeOrderManage(
      this.order,
      this.logger,
      this.platManage,
      this.isTestOrder,
      getCurrentParams
    ); // 订单管理模块
    this.cardQuanManage = new UmeCardQuanManage(this.order, this.logger); // 卡券管理模块
  }

  /**
   * 获取影院登录信息并设置当前token
   *
   * 从 getCinemaLoginInfoList() 获取该影院的登录信息列表，按优先级排序：
   * 1. first="1" 的优先
   * 2. 当前用户手机号优先
   * 3. 可用卡列表排序（用卡时）
   * 4. 可用券数量排序（用券时）
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

    this.currentParamsList = targetLoginList.sort((a, b) => {
      // 优先按 first 字段排序
      if (a.first === "1" && b.first !== "1") return -1;
      if (a.first !== "1" && b.first === "1") return 1;

      // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
      if (a.first === "1" && b.first === "1") {
        // 如果 a.mobile 是当前用户的手机号，则 a 应该排在 b 之前
        if (a.mobile === tokens.userInfo.phone) return -1;
        // 如果 b.mobile 是当前用户的手机号，则 b 应该排在 a 之前
        if (b.mobile === tokens.userInfo.phone) return 1;
        // 如果两个对象的 mobile 都不是当前用户的手机号，则按默认顺序排列
        return 0;
      }

      // 如果 first 都不是 '1'，则按 mobile 字段排序
      if (a.mobile === tokens.userInfo.phone) return -1;
      if (b.mobile === tokens.userInfo.phone) return 1;

      // 如果两个对象的 first 和 mobile 都相同，则按默认顺序排列
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
   * @param {string|number} item.otherParams.cinemaCode - 影院编码
   * @param {string|number} item.otherParams.cinemaLinkId - 影院链接ID
   * @param {string} item.otherParams.filmUniqueId - 电影唯一ID
   * @param {string|number} item.otherParams.scheduleId - 场次ID
   * @param {string} item.otherParams.scheduleKey - 场次Key
   * @param {Array} item.otherParams.seatList - 座位列表
   * @param {Array} item.otherParams.areaInfoList - 区域信息列表
   * @param {Array} item.otherParams.targeSeatList - 目标座位列表
   * @param {string} item.otherParams.showDate - 放映日期
   * @param {string} item.otherParams.showDateTime - 放映日期时间
   * @param {string} item.otherParams.orderCode - 订单编码
   * @param {string} item.otherParams.orderDate - 订单日期
   * @param {string|number} item.otherParams.orderHeaderId - 订单头ID
   * @param {string|number} item.otherParams.lockOrderId - 锁座订单ID
   * @param {number} item.otherParams.total_price - 总价
   * @param {Array} item.otherParams.ticketDetail - 座位详情
   * @param {Object} item.otherParams.targetShow - 目标场次信息
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
      cinemaCode,
      filmUniqueId,
      scheduleId,
      scheduleKey,
      seatList,
      areaInfoList,
      targeSeatList,
      showDate,
      showDateTime,
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
      rewards = offerRule?.rewards || 0;
    }
    try {
      if (this.currentParamsInx === 0) {
        // 首次出票：获取影院、电影、场次、座位信息
        // 2、获取目标城市影院列表
        let cityCinemaListRes = await this.cinemaManage.getCityCinemaList();
        const cityCinemaList = cityCinemaListRes?.cityCinemaList || [];
        if (!cityCinemaList.length) {
          this.logger.errorSave("获取城市影院列表异常", {
            error: cityCinemaListRes?.error
          });
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
        cinemaCode = targetCinema.cinemaCode;
        if (cinemaCode) {
          if (offerRule.offer_type != 1) {
            const usableCards = await this.cardQuanManage.getUsableCardList(
              cinemaCode,
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
                // 获取 a.mobile 在 sortMobileList 中的索引（不存在则返回 -1）
                const indexA = sortMobileList.indexOf(a.mobile);
                // 获取 b.mobile 在 sortMobileList 中的索引
                const indexB = sortMobileList.indexOf(b.mobile);

                // 规则1：a存在且b不存在 → a排前面
                if (indexA !== -1 && indexB === -1) return -1;

                // 规则2：a不存在且b存在 → b排前面
                if (indexA === -1 && indexB !== -1) return 1;

                // 其他情况：保持原顺序
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
        // 4、获取目标影院放映列表
        const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
          cinemaCode,
          cinemaLinkId
        });
        const movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取目标影院放映列表失败", {
            error: movieDataRes?.error
          });
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
        filmUniqueId = movieInfo.filmUniqueId;
        let start_day = show_time.split(" ")[0];
        showDate = start_day;
        // 7、获取某个放映日期的场次列表
        const showListRes = await this.cinemaManage.getMoviePlayTime({
          cinemaCode,
          cinemaLinkId,
          filmUniqueId,
          showDate: start_day
        });
        const showList = showListRes?.moviePlayTime || [];
        // 解决同一时间多场次问题
        let targetShowList = showList?.filter(
          item => +new Date(item.showDateTime) == +new Date(show_time)
        );
        targetShow = targetShowList?.[0];
        if (targetShowList?.length > 1) {
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
          this.logger.infoSave("同一时间多场次0", { targetShowList });
        }
        if (!targetShow) {
          this.logger.infoSave(
            "准备根据放映日期上一天来回去放映场次列表(次日)",
            {
              showListRes,
              show_time
            }
          );
          const showListRes1 = await this.cinemaManage.getMoviePlayTime({
            cinemaCode,
            cinemaLinkId,
            filmUniqueId,
            showDate: getPreviousDay(start_day)
          });
          const showList1 = showListRes1?.moviePlayTime || [];
          // 解决同一时间多场次问题
          let targetShowList = showList1?.filter(
            item => +new Date(item.showDateTime) == +new Date(show_time)
          );
          targetShow = targetShowList?.[0];
          if (targetShowList?.length > 1) {
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
            this.logger.infoSave("同一时间多场次1", {
              targetShowList
            });
          }
          if (!targetShow) {
            this.logger.errorSave("匹配影片放映场次失败", {
              showListRes1,
              show_time
            });
            const transferParams = await this.orderManage.transferOrder(null);
            return { transferParams };
          }
        }
        this.logger.infoSave("出票时获取电影放映信息", {
          targetShow
        });
        showDateTime = targetShow.showDateTime;
        // 8、获取座位布局
        scheduleId = targetShow.scheduleId;
        scheduleKey = targetShow.scheduleKey;
        const seatListRes = await this.seatManage.getSeatLayout({
          cinemaCode,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        seatList = seatListRes?.seatList || [];
        areaInfoList = seatListRes?.areaInfoList || [];
        if (!seatList?.length) {
          this.logger.errorSave("获取座位布局异常", {
            error: seatListRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        // 9、匹配作为ids
        const targetSeatRes = await this.seatManage.getTargetSeat({
          lockseat,
          seatList,
          ticket_num
        });
        if (targetSeatRes?.error || !targetSeatRes?.targeSeatList) {
          this.logger.errorSave("获取目标座位失败", {
            error: targetSeatRes?.error
          });
          const transferParams = await this.orderManage.transferOrder(null);
          return { transferParams };
        }
        targeSeatList = targetSeatRes.targeSeatList;
        let seat_ids = targeSeatList.map(item => item.seatCode);
        ticketDetail = seat_ids.map(item => ({
          seatCode: item,
          buyerRemark: ""
        }));
      } else {
        // 换号出票
        // 先用上个号的token取消订单，然后再重新出票
        const isCancel = await this.orderManage.cancelOrder({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        });
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
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
      }
      // 锁定座位前延迟一秒
      // await mockDelay(1);
      // 4、锁定座位
      let params = {
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        scheduleId,
        scheduleKey,
        showDate,
        ticketDetail,
        showDateTime,
        appFlag,
        seatList,
        lockseat,
        plat_name,
        order_number,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
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
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
        if (isTrial) {
          this.logger.infoSave("首次锁定座位失败试错后锁定成功");
        }
      }
      // 获取最优卡券组合
      const { orderInfo, orderPriceInfo } = lockRes;
      orderCode = orderInfo.orderCode;
      orderHeaderId = orderInfo.orderHeaderId;
      lockOrderId = orderInfo.lockOrderId;
      orderDate = orderInfo.creationDate;
      // 这个时间戳需要和创建订单提交接口传参一致
      let timestamp = +new Date();
      const cardQuanListRes = await this.orderManage.getOptimalCardQuanCompose({
        orderCode,
        orderHeaderId,
        lockOrderId,
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        filmUniqueId,
        showDate,
        ticketDetail,
        showDateTime,
        timestamp,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      if (cardQuanListRes?.error) {
        this.logger.errorSave("获取最优卡券组合失败", {
          error: cardQuanListRes?.error
        });
        const transferParams = await this.orderManage.transferOrder({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      let cardList = cardQuanListRes?.cards || [];
      cardList = JSON.parse(JSON.stringify(cardList));
      if (cardList?.length && offerRule.offer_type != "1") {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(itemA => itemA.card_num === item.cardNo)
          );
        }
      }
      let quanList = cardQuanListRes?.coupons || [];
      let activities = cardQuanListRes?.activities || [];
      this.logger.infoSave("获取最优卡券组合返回", {
        "cardList(从可用卡列表过滤后的卡:)": cardList,
        oldCardList: cardQuanListRes?.cards,
        quanList: quanList.slice(0, 10),
        activities,
        usableCardList: this.usableCardList
      });
      let discountAmount = activities[0]?.discountAmount || 0; // 活动日优惠金额
      // 7、使用优惠券或者会员卡
      const {
        ticketMemberPrice,
        handlingFee,
        ticketMemberServiceFeeMin,
        areaSettlePriceMin // 区域最小结算价格
      } = targetShow;
      this.logger.warn("ticketMemberPrice", {
        ticketMemberPrice,
        handlingFee,
        ticketMemberServiceFeeMin,
        discountAmount
      });
      // 原价格（座位价格）
      let originalAmount = targeSeatList.map(item => {
        let areaSettlePrice = areaInfoList.find(
          itemA => itemA.areaId === item.areaId
        )?.areaSettlePrice;
        return areaSettlePrice ? +areaSettlePrice + Number(handlingFee) : 0;
      });
      originalAmount =
        originalAmount.reduce((acc, curr) => acc + curr, 0) / 100;
      this.logger.infoSave("会员总价计算相关信息", {
        "originalAmount(座位价格)": originalAmount,
        ticket_num,
        handlingFee,
        ticketMemberPrice,
        areaInfoList,
        targeSeatList
      });
      let activityId = activities[0]?.activityId || null; // 活动id
      let {
        card_id = "",
        cardNum,
        useQuan = [],
        profit = 0,
        quanStock
      } = await this.cardQuanManage.useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        handlingFee, // 手续费
        rewards,
        appFlag,
        plat_name,
        currentParamsList: this.currentParamsList,
        currentParamsInx: this.currentParamsInx,
        curPhone: this.curPhone
      });
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      // 券抵扣金额
      let quanDiscountAmount = useQuan?.[0]?.discountAmount || 0;
      // 使用优惠券及会员卡
      if (!card_id && !useQuan?.length) {
        let { err_msg: errMsg, err_info: errInfo } =
          this.logger.getLastErrMsgAndInfo();
        let str = "无可用会员卡";
        if (offerRule.offer_type === "1") {
          str = "无可用优惠券";
        }
        if (errMsg) {
          str = str + "-" + errMsg;
        }
        this.logger.errorSave(str, {
          cardList,
          quanList: quanList.slice(0, 10),
          supplier_end_price,
          ticket_num,
          activities
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
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
              showDateTime,
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
          this.logger.infoSave("券补钱总价计算相关信息", {
            total_price,
            quan_fee: offerRule.quan_fee,
            areaSettlePriceMin,
            handlingFee,
            quanDiscountAmount,
            ticket_num
          });
        } else {
          total_price = 0;
        }
        // yaolai绑券逻辑不一样，暂不处理
        if (offerRule.is_store == "1" && quanList.length - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.cardQuanManage.getNewQuan({
            cinemaCode,
            cinemaLinkId,
            quan_value: offerRule.quan_value,
            quan_flag: offerRule.quan_flag,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (quanList.length - Number(ticket_num)),
            session_id:
              this.currentParamsList[this.currentParamsInx].session_id,
            asyncFlag: 1,
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

      // 7、耀莱需要获取观影人列表添加观影人
      if (appFlag === "yaolai") {
        const moviegoersListRes =
          await this.orderManage.findStoreMemberMoviegoersByMemberId({
            cinemaCode,
            cinemaLinkId,
            session_id: this.currentParamsList[this.currentParamsInx].session_id
          });
        if (moviegoersListRes?.error) {
          this.logger.errorSave("获取观影人列表失败", {
            error: moviegoersListRes?.error
          });
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
        const moviegoersList = moviegoersListRes.moviegoersList;
        const orderMoviegoers = [moviegoersList[0]];
        const addMoviegoersRes =
          await this.orderManage.updateStoreOrderMoviegoers({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId,
            orderMoviegoers,
            session_id: this.currentParamsList[this.currentParamsInx].session_id
          });
        if (addMoviegoersRes?.error) {
          this.logger.errorSave("添加观影人失败", {
            error: addMoviegoersRes?.error
          });
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      // 7、创建订单
      const createOrderRes = await this.orderManage.createOrder({
        cinemaCode,
        cinemaLinkId,
        orderHeaderId,
        coupon: useQuan,
        quan_flag: offerRule?.quan_flag,
        card_id,
        activityId,
        total_price,
        timestamp,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        mobile: this.currentParamsList[this.currentParamsInx].mobile
      });
      let order_num = createOrderRes?.payOrderCode;
      if (!order_num) {
        this.logger.error("创建订单失败，单个订单直接出票结束走转单逻辑");
        const transferParams = await this.orderManage.transferOrder({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }

      this.logger.infoSave("创建订单成功", {
        order_num,
        profit,
        card_id,
        offerRule
      });

      // 测试模式下不购买，打印购买参数并取消订单释放座位（对齐 SFC、LMA）
      if (this.isTestOrder) {
        const buyParams = {
          order_num,
          orderHeaderId,
          session_id: this.currentParamsList[this.currentParamsInx]?.session_id,
          appFlag: this.appFlag,
          cinemaCode,
          cinemaLinkId,
          orderInfo: {
            order_number,
            plat_name,
            supplier_end_price,
            ticket_num,
            card_id,
            quan_code: quan_code || undefined,
            paymentAmount: createOrderRes?.paymentAmount,
            profit,
            rewards
          }
        };
        console.log("========== 测试模式：购买参数 ==========");
        console.log(JSON.stringify(buyParams, null, 2));
        this.logger.infoSave("测试模式：购买参数", buyParams);

        // 取消订单释放座位
        if (orderHeaderId) {
          try {
            const cancelParams = {
              cinemaCode,
              cinemaLinkId,
              orderHeaderId,
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
              orderHeaderId
            });
            console.error("测试模式：取消订单失败", error);
          }
        } else {
          this.logger.warnSave("测试模式：orderHeaderId 为空，无法取消订单");
          console.warn("测试模式：orderHeaderId 为空，无法取消订单");
        }

        return { offerRule };
      }

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
          this.logger.errorSave(
            "创建订单时发现没有可以补券手续费的卡，走转单",
            {
              paymentList: createOrderRes?.paymentList,
              quan_fee
            }
          );
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      // 支付前校验用券价格
      if (
        offerRule.offer_type === "1" &&
        useQuan?.length &&
        paymentAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee,
          ticket_num
        });
        const transferParams = await this.orderManage.transferOrder({
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
            const transferParams = await this.orderManage.transferOrder({
              cinemaCode,
              cinemaLinkId,
              orderHeaderId
            });
            return { offerRule, transferParams };
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
        cinemaLinkId,
        card_id,
        useQuan,
        paymentWay,
        cardNo,
        orderHeaderId,
        orderCode,
        orderDate,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        orderInfo: this.order
      });
      this.logger.infoSave("订单购买返回", { buyTicketRes });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        this.logger.error("订单购买失败，单个订单直接出票结束走转单逻辑");
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", { buyTicketRes });
        } else {
          this.logger.errorSave("订单购买异常", { error: buyTicketRes?.error });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.orderManage.transferOrder({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      this.logger.infoSave("订单购买成功");
      // 此处是为了解决创建订单时card_id是cardNo，更新卡使用量是用的card_id是cardInstanceId，要和后台会员卡列表维护那的id保持一致
      if (card_id) {
        card_id =
          cardList.find(item => item.cardNo === card_id)?.cardInstanceId || "";
        // 更新卡使用量
        await svApi.updateDayUsage({
          app_name: appFlag,
          card_id: card_id,
          add_count: ticket_num,
          plat_name
        });
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
        orderHeaderId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        orderInfo: item,
        lockseat,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.info("订单最后处理成功:获取取票码并上传");
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
}

window.umeTicketObj = (order, isTestOrder = false) => {
  const logger = new Logger({ logType: 3 });
  return new UmeBuyTicket(order, logger, isTestOrder);
};
// 订单一键出票测试：
// window.umeTicketObj(order, true).singleTicket()
