// 订单来源，即平台
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

// 出票状态
const TICKET_STATUS = {
  1: "成功",
  2: "失败",
  3: "已退票",
  4: "仅报价"
};
// 优惠券类型
const QUAN_TYPE = {
  40: "sfc-40",
  35: "sfc-35",
  30: "sfc-30",
  "renhengmeng-40": "仁恒梦-40",
  "ume-putong": "ume-普通厅",
  "ume-teshu": "ume-特殊厅",
  "yaolai-yixain": "耀莱一线普通",
  "yaolai-erxian": "耀莱二线普通",
  "yaolai-yixianbu5": "耀莱一线普通补5"
};

// 优惠券成本
const QUAN_TYPE_COST = {
  40: 38.8,
  35: 35,
  30: 30,
  "renhengmeng-40": 40,
  "ume-putong": 32,
  "ume-teshu": 45,
  "yaolai-yixain": 34,
  "yaolai-erxian": 30,
  "yaolai-yixianbu5": 30
};

// 优惠券标识
const QUAN_TYPE_FLAG = {
  40: "上影券-40",
  35: "上影券-35",
  30: "上影券-30",
  "renhengmeng-40": "团体券",
  "ume-putong": "会员普通厅",
  "ume-teshu": "会员特殊厅",
  "yaolai-yixain": "（小程序）免费影票兑换券",
  "yaolai-erxian": "影票兑换券",
  "yaolai-yixianbu5": "影票兑换券"
};

// ume系统影院
const UME_LIST = [
  "ume",
  "yaolai",
  "renhengmeng",
  "wanmei",
  "yinghuang",
  "zheyingshidai"
];

// 影院列表
const APP_LIST = {
  ume: "UME",
  yaolai: "耀莱",
  renhengmeng: "仁恒梦影廊",
  wanmei: "完美",
  yinghuang: "英皇",
  zheyingshidai: "浙影时代",
  sfc: "上影",
  jiujin: "华夏久金",
  jinji: "北京金鸡",
  ningbo: "宁波影都",
  laina: "莱纳龙域",
  hema: "河马国际",
  dsyc: "大商影城",
  cqhx: "华熙国际",
  jqx: "金泉港",
  fszy: "佛山中影",
  xywszy: "襄阳武商中影",
  jjzy: "九江中影",
  whyx: "武汉银兴",
  hzzy: "杭州中影",
  shzy: "上海中影",
  hongshi: "红石影城惠南店",
  limeihua: "利美华胤",
  hengye: "恒业电影城",
  minzu: "民族影城",
  yinxingws: "银兴武商",
  yinxingnc: "银兴南昌",
  yinxingxy: "银兴襄阳",
  liangchen: "良辰乐娃",
  suzhou: "苏州中影",
  quanmei: "全美",
  yongheng: "永恒时代",
  nanguojgh: "南国影城金光华店",
  baoneng: "宝能影城",
  hefeidianying: "合肥电影",
  chaohuzhongying: "巢湖中影",
  hfzybdd: "合肥中影心悦城店",
  hfzywpcd: "合肥中影万派城店",
  hfzyzdgcd: "合肥中影正大广场店",
  hfzydxjd: "合肥中影东西街店",
  hfzyzhd: "合肥中影中环店",
  wfzyyxhd: "潍坊中影印象汇店",
  wfzygeshgcd: "潍坊中影歌尔生活广场店",
  nchgtdd: "南昌红谷滩丁丁",
  hfbddd: "合肥百大丁丁",
  hflkldd: "合肥乐客来丁丁",
  ttylw: "天通苑乐娃",
  ytgjyc: "益田国际影城",
  // dghs: "东莞红石",
  tjlnx: "天津莱纳星",
  bjlnx: "北京莱纳星",
  cdlnx: "成都莱纳星",
  jsdgm: "金山大光明",
  jwzy: "津湾中影",
  slsy: "三林上影",
  gbsy: "古北上影",
  jyhx: "金谊华夏",
  hkzy: "海口中影",
  // hgwz: "横岗万众",
  shjy: "上海巨影",
  tjlq: "天津乐奇",
  shth: "上海太禾",
  szyl: "苏州永乐",
  xyfsy: "新业坊上影",
  cszykd: "长沙中影凯德",
  cszyyzx: "长沙中影壹中心",
  qina: "齐纳国际"
};

