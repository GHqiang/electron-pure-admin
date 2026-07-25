/**
 * @description: 洋葱平台api列表
 */

import axios from "@/utils/http/yangcong-request";

// 待报价列表查询（拉单请求统一5秒超时）
const queryStayOfferList = params =>
  axios.get("/prod-api/api/ticket/order/pool", { params, timeout: 5 * 1000 });

// 提交报价
const submitOffer = params =>
  axios.post("/prod-api/api/ticket/order/baojia", params);

// 中签订单查询
const stayTicketingList = params =>
  axios.get("/prod-api/api/ticket/order/wait/list", { params });

// 解锁座位
const unlockSeat = params =>
  axios.get("/prod-api/api/ticket/order/unlock/seat", { params });

// 提交取票码(发货回调)
const submitTicketCode = params =>
  axios.post("/prod-api/api/ticket/order/upload/tcode", params);

// 取消订单
const transferOrder = params =>
  axios.get("/prod-api/api/ticket/order/turn/order", { params });

// 查询影院列表（支持模糊查询，分页数最大500）
const queryCinemaList = params =>
  axios.get("/prod-api/api/ticket/cinema/listByCityCodes", {
    params:
      params ||
      {
        // cinemaName: "ACE",
        // pageNum: 1
      }
  });
export default {
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList, // 查询中签订单
  queryCinemaList //  查询影院列表
};
