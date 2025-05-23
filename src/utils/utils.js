// 导入 ExcelJS 库
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import axios from "axios";
import * as CryptoJS from "crypto-js";
import svApi from "@/api/sv-api";
import {
  WX_MSG_UID,
  SFC_CINEMA_NAME,
  YAOLAI_CINEMA_NAME,
  UME_CINEMA_NAME,
  YINGHUANG_CINEMA_NAME,
  ZHEYINGSHIDAI_CINEMA_NAME,
  EXCLUDE_CINEMA_LIST_BY_CINEMA_FLAG,
  GET_UME_LIST,
  GET_USABLE_APP_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST
} from "@/common/constant";
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import {
  useDataTableStoreBySpecialName,
  useCinemaCodeMatchList
} from "@/store/specialNameRule";
const specialRules = useDataTableStoreBySpecialName();
const { specialNameList } = storeToRefs(specialRules);
const cinemaCodeMatchObj = useCinemaCodeMatchList();
import { useDataTableStore } from "@/store/offerRule";
const offerRules = useDataTableStore();
const { offerRuleList } = storeToRefs(offerRules);

import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// console.log("user_id", user_id);
// console.log(
//   "specialNameList0",
//   specialNameList.value,
//   specialNameList.value.filter(item => item.app_name == "hbchyxd")
// );

console.log("specialNameList123", toRaw(specialNameList.value));
// window.specialNameList = specialNameList;

// 获取上一天
function getPreviousDay(dateString) {
  // 将日期字符串转换为Date对象
  const date = new Date(dateString);
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date string");
  }
  // 获取上一天的日期
  date.setDate(date.getDate() - 1);
  // 将日期格式化为 'YYYY-MM-DD' 字符串
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从0开始，需要加1
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 格式化时间 YYYY-MM-DD HH:mm:ss
function formatTimeOfTime(sjc) {
  try {
    if (!sjc) return "";
    const now = new Date(sjc);
    const year = now.getFullYear();
    const month = padZero(now.getMonth() + 1);
    const date = padZero(now.getDate());
    const hours = padZero(now.getHours());
    const minutes = padZero(now.getMinutes());
    const seconds = padZero(now.getSeconds());
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
  } catch (err) {
    return sjc;
  }
}

// 格式化日期 YYYY-MM-DD
function formatTimeOfDay(sjc) {
  try {
    if (!sjc) return "";
    const now = new Date(sjc);
    const year = now.getFullYear();
    const month = padZero(now.getMonth() + 1);
    const date = padZero(now.getDate());
    return `${year}-${month}-${date}`;
  } catch (err) {
    return sjc;
  }
}

// 获取当前时间 YYYY-MM-DD HH:mm:ss
function getCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = padZero(now.getMonth() + 1);
  const date = padZero(now.getDate());
  const hours = padZero(now.getHours());
  const minutes = padZero(now.getMinutes());
  const seconds = padZero(now.getSeconds());
  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}

// 获取当前日期 YYYY-MM-DD
function getCurrentDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = padZero(now.getMonth() + 1);
  const date = padZero(now.getDate());
  return `${year}-${month}-${date}`;
}

// 辅助函数：补零
function padZero(num) {
  return `0${num}`.slice(-2);
}

/**
 * 获取当前日期和时间的格式化字符串
 * 无参数
 * @return {string} 返回格式为 "YYYY-MM-DD HH:mm:ss" 的字符串
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

// 判断某个日期是否在当月内 如：'2024-11-15'
function isDateInCurrentMonth(date) {
  if (!date) return false;
  // 将传入的日期字符串转换为日期对象
  const dateToCheck = new Date(date);
  // 获取当前日期
  const currentDate = new Date();
  // 比较年份和月份
  return (
    dateToCheck.getFullYear() === currentDate.getFullYear() &&
    dateToCheck.getMonth() === currentDate.getMonth()
  );
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

/**
 * 解析 Excel 文件
 * @param {File} file - 文件对象
 * @param {boolean} includeHeader - 是否包含表头
 * @returns {Array|{header: Array, content: Array}} - 包含表头和内容的数组或仅内容数组
 */
function parseExcel(file, includeHeader = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (includeHeader) {
        const header = json[0];
        const content = json.slice(1);
        resolve({ header, content });
      } else {
        resolve({ content: json });
      }
    };
    reader.onerror = error => {
      reject(error);
    };
    reader.readAsArrayBuffer(file);
  });
}