// 非SFC影院集合列表
const NO_SFC_APP_LIST = [
  ...UME_LIST
  // "ume",
  // "yaolai",
  // "renhengmeng",
  // "wanmei",
  // "yinghuang",
  // "zheyingshidai"
];
// 平台关联应用
const PLAT_LINK_APP = {
  lieren: [
    "sfc",
    "jiujin",
    "jinji",
    "laina",
    "ningbo",
    "qina",
    "hongshi",
    "limeihua",
    "hengye",
    "minzu",
    "yinxingws",
    "yinxingnc",
    "yinxingxy",
    "liangchen",
    "suzhou",
    "quanmei",
    "yongheng",
    "nanguojgh",
    "baoneng",
    "hefeidianying",
    "chaohuzhongying",
    "hfzybdd",
    "hfzywpcd",
    "hfzyzdgcd",
    "hfzydxjd",
    "hfzyzhd",
    "wfzyyxhd",
    "wfzygeshgcd",
    "nchgtdd",
    "hfbddd",
    "hflkldd",
    "ttylw",
    "ytgjyc",
    "dghs",
    "tjlnx",
    "bjlnx",
    "cdlnx",
    "jsdgm",
    "jwzy",
    "slsy",
    "gbsy",
    "jyhx",
    "hkzy",
    "hgwz",
    "shjy",
    "tjlq",
    "shth",
    "szyl",
    "xyfsy",
    "cszykd",
    "cszyyzx",
    "lumiai"
  ],
  sheng: ["sfc", "lumiai"]
};

