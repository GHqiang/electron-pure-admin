/**
 * @description: jingyi-api列表(小程序)
 */

import createAxios from "@/utils/http/jinyi-request";

const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });

  // 获取城市及影院列表
  const getCinemaList = params =>
    axios.get("/ticket/channelCode/citys/", { params });

  // 获取电影放映列表（热映列表，待映列表用不上）
  const getMoviePlayInfo = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/movies/", { params });

  // 获取电影放映场次（返回的是所有电影的场次列表）
  const getMoviePlayDate = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/shows/", { params });

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.get(" /ticket/channelCode/cinema/cinema_id/hall/saleable/", {
      params
    });

  // 锁定座位
  const lockSeat = params =>
    axios.post("/ticket/GM2024cinema/cinema/400343/order/ticket/", params);

  // 解锁座位
  const unlockSeat = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.seat.unlockseats", params);

  // 获取最优卡券组合
  const getCardQuanList = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.pay.getpayprivilegeinfo", params);

  // 核销券
  const checkQuan = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.pay.getpaydiscountprice", params);

  // 创建订单
  const createOrder = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.createticketorder", params, {
      timeout: 30 * 1000
    });

  // 电影票购买
  const buyTicket = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.card.payorderwithcard", params, {
      timeout: 30 * 1000
    });
  // {
  //   channelCode: "JINQIU_H5_PROD_11713_MPS",
  //   larkSid: "9424183dd6be47e8a34673ce2cf77fe0",
  //   version: "H5",
  //   appVersion: "H5_5.0",
  //   cinemaLinkId: "11713",
  //   orderId: "241130027004X117131162",
  //   orderType: "TICKET",
  //   cardNumber: "20001158294X",
  //   cardPassword: "213214",
  //   cardCinemaLinkId: "11713"
  // }

  // 获取订单列表
  const getOrderList = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.getorderlist", params || {});

  // 取消订单
  const cannelOneOrder = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.cancelorder", params);

  // {
  //   empCode: "",
  //   leaseCode: "",
  //   cinemaLinkId: "10106",
  //   orderType: "TICKET",
  //   orderId: "241124035016X101061195"
  // }

  // 获取订单信息
  const getOrderInfo = params =>
    axios.get("/ticket/order/sublists/info", { params });

  // {
  //   empCode: "",
  //   leaseCode: "",
  //   orderId: "241124035016X101061195",
  //   orderType: "TICKET",
  //   cinemaLinkId: "10106",
  //   needMatchConsumeGift: false
  // }

  // 获取会员卡列表
  const getCardList = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/user/cards/", { params });
  //   {
  // 	"ret": 0,
  // 	"sub": 0,
  // 	"msg": "successfully",
  // 	"data": {
  // 		"solid_card": [],
  // 		"elect_card": []
  // 	}
  // }
  // 获取优惠券列表个人中心
  const getQuanList = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.coupon.getmyonlinecoupons", params);

  // 订单价格计算
  const priceCalculation = params =>
    axios.get("/lma/mp/iorder/get_order", { params });

  // 绑定优惠券
  const bandQuan = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.coupon.bindcoupon", params);

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayDate, // 获取电影放映场次
    getMoviePlaySeat,
    lockSeat,
    unlockSeat,
    getCardList,
    getQuanList,
    priceCalculation,
    getCardQuanList,
    checkQuan,
    createOrder,
    cannelOneOrder,
    getOrderList,
    getOrderInfo,
    buyTicket,
    bandQuan
  };
};
export default createApi;
