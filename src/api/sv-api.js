/**
 * @description: 服务端api（用户管理、报价/出票记录）
 */

import axios from "@/utils/http/sv-request";

// 登录
const login = params => axios.get("/svpi/users/login", { params });
// 退出登录
const logout = params => axios.get("/svpi/users/logout", { params });

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

export default {
  login,
  logout,
  getOfferList,
  queryOfferList,
  addOfferRecord,
  getTicketList,
  queryTicketList,
  addTicketRecord
};
