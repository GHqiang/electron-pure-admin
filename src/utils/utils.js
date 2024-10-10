// 导入 ExcelJS 库
import ExcelJS from "exceljs";
import axios from "axios";
import * as CryptoJS from "crypto-js";
import svApi from "@/api/sv-api";
import {
  WX_MSG_UID,
  SPECIAL_CINEMA_OBJ,
  SFC_CINEMA_NAME,
  YAOLAI_CINEMA_NAME,
  UME_CINEMA_NAME,
  WANMEI_CINEMA_NAME,
  YINGHUANG_CINEMA_NAME,
  ZHEYINGSHIDAI_CINEMA_NAME,
  TPYYC_CINEMA_NAME_BY_SFC
} from "@/common/constant";
/**
 * 获取当前日期和时间的格式化字符串
 * 无参数
 * @return {string} 返回格式为 "YYYY-MM-DD HH:MM:SS" 的字符串
 */
function getCurrentFormattedDateTime(sjc) {
  const now = !sjc ? new Date() : new Date(sjc);

  // 获取年、月、日、小时、分钟、秒
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
  const date = ("0" + now.getDate()).slice(-2);
  const hours = ("0" + now.getHours()).slice(-2);
  const minutes = ("0" + now.getMinutes()).slice(-2);
  const seconds = ("0" + now.getSeconds()).slice(-2);

  // 组合成所需格式
  const formattedDateTime = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

  return formattedDateTime;
}

// YYYY-MM-DD
function getCurrentDay(sjc) {
  const now = !sjc ? new Date() : new Date(sjc);

  // 获取年、月、日、小时、分钟、秒
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
  const date = ("0" + now.getDate()).slice(-2);

  // 组合成所需格式
  const formattedDateTime = `${year}-${month}-${date}`;

  return formattedDateTime;
}

/**
 * 获取当前时间的格式化字符串
 * 无参数
 * @return {string} 返回格式为 "HH:MM:SS" 的字符串
 */
function getCurrentTime(sjc) {
  const now = !sjc ? new Date() : new Date(sjc);

  // 获取小时、分钟、秒
  const hours = ("0" + now.getHours()).slice(-2);
  const minutes = ("0" + now.getMinutes()).slice(-2);
  const seconds = ("0" + now.getSeconds()).slice(-2);

  // 组合成所需格式
  const formattedDateTime = `${hours}:${minutes}:${seconds}`;

  return formattedDateTime;
}

function getFormattedDateTime(sjc) {
  const now = new Date(sjc);

  // 获取年、月、日、小时、分钟、秒
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
  const date = ("0" + now.getDate()).slice(-2);
  const hours = ("0" + now.getHours()).slice(-2);
  const minutes = ("0" + now.getMinutes()).slice(-2);
  const seconds = ("0" + now.getSeconds()).slice(-2);

  // 组合成所需格式
  const formattedDateTime = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

  return formattedDateTime;
}

// 导出 Excel 文件
async function exportExcel(columns, data) {
  // 准备要导出的数据
  // const data = [
  //     { name: '张三', age: 25, gender: '男' },
  //     { name: '李四', age: 30, gender: '女' },
  //     { name: '王五', age: 2¾, gender: '男' },
  // ];

  // 创建一个新的 Excel 工作簿
  const workbook = new ExcelJS.Workbook();

  // 添加一个工作表并命名
  const worksheet = workbook.addWorksheet("Employee Data");

  // 设置列定义（表头）
  worksheet.columns = columns;
  // [
  //     { header: '姓名', key: 'name', width: 20 },
  //     { header: '年龄', key: 'age', width: 10 },
  //     { header: '性别', key: 'gender', width: 10 },
  // ];

  // 将数据添加到工作表
  data.forEach(item => worksheet.addRow(item));

  // 将工作簿写入内存中的 Buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // 创建 Blob 对象
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  // 创建下载链接
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "出票记录.xlsx"; // 设置下载文件名
  document.body.appendChild(link);

  // 触发点击下载
  link.click();

  // 清理资源
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * 计算Levenshtein距离
 * @param {string} source 源字符串
 * @param {string} target 目标字符串
 */
function levenshteinDistance(source, target) {
  let sourceLength = source.length;
  let targetLength = target.length;
  if (sourceLength === 0) return targetLength;
  if (targetLength === 0) return sourceLength;

  let matrix = [];

  // 初始化矩阵
  for (let i = 0; i <= sourceLength; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= targetLength; j++) {
    matrix[0][j] = j;
  }

  // 动态规划填充矩阵
  for (let i = 1; i <= sourceLength; i++) {
    for (let j = 1; j <= targetLength; j++) {
      if (source.charAt(i - 1) === target.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i - 1][j] + 1, // 删除
          matrix[i][j - 1] + 1 // 插入
        );
      }
    }
  }

  return matrix[sourceLength][targetLength];
}

/**
 * 找出与目标字符串匹配度最高的字符串
 * @param {Array<string>} strings 字符串数组
 * @param {string} target 目标字符串
 */
function findBestMatchByLevenshtein(strings, target) {
  let minDistance = Infinity;
  let bestMatch = null;

  strings.forEach(str => {
    let distance = levenshteinDistance(str, target);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = str;
    }
  });

  return bestMatch;
}

/**
 * 找出与目标字符串匹配度最高的字符串，且匹配度需达到指定阈值
 * @param {Array<string>} strings 字符串数组
 * @param {string} target 目标字符串
 * @param {number} threshold 匹配度阈值，默认为0，表示只要求有匹配结果
 */
function findBestMatchByLevenshteinWithThreshold(
  strings,
  target,
  threshold = 0
) {
  let minDistance = Infinity;
  let bestMatch = null;

  strings.forEach(str => {
    let distance = levenshteinDistance(str, target);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = str;
    }
  });

  // 检查最小距离是否在阈值内
  if (minDistance <= threshold) {
    return bestMatch;
  } else {
    // 如果没有达到匹配度要求，返回空字符串或null
    return null; // 或者返回 '' 表示空字符串
  }
}

// 判断time1时间是否在time2之后
function isTimeAfter(time1, time2) {
  // 将时间字符串分割为小时、分钟和秒
  const [hours1, minutes1, seconds1] = time1.split(":").map(Number);
  const [hours2, minutes2, seconds2] = time2.split(":").map(Number);

  // 创建一个表示当天日期的Date对象（用于时间比较）
  const dateToday = new Date();

  // 设置第一个时间的Date对象为当天的00:00:00
  dateToday.setHours(0, 0, 0, 0); // 年、月、日、毫秒
  dateToday.setHours(hours1, minutes1, seconds1); // 设置时间

  // 复制Date对象以设置第二个时间
  const dateToday2 = new Date(dateToday);
  dateToday2.setHours(hours2, minutes2, seconds2); // 设置时间

  // 比较两个时间
  return dateToday.getTime() > dateToday2.getTime();
}

