// 订单来源，即平台
const ORDER_FORM = {
  lieren: "猎人",
  shengapp: "省APP"
};
// 影院列表
const APP_LIST = {
  sfc: "上影",
  jiujin: "久金",
  jinji: "金鸡",
  laina: "莱纳"
};
// 平台关联应用
const PLAT_LINK_APP = {
  lieren: ["sfc", "jiujin", "jinji", "laina", "lumiai"],
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
// 久金特殊影院集合
const JIUJIN_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "华夏久金国际影城",
    sfc_cinema_name: "上海华夏久金国际影城"
  }
];
// 莱纳特殊影院集合
const LAINA_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "莱纳龙域影城昌发展万科广场店",
    sfc_cinema_name: "北京莱纳龙域影城"
  }
];
// 金鸡特殊影院集合
const JINJI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "北京金鸡百花影城影协影院",
    sfc_cinema_name: "金鸡百花影城"
  }
];

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
  OFFER_LIST
};
