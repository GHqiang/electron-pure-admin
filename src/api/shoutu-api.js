/**
 * @description: 守兔平台api列表
 */

import axios from "@/utils/http/shoutu-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/yp-api/ticket/order/list-wait-quote-order", params, {
    timeout: 25 * 1000
  });

// 提交报价
const submitOffer = params => axios.post("/yp-api/ticket/order/offer", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/seller-api/order/orderList?status=3", params);

const findWaitRange = params =>
  axios.post("/yp-api/ticket/config/find-wait-range", params);

const findWaitNum = params =>
  axios.post("/yp-api/ticket/author/find-wait-num", params);

// 确认接货前置处理
const confirmOrderPrevHandle = params =>
  axios.post("/yp-api/ticket/order-list/set-bury-point", params);
// 确认接货
const confirmOrder = params =>
  axios.post("/yp-api/ticket/order/confirm-issue", params);

// 获取是否需要解锁
const getIsUnlock = params =>
  axios.post("/yp-api//ticket/order/get-lock-seat", params);

// 解锁座位
const unlockSeat = params =>
  axios.post("/yp-api/ticket/order/unlock-seat", params);

// 提交前校验
const checkOrder = params =>
  axios.post("/yp-api/ticket/intercept/check-intercept", params);
// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/yp-api/ticket/order/issue-tickets", params);

// 取消订单
const transferOrder = params =>
  axios.post("/yp-api/ticket/order/kick-back-order", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  confirmOrderPrevHandle, // 确认接货前置处理
  confirmOrder, // 确认接货
  getIsUnlock, // 获取是否需要解锁
  unlockSeat, // 解锁座位
  checkOrder, // 提交前校验
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  findWaitRange,
  findWaitNum,
  stayTicketingList // 查询中签订单
};
