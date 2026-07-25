/**
 * @description: 芒果平台api列表
 */

import axios from "@/utils/http/newmahua-request";

// 待报价列表查询（拉单请求统一5秒超时）
const queryStayOfferList = params =>
  axios.post("/nmhapi/api/movie-server/movie/bidding/info/list", params, {
    timeout: 5 * 1000
  });

// 提交报价
const submitOffer = params =>
  axios.post("/nmhapi/api/movie-server/movie/bidding/order/add", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/order/list", params);
// 确认接货
const confirmOrder = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/order/confirm", params);

// 订单详情
const queryOrderInfo = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/order/detail", params);

// 解锁座位
const unlockSeat = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/unlock", params);

// 图片识别校验
const checkTicketCodeImg = params =>
  axios.post(
    "/nmhapi/api/user-server/user/common/img/uploadAndIdentify",
    params
  );

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/order/report", params);

// 取消订单
const transferOrder = params =>
  axios.post("/nmhapi/api/movie-server/movie/get/order/cancel", params);

// token续期
const refreshToken = params =>
  axios.post("/nmhapi/api/user-server/user/dev/login", params);

export default {
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
