/**
 * @description: 芒果平台api列表
 */

import axios from "@/utils/http/mangguo-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.get("/v2/api/637ca60f4dc12", { params });

// 提交报价
const submitOffer = params => axios.post("/v2/api/62e100228cf89", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.get("/v2/api/62e0e016407d6", { params });

// 解锁座位
const unlockSeat = params => axios.post("/v2/api/62e10db983b63", params);

// 提交取票码(发货回调)
const submitTicketCode = params => axios.post("/v2/api/62e8f86c4130a", params);

// 取消订单
const transferOrder = params => axios.post("//v2/api/64113ee99fa6e", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
