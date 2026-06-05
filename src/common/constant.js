import { useCinemaList } from "@/store/cinemaList.js";
const cinemaStore = useCinemaList();

import { appUserInfo } from "@/store/appUserInfo.js";
const appInfoStore = appUserInfo();

// 订单来源枚举，即平台
const ORDER_FORM = {
  lieren: "猎人",
  sheng: "省APP",
  mangguo: "芒果",
  mayi: "蚂蚁",
  yangcong: "洋葱",
  yinghuasuan: "影划算",
  shangzhan: "商展",
  haha: "哈哈",
  shoutu: "守兔",
  mahua: "麻花"
};

// 最小允许报价时间差(报价结束时间距离当前时间差)
const MIN_ALLOW_OFFER_SJC = 1 * 1000;

// 无手续费平台
const NO_FEE_PLAT_LIST = ["yinghuasuan", "haha", "shoutu", "mahua"];

// 0.1步进报价平台
const ONE_STEP_PLAT_LIST = ["yinghuasuan", "haha", "shoutu", "mahua"];

// 测试新平台列表
const TEST_NEW_PLAT_LIST = ["shangzhan"];

// 影线状态枚举
const CINEMA_STATUS_OBJ = {
  1: "正常",
  2: "禁用",
  3: "已删除"
};

// 出票状态枚举
const TICKET_STATUS = {
  1: "成功",
  2: "失败",
  3: "已退票",
  4: "仅报价",
  5: "重新出票中",
  9: "申请换座中"
};

// sfc系列v3版本影院
const sfcV3AppList = ["hbchyxd"];

// 猎人订单类型奖励金额
const LIERENR_REWARDS = {
  0: 0, // 普通
  1: 1.5, // 加急
  2: 2.5, // 特急
  3: 2.5 // vip
};

// 含有影院标识的影院列表
const GROUP_LIST = [
  "sfc", // 上影
  "hbchyxd", // hbc华谊兄弟
  "zhongying", // 中影
  "bailaohui", // 百老汇

  "lma", // 卢米埃

  "ume", // UME
  "yaolai", // 耀莱
  "wanmei", // 完美
  "tpyyc", // 太平洋影城
  "zheyingshidai", // 浙影时代
  "yinghuang", // 英皇

  "hsmzyc", // 海上明珠
  "wanxiang", // 万象
  "wanxiangh5", // 万象h5
  "gzfyyc", // 广州飞扬影城
  "cqshyc", // 唐阁
  "miruiku", // 米瑞酷影城
  "suning", // 苏宁影城
  "shoudu" // 首都影城
];

// 可用影院列表
const GET_APP_LIST = () => cinemaStore.getUsableAppList;
// 全部影院列表
const GET_ALL_APP_LIST = () => cinemaStore.getAllAppList;
// 可用影院列表
const GET_USABLE_APP_LIST = () => cinemaStore.getUsableAppList;
// SFC影院集合列表
const GET_SFC_APP_LIST = () => cinemaStore.getSfcList;
// ume系统影院
const GET_UME_LIST = () => cinemaStore.getUmeList;

// umeh5系列影院集合
const GET_H5_UME_LIST = () => cinemaStore.getH5UmeList;
// 辰星系列影院集合
const GET_CHENXING_LIST = () => cinemaStore.getChenxingList;
// 凤凰新版系列影院集合
const GET_FENGHUANG_LIST = () => cinemaStore.getFenghuangList;

// 金逸系列影院集合
const GET_JINYI_LIST = () => cinemaStore.getJinyiList;

// 获取某个影线配置信息
const GET_APP_INFO = app_name =>
  cinemaStore.allAppList.find(item => item.app_name === app_name);
// 可用影线类型
const GET_APP_TYPE_LIST = () => cinemaStore.getCanAppTypeList;
// 全部影线类型
const GET_ALL_APP_TYPE_LIST = () => cinemaStore.getAllAppTypeList;
// 全部登录信息
const GET_ALL_APP_LOGIN_LIST = () => appInfoStore.getAllLoginInfoList;

