// 订单来源，即平台
const ORDER_FORM = {
  lieren: "猎人",
  shengapp: "省APP"
};
// 影院列表
const APP_LIST = {
  sfc: "上影",
  jiujin: "华夏久金",
  jinji: "北京金鸡",
  ningbo: "宁波影都",
  laina: "莱纳龙域",
  hema: "河马国际",
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
  hfzybdd: "合肥中影百大店",
  hfzywpcd: "合肥中影万派城店",
  qina: "齐纳国际"
};
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
    "hfzybdd",
    "chaohuzhongying",
    "hfzywpcd",
    "lumiai"
  ],
  shengapp: ["sfc", "lumiai"]
};

// sfc特殊影院集合
const SFC_SPECIAL_CINEMA_LIST = [
  // 无锡
  {
    order_cinema_name: "SFC上影影城东港店原红豆影城",
    sfc_cinema_name: "SFC上影影城无锡东港店"
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
    order_cinema_name: "莱纳龙域影城昌发展万科广场店",
    sfc_cinema_name: "北京莱纳龙域影城"
  }
];
// 北京金鸡特殊影院集合
const JINJI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "北京金鸡百花影城影协影院",
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
    order_cinema_name: "沂源齐纳国际影城全激光影城",
    sfc_cinema_name: "沂源齐纳国际影城"
  },
  {
    order_cinema_name: "齐纳激光IMAX影城张店银座店",
    sfc_cinema_name: "齐纳国际影城淄博银座店激光IMAX"
  },
  {
    order_cinema_name: "齐纳国际影城宏程OnyxLED&LUXE店",
    sfc_cinema_name: "齐纳国际影城宏程店"
  },
  {
    order_cinema_name: "齐纳国际影城马桥店",
    sfc_cinema_name: "桓台齐纳影城马桥店"
  },
  {
    order_cinema_name: "齐纳影城吾悦广场店",
    sfc_cinema_name: "齐纳影城吾悦店"
  },
  {
    order_cinema_name: "齐纳影城荣盛店可躺式座椅影城",
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
    order_cinema_name: "蒙阴齐纳国际影城全激光影城",
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
    order_cinema_name: "东营利津齐纳国际影城全激光影城",
    sfc_cinema_name: "利津齐纳国际影城"
  },
  {
    order_cinema_name: "滨州博兴齐纳国际影城",
    sfc_cinema_name: "博兴齐纳国际影城"
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
    order_cinema_name: "上海利美华胤影城曹路恒越荣欣广场店",
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
  }
];

// 银兴影城南昌店特殊影院集合
const YINGXINGNC_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "长江银兴影城南昌新华店",
    sfc_cinema_name: "长江银兴影城新华店"
  }
];

// 银兴影城襄阳店特殊影院集合
const YINGXINGXY_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "长江银兴影城襄城武商店",
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
    order_cinema_name: "永恒中华大戏院三街两巷电影院",
    sfc_cinema_name: "永恒中华大戏院"
  }
];

// 苏州中影特殊影院集合
const SUZHOU_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "中影国际影城甪直ALPD激光店",
    sfc_cinema_name: "苏州中影影城甪直店"
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
    order_cinema_name: "深圳南国影城金光华二期店",
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
    order_cinema_name: "解放电影院OnyxLED&LUXE",
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
// 特殊的名字匹配集合
const SPECIAL_CINEMA_OBJ = {
  sfc: SFC_SPECIAL_CINEMA_LIST,
  jiujin: JIUJIN_SPECIAL_CINEMA_LIST,
  jinji: JINJI_SPECIAL_CINEMA_LIST,
  ningbo: NINGBO_SPECIAL_CINEMA_LIST,
  laina: LAINA_SPECIAL_CINEMA_LIST,
  hema: [],
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
  qina: QINA_SPECIAL_CINEMA_LIST
};

// 出票队列打印前缀
const TICKET_CONPREFIX_OBJ = {
  sfc: "【上影自动出票】——",
  jiujin: "【华夏久金自动出票】——",
  jinji: "【北京金鸡自动出票】——",
  ningbo: "【宁波影都自动出票】——",
  laina: "【莱纳龙域自动出票】——",
  hema: "【河马国际自动出票】——",
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
  hfzybdd: "【合肥中影百大店自动出票】——",
  hfzywpcd: "【合肥中影万派城店自动出票】——",
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
  qina: "20004"
};

