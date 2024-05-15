/**
 * @description: 猎人平台api列表
 */

import axios from "@/utils/http/lieren-request";

// 获取待报价/出票列表
const stayTicketingList = params => axios.post("/sp/order", params);

// 提交报价
const submitOffer = params => axios.post("/sp/offer", params);

// 解锁座位
const unlockSeat = params => axios.post("/sp/unlock", params);

// 提交取票码
const submitTicketCode = params => axios.post("/sp/submit", params);

// 转单（座位被锁异常等）
const transferOrder = params => axios.post("/sp/transfer", params);

export default {
  stayTicketingList, // 获取待报价/出票列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder // 转单
};
