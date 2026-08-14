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

// 查询字典表
const queryDictList = params => axios.get("/svpi/dictRecord", { params });
// 查询字典列表（分页，管理用）
const queryDictListPage = params =>
  axios.get("/svpi/dictRecord/query", { params });
// 新增字典
const addDictRecord = params => axios.post("/svpi/dictRecord/add", params);
// 修改字典
const updateDictRecord = params =>
  axios.post("/svpi/dictRecord/update", params);
// 删除字典（逻辑删除）
const deleteDictRecord = params =>
  axios.get("/svpi/dictRecord/delete", { params });
// 批量删除字典（逻辑删除）
const batchDeleteDictRecord = params =>
  axios.post("/svpi/dictRecord/batchdelete", params);

// 查询名称映射表
const queryNameMatchList = params => axios.get("/svpi/nameMatch", { params });

//查询统计分析
const queryAnalysis = (params, config) =>
  axios.get("/svpi/statisticalAnalysis/query", {
    params,
    timeout: 60 * 1000,
    ...config
  });
// 查询统计分析-按日趋势(报价量/报价成功率/利润 + 失败原因构成 + raw 计数,供环比/激增计算)
const queryAnalysisTrend = (params, config) =>
  axios.get("/svpi/statisticalAnalysis/trend", {
    params,
    timeout: 60 * 1000,
    ...config
  });
// 查询统计分析-平台拆解(按订单来源分组的 raw 计数与金额)
const queryAnalysisPlat = (params, config) =>
  axios.get("/svpi/statisticalAnalysis/plat", {
    params,
    timeout: 60 * 1000,
    ...config
  });
// days=30&clear=1

// 统计分析聚合回填
const queryAnalysisRebuild = (params, config) =>
  axios.get("/svpi/statisticalAnalysis/rebuild", {
    params,
    timeout: 60 * 1000,
    ...config
  });

// 查询报价记录
const queryOfferList = params =>
  axios.get("/svpi/offerRecord/query", { params, timeout: 60 * 1000 });

// 查询最近中标记录
const queryDealOfferList = params =>
  axios.get("/svpi/offerRecord/queryDealRecord", {
    params,
    timeout: 30 * 1000
  });

// 查询订单报价信息
const queryOfferInfo = params =>
  axios.get("/svpi/offerRecord/queryOfferInfo", { params, timeout: 30 * 1000 });

// 添加报价记录
const addOfferRecord = params => axios.post("/svpi/offerRecord/add", params);
// 更新报价记录
const updateOfferRecord = params =>
  axios.post("/svpi/offerRecord/update", params);
// 查询第三方 ID 缓存（跨订单复用，命中则跳过城市/影院/影片/场次查询链）
const getCachedThirdPartyIds = params =>
  axios.get("/svpi/offerRecord/cached-ids", { params, timeout: 7 * 1000 });
// 查询出票记录
const queryTicketList = params =>
  axios.get("/svpi/ticketRecord/query", { params, timeout: 60 * 1000 });

// 查询最近出票用券记录
const queryUsedQuanList = params =>
  axios.get("/svpi/ticketRecord/queryUsedQuan", { params, timeout: 30 * 1000 });
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
// 查询某些券列表
const queryQuanRecordList = params =>
  axios.post("/svpi/quanRecord/queryList", params);
// 添加优惠券
const addQuanRecord = params => axios.post("/svpi/quanRecord/add", params);
// 添加用券记录
const addUseQuanRecord = params => axios.post("/svpi/quanRecord/use", params);

// 获取规则列表
const getRuleList = params => axios.get("/svpi/ruleRecord", { params });
// 查询规则列表
const queryRuleList = params =>
  axios.get("/svpi/ruleRecord/query", {
    params,
    timeout: 60 * 1000,
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
  });
// 删除规则
const deleteRule = params => axios.get("/svpi/ruleRecord/delete", { params });
// 批量删除规则
const batchDeleteRule = params =>
  axios.post("/svpi/ruleRecord/batchdelete", params);
// 批量追加平台报价
const batchAddPlatOffer = params =>
  axios.post("/svpi/ruleRecord/batchAddPlatOffer", params);
// 添加规则
const addRuleRecord = params => axios.post("/svpi/ruleRecord/add", params);
// 修改规则
const updateRuleRecord = params =>
  axios.post("/svpi/ruleRecord/update", params);
// 新增规则操作日志
const addRuleOperationLog = params =>
  axios.post("/svpi/ruleOperationLog/add", params);
// 批量新增规则操作日志
const batchAddRuleOperationLog = params =>
  axios.post("/svpi/ruleOperationLog/batchAdd", params);

// 获取卡列表
const getCardList = params => axios.get("/svpi/cardRecord", { params });
// 查询卡列表
const queryCardList = params =>
  axios.get("/svpi/cardRecord/query", { params, timeout: 30 * 1000 });
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

