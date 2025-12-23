// src/utils/axiosInstance.js

import axios from "axios";
import axiosRetry from "axios-retry";
import { ElMessage } from "element-plus";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 30 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

// 配置axios-retry
axiosRetry(instance, {
  retries: 3, // 最大重试次数
  retryDelay: retryCount => {
    return retryCount * 1000; // 每次重试的延迟时间，这里设置为1秒、2秒、3秒
  },
  retryCondition: error => {
    // 仅在网络错误或5xx错误时重试
    return axiosRetry.isNetworkError(error);
    // || (error.response && error.response.status >= 500)
  }
});

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/svpi/") !== -1) {
      // 自身平台接口添加token
      const token = tokens.selfToken || localStorage.getItem("selfToken") || "";
      // console.log("token", token);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "http://47.113.191.173:3000" + config.url.slice(5);
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
    let whitelistSp = [];

    let isErrorByLieRen =
      (IS_DEV ? response.config.url.indexOf("/svpi/") !== -1 : true) &&
      data.code !== 1;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      console.warn("接口响应失败", data);
      if (data.errCode === 401) {
        ElMessage({
          type: "error",
          message: "登录失效，请重新登录",
          center: true,
          duration: 5 * 1000,
          onClose: () => {
            console.warn("准备清除token刷新页面");
            tokens.removeSelfPlatToken();
            window.localStorage.removeItem("selfToken");
            window.localStorage.removeItem("userInfo");
            window.localStorage.removeItem("user-info");
            // 刷新页面以确保状态完全重置
            location.reload();
          }
        });
        return Promise.reject(data);
      }
      ElMessage.error(data.msg || "请求失败");
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
          ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
      }
    } else {
      logUpload(
        {
          plat_name: "jiqi",
          app_name: "",
          order_number: "",
          type: ""
        },
        [
          {
            opera_time: getCurrentTime(),
            des: "机器服务网络连接异常",
            level: "error",
            info: {
              error: formatErrInfo(error)
            }
          }
        ]
      );
      ElMessage.error("机器服务网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