// sfc特殊影院集合
const SFC_SPECIAL_CINEMA_LIST = [
  // 无锡
  {
    order_cinema_name: "SFC上影影城东港店原红豆影城",
    sfc_cinema_name: "SFC上影影城无锡东港店"
  },
  {
    order_cinema_name: "SFC上影影城硕放店",
    sfc_cinema_name: "SFC上影影城无锡硕放店"
  },
  // 湛江
  {
    order_cinema_name: "SFC上影影城万象金沙湾广场店",
    sfc_cinema_name: "SFC上影影城湛江店"
  },
  // 北京
  {
    order_cinema_name: "SFC上影影城房山绿地缤纷店",
    sfc_cinema_name: "SFC上影影城北京房山店"
  },
  {
    order_cinema_name: "SFC上影影城北京大兴龙湖天街IMAX店",
    sfc_cinema_name: "SFC上影影城北京大兴龙湖IMAX店"
  },
  // 上海
  {
    order_cinema_name: "SFC上影影城南桥百联店",
    sfc_cinema_name: "SFC上影影城南桥百联CINITY店"
  },
  {
    order_cinema_name: "SFC上影影城天山缤谷广场IMAX店",
    sfc_cinema_name: "SFC上影影城天山缤谷IMAX店"
  },
  {
    order_cinema_name: "SFC上影百联影城大上海4DX店",
    sfc_cinema_name: "SFC上影百联影城大上海店"
  },
  {
    order_cinema_name: "SFC上影影城丁香路LUXE店",
    sfc_cinema_name: "SFC上影影城丁香路店"
  },
  {
    order_cinema_name: "SFC上影影城港汇永华IMAX店",
    sfc_cinema_name: "SFC上影影城港汇永华IMAX激光店"
  },
  {
    order_cinema_name: "上海影城SHO",
    sfc_cinema_name: "SFC上海影城SHO杜比剧场"
  },
  {
    order_cinema_name: "SFC上影影城国华广场店",
    sfc_cinema_name: "SFC上影影城国华广场LUXE店"
  },
  // 嘉兴
  {
    order_cinema_name: "SFC上影影城嘉兴八佰伴LUXE店",
    sfc_cinema_name: "SFC上影影城嘉兴八佰伴店"
  },
  // 昆明
  {
    order_cinema_name: "SFC上影影城昆明南悦城LUXE店",
    sfc_cinema_name: "SFC上影影城昆明南悦城店"
  },
  {
    order_cinema_name: "SFC上影影城西城IMAX店",
    sfc_cinema_name: "SFC上影影城昆明西城IMAX店"
  },
  // 徐州
  {
    order_cinema_name: "SFC上影影城徐州环球港店",
    sfc_cinema_name: "SFC上影影城徐州店"
  },
  // 南京
  {
    order_cinema_name: "SFC上影影城南京新城市广场店",
    sfc_cinema_name: "SFC上影影城南京店"
  },
  // 贵阳
  {
    order_cinema_name: "SFC上影影城贵阳云上方舟LUXE店",
    sfc_cinema_name: "SFC上影影城贵阳云上方舟店"
  }
];
// 华夏久金特殊影院集合
const JIUJIN_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "华夏久金国际影城",
    sfc_cinema_name: "上海华夏久金国际影城"
  }
];
// 莱纳龙域特殊影院集合
const LAINA_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: ["莱纳龙域影城", "莱纳龙域影城昌发展万科广场店"],
    sfc_cinema_name: "北京莱纳龙域影城"
  }
];
// 北京金鸡特殊影院集合
const JINJI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: ["金鸡百花影城和平东桥店", "北京金鸡百花影城影协影院"],
    sfc_cinema_name: "金鸡百花影城"
  }
];
// 宁都影波特殊影院集合
const NINGBO_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "宁波影都大榭店",
    sfc_cinema_name: "宁波影都大榭影城"
  },
  {
    order_cinema_name: "宁波民光影城",
    sfc_cinema_name: "民光影城"
  },
  {
    order_cinema_name: "天一蝴蝶影院",
    sfc_cinema_name: "蝴蝶影院天一广场店"
  },
  {
    order_cinema_name: "宁波影都鄞州印象城店",
    sfc_cinema_name: "宁波影都鄞州印象城CINITY店"
  }
];
// 齐纳国际特殊影院集合
const QINA_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "博山齐纳国际影城全激光影城",
    sfc_cinema_name: "博山齐纳国际影城"
  },
  {
    order_cinema_name: "周村齐纳国际影城桃园店全激光影城",
    sfc_cinema_name: "周村齐纳国际影城桃园店"
  },
  {
    order_cinema_name: "淄川齐纳国际影城全激光影城",
    sfc_cinema_name: "淄川齐纳国际影城原淄川全球通电影城"
  },
  {
    order_cinema_name: "临淄齐纳国际影城全激光巨幕影城",
    sfc_cinema_name: "临淄齐纳国际影城"
  },
  {
    order_cinema_name: "中影齐纳国际影城淄博银泰城店",
    sfc_cinema_name: "中影齐纳国际影城银泰城店"
  },

  {
    order_cinema_name: "高青齐纳国际影城全激光影城",
    sfc_cinema_name: "高青齐纳国际影城"
  },
  {
    order_cinema_name: "安丘齐纳国际影城安丘泰华城店",
    sfc_cinema_name: "安丘齐纳国际影城全激光巨幕影城"
  },
  {
    order_cinema_name: "齐纳国际影城柳泉路店4K激光巨幕",
    sfc_cinema_name: "齐纳影城柳泉路店4K激光巨幕"
  },

  {
    order_cinema_name: "沂源齐纳国际影城全激光影城",
    sfc_cinema_name: "沂源齐纳国际影城"
  },
  {
    order_cinema_name: "齐纳激光IMAX影城张店银座店",
    sfc_cinema_name: "齐纳国际影城淄博银座店激光IMAX"
  },
  {
    order_cinema_name: [
      "齐纳国际影城宏程OnyxLED&amp;LUXE店",
      "齐纳国际影城宏程OnyxLED&LUXE店"
    ],
    sfc_cinema_name: "齐纳国际影城宏程店"
  },
  {
    order_cinema_name: ["桓台齐纳国际影城", "齐纳国际影城马桥店"],
    sfc_cinema_name: "桓台齐纳影城马桥店"
  },
  {
    order_cinema_name: "齐纳影城吾悦广场店",
    sfc_cinema_name: "齐纳影城吾悦店"
  },
  {
    order_cinema_name: [
      "齐纳影城荣盛店全可躺式座椅影城",
      "齐纳影城荣盛店可躺式座椅影城"
    ],
    sfc_cinema_name: "齐纳影城荣盛店"
  },
  {
    order_cinema_name: "齐纳全激光国际影城薛城银座店",
    sfc_cinema_name: "枣庄齐纳国际影城"
  },
  {
    order_cinema_name: "诸城齐纳国际影城4D中百繁荣路店",
    sfc_cinema_name: "诸城齐纳国际影城"
  },
  {
    order_cinema_name: [
      "齐纳全激光影城银座奥特莱斯店",
      "蒙阴齐纳国际影城全激光影城"
    ],
    sfc_cinema_name: "蒙阴齐纳国际影城银座店"
  },
  {
    order_cinema_name: "齐纳全激光影城临沂银座奥特莱斯店",
    sfc_cinema_name: "临沂齐纳国际影城南坊店"
  },
  {
    order_cinema_name: "齐纳影城银座大学路店",
    sfc_cinema_name: "德州齐纳国际影城"
  },
  {
    order_cinema_name: [
      "利津齐纳国际影城全激光影城",
      "东营齐纳国际影城垦利店",
      "东营利津齐纳国际影城全激光影城"
    ],
    sfc_cinema_name: "利津齐纳国际影城"
  },
  {
    order_cinema_name: "滨州博兴齐纳国际影城",
    sfc_cinema_name: "博兴齐纳国际影城"
  },
  {
    order_cinema_name: "齐纳国际影城泰华新天地店",
    sfc_cinema_name: "潍坊齐纳国际影城"
  }
];
// 红石影城惠南店特殊影院集合
const HONGSHI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "红石影城惠南店",
    sfc_cinema_name: "红石影城上海惠南店"
  }
];
// 利美华胤特殊影院集合
const LIMEIHUA_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: [
      "利美华胤影城曹路恒越荣欣广场店",
      "上海利美华胤影城曹路恒越荣欣广场店"
    ],
    sfc_cinema_name: "上海利美华胤影城"
  }
];
// 恒业电影城特殊影院集合
const HENGYE_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "恒业国际影城",
    sfc_cinema_name: "恒业影城芜湖店"
  },
  {
    order_cinema_name: "恒业国际影城新兴店",
    sfc_cinema_name: "恒业影城新兴店"
  },
  {
    order_cinema_name: ["恒业影城武汉店", "恒业影城武汉店保利广场"],
    sfc_cinema_name: "恒业影城武汉店"
  }
];

