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
    axios.get("/ticket/GM2024cinema/citys/", { params });

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
  // {
  //     cards: [
  //       {
  //         accountId: "1001616000286473",
  //         amount: 18220,
  //         balance: 18220,
  //         canChargeFlg: "Y",
  //         canOperTypeList: [
  //           "CONSUME",
  //           "RECHARGE",
  //           "FREEZE",
  //           "REPORT_LOSS",
  //           "REISSUE_CARD",
  //           "REFUND_CARD",
  //           "MODIFY_PASSWORD",
  //           "BIND_CARD",
  //           "VALIDATE_MOBILE",
  //           "REFUND_CHARGE",
  //           "MERGE",
  //           "AMOUNT_TRANSFER"
  //         ],
  //         cardAmount: 10000,
  //         cardCost: 0,
  //         cardName: "钻石卡（上海店）",
  //         cardNo: "20001158294X",
  //         cardNumber: "20001158294X",
  //         cardRequireList: ["MOBILE", "USERNAME", "PASSWORDRULE"],
  //         cardStatus: "N",
  //         cardType: "V",
  //         cinemaLinkId: "11713",
  //         gmtCreate: "1633342555000",
  //         id: 1000052576848,
  //         leaseCode: "jinqiu",
  //         rechargeExpireMonth: -1,
  //         rechargeExpireTime: -1,
  //         rechargeExpireTimeUnit: "NONE",
  //         rechargeMin: 10000,
  //         ruleCode: 1008255
  //       }
  //     ],
  //     filfulFlag: "N",
  //     payTools: [
  //       {
  //         feeUncharged: false,
  //         feeUnchargedProduct: "NONE",
  //         payToolCode: "AliH5",
  //         payToolId: "5945",
  //         payToolName: "支付宝",
  //         payToolPlatformType: "ALIPAY"
  //       },
  //       {
  //         feeUncharged: false,
  //         feeUnchargedProduct: "NONE",
  //         payToolCode: "WeChatH5",
  //         payToolId: "5946",
  //         payToolName: "微信",
  //         payToolPlatformType: "WEIXIN"
  //       }
  //     ],
  //     preferCouponInfo: {
  //       canUseCoupon: true,
  //       preferCoupons: [],
  //       privilegeTotalPrice: "3800",
  //       totalGoodsPrivilegePrice: "0",
  //       totalTicketPrivilegePrice: "3800"
  //     },
  //     privileges: [
  //       {
  //         canSupplement: false,
  //         cardInfos: [
  //           {
  //             cardDiscount: "钻石卡（上海店）",
  //             cardNumber: "20001158294X",
  //             cardType: "V"
  //           }
  //         ],
  //         originalTicketTotalPrice: "3800",
  //         payMethod: "CARD",
  //         privilegeDescription: "钻石卡（上海店）",
  //         privilegeTitle: "￥3.00",
  //         privilegeTotalPrice: "3500",
  //         privilegeType: "MEMBER_CARD_DISCOUNT",
  //         privilegeTypes: ["卡"],
  //         superpositionRule: { superpositionCouponRule: false },
  //         ticketCost: "0",
  //         ticketInfos: [
  //           {
  //             privilegeTag: "卡",
  //             seatId: "00000021373-1-18",
  //             ticketCount: 1,
  //             ticketOriginalPrice: "3800",
  //             ticketPrivilegePrice: "3500"
  //           }
  //         ]
  //       },
  //       {
  //         canSupplement: false,
  //         cardInfos: [],
  //         originalTicketTotalPrice: "3800",
  //         payMethod: "",
  //         privilegeDescription: "原价￥38.00",
  //         privilegeTotalPrice: "3800",
  //         privilegeType: "ORIGINAL_PRICE",
  //         privilegeTypes: ["ORIGINAL_PRICE"],
  //         ticketCost: "0",
  //         ticketInfos: [
  //           {
  //             privilegeTag: "原价",
  //             privilegeType: "SETTLE_PRICE",
  //             seatId: "00000021373-1-18",
  //             serviceFee: "300",
  //             ticketCost: "0",
  //             ticketCount: 1,
  //             ticketOriginalPrice: "3800",
  //             ticketPrivilegePrice: "3800"
  //           }
  //         ]
  //       }
  //     ],
  //     refundFlag: "N",
  //     warningInfo:
  //       "1、欢迎选择上海金球影城，很高兴为您服务！\n2、影院有免费WIFI；\n3、凭影票票根至票台敲章可享广场地下车库免停车1小时；\n4、观看4D电影，儿童也需购票；\n5、有疑问可前台或电话咨询！’"
  // }

  // 核销券
  const checkQuan = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.pay.getpaydiscountprice", params);

  // 创建订单
  const createOrder = params =>
    axios.post("/h5ume/mtop.alipic.lark.own.order.createticketorder", params, {
      timeout: 30 * 1000
    });
  // {
  //   mobile: "13073792313",
  //   cinemaLinkId: "11713",
  //   totalPrice: "3800",
  //   payAmount: "3500",
  //   payments: '[{"payMethod":"CARD","payCardNumber":"20001158294X"}]',
  //   tickets: '[{"seatId":"00000021373-1-18"}]',
  //   scheduleId: "1000000837610162",
  //   scheduleKey: "048C626826D528C7499400531B39D7C9",
  //   lockOrderId: "2678011713208435457"
  // };
  // 上述参数可取privileges
  // {
  //         canSupplement: false,
  //         cardInfos: [
  //           {
  //             cardDiscount: "钻石卡（上海店）",
  //             cardNumber: "20001158294X",
  //             cardType: "V"
  //           }
  //         ],
  //         originalTicketTotalPrice: "3800",
  //         payMethod: "CARD",
  //         privilegeDescription: "钻石卡（上海店）",
  //         privilegeTitle: "￥3.00",
  //         privilegeTotalPrice: "3500",
  //         privilegeType: "MEMBER_CARD_DISCOUNT",
  //         privilegeTypes: ["卡"],
  //         superpositionRule: { superpositionCouponRule: false },
  //         ticketCost: "0",
  //         ticketInfos: [
  //           {
  //             privilegeTag: "卡",
  //             seatId: "00000021373-1-18",
  //             ticketCount: 1,
  //             ticketOriginalPrice: "3800",
  //             ticketPrivilegePrice: "3500"
  //           }
  //         ]
  //       },

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
    axios.post("/h5ume/mtop.alipic.lark.own.card.getcardlistbypage", params);
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