// 更新卡余额
const updateCardBalance = params =>
  axios.post("/svpi/cardRecord/updateBalance", params);
// 批量更新卡余额
const batchUpdateCardBalance = params =>
  axios.post("/svpi/cardRecord/batchUpdateBalance", params);
// 批量新增卡
const batchAddCardRecord = params =>
  axios.post("/svpi/cardRecord/batchAdd", params);

// 批量修改卡
const batchUpdateCardRecord = params =>
  axios.post("/svpi/cardRecord/batchUpdate", params);
// 更新卡当天及当月使用量
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
// 查询登录今日出票数（按手机号，用于固定报价时日出票券数达标校验）
const getLoginDailyTicketUsedCount = params =>
  axios.post("/svpi/loginRecord/dailyTicketUsed", params);

// 获取万达影院信息列表
const getWandaCinemaList = params =>
  axios.get("/svpi/wanda-film-ser/cinema/list", { params });

// 获取影院信息列表
const getCinemaList = params => axios.get("/svpi/cinemaRecord", { params });
// 查询影院信息列表
const queryCinemaList = params =>
  axios.get("/svpi/cinemaRecord/query", { params });
// 删除影院信息
const deleteCinema = params =>
  axios.get("/svpi/cinemaRecord/delete", { params });
// 批量删除影院信息
const batchDeleteCinema = params =>
  axios.post("/svpi/cinemaRecord/batchdelete", params);
// 添加影院信息
const addCinemaRecord = params => axios.post("/svpi/cinemaRecord/add", params);
// 修改影院信息
const updateCinemaRecord = params =>
  axios.post("/svpi/cinemaRecord/update", params);
// 删除影院及关联数据
const deleteCinemaWithRelated = params =>
  axios.post("/svpi/cinemaRecord/deleteWithRelated", params);

// 查询影院映射信息列表
const queryCinemaMatchList = params =>
  axios.get("/svpi/cinemaCodeMatch/query", { params, timeout: 35 * 1000 });
// 查询未同步的影院列表
const queryNoSyncCinemaList = params =>
  axios.get("/svpi/cinemaCodeMatch/queryNoSyncCinemaList", { params });
// 删除影院映射信息
const deleteCinemaMatch = params =>
  axios.get("/svpi/cinemaCodeMatch/delete", { params });
// 批量删除影院映射信息
const batchDeleteCinemaMatch = params =>
  axios.post("/svpi/cinemaCodeMatch/batchdelete", params);

// 根据id删除影院映射信息
const deleteById = params =>
  axios.post("/svpi/cinemaCodeMatch/deleteById", params);
// 添加影院映射信息
const addCinemaMatch = params =>
  axios.post("/svpi/cinemaCodeMatch/add", params);
// 批量添加影院映射信息
const batchAddCinemaMatch = params =>
  axios.post("/svpi/cinemaCodeMatch/batchAdd", params);
// 修改影院映射信息
const updateCinemaMatch = params =>
  axios.post("/svpi/cinemaCodeMatch/update", params);
// 智能更新影院映射信息，补充平台影院名字
const updateCinemaMapping = params =>
  axios.post("/svpi/cinemaCodeMatch/smartUpdateName", params);

// 上传出票过程操作日志
const addTicketOperaLog = params =>
  axios.post("/svpi/operaRecord/addList", params);
// 查询会员卡当天及当月出票量
const getCardDailyAndMonthlyTicketCount = params =>
  axios.get("/svpi/cardRecord/cardDailyAndMonthlyTicketCount", { params });

// 查询券库存
const queryQuanInventory = params =>
  axios.get("/svpi/quanRecord/queryQuanInventory", { params });

// 批量导入券
const batchAddQuan = params => axios.post("/svpi/quanRecord/batchAdd", params);

// 批量删除券（导出即删）
const batchDeleteQuan = params =>
  axios.post("/svpi/quanRecord/batchdelete", params);

// 查询操作日志
const queryLogRecord = params =>
  axios.get("/svpi/operaRecord/query", { params });

// 同步中标价
const syncDealPrice = params =>
  axios.post("/svpi/offerRecord/syncDealPrice", params);

// 获取券类型列表
const getQuanTypeList = params => axios.get("/svpi/quanType", { params });
// 查询券类型列表
const queryQuanTypeList = params =>
  axios.get("/svpi/quanType/query", { params });
// 查询券类型信息
const queryQuanTypeInfo = params =>
  axios.get("/svpi/quanType/queryQuanInfo", { params });
// 删除券类型
const deleteQuanType = params => axios.get("/svpi/quanType/delete", { params });
// 批量删除券类型
const batchDeleteQuanType = params =>
  axios.post("/svpi/quanType/batchdelete", params);