// 银兴影城南昌店特殊影院集合
const YINGXINGNC_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "长江银兴影城新华店",
    sfc_cinema_name: "长江银兴影城南昌新华店"
  }
];

// 银兴影城襄阳店特殊影院集合
const YINGXINGXY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: ["长江银兴影城襄城武商店", "长江银兴影城武商MALL世贸店"],
    sfc_cinema_name: "长江银兴影城襄阳店"
  }
];

// 良辰乐娃特殊影院集合
const LIANGCHEN_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "乐娃影院",
    sfc_cinema_name: "良辰乐娃影院"
  }
];

// 永恒时代特殊影院集合
const YONGHENG_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: [
      "永恒中华大戏院三街两巷4K巨幕店",
      "永恒中华大戏院三街两巷电影院"
    ],
    sfc_cinema_name: "永恒中华大戏院"
  },
  {
    order_cinema_name: [
      "永恒晶钻CINITYLED影城",
      "永恒晶钻IMAX影城",
      "永恒晶钻CINITYLED影城西大店"
    ],
    sfc_cinema_name: "永恒晶钻影城"
  },
  {
    order_cinema_name: ["永恒星湖影城青秀巨幕店"],
    sfc_cinema_name: "永恒星湖影城"
  }
];

// 苏州中影特殊影院集合
const SUZHOU_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "中影国际影城甪直ALPD激光店",
    sfc_cinema_name: "苏州中影影城吴中区甪直店"
  }
];

// 全美影城特殊影院集合
const QUANMEI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "全美影院太原N1店",
    sfc_cinema_name: "太原全美影院"
  }
];

// 南国金光华特殊影院集合
const NANGUOJGH_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "深圳南国影城金光华店",
    sfc_cinema_name: "金光华南国影城"
  },
  {
    order_cinema_name: ["南国影城金光华二期店", "深圳南国影城金光华二期店"],
    sfc_cinema_name: "深圳南国二期影城"
  }
];

