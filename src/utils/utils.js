// 导入 ExcelJS 库
import ExcelJS from "exceljs";
/**
 * 获取当前日期和时间的格式化字符串
 * 无参数
 * @return {string} 返回格式为 "YYYY-MM-DD HH:MM:SS" 的字符串
 */
function getCurrentFormattedDateTime() {
  const now = new Date();

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
  const { cinema_group, cinema_name, city_name } = item;
  if (["上影上海", "上影二线"].includes(cinema_group)) {
    return "sfc";
  } else if (
    cinema_name.includes("华夏久金国际影城") &&
    ["上海"].includes(city_name)
  ) {
    return "jiujin";
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
  } else if (cinema_name.includes("乐娃影院") && ["北京"].includes(city_name)) {
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
  }
};

// 全角字符转换成半角
function convertFullwidthToHalfwidth(str) {
  // 全角到半角的映射表
  const fullwidthToHalfwidthMap = {
    "！": "!", // 全角感叹号
    "，": ",", // 全角逗号
    "。": "." // 全角句号
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

// 影院名称特殊处理（为了特殊匹配）
const cinemNameSpecial = cinema_name => {
  return cinema_name.replace(/[\(\)\（\）-]/g, "").replace(/\s*/g, "");
};

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
export {
  getCurrentFormattedDateTime,
  exportExcel,
  getFormattedDateTime,
  findBestMatchByLevenshtein,
  findBestMatchByLevenshteinWithThreshold,
  isTimeAfter,
  getCinemaFlag,
  convertFullwidthToHalfwidth,
  cinemNameSpecial,
  CustomConsole
};
