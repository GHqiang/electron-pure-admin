/**
 * @description: 芒果平台api列表
 */

import axios from "@/utils/http/mahua-request";

// 查询报价记录
const queryOfferRecord = params =>
  axios.post("/mhapi/movie-server/movie/bidding/info/list", params);

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/mhapi/movie-server/movie/bidding/info/list", params);

// 提交报价
const submitOffer = params =>
  axios.post("/mhapi/movie-server/movie/bidding/order/add", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/mhapi/movie-server/movie/get/order/list", params);
// 确认接货
const confirmOrder = params =>
  axios.post("/mhapi/movie-server/movie/get/order/confirm", params);

// 订单详情
const queryOrderInfo = params =>
  axios.post("/mhapi/movie-server/movie/get/order/detail", params);

// 解锁座位
const unlockSeat = params => axios.post("/v2/api/62e10db983b63", params);

// 图片识别校验
const checkTicketCodeImg = params =>
  axios.post("/mhapi/movie-server/movie/get/order/img/rec", params);

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/mhapi/movie-server/movie/get/order/report", params);

// 取消订单
const transferOrder = params =>
  axios.post("/mhapi/movie-server/movie/get/order/cancel", params);

// token续期
const refreshToken = params =>
  axios.post("/mhapi/user-server/user/customer/refresh/token", params);

export default {
  queryOfferRecord, // 查询报价记录
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  confirmOrder, // 确认接单
  unlockSeat, // 解锁座位
  checkTicketCodeImg, // 图片识别校验
  queryOrderInfo,
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList, // 查询中签订单
  refreshToken // token续期
};
