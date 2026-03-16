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
    axios.get("/ticket/channelCode/cinema/cinema_id/hall/info/", {
      params
    });

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/hall/saleable/", {
      params
    });

  // 锁定座位(创建待支付订单)
  const lockSeat = params =>
    axios.post("/ticket/channelCode/cinema/cinema_id/order/ticket/", params);

  // 电影票购买https://ct.womovie.cn/ticket/GM2024cinema/cinema/400352/order/payment/
  const buyTicket = params =>
    axios.post("/ticket/channelCode/cinema/cinema_id/order/payment", params);

  // 用卡购买参数
  // order_id	260314205810011160
  // mobile	15237761435
  // pay_type	MEMBER

  // 获取订单信息
  const getOrderInfo = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/order/info", {
      params
    });

  // version	tp_version
  // order_id	260314205810011160

  // const res = {
  //   ret: 0,
  //   sub: 0,
  //   msg: "successfully",
  //   data: {
  //     order_id: "260314205810011160",
  //     status: "SUCCESS",
  //     status_desc: "\u5df2\u51fa\u7968",
  //     status_info:
  //       "\u8bf7\u5230\u81ea\u52a9\u53d6\u7968\u673a\u4e0a\u5b8c\u6210\u53d6\u7968",
  //     status_show_exception: false,
  //     order_total_price: 38,
  //     order_payment_price: 38,
  //     order_total_fee: 3,
  //     ticket_total_price: 38,
  //     pay_time: "2026-03-14 20:58",
  //     phone: "152****1435",
  //     cinema_id: "400352",
  //     cinema_name:
  //       "\u91d1\u9038\u5f71\u57ce\uff08\u5149\u7f8e\u6c5f\u5b81\u5f18\u9633IMAX\u5e97\uff09",
  //     cinema_address:
  //       "\u5357\u4eac \u6c5f\u5b81\u533a\u53cc\u9f99\u5927\u90531222\u53f7\u5f18\u9633\u5bb6\u5c45\u5e7f\u573a2\u81f35\u5c42",
  //     movie_name: "\u98de\u9a70\u4eba\u751f3",
  //     movie_egg_dec: "",
  //     movie_egg_num: "",
  //     movie_language: "\u56fd\u8bed",
  //     movie_show_type: "2D",
  //     movie_poster:
  //       "https://res.vistachina.cn/film_files/0e/0e8fb0ee4e7de289dee16514a43adbe6?imageMogr2/gravity/center/crop/490x700",
  //     ticket_code: "242291736",
  //     ticket_code_arr: [
  //       { name: "\u5e8f\u5217\u53f7", code: "242291736" },
  //       { name: "\u9a8c\u8bc1\u7801", code: "335081" }
  //     ],
  //     show_date: "2026-03-17 15:45",
  //     show_date_style: "\u5468\u4e8c 3\u670817\u65e5 15:45",
  //     card_type: "SOLID_STORED_CARD",
  //     card_no: "25135004225",
  //     pay_way: "\u4f59\u989d\u652f\u4ed8",
  //     is_more_area: false,
  //     is_marketing: false,
  //     voucher_use: {},
  //     rewards_use: {},
  //     goods_order: {},
  //     ticket_items: {
  //       ticket_num: 1,
  //       schedule_id: 18957435,
  //       schedule_sell_price: 38,
  //       schedule_member_price: 0,
  //       hall_no: "1",
  //       hall_name: "1\u53f7\u675c\u6bd4\u5168\u666f\u58f0\u5385(\u4e8c\u697c)",
  //       seat_info: "2\u63926\u5ea7",
  //       area_seats: [
  //         {
  //           area_id: "10086",
  //           area_name: "\u666e\u901a\u89c2\u5f71\u5ea7",
  //           seat: "2\u63926\u5ea7"
  //         }
  //       ]
  //     },
  //     order_track: [
  //       {
  //         title: "\u63d0\u4ea4\u8ba2\u5355",
  //         mark: "\u6b22\u8fce\u5728\u672c\u5f71\u9662\u89c2\u5f71",
  //         time: "3\u670814\u65e5 20:58"
  //       },
  //       {
  //         title: "\u652f\u4ed8\u6210\u529f",
  //         mark: "\u8bf7\u8010\u5fc3\u7b49\u5f85\u7cfb\u7edf\u51fa\u7968",
  //         time: "3\u670814\u65e5 21:02"
  //       },
  //       {
  //         title: "\u51fa\u7968\u4e2d",
  //         mark: "\u51c6\u5907\u751f\u6210\u53d6\u7968\u7801\u548c\u5f71\u7968\u4e8c\u7ef4\u7801",
  //         time: "3\u670814\u65e5 21:02"
  //       },
  //       {
  //         title: "\u5df2\u51fa\u7968",
  //         mark: "\u8bf7\u5230\u81ea\u52a9\u53d6\u7968\u673a\u4e0a\u5b8c\u6210\u53d6\u7968",
  //         time: "3\u670814\u65e5 21:02"
  //       }
  //     ],
  //     own_refund: false,
  //     voucher_coupon: "",
  //     voucher_goods_coupon: "",
  //     evgc_limit_coupon_use: "",
  //     vistax_use_coupon: "",
  //     msg: "",
  //     msg_desc: "",
  //     ticket_package_goods_msg: "",
  //     super_goods_orderid: ""
  //   }
  // };

  // 获取订单列表
  const getOrderList = params =>
    axios.get("/ticket/channelCode/user/orders/?offset=0", {
      params
    });

  // const res = {
  //   ret: 0,
  //   sub: 0,
  //   msg: "successfully",
  //   data: {
  //     next_offset: 0,
  //     orders: [
  //       {
  //         order_id: "260314205810011160",
  //         status: "SUCCESS",
  //         status_desc: "\u5df2\u51fa\u7968",
  //         status_show_exception: false,
  //         cinema_id: "400352",
  //         cinema_name:
  //           "\u91d1\u9038\u5f71\u57ce\uff08\u5149\u7f8e\u6c5f\u5b81\u5f18\u9633IMAX\u5e97\uff09",
  //         movie_name: "\u98de\u9a70\u4eba\u751f3",
  //         movie_language: "\u56fd\u8bed",
  //         movie_show_type: "2D",
  //         schedule_is_expire: false,
  //         ticket_code: "242291736",
  //         show_date: "2026-03-17 15:45",
  //         show_date_style: "\u5468\u4e8c 3\u670817\u65e5 15:45",
  //         goods_order_id: "",
  //         ticket_num: 1,
  //         hall_name:
  //           "1\u53f7\u675c\u6bd4\u5168\u666f\u58f0\u5385(\u4e8c\u697c)",
  //         seat_info: "2\u63926\u5ea7",
  //         area_seats: [
  //           {
  //             area_id: "10086",
  //             area_name: "\u666e\u901a\u89c2\u5f71\u5ea7",
  //             seat: "2\u63926\u5ea7"
  //           }
  //         ],
  //         super_goods_orderid: ""
  //       }
  //     ]
  //   }
  // };

  // 获取用户信息
  const getUserInfo = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/user/info/", { params });

  //   {
  //     "ret": 0,
  //     "sub": 0,
  //     "msg": "successfully",
  //     "data": {
  //         "is_new_user": true,
  //         "is_risk_user": false,
  //         "is_auth_expire": false,
  //         "is_delete": 0,
  //         "is_bind_mobile": true,
  //         "is_member": true,
  //         "identity_show": false,
  //         "sex": "SECRET",
  //         "avatar": "",
  //         "nickname": "",
  //         "phone": "13*****2313",
  //         "order_phone": "13073792313",
  //         "member_info": {
  //             "solid_card": {
  //                 "card_id": 432558,
  //                 "card_no": "25*****9032",
  //                 "card_no_show": "25135079032",
  //                 "card_name": "LV1-吃瓜群众",
  //                 "card_desc": "会员购票享受会员优惠价",
  //                 "card_status": "USABLE",
  //                 "tip": "",
  //                 "expiration_date": "2124-10-31 14:07:24",
  //                 "expire_day": 36024,
  //                 "card_grade_id": 632,
  //                 "card_balance": 0,
  //                 "card_score": 0,
  //                 "card_image": "https://res.vistachina.cn/store/cardpic/2016/08/16/1471329845_880",
  //                 "card_type": "SOLID_STORED_CARD",
  //                 "is_expire": false,
  //                 "is_pay_show": false,
  //                 "is_usable": true,
  //                 "is_recharge": true,
  //                 "is_active_show": false,
  //                 "is_store_money": true,
  //                 "rewards_num": null,
  //                 "active_expire_time": "",
  //                 "open_cinema_name": "金逸影城（光美荟聚IMAX激光店）",
  //                 "recharge_price_item": [
  //                     {
  //                         "id": "446918093648429057",
  //                         "value": 100
  //                     },
  //                     {
  //                         "id": "446918093648953345",
  //                         "value": 200
  //                     },
  //                     {
  //                         "id": "446918093649477633",
  //                         "value": 300
  //                     },
  //                     {
  //                         "id": "446918093649739777",
  //                         "value": 500
  //                     },
  //                     {
  //                         "id": "463248437392703489",
  //                         "value": 2026
  //                     }
  //                 ],
  //                 "renewal_price": 0
  //             },
  //             "virtual_card": {}
  //         }
  //     }
  // }

  // 获取会员卡列表（由于会员卡列表读不出来，暂时从用户信息那读单卡来用，后面多卡了再调整）
  const getCardList = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/user/info/", { params });
  // axios.get("/ticket/channelCode/cinema/cinema_id/user/cards/", { params });
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

  // 使用会员卡/不使用会员卡（先调该接口再计算价格）
  const usedCard = params =>
    axios.get("/ticket/channelCode/cinema/cinema_id/order/vcc/usable/count", {
      params
    });
  // 不用卡：order_id=260314213810011289&type=EVGC_VOUCHER&card_id=
  // 使用卡：order_id=260314213810011289&type=EVGC_VOUCHER&card_id=434953

  //   {
  // 	"ret": 0,
  // 	"sub": 0,
  // 	"msg": "successfully",
  // 	"data": {
  // 		"order_id": "260314213810011289",
  // 		"count": 0
  // 	}
  // }

  // 订单价格计算
  const priceCalculation = params =>
    axios.post(
      "/ticket/channelCode/cinema/cinema_id/order/change/?version=tp_version",
      params
    );

  // 绑定优惠券
  const bandQuan = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.coupon.bindcoupon", params);

  // 解锁座位
  const unlockSeat = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.seat.unlockseats", params); // 取消订单

  const cannelOneOrder = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.cancelorder", params);
  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayTime, // 获取电影放映场次
    getMovieSeatPriceList,
    getMoviePlaySeat,
    lockSeat,
    unlockSeat,
    getCardList,
    priceCalculation,
    cannelOneOrder,
    getOrderList,
    getOrderInfo,
    buyTicket,
    bandQuan
  };
};
export default createApi;
