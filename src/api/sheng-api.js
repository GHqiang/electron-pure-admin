/**
 * @description: 省平台api列表
 */
import oldAxios from "axios";
import axios from "@/utils/http/sheng-request";

// 查询报价记录
const queryOfferRecord = params =>
  oldAxios.get("https://supplier.shenga.co/ordergrab/listLostGrabMovie", {
    params
  });

// 待报价列表查询（拉单请求统一10秒超时）
const queryStayOfferList = params =>
  axios.post("/supplier/listGrabPrice", params, { timeout: 10 * 1000 });

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
const stayTicketingList = params =>
  axios.post("/supplier/listGrabOrder", params);

// 申请换座
const applySeatChange = params => axios.post("/supplier/listGrabOrder", params);

export default {
  queryOfferRecord, // 查询报价记录
  queryStayOfferList, // 查询待报价列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  confirmOrder, // 确认接货
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  stayTicketingList, // 查询中签订单
  applySeatChange // 申请换座
};
