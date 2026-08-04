// 导入 ExcelJS 库
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import axios from "axios";
import * as CryptoJS from "crypto-js";
import QRCode from "qrcode";
import svApi from "@/api/sv-api";
import Decimal from "decimal.js";

import {
  GET_UME_LIST,
  GET_APP_INFO,
  GET_USABLE_APP_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST,
  IN_RULE_LIST
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

import { useCinemaList } from "@/store/cinemaList.js";
const cinemaListStore = useCinemaList();

import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// console.log("user_id", user_id);

import { dictTable, nameMatchTable } from "@/store/dictTable";
const dictStore = dictTable();
const nameMatchStore = nameMatchTable();

import { getToken } from "@/utils/auth";

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

// 获取下一天
function getNextDayTime(dateStr = getCurrentDay()) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = padZero(date.getMonth() + 1);
  const day = padZero(date.getDate());

  return `${year}-${month}-${day} 00:00:00`;
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
  let appFlag = cinemaCodeMatchObj.getCinemaAppFlag(item)?.app_name;
  // 万象可以不用了，只用万象h5
  if (appFlag === "wanxiang") {
    appFlag = "wanxiangh5";
  }
  return appFlag;
};
/**
 * 获取影院标识
 * @param {Object} item - 订单信息
 * @param {boolean} isSplitUser - 是否分用户
 * @returns {string} 影院标识
 */
const getCinemaFlag = (item, isSplitUser = true) => {
  const app_name = newGetCinemaFlagFun(item);
  if (!app_name) return;
  // 禁用指定系列报价（多选）：读取 disableAppTypeList 数组，命中当前影线 app_type_code 则跳过报价
  let disableAppTypeListValue = window.localStorage.getItem("disableAppTypeList");
  let disableAppTypeList = [];
  try {
    disableAppTypeList = disableAppTypeListValue
      ? JSON.parse(disableAppTypeListValue)
      : [];
  } catch (error) {
    disableAppTypeList = [];
  }
  // 兼容旧版单开关：h5umeIsClose=1 视为禁用了 ume_h5
  if (
    window.localStorage.getItem("h5umeIsClose") == 1 &&
    !disableAppTypeListValue
  ) {
    disableAppTypeList = ["ume_h5"];
  }
  if (
    disableAppTypeList.includes(GET_APP_INFO(app_name)?.app_type_code)
  ) {
    return;
  }
  let rule = tokens?.userInfo?.rule;
  // 内部角色影院禁用，主要是控制影院是否进行报价
  if (IN_RULE_LIST.includes(rule) && !GET_USABLE_APP_LIST()?.["" + app_name]) {
    return;
  }

  // 进行登录信息过滤
  const isLogin = isLoginByAppName(app_name, isSplitUser);
  if (isLogin) return app_name;
};

// 获取影院code
const getCinemaCode = item => {
  const cinema_code =
    cinemaCodeMatchObj.getCinemaAppFlag(item)?.plat_cinema_code;
  return cinema_code;
};

window.getCinemaFlag = getCinemaFlag;
window.getCinemaCode = getCinemaCode;
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

/**
 * 某个影院是否登录
 * @param {string} app_name - 影院标识
 * @param {boolean} isSplitUser - 是否分用户
 * @returns {boolean} 是否登录
 */
const isLoginByAppName = (app_name, isSplitUser = true) => {
  let user_id = tokens?.userInfo?.user_id;
  let loginInfoList = window.localStorage.getItem("loginInfoList");
  if (loginInfoList) {
    loginInfoList = JSON.parse(loginInfoList);
    loginInfoList = loginInfoList.filter(item =>
      !item.link_user_id || !isSplitUser ? true : item.link_user_id == user_id
    );
    const isLogin = !!loginInfoList.find(item => item.app_name === app_name);
    return isLogin;
  }
};

/**
 * 获取影院登录信息列表
 * @param {boolean} isSplitUser - 是否分用户
 * @returns {Array} 影院登录信息列表
 */
const getCinemaLoginInfoList = (isSplitUser = true) => {
  let user_id = tokens?.userInfo?.user_id;
  const phone = tokens?.userInfo?.phone;
  // console.log("user_id", tokens?.userInfo?.user_id, phone);
  let loginInfoList = window.localStorage.getItem("loginInfoList");
  if (loginInfoList) {
    loginInfoList = JSON.parse(loginInfoList);
    // 非研发账号过滤掉研发登录信息
    if (tokens?.userInfo?.user_id != 1) {
      // 重启华熙有张卡需要使用掉（100面额）
      loginInfoList = loginInfoList.filter(item =>
        item.app_name != "jinyiguangmei" ? item.mobile != "15237761435" : true
      );
    }
    if (user_id == 1) {
      user_id = 9;
      // user_id = 10;
    }
    loginInfoList = loginInfoList.filter(item =>
      !item.link_user_id || !isSplitUser ? true : item.link_user_id == user_id
    );
  }
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
  msgType, // 消息类型 1-登录失效 2-出票队列重复 3-黑名单券更新 5-密码输入错误 6-卡号出满提醒 9-日志上传异常 11-出票队列消息未确认
  expirePhone, // 失效手机号
  cardNoByPwdError, // 密码错误卡号
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
    supplier_end_price,
    last_fail_phone // 最后失败的手机号（出票失败时使用的账号）
  } = orderInfo || {};
  const url = "https://wxpusher.zjiecode.com/api/manager/message/send";
  const headers = {
    "content-type": "application/json;charset=UTF-8",
    token: dictStore.dictInfo.wxpusherToken
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
  最后失败手机号：${last_fail_phone || "-"};<br/>
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
  } else if (msgType === 5) {
    summary = "卡号密码错误请检查";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    平台：${plat_name}; <br/>
    单号：${order_number}; <br/>
    影院：${app_name || orderInfo?.app_name}; <br/>
    提示：${failReason};<br/>
    卡号：${cardNoByPwdError};<br/>
    </p>`;
  } else if (msgType === 6) {
    summary = "卡号出满请检查月使用量";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    平台：${plat_name}; <br/>
    单号：${order_number}; <br/>
    影院：${app_name || orderInfo?.app_name}; <br/>
    提示：${failReason};<br/>
    卡号：${cardNoByPwdError};<br/>
    </p>`;
  } else if (msgType === 7) {
    summary = plat_name + "平台登录失效";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    失效手机号：${expirePhone}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  } else if (msgType === 8) {
    summary = "号内券临期提醒";
    // 将换行符替换为 HTML 换行标签
    const formattedTransferTip = transferTip.replace(/\n/g, "<br/>");
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    提示：${formattedTransferTip};<br/>
    </p>`;
  } else if (msgType === 9) {
    summary = "日志上传异常";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  } else if (msgType === 10) {
    summary = "服务器券临期提醒";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    提示：${transferTip};<br/>
    </p>`;
  } else if (msgType === 11) {
    summary = "出票队列消息未确认";
    content = `<p>
    时间：${getCurrentTime()}; <br/>
    用户：${userInfo.name}; <br/>
    平台：${plat_name}; <br/>
    单号：${order_number}; <br/>
    城市：${city_name}; <br/>
    影院标识：${app_name || orderInfo?.app_name}; <br/>
    影院名称：${cinema_name}; <br/>
    影厅：${hall_name}; <br/>
    片名：${film_name}; <br/>
    场次：${show_time}; <br/>
    座位：${lockseat}; <br/>
    中标价：${supplier_end_price}; <br/>
    ${transferTip};<br/>
    </p>`;
  }

  const messageData = {
    appId: 80173,
    topicIds: [],
    contentType: 2,
    verifyPay: false,
    uids: [userInfo.wxCode],
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

    // // 将十六进制字符串转换为CryptoJS字节数组
    // const encryptedHexStr = CryptoJS.enc.Hex.parse(str);

    // // 将字节数组转换为Base64字符串
    // const srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr);

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
    const [, cinema_id] = matchInfo?.app_cinema_code?.split("_") || [];
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
    appOfferRuleList = appOfferRuleList.filter(item => id == item.id);
    return appOfferRuleList?.[0];
  }
};

