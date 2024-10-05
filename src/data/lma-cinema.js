const cinemas = [
  // 1-北京
  {
    cinema_id: "1009",
    cinema_name: "卢米埃北京芳草地影城",
    city_id: "1",
    address: "北京朝阳区东大桥路9号侨福芳草地大厦LG2-26"
  },
  {
    cinema_id: "1020",
    cinema_name: "卢米埃北京龙湖IMAX影城",
    city_id: "1",
    address:
      "北京市朝阳区朝阳北路管庄路口往东200米龙湖长楹天街购物中心东区F5层东区-5F-09、F5.5层"
  },
  {
    cinema_id: "1030",
    cinema_name: "卢米埃北京住总万科影城",
    city_id: "1",
    address: "北京市大兴区旧宫地铁站旁北京住总万科广场5层"
  },
  // 2-南京
  {
    cinema_id: "1006",
    cinema_name: "卢米埃南京弘阳广场影城",
    city_id: "2",
    address: "南京市大桥北路48号弘阳广场"
  },
  {
    cinema_id: "1016",
    cinema_name: "卢米埃南京金鹰新街口影城",
    city_id: "2",
    address: "南京市汉中路101号金鹰全生活中心B座9F"
  },
  {
    cinema_id: "1036",
    cinema_name: "卢米埃南京金鹰仙林影城",
    city_id: "2",
    address: "南京市栖霞区仙林学津路1号金鹰湖滨天地B区4层"
  },
  {
    cinema_id: "1037",
    cinema_name: "卢米埃南京金鹰河西影城",
    city_id: "2",
    address: "南京市建邺区应天大街888号金鹰世界9层"
  },
  {
    cinema_id: "1044",
    cinema_name: "卢米埃南京龙蟠汇IMAX影城",
    city_id: "2",
    address: "南京市秦淮区龙蟠中路4119号龙蟠汇购物中心3层"
  },
  // 3-重庆
  // {
  //   cinema_id: "1002",
  //   cinema_name: "卢米埃重庆金源IMAX影城",
  //   city_id: "3",
  //   address: "重庆市江北区北滨路368号金源购物广场4楼",
  // },
  // 4-淮安
  {
    cinema_id: "1005",
    cinema_name: "卢米埃淮安新亚影城",
    city_id: "4",
    address: "淮安市淮海东路142号中央国际新亚广场七层"
  },
  // 5-杭州
  {
    cinema_id: "1001",
    cinema_name: "卢米埃杭州银泰影城",
    city_id: "5",
    address: "杭州市江干区庆春东路银泰百货庆春店6层"
  },
  {
    cinema_id: "1043",
    cinema_name: "卢米埃杭州西溪天街影城",
    city_id: "5",
    address:
      "浙江省杭州市西湖区蒋村街道余杭塘路1001号花蒋天街商业中心A-6F-Z01、A-7F-Z01"
  },
  // 6-常熟
  // {
  //   cinema_id: "1003",
  //   cinema_name: "卢米埃常熟世茂影城",
  //   city_id: "6",
  //   address: "常熟市泰山北路常熟世茂世纪中心—搜秀活力城2号楼3/4楼",
  // },
  // 7-成都
  {
    cinema_id: "1008",
    cinema_name: "卢米埃成都来福士影城",
    city_id: "7",
    address: "成都市武侯区人民南路四段3号来福士广场3层"
  },
  {
    cinema_id: "1014",
    cinema_name: "卢米埃成都魅力城影城",
    city_id: "7",
    address: "成都市成华区万科路9号凯德广场魅力城4层"
  },
  {
    cinema_id: "1040",
    cinema_name: "卢米埃成都西宸天街影城",
    city_id: "7",
    address: "成都市金牛区花照壁西顺街339号西宸天街购物广场6层"
  },
  // 8-苏州
  {
    cinema_id: "1010",
    cinema_name: "卢米埃盛泽财富中心影城",
    city_id: "8",
    address: "苏州市吴江区盛泽镇西二环路1999号财富中心购物公园2层"
  },
  {
    cinema_id: "1013",
    cinema_name: "卢米埃苏州华润万家影城",
    city_id: "8",
    address: "苏州工业园区津梁街172号华润万家3-4层"
  },
  {
    cinema_id: "1022",
    cinema_name: "卢米埃昆山金鹰影城",
    city_id: "8",
    address: " 苏州市昆山市东新街金鹰购物中心A座8楼"
  },
  {
    cinema_id: "1035",
    cinema_name: "卢米埃苏州金鹰影城",
    city_id: "8",
    address: " 苏州高新区狮山路298号金鹰购物中心六楼卢米埃影城"
  },
  // 9-西安
  {
    cinema_id: "1012",
    cinema_name: "卢米埃西安凯德影城",
    city_id: "9",
    address: "西安市雁塔区南二环西段凯德广场五层（朱雀花卉市场对面）"
  },
  {
    cinema_id: "1041",
    cinema_name: "卢米埃西安曲江IMAX影城",
    city_id: "9",
    address: "西安市曲江新区雁翔路3369号G层G-02号"
  },
  // 10-沈阳
  {
    cinema_id: "1011",
    cinema_name: "卢米埃沈阳天地影城",
    city_id: "10",
    address: "沈阳市皇姑区北陵大街17号沈阳天地（中汇广场）F3-05"
  },
  {
    cinema_id: "1024",
    cinema_name: "卢米埃沈阳万象汇影城",
    city_id: "10",
    address: "沈阳市铁西区兴华北街华润万象汇五层501"
  },
  // 11-绍兴
  {
    cinema_id: "1017",
    cinema_name: "卢米埃绍兴银泰城IMAX影城",
    city_id: "11",
    address: "绍兴市越城区解放南路777号F4层4F001"
  },
  // 12-顺德
  {
    cinema_id: "1018",
    cinema_name: "卢米埃顺德影城",
    city_id: "12",
    address: "顺德顺德区大良东乐路268号印象城购物商场三楼卢米埃"
  },
  // 13-洛阳
  {
    cinema_id: "1019",
    cinema_name: "卢米埃洛阳王府井影城",
    city_id: "13",
    address: "河南省洛阳市南昌路139号王府井购物中心6楼卢米埃影城"
  },
  // 14-盐城
  {
    cinema_id: "1021",
    cinema_name: "卢米埃盐城聚龙湖金鹰影城",
    city_id: "14",
    address: "江苏省盐城市解放南路268号金鹰聚龙湖购物中心6楼"
  },
  // 15-武汉
  {
    cinema_id: "1023",
    cinema_name: "卢米埃武汉凯德1818影城",
    city_id: "15",
    address: "武汉市武昌区中北109号凯德1818中心七楼"
  },
  // 16-丹阳
  {
    cinema_id: "1025",
    cinema_name: "卢米埃丹阳金鹰影城",
    city_id: "16",
    address: "江苏省 丹阳市 金鹰国际购物中心 百货7楼"
  },
  // 17-上海
  {
    cinema_id: "1026",
    cinema_name: "卢米埃上海紫荆影城",
    city_id: "17",
    address: "上海市杨浦区控江路1628号紫荆广场5楼"
  },
  {
    cinema_id: "1031",
    cinema_name: "卢米埃上海大融城影城",
    city_id: "17",
    address: "上海市嘉定区宝安公路3386号大融城4楼卢米埃影城"
  },
  // 18-长沙
  {
    cinema_id: "1027",
    cinema_name: "卢米埃长沙王府井影城",
    city_id: "18",
    address: "湖南省长沙市岳麓区金星路383号河西王府井6层"
  },
  // 19-深圳
  {
    cinema_id: "1028",
    cinema_name: "卢米埃深圳华强北IMAX影城",
    city_id: "19",
    address: "深圳市福田区华强北中航路中航城天虹购物中心4楼卢米埃影城"
  },
  {
    cinema_id: "1033",
    cinema_name: "卢米埃深圳汇港IMAX影城",
    city_id: "19",
    address: "深圳南山区蛇口工业三路1号汇港购物中心3楼"
  },
  // 20-温州
  {
    cinema_id: "1029",
    cinema_name: "卢米埃温州万象城IMAX影城",
    city_id: "20",
    address: "温州市瓯海区温瑞大道与三垟大道交叉口万象城5楼"
  },
  // 21-昆山
  // {
  //   cinema_id: "1022",
  //   cinema_name: "卢米埃昆山金鹰影城",
  //   city_id: "21",
  //   address: "苏州市昆山市东新街金鹰国际购物中心8楼",
  // },
  // 22-盛泽
  // {
  //   cinema_id: "1010",
  //   cinema_name: "卢米埃盛泽财富中心影城",
  //   city_id: "22",
  //   address: "江苏省苏州市吴江区盛泽镇西二环路1999号财富中心购物公园27幢3F"
  // },
  // 23-贵阳
  {
    cinema_id: "1032",
    cinema_name: "卢米埃贵阳万科大都会影城",
    city_id: "23",
    address: "贵阳市花溪区珠江路368号万科大都会 4楼"
  },
  {
    cinema_id: "1042",
    cinema_name: "卢米埃贵阳花溪万科IMAX影城",
    city_id: "23",
    address: "贵州省贵阳市花溪区田园路666号商业S12栋201"
  },
  // 24-广州
  {
    cinema_id: "1034",
    cinema_name: "卢米埃广州合生IMAX影城",
    city_id: "24",
    address: "广州海珠区广州大道南249号与叠景路交汇处合生广场5楼"
  },
  // 25-扬州
  {
    cinema_id: "1038",
    cinema_name: "卢米埃扬州金鹰影城",
    city_id: "25",
    address: "扬州市文昌东路与龙川南路交叉口金鹰新城市中心 卢米埃影城"
  },
  // 26-厦门
  {
    cinema_id: "1039",
    cinema_name: "卢米埃厦门IMAX影城",
    city_id: "26",
    address: "福建省厦门市思明区莲前街道金山路1号2-1号楼宝龙一城L4"
  }
];
export default cinemas;