const colorObj = {
  sfc: "#003399",
  jiujin: "#006633",
  jinji: "#CC6600",
  laina: "#CC6600",
  lieren: "#660033",
  lumiai: "#33CCCC"
};
// 获取影院标识
const getCinemaFlag = item => {
  const { cinema_group, cinema_name, city_name, plat_name } = item;
  let noGroupPlatList = ["yinghuasuan", "shangzhan", "haha"];
  let isNoGroup = noGroupPlatList.includes(plat_name);

  let isSfcGroup = ["上影上海", "上影二线", "SFC", "c_sfc"].includes(
    cinema_group
  );
  let isSfcCinemaName =
    isNoGroup &&
    SFC_CINEMA_NAME.some(
      item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
    );

  let isZhongyingGroup = ["中影", "中影直营", "中影国际", "中影影票"].includes(
    cinema_group
  );
  let isUmeGroup = ["UME", "ume一线", "ume二线", "c_ume"].includes(
    cinema_group
  );
  let isUmeCinemaName =
    isNoGroup &&
    UME_CINEMA_NAME.some(
      item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
    );

  let isYaolaiGroup = [
    "耀莱成龙",
    "耀莱一线",
    "耀莱二线",
    "一线耀莱",
    "二线耀莱",
    "耀莱",
    "c_jccinema"
  ].includes(cinema_group);
  let isYaolaiCinemaName =
    (isNoGroup &&
      YAOLAI_CINEMA_NAME.some(
        item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
      )) ||
    (plat_name === "yangcong" && cinema_name.includes("耀莱成龙"));

  let isWanmeiGroup = ["完美世界"].includes(cinema_group);
  let isTpyycGroup = ["太平洋"].includes(cinema_group);
  let isYinghuangiGroup = ["英皇电影城", "英皇UA影城", "英皇"].includes(
    cinema_group
  );
  let isYinghuangCinemaName =
    isNoGroup &&
    YINGHUANG_CINEMA_NAME.some(
      item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
    );

  let isZheyingshidaiGroup =
    ["浙影时代"].includes(cinema_group) ||
    (cinema_group === "浙江时代" && cinema_name.includes("浙影时代"));

  let isZheyingshidaiCinemaName =
    isNoGroup &&
    ZHEYINGSHIDAI_CINEMA_NAME.some(
      item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
    );

  // let isLmaGroup = ["卢米埃"].includes(cinema_group);
  // if (isLmaGroup) {
  //   return "lma";
  // }
  if (
    ["山文星辉影城", "鲁信影城潍坊寿光店"].some(
      itemA =>
        cinemNameSpecial(cinema_name).includes(itemA) &&
        ["济南", "聊城", "青岛", "泰安", "潍坊"].includes(city_name)
    )
  ) {
    return "swxh";
  }

  // 后续再补充名字匹配
  if (isWanmeiGroup) {
    return "wanmei";
  }
  // 过滤掉sfc系列的太平洋影院名
  if (
    isTpyycGroup &&
    !TPYYC_CINEMA_NAME_BY_SFC.some(
      item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
    )
  ) {
    return "tpyyc";
  }
  if (isZhongyingGroup) {
    return "zhongying";
  }
  if (isYinghuangiGroup || isYinghuangCinemaName) {
    return "yinghuang";
  }
  if (isZheyingshidaiGroup || isZheyingshidaiCinemaName) {
    return "zheyingshidai";
  }
  if (isSfcGroup || isSfcCinemaName) {
    return "sfc";
  }
  // 蚂蚁和洋葱、哈哈：UME。 猎人和芒果：ume一线、ume二线
  else if (isUmeGroup || isUmeCinemaName) {
    return "ume";
  }
  // 蚂蚁和洋葱、哈哈：耀莱成龙。 猎人和芒果：耀莱一线、耀莱二线
  else if (isYaolaiGroup || isYaolaiCinemaName) {
    return "yaolai";
  } else if (
    cinemNameSpecial(cinema_name).includes("深圳梦影廊电影院龙岗梦中心店") &&
    ["深圳"].includes(city_name)
  ) {
    return "renhengmeng";
  } else if (
    cinemNameSpecial(cinema_name).includes("国文全激光影城金桥精品店") &&
    ["上海"].includes(city_name)
  ) {
    return "jqgw";
  } else if (
    cinemNameSpecial(cinema_name).includes("欢乐星会影城") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfhlxh";
  } else if (
    cinemNameSpecial(cinema_name).includes("华士达影城") &&
    ["上海"].includes(city_name)
  ) {
    return "hsd";
  } else if (
    cinemNameSpecial(cinema_name).includes("中影星美国际影城坪地CCONE店") &&
    ["深圳"].includes(city_name)
  ) {
    return "zyxmccone";
  } else if (
    ["博纳院线戏幕影城", "好格国际影城绿地新都会店"].some(
      itemA =>
        cinemNameSpecial(cinema_name).includes(itemA) &&
        ["合肥", "杭州", "青岛", "金华"].includes(city_name)
    )
  ) {
    return "bnxm";
  } else if (
    cinemNameSpecial(cinema_name).includes("杭州新华影都") &&
    ["杭州"].includes(city_name)
  ) {
    return "hzxhyd";
  } else if (
    cinemNameSpecial(cinema_name).includes("悦惟影城宝乐汇佘山店") &&
    ["上海"].includes(city_name)
  ) {
    return "ywycssd";
  } else if (
    cinemNameSpecial(cinema_name).includes("星光嘉映影城南京雨山天街店") &&
    ["南京"].includes(city_name)
  ) {
    return "xgjyycnjystjd";
  } else if (
    cinemNameSpecial(cinema_name).includes("UME影城石家庄欢乐汇店") &&
    ["石家庄"].includes(city_name)
  ) {
    return "sjzhlh";
  } else if (
    [
      "中影红毯巨幕影城昇宝广场店",
      "青宫电影城CINITY店",
      "广州太古仓电影库",
      "珠影耳东传奇影城",
      "珠影市三宫影城",
      "珠影CC",
      "珠影星寰",
      "珠影飞扬",
      "华影飞天",
      "华影信和影城",
      "华影万晟国际影城"
    ].some(
      itemA =>
        cinemNameSpecial(cinema_name).includes(itemA) &&
        ["北京", "佛山", "广州", "兰州", "南京", "深圳"].includes(city_name)
    )
  ) {
    return "zhuying";
  } else if (
    cinema_name.includes("华夏久金国际影城") &&
    ["上海"].includes(city_name)
  ) {
    return "jiujin";
  } else if (
    cinemNameSpecial(cinema_name).includes("龙岩中影国际影城京华中心店") &&
    ["龙岩"].includes(city_name)
  ) {
    return "lyzy";
  } else if (
    cinemNameSpecial(cinema_name).includes("万影汇影城高升天地LUXE店") &&
    ["长沙"].includes(city_name)
  ) {
    return "cswyh";
  } else if (
    cinemNameSpecial(cinema_name).includes("北京地质礼堂") &&
    ["北京"].includes(city_name)
  ) {
    return "bjdzlt";
  } else if (
    cinemNameSpecial(cinema_name).includes("果岭影城") &&
    ["北京"].includes(city_name)
  ) {
    return "glyc";
  } else if (
    cinemNameSpecial(cinema_name).includes("新杨湾大光明影城") &&
    ["上海"].includes(city_name)
  ) {
    return "xywdgmyc";
  } else if (
    cinema_name.includes("金鸡百花影城") &&
    ["北京"].includes(city_name)
  ) {
    return "jinji";
  } else if (
    cinema_name.includes("莱纳龙域影城") &&
    ["北京"].includes(city_name)
  ) {
    return "laina";
  } else if (
    ["宁波影都", "民光影城", "蝴蝶影院"].some(
      itemA =>
        cinema_name.includes(itemA) && ["宁波", "台州"].includes(city_name)
    )
  ) {
    return "ningbo";
  } else if (
    cinemNameSpecial(cinema_name).includes("红石影城惠南店") &&
    ["上海"].includes(city_name)
  ) {
    return "hongshi";
  } else if (cinema_name.includes("利美华胤") && ["上海"].includes(city_name)) {
    return "limeihua";
  } else if (cinema_name.includes("河马国际") && ["上海"].includes(city_name)) {
    return "hema";
  } else if (
    cinema_name.includes("华熙国际影城") &&
    ["重庆", "成都"].includes(city_name)
  ) {
    return "cqhx";
  } else if (
    cinema_name.includes("大商影城") &&
    ["邹平", "大连", "大庆", "漯河", "盘锦", "青岛", "沈阳", "淄博"].includes(
      city_name
    )
  ) {
    return "dsyc";
  } else if (
    cinema_name.includes("北京金泉港IMAX国际影城") &&
    ["北京"].includes(city_name)
  ) {
    return "jqx";
  } else if (
    cinemNameSpecial(cinema_name).includes("佛山中影国际影城桂城万达广场店") &&
    ["佛山"].includes(city_name)
  ) {
    return "fszy";
  } else if (
    cinema_name.includes("襄阳中影国际影城武商mall天河店") &&
    ["襄阳"].includes(city_name)
  ) {
    return "xywszy";
  } else if (
    cinemNameSpecial(cinema_name).includes("中影国际影城九江花园城店") &&
    ["九江"].includes(city_name)
  ) {
    return "jjzy";
  } else if (
    cinema_name.includes("银兴国际影城M+店") &&
    ["武汉"].includes(city_name)
  ) {
    return "whyx";
  } else if (
    ["杭州中影国际影城", "中影国际影城杭州星光大道店"].some(
      itemA =>
        cinemNameSpecial(cinema_name).includes(itemA) &&
        ["杭州"].includes(city_name)
    ) &&
    !["杭州中影国际影城西溪印象", "杭州中影国际影城良渚永旺"].some(itemA =>
      cinemNameSpecial(cinema_name).includes(itemA)
    )
    // 非上面两个店，这两个店单子还不少，后面可以加下
  ) {
    return "hzzy";
  } else if (
    cinemNameSpecial(cinema_name).includes("上海中影国际影城嘉定菊园新e街店") &&
    ["上海"].includes(city_name)
  ) {
    return "shzy";
  } else if (
    ["恒业影城", "恒业国际影城"].some(
      itemA =>
        cinema_name.includes(itemA) &&
        ["北京", "武汉", "芜湖"].includes(city_name)
    )
  ) {
    return "hengye";
  } else if (
    cinema_name.includes("长江银兴影城") &&
    ["襄阳"].includes(city_name)
  ) {
    return "yinxingxy";
  } else if (
    cinema_name.includes("长江银兴影城") &&
    ["南昌"].includes(city_name)
  ) {
    return "yinxingnc";
  } else if (
    cinema_name.includes("长江银兴影城") &&
    ["武汉"].includes(city_name)
  ) {
    return "yinxingws";
  } else if (cinema_name === "乐娃影院" && ["北京"].includes(city_name)) {
    return "liangchen";
  } else if (cinema_name.includes("全美影院") && ["太原"].includes(city_name)) {
    return "quanmei";
  } else if (cinema_name.includes("民族影城") && ["南宁"].includes(city_name)) {
    return "minzu";
  } else if (
    cinemNameSpecial(cinema_name).includes("南国影城金光华") &&
    ["深圳"].includes(city_name)
  ) {
    return "nanguojgh";
  } else if (
    cinemNameSpecial(cinema_name).includes("中影国际影城甪直ALPD激光店") &&
    ["苏州"].includes(city_name)
  ) {
    return "suzhou";
  } else if (cinema_name.includes("永恒") && ["南宁"].includes(city_name)) {
    return "yongheng";
  } else if (
    [
      "齐纳影城",
      "齐纳国际影城",
      "齐纳全激光影城",
      "齐纳全激光国际影城",
      "齐纳激光IMAX影城"
    ].some(
      itemA =>
        cinema_name.includes(itemA) &&
        [
          "济南",
          "滨州",
          "德州",
          "东营",
          "临沂",
          "潍坊",
          "烟台",
          "淄博",
          "枣庄"
        ].includes(city_name) &&
        !["东营齐纳国际影城"].includes(cinema_name)
    )
  ) {
    return "qina";
  } else if (
    ["宝能影城", "莱华影城"].some(
      itemA =>
        cinema_name.includes(itemA) && ["深圳", "扬州"].includes(city_name)
    )
  ) {
    return "baoneng";
  } else if (
    ["长江影城", "解放电影院", "合肥人民影城"].some(
      itemA =>
        cinema_name.includes(itemA) && ["杭州", "合肥"].includes(city_name)
    )
  ) {
    return "hefeidianying";
  } else if (
    ["巢湖中影国际影城百大店", "中影国际影城巢湖店"].some(item =>
      cinemNameSpecial(cinema_name).includes(item)
    ) &&
    city_name.includes("巢湖")
  ) {
    return "chaohuzhongying";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥中影国际影城百大心悦城店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfzybdd";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥中影国际影城万派城店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfzywpcd";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥中影国际影城正大广场店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfzyzdgcd";
  } else if (
    cinemNameSpecial(cinema_name).includes(
      "合肥中影国际影城东西街店原1912店"
    ) &&
    ["合肥"].includes(city_name)
  ) {
    return "hfzydxjd";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥中影国际影城中环购物中心店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfzyzhd";
  } else if (
    cinemNameSpecial(cinema_name).includes("潍坊中影国际影城印象汇店") &&
    ["潍坊"].includes(city_name)
  ) {
    return "wfzyyxhd";
  } else if (
    cinemNameSpecial(cinema_name).includes("潍坊中影国际影城歌尔生活广场店") &&
    ["潍坊"].includes(city_name)
  ) {
    return "wfzygeshgcd";
  } else if (
    cinemNameSpecial(cinema_name).includes("丁丁影城红谷滩店") &&
    ["南昌"].includes(city_name)
  ) {
    return "nchgtdd";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥丁丁影城百大奥莱店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hfbddd";
  } else if (
    cinemNameSpecial(cinema_name).includes("合肥丁丁影城乐客来店") &&
    ["合肥"].includes(city_name)
  ) {
    return "hflkldd";
  } else if (
    cinemNameSpecial(cinema_name).includes("天通苑乐娃影院") &&
    ["北京"].includes(city_name)
  ) {
    return "ttylw";
  } else if (
    cinemNameSpecial(cinema_name).includes("深圳益田国际影城宝安店") &&
    ["深圳"].includes(city_name)
  ) {
    return "ytgjyc";
  }
  // else if (
  //   cinemNameSpecial(cinema_name).includes("深圳益田国际影城宝安店") &&
  //   ["东莞"].includes(city_name)
  // ) {
  //   return "dghs";
  // }
  else if (
    cinemNameSpecial(cinema_name).includes("天津莱纳星影城") &&
    ["天津"].includes(city_name)
  ) {
    return "tjlnx";
  } else if (
    cinemNameSpecial(cinema_name).includes("北京莱纳星影城") &&
    ["北京"].includes(city_name)
  ) {
    return "bjlnx";
  } else if (
    cinemNameSpecial(cinema_name).includes("成都莱纳星影城") &&
    ["成都"].includes(city_name)
  ) {
    return "cdlnx";
  } else if (
    cinemNameSpecial(cinema_name).includes("大光明影城金山百联店") &&
    ["上海"].includes(city_name)
  ) {
    return "jsdgm";
  } else if (
    cinemNameSpecial(cinema_name).includes("天津中影国际影城津湾CINITY店") &&
    ["天津"].includes(city_name)
  ) {
    return "jwzy";
  } else if (
    cinemNameSpecial(cinema_name).includes("SFC上影国际影城新达汇三林店") &&
    ["上海"].includes(city_name)
  ) {
    return "slsy";
  } else if (
    cinemNameSpecial(cinema_name).includes("上影国际影城古北店") &&
    ["上海"].includes(city_name)
  ) {
    return "gbsy";
  } else if (
    cinemNameSpecial(cinema_name).includes("金谊华夏影城") &&
    ["上海"].includes(city_name)
  ) {
    return "jyhx";
  } else if (
    cinemNameSpecial(cinema_name).includes(
      "海口中影国际影城上邦百汇城CINITY店"
    ) &&
    ["海口"].includes(city_name)
  ) {
    return "hkzy";
  }
  // else if (
  //   cinemNameSpecial(cinema_name).includes("万众国际影城CGS中国巨幕横岗店") &&
  //   ["深圳"].includes(city_name)
  // ) {
  //   return "hgwz";
  // }
  else if (
    cinemNameSpecial(cinema_name).includes(
      "上海巨影国际影城前台办理免费三小时停车"
    ) &&
    ["上海"].includes(city_name)
  ) {
    return "shjy";
  } else if (
    cinemNameSpecial(cinema_name).includes("乐奇国际影城天津店") &&
    ["天津"].includes(city_name)
  ) {
    return "tjlq";
  } else if (
    cinemNameSpecial(cinema_name).includes("太禾影城浦江欢乐颂店") &&
    ["上海"].includes(city_name)
  ) {
    return "shth";
  } else if (
    cinemNameSpecial(cinema_name).includes("永乐国际影城") &&
    ["苏州"].includes(city_name)
  ) {
    return "szyl";
  } else if (
    cinemNameSpecial(cinema_name).includes("SFC上影国际影城新业坊店") &&
    ["上海"].includes(city_name)
  ) {
    return "xyfsy";
  } else if (
    cinemNameSpecial(cinema_name).includes("长沙中影国际影城凯德广场店") &&
    ["长沙"].includes(city_name)
  ) {
    return "cszykd";
  } else if (
    cinemNameSpecial(cinema_name).includes(
      "中影国际影城中国巨幕凯德壹中心店"
    ) &&
    ["长沙"].includes(city_name)
  ) {
    return "cszyyzx";
  }
};
window.getCinemaFlag = getCinemaFlag;
// 全角字符转换成半角
function convertFullwidthToHalfwidth(str) {
  // 全角到半角的映射表
  const fullwidthToHalfwidthMap = {
    "！": "!", // 全角感叹号
    "：": ":", // 全角说明号
    "，": ",", // 全角逗号
    "。": ".", // 全角句号
    "·": "•"
    // 可以根据需要添加更多全角字符到半角字符的映射
  };

  // 正则表达式匹配全角字符
  const fullWidthPattern = new RegExp(
    Object.keys(fullwidthToHalfwidthMap).join("|"),
    "g"
  );

  // 替换函数
  function replaceFullwidthWithHalfwidth(match) {
    return fullwidthToHalfwidthMap[match];
  }

  // 实施替换（加个转大写，怕大小写不匹配）
  let result = str
    .replace(fullWidthPattern, replaceFullwidthWithHalfwidth)
    .toUpperCase();
  // 移除所有空格（包括全角和半角）
  result = result.replace(/\s/g, "");
  return result;
}

