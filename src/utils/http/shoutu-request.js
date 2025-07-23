// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { sendWxPusherMessage } from "@/utils/utils";
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
    config.headers["Content-Type"] = "application/x-www-form-urlencoded";
    // 猎人平台接口添加token
    // console.log("tokens.lierenToken", tokens.lierenToken);
    const token = tokens.shoutuToken || "";
    if (token) {
      if (config.url.startsWith("/seller-api")) {
        config.headers["X-Token"] = `${token.split("_")[0]}`;
      } else {
        config.headers["Token"] = `${token.split("_")[1]}`;
      }
    }
    let baseURL = config.url.startsWith("/seller-api")
      ? "http://moviepc.taototo.cn"
      : "https://seller.taototo.cn";
    // 生产环境不会跨域
    config.url = IS_DEV ? config.url : baseURL + config.url;
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

    if (
      data.code != 1 &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || data.msg || "请求失败");
      if (data.msg?.includes("token不存在或已过期")) {
        // sendWxPusherMessage({
        //   msgType: 1,
        //   app_name: "守兔平台",
        //   expirePhone: "机器手机号",
        //   transferTip: `守兔平台登录失效，请检查登录信息维护`
        // });
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
