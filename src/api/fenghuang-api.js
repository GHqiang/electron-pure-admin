/**
 * @description: 辰星api列表
 */

import createAxios from "@/utils/http/fenghuang-request";
import { GE_APP_INFO } from "@/common/constant";
const createApi = ({ app_name }) => {
  // 启用新版本服务影院列表
  let axios = createAxios({
    app_name: app_name
  });
  let api_version = GE_APP_INFO(app_name)?.api_version || "2.0";

  let apiUrlObj = {
    // 授权token
    authRefresh: {
      "2.0": "/fenghuang/mtop.alipic.lark.account.authn.refresh"
    },
    getCommon: {
      "2.0": "/fenghuang/mtop.alipic.lark.combo.common.get"
    },
    // 获取影院列表
    getCinemaList: {
      "2.0": "/fenghuang/mtop.alipic.lark.cinema.citycinemas.get"
    },
    // 获取热映电影放映信息
    getMoviePlayInfo: {
      "2.0": "/fenghuang/mtop.alipic.lark.film.cinemafilms.get"
    },
    // 获取电影放映场次
    getMoviePlayTime: {
      "2.0": "/fenghuang/mtop.alipic.lark.schedule.filmschedules.get"
    },
    // 获取座位布局
    getMoviePlaySeat: {
      "2.0": "/fenghuang/mtop.alipic.lark.seat.scheduleseats.get"
    },
    // 锁定座位
    lockSeat: {
      "2.0": "/fenghuang/mtop.alipic.lark.seat.scheduleseats.lock"
    },
    // 获取锁定座位价格
    getSeatPrice: {
      "2.0": "/fenghuang/mtop.alipic.lark.seat.scheduleseatprices.get"
    },
    // 获取会员卡列表
    getCardList: {
      "2.0": "/fenghuang/mtop.alipic.lark.card.membercards.get"
    },
    // 获取会员卡列表
    getCardDetail: {
      "2.0": "/fenghuang/mtop.alipic.lark.card.membercarddetail.get"
    },
    // 同步卡时增加适用影院功能
    // {"cardNo":"20005091387X","cinemaLinkId":"15222","pageInit":true,"leaseCode":"huaxi","channelCode":"HUAXI_MP_WX_PRO"}
    // 适用影院
    // availableCinemas: [
    //   {
    //     address: "鱼洞街道华熙LIVE·鱼洞商业街3楼",
    //     cinemaName: "重庆华熙国际影城"
    //   },
    //   {
    //     address: "成都市锦江区雨树巷30号L2-209号",
    //     cinemaName: "华熙国际影城"
    //   }
    // ],
    // 获取优惠券列表
    getQuanList: {
      "2.0": "/fenghuang/mtop.alipic.lark.coupon.mycoupon.get"
    },
    // 计算价格
    priceCalculation: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.ticketorder.settle"
    },
    // 用券计算价格
    priceCalculationByQuan: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.ticketorderpromo.settle"
    },
    // 创建订单
    createOrder: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.ticketorder.create"
    },
    // 支付订单
    buyTicket: {
      "2.0": "/selfSupport/trade/front/order/onlinePay"
    },
    // 获取订单信息
    queryOrderDetail: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.detail.get"
    },
    // 获取订单列表
    queryOrderList: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.orders.get"
    },
    // 取消订单
    cancelOrder: {
      "2.0": "/fenghuang/mtop.alipic.lark.order.order.cancel"
    },
    // 释放座位
    releaseSeat: {
      "2.0": "/fenghuang/mtop.alipic.lark.seat.scheduleseats.unlock"
    },
    // 绑定优惠券
    bandQuan: {
      "2.0": "/fenghuang/mtop.alipic.lark.coupon.mycoupon.bindcoupon"
    }
  };

  let apiFunObj = {};

  Object.entries(apiUrlObj).map(([funName, apiUrl]) => {
    apiFunObj[funName] = params =>
      axios.post(apiUrl[api_version], params || {});
  });
  // console.log("apiFunObj", apiFunObj);
  return apiFunObj;
};
export default createApi;