// 获取影院登录信息列表
const getCinemaLoginInfoList = () => {
  let loginInfoList = window.localStorage.getItem("loginInfoList");
  if (loginInfoList) {
    loginInfoList = JSON.parse(loginInfoList);
  }
  return loginInfoList || [];
};

// 发送微信消息
const sendWxPusherMessage = async ({
  plat_name,
  order_number,
  city_name,
  cinema_name,
  film_name,
  show_time,
  lockseat,
  transferTip,
  failReason,
  app_name,
  msgType // 消息类型 1-登录失效
}) => {
  const url = "https://wxpusher.zjiecode.com/api/manager/message/send";
  const headers = {
    "content-type": "application/json;charset=UTF-8",
    token: "f64b234659d4934b4d1e5501534c6f52"
  };
  let userInfo = window.localStorage.getItem("userInfo");
  if (userInfo) {
    userInfo = JSON.parse(userInfo);
  }

  let summary = plat_name + "平台出票失败";
  let content = `<p>
  时间：${getCurrentFormattedDateTime()}; <br/>
  用户：${userInfo.name}; <br/>
  平台：${plat_name}; <br/>
  单号：${order_number}; <br/>
  城市：${city_name}; <br/>
  影院：${cinema_name}; <br/>
  片名：${film_name}; <br/>
  场次：${show_time}; <br/>
  座位：${lockseat}; <br/>
  原因：${failReason};<br/>
  提示：${transferTip};<br/>
  </p>`;

  if (msgType === 1) {
    summary = app_name + "影院登录失效";
    content = `<p>
    时间：${getCurrentFormattedDateTime()}; <br/>
    用户：${userInfo.name}; <br/>
    影院：${app_name}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  }
  const messageData = {
    appId: 80173,
    topicIds: [],
    contentType: 2,
    verifyPay: false,
    uids: ["UID_AIFZVT3B4zcj10CvGFLKB2hS2wt7", WX_MSG_UID[userInfo.user_id]],
    summary,
    content
  };
  try {
    const response = await axios.post(url, messageData, { headers });
    console.log("Response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending message:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};
window.sendWxPusherMessage = sendWxPusherMessage;

// 定义加密和解密相关的函数
const cryptoFunctions = {
  // 测试加密和解密的方法
  testCrypto(encodeStr) {
    // 示例加密后的字符串
    const str = encodeStr; /* 省略了原始的长字符串 */

    // 将十六进制字符串转换为CryptoJS字节数组
    const encryptedHexStr = CryptoJS.enc.Hex.parse(str);

    // 将字节数组转换为Base64字符串
    const srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr);

    // 解密字符串
    // 注意：这里需要提供正确的密钥（key）和初始化向量（iv）
    const decrypt = CryptoJS.AES.decrypt(str, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    // 转换解密结果为UTF-8字符串
    const decryptedStr = decrypt.toString(CryptoJS.enc.Utf8);

    // 输出解密后的字符串
    console.log("decryptedStr", decryptedStr);
  },

  // 加密方法
  encrypt(message, HHtoken) {
    // 从localStorage中获取token
    const token = HHtoken || window.localStorage.getItem("HHtoken");

    // 生成32位的密钥
    const keyStr = CryptoJS.MD5(token + "piaofan@123").toString();

    // 生成16位的初始化向量
    const ivStr = CryptoJS.MD5(token + "piaofan@456")
      .toString()
      .substr(0, 16);

    // 将密钥和初始化向量转换为CryptoJS字节数组
    const key = CryptoJS.enc.Utf8.parse(keyStr);
    const iv = CryptoJS.enc.Utf8.parse(ivStr);

    // 将消息转换为JSON字符串
    const data = JSON.stringify(message);

    // 使用AES加密
    const encryptedData = CryptoJS.AES.encrypt(data, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    }).toString();

    // 返回加密后的字符串
    return encryptedData;
  },

  // 解密方法
  decrypt(message, HHtoken) {
    // 从localStorage中获取token
    const token = HHtoken || window.localStorage.getItem("HHtoken");

    // 生成32位的密钥
    const keyStr = CryptoJS.MD5(token + "piaofan@123").toString();

    // 生成16位的初始化向量
    const ivStr = CryptoJS.MD5(token + "piaofan@456")
      .toString()
      .substr(0, 16);

    // 将密钥和初始化向量转换为CryptoJS字节数组
    const key = CryptoJS.enc.Utf8.parse(keyStr);
    const iv = CryptoJS.enc.Utf8.parse(ivStr);

    // 使用AES解密
    const decrypted = CryptoJS.AES.decrypt(message, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    // 返回解密后的字符串
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
};
window.cryptoFunctions = cryptoFunctions;

// 自定义console，支持字体颜色、背景颜色、前缀
class CustomConsole {
  constructor(options = {}) {
    this.defaultOptions = {
      prefix: options.prefix || "", // 默认前缀
      flag: options.flag || "sfc", // 默认标识
      color: options.color || "block", // 默认字体颜色
      bgColor: options.bgColor || "transparent" // 默认背景颜色
    };
  }

  log(firstMessage, ...otherParams) {
    let { prefix, flag, color, bgColor } = this.defaultOptions;
    if (flag && colorObj[flag]) {
      color = colorObj[flag];
    }
    const formattedStyle = `color: ${color}; background-color: ${bgColor};`;
    console.log(`%c${prefix + firstMessage}`, formattedStyle, ...otherParams);
  }

  warn(firstMessage, ...otherParams) {
    const { prefix } = this.defaultOptions;
    console.warn(`${prefix + firstMessage}`, ...otherParams);
  }

  error(firstMessage, ...otherParams) {
    const { prefix } = this.defaultOptions;
    console.error(`${prefix + firstMessage}`, ...otherParams);
  }
}

// 计算连续中标数
const calcCount = data => {
  try {
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let isLastWin = null; // null, true (中标), false (不中标)

    for (const item of data) {
      const isWin = item.offer === item.supplier_end_price;

      if (isLastWin === null) {
        // 初始化中标或不中标的状态
        isLastWin = isWin;
      } else if (isWin === isLastWin) {
        // 如果当前项与上一项状态相同，累计连续次数
        isLastWin ? consecutiveWins++ : consecutiveLosses++;
      } else {
        // 中断连续计算
        break;
      }
    }

    // 第一个元素的中标或不中标状态需要单独计入
    if (isLastWin) {
      consecutiveWins++;
    } else {
      consecutiveLosses++;
    }
    console.log("连续中标次数:", consecutiveWins);
    console.log("连续未中标次数:", consecutiveLosses);
    return {
      inCount: consecutiveWins,
      outCount: consecutiveLosses
    };
  } catch (error) {
    console.error("计算连续中标数异常", error);
  }
};

// 根据订单name获取影院id(主要用于sfc系统)
const getCinemaId = (cinema_name, list, appName, city_name) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let cinema_id = list.find(item => item.name === cinema_name)?.id;
    if (cinema_id) {
      return { cinema_id };
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn("全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinemNameSpecial(cinema_name);
    let specialCinemaList =
      SPECIAL_CINEMA_OBJ[appName]?.filter(
        item =>
          item.order_cinema_name === cinemaName ||
          item.order_cinema_name.includes(cinemaName)
      ) || [];
    // const CQHX_SPECIAL_CINEMA_LIST = [
    //   {
    //     order_cinema_name: "华熙国际影城",
    //     sfc_cinema_name: "重庆华熙国际影城"
    //   },
    //   {
    //     order_cinema_name: "华熙国际影城",
    //     sfc_cinema_name: "成都华熙国际影城"
    //   }
    // ];
    // 存在以上情况故需要做特殊处理
    if (specialCinemaList.length > 1 && city_name) {
      specialCinemaList = specialCinemaList.filter(item =>
        item.sfc_cinema_name.includes(city_name)
      );
    }
    let specialCinemaInfo = specialCinemaList[0];
    if (specialCinemaInfo) {
      cinemaName = specialCinemaInfo.sfc_cinema_name;
      console.warn("特殊匹配影院名称成功", cinemaName);
    } else {
      console.warn(
        "特殊匹配影院名称失败",
        cinemaName,
        SPECIAL_CINEMA_OBJ[appName]
      );
    }
    // 3、去掉空格及换行符后全字匹配
    // 去除空格及括号后的影院列表
    let noSpaceCinemaList = list.map(item => {
      return {
        ...item,
        name: cinemNameSpecial(item.name)
      };
    });
    cinema_id = noSpaceCinemaList.find(item => item.name === cinemaName)?.id;
    if (cinema_id) {
      return { cinema_id };
    }
    console.error(
      "去掉空格及换行符后全字匹配失败",
      cinemaName,
      noSpaceCinemaList
    );
  } catch (error) {
    console.error("根据订单name获取影院id失败", error);
    return {
      error
    };
  }
};

// 根据订单name获取影院id(主要用于lma系统)
const getCinemaIdByLma = (cinema_name, list, appName, city_name) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let cinema_id = list.find(
      item => item.cinema_name === cinema_name
    )?.cinema_id;
    if (cinema_id) {
      return { cinema_id };
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn("全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinemNameSpecial(cinema_name);
    let specialCinemaList =
      SPECIAL_CINEMA_OBJ[appName]?.filter(
        item =>
          item.order_cinema_name === cinemaName ||
          item.order_cinema_name.includes(cinemaName)
      ) || [];
    // const CQHX_SPECIAL_CINEMA_LIST = [
    //   {
    //     order_cinema_name: "华熙国际影城",
    //     sfc_cinema_name: "重庆华熙国际影城"
    //   },
    //   {
    //     order_cinema_name: "华熙国际影城",
    //     sfc_cinema_name: "成都华熙国际影城"
    //   }
    // ];
    // 存在以上情况故需要做特殊处理
    if (specialCinemaList.length > 1 && city_name) {
      specialCinemaList = specialCinemaList.filter(item =>
        item.sfc_cinema_name.includes(city_name)
      );
    }
    let specialCinemaInfo = specialCinemaList[0];
    if (specialCinemaInfo) {
      cinemaName = specialCinemaInfo.sfc_cinema_name;
      console.warn("特殊匹配影院名称成功", cinemaName);
    } else {
      console.warn(
        "特殊匹配影院名称失败",
        cinemaName,
        SPECIAL_CINEMA_OBJ[appName]
      );
    }
    // 3、去掉空格及换行符后全字匹配
    // 去除空格及括号后的影院列表
    let noSpaceCinemaList = list.map(item => {
      return {
        ...item,
        cinema_name: cinemNameSpecial(item.cinema_name)
      };
    });
    cinema_id = noSpaceCinemaList.find(
      item => item.cinema_name === cinemaName
    )?.cinema_name;
    if (cinema_id) {
      return { cinema_id };
    }
    console.error(
      "去掉空格及换行符后全字匹配失败",
      cinemaName,
      noSpaceCinemaList
    );
  } catch (error) {
    console.error("根据订单name获取影院id失败", error);
    return {
      error
    };
  }
};
// 根据订单name获取目标影院(主要用于ume系统)
const getTargetCinema = (cinema_name, list, appFlag) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let targetCinema = list.find(
      item =>
        item.cinemaName === cinema_name ||
        cinemNameSpecial(item.cinemaName) === cinemNameSpecial(cinema_name)
    );
    if (targetCinema) {
      return targetCinema;
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn("全字匹配影院名称失败", cinema_name, list, appFlag);
    let cinemaName = cinemNameSpecial(cinema_name);
    if (SPECIAL_CINEMA_OBJ[appFlag]?.length) {
      let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appFlag]?.find(
        item =>
          item.order_cinema_name === cinemaName ||
          item.order_cinema_name.includes(cinemaName)
      );
      if (specialCinemaInfo) {
        cinemaName = specialCinemaInfo.sfc_cinema_name;
        console.warn("特殊匹配影院名称成功", cinemaName);
      } else {
        console.warn(
          "特殊匹配影院名称失败",
          cinemaName,
          SPECIAL_CINEMA_OBJ[appFlag]
        );
      }
    }
    // 3、去掉空格及换行符后全字匹配
    // 去除空格及括号后的影院列表
    let noSpaceCinemaList = list.map(item => {
      return {
        ...item,
        cinemaName: cinemNameSpecial(item.cinemaName)
      };
    });
    console.warn("noSpaceCinemaList", noSpaceCinemaList, cinemaName);
    targetCinema = noSpaceCinemaList.find(
      item => item.cinemaName === cinemaName
    );
    if (targetCinema) {
      return targetCinema;
    }
    console.error(
      "去掉空格及换行符后全字匹配失败",
      cinemaName,
      noSpaceCinemaList
    );
  } catch (error) {
    console.error("根据订单name获取目标影院失败", error);
  }
};

// 影院名称匹配（匹配报价规则时使用）
const cinemaMatchHandle = (cinema_name, list, appName) => {
  try {
    // 1、全字匹配
    let isHasMatch = list.some(item => item === cinema_name);
    if (isHasMatch) {
      return true;
    }
    console.warn("全字匹配影院名称失败", cinema_name, list);
    // 去括号、空格及中间点
    let cinemaName = cinemNameSpecial(cinema_name);
    // 2、特殊匹配
    let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appName]?.find(
      item =>
        item.order_cinema_name === cinemaName ||
        item.order_cinema_name.includes(cinemaName)
    );
    if (specialCinemaInfo) {
      cinemaName = specialCinemaInfo.sfc_cinema_name;
    } else {
      console.warn(
        "特殊匹配影院名称失败",
        cinemaName,
        SPECIAL_CINEMA_OBJ[appName]
      );
    }
    // 3、去掉空格及换行符后全字匹配
    const noSpaceList = list.map(item => cinemNameSpecial(item));
    isHasMatch = noSpaceList.some(item => item === cinemaName);
    if (isHasMatch) {
      return true;
    }
    console.error(
      "去掉空格及换行符后全字匹配影院名称失败",
      noSpaceList,
      cinemaName
    );
  } catch (error) {
    console.error("影院名称匹配异常", error);
  }
};

// 影院名称特殊处理（为了特殊匹配,去括号、空格及中间点）
const cinemNameSpecial = cinema_name => {
  return cinema_name
    .replace(/[\(\)\（\）-]/g, "")
    .replace(/\s*/g, "")
    .replace(/·/g, "")
    .replace(/:/g, "");
};
// 券名称特殊处理（为了特殊匹配,去括号、空格、中间点、中横线及冒号）
const couponInfoSpecial = coupon_info => {
  return coupon_info
    .replace(/[\(\)\（\）-]/g, "")
    .replace(/\s*/g, "")
    .replace(/·/g, "")
    .replace(/:/g, "");
};
// 判断该订单是否是新订单
const judgeHandle = (item, app_name, offerList) => {
  try {
    let targetOfferList = offerList.filter(
      itemA => itemA.app_name === app_name
    );
    let isOffer = targetOfferList.some(
      itemA => itemA.order_number === item.order_number
    );
    // 报过价新订单
    return !isOffer;
  } catch (error) {
    console.error("判断该订单是否是新订单异常", error);
  }
};

// 根据报价规则id获取报价规则
const getOfferRuleById = id => {
  let appOfferRuleList = window.localStorage.getItem("offerRuleList");
  if (appOfferRuleList) {
    appOfferRuleList = JSON.parse(appOfferRuleList);
    appOfferRuleList = appOfferRuleList.filter(item => id == item.id);
    return appOfferRuleList?.[0];
  }
};

// 报价规则匹配
const offerRuleMatch = order => {
  try {
    console.warn("匹配报价规则开始", order);
    const {
      city_name,
      cinema_name,
      hall_name,
      film_name,
      show_time,
      ticket_num,
      plat_name,
      appName,
      app_name //该字段主要是为了方便测试
    } = order;
    let shadowLineName = appName || app_name;
    console.log("报价订单影线", shadowLineName, plat_name);

    let appOfferRuleList = window.localStorage.getItem("offerRuleList");
    if (appOfferRuleList) {
      appOfferRuleList = JSON.parse(appOfferRuleList);
      appOfferRuleList = appOfferRuleList
        .filter(item =>
          item.platOfferList?.length
            ? item.platOfferList.map(item => item.platName).includes(plat_name)
            : item.orderForm.split(",").includes(plat_name)
        )
        .map(itemA => {
          let offerAmount = itemA.offerAmount || "";
          let addAmount = itemA.addAmount || "";
          return {
            ...itemA,
            offerAmount:
              itemA.offerType === "1"
                ? itemA.platOfferList?.find(item => item.platName === plat_name)
                    ?.value || offerAmount
                : itemA.offerType === "3"
                  ? offerAmount
                  : "",
            addAmount:
              itemA.offerType === "2"
                ? itemA.platOfferList?.find(item => item.platName === plat_name)
                    ?.value || addAmount
                : ""
          };
        });
    }
    // 1、获取启用的规则列表（只有满足规则才报价）
    let useRuleList = appOfferRuleList.filter(item =>
      ["1", "3"].includes(item.status)
    );
    console.log("启用的规则列表", useRuleList);
    // 2、获取某个影线的规则列表
    let shadowLineRuleList = useRuleList.filter(
      item => item.shadowLineName === shadowLineName
    );
    console.log("影线的规则列表", shadowLineRuleList);
    // 3、匹配城市
    let cityRuleList = shadowLineRuleList.filter(item => {
      console.log(
        "匹配城市",
        item.includeCityNames,
        item.excludeCityNames,
        city_name
      );
      if (!item.includeCityNames.length && !item.excludeCityNames.length) {
        return true;
      }
      if (item.includeCityNames.length) {
        return item.includeCityNames.join().indexOf(city_name) > -1;
      }
      if (item.excludeCityNames.length) {
        return item.excludeCityNames.join().indexOf(city_name) === -1;
      }
    });
    console.log("匹配城市后的规则列表", cityRuleList);
    // 4、匹配影院
    let cinemaRuleList = cityRuleList.filter(item => {
      if (!item.includeCinemaNames.length && !item.excludeCinemaNames.length) {
        return true;
      }
      if (item.includeCinemaNames.length) {
        return cinemaMatchHandle(
          cinema_name,
          item.includeCinemaNames,
          shadowLineName
        );
      }
      if (item.excludeCinemaNames.length) {
        return !cinemaMatchHandle(
          cinema_name,
          item.excludeCinemaNames,
          shadowLineName
        );
      }
    });
    console.log("匹配影院后的规则列表", cinemaRuleList);
    // 5、匹配影厅
    let hallRuleList = cinemaRuleList.filter(item => {
      console.log(
        "匹配影厅",
        item.includeHallNames,
        item.excludeHallNames,
        hall_name.toUpperCase()
      );
      if (!item.includeHallNames.length && !item.excludeHallNames.length) {
        return true;
      }
      if (item.includeHallNames.length) {
        let isMatch = item.includeHallNames.some(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) > -1;
        });
        console.log("isMatch1-1", isMatch);
        return isMatch;
      }
      if (item.excludeHallNames.length) {
        let isMatch = item.excludeHallNames.every(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) === -1;
        });
        console.log("isMatch1-2", isMatch);
        return isMatch;
      }
    });
    console.log("匹配影厅后的规则列表", hallRuleList);
    // 6、匹配影片
    let filmRuleList = hallRuleList.filter(item => {
      console.log(
        "匹配影片",
        item.includeFilmNames,
        item.excludeFilmNames,
        film_name.toUpperCase()
      );
      if (!item.includeFilmNames.length && !item.excludeFilmNames.length) {
        return true;
      }
      if (item.includeFilmNames.length) {
        let isMatch = item.includeFilmNames.some(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) ===
            convertFullwidthToHalfwidth(filmName)
          );
        });
        console.log("isMatch2-1", isMatch);
        return isMatch;
      }
      if (item.excludeFilmNames.length) {
        let isMatch = item.excludeFilmNames.every(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) !==
            convertFullwidthToHalfwidth(filmName)
          );
        });
        console.log("isMatch2-2", isMatch);
        return isMatch;
      }
    });
    console.log("匹配影片后的规则列表", filmRuleList);
    // 7、匹配座位数限制
    let seatRuleList = filmRuleList.filter(item => {
      if (!item.seatNum) {
        return true;
      }
      return Number(item.seatNum) >= Number(ticket_num);
    });
    console.log("匹配座位数后的规则列表", seatRuleList);
    // 8、匹配开场时间限制
    let timeRuleList = seatRuleList.filter(item => {
      let startTime = show_time.split(" ")[1];
      if (!item.ruleStartTime && !item.ruleEndTime) {
        return true;
      }
      if (item.ruleStartTime && item.ruleEndTime) {
        return (
          isTimeAfter(startTime, item.ruleStartTime + ":00") &&
          isTimeAfter(item.ruleEndTime + ":00", startTime)
        );
      }
      if (item.ruleStartTime) {
        return isTimeAfter(startTime, item.ruleStartTime + ":00");
      }
      if (item.ruleEndTime) {
        return isTimeAfter(item.ruleEndTime + ":00", startTime);
      }
    });
    console.log("匹配开场时间后的规则列表", timeRuleList);
    // 9、匹配星期几
    let weekRuleList = timeRuleList.filter(item => {
      const weekdays = [
        "星期日",
        "星期一",
        "星期二",
        "星期三",
        "星期四",
        "星期五",
        "星期六"
      ];
      const today = new Date(show_time).getDay();
      const dayOfWeek = weekdays[today];
      if (item.weekDay?.length) {
        return item.ruleWeek.includes(dayOfWeek);
      }
      return true;
    });
    console.log("匹配星期几后的规则列表", weekRuleList);
    // 10、匹配会员日
    let memberDayRuleList = weekRuleList.filter(item => {
      const day = show_time.split(" ")[0].split("-")[2];
      if (item.memberDay) {
        return Number(item.memberDay) === Number(day);
      }
      return true;
    });
    console.log("匹配会员日后的规则列表", memberDayRuleList);
    return {
      matchRuleList: memberDayRuleList
    };
  } catch (error) {
    console.error("匹配报价规则异常", error);
    return {
      error
    };
  }
};

window.offerRuleMatch = offerRuleMatch;
// 日志上传
const logUpload = async (order, logList) => {
  try {
    if (!logList.length) return;

    let log_list = logList.slice();
    log_list = log_list.map(item => {
      let info = item.info;
      if (info?.error) {
        info.error = formatErrInfo(info.error);
      }
      return {
        ...item,
        info
      };
    });
    // 解决后端接口里面返回特殊表情接口报错无法入库的问题
    log_list = JSON.stringify(log_list).replace(/[\u{1F600}-\u{1F64F}]/gu, "");
    log_list = JSON.parse(log_list);
    logList.length = 0; // 清空原数组（堆内存里面的值会被清空）
    // type 1-报价 2-获取订单 3-出票
    const { order_number, app_name, plat_name, type = 3 } = order;
    await svApi.addTicketOperaLog({
      plat_name: plat_name || "",
      app_name: app_name || "",
      order_number: order_number || "",
      type,
      log_list
    });
    // log_list 数组对象里的level： error\warn\info
  } catch (error) {
    console.error("日志上送异常", error);
  }
};

// 模拟延时
const mockDelay = delayTime => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delayTime * 1000);
  });
};

// 对象深拷贝（获取对象源值）
const getOrginValue = value => JSON.parse(JSON.stringify(value));

// 格式化错误信息对象
const formatErrInfo = errInfo => {
  let errInfoStr;
  if (!errInfo) return "";
  if (errInfo instanceof Error) {
    const cleanedError = {
      message: errInfo.message,
      stack: errInfo.stack,
      name: errInfo.name
    };
    errInfoStr = JSON.stringify(
      cleanedError,
      (key, value) =>
        typeof value === "function" || value instanceof Error
          ? undefined
          : value,
      2
    );
  } else {
    try {
      errInfoStr = JSON.stringify(errInfo);
    } catch (error) {
      console.warn("错误信息转换异常", error);
      errInfoStr = errInfo.toString();
    }
  }
  return errInfoStr;
};

/**
 * 试错方法
 * @param { Function } 	callback	要试错的方法，携带参数的话可以在传参时嵌套一层
 * @param { Number } 	number	    试错次数
 * @param { Number } 	delayTime	试错间隔时间
 * @param { String } 	conPrefix	前缀打印
 */
// const trial = (callback, number = 1, delayTime = 0, conPrefix) => {
//   let inx = 1,
//     trialTimer = null;
//   return new Promise(resolve => {
//     trialTimer = setInterval(async () => {
//       console.log("inx", inx, "number", number, "trialTimer", trialTimer);
//       if (inx < number && trialTimer) {
//         ++inx;
//         console.log(conPrefix + `第${inx}次试错开始`);
//         try {
//           const result = await callback(inx);
//           console.log(conPrefix + `第${inx}次试错成功`, result);
//           clearInterval(trialTimer);
//           trialTimer = null;
//           resolve(result);
//         } catch (error) {
//           console.error(conPrefix + `第${inx}次试错失败`, error);
//         }
//       } else {
//         console.log(conPrefix + `第${inx}次试错结束`);
//         clearInterval(trialTimer);
//         trialTimer = null;
//         resolve();
//       }
//     }, delayTime * 1000);
//   });
// };

/**
 * 试错方法
 * @param { Function } 	callback	    要试错的方法，携带参数的话可以在传参时嵌套一层
 * @param { Number } 	  maxAttempts	  最大试错次数, 默认5
 * @param { Number } 	  delayTime	    试错间隔时间（单位 秒），默认5
 * @param { String } 	  conPrefix	    前缀打印
 * @param { Number } 	  timeout	      最大总耗时，默认为 120秒
 * @param { Number } 	  attempt	      当前尝试次数，默认为 1
 * @param { Number } 	  consumedTime	执行消耗时间
 */
async function trial(
  callback,
  maxAttempts = 5,
  delayTime = 5,
  conPrefix = "",
  timeout = 120,
  attempt = 1,
  consumedTime = 0
) {
  const start = Date.now();
  let end;
  try {
    const result = await callback(attempt + 1);
    console.warn(`${conPrefix}：第${attempt}次尝试成功`, consumedTime);
    return result;
  } catch (error) {
    end = Date.now();
    consumedTime += end - start;
    if (attempt >= maxAttempts || consumedTime >= timeout * 1000) {
      console.error("重试超时"); // 达到最大重试次数或超时后抛出错误
      return;
    }
    console.warn(
      `${conPrefix}：第${attempt}次尝试失败，将在${delayTime}秒后重试...`,
      consumedTime
    );
    await mockDelay(delayTime);
    consumedTime += delayTime * 1000;
    // 递归调用自身，尝试次数加 1
    return trial(
      callback,
      maxAttempts,
      delayTime,
      conPrefix,
      timeout,
      attempt + 1,
      consumedTime
    );
  }
}

// 商展格式化获取放映时间
const parseTimeStr = timeStr => {
  // 当前年份
  const currentYear = new Date().getFullYear();

  // 解析输入的字符串
  const parts = timeStr.split(" ");
  const datePart = parts[0].replace("日", ""); // 移除 "日" 字符
  const timePart = parts[1];

  // 解析日期部分
  const [month, day] = datePart.split("月");
  const [startTime, endTime] = timePart.split("-");

  // 格式化日期和时间
  const startFormatted = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${startTime}:00`;
  const endFormatted = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${endTime}:00`;

  return {
    startTime: startFormatted,
    endTime: endFormatted
  };
};

// 卢米埃解析日期
const formatTimeStrByLma = timeStr => {
  // 当前年份
  const currentYear = new Date().getFullYear();

  // 解析月份和日期
  const [month, day] = timeStr
    .substr(2)
    .replace("月", "-")
    .replace("日", "-")
    .split("-");
  const formattedMonth = String(month).padStart(2, "0"); // 月份从0开始，所以需要加1，并确保两位数
  const formattedDay = String(day).padStart(2, "0"); // 确保日期是两位数

  // 组合成 yyyy-MM-dd 格式
  const formattedDate = `${currentYear}-${formattedMonth}-${formattedDay}`;
  return formattedDate;
};

export {
  getCurrentFormattedDateTime, // 获取当前时间：YYYY-MM-DD HH:MM:SS
  getCurrentDay, // 获取当前天：YYYY-MM-DD
  getCurrentTime, // 获取当前时间：HH:MM:SS
  exportExcel, // 导出
  getFormattedDateTime, // 获取当前时间：YYYY-MM-DD HH:MM:SS
  findBestMatchByLevenshtein,
  findBestMatchByLevenshteinWithThreshold,
  isTimeAfter, // 判断time1时间是否在time2之后
  getCinemaFlag, // 获取影院标识
  convertFullwidthToHalfwidth, // 全角字符转换成半角
  cinemNameSpecial, // 影院名称特殊处理（为了特殊匹配,去括号、空格及中间点）
  couponInfoSpecial, // 券名称特殊处理（为了特殊匹配,去括号、空格、中间点、中横线及冒号）
  getCinemaLoginInfoList, // 获取影院登录信息列表
  sendWxPusherMessage, // 发送微信消息
  calcCount, // 计算连续中标数
  judgeHandle, // 判断该订单是否是新订单
  getCinemaId, // 根据订单name获取影院id(主要用于sfc系统)
  getCinemaIdByLma, // 根据订单name获取影院id(主要用于lma系统)
  getTargetCinema,
  // 根据订单name获取目标影院(主要用于ume系统)
  cinemaMatchHandle, // 影院名称匹配（匹配报价规则时使用）
  getOfferRuleById, // 根据报价规则id获取报价规则
  offerRuleMatch, // 报价规则匹配
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  getOrginValue, // 对象深拷贝（获取对象源值）
  formatErrInfo, // 格式化错误信息对象
  trial, // 试错方法
  parseTimeStr, // 商展格式化获取放映时间
  formatTimeStrByLma,
  cryptoFunctions,
  CustomConsole
};
