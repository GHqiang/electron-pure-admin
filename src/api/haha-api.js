/**
 * @description: 哈哈平台api列表
 */

import axios from "@/utils/http/haha-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/api/Synchro/pcToList", params, { timeout: 25 * 1000 });

// 提交报价
const submitOffer = params => axios.post("/api/Synchro/toPrice", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.get("/api/Synchro/getOrderList", { params });

// 确认接货
const confirmOrder = params => axios.post("/api/Synchro/orderConfirm", params);

// 解锁座位
const unlockSeat = params => axios.post("/api/synchro/unLockSeat", params);

// 提交取票码(发货回调)
const submitTicketCode = params => axios.post("/api/Synchro/pushOrder", params);

// 取消订单
const transferOrder = params => axios.post("/api/Synchro/toOutOrder", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  confirmOrder, // 确认接单
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
