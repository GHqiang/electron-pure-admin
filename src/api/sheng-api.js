/**
 * @description: 省平台api列表
 */

import axios from "@/utils/http/sheng-request";

// 提交报价
const submitOffer = params => axios.post("/sp/offer", params);

// 解锁座位
const unlockSeat = params => axios.post("/sp/unlock", params);

// 提交取票码
const submitTicketCode = params => axios.post("/sp/submit", params);

// 转单（座位被锁异常等）
const transferOrder = params => axios.post("/sp/transfer", params);

export default {
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder // 转单
};
