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
  let api_version = GE_APP_INFO(app_name)?.api_version || "C";

  let apiUrlObj = {
    // 授权token
    authToken: {
      "3.0C": "/selfSupport/front/cticket/getCinemaList",
      C: "/fenghuang/mtop.alipic.lark.cinema.citycinemas.get"
    },
    getUserInfo: {
      "3.0C": "/selfSupport/front/cticket/getCinemaList",
      C: "/chenxing/api/middleground/member/user/getUserInfo "
    },
    // 获取影院列表
    getCinemaList: {
      // "3.0C": ["/selfSupport/front/cticket/getCinemaList", "post"],
      "3.0C": "/selfSupport/front/cticket/getCinemaList",
      C: "/fenghuang/mtop.alipic.lark.cinema.citycinemas.get"
    },
    // 获取热映电影放映信息
    getMoviePlayInfo: {
      "3.0C": "/selfSupport/front/cticket/getHitFilm",
      C: "/chenxing/api/middleground/ticket/c/cticket/getHitFilm"
    },
    // 获取电影放映场次
    getMoviePlayTime: {
      "3.0C": "/selfSupport/front/cticket/loadSchedule",
      C: "/chenxing/api/middleground/ticket/c/cticket/getHitFilmAndFilmSession"
    },
    // 获取座位布局
    getMoviePlaySeat: {
      "3.0C": "/selfSupport/front/cticket/loadWxPlanSite",
      C: "/chenxing/api/middleground/ticket/c/cticket/getSessionSeat"
    },
    // 锁定座位
    lockSeat: {
      "3.0C": "/selfSupport/trade/front/advanceOrder/lockSeat",
      C: "/chenxing/api/middleground/trade/online/directly/cart/lockSeat"
    },
    // 获取会员卡列表
    getCardList: {
      "3.0C": "/selfSupport/trade/front/user/cards",
      C: "/chenxing/api/middleground/member/user/cards"
    },
    // 获取优惠券列表
    getQuanList: {
      "3.0C": "/selfSupport/front/coupon/list",
      C: "/chenxing/api/middleground/member/fin/voucher/ticketEnable"
    },
    // 计算价格
    priceCalculation: {
      "3.0C": "/selfSupport/trade/front/orders/calculatePrice",
      C: "/chenxing/api/middleground/trade/online/directly/cart/calculatePrice"
    },
    // 创建订单
    createOrder: {
      "3.0C": "/selfSupport/trade/front/orders/submitOrder",
      C: "/chenxing/api/middleground/trade/online/directly/order/submitOrder"
    },
    // 支付订单
    buyTicket: {
      "3.0C": "/selfSupport/trade/front/order/onlinePay",
      C: "/chenxing/api/middleground/trade/online/directly/payment/onlinePay"
    },
    // 获取订单信息
    queryOrderDetail: {
      "3.0C": "/selfSupport/trade/front/orders/queryOrderDetail",
      C: "/chenxing/api/middleground/trade/online/directly/order/queryOrderDetail"
    },
    // 取消订单
    cancelOrder: {
      "3.0C": "/selfSupport/trade/front/orders/cancelOrder",
      C: "/chenxing/api/middleground/trade/online/directly/order/cancelOrder"
    },
    // 释放座位
    releaseSeat: {
      "3.0C": "/selfSupport/trade/front/advanceOrder/releaseSeat",
      C: "/chenxing/api/middleground/trade/online/directly/cart/releaseSeat"
    },
    // 绑定优惠券
    bandQuan: {
      "3.0C": "/selfSupport/trade/front/advanceOrder/releaseSeat",
      C: "/chenxing/api/middleground/member/fin/voucher/bind"
    }
  };

  let apiFunObj = {};

  Object.entries(apiUrlObj).map(([funName, apiUrl]) => {
    apiFunObj[funName] = params =>
      axios.post(apiUrl[api_version], params || {});
  });
  // console.log("apiFunObj", apiFunObj);
  return apiFunObj;
  // 获取影院列表
  const getCinemaList = params =>
    axios.post(apiUrlObj.getCinemaList[api_version], params);

  // 获取热映电影放映信息
  const getMoviePlayInfo = params =>
    axios.post("/selfSupport/front/cticket/getHitFilm", params);

  // 获取电影放映场次
  const getMoviePlayTime = params =>
    axios.post("/selfSupport/front/cticket/loadSchedule", params);

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.post("/selfSupport/front/cticket/loadWxPlanSite", params);
  // 锁定座位
  const lockSeat = params =>
    axios.post("/selfSupport/trade/front/advanceOrder/lockSeat", params);

  // 获取会员卡列表
  const getCardList = params =>
    axios.post("/selfSupport/trade/front/user/cards", params);

  // 支付时获取优惠券列表
  const getQuanList = params =>
    axios.post(
      "/selfSupport/front/coupon/list",
      params ||
        {
          // couponStatus=1
          // cardNo=20001976924X
          // cinemaCode=33018961
          // cinemaId=405384
        }
    );

  // 订单价格计算
  const priceCalculation = params =>
    axios.post(
      "/selfSupport/trade/front/orders/calculatePrice",
      params ||
        {
          // unifiedCode: "33018961",
          // cinemaCode: "33018961",
          // cinemaId: 405384,
          // defaultCardNo: "20001976924X",
          // firstCalc: true,
          // lockOrderId: "33018961202505150000154",
          // addRetailGoods: [],
          // addEquityGoods: [],
          // orderGoodsType: 1,
          // 用券额外增加参数如下：
          // activityKey: "",
          // ticketCouponCode: "SSKK3HV6",
          // optType: 0
        }
    );

  // 创建订单
  const createOrder = params =>
    axios.post(
      "/selfSupport/trade/front/orders/submitOrder",
      params ||
        {
          // unifiedCode: "14014771",
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // lockOrderId: "14014771202505190000690",
          // shareCode: ""
        }
    );
  // 接口返回
  // "lockOrderId": "14014771202505190000698",
  // 	"notPayAmount": 25.00,
  // 	"autoUnlockDatetime": "2025-05-19 17:20:48",
  // 	"orderNumber": "202505198923000470"

  // 查询订单支付参数
  const queryPayWayParam = params =>
    axios.post(
      "/selfSupport/trade/front/order/queryPayWayParam",
      params ||
        {
          // unifiedCode: "14014771",
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // orderNumber: "202505198369000467"
        }
    );

  // 电影票购买
  const buyTicket = params =>
    axios.post(
      "/selfSupport/trade/front/order/onlinePay",
      params ||
        {
          // unifiedCode: "14014771",
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // amount: "25.00",
          // orderNo: "202505198923000470",
          // businessSystemFlowNumber: "51747646051072",
          // businessSystemName: "C_TRADE",
          // payTerminal: "APPLET",
          // payTerminalType: "Applet",
          // payChannel: "TYSDYC-ZY",
          // payChannelName: "太原时代影城-自营",
          // goodBody: "影票",
          // openId: "ouYyg5Yzzmuiy_FgbgQR0eZAJ1to",
          // openID: "ouYyg5Yzzmuiy_FgbgQR0eZAJ1to", // 小程序openid
          // ipAddress: "127.0.0.1",
          // payWay: "MEMBER_CARD_PAY",
          // cardNumber: "20001941293X",
          // orderType: 1,
          // password: "150920ccedc34d24031cdd3711e43310",
          // orderNumber: "202505198923000470"
        }
    );

  // 支付订单并返回购票信息
  const payOrder = params =>
    axios.get("/sfc/order/get-my-order-result", { params });

  // 获取订单信息
  const queryOrderDetail = params =>
    axios.post(
      "/selfSupport/trade/front/orders/queryOrderDetail",
      params ||
        {
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // orderCode: "202503063864001185",
          // orderNumber: "202503063864001185"
        }
    );
  // 订单详情返回
  // {
  //   "code": 200,
  //   "timestamp": "1747646282627",
  //   "msg": "操作成功",
  //   "data": {
  //     "tenantId": "446926",
  //     "cinemaId": "729925",
  //     "cinemaCode": "14014771",
  //     "cinemaName": "山西省太原市时代影城IMAX华景天地店",
  //     "orderNumber": "202503063864001185",
  //     "autoUnlockDatetime": "2025-03-06 18:51:05",
  //     "mobilePhone": "13073792313",
  //     "cardNo": "20001941293X",
  //     "activityFlag": 1,
  //     "orderStatus": 4,
  //     "printNo": "1401477162693900", //取票码 后8位：62693900
  //     "printStatus": 1,
  //     "printTime": "2025-03-06 19:37:50",
  //     "deliveryStatus": 0,
  //     "deliveryTime": null,
  //     "orderTypeId": 1,
  //     "refundStatus": 0,
  //     "canRefundFlag": 0,
  //     "refundOrderNumber": null,
  //     "marketingCode": "CRM001",
  //     "moviePlanInfo": {
  //       "featureAppNo": "3088202503060029",
  //       "movieName": "哪吒之魔童闹海2D",
  //       "hallName": "5号激光厅丨建议3D眼镜自备或购买停车免费2小时",
  //       "version": "普通",
  //       "language": "国语",
  //       "showTime": "2025-03-06 19:30:00",
  //       "showTimeEnd": "2025-03-06 21:54:00",
  //       "filmPostURL": "http://dadi-prod-public.oss-cn-beijing.aliyuncs.com/movie/poster/movie_poster_20250120190741.jpg"
  //     },
  //     "createTime": "2025-03-06 18:42:56",
  //     "retailGoodsList": null,
  //     "movieGoodsList": [{
  //       "seatCode": "1401477105#07#12",
  //       "seatCol": "12",
  //       "seatRow": "07",
  //       "filmName": null,
  //       "cinemaTicketCode": "140147710Ob001f",
  //       "saleNum": 1,
  //       "rejectNum": 0
  //     }],
  //     "equityGoodsList": null,
  //     "priceDetail": {
  //       "activityDiscountAmount": null,
  //       "couponsDiscountAmount": null,
  //       "equityGoodsOriginAmount": 0.00,
  //       "equityGoodsRealPayAmount": 0.00,
  //       "movieGoodsDiscountAmount": 10.90,
  //       "movieGoodsOriginAmount": 35.90,
  //       "movieGoodsRealPayAmount": 25.00,
  //       "retailGoodsDiscountAmount": 0.00,
  //       "retailGoodsOriginAmount": 0.00,
  //       "retailGoodsRealPayAmount": 0.00,
  //       "serviceFee": 0.00,
  //       "serviceAddFee": 0.00,
  //       "totalGoodsDiscountPrice": 10.90,
  //       "totalRealPayAmount": 25.00,
  //       "notPayAmount": null,
  //       "rejectAmount": 0.00,
  //       "ticketTotalServiceRealPayPrice": 0.00
  //     },
  //     "isEquityOrder": 0,
  //     "ticketCount": 1,
  //     "merCount": 0,
  //     "featureAppNo": "3088202503060029",
  //     "memberId": "1805450389995130882"
  //   }
  // }
  // 获取订单列表
  const getOrderList = params =>
    axios.post(
      "/selfSupport/trade/front/orders/queryOrderList",
      params ||
        {
          // pageNo=1
          // pageSize=10
          // isEquityOrder=0
          // cinemaCode=33018961
          // cinemaId=405384
        }
    );

  // 取消订单
  const cancelOrder = params =>
    axios.post(
      "/selfSupport/trade/front/orders/cancelOrder",
      params ||
        {
          // unifiedCode: "14014771",
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // orderCode: "202505198369000467",
          // orderNumber: "202505198369000467"
        }
    );

  // 释放座位
  const releaseSeat = params =>
    axios.post(
      "/selfSupport/trade/front/advanceOrder/releaseSeat",
      params ||
        {
          // unifiedCode: "14014771",
          // cinemaCode: "14014771",
          // cinemaId: 729925,
          // defaultCardNo: "20001941293X",
          // lockOrderId: "14014771202505200000800"
        }
    );
  // 绑定优惠券
  const bandQuan = params =>
    axios.post(
      "/selfSupport/trade/front/orders/coupon/bind",
      params ||
        {
          // couponCode=123456, // 优惠券号
          // c=123456, // 优惠券号
          // cinemaCode=33018961
          // cinemaId=405384
        }
    );

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayTime,
    getMoviePlaySeat,
    lockSeat,
    getCardList,
    getQuanList,
    queryPayWayParam,
    priceCalculation,
    createOrder,
    payOrder,
    cancelOrder,
    releaseSeat,
    getOrderList,
    queryOrderDetail,
    buyTicket,
    bandQuan
  };
};
export default createApi;
