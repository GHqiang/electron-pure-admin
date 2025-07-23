/**
 * @description: 守兔平台api列表
 */

import axios from "@/utils/http/shoutu-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/seller-api/order/orderList?status=1", params);

// 提交报价
const submitOffer = params => axios.post("/yp-api/ticket/order/offer", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/seller-api/order/orderList?status=3", params);

// 确认接货
const confirmOrder = params =>
  axios.post("/yp-api/ticket/order/confirm-issue", params);

// 解锁座位
const unlockSeat = params =>
  axios.get("/seller-api/order/getLockSeat", { params });

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/yp-api/ticket/order/issue-tickets", params);

// 取消订单
const transferOrder = params =>
  axios.post("/yp-api/ticket/order/kick-back-order", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  confirmOrder, // 确认接货
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
