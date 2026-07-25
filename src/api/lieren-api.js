/**
 * @description: 猎人平台api列表
 */

import axios from "@/utils/http/lieren-request";

// 查询报价记录
const queryOfferRecord = params =>
  axios.post("/lieren/openapi/order/record", params);

// 获取待报价列表（拉单请求统一5秒超时，避免isFetching锁长时间持有导致后续tick全部跳过）
const queryStayOfferList = params =>
  axios.post("/lieren/openapi/order/grab", params, { timeout: 5 * 1000 });

// 获取待出票列表
const stayTicketingList = params =>
  axios.post("/lieren/openapi/order/bid", params);

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

// 确认接单
const confirmOrder = params =>
  axios.post("/lieren/openapi/order/confirm", params);

// 申请换座
const applySeatChange = params =>
  axios.post("/lieren/openapi/order/applyForSeatChange", params);

// 订单详情
const orderDetail = params =>
  axios.post("/lieren/openapi/order/details", params);

// 添加修改规则
const ruleAdd = params => axios.post("/lieren/openapi/rule/add", params);

// 删除规则
const ruleDel = params => axios.post("/lieren/openapi/rule/del", params);

// 查看规则列表
const ruleList = params => axios.post("/lieren/openapi/rule/list", params);

// 修改规则状态
const ruleState = params => axios.post("/lieren/openapi/rule/state", params);

// 院线列表
const ruleGroup = params => axios.post("/lieren/openapi/rule/group", params);

// 影院列表
const cinemaList = params =>
  axios.post("/lieren/openapi/rule/cinemaList", params);

export default {
  ruleAdd,
  ruleDel,
  ruleList,
  ruleState,
  ruleGroup,
  cinemaList,
  queryOfferRecord, // 查询报价记录
  queryStayOfferList, // 获取待报价列表
  stayTicketingList, // 获取待出票列表
  submitOffer, // 提交报价
  unlockSeat, // 解锁座位
  submitTicketCode, // 提交取票码
  transferOrder, // 转单
  confirmOrder, // 确认接单
  applySeatChange, // 申请换座
  orderDetail // 订单详情
};