// 合肥电影特殊影院集合
const HEFEIDIANYING_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "长江影城杭州星光荟LUXE店影院",
    sfc_cinema_name: "长江影城杭州星光荟LUXE店"
  },
  {
    order_cinema_name: [
      "合肥解放电影院",
      "解放电影院OnyxLED&amp;LUXE",
      "解放电影院OnyxLED&LUXE"
    ],
    sfc_cinema_name: "合肥解放影院"
  }
];
// 巢湖电影特殊影院集合
const CHAOHUZHONGYING_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "巢湖中影国际影城百大店",
    sfc_cinema_name: "安徽巢湖中影影城"
  }
];
// 合肥中影东西街特殊影院集合
const HFZYDXJD_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "合肥中影国际影城东西街店原1912店",
    sfc_cinema_name: "合肥中影国际影城东西街店"
  }
];
// 合肥中影中环店特殊影院集合
const HFZYZHD_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "合肥中影国际影城中环购物中心店",
    sfc_cinema_name: "合肥中影国际影城中环店"
  }
];
// 天通苑乐娃特殊影院集合
const TTYLW_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "天通苑乐娃影院",
    sfc_cinema_name: "乐娃影院天通苑店"
  }
];
// 深圳益田国际影城特殊影院集合
const YTGJYC_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "深圳益田国际影城宝安店",
    sfc_cinema_name: "益田国际影城福永店"
  }
];
// 东莞红石特殊影院集合
const DGHS_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "红石影城激光杜比巨幕长安店",
    sfc_cinema_name: "红石影城东莞中正广场店"
  }
];

// 金山大光明特殊影院集合
const JSDGM_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "大光明影城金山百联店",
    sfc_cinema_name: "大光明金山百联影城"
  }
];
// 津湾中影特殊影院集合
const JWZY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "天津中影国际影城津湾CINITY店",
    sfc_cinema_name: "中影国际影城津湾CINITY店"
  }
];
// 金谊华夏特殊影院集合
const JYHX_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: ["金谊华夏影城三林店", "金谊华夏影城"],
    sfc_cinema_name: "上海金谊华夏影城"
  }
];
// 天津乐奇特殊影院集合
const TJLQ_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "乐奇国际影城天津店",
    sfc_cinema_name: "乐奇国际影城"
  }
];
// 上海太禾特殊影院集合
const SHTH_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "太禾影城浦江欢乐颂店",
    sfc_cinema_name: "上海太禾影城浦江欢乐颂店"
  }
];
// 上海巨影特殊影院集合
const SHJY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "上海巨影国际影城前台办理免费三小时停车",
    sfc_cinema_name: "上海巨影国际影城"
  }
];
// 合肥百大丁丁特殊影院集合
const HFBDDD_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "合肥丁丁影城百大奥莱店",
    sfc_cinema_name: "丁丁影城百大奥莱店"
  }
];
// 苏州永乐特殊影院集合
const SZYL_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: ["苏州永乐国际影城吾悦广场店", "永乐国际影城"],
    sfc_cinema_name: "苏州永乐国际影城"
  }
];
// 新业坊上影特殊影院集合
const XXFSY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "SFC上影国际影城新业坊店",
    sfc_cinema_name: "SFC上影国际影城新业坊店"
  }
];
// 长沙中影壹中心特殊影院集合
const CSZYYZX_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "中影国际影城中国巨幕凯德壹中心店",
    sfc_cinema_name: "长沙中影国际影城凯德壹中心店"
  }
];
// 上海中影特殊影院集合
const SHZY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "上海中影国际影城嘉定菊园新e街店",
    sfc_cinema_name: "中影国际影城上海嘉定菊园店"
  }
];
// 杭州中影特殊影院集合
const HZZY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "中影国际影城杭州星光大道店",
    sfc_cinema_name: "杭州中影国际影城星光大道店"
  },
  {
    order_cinema_name: "杭州中影国际影城星光二期CINITY店",
    sfc_cinema_name: "杭州中影国际影城星光大道二期CINITY店"
  }
  // {
  //   order_cinema_name: "杭州中影国际影城东站西子国际店",
  //   sfc_cinema_name: "杭州中影国际影城东站西子国际店"
  // }
];

// 九江中影特殊影院集合
const JJZY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "中影国际影城九江花园城店",
    sfc_cinema_name: "九江中影国际影城花园城店"
  }
];
// 金泉巷特殊影院集合
const JQX_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "北京金泉港IMAX国际影城",
    sfc_cinema_name: "金泉港IMAX国际影城"
  }
];

// 大商影城特殊影院集合
const DSYC_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "邹平新玛特大商影城",
    sfc_cinema_name: "邹平大商影城新玛特店"
  },
  {
    order_cinema_name: "大商影城新玛特店",
    sfc_cinema_name: "淄博大商影城新玛特店"
  },
  {
    order_cinema_name: "大商影城乘风新玛特店",
    sfc_cinema_name: "大庆大商影城乘风新玛特店"
  },
  {
    order_cinema_name: "大商影城新玛特店",
    sfc_cinema_name: "大连大商影城新玛特店"
  },
  {
    order_cinema_name: "大商影城于洪黄海路店",
    sfc_cinema_name: "沈阳市大商影城于洪店"
  },
  {
    order_cinema_name: "大商影城千盛店",
    sfc_cinema_name: "漯河大商影城千盛店"
  },
  {
    order_cinema_name: "大商影城千盛店",
    sfc_cinema_name: "沈阳大商影城千盛店"
  }
];