// 报价规则
const OFFER_LIST = [
  {
    id: 1,
    ruleName: "1线城市普厅（40不补）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: ["北京市", "上海市"],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [
      "VIP",
      "4D",
      "IMAX",
      "巨幕",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "cinema",
      "杜比剧场",
      "LED",
      "元宇宙"
    ],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "40",
    quanValue: "40",
    offerType: "1",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 2,
    ruleName: "2线城市普厅外语（30券不补）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: ["上海市"],
    includeCinemaNames: [],
    excludeCinemaNames: [
      "SFC上影影城（杭州下沙IMAX店）",
      "SFC上影影城（成都科华IMAX店）",
      "SFC上影影城（北京大兴龙湖IMAX店）"
    ],
    includeHallNames: [],
    excludeHallNames: [
      "vip",
      "4d",
      "imax",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "cinema",
      "LED",
      "巨幕",
      "杜比剧场",
      "元宇宙"
    ],
    includeFilmNames: [],
    excludeFilmNames: [
      "九龙城寨之围城",
      "维和防暴队",
      "末路狂花钱",
      "彷徨之刃",
      "朝云暮雨",
      "谈判专家",
      "人生大事",
      "三叉戟",
      "我才不要和你做朋友呢",
      "扫黑·决不放弃",
      "来福大酒店"
    ],
    timeLimit: "",
    offerAmount: "31.5",
    quanValue: "30",
    offerType: "1",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 3,
    ruleName: "特殊厅报价（会员卡）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: [
      "vip",
      "4D",
      "IMAX",
      "巨幕",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "Cinema",
      "LED",
      "杜比",
      "元宇宙"
    ],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "0.1",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 4,
    ruleName: "会员日报价-8号IIMAX（会员卡）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: ["imax"],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    memberDay: "",
    status: "1"
  },
  {
    id: 5,
    ruleName: "会员日报价-18号普通（会员卡）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [
      "VIP",
      "4D",
      "IMAX",
      "巨幕",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "cinema",
      "杜比剧场",
      "LED",
      "元宇宙"
    ],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 6,
    ruleName: "2线国语（35券不补）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: ["上海市", "北京市", "广州市"],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [
      "vip",
      "4D",
      "IMAX",
      "巨幕",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "cinema",
      "杜比剧场",
      "LED",
      "元宇宙"
    ],
    includeFilmNames: [
      "末路狂花钱",
      "九龙城寨之围城",
      "维和防暴队",
      "彷徨之刃",
      "朝云暮雨",
      "谈判专家",
      "人生大事",
      "三叉戟",
      "我才不要和你做朋友呢",
      "扫黑·决不放弃",
      "来福大酒店"
    ],
    excludeFilmNames: [],
    timeLimit: "0.1",
    offerAmount: "36",
    quanValue: "35",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "1",
    addAmount: "",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 7,
    ruleName: "成都杭州35发行价（普厅不分国内外全部35券）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: ["成都市", "杭州市"],
    excludeCityNames: [],
    includeCinemaNames: [
      "SFC上影影城（成都科华IMAX店）",
      "SFC上影影城（杭州下沙IMAX店）"
    ],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [
      "VIP",
      "4D",
      "IMAX",
      "巨幕",
      "Onyx LED",
      "Atmos",
      "4DX",
      "LUXE",
      "cinema",
      "杜比剧场",
      "LED",
      "元宇宙"
    ],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "36",
    quanValue: "35",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "1",
    addAmount: "",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 8,
    ruleName: "会员日报价-18号vip（会员卡）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: ["vip"],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 9,
    ruleName: "会员日报价-28号4DX（会员卡）",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: [],
    excludeCityNames: [],
    includeCinemaNames: [],
    excludeCinemaNames: [],
    includeHallNames: ["4d", "4dx"],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 10,
    ruleName: "天津天河IMAX(40券出不补差)",
    orderForm: "lieren",
    shadowLineName: "sfc",
    includeCityNames: ["天津市"],
    excludeCityNames: [],
    includeCinemaNames: ["SFC上影影城（天津天河城IMAX店）"],
    excludeCinemaNames: [],
    includeHallNames: ["IMAX"],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "41",
    quanValue: "40",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "1",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 11,
    ruleName: "华夏久金",
    orderForm: "lieren",
    shadowLineName: "jiujin",
    includeCityNames: ["上海市"],
    excludeCityNames: [],
    includeCinemaNames: ["上海华夏久金国际影城"],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "2",
    addAmount: "1",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 12,
    ruleName: "莱纳龙域",
    orderForm: "lieren",
    shadowLineName: "laina",
    includeCityNames: ["北京市"],
    excludeCityNames: [],
    includeCinemaNames: ["北京莱纳龙域影城"],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "2",
    addAmount: "1",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  },
  {
    id: 13,
    ruleName: "金鸡百花",
    orderForm: "lieren",
    shadowLineName: "jinji",
    includeCityNames: ["北京市"],
    excludeCityNames: [],
    includeCinemaNames: ["金鸡百花影城"],
    excludeCinemaNames: [],
    includeHallNames: [],
    excludeHallNames: [],
    includeFilmNames: [],
    excludeFilmNames: [],
    timeLimit: "",
    offerAmount: "",
    quanValue: "",
    ruleStartTime: "",
    ruleEndTime: "",
    offerType: "2",
    addAmount: "2",
    weekDay: [],
    seatNum: "4",
    memberDay: "",
    status: "1"
  }
];
export {
  ORDER_FORM,
  APP_LIST,
  PLAT_LINK_APP,
  SFC_SPECIAL_CINEMA_LIST,
  JIUJIN_SPECIAL_CINEMA_LIST,
  LAINA_SPECIAL_CINEMA_LIST,
  JINJI_SPECIAL_CINEMA_LIST,
  NINGBO_SPECIAL_CINEMA_LIST,
  SPECIAL_CINEMA_OBJ,
  TICKET_CONPREFIX_OBJ,
  OFFER_LIST,
  APP_OPENID_OBJ,
  APP_GROUP_OBJ
};