// 报价规则匹配
const offerRuleMatch = (order, logger) => {
  // order = order || window.order;
  try {
    console.warn("匹配报价规则开始", order);
    const {
      city_name,
      // cinema_name,
      cinema_code,
      hall_name,
      film_name,
      show_time,
      ticket_num,
      plat_name,
      appName,
      app_name // 该字段主要是为了方便测试
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
                : "",
            ...(itemA.platOfferList?.find(
              item => item.platName === plat_name
            ) || {})
          };
        });
    }

    // 1、获取启用的规则列表（只有满足规则才报价）
    let useRuleList = appOfferRuleList.filter(
      item =>
        ["1", "3"].includes(item.status) &&
        item.shadowLineName == shadowLineName
    );
    if (!useRuleList.length) {
      logger.errorSave("按启用状态筛选后，报价规则为空");
      return;
    }
    console.log("影线启用的规则列表", useRuleList);
    // 1、是否同步平台规则走平台报价过滤
    // fixedOfferToPlatList：允许固定报价是否走平台的平台类型数组;
    // const fixedOfferToPlatList =
    //   dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];
    // useRuleList = useRuleList.filter(
    //   item =>
    //     !(
    //       item.isSyncPlat == 1 &&
    //       item.platRuleId &&
    //       item.offerType == 1 &&
    //       fixedOfferToPlatList.includes(item.platName)
    //     )
    // );
    // if (!useRuleList.length) {
    //   logger.errorSave("按固定报价走平台报价筛选后，报价规则为空");
    //   return;
    // }

    let useOfferRuleList = useRuleList.filter(item =>
      !item.allow_offer_time
        ? true
        : +new Date(item.allow_offer_time) < +new Date()
    );
    if (!useOfferRuleList.length) {
      logger.errorSave("按允许报价时间筛选后，报价规则为空");
      return;
    }
    console.log("按允许报价时间筛选后的规则列表", useOfferRuleList);
    // 2、匹配院线
    if (order.app_name == "wanda") {
      const wandaCinemaList = cinemaListStore.wandaCinemaList || [];
      const matchInfo = cinemaCodeMatchObj.getCinemaMatchInfo(
        cinema_code,
        shadowLineName
      );
      const app_cinema_code = matchInfo?.app_cinema_code;
      const [city_id, store_id] = (app_cinema_code || "").split("_");
      const targetCinema = wandaCinemaList.find(
        item => item.store_id == store_id && item.city_id == city_id
      );
      // 是否直营
      const is_direct = targetCinema?.is_direct;
      useOfferRuleList = useOfferRuleList.filter(item => {
        if (is_direct === 1 && item.cinema_group) {
          return item.cinema_group.includes("万达");
        }
        if (is_direct === 0 && item.cinema_group) {
          return item.cinema_group.includes("万达特许");
        }
        return true;
      });
    }
    // 3、匹配城市
    let cityRuleList = useOfferRuleList.filter(item => {
      if (!item.includeCityNames.length && !item.excludeCityNames.length) {
        return true;
      }
      if (item.includeCityNames.length) {
        const isInclude = item.includeCityNames.join().indexOf(city_name) > -1;
        console.log(
          "是否包含城市",
          isInclude,
          city_name,
          item.includeCityNames
        );
        return isInclude;
      }
      if (item.excludeCityNames.length) {
        const isExclude =
          item.excludeCityNames.join().indexOf(city_name) === -1;
        console.log(
          "是否排除城市",
          isExclude,
          city_name,
          item.excludeCityNames
        );
        return isExclude;
      }
    });
    if (!cityRuleList.length) {
      logger.errorSave("按城市筛选后，报价规则为空");
      return;
    }
    console.log("按城市筛选后的规则列表", cityRuleList);
    // 是否记录影院匹配日志
    const isSaveCinemaMatchLog =
      dictStore.dictInfo?.isRecordCinemaMatchLog == 1;
    // 4、匹配影院（优先按 app_cinema_code 匹配，名称兜底兼容旧规则）
    let cinemaRuleList = cityRuleList.filter(item => {
      const hasNameInclude =
        item.includeCinemaNames && item.includeCinemaNames.length;
      const hasNameExclude =
        item.excludeCinemaNames && item.excludeCinemaNames.length;
      const hasCodeInclude = item.includeCinemaCodes;
      const hasCodeExclude = item.excludeCinemaCodes;

      // 没有任何影院限制时直接通过
      if (
        !hasNameInclude &&
        !hasNameExclude &&
        !hasCodeInclude &&
        !hasCodeExclude
      ) {
        return true;
      }

      // 1、优先按 app_cinema_code 匹配，避免名称变更导致失败
      try {
        const matchInfo = cinemaCodeMatchObj.getCinemaMatchInfo(
          cinema_code,
          shadowLineName
        );
        const app_cinema_code = matchInfo?.app_cinema_code;
        if (app_cinema_code && (hasCodeInclude || hasCodeExclude)) {
          if (hasCodeInclude) {
            const isInclude = item.includeCinemaCodes
              ?.split(",")
              ?.includes(app_cinema_code);
            isSaveCinemaMatchLog &&
              logger?.infoSave("按影院code匹配包含规则", {
                isInclude,
                app_cinema_code,
                includeCinemaCodes: item.includeCinemaCodes
              });
            return isInclude;
          }
          if (hasCodeExclude) {
            const isExclude = item.excludeCinemaCodes
              ?.split(",")
              ?.includes(app_cinema_code);
            isSaveCinemaMatchLog &&
              logger?.infoSave("按影院code匹配排除规则", {
                isExclude,
                app_cinema_code,
                excludeCinemaCodes: item.excludeCinemaCodes
              });
            return !isExclude;
          }
        }
      } catch (err) {
        console.warn("按 app_cinema_code 匹配影院规则异常", err);
      }

      // 2、兜底：按影院名称匹配（旧规则兼容）
      if (hasNameInclude) {
        console.error("按影院名称匹配规则，可能存在风险");
        const isInclude = cinemaMatchHandle({
          app_name: shadowLineName,
          plat_cinema_code: cinema_code,
          cinema_name_list: item.includeCinemaNames
        });
        isSaveCinemaMatchLog &&
          logger?.infoSave("按影院名称匹配包含规则", {
            isInclude,
            plat_cinema_code: cinema_code,
            cinema_name_list: item.includeCinemaNames
          });
        return isInclude;
      }
      if (hasNameExclude) {
        console.error("按影院名称匹配规则，可能存在风险");
        const isExclude = cinemaMatchHandle({
          app_name: shadowLineName,
          plat_cinema_code: cinema_code,
          cinema_name_list: item.excludeCinemaNames
        });
        isSaveCinemaMatchLog &&
          logger?.infoSave("按影院名称匹配排除规则", {
            isExclude,
            plat_cinema_code: cinema_code,
            cinema_name_list: item.excludeCinemaNames
          });
        return !isExclude;
      }
    });
    if (!cinemaRuleList.length) {
      logger.errorSave("按影院筛选后，报价规则为空");
      return;
    }
    console.log("按影院筛选后的规则列表", cinemaRuleList);
    // 5、匹配影厅
    let hallRuleList = cinemaRuleList.filter(item => {
      if (!item.includeHallNames.length && !item.excludeHallNames.length) {
        return true;
      }
      if (item.includeHallNames.length) {
        let isInclude = item.includeHallNames.some(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) > -1;
        });
        console.log(
          "是否包含影厅",
          isInclude,
          hall_name,
          item.includeHallNames
        );
        return isInclude;
      }
      if (item.excludeHallNames.length) {
        let isInclude = item.excludeHallNames.some(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) > -1;
        });
        let isExclude = !isInclude;
        console.log(
          "是否排除影厅",
          isInclude,
          hall_name,
          item.excludeHallNames
        );
        return isExclude;
      }
    });
    if (!hallRuleList.length) {
      logger.errorSave("按影厅筛选后，报价规则为空");
      return;
    }
    console.log("按影厅筛选后的规则列表", hallRuleList);
    // 6、匹配影片
    let filmRuleList = hallRuleList.filter(item => {
      if (!item.includeFilmNames.length && !item.excludeFilmNames.length) {
        return true;
      }
      if (item.includeFilmNames.length) {
        let isInclude = item.includeFilmNames.some(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) ===
            convertFullwidthToHalfwidth(filmName)
          );
        });
        console.log(
          "是否包含影片",
          isInclude,
          film_name,
          item.includeFilmNames
        );
        return isInclude;
      }
      if (item.excludeFilmNames.length) {
        let isInclude = item.excludeFilmNames.some(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) ===
            convertFullwidthToHalfwidth(filmName)
          );
        });
        let isExclude = !isInclude;
        console.log(
          "是否排除影片",
          isInclude,
          film_name,
          item.excludeFilmNames
        );
        return isExclude;
      }
    });
    if (!filmRuleList.length) {
      logger.errorSave("按影片筛选后，报价规则为空");
      return;
    }
    console.log("按影片筛选后的规则列表", filmRuleList);
    // 7、匹配座位数限制
    let seatRuleList = filmRuleList.filter(item => {
      if (!item.seatNum) {
        return true;
      }
      const isPass = Number(item.seatNum) >= Number(ticket_num);
      console.log("座位数是否满足", isPass, ticket_num, item.seatNum);
      return isPass;
    });
    if (!seatRuleList.length) {
      logger.errorSave("按座位数筛选后，报价规则为空");
      return;
    }
    console.log("按座位数筛选后的规则列表", seatRuleList);
    // 9、匹配星期几
    let weekRuleList = seatRuleList.filter(item => {
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
        const isPass = item.weekDay.includes(dayOfWeek);
        console.log("星期几是否满足", isPass, dayOfWeek, item.weekDay);
        return isPass;
      }
      return true;
    });
    if (!weekRuleList.length) {
      logger.errorSave("按星期几筛选后，报价规则为空");
      return;
    }
    console.log("按星期几筛选后的规则列表", weekRuleList);
    // 10、匹配会员日
    let memberDayRuleList = weekRuleList.filter(item => {
      const day = show_time.split(" ")[0].split("-")[2];
      if (item.memberDay) {
        const isPass = item.memberDay == day;
        console.log("会员日是否满足", isPass, day, item.memberDay);
        return isPass;
      }
      return true;
    });
    if (!memberDayRuleList.length) {
      logger.errorSave("按会员日筛选后，报价规则为空");
      return;
    }
    console.log("按会员日筛选后的规则列表", memberDayRuleList);
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