// 华熙国际特殊影院集合
const CQHX_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "华熙国际影城",
    sfc_cinema_name: "重庆华熙国际影城"
  },
  {
    order_cinema_name: "华熙国际影城",
    sfc_cinema_name: "成都华熙国际影城"
  }
];

// UME特殊影院集合(芒果平台cinemaCode不对，需要用名字匹配)
const UME_SPECIAL_CINEMA_LIST = [
  // 泸州
  {
    order_cinema_name: ["CMC华人影城泸州摩尔店"],
    sfc_cinema_name: "CMC华人影城摩尔国际店"
  },
  {
    order_cinema_name: ["UME影城OnyxLED4K巨幕新天地店"],
    sfc_cinema_name: "UME影城上海新天地店"
  },
  // 北京
  {
    order_cinema_name: ["UME影城双井CINITY巨幕店"],
    sfc_cinema_name: "UME影城北京双井店"
  },
  {
    order_cinema_name: ["UME影城华星IMAX店"],
    sfc_cinema_name: "UME影城北京华星店"
  },
  {
    order_cinema_name: ["UME影城安贞DTSX店"],
    sfc_cinema_name: "UME影城北京安贞店"
  },
  // 重庆
  {
    order_cinema_name: ["UME影城金沙天街OnyxLED店"],
    sfc_cinema_name: "UME影城重庆金沙店"
  },
  {
    order_cinema_name: ["UME影城北城天街CINITY店"],
    sfc_cinema_name: "UME影城重庆江北店"
  },
  // 杭州
  {
    order_cinema_name: ["UME影城紫荆天街店"],
    sfc_cinema_name: "UME影城杭州紫荆天街店"
  },
  // 合肥
  {
    order_cinema_name: ["合肥UME影城CGS中国巨幕合肥高新店"],
    sfc_cinema_name: "UME影城合肥高新店"
  },
  // 邯郸
  {
    order_cinema_name: ["邯郸UME影城新世纪广场店"],
    sfc_cinema_name: "UME影城河北邯郸店"
  },
  // 宁波
  {
    order_cinema_name: ["UME影城宁波镇海店万科广场中国巨幕店"],
    sfc_cinema_name: "UME影城宁波镇海店"
  },
  // 芜湖
  {
    order_cinema_name: ["UME影城DMAX芜湖镜湖店"],
    sfc_cinema_name: "UME影城芜湖镜湖店"
  },
  // 贵阳
  {
    order_cinema_name: ["UME影城小河店"],
    sfc_cinema_name: "UME影城贵阳小河店"
  },
  // 石家庄
  {
    order_cinema_name: ["UME影城石家庄店"],
    sfc_cinema_name: "UME影城河北石家庄店"
  },
  // 绍兴
  {
    order_cinema_name: ["绍兴UME影城CGS中国巨幕厅绍兴曲屯店"],
    sfc_cinema_name: "UME影城绍兴曲屯店"
  },
  // 南充
  {
    order_cinema_name: ["UME影城中国巨幕南充店"],
    sfc_cinema_name: "UME影城四川南充店"
  }
];

// 耀莱特殊影院集合
const YAOLAI_SPECIAL_CINEMA_LIST = [
  // 石家庄
  {
    order_cinema_name: ["新乐耀莱成龙影城新华路店"],
    sfc_cinema_name: "石家庄耀莱成龙影城新乐店"
  },
  // 福州
  {
    order_cinema_name: ["春天国际影城福州大学店"],
    sfc_cinema_name: "福建闽侯春天国际影城大学城店"
  },
  {
    order_cinema_name: ["长乐市春天国际影城十洋店"],
    sfc_cinema_name: "福建省长乐市春天国际影城十洋店"
  },
  // 成都
  {
    order_cinema_name: ["成都耀莱成龙影城新津店"],
    sfc_cinema_name: "成都耀莱成龙影城兴园路店"
  },
  // 南平
  {
    order_cinema_name: ["浦城县春天影城"],
    sfc_cinema_name: "福建浦城春天国际影城永晖店"
  },
  // 泉州
  {
    order_cinema_name: ["春天国际影城泉港永嘉店"],
    sfc_cinema_name: "福建泉州春天国际影城泉港永嘉店"
  },
  // 北京
  {
    order_cinema_name: ["北京耀莱成龙影城房山天街店"],
    sfc_cinema_name: "北京耀莱成龙国际影城房山店"
  }
];

