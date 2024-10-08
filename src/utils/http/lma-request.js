// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import Cookies from "js-cookie";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: 15 * 1000,
    withCredentials: true
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf("/lma/") !== -1) {
        config.headers["Content-Type"] === "application/x-www-form-urlencoded;";
        // 猎人平台接口添加token
        let loginInfoList = window.localStorage.getItem("loginInfoList");
        if (loginInfoList) {
          loginInfoList = JSON.parse(loginInfoList);
        }
        let obj = loginInfoList.find(
          itemA =>
            itemA.app_name === app_name &&
            itemA.session_id &&
            (tokens.userInfo.user_id != 1
              ? item.mobile === tokens.userInfo.phone
              : true)
        );
        let token = obj?.session_id || "";

        // 保存原始参数和原始URL
        if (!config.originalParams) {
          config.originalParams = { ...config.params };
        }
        if (!config.originalData) {
          config.originalData = { ...config.data };
        }
        if (!config.originalUrl) {
          config.originalUrl = config.url;
        }
        if (!config.retryCount) {
          config.retryCount = 0;
        }

        let params =
          config.method === "get" ? config.originalParams : config.originalData;
        if (params.lmaToken) {
          token = params?.lmaToken;
          delete params.lmaToken;
        }
        if (token) {
          Cookies.set("ig_session", token);
          // config.headers["Cookie"] = `ig_session=${token}`;
        }
        if (config.method === "get") {
          config.params = params;
        } else {
          config.data = new URLSearchParams(params); // 转换为 URLSearchParams
        }
        // 生产环境不会跨域
        config.url = IS_DEV
          ? config.url
          : "https://app.lumiai.com" + config.originalUrl.slice(4);
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

      let isError =
        response.config.url.indexOf("/lma/") !== -1 && data.code !== "0";
      if (
        isError &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        ElMessage.error(data.message || data.msg || "请求失败");
        return Promise.reject(data);
      }
      return data;
    },
    async error => {
      const { response, config } = error;
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second
      // 重试接口名单
      let retrieUrls = [
        "/index/film",
        "/index/sell_session",
        "/ibuypro/index",
        "/imember/index",
        "/icoupon/index",
      ];
      let isRetry = shouldRetry(error, config, maxRetries, retrieUrls);
      // console.log("isRetry", isRetry, config);
      if (isRetry) {
        // 检查是否需要重试
        config.retryCount = config.retryCount + 1;
        retryCount++;
        console.log(`请求失败，正在进行第 ${config.retryCount} 次重试...`);

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        // 重试请求
        return instance(config);
      }

      // 对HTTP错误码进行处理
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

  // 判断是否需要重试
  const shouldRetry = (error, config, maxRetries, retrieUrls) => {
    let isCountCheck = config.retryCount < maxRetries;
    let isUrlCheck = retrieUrls.some(item => config.url.includes(item));
    let isErrorCheck = false;
    // 检查错误类型
    if (axios.isAxiosError(error)) {
      const message = error.message.toLowerCase();
      isErrorCheck =
        message.includes("timeout of") || message.includes("network error");
    }
    // console.log(
    //   "isCountCheck",
    //   isCountCheck,
    //   "isUrlCheck",
    //   isUrlCheck,
    //   isErrorCheck
    // );
    return isCountCheck && isUrlCheck && isErrorCheck;
  };

  return instance;
};
export default createAxios;