/**
 * 将单条日志的 info 转为可 JSON 序列化的纯数据，去掉循环引用及不宜上送字段（如 logger），
 * 避免 logUpload / axios 整批失败。
 */
const sanitizeLogInfoForUpload = info => {
  if (info === undefined) return undefined;
  const omitKeys = new Set(["logger", "logList", "parent"]);
  const seen = new WeakSet();
  const walk = (v, depth) => {
    if (depth > 40) return "[MaxDepth]";
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "bigint") return String(v);
    if (t === "function" || t === "symbol") return `[${t}]`;
    if (t !== "object") return String(v);
    if (v instanceof Error) {
      return {
        name: v.name,
        message: String(v.message),
        stack: typeof v.stack === "string" ? v.stack.slice(0, 12000) : ""
      };
    }
    if (typeof v?.nodeType === "number") return "[DOMNode]";
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) {
      const out = v.map(entry => walk(entry, depth + 1));
      seen.delete(v);
      return out;
    }
    const out = {};
    for (const k of Object.keys(v)) {
      if (omitKeys.has(k)) {
        out[k] = "[Omitted]";
        continue;
      }
      try {
        out[k] = walk(v[k], depth + 1);
      } catch {
        out[k] = "[Unreadable]";
      }
    }
    seen.delete(v);
    return out;
  };
  try {
    return walk(info, 0);
  } catch {
    return { _sanitizeFailed: true };
  }
};

/**
 * 日志上传配置常量
 * @property {number} BATCH_SIZE - 每批上传的日志数量，避免单次数据量过大导致超时
 * @property {number} MAX_RETRIES - 超时重试最大次数
 * @property {number} INITIAL_RETRY_DELAY - 初始重试延迟(毫秒)
 * @property {number} RETRY_MULTIPLIER - 重试延迟倍数（指数退避）
 * @property {number} WECHAT_PUSH_COOLDOWN - 微信消息推送冷却时间(毫秒)，避免频繁推送骚扰
 * @note TIMEOUT 已在 sv-request.js 中配置为30秒，此处不再重复定义
 */
const LOG_UPLOAD_CONFIG = {
  BATCH_SIZE: 50,
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  RETRY_MULTIPLIER: 2,
  WECHAT_PUSH_COOLDOWN: 60000
};

/**
 * 微信消息推送时间戳，用于限流控制
 */
let lastWechatPushTime = 0;

/**
 * 判断是否可以发送微信消息（限流控制）
 * @returns {boolean} - true=可以发送，false=冷却中
 */
const canSendWechatMessage = () => {
  const now = Date.now();
  if (now - lastWechatPushTime >= LOG_UPLOAD_CONFIG.WECHAT_PUSH_COOLDOWN) {
    lastWechatPushTime = now;
    return true;
  }
  return false;
};

/**
 * 带指数退避重试的日志上传函数
 * @param {Object} params - 上传参数
 * @param {number} retries - 当前重试次数（默认0，首次调用）
 * @returns {Promise} - 上传结果
 */
const logUploadWithRetry = async (params, retries = 0) => {
  // 计算重试延迟：首次1秒，之后指数增长（1s → 2s → 4s）
  const delay =
    LOG_UPLOAD_CONFIG.INITIAL_RETRY_DELAY *
    Math.pow(LOG_UPLOAD_CONFIG.RETRY_MULTIPLIER, retries);

  // 非首次调用时，等待延迟后再重试
  if (retries > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  try {
    // 使用封装的API进行上传，支持通过axios配置传递超时参数
    const res = await svApi.addTicketOperaLog(params);
    return res;
  } catch (error) {
    // 仅对超时错误进行重试
    if (
      retries < LOG_UPLOAD_CONFIG.MAX_RETRIES &&
      (error.code === "ECONNABORTED" ||
        (error.message && error.message.includes("timeout")))
    ) {
      console.warn(`日志上传超时，第 ${retries + 1} 次重试...`);
      return logUploadWithRetry(params, retries + 1);
    }
    // 非超时错误或达到最大重试次数，直接抛出
    throw error;
  }
};

/**
 * 日志上传主函数（分批上传 + 重试 + 微信消息限流）
 * @param {Object} order - 订单信息（包含plat_name, app_name, order_number, type）
 * @param {Array} logList - 待上传的日志列表
 */
const logUpload = async (order, logList) => {
  // 日志列表为空，直接返回
  if (!logList.length) return;

  const { order_number, app_name, plat_name, type = 3 } = order;
  let hasError = false; // 是否发生错误
  let lastError = null; // 最后一次错误信息

  // 循环分批上传日志，直到全部上传完成或发生错误
  while (logList.length > 0) {
    // 计算本批上传数量（不超过配置的批大小）
    const batchSize = Math.min(logList.length, LOG_UPLOAD_CONFIG.BATCH_SIZE);
    const batch = logList.slice(0, batchSize);

    try {
      // 预处理日志数据：格式化错误信息、清理不可序列化内容
      const log_list = batch.map(item => {
        let info = item.info;
        if (info != null && typeof info === "object" && "error" in info) {
          info = {
            ...info,
            error: formatErrInfo(info.error)
          };
        }
        return {
          ...item,
          info: sanitizeLogInfoForUpload(info)
        };
      });

      // 移除特殊表情符号，避免后端入库失败
      const cleanedLogList = JSON.stringify(log_list).replace(
        /[\u{1F600}-\u{1F64F}]/gu,
        ""
      );

      // 调用带重试的上传函数
      await logUploadWithRetry({
        plat_name: plat_name || "",
        app_name: app_name || "",
        order_number: order_number || "",
        type,
        log_list: JSON.parse(cleanedLogList)
      });

      // 上传成功后，从日志列表中移除已上传的日志
      logList.splice(0, batchSize);
    } catch (error) {
      console.error("日志上送异常", error);
      hasError = true;
      lastError = error;
      break; // 发生错误时停止继续上传
    }
  }

  // 仅在发生错误且不在冷却期时发送微信通知
  if (hasError && canSendWechatMessage()) {
    try {
      await sendWxPusherMessage({
        msgType: 9, // 日志上传异常类型
        transferTip: formatErrInfo(lastError)
      });
    } catch (pushError) {
      console.error("微信消息推送失败", pushError);
    }
  }
};

// 模拟延时
const mockDelay = delayTime => {
  if (delayTime) {
    return window.mockDelayHandle(delayTime);
  }
};
window.mockDelay = mockDelay;

// 定时任务：每天发送临期券通知
const setupExpireCouponNotification = () => {
  let pushInterval = dictStore.dictInfo.expireCouponMsgPushInterval;
  console.log("临期券通知推送间隔（小时）", pushInterval);
  if (pushInterval <= 0) {
    return;
  }

  // 检查是否需要发送通知
  const checkAndSend = async () => {
    try {
      // 获取临期券数据
      const params = {
        isNeedTotalNum: 0,
        queryFields: "id,app_name,quan_value,quan_flag,quanStockList"
      };

      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];

      // 解析券库存数据
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
      });

      // 过滤出临期券（15天内过期且有库存）
      let expireQuanList = quanTypeList
        .map(item =>
          item.quanStockList.map(itemA => ({
            ...itemA,
            app_name: item.app_name,
            quan_value: item.quan_value,
            quan_flag: item.quan_flag
          }))
        )
        .flat()
        .filter(
          item =>
            item.real_quan_stock > 0 &&
            item.endDateTime &&
            +new Date(item.endDateTime) - +new Date() < 15 * 24 * 60 * 60 * 1000
        );

      // 如果有临期券，发送通知
      if (expireQuanList.length > 0) {
        // 统计各应用的临期券数量
        const appExpireMap = {};
        expireQuanList.forEach(item => {
          const key = `${item.app_name}: ${item.quan_flag}`;
          if (!appExpireMap[key]) {
            appExpireMap[key] = 0;
          }
          appExpireMap[key] += item.real_quan_stock;
        });

        // 构建通知内容
        let expireDetails = Object.entries(appExpireMap)
          .map(([appInfo, count]) => `${appInfo}: ${count}张`)
          .join("<br/>");

        // 发送通知
        await sendWxPusherMessage({
          msgType: 8, // 临期券提醒
          transferTip: `您有 ${expireQuanList.length} 种临期券即将过期，请及时使用<br/>${expireDetails}`,
          expirePhone: expireQuanList.length // 这里用 expirePhone 字段来传递临期券种类数量
        });

        console.log("临期券通知发送成功", expireQuanList.length, "种临期券");
      } else {
        console.log("暂无临期券");
      }
    } catch (error) {
      console.error("临期券通知发送失败", error);
    }
  };

  // 每天执行一次（24小时）
  const dailyInterval = pushInterval * 60 * 60 * 1000;

  // 立即执行一次
  checkAndSend();

  // 设置定时任务
  const intervalId = setInterval(checkAndSend, dailyInterval);

  // 返回清理函数
  return () => {
    clearInterval(intervalId);
    console.log("临期券通知定时任务已清理");
  };
};