// 特殊的名字匹配集合
const SPECIAL_CINEMA_OBJ = {
  ume: UME_SPECIAL_CINEMA_LIST,
  yaolai: YAOLAI_SPECIAL_CINEMA_LIST,
  renhengmeng: [],
  wanmei: [],
  yinghuang: [],
  zheyingshidai: [],
  sfc: SFC_SPECIAL_CINEMA_LIST,
  jiujin: JIUJIN_SPECIAL_CINEMA_LIST,
  jinji: JINJI_SPECIAL_CINEMA_LIST,
  ningbo: NINGBO_SPECIAL_CINEMA_LIST,
  laina: LAINA_SPECIAL_CINEMA_LIST,
  hema: [],
  dsyc: DSYC_SPECIAL_CINEMA_LIST,
  cqhx: CQHX_SPECIAL_CINEMA_LIST,
  jqx: JQX_SPECIAL_CINEMA_LIST,
  fszy: [],
  xywszy: [],
  jjzy: JJZY_SPECIAL_CINEMA_LIST,
  whyx: [],
  hzzy: HZZY_SPECIAL_CINEMA_LIST,
  shzy: SHZY_SPECIAL_CINEMA_LIST,
  hongshi: HONGSHI_SPECIAL_CINEMA_LIST,
  limeihua: LIMEIHUA_SPECIAL_CINEMA_LIST,
  hengye: HENGYE_SPECIAL_CINEMA_LIST,
  minzu: [],
  yinxingws: [],
  yinxingnc: YINGXINGNC_SPECIAL_CINEMA_LIST,
  yinxingxy: YINGXINGXY_SPECIAL_CINEMA_LIST,
  liangchen: LIANGCHEN_SPECIAL_CINEMA_LIST,
  suzhou: SUZHOU_SPECIAL_CINEMA_LIST,
  quanmei: QUANMEI_SPECIAL_CINEMA_LIST,
  yongheng: YONGHENG_SPECIAL_CINEMA_LIST,
  nanguojgh: NANGUOJGH_SPECIAL_CINEMA_LIST,
  baoneng: [],
  hefeidianying: HEFEIDIANYING_SPECIAL_CINEMA_LIST,
  chaohuzhongying: CHAOHUZHONGYING_SPECIAL_CINEMA_LIST,
  hfzybdd: [],
  hfzywpcd: [],
  hfzyzdgcd: [],
  hfzydxjd: HFZYDXJD_SPECIAL_CINEMA_LIST,
  hfzyzhd: HFZYZHD_SPECIAL_CINEMA_LIST,
  wfzyyxhd: [],
  wfzygeshgcd: [],
  nchgtdd: [],
  hfbddd: HFBDDD_SPECIAL_CINEMA_LIST,
  hflkldd: [],
  ttylw: TTYLW_SPECIAL_CINEMA_LIST,
  ytgjyc: YTGJYC_SPECIAL_CINEMA_LIST,
  dghs: DGHS_SPECIAL_CINEMA_LIST,
  tjlnx: [],
  bjlnx: [],
  cdlnx: [],
  jsdgm: JSDGM_SPECIAL_CINEMA_LIST,
  jwzy: JWZY_SPECIAL_CINEMA_LIST,
  slsy: [],
  gbsy: [],
  jyhx: JYHX_SPECIAL_CINEMA_LIST,
  hkzy: [],
  hgwz: [],
  shjy: SHJY_SPECIAL_CINEMA_LIST,
  tjlq: TJLQ_SPECIAL_CINEMA_LIST,
  shth: SHTH_SPECIAL_CINEMA_LIST,
  szyl: SZYL_SPECIAL_CINEMA_LIST,
  xyfsy: XXFSY_SPECIAL_CINEMA_LIST,
  cszykd: [],
  cszyyzx: CSZYYZX_SPECIAL_CINEMA_LIST,
  qina: QINA_SPECIAL_CINEMA_LIST
};

