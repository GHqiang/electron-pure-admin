/**
 * @description: 猎人平台api列表
 */

import axios from "@/utils/http/lieren-request";

// 查询报价记录
const queryOfferRecord = params =>
  axios.post("/lieren/openapi/order/record", params);

// 获取待报价列表
const queryStayOfferList = params =>
  axios.post("/lieren/openapi/order/grab", params);

// 获取待出票列表
const stayTicketingList = params =>
  axios.post("/lieren/openapi/order/grab", params);

// 提交报价
const submitOffer = params => axios.post("/lieren/openapi/order/offer", params);

// 解锁座位
const unlockSeat = params => axios.post("/lieren/openapi/order/unlock", params);

// 提交取票码
const submitTicketCode = params =>
  axios.post("/lieren/openapi/order/submit", params);

// 转单（座位被锁异常等）
const transferOrder = params =>
  axios.post("/lieren/openapi/order/transfer", params);

export default {
  queryOfferRecord, // 查询报价记录
  queryStayOfferList, // 获取待报价列表
  stayTicketingList, // 获取待出票列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder // 转单
};
