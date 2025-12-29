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
  const getMoviePlayTime = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/shows/", { params });

  // 获取电影座位分区
  const getMovieSeatPriceList = params =>
    axios.get(" /ticket/channelCode/cinema/cinema_id/hall/info/", {
      params
    });
  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.get(" /ticket/channelCode/cinema/cinema_id/hall/saleable/", {
      params
    });

  // 锁定座位
  const lockSeat = params =>
    axios.post("/ticket/channelCode/cinema/cinema_id/order/ticket/", params);

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

  // 获取订单信息
  const getOrderInfo = params =>
    axios.get("/ticket/order/sublists/info", { params });

  // 获取会员卡列表
  const getCardList = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/user/cards/", { params });
  //   {
  //   "ret": 0,
  //   "sub": 0,
  //   "msg": "successfully",
  //   "data": {
  //     "solid_card": [{
  //       "card_id": 434953,
  //       "card_no": "25*****4225",
  //       "card_no_show": "25135004225",
  //       "card_name": "LV1-\u5403\u74dc\u7fa4\u4f17",
  //       "card_desc": "\u4f1a\u5458\u8d2d\u7968\u4eab\u53d7\u4f1a\u5458\u4f18\u60e0\u4ef7",
  //       "card_status": "USABLE",
  //       "tip": "",
  //       "expiration_date": "2124-12-29 13:46:10",
  //       "expire_day": 36159,
  //       "card_grade_id": 632,
  //       "card_limit_balance": 0,
  //       "is_limit_card": false,
  //       "limit_member_wechat_pay": false,
  //       "card_balance": 0,
  //       "card_score": 0,
  //       "card_image": "https:\/\/res.vistachina.cn\/store\/cardpic\/2016\/08\/16\/1471329845_880",
  //       "card_type": "SOLID_STORED_CARD",
  //       "is_expire": false,
  //       "is_forbid": false,
  //       "is_pay_show": true,
  //       "is_usable": true,
  //       "is_recharge": true,
  //       "is_active_show": false,
  //       "is_store_money": true,
  //       "rewards_num": null,
  //       "active_expire_time": "",
  //       "open_cinema_name": "\u91d1\u9038\u5f71\u57ce\uff08\u5149\u7f8e\u66fc\u5ea6\u5e97\uff09",
  //       "recharge_price_item": [{
  //         "id": "446918093648429057",
  //         "value": 100
  //       }, {
  //         "id": "446918093648953345",
  //         "value": 200
  //       }, {
  //         "id": "446918093649477633",
  //         "value": 300
  //       }, {
  //         "id": "446918093649739777",
  //         "value": 500
  //       }],
  //       "renewal_price": 0,
  //       "is_owner": "Y",
  //       "member_benefits": []
  //     }]
  //   }
  // }
  // 获取优惠券列表个人中心
  const getQuanList = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.coupon.getmyonlinecoupons", params);

  // 订单价格计算
  const priceCalculation = params =>
    axios.post(
      "/ticket/channelCode/cinema/cinema_id/order/change/?version=tp_version",
      params
    );

  // 绑定优惠券
  const bandQuan = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.coupon.bindcoupon", params);

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayTime, // 获取电影放映场次
    getMovieSeatPriceList,
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
