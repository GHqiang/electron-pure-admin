/**
 * @description: 省平台api列表
 */

import axios from "@/utils/http/sheng-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/supplier/listGrabPrice", params);

// 提交报价
const submitOffer = params => axios.post("/supplier/setGrabPrice", params);

// 解锁座位
const unlockSeat = params => axios.post("/supplier/unlockSeat", params);

// 确认接货
const confirmOrder = params => axios.post("/supplier/startDeliver", params);

// 提交取票码(发货回调)
const submitTicketCode = params => axios.post("/supplier/deliver", params);

// 取消订单
const transferOrder = params =>
  axios.post("/supplier/cancelSupplierOrder", params);

// 中签订单查询
const queryHitOrder = params => axios.post("/supplier/listGrabOrder", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  confirmOrder, // 确认接货
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  queryHitOrder // 查询中签订单
};
