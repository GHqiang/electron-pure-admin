/**
 * @description: h5ume-api列表(小程序)
 */

import createAxios from "@/utils/http/h5ume-request";

const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });

  const getsidbytid = params =>
    // api：对应url最后一个单词驼峰
    axios.post(
      "/h5ume/mtop.alipic.lark.own.auth.getsidbytid",
      params || {
        empCode: "",
        leaseCode: "",
        tid: "d88aeb5151b84e53a0859f9ce0284dc3"
      }
    );
  // tid是固定的（每次登录都会返回相同的tid和不同的sid），可以根据这个获取sid也就是larkSid，只有当接口返回登录超时好像才需要重新获取sid
  // "data": {
  //       "bizAlertMsg": "登录超时，请重新登录",
  //       "bizCode": "20001",
  //       "bizMsg": "invalid authentication",
  //       "bizValue": {},
  //       "traceId": "213e380b17326262799926082e3abd"
  //   },
  // "bizValue": {
  //     "account": {
  //         "accountId": "1002034000024945",
  //         "accountName": "m_13073792313TJsU4uMR",
  //         "gender": 0,
  //         "idCardNo": "411329199602101018",
  //         "identificationState": 0,
  //         "lastLoginTime": "2024-11-26 20:25:57",
  //         "mobile": "13073792313",
  //         "mobileBinded": false,
  //         "mobileCountryCode": "0086",
  //         "realName": "付勋",
  //         "temporaryMobile": "13073792313"
  //     },
  //     "sid": "bc611b586c3f47a9b8c5a73afe28f449",
  //     "tid": "d88aeb5151b84e53a0859f9ce0284dc3"
  // },

  // 获取城市及影院列表
  const getCinemaList = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.cinema.getcinemas",
      params || {
        empCode: "",
        leaseCode: ""
      }
    );

  // 获取电影放映列表（热映列表，待映列表用不上）
  const getMoviePlayInfo = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.film.gethotfilms",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "12654",
        posterSize: "SMALL"
      }
    );

  // 获取电影放映场次（返回的是所有电影的场次列表）
  const getMoviePlayDate = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.schedule.getSchedules",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106"
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
        apiVersion: "1.0"
      }
    );

  // 锁定座位
  const lockSeat = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.goods.getNewGoodses",
      params || {
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
        seatIds: "00000017189-2-17"
      }
    );

  // 电影票购买
  const buyTicket = params => axios.post("/lma/mp/iorder/complete", params);

  // 获取购票信息
  const payOrder = params =>
    axios.get("/lma/mp/ihistory/ticket_info", { params });

  // 获取订单列表
  const getOrderList = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.getOrderList", params || {});

  // 取消订单
  const cannelOneOrder = params =>
    axios.post(
      "/lmh5umea/mtop.alipic.lark.own.order.cancelOrder",
      params || {
        empCode: "",
        leaseCode: "",
        cinemaLinkId: "10106",
        orderType: "TICKET",
        orderId: "241124035016X101061195"
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
        needMatchConsumeGift: false
      }
    );

  // 获取会员卡列表
  const getCardList = params =>
    axios.post(
      "/h5ume/mtop.alipic.lark.own.card.getcardlistbypage",
      params || {
        cinemaLinkId: "12654",
        pageNo: 1,
        pageSize: 30
      }
    );
  // bizValue: [
  //     {
  //         "balance": 26395,
  //         "canChargeFlg": "Y",
  //         "canRenewFlg": "N",
  //         "cardAutoRenew": false,
  //         "cardCost": 0,
  //         "cardName": "钻石卡",
  //         "cardNumber": "20001936462X",
  //         "cardRequireList": [
  //             "MOBILE",
  //             "USERNAME",
  //             "CERTIFICATE",
  //             "PASSWORDRULE",
  //             "BIRTHDAY",
  //             "PHOTO",
  //             "SMSVERIFY"
  //         ],
  //         "cardRuleAutoRenew": false,
  //         "cardStatus": "N",
  //         "cardType": "V",
  //         "cinemaLinkId": "12654",
  //         "cinemaName": "大悦城新恒星影城(大悦城店)",
  //         "createAmt": 50000,
  //         "leaseCode": "xhx",
  //         "membershipFee": 0,
  //         "minInAmt": 38000,
  //         "usePolicyId": 1011527
  //     }
  // ]
  // 获取优惠券列表个人中心
  const getQuanList = params =>
    axios.pos(
      "/h5ume/mtop.alipic.lark.own.coupon.getMyOnlineCouponsCount",
      params || {
        state: "NO_USE"
      }
    );

  // 订单价格计算
  const priceCalculation = params =>
    axios.get("/lma/mp/iorder/get_order", { params });

  // 绑定优惠券
  const bandQuan = params => axios.post("/lma/mp/icoupon/add", params);

  return {
    getsidbytid,
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
