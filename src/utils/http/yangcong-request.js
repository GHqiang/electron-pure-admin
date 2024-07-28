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

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/prod-api/") !== -1) {
      // 猎人平台接口添加token
      // console.log("tokens.lierenToken", tokens.lierenToken);
      const token = tokens.yangcongToken || "";
      if (token) {
        config.headers.Token = `${token}`;
      }
      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "https://ticket.secretonion.com" + config.url;
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
      response.config.url.indexOf("/prod-api/") !== -1 && !data.success;
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
