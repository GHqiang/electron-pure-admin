import { useCinemaList } from "@/store/cinemaList.js";
const cinemaStore = useCinemaList();

// 订单来源枚举，即平台
const ORDER_FORM = {
  lieren: "猎人",
  sheng: "省APP",
  mangguo: "芒果",
  mayi: "蚂蚁",
  yangcong: "洋葱",
  yinghuasuan: "影划算",
  shangzhan: "商展",
  haha: "哈哈"
};

// 测试新平台列表
const TEST_NEW_PLAT_LIST = ["yinghuasuan", "shangzhan"];

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
  4: "仅报价"
};

// sfc系列v3版本影院
const sfcV3AppList = ["hbchyxd"];

// sfc系列影院程序版本
const SFC_APP_VER_OBJ = {
  hbchyxd: ["8.0", "7.9.4"],
  ningbo: ["7.0", "7.9.4"],
  nanguojgh: ["7.0", "7.9.4"]
};

// ume系统影院
const GET_UME_LIST = () => cinemaStore.getUmeList;

// umeh5系列影院集合
const GET_H5_UME_LIST = () => cinemaStore.getH5UmeList;

// 猎人订单类型奖励金额
const LIERENR_REWARDS = {
  0: 0, // 普通
  1: 1.5, // 加急
  2: 2.5, // 特急
  3: 4 // vip
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

// 影院列表
const GET_APP_LIST = () => cinemaStore.getAppList;

// SFC影院集合列表
const GET_SFC_APP_LIST = () => cinemaStore.getSfcList;

// 影线类型
const GET_APP_TYPE_LIST = () => cinemaStore.getAppTypeList;

// 影线类型集合
const APP_TYPE_OBJ = {
  ume_applet: "凤凰云智小程序",
  ume_h5: "凤凰云智H5",
  sfc_applet: "乐影",
  lma_applet: "卢米埃"
};

window.APP_TYPE_LIST = GET_APP_TYPE_LIST();

// 排除影院集合（用于utils获取影院标识处理）
const EXCLUDE_CINEMA_LIST_BY_CINEMA_FLAG = [
  "万象影城（坪山文化聚落店）",
  "南部太平洋电影城",
  "卢米埃影城(印象城店)",
  "峨影1958电影城",
  "杭州中影国际影城（钱塘永旺梦乐城CINITY LED店）",
  "杭州中影国际影城（钱塘永旺梦乐城CINTY LED店）",
  "徐氏杜比MAX影城",
  "保利万和国际影城（奥园广场店）"
];

// 太平洋影城sfc影院名
const TPYYC_CINEMA_NAME_BY_SFC = [
  "太平洋影城（深圳喜荟城店）",
  "名山太平洋院线盛世影城",
  "太平洋影城（简阳德盛店）",
  "太平洋影城（高县店）",
  "太平洋影城（泸县店）",
  "太平洋影城（内江店）",
  "太平洋影城（德阳沃尔玛店）",
  "太平洋影城（大丰店）",
  "太平洋影城（和盛店）",
  "苍溪太平洋影城",
  "太平洋影城（资中店）",
  "太平洋影城（阆中店）",
  "太平洋影城（昭通店）",
  "太平洋院线蓬安影城（金街店）",
  "太平洋影城（阳光城店）",
  "太平洋影城（西昌店）",
  "太平洋影城（深圳八号仓店）",
  "太平洋影城（彭山逸都城店）",
  "太平洋影城（汉源店）",
  "太平洋影城（都江堰店）",
  "太平洋电影城（都江堰店）",
  "太平洋影城（东站中环壹号店）",
  "太平洋电影城（资阳沱东店）",
  "太平洋影城（双流香楠店）",
  "峨影1958电影城",
  "太平洋电影城井研店",
  "太平洋影城（洪雅店）",
  "太平洋影城（叙永店）",
  "太平洋影城（九襄店）",
  "广影·嘉陵影城",
  "成都海滨城激光4DMX影院"
];

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

// umeh5系列相关信息
const H5_UME_CINEMA_OBJ = {
  // cinemaLinkId、channelCode、tid(laskId：即sid可通过tid调接口获取)
  // 万象影城
  wanxiangh5: ["10273", "HUARUN_H5_PROD_10273_MPS"],
  // 海上明珠
  hsmzyc: ["16014", "HSMZYC_H5_PROD_S_MPS"],
  // 广州飞扬影城
  gzfyyc: ["69695", "FYYC_H5_PROD_S_MPS"],
  // 深圳新天影院
  szxtyy: ["15730", "SJXT_H5_PROD_10666_MPS"],
  // 唐阁影城
  cqshyc: ["12909", "TANGGE_H5_PROD_S_MPS"],
  // 华夏万幕国际影城（成山路巴黎春天店）
  hxwmgjyc: ["12680", "WMGJ_H5_PROD_12679_MPS"],
  // 深圳海岸影城
  szhayc: ["15383", "HAC_H5_PROD_15383_MPS"],
  // 深圳华夏星光国际影城
  szhxxggjyc: ["10240", "SZHXXG_H5_PROD_S_MPS"],
  // 米瑞酷影城
  miruiku: ["16564", "MRK_H5_PROD_S_MPS"],
  // 苏宁影城
  suning: ["10534", "SN_H5_PROD_S_MPS"],
  // 首都影城
  shoudu: ["12070", "SHOUDU_H5_PROD_S_MPS"],
  // 利群华艺影城
  liqunhuayi: ["11696", "LIQUN_H5_PROD_S_MPS"],
  // 上海金球
  shjq: ["11713", "JINQIU_H5_PROD_11713_MPS"],
  // 上海珠影沪亚
  shzyhy: ["69688", "ZYHYYD_H5_PROD_69688_MPSUB"],
  // 深圳金田
  szjt: ["12892", "XJYH_H5_PROD_12892_MPS"],
  // 广州期遇逸
  gzqyt: ["12593", "QYYD_H5_PROD_12593_MPS"],
  // 悠渡
  youdu: ["13101", "YD_H5_PROD_13101_MPS"],
  // 上海馨乔
  shxq: ["11891", "SHXQ_H5_PROD_11891_MPSUB"],
  // 中影国线石岩
  zygxsy: ["10876", "ZYGX_H5_PROD_10876_MPS"],
  // 华凯国际影城
  hkgjyc: ["12590", "TONGMEI_H5_PROD_12590_MPS"],
  // 时光巨幕影城房山店
  sgjmycfsd: ["16130", "FSSGJM_H5_PROD_16130_MPS"],

  // 星光嘉映影城（南京雨山天街店）
  xgjyycnjystjd: ["15372", "XGJY_H5_PROD_15372_MPS"],
  // 北京英嘉国际
  // bjyjgj: ["11751", "YJXM_H5_PROD_11751_MPSUB"],
  // 中影华宇国际
  zyhygj: ["13462", "ZYSZHY_H5_PROD_13462_MPS"],
  // 天娱广场天河电影城
  tygcthdyc: ["16610", "TIANYU_H5_PROD_16610_MPS"],
  // 武商梦时代摩尔影城
  wsmsdmeyc: ["16066", "WSME_H5_PROD_16066_MPS"],
  // 武商摩尔国际电影城
  wsmegjdyc: ["12885", "WSME_H5_PROD_12885_MPS"],
  // 深影国际影城（学院南路CGS中国巨幕店）
  szgjyc: ["11758", "SYGJ_H5_PROD_11758_MPS"],
  // 合肥三里庵星爵影城
  hfslaxjyc: ["69402", "XINGJUE_H5_PROD_69402_MPS"],
  // 嘉华国际影城（学清路店）
  jhgjyc: ["16074", "JIAHUA_H5_PROD_16074_MPS"],
  // 江西华影国际影城（中山天虹店）
  jxhygjyc: ["10823", "PENGYU_H5_PROD_10823_MPS"],
  // 杭州时代联合影城
  hzsdlhyc: ["13108", "HZSDLH_H5_PROD_13108_MPS"],
  // 上海轩影国际影城
  xygjyc: ["69711", "SHXY_H5_PROD_69711_MPS"],
  // 广州华影青宫电影城（CINITY店）
  gzhyqgdyc: ["10745", "ZYYG_H5_PROD_10745_MPS"],
  // 中山IM电影城（南朗巨幕店）
  zsimdyc: ["10689", "ZSWS_H5_PROD_10689_MPSUB"],
  // 北京劲松电影院
  jsdyy: ["13173", "JINSONG_H5_PROD_13173_MPS"],
  // 杭州悦江新远影院
  yjxyyc: ["13458", "SDYX_H5_PROD_13458_MPSUB"],
  // 华夏天合影城（次渠新城商厦店）
  hxthyc: ["11478", "THGJ_H5_PROD_11478_MPS"],
  // 武商众圆摩尔影城
  wszymeyc: ["12887", "WSME_H5_PROD_12887_MPS"],
  // SFC上影国际影城高德置地广场店
  sfcsygjyc: ["16463", "CFR_H5_PROD_16463_MPS"],
  // 纳美国际影城（全新光峰激光放映技术）
  nmgjyc: ["13165", "NAMEI_H5_PROD_13165_MPS"],
  // 保利万和国际影城三利爱琴海店
  blwhgjyc: ["16206", "BLSLAQH_H5_PROD_16206_MPS"],
  // 上海世纪友谊影城LUXE南方商城店
  sjyyyc: ["11788", "SJHQYX_H5_PROD_11788_MPS"],
  // 北京万画田村影院
  bjwhtcyy: ["11489", "WANHUA_H5_PROD_11489_MPS"],
  // 中影南方CINITYLED华强广场店
  zynfhqgcd: ["15260", "TWZYNF_H5_PROD_15260_MPS"],
  // 万画影城国投财富广场店
  whycgtcfgcd: ["12430", "WANHUA_H5_PROD_12430_MPS"],
  // 365影院（天通苑文化艺术中心）
  bj365yy: ["16840", "CPSLW_H5_PROD_16840_MPS"],
  // 中影UC国际影城（锦泰城店）
  zyucgjyc: ["69192", "ZYUC_H5_PROD_69192_MPS"]
};

// 微信小程序openid
const APP_OPENID_OBJ = {
  sfc: "otEMo42FC38PgJiYDvu6HrGjrwQY",
  xywdgmyc: "oOiC55RPsQs1XZLzM_cklZ2pbvnk",
  zhongying: "oZQEA7Xzuot6Gb4Xj9ELwRlYEri0",
  bailaohui: "oBOi46wSC0VFZVHREN_1Qrr_o2Sc",
  lyzy: "oekH_4_xX7k0hZwTopPN_CDpWNdo",
  cswyh: "oKLyP4hIUw8CggpTmS3P5zcU9FXQ",
  bjdzlt: "oIkMV5BkjhLVUj5ws2wPVBYieqJ4",
  glyc: "o5nuI64TLqvAat13QOPN5rlTpwkY",
  jiujin: "o9z475KmUY5DGBCmA8iHonVW4zco",
  hbchyxd: "oY_OW5JDOHt6bDtaMpFvnrFcTM64", // 0f35YE100ZZg3T1vFx3009dslN15YE1D   oY_OW5JDOHt6bDtaMpFvnrFcTM64
  jinji: "oTJ0a48lR3TPBfblHCqLLn-kdRro",
  ningbo: "o1TM95HQabEWcsC6u2S0XPd4ge5w",
  laina: "oPKih4oNM3oGJGcEItWiN5lJ93oA",
  hema: "oD3rN4ge-6H9Q4mYVBBJcsMFoRkc",
  dsyc: "0e3M6p200SW2CS1VcJ100oErLd0M6p2y",
  jqx: "0c3dq2nl2aYFVd4B7Yll2FTobD1dq2n8",
  fszy: "0c34Cu000WxYCS10LS1002gyW824Cu0v",
  xywszy: "0d3eLY0w3BFPi33zlU3w3G2Jmy3eLY02",
  jjzy: "0a3qMuml26eyZd4MdKkl2IS2kX3qMumV",
  whyx: "0d3L6v000AqYCS1cDv200Nk1Rj1L6v0P",
  hzzy: "0b3kzk100aSlES1Z4Y300MotTC3kzk1s",
  shzy: "0f35vI0w3ir7j33lkh3w39K8cv15vI0O",
  hongshi: "owgjs4gKzy5Q5dz6eTqR-hMFHy0M",
  limeihua: "ok7FI49HybuSq5RNx49q6eNnzof4",
  hengye: "okxaO68YGIDHtSOfKw4UOCv-_4Co",
  minzu: "o6jsm440WovuVPr1tSNm21xqj_nQ",
  yinxingnc: "ohRBp5CS0H0jThxNFBnLVaBK2ROQ",
  yinxingxy: "oqlIF5uEe7ueJzkhAHvPEsW4cwgw",
  liangchen: "oFSv95QrvI3_5mUEAWBG_JrseZ-s",
  suzhou: "o1pgA7dSvGDpwzo5qLgL0163Ibxo",
  quanmei: "oQlN65N9QJFlABGHVcK1KFuwM-LY",
  yongheng: "oyJTi5Ji8B2DoiiRmjWv4eakE684",
  nanguojgh: "osJTy5IDMVmwodwKlj_uoHkyR3s0",
  baoneng: "oLPNc5YNrh5RFNfY-xCco1S5Cn-w",
  hefeidianying: "oKYoo47HgpOfxBppN7iLt2ZUeCQI",
  chaohuzhongying: "orMoC5MEcNYCRanvng3Jecq1O_eo",
  hfzybdd: "oqu7r5QjhpZMU3pNUtdsaldYijd0",
  hfzywpcd: "odZ1O5cB97ux2MWnhL0pA3ry_QkQ",
  hfzyzdgcd: "oo9wS5PcefuVMi0W8dnvoUuClCJc",
  hfzydxjd: "oIexg5L8JNyDhr0NSW6lD_t8U3lA",
  hfzyzhd: "oFFe55S5HS4CFhmud2OKB5uBVd1k",
  wfzyyxhd: "oQosr43DGV1bf-x6dVHOj6TOppwc",
  wfzygeshgcd: "oC9Mu5B9W5Hvbi1OYcULLKonlfLE",
  nchgtdd: "oVMDU5J_aur4-Uw3ahi5HZ6gbNi8",
  hfbddd: "oCFwp43wXjAuzH64FqgCs5Onkcjw",
  hflkldd: "oPA485J9bAFDb1Cy1dmszU2YaENE",
  ttylw: "os2pL5WIRCF9j_BUNXd5kpgrMEO0",
  ytgjyc: "oCoKA4m0U6JA1gOax7NVjNpNI_js",
  dghs: "oeeJH430q6SuIDVrUWXHHJ2Arn2U",
  // tjlnx: "o7R2D4rA_SO8aVRORMcIN9CKE8YY",
  // bjlnx: "oGOc_4y5CLlhc59W1esyqNLC1_sg",
  // cdlnx: "oitaV4qv9zQRcpnVIW0e6y3VEjrA",
  jsdgm: "oBxHf5duN7bMnsd3T7-X9csx3x2A",
  slsy: "oL5Gw6-Pyale_B2-sOWXKJ6cqVJk",
  gbsy: "oZJsH5c9cYGXSaUkZ9ta6ZJ8vb9o",
  jyhx: "oALrE5Ph3Zir_aHYlzMIlln8k7tY",
  hkzy: "oqVjm5c4Q6lIu_a41-9K-R6YLN90",
  hgwz: "oHK364jCg5RHMK3k56CNQ8n-1glo",
  shjy: "oME2H5IYbp1zs5Vu_ySCoWA4w-MA",
  tjlq: "o3Eav4jNPOqQF9UAfd83UXgMnwxE",
  shth: "os4vr4k5lf2ZumgE-YcDACUVF3mY",
  szyl: "on0L74gstiyCUfnWgwNt5NsCvjYE",
  xyfsy: "okyGN62IVGBQpvqa4beaCs302oUE",
  cszykd: "oK5yB5LS6D9H1pvdO6P8aSP0_ijQ",
  cszyyzx: "o1ps25Y8zsCfmbp3etbugsnDaU_I",
  qina: "ouKdc5bCNh_0ygvtmniED-u9kIbA",
  zyxmccone: "oxLZg45UxLU-3Qz4sAWO5pU86k2k"
};

// 影院group组别标识
const APP_GROUP_OBJ = {
  sfc: "20045",
  xywdgmyc: "20371",
  zhongying: "20020",
  bailaohui: "10000",
  lyzy: "20482",
  cswyh: "20328",
  bjdzlt: "20615",
  glyc: "20673",
  jiujin: "20253",
  hbchyxd: "20061",
  jinji: "20047",
  ningbo: "20023",
  laina: "20463",
  hema: "20064",
  dsyc: "20659",
  jqx: "20664",
  fszy: "20121",
  xywszy: "20011",
  jjzy: "20703",
  whyx: "20717",
  hzzy: "20637",
  shzy: "20677",
  hongshi: "20120",
  limeihua: "20496",
  hengye: "20669",
  minzu: "20039",
  yinxingnc: "20087",
  yinxingxy: "20320",
  liangchen: "20604",
  suzhou: "20710",
  quanmei: "20529",
  yongheng: "20012",
  nanguojgh: "20288",
  baoneng: "20151",
  hefeidianying: "20025",
  chaohuzhongying: "20568",
  hfzybdd: "20670",
  hfzywpcd: "20392",
  hfzyzdgcd: "20667",
  hfzydxjd: "20665",
  hfzyzhd: "20270",
  wfzyyxhd: "20684",
  wfzygeshgcd: "20685",
  nchgtdd: "20499",
  hfbddd: "20407",
  hflkldd: "20453",
  ttylw: "20648",
  ytgjyc: "20176",
  dghs: "20416",
  // tjlnx: "20523",
  // bjlnx: "20622",
  // cdlnx: "20579",
  jsdgm: "20618",
  slsy: "20698",
  gbsy: "20582",
  jyhx: "20293",
  hkzy: "20156",
  hgwz: "20191",
  shjy: "20190",
  tjlq: "20400",
  shth: "20074",
  szyl: "20333",
  xyfsy: "20674",
  cszykd: "20679",
  cszyyzx: "20681",
  qina: "20004",
  zyxmccone: "20738"
};

// 微信消息推送id
const WX_MSG_UID = {
  1: "UID_AIFZVT3B4zcj10CvGFLKB2hS2wt7", // 张三
  9: "UID_Dc5u7HJZSLvjbGIwPeZmiSRPurim", // 苦瓜
  10: "UID_NnfJzb7r8pPyfhuq89OOrzr216Ba", // 兜儿
  11: "UID_aN8haBm8iKK2rlufRiBqNVL0pCen", // 婷婷
  15: "UID_Wp4B8hCtrhCmHtM1S6MlgCWJlz7O", // 婷婷小号
  20: "UID_XBUYeeRmX0Y9DzPp3pFp1rxP4mzN" // 令狐冲
};

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

// 耀莱影院名称(小程序名称)
const YAOLAI_CINEMA_NAME = [
  "福建浦城春天国际影城（永晖店）",
  "济南耀莱成龙影城（领秀城店）",
  "石家庄耀莱成龙影城（北国商城店）",
  "石家庄耀莱成龙影城（新乐店）",
  "青岛耀莱成龙影城（黄岛店）",
  "燕郊耀莱成龙影城（迎宾路店）",
  "成都耀莱成龙影城（兴园路店）",
  "洛阳耀莱成龙影城（中州中路店）",
  "银川耀莱成龙影城（金凤店）",
  "北京耀莱成龙影城（温泉镇店）",
  "北京耀莱成龙国际影城（房山店）",
  "北京耀莱成龙影城（慈云寺店）",
  "北京耀莱成龙影城（五棵松店）",
  "北京耀莱成龙影城（丽泽桥店）",
  "北京耀莱成龙影城（临河里店）",
  "北京耀莱成龙影城（西红门店）",
  "北京耀莱成龙影城（马连道店）",
  "长春耀莱成龙影城（宽城店）",
  "遵义耀莱成龙影城（湄潭店）",
  "嘉兴耀莱成龙影城（海宁小镇广场店）",
  "保定耀莱成龙影城（望都店）",
  "福建闽侯春天国际影城(大学城店)",
  "福建省长乐市春天国际影城(十洋店)",
  "广州耀莱成龙影城（增城新塘店）",
  "福建泉州春天国际影城(泉港永嘉店)",
  "三亚耀莱成龙影城（亚龙湾店）",
  "孝感耀莱成龙影城（孝昌店）",
  "西宁耀莱成龙影城（海湖店）",
  "天津耀莱成龙影城（蓟县店）",
  "合肥耀莱成龙影城（加侨店）",
  "贵阳耀莱成龙影城（清镇店）",
  "南阳耀莱成龙影城（孔明南路店）",
  "淮南耀莱成龙影城（朝阳中路店）",
  "无锡耀莱成龙影城（智慧路店）"
];

// UME影院名称(小程序名称)
const UME_CINEMA_NAME = [
  "UME影城（长沙砂之船店）",
  "UME影城（河北石家庄店）",
  "UME影城（四川南充店）",
  "太平洋影城（时代豪廷店）",
  "UME影城（成都金牛店）",
  "UME影城（成都大邑店）",
  "UME影城（成都高新店）",
  "UME影城（河北邯郸店）",
  "UME影城（四川乐山店）",
  "UME影城（北京安贞店）",
  "UME影城（北京双井店）",
  "UME影城（北京华星店）",
  "UME影城（绍兴曲屯店）",
  "UME影城（武汉青山店）",
  "UME影城（杭州良渚店）",
  "UME影城（杭州城西店）",
  "UME影城（杭州紫荆天街店）",
  "UME影城（宁波镇海店）",
  "UME影城（宁波天一店）",
  "UME影城（上海新天地店）",
  "UME影城（上海宝山店）",
  "UME影城（上海虹桥天地店）",
  "UME影城（宝鸡行政中心店）",
  "UME影城（西安浐灞店）",
  "UME影城（西安小寨店）",
  "UME影城（山西太原店）",
  "UME影城（天津东丽店）",
  "UME影城（重庆双桥店）",
  "太平洋影城（重庆石柱店）",
  "UME影城（重庆解放碑店）",
  "UME影城（重庆大足店）",
  "UME影城（重庆北碚店）",
  "UME影城（重庆南岸店）",
  "UME影城（重庆两江店）",
  "UME影城（重庆金港店）",
  "UME影城（重庆綦江店）",
  "UME影城（重庆南滨店）",
  "UME影城（重庆涪陵店）",
  "UME影城（重庆江北店）",
  "UME影城（重庆华岩店）",
  "UME影城（重庆融汇温泉店）",
  "UME影城（重庆沙坪坝店）",
  "UME影城（重庆渝中店）",
  "UME影城（重庆九龙坡店）",
  "UME影城（重庆爱加星悦荟店）",
  "UME影城（重庆璧山店）",
  "UME影城（重庆金沙店）",
  "UME影城（重庆时代天街店）",
  "CMC华人影城（摩尔国际店）",
  "CMC华人影城（泸州龙驰店）",
  "UME影城（合肥高新店）",
  "UME影城（芜湖镜湖店）",
  "UME影城（贵阳小河店）",
  "UME影城（苏州狮山店）",
  "UME影城（苏州金鸡湖店）",
  "UME影城（南通中南CBD店）",
  "UME影城（海门高新店）",
  "UME影城（南京玄武门店）"
];

// 完美影院名称(小程序名称)
const WANMEI_CINEMA_NAME = [];

// 英皇影院名称(小程序名称)
const YINGHUANG_CINEMA_NAME = [
  "英皇电影城-长沙国金中心店",
  "英皇电影城-成都新光天地店",
  "英皇电影城-成都国金中心店",
  "英皇电影城-成都悠方店",
  "英皇电影城-北京英皇集团中心店",
  "英皇电影城-重庆国金中心店",
  "英皇电影城-重庆新光天地店",
  "英皇电影城-合肥万象城店",
  "英皇电影城-佛山岭南站店",
  "英皇电影城-沈阳盛京龙城店",
  "英皇电影城-赣州杉杉奥特莱斯店",
  "英皇电影城-深圳平安金融中心店",
  "英皇电影城-深圳东海缤纷店",
  "英皇电影城-深圳深业上城店"
];

// 浙影时代影院名称(小程序名称)
const ZHEYINGSHIDAI_CINEMA_NAME = [
  "浙影时代·玉环店",
  "浙影时代·舟山金球东港凯虹广场店",
  "浙影时代·密云店",
  "浙影时代·合肥金球宝业东城广场店",
  "浙影时代·华影星空影城",
  "浙影时代影城·西湖文化广场店",
  "浙影时代·富阳鹿山时代店",
  "浙影时代·桐庐金球店",
  "浙影时代·西溪欢乐城IMAX店",
  "浙影时代·和达店",
  "浙影时代·众安广场店",
  "浙影时代-萧山开元店",
  "浙影时代·新农都店",
  "浙影时代·奥斯卡店",
  "浙影时代·翠苑店",
  "东影时代影城（吉安店）",
  "浙影时代·宁波东门银泰店",
  "浙影时代·慈溪新都汇店",
  "浙影时代·六安海心沙广场店",
  "浙影时代影城 名悦广场店"
];

export {
  ORDER_FORM,
  TICKET_STATUS,
  TEST_NEW_PLAT_LIST,
  sfcV3AppList,
  SFC_APP_VER_OBJ,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST,
  GET_APP_LIST,
  GET_APP_TYPE_LIST,
  APP_TYPE_OBJ,
  H5_UME_CINEMA_OBJ,
  LIERENR_REWARDS,
  GROUP_LIST,
  TICKET_CONPREFIX_OBJ,
  APP_OPENID_OBJ,
  APP_GROUP_OBJ,
  WX_MSG_UID,
  SFC_CINEMA_NAME,
  YAOLAI_CINEMA_NAME,
  UME_CINEMA_NAME,
  WANMEI_CINEMA_NAME,
  YINGHUANG_CINEMA_NAME,
  ZHEYINGSHIDAI_CINEMA_NAME,
  TPYYC_CINEMA_NAME_BY_SFC,
  EXCLUDE_CINEMA_LIST_BY_CINEMA_FLAG,
  CINEMA_STATUS_OBJ
};
