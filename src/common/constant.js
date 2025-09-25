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
  5: "重新出票中"
};

// sfc系列v3版本影院
const sfcV3AppList = ["hbchyxd"];

// sfc系列影院程序版本
const SFC_APP_VER_OBJ = {
  hbchyxd: ["8.0", "8.0.8"],
  ningbo: ["7.0", "7.9.4"],
  nanguojgh: ["7.0", "7.9.4"]
};

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
  fenghuang_applet: "凤凰云智新版小程序"
};

window.APP_TYPE_LIST = GET_APP_TYPE_LIST();

// 出票队列打印前缀
const TICKET_CONPREFIX_OBJ = {
  hsmzyc: "【海上明珠影城自动出票】——",
  gzfyyc: "【广州飞扬影城自动出票】——",
  lma: "【卢米埃自动出票】——",
  hbchyxd: "【HBC华谊兄弟自动出票】——",
  ume: "【UME自动出票】——",
  yaolai: "【耀莱自动出票】——",
  renhengmeng: "【仁恒梦影廊自动出票】——",
  swxh: "【山文星辉自动出票】——",
  wanxiang: "【万象影城自动出票】——",
  wanxiangh5: "【万象影城H5自动出票】——",
  wanmei: "【完美自动出票】——",
  yinghuang: "【英皇自动出票】——",
  jqgw: "【金桥国文自动出票】——",
  hfhlxh: "【合肥欢乐星会自动出票】——",
  hsd: "【华士达自动出票】——",
  zyxmccone: "【中影星美CCONE自动出票】——",
  bnxm: "【博纳戏幕自动出票】——",
  tpyyc: "【太平洋影城自动出票】——",
  hzxhyd: "【杭州新华影都自动出票】——",
  ywycssd: "【悦惟影城佘山店自动出票】——",
  xgjyycnjystjd: "【星光嘉映影城南京雨山天街店自动出票】——",
  sjzhlh: "【石家庄欢乐汇自动出票】——",
  zhuying: "【珠影自动出票】——",
  zheyingshidai: "【浙影时代自动出票】——",
  sfc: "【上影自动出票】——",
  xywdgmyc: "【新杨湾大光明影城自动出票】——",
  zhongying: "【中影自动出票】——",
  bailaohui: "【百老汇自动出票】——",
  lyzy: "【龙岩中影自动出票】——",
  cswyh: "【长沙万影汇自动出票】——",
  bjdzlt: "【北京地质礼堂自动出票】——",
  glyc: "【果岭影城自动出票】——",
  jiujin: "【华夏久金自动出票】——",
  jinji: "【北京金鸡自动出票】——",
  ningbo: "【宁波影都自动出票】——",
  // laina: "【莱纳龙域自动出票】——",
  hema: "【河马国际自动出票】——",
  dsyc: "【大商影城自动出票】——",
  jqx: "【金泉港自动出票】——",
  fszy: "【佛山中影自动出票】——",
  xywszy: "【襄阳武商中影自动出票】——",
  jjzy: "【九江中影自动出票】——",
  whyx: "【武汉银兴自动出票】——",
  hzzy: "【杭州中影自动出票】——",
  shzy: "【上海中影自动出票】——",
  hongshi: "【红石影城惠南店自动出票】——",
  limeihua: "【利美华胤自动出票】——",
  hengye: "【恒业电影城自动出票】——",
  minzu: "【民族影城自动出票】——",
  yinxingnc: "【银兴南昌自动出票】——",
  yinxingxy: "【银兴襄阳自动出票】——",
  liangchen: "【良辰乐娃自动出票】——",
  suzhou: "【苏州中影自动出票】——",
  quanmei: "【全美自动出票】——",
  yongheng: "【永恒时代自动出票】——",
  nanguojgh: "【南国影城金光华店自动出票】——",
  baoneng: "【宝能影城金光华店自动出票】——",
  hefeidianying: "【合肥电影自动出票】——",
  chaohuzhongying: "【巢湖中影自动出票】——",
  hfzybdd: "【合肥中影心悦城店自动出票】——",
  hfzywpcd: "【合肥中影万派城店自动出票】——",
  hfzyzdgcd: "【合肥中影正大广场店自动出票】——",
  hfzydxjd: "【合肥中影东西街店自动出票】——",
  hfzyzhd: "【合肥中影中环店自动出票】——",
  wfzyyxhd: "【潍坊中影印象汇店自动出票】——",
  wfzygeshgcd: "【潍坊中影歌尔生活广场店自动出票】——",
  nchgtdd: "【南昌红谷滩丁丁影城自动出票】——",
  hfbddd: "【合肥百大丁丁影城自动出票】——",
  hflkldd: "【合肥乐客来丁丁影城自动出票】——",
  ttylw: "【天通苑乐娃自动出票】——",
  ytgjyc: "【益田国际影城自动出票】——",
  dghs: "【东莞红石影城自动出票】——",
  // tjlnx: "【天津莱纳星自动出票】——",
  // bjlnx: "【北京莱纳星自动出票】——",
  // cdlnx: "【成都莱纳星自动出票】——",
  jsdgm: "【金山大光明自动出票】——",
  slsy: "【三林上影自动出票】——",
  gbsy: "【古北上影自动出票】——",
  jyhx: "【金谊华夏自动出票】——",
  hkzy: "【海口中影自动出票】——",
  hgwz: "【横岗万众自动出票】——",
  shjy: "【上海巨影自动出票】——",
  tjlq: "【天津乐奇自动出票】——",
  shth: "【上海太禾自动出票】——",
  szyl: "【苏州永乐自动出票】——",
  xyfsy: "【新业坊上影自动出票】——",
  cszykd: "【长沙中影凯德自动出票】——",
  cszyyzx: "【长沙中影壹中心自动出票】——",
  qina: "【齐纳国际自动出票】——"
};

