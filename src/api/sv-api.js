/**
 * @description: 服务端api（用户管理、报价/出票记录）
 */

import axios from "@/utils/http/sv-request";

// 登录
const login = params => axios.get("/svpi/users/login", { params });
// 退出登录
const logout = params => axios.get("/svpi/users/logout", { params });
// 设置会员卡密码
const setMemBerPwd = params =>
  axios.get("/svpi/users/setMemBerPwd", { params });
// 获取用户列表
const getUserList = params => axios.get("/svpi/users", { params });

// 获取报价列表
const getOfferList = params => axios.get("/svpi/offerRecord", { params });
// 查询报价记录
const queryOfferList = params =>
  axios.get("/svpi/offerRecord/query", { params });
// 添加报价记录
const addOfferRecord = params => axios.post("/svpi/offerRecord/add", params);

// 获取出票列表
const getTicketList = params => axios.get("/svpi/ticketRecord", { params });
// 查询出票记录
const queryTicketList = params =>
  axios.get("/svpi/ticketRecord/query", { params });
// 添加出票记录
const addTicketRecord = params => axios.post("/svpi/ticketRecord/add", params);
// 更新出票记录
const updateTicketRecord = params =>
  axios.post("/svpi/ticketRecord/update", params);

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
// 添加规则
const addRuleRecord = params => axios.post("/svpi/ruleRecord/add", params);
// 修改规则
const updateRuleRecord = params =>
  axios.post("/svpi/ruleRecord/update", params);

export default {
  login,
  logout,
  setMemBerPwd,
  getUserList,
  getOfferList,
  queryOfferList,
  addOfferRecord,
  getTicketList,
  queryTicketList,
  addTicketRecord,
  updateTicketRecord,
  getQuanList,
  queryQuanList,
  addQuanRecord,
  addUseQuanRecord,
  getRuleList,
  queryRuleList,
  deleteRule,
  addRuleRecord,
  updateRuleRecord
};
