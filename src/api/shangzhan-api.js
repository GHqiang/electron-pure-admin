/**
 * @description: 商战平台api列表
 */

import axios from "@/utils/http/shangzhan-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/openapi/orderList", params, { timeout: 20 * 1000 });

// 提交报价
const submitOffer = params => axios.post("/openapi/orderBidding", params);

// 解锁座位
const unlockSeat = params => axios.post("/supplier/unlockSeat", params);

// 确认接货
const confirmOrder = params => axios.post("/supplier/startDeliver", params);

// 提交取票码(发货回调)
const submitTicketCode = params => axios.post("/openapi/outTicket", params);

// 二次更新取票码信息（此接口会覆盖出票时的取票码数据，出票后一小时后不可再进行票码更新）
const updateTicketCode = params => axios.post("/openapi/updateTicket", params);
// 取消订单
const transferOrder = params => axios.post("/openapi/outTicket", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/openapi/waitOutTicket", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  confirmOrder, // 确认接货
  submitTicketCode, // 提交取票码
  updateTicketCode, // 二次更新取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
