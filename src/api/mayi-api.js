/**
 * @description: 蚂蚁平台api列表
 */

import axios from "@/utils/http/mayi-request";

// 待报价列表查询
const queryStayOfferList = params =>
  axios.post("/newwww/api/order/newOrderListV2", params);

// 提交报价
const submitOffer = params =>
  axios.post("/newwww/api/order/huangniuBaojia", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.post("/newwww/api/order/waitTicketPage", params);

// 解锁座位
const unlockSeat = params => axios.post("/newwww/api/order/unlock", params);

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/newwww/api/order/uploadTicket4PicV2", params);

// 取消订单
const transferOrder = params =>
  axios.post("/newwww/api/order/turnOrder", params);

export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
