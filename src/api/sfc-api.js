/**
 * @description: sfc上影api列表
 */

import createAxios from "@/utils/http/sfc-request";
import { sfcV3AppList } from "@/common/constant";
const createApi = ({ group, app_name }) => {
  // 启用新版本服务影院列表
  let isV3App = sfcV3AppList.includes(app_name);
  let axios = createAxios({
    group: group,
    app_name: app_name
  });
  // 获取图形/短信验证码
  const getSmsCode = params =>
    axios.get("/sfc/v2/user/send-login-or-reg-validate-code", { params });

  // 验证短信码并登录
  const verifyLogin = params =>
    axios.get("/sfc/v2/user/validate-code-login-or-reg", { params });

  // 退出登录
  const logout = params => axios.get("/sfc/user/logout", { params });

  // 获取城市列表(可支持自定义控制axios配置，如超时时间、重试次数、重试间隔，配合拦截器使用)
  const getCityList = (params, config = {}) =>
    axios.get("/sfc/city/list", { params, ...config });

  // 获取影院列表
  const getCinemaList = params => axios.get("/sfc/cinema/list", { params });

  // 获取线上电影列表
  const getMovieList = params =>
    axios.get("/sfc/movie/movie-online-list", { params });

  // 获取电影放映信息
  const getMoviePlayInfo = params =>
    axios.get(isV3App ? "/sfc/v3/cinema/play-info" : "/sfc/cinema/play-info", {
      params
    });
  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.get(isV3App ? "/sfc/v3/play/seat" : "/sfc/play/seat", { params });

  // 获取锁定座位记录
  const getSeatLockRecord = params =>
    axios.get("/sfc/user/get-lock-seat-log", { params });

  // 锁定座位
  const lockSeat = params => axios.get("/sfc/user/lock-seat", { params });

  // 获取会员卡列表
  const getCardList = params =>
    axios.get("/sfc/card/get-user-cinema-card", { params });

  // 获取优惠券列表
  const getQuanList = params =>
    axios.get("/sfc/v2/coupon/get-offline-coupon-list", { params });
  // v3/coupon/get-list-when-pay 支付那获取的一个券列表

  // 个人中心优惠券列表，优先用券时使用
  const getQuanListByFirstUseQuan = params =>
    axios.get("/sfc/coupon/get-list", { params });

  // 订单价格计算
  const priceCalculation = params =>
    axios.post("/sfc/v2/price/calculate", params);

  // 创建订单
  const createOrder = params => axios.post("/sfc/v2/order/ng-create", params);

  // 电影票购买
  const buyTicket = params =>
    axios.get(isV3App ? "/sfc/v2/settlement/pay" : "/sfc/ticket/ng-buy", {
      params
    });

  // 支付订单并返回购票信息
  const payOrder = params =>
    axios.get(
      isV3App ? "/sfc/v3/order/order-detail" : "/sfc/order/get-my-order-result",
      { params }
    );

  // 获取最近一次订单信息
  const getLastOrder = params =>
    axios.get("/sfc/order/get-last-order", { params });

  // 获取订单列表
  const getOrderList = params =>
    axios.get("/sfc/order/movie-ticket-orders", { params });

  // 取消订单
  const cancelOrder = params =>
    axios.get("/sfc/order/cancel-my-order", { params });

  // 绑定优惠券
  const bandQuan = params =>
    axios.get("/sfc/v2/coupon/bind-coupon-code", { params });

  return {
    getSmsCode,
    verifyLogin,
    logout,
    getCityList,
    getCinemaList,
    getMovieList,
    getMoviePlayInfo,
    getMoviePlaySeat,
    getSeatLockRecord,
    lockSeat,
    getCardList,
    getQuanList,
    getQuanListByFirstUseQuan,
    priceCalculation,
    createOrder,
    payOrder,
    getLastOrder,
    cancelOrder,
    getOrderList,
    buyTicket,
    bandQuan
  };
};
export default createApi;
