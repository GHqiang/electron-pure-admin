/**
 * @description: 影划算平台api列表
 */

import axios from "@/utils/http/yinghuasuan-request";

// 获取待报价列表
const queryStayOfferList = params =>
  axios.post("/broker/v1/invitation/list", params, { timeout: 20 * 1000 });

// 提交报价
const submitOffer = params =>
  axios.post("/broker/v1/invitation/quote/add", params);

// 获取待确认列表
const queryStayConfirmList = params =>
  axios.get("/broker/v1/invitation/quote/list", { params, timeout: 20 * 1000 });

// 确认接货
const confirmOrder = params =>
  axios.post("/broker/v1/invitation/quote/confirm", params);

// 获取待出票列表
const stayTicketingList = params =>
  axios.get("/broker/v1/order/list", { params });

// 解锁座位
const unlockSeat = params => axios.post("/broker/v1/order/unlock_seat", params);

// 提交取票码
const submitTicketCode = params =>
  axios.post("/broker/v1/order/ticket", params);

// 转单
const transferOrder = params => axios.post("/broker/v1/order/giveup", params);

export default {
  queryStayOfferList, // 待报价列表
  submitOffer, // 提交报价
  queryStayConfirmList, // 待确认列表
  confirmOrder, // 确认接货
  stayTicketingList, // 获取待出票列表
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder // 转单
};
