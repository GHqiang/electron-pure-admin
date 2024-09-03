// src/utils/axiosInstance.js

import axios from "axios";
import md5 from "../md5.js";
import { ElMessage } from "element-plus";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

function getSign(params, appSecret) {
  let stringParts = [];
  // 对参数按 key 排序
  let sortedParams = Object.keys(params)
    .sort()
    .reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {});

  // 将参数的 key 和 value 用 "=" 连接，然后用 "&" 将它们连接起来
  for (let key in sortedParams) {
    stringParts.push(`${key}=${sortedParams[key]}`);
  }

  // 添加 app-secret 并拼接成字符串
  let str = stringParts.join("&") + `&app-secret=${appSecret}`;

  // MD5加密并转换为大写
  let sign = md5.hex_md5(str).toUpperCase();
  return sign;
}

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/openapi/") !== -1) {
      config.headers["Content-Type"] = "application/x-www-form-urlencoded";

      // console.log("config.headers", config.headers);
      const token = tokens.shangzhanToken || "";

      // 付勋："4E540CA451984A574540E2C4974E0E95";
      const appSecret = token || ""; // 请替换为实际的 app-secret
      config.data["app-id"] = tokens?.userInfo?.phone || "";
      config.data["time"] = parseInt(+new Date() / 1000);
      config.data = new URLSearchParams(config.data); // 转换为 URLSearchParams

      // 从请求体中获取参数
      let params = {};
      config.data.forEach((value, key) => {
        params[key] = value;
      });

      // 生成签名
      let sign = getSign(params, appSecret);

      // 将签名加入到请求体中
      config.data.append("sign", sign);

      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "https://www.huobanos.com" + config.url;
    }
    // console.log("请求config", config);
    return config;
  },
  error => {
    // 处理请求错误
    return Promise.reject(error);
  }
);

// 响应拦截器
instance.interceptors.response.use(
  response => {
    // 对响应进行统一处理
    const data = response.data;
    // let whitelistSp = ['/sp/order', '/sp/unlock']
    let whitelistSp = [];

    let isErrorByLieRen =
      response.config.url.indexOf("/openapi/") !== -1 && data.code != 200;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || data.msg || "请求失败");
      return Promise.reject(data);
    }
    return data;
  },
  error => {
    // 对HTTP错误码进行处理
    const { response } = error;
    if (response && response.status) {
      switch (response.status) {
        case 401:
          //   // 未授权，处理登出逻辑
          //   const store = useStore();
          //   store.dispatch('auth/logout');
          break;
        default:
          ElMessage.error(
            `请求错误 ${response.status}: ${error.message || error.msg}`
          );
      }
    } else {
      ElMessage.error("网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
