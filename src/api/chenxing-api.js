/**
 * @description: 辰星api列表
 */

import createAxios from "@/utils/http/chenxing-request";
const createApi = ({ app_name }) => {
  // 启用新版本服务影院列表
  let axios = createAxios({
    app_name: app_name
  });

  // 获取影院列表
  const getCinemaList = params =>
    axios.post("/selfSupport/front/cticket/getCinemaList", params);

  // 获取热映电影放映信息
  const getMoviePlayInfo = params =>
    axios.post("/selfSupport/front/cticket/getHitFilm", params);

  // 获取电影放映场次
  const getMoviePlayTime = params =>
    axios.post("/selfSupport/front/cticket/loadSchedule", params);

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.post("/selfSupport/front/cticket/loadWxPlanSite", params);

  // 获取锁定座位记录
  const getSeatLockRecord = params =>
    axios.get("/sfc/user/get-lock-seat-log", { params });

  // 锁定座位
  const lockSeat = params =>
    axios.post("/selfSupport/trade/front/advanceOrder/lockSeat", params);

  // 获取个人中心卡券信息
  const getCardAndQuanList = params =>
    axios.get("/sfc/v3/user/home", { params });

  // 获取会员卡列表
  const getCardList = params =>
    axios.post("/selfSupport/trade/front/user/cards", params);

  // 支付时获取优惠券列表
  const getQuanList = params =>
    axios.post("/selfSupport/trade/front/orders/coupon/list", params);
  // v3/coupon/get-list-when-pay 支付那获取的一个券列表

  // 个人中心优惠券列表，优先用券时使用
  const getQuanListByFirstUseQuan = params =>
    axios.get("/sfc/coupon/get-list", { params });

  // 订单价格计算
  const priceCalculation = params =>
    axios.post("/selfSupport/trade/front/orders/calculatePrice", params);

  // 创建订单
  const createOrder = params =>
    axios.post("/selfSupport/trade/front/orders/submitOrder", params);

  // 查询订单支付参数
  const queryPayWayParam = params =>
    axios.post("/selfSupport/trade/front/order/queryPayWayParam", params);

  // 电影票购买
  const buyTicket = params =>
    axios.post("/selfSupport/trade/front/order/onlinePay", params);

  // 支付订单并返回购票信息
  const payOrder = params =>
    axios.get("/sfc/order/get-my-order-result", { params });

  // 获取订单信息
  const queryOrderDetail = params =>
    axios.post("/selfSupport/trade/front/orders/queryOrderDetail", params);

  // 获取订单列表
  const getOrderList = params =>
    axios.post("/selfSupport/trade/front/orders/queryOrderList", params);

  // 取消订单
  const cancelOrder = params =>
    axios.post("/selfSupport/trade/front/orders/cancelOrder", params);

  // 绑定优惠券
  const bandQuan = params =>
    axios.post("/selfSupport/front/consumerEquityBag/bindRedeemCode", params);

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayTime,
    getMoviePlaySeat,
    getSeatLockRecord,
    lockSeat,
    getCardAndQuanList,
    getCardList,
    getQuanList,
    queryPayWayParam,
    getQuanListByFirstUseQuan,
    priceCalculation,
    createOrder,
    payOrder,
    cancelOrder,
    getOrderList,
    queryOrderDetail,
    buyTicket,
    bandQuan
  };
};
export default createApi;