// 外部角色列表
const OUT_RULE_LIST = [3, 6, 5, 7];

// 内部角色列表
const IN_RULE_LIST = [1, 2];
// 内部角色能看到其它角色（隐藏角色除外）的报价、出票数据， 目前是在后端服务常量文件控制的

// sfc上影影院名称(小程序名称)
const SFC_CINEMA_NAME = [
  "SFC上影影城（黄山店）",
  "SFC上影影城（广州店）",
  "SFC上影影城（湛江店）",
  "SFC上影影城（贵阳云上方舟店）",
  "SFC上影影城（南京店）",
  "SFC上影影城（徐州店）",
  "SFC上影影城（沭阳店）",
  "SFC上影影城（常州环球港IMAX店）",
  "SFC上影影城（无锡硕放店）",
  "SFC上影影城（无锡东港店）",
  "SFC上影影城（青岛金狮IMAX店）",
  "SFC上影影城（西安龙湖店）",
  "SFC上影影城（西安大融城店）",
  "SFC上影影城（成都龙湖IMAX店）",
  "SFC上影影城（成都科华IMAX店）",
  "SFC上影影城（昆明永华4DX店）",
  "SFC上影影城（昆明西城IMAX店）",
  "SFC上影影城（昆明南悦城店）",
  "SFC上影影城（杭州下沙IMAX店）",
  "SFC上影影城（杭州余之城IMAX店）",
  "SFC上影影城（嘉兴八佰伴店）",
  "SFC上影影城（宁波店）",
  "SFC上影影城（北京大兴龙湖IMAX店）",
  "SFC上影影城（北京房山店）",
  "SFC上海影城（SHO杜比剧场）",
  "SFC上影影城（港汇永华IMAX激光店）",
  "SFC上影影城（新世界店）",
  "SFC上影影城（宜川路店）",
  "上影BOE-α超级影城(美罗城店)",
  "SFC上影影城（绿地缤纷城IMAX店）",
  "SFC上影影城（天山缤谷IMAX店）",
  "SFC上影影城（杨浦百联滨江店）",
  "SFC上影百联影城（又一城店）",
  "SFC上影影城（七宝店）",
  "SFC上影百联影城（八佰伴IMAX店）",
  "SFC上影影城（世博店）",
  "SFC上影影城（丁香路店）",
  "SFC上影百联影城（惠南店）",
  "SFC上影影城（金桥太茂IMAX店）",
  "SFC上影影城（南桥百联CINITY店）",
  "SFC上影影城（宝山店）",
  "SFC上影百联影城（川沙IMAX店）",
  "SFC上影百联影城（虹口店）",
  "SFC上影影城（唐镇店）",
  "SFC上影百联影城（大上海店）",
  "SFC上影影城（徐汇日月光店）",
  "SFC上影影城（国华广场LUXE店）",
  "SFC上影影城LaLaport上海金桥店",
  "SFC上影影城金沙江路店",
  "SFC上影影城（天津北宁湾店）",
  "SFC上影影城（天津天河城IMAX店）"
];

export {
  ORDER_FORM,
  TICKET_STATUS,
  ONE_STEP_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  TEST_NEW_PLAT_LIST,
  sfcV3AppList,
  SFC_APP_VER_OBJ,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
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
  TICKET_CONPREFIX_OBJ,
  OUT_RULE_LIST,
  IN_RULE_LIST,
  SFC_CINEMA_NAME,
  CINEMA_STATUS_OBJ,
  MIN_ALLOW_OFFER_SJC
};
