/**
 * 票圣平台 Open API 请求拦截器
 * - 路径前缀：/psapi/（开发走 vite 代理，生产拼正式域名）
 * - 签名：MD5(bodyjson + key + txntime)，body 无参时为 {}
 * - devCode / key 获取方式参考 lieren-request（config.data 优先，否则 userInfo）
 * - token：/api/user-server/user/dev/login 获取，有效期 2 小时，建议每 30 分钟维护一次
 */

import axios from "axios";
import { ElMessage } from "element-plus";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
import md5 from "@/utils/md5";

const tokens = platTokens();

const CHANNEL_ID = "OP0002";
const LOGIN_PATH = "/api/user-server/user/dev/login";
const PROD_BASE = "https://openapi.piaosheng.top";
const TOKEN_STORAGE_KEY = "piaoShengToken";
const TOKEN_TIME_STORAGE_KEY = "piaoShengTokenFetchedAt";
/** token 有效期 2 小时 */
const TOKEN_MAX_AGE = 2 * 60 * 60 * 1000;
/** 建议每 30 分钟维护一次，避免临近过期 */
const TOKEN_REFRESH_INTERVAL = 30 * 60 * 1000;

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

const instance = axios.create({
  baseURL: "",
  timeout: 25 * 1000
});

/** 登录专用实例，避免走业务拦截器造成循环 */
const loginClient = axios.create({
  baseURL: "",
  timeout: 25 * 1000
});

let isFetchingToken = false;
let tokenWaitQueue = [];

const isPiaoShengRequest = url =>
  url.indexOf("/psapi/") !== -1 || url.indexOf(PROD_BASE) !== -1;

const isLoginRequest = url => url.indexOf(LOGIN_PATH) !== -1;

const resolveRequestUrl = url => {
  if (!IS_DEV) {
    return `${PROD_BASE}${url.replace(/^\/psapi/, "")}`;
  }
  return url;
};

/** 参考 lieren-request：AK→devCode，SK→key */
const getPiaoShengCredentials = config => {
  const devCode =
    config.data?.piaosheng_devCode || tokens.userInfo?.piaosheng_code;
  const key = config.data?.piaosheng_key || tokens.userInfo?.piaosheng_key;
  console.log("piaosheng credentials:", devCode, key);
  return {
    devCode: devCode || "",
    key: key || ""
  };
};

const stripPiaoShengCredentials = data => {
  if (!data || typeof data !== "object") return {};
  const businessParams = { ...data };
  delete businessParams.piaosheng_devCode;
  delete businessParams.piaosheng_key;
  return businessParams;
};

const buildBodyJson = config => {
  if (typeof config.data === "string") {
    return config.data || "{}";
  }
  const businessParams = stripPiaoShengCredentials(config.data || {});
  return Object.keys(businessParams).length
    ? JSON.stringify(businessParams)
    : "{}";
};

const buildSign = (bodyjson, key, txntime) =>
  md5.hex_md5(`${bodyjson}${key}${txntime}`);

const applySignedHeaders = (config, { devCode, key, token, bodyjson }) => {
  const txntime = Date.now().toString();
  const sign = buildSign(bodyjson, key, txntime);

  config.headers["Content-Type"] = "application/json;charset=utf-8";
  config.headers["channelid"] = CHANNEL_ID;
  config.headers["txntime"] = txntime;
  config.headers["devCode"] = devCode;
  config.headers["sign"] = sign;
  if (token) {
    config.headers["token"] = token;
  }
  config.data = bodyjson;
};

const getCachedToken = () =>
  localStorage.getItem(TOKEN_STORAGE_KEY) || tokens.piaoShengToken || "";

const getTokenFetchedAt = () =>
  Number(localStorage.getItem(TOKEN_TIME_STORAGE_KEY) || 0);

const saveToken = token => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_TIME_STORAGE_KEY, String(Date.now()));
  tokens.setPiaoShengPlatToken(token);
};

const shouldRefreshToken = () => {
  const token = getCachedToken();
  const fetchedAt = getTokenFetchedAt();
  if (!token || !fetchedAt) return true;
  const age = Date.now() - fetchedAt;
  return age >= TOKEN_REFRESH_INTERVAL || age >= TOKEN_MAX_AGE;
};

const isTokenExpiredMsg = msg =>
  typeof msg === "string" &&
  (msg.includes("token") ||
    msg.includes("Token") ||
    msg.includes("过期") ||
    msg.includes("失效"));

