// src/utils/axiosInstance.js

import axios from "axios";
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

function jsonToUrlEncoded(json) {
  return Object.keys(json)
    .map(key => {
      return encodeURIComponent(key) + "=" + encodeURIComponent(json[key]);
    })
    .join("&");
}
// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/newwww/") !== -1) {
      // 猎人平台接口添加token
      // console.log("tokens.lierenToken", tokens.lierenToken);
      const token = tokens.mayiToken || "";
      if (token) {
        config.headers.W_auth_code = `${token}`;
      }
      if (config.method === "post") {
        // 除了该接口，其他都做特殊处理
        if (config.url.indexOf("/newwww/api/order/uploadTicket4PicV2") === -1) {
          config.headers["Content-Type"] ===
            "application/x-www-form-urlencoded;charset=UTF-8";
          config.data = jsonToUrlEncoded(config.data);
        }
      }
      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "https://piao.mayiufu.com" + config.url;
    }
    // console.log('请求config', config)
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
      response.config.url.indexOf("/newwww/") !== -1 && !data.success;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || "请求失败");
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
          ElMessage.error(`请求错误 ${response.status}: ${error.msg}`);
      }
    } else {
      ElMessage.error("网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