// 生成excel文件并下载
const createExcelDown = (tableData, fileName) => {
  try {
    var wb = XLSX.utils.book_new();
    // 创建一些数据
    var data = tableData;
    // 将数据转换为工作表
    var ws = XLSX.utils.aoa_to_sheet(data);
    // 将工作表添加到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    // 生成Excel文件并触发下载
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    console.error("生成excel并下载异常", error);
  }
};

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

// 获取影院标识新
const newGetCinemaFlagFun = item => {
  let appFlag = cinemaCodeMatchObj.getCinemaAppFlag(item.cinema_code);
  if (appFlag === "wanxiangh5") {
    appFlag = "wanxiang";
  }
  return appFlag;
};
// 获取影院标识
const getCinemaFlagFun = item => {
  // 最新根据cinemaCode判断影院标识
  return newGetCinemaFlagFun(item);
  const { cinema_group, cinema_name, city_name, plat_name } = item;
  // 是否是排除影院
  const is_exclude_cinema = EXCLUDE_CINEMA_LIST_BY_CINEMA_FLAG.some(
    itemA => cinemNameSpecial(itemA) === cinemNameSpecial(cinema_name)
  );
  if (is_exclude_cinema) return;
  // 获取影院配置
  let allCinemaList = window.localStorage.getItem("allCinemaList");
  if (allCinemaList) {
    allCinemaList = JSON.parse(allCinemaList);
    // 中影比较特殊，很多sfc单店在平台那的group都划成中影了，但是还是要走单店出，故将中影排到最后
    allCinemaList.sort((a, b) => {
      if (a.app_name === "zhongying" && b.first !== "zhongying") return 1;
      if (a.app_name !== "zhongying" && b.first === "zhongying") return -1;
    });
  }
  // console.log("allCinemaList", allCinemaList);
  let target = allCinemaList.find(itemA => {
    let isGroup = false,
      isCinema = false,
      isBlackCinema = false,
      isCity = true;
    if (itemA.group_list && cinema_group) {
      isGroup = itemA.group_list
        .replace(/[;；]/g, "-")
        .split("-")
        .some(itemB => cinemNameSpecial(cinema_group) === itemB);
    }
    if (itemA.flag_list && cinema_name) {
      isCinema = itemA.flag_list
        .replace(/[;；]/g, "-")
        .split("-")
        .some(itemB => cinemNameSpecial(cinema_name).includes(itemB));
    }
    if (itemA.black_list && cinema_name) {
      isBlackCinema = itemA.black_list
        .replace(/[;；]/g, "-")
        .split("-")
        .some(itemB => cinemNameSpecial(cinema_name).includes(itemB));
    }
    if (itemA.city_list && city_name) {
      isCity = itemA.city_list
        .replace(/[;；]/g, "-")
        .split("-")
        .some(itemB => city_name.includes(itemB));
    }
    return (isGroup || isCinema) && isCity && !isBlackCinema;
  });
  if (target) {
    console.log("target", target);
    return target.app_name;
  }

  // 上影
  let isSfcCinemaName = SFC_CINEMA_NAME.some(
    item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
  );

  // UME
  let isUmeCinemaName = UME_CINEMA_NAME.some(
    item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
  );

  // 耀莱
  let isYaolaiCinemaName = YAOLAI_CINEMA_NAME.some(
    item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
  );

  // 英皇
  let isYinghuangCinemaName = YINGHUANG_CINEMA_NAME.some(
    item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
  );

  // 浙影时代
  let isZheyingshidaiCinemaName = ZHEYINGSHIDAI_CINEMA_NAME.some(
    item => cinemNameSpecial(item) === cinemNameSpecial(cinema_name)
  );

  if (isYinghuangCinemaName) {
    return "yinghuang";
  }
  if (isZheyingshidaiCinemaName) {
    return "zheyingshidai";
  }
  if (isSfcCinemaName) {
    return "sfc";
  }
  // 蚂蚁和洋葱、哈哈：UME。 猎人和芒果：ume一线、ume二线
  else if (isUmeCinemaName) {
    return "ume";
  }
  // 蚂蚁和洋葱、哈哈：耀莱成龙。 猎人和芒果：耀莱一线、耀莱二线
  else if (isYaolaiCinemaName) {
    return "yaolai";
  }
};
const getCinemaFlag = item => {
  const app_name = getCinemaFlagFun(item);
  let rule = tokens?.userInfo?.rule;
  // 只针对内部角色，主要是控制影院是否进行报价
  if (app_name && rule == 2 && GET_USABLE_APP_LIST()?.["" + app_name]) {
    return app_name;
  }
  return app_name;
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
    "·": "•",
    "（": "(", // 全角左括号
    "）": ")" // 全角右括号
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
const getCinemaLoginInfoList = userId => {
  let user_id = userId || tokens?.userInfo?.user_id;
  if (user_id == 1) {
    user_id = 9;
  }
  // console.log("user_id1", user_id);
  let loginInfoList = window.localStorage.getItem("loginInfoList");
  if (loginInfoList) {
    loginInfoList = JSON.parse(loginInfoList);
    loginInfoList = loginInfoList.filter(item =>
      !item.link_user_id ? true : item.link_user_id == user_id
    );
  }
  const phone = tokens?.userInfo?.phone;
  if (phone) {
    loginInfoList = loginInfoList.sort((a, b) => {
      // 优先按 first 字段排序
      if (a.first === "1" && b.first !== "1") return -1;
      if (a.first !== "1" && b.first === "1") return 1;

      // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
      if (a.first === "1" && b.first === "1") {
        // 如果 a.mobile 是当前用户的手机号，则 a 应该排在 b 之前
        if (a.mobile === phone) return -1;
        // 如果 b.mobile 是当前用户的手机号，则 b 应该排在 a 之前
        if (b.mobile === phone) return 1;
        // 如果两个对象的 mobile 都不是当前用户的手机号，则按默认顺序排列
        return 0;
      }

      // 如果 first 都不是 '1'，则按 mobile 字段排序
      if (a.mobile === phone) return -1;
      if (b.mobile === phone) return 1;

      // 如果两个对象的 first 和 mobile 都相同，则按默认顺序排列
      return 0;
    });
  }
  return loginInfoList || [];
};

window.getCinemaLoginInfoList = getCinemaLoginInfoList;
// 发送微信消息
const sendWxPusherMessage = async ({
  orderInfo,
  transferTip,
  failReason,
  app_name,
  msgType, // 消息类型 1-登录失效
  expirePhone, // 失效手机号
  quan_flag,
  black_quans
}) => {
  const {
    plat_name,
    order_number,
    city_name,
    cinema_name,
    film_name,
    show_time,
    lockseat,
    hall_name,
    supplier_end_price
  } = orderInfo || {};
  const url = "https://wxpusher.zjiecode.com/api/manager/message/send";
  const headers = {
    "content-type": "application/json;charset=UTF-8",
    token: "06e3656983338d5d3b333ab2cfbd54d0"
    // 需注意一旦token过期就会不发消息，需要重新扫码登录然后发个消息拿network里的token
  };
  let userInfo = window.localStorage.getItem("userInfo");
  if (userInfo) {
    userInfo = JSON.parse(userInfo);
  }

  let summary = plat_name + "平台出票失败";
  let content = `<p>
  时间：${getCurrentTime()}; <br/>
  用户：${userInfo.name}; <br/>
  平台：${plat_name}; <br/>
  单号：${order_number}; <br/>
  城市：${city_name}; <br/>
  影院：${cinema_name}; <br/>
  影厅：${hall_name}; <br/>
  片名：${film_name}; <br/>
  场次：${show_time}; <br/>
  座位：${lockseat}; <br/>
  中标价：${supplier_end_price}; <br/>
  原因：${failReason};<br/>
  提示：${transferTip};<br/>
  </p>`;

  if (msgType === 1) {
    summary = app_name + "影院登录失效";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    失效手机号：${expirePhone}; <br/>
    影院：${app_name}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  } else if (msgType === 2) {
    summary = "出票队列重复";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  } else if (msgType === 3) {
    summary = "黑名单券更新请检查";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    平台：${plat_name}; <br/>
    单号：${order_number}; <br/>
    提示：${transferTip};<br/>
    券标识：${quan_flag};<br/>
    黑名单券：${black_quans};<br/>
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
    // console.log("Response:", response.data);
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
    let specialList = toRaw(specialNameList.value)
      .filter(item => item.app_name == appName)
      .map(item => ({
        city_name: item.city_name,
        sfc_cinema_name: item.cinema_name,
        order_cinema_name: item.special_name
          ?.split("**")
          ?.map(itemName => cinemNameSpecial(itemName))
      }));
    let specialCinemaInfo = specialList.find(
      item =>
        item.order_cinema_name.includes(cinemaName) &&
        (item.city_name ? item.city_name.includes(city_name) : true)
    );
    if (specialCinemaInfo) {
      cinemaName = cinemNameSpecial(specialCinemaInfo.sfc_cinema_name);
      console.warn("特殊匹配影院名称成功", cinemaName, cinema_name);
    } else {
      console.warn("特殊匹配影院名称失败", cinemaName, specialList);
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
    let specialList = toRaw(specialNameList.value)
      .filter(item => item.app_name == appName)
      .map(item => ({
        city_name: item.city_name,
        sfc_cinema_name: item.cinema_name,
        order_cinema_name: item.special_name
          ?.split("**")
          ?.map(itemName => cinemNameSpecial(itemName))
      }));
    let specialCinemaInfo = specialList.find(
      item =>
        item.order_cinema_name.includes(cinemaName) &&
        (item.city_name ? item.city_name.includes(city_name) : true)
    );
    if (specialCinemaInfo) {
      cinemaName = cinemNameSpecial(specialCinemaInfo.sfc_cinema_name);
      console.warn("特殊匹配影院名称成功", cinemaName, cinema_name);
    } else {
      console.warn("特殊匹配影院名称失败", cinemaName, specialList);
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
    )?.cinema_id;
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
const getTargetCinema = (cinema_name, list, appName, city_name) => {
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
    console.warn("全字匹配影院名称失败", cinema_name, list, appName);
    let cinemaName = cinemNameSpecial(cinema_name);
    let specialList = toRaw(specialNameList.value)
      .filter(item => item.app_name == appName)
      .map(item => ({
        city_name: item.city_name,
        sfc_cinema_name: item.cinema_name,
        order_cinema_name: item.special_name
          ?.split("**")
          ?.map(itemName => cinemNameSpecial(itemName))
      }));
    console.log("specialList", specialList);
    if (specialList?.length) {
      let specialCinemaInfo = specialList.find(
        item =>
          item.order_cinema_name.includes(cinemaName) &&
          (item.city_name ? item.city_name.includes(city_name) : true)
      );
      if (specialCinemaInfo) {
        cinemaName = cinemNameSpecial(specialCinemaInfo.sfc_cinema_name);
        console.warn("特殊匹配影院名称成功", cinemaName, cinema_name);
      } else {
        console.warn("特殊匹配影院名称失败", cinemaName, specialList);
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

// 统一获取目标影院方法（影院列表需保证好cinemaCode和cinemaId字段）
const getTargetCinemaCommon = ({ app_name, plat_cinema_code, cinema_list }) => {
  const matchInfo = cinemaCodeMatchObj.getCinemaMatchInfo(
    plat_cinema_code,
    app_name
  );
  // 如果两个code一致直接返回
  if (matchInfo?.app_cinema_code == plat_cinema_code) {
    return cinema_list.find(item => item.cinemaCode == plat_cinema_code);
  } else {
    // 拆开用cinemaId匹配
    const [city_id, cinema_id] = matchInfo?.app_cinema_code?.split("_");
    return cinema_list.find(item => item.cinemaId == cinema_id);
  }
};
window.getTargetCinemaCommon = getTargetCinemaCommon;
// 获取目标影院特殊匹配测试方法
window.getTargetCinema = ({ app_name, cinema_name, cinemaList, city_name }) => {
  if (GET_UME_LIST().includes(app_name)) {
    getTargetCinema(cinema_name, cinemaList, app_name, city_name);
  } else if (GET_H5_UME_LIST().includes(app_name)) {
    getTargetCinema(cinema_name, cinemaList, app_name, city_name);
  } else if (GET_SFC_APP_LIST().includes(app_name)) {
    getCinemaId(cinema_name, cinemaList, app_name, city_name);
  } else if (app_name === "lma") {
    getCinemaIdByLma(cinema_name, cinemaList, app_name, city_name);
  }
};
// 是否匹配测试方法（用于匹配对比出票记录的cinema_code）
const isMatch = (app_name, cinema_name, cinema_name1, city_name) => {
  // console.log(app_name, cinema_name, cinema_name1, city_name);
  let isMatch = false;
  isMatch = cinema_name === cinema_name1;
  if (isMatch) return true;
  isMatch = cinemNameSpecial(cinema_name) === cinemNameSpecial(cinema_name1);
  if (isMatch) return true;
  let specialList = toRaw(specialNameList.value)
    .filter(item => item.app_name == app_name)
    .map(item => ({
      city_name: item.city_name,
      sfc_cinema_name: item.cinema_name,
      order_cinema_name: item.special_name
        ?.split("**")
        ?.map(itemName => cinemNameSpecial(itemName))
    }));
  cinema_name1 = cinemNameSpecial(cinema_name1);
  // console.log("specialList", specialList, cinema_name1);

  let specialCinemaInfo = specialList.find(
    item =>
      item.order_cinema_name.includes(cinema_name1) &&
      (item.city_name ? item.city_name.includes(city_name) : true)
  );
  // console.log("specialCinemaInfo", specialCinemaInfo);

  if (specialCinemaInfo) {
    return (
      cinemNameSpecial(specialCinemaInfo.sfc_cinema_name) ===
      cinemNameSpecial(cinema_name)
    );
  }
};

window.isMatch = isMatch;
// 影院名称匹配（匹配报价规则时使用）
const cinemaMatchHandle = ({
  app_name,
  plat_cinema_code,
  cinema_name_list
}) => {
  try {
    const matchInfo = cinemaCodeMatchObj.getCinemaMatchInfo(
      plat_cinema_code,
      app_name
    );
    let app_cinema_name = matchInfo?.app_cinema_name;
    return cinema_name_list.some(
      item => cinemNameSpecial(item) == cinemNameSpecial(app_cinema_name)
    );
    // 1、全字匹配
    let isHasMatch = list.some(item => item === cinema_name);
    if (isHasMatch) {
      return true;
    }
    console.warn("全字匹配影院名称失败", cinema_name, list);
    // 去括号、空格及中间点
    let cinemaName = cinemNameSpecial(cinema_name);
    // 2、特殊匹配
    let specialList = toRaw(specialNameList.value)
      .filter(item => item.app_name == appName)
      .map(item => ({
        city_name: item.city_name,
        sfc_cinema_name: item.cinema_name,
        order_cinema_name: item.special_name
          ?.split("**")
          ?.map(itemName => cinemNameSpecial(itemName))
      }));
    let specialCinemaInfo = specialList.find(
      item =>
        item.order_cinema_name.includes(cinemaName) &&
        (item.city_name ? item.city_name.includes(city_name) : true)
    );
    console.log("specialCinemaInfo", specialCinemaInfo, cinema_name);
    if (specialCinemaInfo) {
      cinemaName = cinemNameSpecial(specialCinemaInfo.sfc_cinema_name);
    } else {
      console.warn("特殊匹配影院名称失败", cinemaName, specialList);
    }
    // 3、去掉空格及换行符后全字匹配
    const noSpaceList = list.map(item => cinemNameSpecial(item));
    isHasMatch = noSpaceList.some(item => item === cinemaName);
    console.log("isHasMatch", isHasMatch, noSpaceList);
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
    .toLowerCase()
    .replace(/[\(\)\（\）\-\/、]/g, "") // 替换括号、破折号、斜杠和顿号
    .replace(/\s*/g, "") // 替换所有空白字符
    .replace(/·/g, "") // 替换中间点
    .replace(/:/g, ""); // 替换冒号
};
window.cinemNameSpecial = cinemNameSpecial;
// 券名称特殊处理（为了特殊匹配,去括号、空格、中间点、中横线及冒号）
const couponInfoSpecial = coupon_info => {
  return coupon_info
    .toLowerCase()
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
  let appOfferRuleList = toRaw(offerRuleList.value);
  if (appOfferRuleList) {
    appOfferRuleList = JSON.parse(appOfferRuleList);
    appOfferRuleList = appOfferRuleList.filter(item => id == item.id);
    return appOfferRuleList?.[0];
  }
};

// 报价规则匹配
const offerRuleMatch = order => {
  // order = order || window.order;
  try {
    console.warn("匹配报价规则开始", order);
    const {
      city_name,
      cinema_name,
      cinema_code,
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
    // 这里后面需要从接口里读取，数据太大了本地缓存不够放
    let appOfferRuleList = toRaw(offerRuleList.value);
    if (appOfferRuleList) {
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
    let shadowLineRuleList = useRuleList.filter(item => {
      // 万象ume和h5ume都需要用
      if (shadowLineName != "wanxiang") {
        return item.shadowLineName === shadowLineName;
      } else {
        return ["wanxiang", "wanxiangh5"].includes(item.shadowLineName);
      }
    });
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
        return cinemaMatchHandle({
          app_name: shadowLineName,
          plat_cinema_code: cinema_code,
          cinema_name_list: item.includeCinemaNames
        });
      }
      if (item.excludeCinemaNames.length) {
        return !cinemaMatchHandle({
          app_name: shadowLineName,
          plat_cinema_code: cinema_code,
          cinema_name_list: item.excludeCinemaNames
        });
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
        return item.weekDay.includes(dayOfWeek);
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
// 测试报价规则匹配
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
const mockDelay = delayTime => window.mockDelayHandle(delayTime);
window.mockDelay = mockDelay;
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

// 转换座位号 如05排05座 去掉0
const removeLeadingZeros = lockseat => {
  // 使用正则表达式匹配并替换每部分前面的零
  const parts = lockseat.split("排");
  const row = parts[0].replace(/^0+/, ""); // 去掉行号前面的零
  const seatWithSuffix = parts[1];
  const seat = seatWithSuffix.replace(/^[0]+/, "").replace("座", ""); // 去掉座位号前面的零并去掉“座”字
  return `${row}排${seat}座`;
};

// 按0.5向上去整，即4.1变为4.5,4.6变为5
function roundToHalf(num, flag = 1) {
  // 计算 num 除以 0.5 的商
  const quotient = +num / 0.5;
  // 向上/向下取整
  const roundedQuotient =
    flag == 1 ? Math.ceil(quotient) : Math.floor(quotient);
  // 返回结果
  return roundedQuotient * 0.5;
}

/**
 * 根据规则列表计算加价金额
 * @param {number} comparePrice - 比较价格
 * @param {number} memberPrice - 会员价格
 * @param {string[]} ruleList - 规则列表
 * @returns {number} - 加价金额
 */
function calculateMarkup(comparePrice, memberPrice, ruleList) {
  for (const rule of ruleList) {
    const [condition, amount] = rule.split("+");

    switch (condition) {
      case ">=":
        if (+memberPrice >= +comparePrice) {
          return parseFloat(amount);
        }
        break;
      case ">":
        if (+memberPrice > +comparePrice) {
          return parseFloat(amount);
        }
        break;
      case "<=":
        if (+memberPrice <= +comparePrice) {
          return parseFloat(amount);
        }
        break;
      case "<":
        if (+memberPrice < +comparePrice) {
          return parseFloat(amount);
        }
        break;
      case "==":
        if (memberPrice == comparePrice) {
          return parseFloat(amount);
        }
        break;
      default:
        console.error("未知的操作符:", operator);
        break;
    }
  }

  // 如果没有匹配的规则，返回默认值（例如0）
  return;
}

/**
 * 检查目标座位及其周围座位的状态，并调整目标座位列表
 * @param {Array} lockedSeats - 已锁定的座位数组,如：[6, 7, 11]
 * @param {Array} targetSeats - 目标座位数组，如：[2, 3]或者 [13]
 * @param {number} maxSeatNumber - 最大座位数，如：15
 * @returns {Array} - 调整后的目标座位列表
 */
const adjustSeats = (lockedSeats, targetSeats, maxSeatNumber, flag) => {
  lockedSeats = lockedSeats.map(item => +item);
  targetSeats = targetSeats.map(item => +item);
  // 将已锁定座位和目标座位合并并排序
  const allSeats = [...lockedSeats, ...targetSeats].sort((a, b) => a - b);

  // 使用 Set 来存储调整后的目标座位，确保每个座位只出现一次
  const adjustedSeats = new Set();

  // 检查每个目标座位及其周围座位
  targetSeats.forEach(targetSeat => {
    const leftSeat = targetSeat - 1; // 目标1左边座位;
    const rightSeat = targetSeat + 1; // 目标1右边座位;
    // console.log("leftSeat", leftSeat, allSeats, leftSeat - 1);
    // 检查左边座位是否会导致单个空位(如该座位左边没座位了或者左边座位已锁定了)
    if (leftSeat > 0 && !allSeats.includes(leftSeat)) {
      // 检查左边座位是否会导致单个空位(如该座位左边没座位了或者左边座位已锁定了)
      if (leftSeat - 1 == 0 || allSeats.includes(leftSeat - 1)) {
        adjustedSeats.add(leftSeat);
      }
    }
    // console.log("rightSeat", rightSeat, allSeats, rightSeat + 1);

    // 检查右边座位
    if (rightSeat <= maxSeatNumber && !allSeats.includes(rightSeat)) {
      if (rightSeat == maxSeatNumber || allSeats.includes(rightSeat + 1)) {
        adjustedSeats.add(rightSeat);
      }
    }
  });

  // 将 Set 转换为数组并排序，返回调整后的目标座位列表
  let fillSeats = Array.from(adjustedSeats).sort((a, b) => a - b);
  // console.log("fillSeats", fillSeats, flag);
  if (fillSeats.length) {
    if (flag != 1) {
      let fillSeatList = adjustSeats(lockedSeats, fillSeats, maxSeatNumber, 1);
      // console.log("fillSeats", fillSeats, flag);
      // 只有拿着填充座位判断是否还需要填充为否的时候才证明可以填充
      if (!fillSeatList?.length) {
        return fillSeats;
      }
    } else {
      return fillSeats;
    }
  }
};

// 清理字符串，移除所有非字母数字及汉字的字符
function cleanString(str) {
  return str.replace(/[^\w\u4e00-\u9fa5]/g, "");
}

// 找出重复字符及数量
function findMostRepeatedChars(str1, str2) {
  try {
    // 将字符串转换为小写，并清理掉特殊字符
    str1 = cleanString(str1.toLowerCase());
    str2 = cleanString(str2.toLowerCase());

    // 统计 str1 中每个字符的出现次数
    const charCount1 = {};
    for (const char of str1) {
      if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(char)) {
        // 只统计英文、数字、汉字
        charCount1[char] = (charCount1[char] || 0) + 1;
      }
    }

    // 统计 str2 中每个字符的出现次数
    const charCount2 = {};
    for (const char of str2) {
      if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(char)) {
        // 只统计英文、数字、汉字
        charCount2[char] = (charCount2[char] || 0) + 1;
      }
    }

    // 找出在两个字符串中都出现的字符，并计算重复次数
    const repeatedChars = {};
    let totalRepeatedCount = 0; // 记录所有重复字符的总重复次数，用于计算相似度

    for (const char in charCount1) {
      if (charCount2[char]) {
        const minCount = Math.min(charCount1[char], charCount2[char]);
        repeatedChars[char] = minCount;
        totalRepeatedCount += minCount;
      }
    }

    // 找出重复次数最多的字符
    let maxCount = 0;
    let mostRepeatedChars = [];
    for (const char in repeatedChars) {
      if (repeatedChars[char] > maxCount) {
        maxCount = repeatedChars[char];
        mostRepeatedChars = [char];
      } else if (repeatedChars[char] === maxCount) {
        mostRepeatedChars.push(char);
      }
    }

    // 计算相似度，分母改为两个字符串中较长的那个字符串的长度
    const maxLength = Math.max(str1.length, str2.length);
    const similarity = totalRepeatedCount / maxLength;

    return {
      chars1: mostRepeatedChars,
      count1: maxCount,
      totalRepeated: totalRepeatedCount,
      maxLength,
      similarity: similarity.toFixed(4) * 10000
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      chars1: [],
      count1: 0,
      totalRepeated: 0,
      maxLength: 0,
      similarity: 0
    };
  }
}

export {
  findMostRepeatedChars, // 找出重复字符及数量
  adjustSeats, // 获取需要帮助锁定的座位
  calculateMarkup, // 格式化获取真实加价金额
  roundToHalf, // 按0.5向上取整
  removeLeadingZeros,
  isDateInCurrentMonth, // 判断某个日期是否在当月内：YYYY-MM-DD
  getCurrentFormattedDateTime, // 获取当前时间：YYYY-MM-DD HH:MM:SS
  getPreviousDay, // 获取上一天
  formatTimeOfTime, // 格式化时间 YYYY-MM-DD HH:mm:ss
  formatTimeOfDay, // 格式化日期 YYYY-MM-DD
  getCurrentDay, // 获取当前天 YYYY-MM-DD
  getCurrentTime, // 获取当前时间 YYYY-MM-DD HH:mm:ss
  parseExcel, // 解析xlsx文件
  createExcelDown, // 生成excel文件并下载
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
  getTargetCinemaCommon, // 统一获取目标影院方法
  // getCinemaId, // 根据订单name获取影院id(主要用于sfc系统)
  // getCinemaIdByLma, // 根据订单name获取影院id(主要用于lma系统)
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
