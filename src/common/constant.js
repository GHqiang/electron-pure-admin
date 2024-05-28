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
    order_cinema_name: "莱纳龙域影城(昌发展万科广场店)",
    sfc_cinema_name: "北京莱纳龙域影城"
  }
];
// 金鸡特殊影院集合
const JINJI_SPECIAL_CINEMA_LIST = [
  {
    order_cinema_name: "北京金鸡百花影城(影协影院)",
    sfc_cinema_name: "金鸡百花影城"
  }
];
export {
  ORDER_FORM,
  APP_LIST,
  PLAT_LINK_APP,
  SFC_SPECIAL_CINEMA_LIST,
  JIUJIN_SPECIAL_CINEMA_LIST,
  LAINA_SPECIAL_CINEMA_LIST,
  JINJI_SPECIAL_CINEMA_LIST
};
