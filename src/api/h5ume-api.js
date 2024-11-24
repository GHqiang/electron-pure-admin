/**
 * @description: h5ume-api列表(小程序)
 */

import createAxios from "@/utils/http/h5ume-request";

const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });

  // 获取城市及影院列表
  const getCinemaList = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.cinema.getcinemas",
      params || {
        empCode: "",
        leaseCode: "",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 获取电影放映列表（热映列表，待映列表用不上）
  const getMoviePlayInfo = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.film.getHotFilms",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        posterSize: "SMALL",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 获取电影放映场次（返回的是所有电影的场次列表）
  const getMoviePlayDate = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.schedule.getSchedules",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.seat.getSeatMap",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        hallId: "0000000000000006",
        scheduleId: "1000000834217787",
        scheduleKey: "C158AAA6208E699EFDCF2774D3549DDE",
        apiVersion: "1.0",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 锁定座位
  const lockSeat = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.goods.getNewGoodses",
      params || {
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0",
        cinemaLinkId: "10106",
        scheduleId: "1000000834217787",
        seatIds: "00000017189-6-17"
      }
    );

  // 创建订单
  const createOrder = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.pay.getPayPrivilegeInfo",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        hallId: "0000000000000006",
        scheduleId: "1000000834217787",
        scheduleKey: "C158AAA6208E699EFDCF2774D3549DDE",
        seatIds: "00000017189-2-17",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 电影票购买
  const buyTicket = params => axios.post("/lma/mp/iorder/complete", params);

  // 获取购票信息
  const payOrder = params =>
    axios.get("/lma/mp/ihistory/ticket_info", { params });

  // 获取订单列表
  const getOrderList = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.order.getOrderList",
      params || {
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 取消订单
  const cannelOneOrder = params =>
    axios.post(
      "/lmh5umea/mtop.alipic.lark.own.order.cancelOrder",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        orderType: "TICKET",
        orderId: "241124035016X101061195",
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 获取订单信息
  const getOrderInfo = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.order.getOrderDetail",
      params || {
        empCode: "",
        leaseCode: "",
        orderId: "241124035016X101061195",
        orderType: "TICKET",
        cinemaLinkId: "10106",
        needMatchConsumeGift: false,
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0"
      }
    );

  // 获取会员卡列表
  const getCardList = params =>
    axios.pos(
      "/h5ume/mtop.alipic.lark.own.card.getCardListByPage",
      params || {
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0",
        cinemaLinkId: "10106",
        pageNo: 1,
        pageSize: 30
      }
    );

  // 获取优惠券列表个人中心
  const getQuanList = params =>
    axios.pos(
      "/h5ume/mtop.alipic.lark.own.coupon.getMyOnlineCouponsCount",
      params || {
        channelCode: "BEICHEN_H5_PROD_10106_MPS",
        larkSid: "0fa280a468444a88b0a425da346e7b2d",
        version: "H5",
        appVersion: "H5_5.0",
        state: "NO_USE"
      }
    );

  // 订单价格计算
  const priceCalculation = params =>
    axios.get("/lma/mp/iorder/get_order", { params });

  // 绑定优惠券
  const bandQuan = params => axios.post("/lma/mp/icoupon/add", params);

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayDate, // 获取电影放映场次
    getMoviePlaySeat,
    lockSeat,
    getCardList,
    getQuanList,
    priceCalculation,
    createOrder,
    payOrder,
    cannelOneOrder,
    getOrderList,
    getOrderInfo,
    buyTicket,
    bandQuan
  };
};
export default createApi;