// 影线类型集合
const APP_TYPE_OBJ = {
  ume_applet: "凤凰云智小程序",
  ume_h5: "凤凰云智H5",
  sfc_applet: "乐影",
  lma_applet: "卢米埃",
  chenxing_applet: "辰星小程序",
  fenghuang_applet: "凤凰云智新版小程序",
  jinyi_applet: "金逸小程序",
  wanda_applet: "万达小程序"
};

window.APP_TYPE_LIST = GET_APP_TYPE_LIST();

// 可以同步影院code映射的影线类型列表
const SYNC_CINEMA_CODE_APP_TYPE_LIST = [
  "ume_applet",
  "chenxing_applet",
  "jinyi_applet"
];

// 内部角色列表
const IN_RULE_LIST = [2];

// 报价失败原因分类
const OFFER_FAIL_TYPE = {
  1: "超限价",
  2: "该影院无规则",
  3: "有规则但未开启",
  4: "券无库存",
  5: "无可用卡",
  6: "该影厅未包含规则",
  7: "官网拉取数据失败",
  8: "平台已报价",
  9: "座位数不符",
  10: "低于成本价",
  11: "订单张数超出促销数",
  12: "提交异常"
};

/**
 * 根据 err_msg 自动推断报价失败原因分类
 * @param {string} err_msg - 失败原因描述
 * @returns {number|null} 分类编号，无法匹配时返回 null
 */
const getOfferFailType = err_msg => {
  if (!err_msg) return null;
  // 超限价
  if (/超过平台限价|超限报价|超过平台限价不报价/.test(err_msg)) return 1;
  // 该影院无规则
  if (/按影院筛选后.*报价规则为空/.test(err_msg)) return 2;
  // 有规则但未开启
  if (/按启用状态筛选后.*报价规则为空/.test(err_msg)) return 3;
  // 券无库存
  if (/按券库存筛选后.*报价规则为空/.test(err_msg)) return 4;
  // 无可用卡
  if (/该影院没有可用会员卡/.test(err_msg)) return 5;
  // 该影厅未包含规则
  if (/按影厅筛选后.*报价规则为空/.test(err_msg)) return 6;
  // 官网拉取数据失败
  if (
    /获取目标影片信息失败|获取目标影院失败|获取目标城市影院列表失败|匹配影片放映场次失败|获取电影放映信息返回空|获取电影放映信息异常/.test(
      err_msg
    )
  )
    return 7;
  // 平台已报价
  if (/猎人已自动报价|该规则由平台进行报价/.test(err_msg)) return 8;
  // 座位数不符
  if (/按座位数筛选后.*报价规则为空/.test(err_msg)) return 9;
  // 低于成本价
  if (/低于真实成本|最终报价.*低于真实成本/.test(err_msg)) return 10;
  // 订单张数超出促销数
  if (/促销票数低于订单票数/.test(err_msg)) return 11;
  // 提交异常
  if (/提交报价异常/.test(err_msg)) return 12;
  return null;
};

export {
  SYNC_CINEMA_CODE_APP_TYPE_LIST,
  ORDER_FORM,
  TICKET_STATUS,
  ONE_STEP_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  TEST_NEW_PLAT_LIST,
  sfcV3AppList,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GET_JINYI_LIST,
  GET_SFC_APP_LIST,
  GET_APP_LIST,
  GET_ALL_APP_LIST,
  GET_USABLE_APP_LIST,
  GET_APP_TYPE_LIST,
  GET_ALL_APP_TYPE_LIST,
  GET_APP_INFO,
  GET_ALL_APP_LOGIN_LIST,
  APP_TYPE_OBJ,
  LIERENR_REWARDS,
  GROUP_LIST,
  IN_RULE_LIST,
  CINEMA_STATUS_OBJ,
  MIN_ALLOW_OFFER_SJC,
  OFFER_FAIL_TYPE,
  getOfferFailType
};
