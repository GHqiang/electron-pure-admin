/**
 * @description: 华夏久金影城api列表
 */

import axios from "@/utils/http/jiujin-request";
// 获取图形/短信验证码
const getSmsCode = params =>
  axios.get("/api/v2/user/send-login-or-reg-validate-code", { params });

// 验证短信码并登录
const verifyLogin = params =>
  axios.get("/api/v2/user/validate-code-login-or-reg", { params });

// 退出登录
const logout = params => axios.get("/api/user/logout", { params });

// 获取城市列表
const getCityList = params => axios.get("/api/city/list", { params });

// 获取影院列表
const getCinemaList = params => axios.get("/api/cinema/list", { params });

// 获取线上电影列表
const getMovieList = params =>
  axios.get("/api/movie/movie-online-list", { params });

// 获取电影放映信息
const getMoviePlayInfo = params =>
  axios.get("/api/cinema/play-info", { params });

// 获取座位布局
const getMoviePlaySeat = params => axios.get("/api/play/seat", { params });

// 获取锁定座位记录
const getSeatLockRecord = params =>
  axios.get("/api/user/get-lock-seat-log", { params });

// 锁定座位
const lockSeat = params => axios.get("/api/user/lock-seat", { params });

// 获取会员卡列表
const getCardList = params =>
  axios.get("/api/card/get-user-cinema-card", { params });

// 获取优惠券列表
const getQuanList = params =>
  axios.get("/api/v2/coupon/get-offline-coupon-list", { params });

// 订单价格计算
const priceCalculation = params =>
  axios.post("/api/v2/price/calculate", params);

// 创建订单
const createOrder = params => axios.post("/api/v2/order/ng-create", params);

// 电影票购买
const buyTicket = params => axios.get("/api/ticket/ng-buy", { params });

// 支付订单并返回购票信息
const payOrder = params =>
  axios.get("/api/order/get-my-order-result", { params });

// 获取最近一次订单信息
const getLastOrder = params =>
  axios.get("/api/order/get-last-order", { params });

// 获取订单列表
const getOrderList = params =>
  axios.get("/api/order/movie-ticket-orders", { params });

// 取消订单
const cancelOrder = params =>
  axios.get("/api/order/cancel-my-order", { params });

export default {
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
  priceCalculation,
  createOrder,
  payOrder,
  getLastOrder,
  cancelOrder,
  getOrderList,
  buyTicket
};