/**
 * 调用 dev/login 获取 token（独立请求，不走 instance 拦截器）
 */
const fetchPiaoShengToken = async (devCode, key) => {
  const bodyjson = "{}";
  const txntime = Date.now().toString();
  const sign = buildSign(bodyjson, key, txntime);
  const url = resolveRequestUrl(`/psapi${LOGIN_PATH}`);

  const response = await loginClient.post(url, bodyjson, {
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      channelid: CHANNEL_ID,
      txntime,
      devCode,
      sign
    }
  });

  const data = response.data;
  if (data?.rtnCode !== "000000") {
    throw data || new Error("获取票圣 token 失败");
  }
  const token = data?.rtnData?.token;
  if (!token) {
    throw new Error("获取票圣 token 为空");
  }
  saveToken(token);
  return token;
};

const ensurePiaoShengToken = async (devCode, key, force = false) => {
  if (!force && !shouldRefreshToken()) {
    return getCachedToken();
  }

  if (isFetchingToken) {
    return new Promise((resolve, reject) => {
      tokenWaitQueue.push({ resolve, reject });
    });
  }

  isFetchingToken = true;
  try {
    const token = await fetchPiaoShengToken(devCode, key);
    tokenWaitQueue.forEach(item => item.resolve(token));
    tokenWaitQueue = [];
    return token;
  } catch (error) {
    tokenWaitQueue.forEach(item => item.reject(error));
    tokenWaitQueue = [];
    throw error;
  } finally {
    isFetchingToken = false;
  }
};

// 请求拦截器
instance.interceptors.request.use(
  async config => {
    if (!isPiaoShengRequest(config.url)) {
      return config;
    }

    const { devCode, key } = getPiaoShengCredentials(config);
    if (!devCode || !key) {
      ElMessage.error("票圣接口配置缺失，请联系管理员");
      return Promise.reject(new Error("Missing piaosheng API config"));
    }

    if (config.data?.piaosheng_devCode) {
      delete config.data.piaosheng_devCode;
    }
    if (config.data?.piaosheng_key) {
      delete config.data.piaosheng_key;
    }

    const rawUrl = config.url;
    if (!config.originalUrl) {
      config.originalUrl = rawUrl;
    }
    config.url = IS_DEV ? config.originalUrl : resolveRequestUrl(rawUrl);

    const bodyjson = buildBodyJson(config);

    // 登录接口本身不需要 token，且不应触发 ensurePiaoShengToken
    if (isLoginRequest(config.url)) {
      applySignedHeaders(config, { devCode, key, bodyjson });
      return config;
    }

    const token = await ensurePiaoShengToken(devCode, key);
    applySignedHeaders(config, { devCode, key, token, bodyjson });
    return config;
  },
  error => Promise.reject(error)
);

// 响应拦截器
instance.interceptors.response.use(
  response => {
    const data = response.data;
    const whitelistSp = [];

    const isPiaoShengApi =
      isPiaoShengRequest(response.config.url) ||
      response.config.url.indexOf(PROD_BASE) !== -1;

    if (
      isPiaoShengApi &&
      data?.rtnCode !== "000000" &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      if (isTokenExpiredMsg(data?.rtnMsg)) {
        const { devCode, key } = getPiaoShengCredentials(response.config);
        return ensurePiaoShengToken(devCode, key, true)
          .then(() => instance(response.config))
          .catch(err => {
            sendWxPusherMessage({
              msgType: 7,
              plat_name: "票圣平台",
              expirePhone: "机器手机号",
              transferTip: `票圣 token 续期失败，请检查 devCode/key 配置：${formatErrInfo(err)}`
            });
            return Promise.reject(err);
          });
      }
      ElMessage.error(data?.rtnMsg || "请求失败");
      return Promise.reject(data);
    }
    return data;
  },
  error => {
    const { response } = error;
    if (response && response.status) {
      ElMessage.error(
        `请求错误 ${response.status}: ${error.message || error.msg}`
      );
    } else {
      logUpload(
        {
          plat_name: "piaosheng",
          app_name: "",
          order_number: "",
          type: ""
        },
        [
          {
            opera_time: getCurrentTime(),
            des: "票圣网络连接异常",
            level: "error",
            info: { error: formatErrInfo(error) }
          }
        ]
      );
      ElMessage.error("票圣网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
export { ensurePiaoShengToken, fetchPiaoShengToken, LOGIN_PATH };