// 导出函数
window.setupExpireCouponNotification = setupExpireCouponNotification;
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
function roundToHalf(num, step, direction = "up") {
  if (typeof step !== "number" || step <= 0) {
    return NaN;
  }

  // 对于已知步进值 0.5 和 0.1，使用特定方法
  if (step === 0.5 || step === 0.1) {
    // 检查是否是整数倍
    if ((num * 1000) % (step * 1000) == 0) {
      return num;
    }

    // 使用更简单的方法处理已知步进值
    const factor = step === 0.5 ? 2 : 10;
    const scaledNum = num * factor;

    let roundedScaledNum;
    if (direction === "up") {
      roundedScaledNum = Math.ceil(scaledNum);
    } else if (direction === "down") {
      roundedScaledNum = Math.floor(scaledNum);
    } else {
      roundedScaledNum = Math.round(scaledNum);
    }

    return roundedScaledNum / factor;
  }
}

/**
 * 根据规则列表计算加价金额
 * @param {number} comparePrice - 比较价格
 * @param {number} memberPrice - 会员价格
 * @param {string[]} ruleList - 规则列表
 * @returns {number} - 加价金额
 */
function calculateMarkup(comparePrice, memberPrice, ruleList) {
  let qujianPrice = comparePrice.split("-");
  let includesPrice = comparePrice.split(",");
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
      case "<>":
        if (memberPrice >= qujianPrice[0] || memberPrice <= qujianPrice[1]) {
          return parseFloat(amount);
        }
        break;
      case "!<>":
        if (memberPrice < qujianPrice[0] || memberPrice > qujianPrice[1]) {
          return parseFloat(amount);
        }
        break;
      case "=||":
        if (includesPrice.includes(memberPrice + "")) {
          return parseFloat(amount);
        }
        break;
      case "!=||":
        if (!includesPrice.includes(memberPrice + "")) {
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
function findMostRepeatedChars(str1, str2, fieldType) {
  try {
    if (fieldType == "hall_name") {
      str1 = str1.replace(/\（[^)]*\）/g, "").replace(/\([^)]*\)/g, "");
      str2 = str2.replace(/\（[^)]*\）/g, "").replace(/\([^)]*\)/g, "");
    }
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

// 判断sfc是否是次日（源码）
const isNextDay = (show_date, start_time, app_type) => {
  let num = 1;
  if (app_type === "sfc") {
    num = 5;
  } else if (app_type === "lma") {
    num = 3;
  } else {
    return;
  }
  var i = (show_date = show_date.replace(/-/g, "/")) + " " + start_time + ":00",
    r = (new Date(i).getTime(), parseInt(start_time.split(":")[0]));
  return r >= 0 && r <= num;
};

// 获取日期
function classifyDate(inputStr) {
  // 解析输入日期
  const inputDate = new Date(inputStr.replace(" ", "T"));

  // 验证日期有效性
  if (isNaN(inputDate.getTime())) {
    return null;
  }

  // 获取当前日期的午夜时间
  const today = new Date();
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  // 获取输入日期的午夜时间
  const inputMidnight = new Date(
    inputDate.getFullYear(),
    inputDate.getMonth(),
    inputDate.getDate()
  );

  // 计算天数差
  const diffTime = inputMidnight.getTime() - todayMidnight.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 判断返回结果
  switch (diffDays) {
    case 0:
      return "今天";
    case 1:
      return "明天";
    case 2:
      return "后天";
    default:
      return null;
  }
}
// 绘制虚线
let drawDashedLine = (ctx, x1, y1, x2, y2, color) => {
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = color || "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
};

/**
 * 将Canvas转换为Blob对象
 * @param {HTMLCanvasElement} canvas - 要转换的Canvas元素
 * @param {string} [mimeType="image/png"] - 图片MIME类型
 * @param {number} [quality=0.92] - 图片质量 (0-1)
 * @returns {Promise<Blob>} 返回Blob对象
 */
const canvasToBlob = (canvas, mimeType = "image/png", quality = 0.92) => {
  return new Promise((resolve, reject) => {
    // 检查canvas有效性
    if (!(canvas instanceof HTMLCanvasElement)) {
      reject(new Error("参数必须是Canvas元素"));
      return;
    }

    // 使用canvas.toBlob方法
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas转换Blob失败"));
        }
      },
      mimeType,
      quality
    );
  });
};

