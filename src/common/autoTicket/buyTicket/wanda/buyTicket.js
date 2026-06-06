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
import { mockDelay } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import BaseBuyTicket from "@/common/core/BaseBuyTicket.js";
import WandaSeatManage from "./seatManage.js";
import WandaOrderManage from "./orderManage.js";
import WandaCinemaManage from "./cinemaManage.js";
import WandaCardQuanManage from "./cardQuanManage.js";
import PlatManage from "../platManage.js";

class WandaBuyTicket extends BaseBuyTicket {
  constructor(order, logger, isTestOrder) {
    super(order, logger, isTestOrder);
    this.appApi = APP_API_OBJ[this.appFlag];
  }

  /**
   * 初始化依赖模块
   */
  initModules() {
    this.platManage = new PlatManage(this.order, this.logger, this.isTestOrder);
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
    this.cinemaManage = new WandaCinemaManage(this.order, this.logger);
    this.cardQuanManage = new WandaCardQuanManage(
      this.order,
      this.logger,
      this.orderManage
    );
  }

  /**
   * 获取影院登录信息并设置当前 token
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

  /**
   * 一键买票核心流程
   */
  async oneClickBuyTicket(item) {
    const { appFlag } = this;
    const {
      order_number,
      city_name,
      cinema_name,
      cinema_code,
      hall_name,
      film_name,
      show_time,
      ticket_num,
      plat_name,
      otherParams
    } = item;

    let { offerRule, city_id, cinema_id } = otherParams || {};
    const order_number_key = order_number;

    // 1. 解析影院信息
    const cinemaInfo = await this.cinemaManage.getCinemaDetail({
      storeId: cinema_id,
      session_id: this.currentSessionId
    });
    if (!cinemaInfo) {
      return await this.orderManage.transferOrder({
        reason: "获取影院信息失败"
      });
    }

    // 2. 获取排期（通过 cinemaManage 查电影信息 + 排期）
    const movieInfo = await this.cinemaManage.getMovieInfo(this.order);
    if (!movieInfo) {
      return await this.orderManage.transferOrder({
        reason: "未匹配到电影信息"
      });
    }
    const showTimeList = await this.cinemaManage.getShowTimeList({
      cinemaId: cinema_id,
      filmId: movieInfo?.film_id,
      date: show_time?.split(" ")[0],
      session_id: this.currentSessionId
    });
    if (!showTimeList) {
      return await this.orderManage.transferOrder({ reason: "获取排期失败" });
    }

    // 3. 获取座位
    const seatLayout = await this.seatManage.getSeatLayout({
      showTimeId: showTimeList.showtimeList?.[0]?.id,
      session_id: this.currentSessionId
    });
    if (!seatLayout) {
      return await this.orderManage.transferOrder({ reason: "获取座位失败" });
    }

    // 4. 自动选座
    const targetSeats = await this.seatManage.autoSelectSeat(
      seatLayout,
      ticket_num || 1
    );
    if (!targetSeats.length) {
      return await this.orderManage.transferOrder({ reason: "无可用座位" });
    }

    // 5. 组装座位ID
    const seatIdStr = targetSeats
      .map(s => `${s.seatId},${s.salesPrice},undefined,0`)
      .join("|");

    // 6. 创建订单（锁座）
    const orderRes = await this.orderManage.createOrder({
      dId: showTimeList.showtimeList?.[0]?.id,
      retailerCode: "MX",
      mobile: this.currentPhone,
      seatId: seatIdStr,
      session_id: this.currentSessionId
    });
    if (!orderRes) {
      return await this.orderManage.transferOrder({ reason: "锁座失败" });
    }
    const wandaOrderId = orderRes.orderId;

    // 7. 确认订单（绑定手机）
    const confirmRes = await this.orderManage.confirmOrder({
      orderId: wandaOrderId,
      mobilePhone: this.currentPhone,
      session_id: this.currentSessionId
    });

    // 8. 轮询获取取票码
    let ticketCode = null;
    for (let i = 0; i < 10; i++) {
      await mockDelay(2);
      const statusRes = await this.orderManage.queryOrderStatus({
        orderId: wandaOrderId,
        session_id: this.currentSessionId
      });
      if (statusRes?.orderStatus === "SUCCESS" || statusRes?.ticketCode) {
        ticketCode = statusRes.ticketCode;
        break;
      }
    }

    if (!ticketCode) {
      return await this.orderManage.transferOrder({ reason: "获取取票码超时" });
    }

    // 9. 上传取票码到平台
    const submitRes = await this.platManage.submitTicketCode(
      order_number_key,
      ticketCode
    );

    return {
      profit: 0,
      submitRes,
      qrcode: ticketCode,
      offerRule
    };
  }
}

export default WandaBuyTicket;
