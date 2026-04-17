// src/utils/axiosInstance.js

import axios from "axios";
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
  timeout: 25 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/lieren/") !== -1) {
      // 猎人平台接口添加token
      // console.log("tokens.lierenToken", tokens.lierenToken);
      config.headers.AK = config.data?.lieren_ak || tokens.userInfo?.lieren_ak;
      config.headers.SK = config.data?.lieren_sk || tokens.userInfo?.lieren_sk;
      // config.headers.AK = window.lieren_ak || tokens.userInfo?.lieren_ak;
      // config.headers.SK = window.lieren_sk || tokens.userInfo?.lieren_sk;
      if (IS_DEV) {
        config.url = config.url.replace("lieren", "svpi/lieren-ser");
      } else {
        config.url =
          "http://47.113.191.173:3000" +
          config.url.replace("lieren", "lieren-ser");
      }
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
      response.config.url.indexOf("/lieren-ser/") !== -1 && data.code !== 1;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || "请求失败");
      if (data.message?.includes("登录")) {
        sendWxPusherMessage({
          msgType: 1,
          app_name: "猎人平台",
          expirePhone: "机器手机号",
          transferTip: `登录失效，请检查登录信息维护`
        });
      }
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
          plat_name: "lieren",
          app_name: "",
          order_number: "",
          type: ""
        },
        [
          {
            opera_time: getCurrentTime(),
            des: "猎人网络连接异常",
            level: "error",
            info: {
              error: formatErrInfo(error)
            }
          }
        ]
      );
      ElMessage.error("猎人网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
