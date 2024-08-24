/**
 * @description: 服务端api（用户管理、报价/出票记录）
 */

import axios from "@/utils/http/sv-request";

// 登录
const login = params => axios.get("/svpi/users/login", { params });
// 退出登录
const logout = params => axios.get("/svpi/users/logout", { params });
// 更新用户信息
const updateUser = params => axios.post("/svpi/users/update", params);
// 获取用户列表
const getUserList = params => axios.get("/svpi/users", { params });

//查询统计分析
const queryAnalysis = params =>
  axios.get("/svpi/statisticalAnalysis/query", { params, timeout: 60 * 1000 });
// 获取报价列表
const getOfferList = params => axios.get("/svpi/offerRecord", { params });
// 查询报价记录
const queryOfferList = params =>
  axios.get("/svpi/offerRecord/query", { params, timeout: 60 * 1000 });
// 添加报价记录
const addOfferRecord = params => axios.post("/svpi/offerRecord/add", params);

// 获取出票列表
const getTicketList = params => axios.get("/svpi/ticketRecord", { params });
// 查询出票记录
const queryTicketList = params =>
  axios.get("/svpi/ticketRecord/query", { params, timeout: 60 * 1000 });
// 添加出票记录
const addTicketRecord = params => axios.post("/svpi/ticketRecord/add", params);
// 更新出票记录
const updateTicketRecord = params =>
  axios.post("/svpi/ticketRecord/update", params);

// 单个退票
const refundTicketRecord = params =>
  axios.post("/svpi/ticketRecord/refund", params);

// 获取优惠券列表
const getQuanList = params => axios.get("/svpi/quanRecord", { params });
// 查询优惠券列表
const queryQuanList = params => axios.get("/svpi/quanRecord/query", { params });
// 添加优惠券
const addQuanRecord = params => axios.post("/svpi/quanRecord/add", params);
// 添加用券记录
const addUseQuanRecord = params => axios.post("/svpi/quanRecord/use", params);

// 获取规则列表
const getRuleList = params => axios.get("/svpi/ruleRecord", { params });
// 查询规则列表
const queryRuleList = params => axios.get("/svpi/ruleRecord/query", { params });
// 删除规则
const deleteRule = params => axios.get("/svpi/ruleRecord/delete", { params });
// 批量删除规则
const batchDeleteRule = params =>
  axios.post("/svpi/ruleRecord/batchdelete", params);
// 添加规则
const addRuleRecord = params => axios.post("/svpi/ruleRecord/add", params);
// 修改规则
const updateRuleRecord = params =>
  axios.post("/svpi/ruleRecord/update", params);

// 获取卡列表
const getCardList = params => axios.get("/svpi/cardRecord", { params });
// 查询卡列表
const queryCardList = params => axios.get("/svpi/cardRecord/query", { params });
// 删除卡
const deleteCard = params => axios.get("/svpi/cardRecord/delete", { params });
// 批量删除卡
const batchDeleteCard = params =>
  axios.post("/svpi/cardRecord/batchdelete", params);
// 添加卡
const addCardRecord = params => axios.post("/svpi/cardRecord/add", params);
// 修改卡
const updateCardRecord = params =>
  axios.post("/svpi/cardRecord/update", params);
// 批量修改卡
const batchUpdateCardRecord = params =>
  axios.post("/svpi/cardRecord/batchUpdate", params);
// 批量卡当天使用量
const updateDayUsage = params =>
  axios.post("/svpi/cardRecord/updateUsage", params);

// 获取登录信息列表
const getLoginList = params => axios.get("/svpi/loginRecord", { params });
// 查询登录信息列表
const queryLoginList = params =>
  axios.get("/svpi/loginRecord/query", { params });
// 删除登录信息
const deleteLogin = params => axios.get("/svpi/loginRecord/delete", { params });
// 批量删除登录信息
const batchDeleteLogin = params =>
  axios.post("/svpi/loginRecord/batchdelete", params);
// 添加登录信息
const addLoginRecord = params => axios.post("/svpi/loginRecord/add", params);
// 修改登录信息
const updateLoginRecord = params =>
  axios.post("/svpi/loginRecord/update", params);

// 上传出票过程操作日志
const addTicketOperaLog = params =>
  axios.post("/svpi/operaRecord/addList", params);

export default {
  login,
  logout,
  updateUser,
  getUserList,
  queryAnalysis,
  getOfferList,
  queryOfferList,
  addOfferRecord,
  getTicketList,
  queryTicketList,
  addTicketRecord,
  updateTicketRecord,
  refundTicketRecord,
  getQuanList,
  queryQuanList,
  addQuanRecord,
  addUseQuanRecord,
  getRuleList,
  queryRuleList,
  deleteRule,
  batchDeleteRule,
  addRuleRecord,
  updateRuleRecord,
  getCardList,
  queryCardList,
  deleteCard,
  batchDeleteCard,
  addCardRecord,
  updateCardRecord,
  batchUpdateCardRecord,
  updateDayUsage,
  getLoginList,
  queryLoginList,
  deleteLogin,
  batchDeleteLogin,
  addLoginRecord,
  updateLoginRecord,
  addTicketOperaLog
};