// 添加券类型
const addQuanType = params => axios.post("/svpi/quanType/add", params);
// 修改券类型
const updateQuanType = params => axios.post("/svpi/quanType/update", params);
// 批量修改券类型（事务原子性，用于券库存批量更新）
const batchUpdateQuanType = params =>
  axios.post("/svpi/quanType/batchUpdate", params);
// 批量更新用券记录（导出券）
const exportQuanList = params =>
  axios.post("/svpi/quanRecord/batchUpdate", params);

// 查询临期券
const queryExpiringQuan = params =>
  axios.get("/svpi/quanRecord/expiring", { params });

// 更新券记录
const updateQuanRecord = params =>
  axios.post("/svpi/quanRecord/update", params);

// 获取特殊匹配列表
const getSpecialNameList = params =>
  axios.get("/svpi/specialNameRecord", { params });
// 查询特殊匹配规则列表
const querySpecialNameList = params =>
  axios.get("/svpi/specialNameRecord/query", { params });
// 删除特殊匹配
const deleteSpecialName = params =>
  axios.get("/svpi/specialNameRecord/delete", { params });
// 批量删除特殊匹配
const batchDeleteSpecialName = params =>
  axios.post("/svpi/specialNameRecord/batchdelete", params);
// 添加特殊匹配
const addSpecialNameRecord = params =>
  axios.post("/svpi/specialNameRecord/add", params);
// 修改特殊匹配
const updateSpecialNameRecord = params =>
  axios.post("/svpi/specialNameRecord/update", params);

// 查询关联的平台规则id
const queryLinkPlatRuleId = params =>
  axios.post("/svpi/platRuleRecord/query", params);

// 新增关联的平台规则id
const addLinkPlatRuleId = params =>
  axios.post("/svpi/platRuleRecord/add", params);

const svApi = {
  queryLinkPlatRuleId,
  addLinkPlatRuleId,
  queryNameMatchList, // 查询名称映射表
  queryDictList, // 查询字典列表
  queryDictListPage, // 查询字典列表（分页，管理用）
  addDictRecord, // 新增字典
  updateDictRecord, // 修改字典
  deleteDictRecord, // 删除字典（逻辑删除）
  batchDeleteDictRecord, // 批量删除字典（逻辑删除）
  login,
  logout,
  updateUser,
  getUserList,
  queryAnalysis,
  queryAnalysisTrend,
  queryAnalysisPlat,
  queryAnalysisRebuild,
  queryOfferList,
  queryDealOfferList,
  queryOfferInfo,
  addOfferRecord,
  updateOfferRecord,
  getCachedThirdPartyIds,
  queryTicketList,
  queryUsedQuanList,
  addTicketRecord,
  updateTicketRecord,
  refundTicketRecord,
  getQuanList,
  queryQuanList,
  queryQuanRecordList,
  addQuanRecord,
  addUseQuanRecord,
  getRuleList,
  queryRuleList,
  deleteRule,
  batchDeleteRule,
  batchAddPlatOffer,
  addRuleRecord,
  updateRuleRecord,
  addRuleOperationLog,
  batchAddRuleOperationLog,
  getCardList,
  queryCardList,
  deleteCard,
  batchDeleteCard,
  addCardRecord,
  updateCardRecord,
  updateCardBalance,
  batchUpdateCardBalance,
  batchAddCardRecord,
  batchUpdateCardRecord,
  updateDayUsage,
  getLoginList,
  queryLoginList,
  deleteLogin,
  batchDeleteLogin,
  addLoginRecord,
  updateLoginRecord,
  getLoginDailyTicketUsedCount,
  addTicketOperaLog,
  getCardDailyAndMonthlyTicketCount,
  queryQuanInventory,
  queryLogRecord,
  syncDealPrice,
  getQuanTypeList,
  queryQuanTypeList,
  queryQuanTypeInfo,
  deleteQuanType,
  batchDeleteQuanType,
  addQuanType,
  updateQuanType,
  batchUpdateQuanType,
  batchAddQuan,
  batchDeleteQuan,
  exportQuanList,
  queryExpiringQuan,
  updateQuanRecord,
  getSpecialNameList,
  querySpecialNameList,
  deleteSpecialName,
  batchDeleteSpecialName,
  addSpecialNameRecord,
  updateSpecialNameRecord,
  getWandaCinemaList,
  getCinemaList,
  queryCinemaList,
  deleteCinema,
  batchDeleteCinema,
  addCinemaRecord,
  updateCinemaRecord,
  deleteCinemaWithRelated,
  queryCinemaMatchList,
  deleteCinemaMatch,
  batchDeleteCinemaMatch,
  deleteById,
  addCinemaMatch,
  batchAddCinemaMatch,
  updateCinemaMatch,
  updateCinemaMapping,
  queryNoSyncCinemaList
};
window.svApi = svApi;
export default svApi;