// 出票队列打印前缀
const TICKET_CONPREFIX_OBJ = {
  ume: "【UME自动出票】——",
  yaolai: "【耀莱自动出票】——",
  renhengmeng: "【仁恒梦影廊自动出票】——",
  wanmei: "【完美自动出票】——",
  yinghuang: "【英皇自动出票】——",
  zheyingshidai: "【浙影时代自动出票】——",
  sfc: "【上影自动出票】——",
  jiujin: "【华夏久金自动出票】——",
  jinji: "【北京金鸡自动出票】——",
  ningbo: "【宁波影都自动出票】——",
  laina: "【莱纳龙域自动出票】——",
  hema: "【河马国际自动出票】——",
  dsyc: "【大商影城自动出票】——",
  cqhx: "【华熙国际自动出票】——",
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
  yinxingws: "【银兴武商自动出票】——",
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
  tjlnx: "【天津莱纳星自动出票】——",
  bjlnx: "【北京莱纳星自动出票】——",
  cdlnx: "【成都莱纳星自动出票】——",
  jsdgm: "【金山大光明自动出票】——",
  jwzy: "【津湾中影自动出票】——",
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

// 微信小程序openid
const APP_OPENID_OBJ = {
  sfc: "otEMo42FC38PgJiYDvu6HrGjrwQY",
  jiujin: "o9z475KmUY5DGBCmA8iHonVW4zco",
  jinji: "oTJ0a48lR3TPBfblHCqLLn-kdRro",
  ningbo: "o1TM95HQabEWcsC6u2S0XPd4ge5w",
  laina: "oPKih4oNM3oGJGcEItWiN5lJ93oA",
  hema: "oD3rN4ge-6H9Q4mYVBBJcsMFoRkc",
  dsyc: "0e3M6p200SW2CS1VcJ100oErLd0M6p2y",
  cqhx: "0c3Jfd0006WfDS1F4T300zV4v81Jfd0N",
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
  yinxingws: "oUBmX5OrQYOUcEPHN6LIb8yOGSLQ",
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
  tjlnx: "o7R2D4rA_SO8aVRORMcIN9CKE8YY",
  bjlnx: "oGOc_4y5CLlhc59W1esyqNLC1_sg",
  cdlnx: "oitaV4qv9zQRcpnVIW0e6y3VEjrA",
  jsdgm: "oBxHf5duN7bMnsd3T7-X9csx3x2A",
  jwzy: "otKpg5bfva9MMcawS-0ysU249eNI",
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
  qina: "ouKdc5bCNh_0ygvtmniED-u9kIbA"
};

// 影院group组别标识
const APP_GROUP_OBJ = {
  sfc: "20045",
  jiujin: "20253",
  jinji: "20047",
  ningbo: "20023",
  laina: "20463",
  hema: "20064",
  dsyc: "20659",
  cqhx: "20142",
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
  yinxingws: "20325",
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
  tjlnx: "20523",
  bjlnx: "20622",
  cdlnx: "20579",
  jsdgm: "20618",
  jwzy: "20642",
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
  qina: "20004"
};

// 微信消息推送id
const WX_MSG_UID = {
  1: "UID_AIFZVT3B4zcj10CvGFLKB2hS2wt7", // 张三
  9: "UID_Dc5u7HJZSLvjbGIwPeZmiSRPurim", // 苦瓜
  10: "UID_NnfJzb7r8pPyfhuq89OOrzr216Ba", // 兜儿
  11: "UID_aN8haBm8iKK2rlufRiBqNVL0pCen" // 婷婷
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

export {
  ORDER_FORM,
  TICKET_STATUS,
  TEST_NEW_PLAT_LIST,
  QUAN_TYPE,
  QUAN_TYPE_COST,
  QUAN_TYPE_FLAG,
  UME_LIST,
  APP_LIST,
  NO_SFC_APP_LIST,
  PLAT_LINK_APP,
  SFC_SPECIAL_CINEMA_LIST,
  JIUJIN_SPECIAL_CINEMA_LIST,
  LAINA_SPECIAL_CINEMA_LIST,
  JINJI_SPECIAL_CINEMA_LIST,
  NINGBO_SPECIAL_CINEMA_LIST,
  SPECIAL_CINEMA_OBJ,
  TICKET_CONPREFIX_OBJ,
  APP_OPENID_OBJ,
  APP_GROUP_OBJ,
  WX_MSG_UID,
  SFC_CINEMA_NAME,
  YAOLAI_CINEMA_NAME,
  UME_CINEMA_NAME
};
