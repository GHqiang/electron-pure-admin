/**
 * @description: 蚂蚁平台api列表
 */

import axios from "@/utils/http/mayi-request";

// 报价记录查询
const queryOfferRecord = params =>
  axios.get("/newwww/open/api/order/pool/list", { params });

// 待报价列表查询
const queryStayOfferList = params =>
  axios.get("/newwww/open/api/order/pool/list", { params });

// 提交报价
const submitOffer = params =>
  axios.get("/newwww/open/api/order/baojia", { params });

// 中签订单查询
const stayTicketingList = params =>
  axios.get("/newwww/open/api/order/waitTicket/list", { params });

// 解锁座位
const unlockSeat = params =>
  axios.get("/newwww/open/api/order/unLockSeat", { params });

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.get("/newwww/open/api/order/uploadTicketCode", { params });

// 取消订单
const transferOrder = params =>
  axios.get("/newwww/open/api/order/cancelBaojia", { params });

export default {
  queryOfferRecord, // 查询报价记录
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList // 查询中签订单
};