// 生成电影票图片
let generateTicketImage = async ticketInfo => {
  // const {
  //   film_name = "侏罗纪世界:重生",
  //   cinema_name = "SFC上影影城(徐汇日月光店)",
  //   show_time = "2025-07-07 13:05",
  //   hall_name = "3号激光厅",
  //   lockseat = "11排10座 11排11座 11排12座",
  //   qrcode = "684869246542"
  // } = ticketInfo || {};
  if (!ticketInfo) return;
  const { film_name, cinema_name, show_time, hall_name, lockseat, qrcode } =
    ticketInfo || {};
  const canvas = document.createElement("canvas");
  const width = 315;
  const height = 560;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // 清除画布并绘制白色背景
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  // 绘制顶部装饰线（虚线）
  drawDashedLine(ctx, 0, 17, width, 17, "#1890ff");
  // 设置文本左对齐
  ctx.textAlign = "left";
  // 绘制电影名称
  ctx.fillStyle = "#1A237E";
  ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
  const filmNameX = 15;
  const filmNameY = 50; // 在装饰线下方
  ctx.fillText(film_name, filmNameX, filmNameY);

  // 绘制影院名称
  ctx.fillStyle = "#2196F3";
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
  const cinemaY = filmNameY + 35; // 电影名称下方40像素
  ctx.fillText(cinema_name, filmNameX, cinemaY);
  // 绘制放映时间
  let yPos = cinemaY + 18; // 影院名称下方40像素

  // 绘制"今天"标签
  const dayText = classifyDate(show_time);
  if (dayText) {
    // ctx.fillStyle = "#4FC3F7";
    // ctx.fillRect(filmNameX, yPos, 50, 30); // 使用filmNameX保持左对齐
    // ctx.fillStyle = "#ffffff";
    // ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    // ctx.textAlign = "center";
    // // 注意：这里x坐标是标签中心，y坐标是文字基线
    // ctx.fillText(dayText, filmNameX + 25, yPos + 20);
    // 绘制"今天"标签
    const labelWidth = 50;
    const labelHeight = 26;
    const cornerRadius = 5; // 圆角半径
    ctx.fillStyle = "#4FC3F7";
    // 使用roundRect绘制圆角矩形
    ctx.beginPath();
    ctx.roundRect(filmNameX, yPos, labelWidth, labelHeight, cornerRadius);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; // 垂直居中，这样我们只需要计算垂直中心位置
    // 文字位置：水平居中在标签内，垂直居中
    ctx.fillText(dayText, filmNameX + labelWidth / 2, yPos + 16);
  }

  // 时间文字（左对齐，在标签右侧）
  ctx.fillStyle = "#333333";
  ctx.font = '17px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(show_time.replace(/-/g, "/"), filmNameX + 60, yPos + 16);

  // 绘制影厅信息
  yPos += 52;
  ctx.fillStyle = "#333333";
  ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(hall_name, filmNameX, yPos);

  // 绘制座位信息
  yPos += 23;
  ctx.textAlign = "center";
  const seats = lockseat.split(" ");
  // 座位多时调整大小和间距
  let fontSize = 16;
  if (seats.length > 3) {
    fontSize = 14;
  }
  ctx.font = `${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const seatWidth = seats.length > 3 ? 70 : 80;
  let mgPx = seats.length > 3 ? 4 : 10;
  const totalWidth = seats.length * seatWidth + (seats.length - 1) * mgPx;
  let xStart = (width - totalWidth) / 2;
  xStart = 15;
  seats.forEach((seat, index) => {
    ctx.fillStyle = "#E3F2FD";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(xStart, yPos, seatWidth, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6594CC";
    ctx.fillText(seat, xStart + seatWidth / 2, yPos + 20);
    xStart += seatWidth + mgPx;
  });

  // 绘制取票码和状态
  yPos += 40;
  ctx.fillStyle = "#333333";
  ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("取票码：", filmNameX, yPos + 20);
  ctx.fillText(qrcode, filmNameX + 60, yPos + 20);
  ctx.fillStyle = "#13ce66";
  ctx.fillText("已出票", width - 60, yPos + 20);
  // 绘制分隔线
  yPos += 40;
  drawDashedLine(ctx, filmNameX, yPos, width - filmNameX, yPos, "#e0e0e0");
  // 生成二维码
  try {
    const qrSize = 180;
    const qrTop = yPos + 20; // 分隔线下方20像素
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, qrcode, {
      width: qrSize,
      margin: 0,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    });
    // 居中绘制二维码
    ctx.drawImage(qrCanvas, (width - qrSize) / 2, qrTop, qrSize, qrSize);
    // 绘制票数信息
    ctx.textAlign = "center";
    ctx.fillStyle = "#1890ff";
    ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`${seats.length}张票`, width / 2, qrTop + qrSize + 25);
    // const imgInfo = canvas.toDataURL("image/png");
    // console.log("imgInfo", imgInfo);
    // return imgInfo;
    const blob = await canvasToBlob(canvas, "image/png", 0.9);
    console.log("blob", blob);
    return blob;
  } catch (error) {
    console.error("生成二维码失败:", error);
    return null;
  }
};

window.generateTicketImage = generateTicketImage;

// 影划算图片校验
const yinghuasuanCheckImg = async data => {
  try {
    const { logList, logger, ...params } = data;
    const url =
      "https://merchant-api.yinghuasuan.com/broker/v1/order/local_img_ocr";
    let headers = { Authorization: `${tokens.yinghuasuanRealToken}` };
    const res = await axios.post(url, params, {
      headers
    });
    logList?.push({
      opera_time: getCurrentTime(),
      des: "影划算图片校验返回",
      level: "info",
      info: {
        res: res.data
      }
    });
    logger?.infoSave("影划算图片校验返回", res.data);
    console.warn("影划算图片校验结果", res.data);
  } catch (error) {
    console.warn("影划算图片校验异常", error);
    logList?.push({
      opera_time: getCurrentTime(),
      des: "影划算图片校验异常",
      level: "info",
      info: {
        error
      }
    });
    logger?.infoSave("影划算图片校验异常", error);
  }
};
window.yinghuasuanCheckImg = yinghuasuanCheckImg;

// 获取取票码url
const uploadBlobImage = async ({
  blob,
  url,
  params,
  plat_name,
  logList,
  logger
}) => {
  try {
    // 创建表单数据
    const formData = new FormData();

    // 添加文件字段 (自动生成文件名)
    const fileExtension = blob.type.split("/")[1] || "png";
    const fileName = `image_${Date.now()}.${fileExtension}`;
    formData.append("file", blob, fileName);

    // 添加其他参数
    Object.keys(params).forEach(key => {
      formData.append(key, params[key]);
    });

    let headers = { "Content-Type": "multipart/form-data" };
    if (plat_name === "yinghuasuan") {
      headers.Authorization = tokens.yinghuasuanRealToken;
    } else if (plat_name === "haha") {
      headers.Token = tokens.hahaToken;
    } else if (plat_name === "shoutu") {
      headers.Token = tokens.shoutuToken;
    } else if (plat_name === "mahua") {
      headers.Token = tokens.mahuaToken;
    } else if (plat_name === "piaosheng") {
      headers.Token = tokens.piaoShengToken;
    }
    // 使用正确的Axios配置发送请求
    const response = await axios.post(url, formData, { headers });
    let res = response?.data;
    console.log("取票码图片上传返回", res);
    logList?.push({
      opera_time: getCurrentTime(),
      des: "取票码图片上传返回",
      level: "info",
      info: {
        res
      }
    });
    logger?.infoSave("取票码图片上传返回", res);
    if (plat_name == "yinghuasuan") {
      // 图片校验成功后才能用
      await yinghuasuanCheckImg({
        order_sn: params.event_data,
        new_path: res?.data?.new_path,
        file_url: res?.data?.file_url,
        pod: "2",
        logList,
        logger
      });
      return res?.data?.file_url;
    } else if (plat_name == "haha") {
      return res?.data?.url;
    } else if (plat_name == "shoutu") {
      return res?.data?.url;
    } else if (plat_name == "mahua") {
      return res?.rtnData?.imgUrl;
    } else if (plat_name == "piaosheng") {
      return res?.rtnData?.imgUrl;
    } else if (plat_name == "mayi") {
      return res?.data?.picUrl;
    }
  } catch (error) {
    logList?.push({
      opera_time: getCurrentTime(),
      des: "取票码图片上传异常",
      level: "info",
      info: {
        error
      }
    });
    logger?.infoSave("取票码图片上传异常", error);
    // 增强错误处理
    if (error.response) {
      // 服务器返回了错误响应
      console.error("服务器错误:", error.response.data);
    } else if (error.request) {
      // 请求已发送但无响应
      console.error("无响应:", error.request);
    } else {
      // 请求配置错误
      console.error("请求错误:", error.message);
    }
  }
};

// 获取随机数
const randomNumByLength = function () {
  for (
    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 32,
      t = "abcdefghijklmnopqrstuvwxyz0123456789",
      n = "",
      r = 0;
    r < e;
    r++
  )
    n += t.charAt(Math.floor(Math.random() * t.length));
  return n;
};
window.randomNumByLength = randomNumByLength;

// 加法
const addDecimal = (a, b) => Decimal(a).add(Decimal(b)).toNumber();
// 减法
const subDecimal = (a, b) => Decimal(a).sub(Decimal(b)).toNumber();
// 乘法
const mulDecimal = (a, b) => Decimal(a).mul(Decimal(b)).toNumber();
// 除法
const divDecimal = (a, b) => Decimal(a).div(Decimal(b)).toNumber();

window.addDecimal = addDecimal;
window.subDecimal = subDecimal;
window.mulDecimal = mulDecimal;
window.divDecimal = divDecimal;

/**
 * 金额比较工具：按指定精度放大为整数后比较，返回 -1/0/1
 * @param {number|string} a
 * @param {number|string} b
 * @param {number} [scale=3] - 小数精度，默认千分位
 * @returns {number} -1: a<b, 0: a==b, 1: a>b
 */
const compareDecimal = (a, b, scale = 3) => {
  const factor = Decimal(10).pow(scale);
  const ia = Decimal(a || 0)
    .mul(factor)
    .toNearest(1)
    .toNumber();
  const ib = Decimal(b || 0)
    .mul(factor)
    .toNearest(1)
    .toNumber();
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
};

/**
 * 金额四舍五入到指定小数位
 * 仅用于最终展示/存库，内部计算尽量使用原始数值
 * @param {number|string} value
 * @param {number} [scale=2]
 * @returns {number}
 */
const roundPrice = (value, scale = 2) =>
  Decimal(value || 0)
    .toDecimalPlaces(scale)
    .toNumber();

window.compareDecimal = compareDecimal;
window.roundPrice = roundPrice;

// 连续加法
const multipleAddDecimal = (...numbers) => {
  // 使用reduce进行累加，注意：初始值为Decimal(0)
  return numbers
    .reduce((acc, num) => acc.plus(Decimal(num)), Decimal(0))
    .toNumber();
};

// 连续减法
const multipleSubDecimal = (...numbers) => {
  // 使用reduce进行累加，注意：初始值为Decimal(numbers[0])
  return numbers
    .slice(1)
    .reduce((acc, num) => acc.minus(Decimal(num)), Decimal(numbers[0]))
    .toNumber();
};

// 连续乘法
const multipleMulDecimal = (...numbers) => {
  // 使用reduce进行累积，注意：初始值为Decimal(1)
  let result = numbers
    .reduce((acc, num) => acc.times(Decimal(num)), Decimal(1))
    .toNumber()
    .toFixed(2);
  return Number(result);
};

// 连续除法
const multipleDivDecimal = (...numbers) => {
  // 使用reduce进行累积，注意：初始值为Decimal(1)
  let result = numbers
    .slice(1)
    .reduce((acc, num) => acc.dividedBy(Decimal(num)), Decimal(numbers[0]))
    .toNumber()
    .toFixed(2);
  return Number(result);
};

window.multipleAddDecimal = multipleAddDecimal;
window.multipleSubDecimal = multipleSubDecimal;
window.multipleMulDecimal = multipleMulDecimal;
window.multipleDivDecimal = multipleDivDecimal;

// 动态调价处理(目前仅猎人调用)
const dynamicPrice = async ({ order, offerRule, logger }) => {
  try {
    // 1、获取该规则、该影院的历史报价记录（需查出其中标价）
    const {
      id: offer_rule_id,
      offer_end_amount,
      offerAmount,
      addAmount,
      realAddMount, // 真实加价金额
      cost_price // 卡券成本
    } = offerRule;
    const { plat_name, cinema_code, supplier_max_price } = order;

    // 是否开启动态调价
    let isOpenAdjustPrice = localStorage.getItem("isAdjustPrice") == 1;
    if (!isOpenAdjustPrice) {
      return offer_end_amount;
    }
    const params = {
      offer_rule_id,
      plat_name,
      user_id: tokens?.userInfo?.user_id,
      cinema_code,
      queryFields: "offer_end_amount,deal_price,is_deal,order_number",
      page_num: 1,
      page_size: 10
    };
    logger.infoSave("动态调价开启", { offerRule, params });
    const res = await svApi.queryDealOfferList(params);
    let offerList = res.data.offerList || [];
    logger.infoSave("动态调价获取历史中标记录", { offerList });
    // 这样不行，因为报价记录表保存时间少，还是得往中标记录表同步才行
    // 有些平台还没有同步中标记录，所以需要获取我的历史报价记录进行调价判断
    // if (!offerList.length) {
    //   const res = await svApi.queryOfferList({
    //     ...params,
    //     order_status: "1",
    //     isNeedTotalNum: 0
    //   });
    //   offerList = res.data.offerList || [];
    //   logger.infoSave("动态调价获取我的历史报价记录", { offerList });
    // }
    // 实际加价 优先取真实加价
    let actual_amount = realAddMount || addAmount;
    const orgProfit = actual_amount
      ? +actual_amount
      : subDecimal(offerAmount, cost_price);
    const adjustRes = dynamicPricingAlgorithm(
      offerList, // 近15条的报价是否中标记录（半个小时前）
      cost_price, // 成本价
      offer_end_amount, // 准备报价金额
      supplier_max_price, // 平台限价
      orgProfit, // 原始加价利润
      0.5 //猎人步进值0.5
    );
    logger.infoSave("动态调价算法返回", adjustRes);
    if (adjustRes.adjustment == "none") return offer_end_amount;
    // 推荐价格
    offerRule.recommendedPrice = adjustRes.recommendedPrice;
    offerRule.price_spread = adjustRes.price_spread; // 成本价距离高频中标价的差值
    // 调整价格
    offerRule.adjustPrice =
      adjustRes.recommendedPrice < offer_end_amount
        ? subDecimal(adjustRes.recommendedPrice, offer_end_amount)
        : subDecimal(offer_end_amount, adjustRes.recommendedPrice);
    return adjustRes.recommendedPrice;
  } catch (error) {
    console.log("动态调价处理失败：", error);
  }
};

/**
 * 动态调价算法 - 基于初始预计报价进行智能调整
 *
 * @param {Array} offerList - 历史报价数据（倒序排列，最新报价在最前面）
 *   格式: [
 *     {
 *       "offer_end_amount": "我的报价"
 *       "deal_price": "中标价",
 *       "is_deal": "1=中标,2=未中标"
 *     },
 *     ...
 *   ]
 * @param {number} costPrice - 成本价
 * @param {number} initialExpectedPrice - 初始预计报价（基于成本价+X规则计算得出）
 * @param {number} supplier_max_price - 平台最高限价
 * @param {number} orgProfit - 原始加价利润
 * @param {number} stepValue - 步进值（调整的最小单位，通常为0.1或0.5）
 *
 * @returns {Object} 返回包含推荐报价和详细信息的对象
 *   {
 *     recommendedPrice: number,  // 最终推荐报价
 *     reason: string,           // 调整原因说明
 *     adjustment: string,       // 调整类型
 *     debugInfo: Object         // 调试信息
 *   }
 */
function dynamicPricingAlgorithm(
  offerList,
  costPrice,
  initialExpectedPrice,
  supplier_max_price,
  orgProfit,
  stepValue
) {
  // 数据验证 - 确保必要参数存在
  if (!offerList || offerList.length < 8) {
    return {
      recommendedPrice: initialExpectedPrice,
      reason: `近期报价数据量 ${offerList?.length || 0} 少于8，使用初始预计报价：${initialExpectedPrice}`,
      adjustment: "none"
    };
  }
  // 最小调价利润
  let adjustMinProfit =
    window.localStorage.getItem("minAdjustPriceProfit") || 1;
  adjustMinProfit = +adjustMinProfit;

  let reason = []; // 记录所有调整原因
  let minProfit = Math.min(adjustMinProfit, orgProfit);
  reason.push(
    `原本加价利润 ${orgProfit} 和动态调价最小利润 ${adjustMinProfit} 的最小值来作为保底最小利润：${minProfit}`
  );
  // 步进值默认为0.1，如果未传入则使用默认值
  stepValue = stepValue || 0.1;

  // 中标价数组（过滤掉空值）
  const deal_price_list = offerList
    .map(item => parseFloat(item.deal_price))
    .filter(
      item => !isNaN(item) && item !== null && item !== undefined && !!item
    );

  // 计算关键市场指标
  // 历史最低中标价
  const minDealPrice = deal_price_list?.length
    ? Math.min(...deal_price_list)
    : null;
  // 历史最高中标价
  const maxDealPrice = deal_price_list?.length
    ? Math.max(...deal_price_list)
    : null;

  // 统计连续中标/未中标情况（基于倒序数组，从前往后统计最新的）
  let consecutiveMissed = 0; // 连续未中标次数
  let consecutiveHit = 0; // 连续中标次数
  let lastDealPrice = parseFloat(deal_price_list[0]); // 最近一次中标价
  // 获取我的最近报价（最新一条记录的报价）
  const lastMyPrice = parseFloat(offerList[0].offer_end_amount);

  // 从最新记录开始统计连续未中标次数
  for (let i = 0; i < offerList.length; i++) {
    if (offerList[i].is_deal == "2") {
      consecutiveMissed++;
    } else {
      break; // 遇到中标记录则停止统计
    }
  }

  // 从最新记录开始统计连续中标次数
  for (let i = 0; i < offerList.length; i++) {
    if (offerList[i].is_deal == "1") {
      consecutiveHit++;
    } else {
      break; // 遇到未中标记录则停止统计
    }
  }

  // 统计中标价频次，找出出现频率最高的中标价
  const priceFrequency = {};
  deal_price_list.forEach(deal_price => {
    if (deal_price) {
      const roundedPrice = parseFloat(Number(deal_price).toFixed(2)); // 保留2位小数
      priceFrequency[roundedPrice] = (priceFrequency[roundedPrice] || 0) + 1;
    }
  });

  // 找出出现频率最高的中标价
  let mostDealPrice = null;
  let maxFrequency = 0;
  for (let price in priceFrequency) {
    if (priceFrequency[price] > maxFrequency) {
      maxFrequency = priceFrequency[price];
      mostDealPrice = parseFloat(price);
    }
  }

  // 我的报价数组
  const myOfferList = offerList
    .map(item => parseFloat(item.offer_end_amount))
    .filter(item => !isNaN(item) && !!item);
  // 统计我的报价频次，找出出现频率最高的报价
  const myPriceFrequency = {};
  myOfferList.forEach(myPrice => {
    const roundedPrice = parseFloat(Number(myPrice).toFixed(2)); // 保留2位小数
    myPriceFrequency[roundedPrice] = (myPriceFrequency[roundedPrice] || 0) + 1;
  });

  // 找出我出现频率最高的报价
  let mostMyPrice = null;
  let maxMyFrequency = 0;
  for (let price in myPriceFrequency) {
    if (myPriceFrequency[price] > maxMyFrequency) {
      maxMyFrequency = myPriceFrequency[price];
      mostMyPrice = parseFloat(price);
    }
  }
  // 我的历史最低报价
  const minMyPrice = myOfferList?.length ? Math.min(...myOfferList) : null;

  const totalBids = offerList.length; // 总报价次数
  const totalHits = offerList.filter(item => item.is_deal == "1").length; // 总中标次数
  const hitRate = totalHits / totalBids; // 中标率

  // 以初始预计报价为基础进行智能调整
  let currentOffer = initialExpectedPrice;

  let adjustment = "none"; // 记录调整类型

  // 策略1: 连续未中标 - 直接向高频中标价靠拢
  // 当连续5次或以上未中标时，寻找历史最高频次中标价并调整
  if (consecutiveMissed >= 5 && offerList.length >= 8) {
    // 如果最高频次的中标价存在，直接向其调整
    let mostPrice = mostDealPrice || mostMyPrice; // 高频中标价或者高频报价
    if (mostPrice) {
      // 确保调整后的价格不低于成本价+1
      // const targetPrice = Math.max(mostPrice, costPrice + minProfit);
      const targetPrice = mostPrice;
      if (targetPrice < currentOffer) {
        const originalPrice = currentOffer;
        currentOffer = targetPrice;
        const reductionAmount = subDecimal(originalPrice, currentOffer);
        reason.push(
          `连续 ${consecutiveMissed} 次未中标，向高频${mostDealPrice ? "中标价" : "报价"} ${mostPrice.toFixed(2)} 靠齐，降价：${reductionAmount.toFixed(2)}`
        );
        adjustment = "price_down_to_frequency";
      }
    }
  }

  // 策略2: 连续中标 - 适当提高报价增加收益
  // 当连续3次或以上中标时，可以适当提高报价以增加收益
  if (consecutiveHit >= 3) {
    let dealPrice = offerList[0].deal_price || offerList[0].offer_end_amount;
    let dealPriceAdd = +dealPrice; // 中标价加价后
    // 检查提价空间：不能超过平台限价
    const availableSpace = subDecimal(supplier_max_price, dealPrice);

    if (availableSpace >= stepValue) {
      // 计算实际提价金额（最多提价2步的价值）
      const maxIncrease = Math.min(mulDecimal(2, stepValue), availableSpace);
      const increaseAmount = Math.min(stepValue, maxIncrease); // 至少提价一步
      // 一步一步往上提，不提太多
      if (increaseAmount >= stepValue) {
        dealPriceAdd = addDecimal(dealPrice, increaseAmount);
        reason.push(
          `连续 ${consecutiveHit} 次中标，中标价 ${dealPrice} 提价：${increaseAmount.toFixed(2)}`
        );
        adjustment = "price_up";
      }
    }
    // 取连续中标价和初始价格取最大
    if (dealPriceAdd > initialExpectedPrice) {
      currentOffer = +dealPriceAdd;
      reason.push(
        `取连续中标价${adjustment == "price_up" ? "加价后" : ""} ${dealPriceAdd} 和初始价 ${initialExpectedPrice} 的最大值作为目标报价：${currentOffer}`
      );
    }
  }

  // 策略3: 整体中标率极低时 - 直接向最近一次中标价和高频中标价的最小值减去步进值靠拢
  // 当整体中标率低于10%时，采用激进策略
  if (hitRate < 0.1) {
    // 中标率低于10%
    let aggressivePrice = null;

    // 优先获取最近一次中标价和最多中标价的最小值
    if (lastDealPrice && mostDealPrice) {
      aggressivePrice = Math.min(lastDealPrice, mostDealPrice);
      reason.push(
        `中标率极低，取最近一次中标价${lastDealPrice}和最多中标价${mostDealPrice}的最小值：${aggressivePrice}`
      );
    }
    // 如果获取不到中标价数据，则取我的最近报价和我的高频报价的最小值
    else if (lastMyPrice && mostMyPrice) {
      aggressivePrice = Math.min(lastMyPrice, mostMyPrice);
      reason.push(
        `中标率极低且无中标价数据，取我的最近报价${lastMyPrice}和我的高频报价${mostMyPrice}的最小值：${aggressivePrice}`
      );
    }
    const targetPrice = subDecimal(aggressivePrice, stepValue);
    if (targetPrice < currentOffer) {
      const originalPrice = currentOffer;
      currentOffer = targetPrice;
      const reductionAmount = subDecimal(originalPrice, currentOffer);
      reason.push(
        `整体中标率极低：${(hitRate * 100).toFixed(1)}%，使用激进策略报价 ${targetPrice} 靠齐，降价：${reductionAmount}`
      );
      if (adjustment === "none") adjustment = "aggressive_down_to_min";
    }
  }

  // 策略4: 保证最小利润约束
  let roundCostPrice = roundToHalf(+costPrice, 0.5); // 向上进0.5倍
  const minAllowedPrice = addDecimal(roundCostPrice, minProfit);
  if (currentOffer < minAllowedPrice) {
    reason.push(
      `成本价 ${costPrice} 向上进0.5倍：${roundCostPrice}，得到最低允许报价：${minAllowedPrice}`
    );
    const originalPrice = currentOffer;
    currentOffer = minAllowedPrice;
    const increaseAmount = subDecimal(currentOffer, originalPrice);
    reason.push(
      `保障最小利润 ${minProfit} ，提价：${increaseAmount.toFixed(2)}`
    );
    adjustment = "profit_protection";
  }

  // 策略5: 平台限价约束
  // 确保报价不超过平台最高限价
  if (currentOffer > supplier_max_price) {
    const originalPrice = currentOffer;
    currentOffer = supplier_max_price;
    const reductionAmount = subDecimal(originalPrice, currentOffer);
    reason.push(
      `不超过平台限价 ${supplier_max_price.toFixed(2)} ，降价：${reductionAmount.toFixed(2)}`
    );
    adjustment = "limit_protection";
  }

  // 返回结果对象（保留两位小数）
  const finalPrice = parseFloat(currentOffer.toFixed(2));

  // 如果没有任何调整，说明初始报价已经合理
  if (reason.length === 0) {
    reason.push("初始预计报价合理，无需调整");
  }
  // 调整价格
  const adjustPrice = subDecimal(finalPrice, initialExpectedPrice);
  reason.push(
    `最终报价：${finalPrice}, 对比初始报价：${initialExpectedPrice}，调价：${adjustPrice}`
  );
  // 返回结果对象
  return {
    recommendedPrice: finalPrice,
    reason, // 合并所有调整原因
    adjustment: adjustment, // 调整类型
    price_spread: mostDealPrice ? subDecimal(costPrice, mostDealPrice) : null, // 成本价距离高频中标价的差值
    debugInfo: {
      consecutiveMissed, // 连续未中标次数
      consecutiveHit, // 连续中标次数
      totalBids: offerList.length, // 总报价次数
      totalHits: offerList.filter(item => item.is_deal == "1").length, // 总中标次数
      minDealPrice, // 历史最低中标价
      mostDealPrice, // 历史高频中标价
      maxDealPrice, // 历史最高中标价
      mostMyPrice, // 历史高频我的报价
      minMyPrice, // 历史我的最低报价
      initialExpectedPrice, // 初始预计报价
      costPrice, // 成本价
      orgProfit, // 报价初始加价利润
      supplier_max_price, // 平台最高限价
      finalPrice, // 最终报价
      stepValue // 使用的步进值
    }
  };
}

window.dynamicPricingAlgorithm = dynamicPricingAlgorithm;

// 移除括号及括号内的内容 如"12排20座(10300) 12排19座(10300)" 输出: "12排20座 12排19座"
function removeParenthesesContent(str) {
  return str.replace(/\([^()]*\)/g, "").trim();
}

// 渲染进程通知主线程进行请求
// url,
// method = 'GET',
// headers = {},
// data = null,      // 用于 POST/PUT body
// params = null,    // 新增：用于 GET 查询参数
// timeout = 10000
const requestViaMain = async options => {
  const result = await window.electron.ipcRenderer.invoke(
    "proxy-http-request",
    options
  );
  console.log("渲染进程收到主进程请求结果", result);
  if (!result.success) {
    throw new Error(
      `Request failed: ${result.message} (status: ${result.status})`
    );
  }

  return result.data;
};

// 名称特殊处理-只保留英文字母、数字、中文并转小写
const nameSpecialHandle = cinema_name => {
  return cinema_name
    ?.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "") // 只保留英文字母、数字、中文
    ?.toLowerCase(); // 如果你仍需要转小写（注意：中文不受影响）
};

// 获取映射名称匹配
const getNameSpecialMatch = (name, type) => {
  try {
    return nameMatchStore.nameList?.find(
      item =>
        item.type == type &&
        nameSpecialHandle(name) == nameSpecialHandle(item.name)
    )?.match_name;
  } catch (error) {}
};

window.getNameSpecialMatch = getNameSpecialMatch;

// 根据影片名获取电影信息
const getMovieInfoFromFilmName = ({ filmName, movieData }) => {
  try {
    console.log("getMovieInfoFromFilmName", filmName, movieData);
    // 1、检查入参是否合规
    if (!filmName || !movieData?.length || !movieData?.[0]?.filmName) {
      return;
    }
    // 2、全字匹配
    let movieInfo = movieData?.find(item => item.filmName === filmName);
    if (movieInfo) return movieInfo;
    // 3、特殊匹配-只保留英文字母、数字、中文并转小写
    movieInfo = movieData.find(
      item => nameSpecialHandle(item.filmName) === nameSpecialHandle(filmName)
    );
    if (movieInfo) return movieInfo;
    // 4、映射特殊匹配
    movieInfo = movieData.find(
      item =>
        nameSpecialHandle(item.filmName) ===
        nameSpecialHandle(getNameSpecialMatch(filmName, 1))
    );
    if (movieInfo) return movieInfo;
    // 5-模糊匹配-特殊处理后相同字符多的优先
    let targetFilmList = movieData.map(item => {
      return {
        ...item,
        ...findMostRepeatedChars(
          nameSpecialHandle(item.filmName),
          nameSpecialHandle(filmName)
        )
      };
    });
    targetFilmList = targetFilmList.sort((a, b) => b.similarity - a.similarity);
    // 必须有4个重复字符才采用模糊匹配结果
    if (targetFilmList[0]?.totalRepeated >= 4) {
      movieInfo = targetFilmList[0];
    }
    return movieInfo;
  } catch (error) {
    console.warn("根据影片名获取电影信息异常", error);
  }
};
window.getMovieInfoFromFilmName = getMovieInfoFromFilmName;

// 辰星3.0C特殊规则名称解析，是数字则返回数字
function parseNumericRule(ruleName) {
  // 1. 参数类型检查
  if (typeof ruleName !== "string") {
    return undefined;
  }

  // 2. 检查字符串格式：数字_数字
  if (!/^\d+_\d+$/.test(ruleName)) {
    return undefined;
  }

  // 3. 替换下划线为点
  const replaced = ruleName.replace("_", ".");

  // 4. 转换为数字
  const number = parseFloat(replaced);

  // 5. 验证是否为有效数字
  if (isNaN(number) || !isFinite(number)) {
    return undefined;
  }

  return number;
}

/**
 * 将字符串按特殊字符分割，并返回长度最长的子串
 * @param {string} str 原始字符串
 * @param {RegExp} delimiterRegex 分割正则（默认包含常见分隔符）
 * @returns {string} 最长子串
 */
function getLongestPart(str, delimiterRegex = /[·:：\s\-_、，,]+/) {
  const parts = str.split(delimiterRegex).filter(part => part.length > 0);
  if (parts.length === 0) return "";
  return parts.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );
}

/**
 * 判断当前时间（本地时间）是否在x-y 时间段内
 * @returns {boolean} true 表示在区间内，false 表示不在
 */
function isCurrentTimeInRange(x, y) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = x * 60; // x:00 = x*60 分钟
  const endMinutes = y * 60; // y:00 = y*60 分钟
  return currentMinutes > startMinutes && currentMinutes < endMinutes;
}
export {
  isCurrentTimeInRange, // 判断当前时间（本地时间）是否在x-y 时间段内
  getLongestPart, // 将字符串按特殊字符分割，并返回长度最长的子串
  parseNumericRule, // 辰星3.0C特殊规则名称解析，是数字则返回数字
  getMovieInfoFromFilmName, // 根据影片名获取电影信息
  requestViaMain, // 渲染进程通知主线程进行请求
  removeParenthesesContent, // 移除括号及括号内的内容
  dynamicPrice, // 动态调价处理
  addDecimal, // 加
  subDecimal, // 减
  mulDecimal, // 乘
  divDecimal, // 除
  multipleAddDecimal, // 连续加
  multipleSubDecimal, // 连续减
  multipleMulDecimal, // 连续乘
  multipleDivDecimal, // 连续除
  isNextDay, // 判断是否是次日
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
  getNextDayTime, // 获取下一天 YYYY-MM-DD HH:mm:ss
  getCurrentTime, // 获取当前时间 YYYY-MM-DD HH:mm:ss
  parseExcel, // 解析xlsx文件
  createExcelDown, // 生成excel文件并下载
  exportExcel, // 导出
  getFormattedDateTime, // 获取当前时间：YYYY-MM-DD HH:MM:SS
  findBestMatchByLevenshtein,
  findBestMatchByLevenshteinWithThreshold,
  isTimeAfter, // 判断time1时间是否在time2之后
  getCinemaFlag, // 获取影院标识
  getCinemaCode, // 获取影院code
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
  generateTicketImage, // 生成取票码
  uploadBlobImage, // 上传取票码获取url
  randomNumByLength, // 获取随机数
  cryptoFunctions,
  CustomConsole
};
