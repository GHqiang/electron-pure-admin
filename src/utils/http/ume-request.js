// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: timeout * 1000
  });
  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";
  const proxyStr = app_name === "yaolai" ? "yaolai" : "ume";
  const host =
    app_name === "yaolai"
      ? "https://jccinema.yuekeyun.com"
      : "https://oc.yuekeyun.com";
  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf(`/${proxyStr}/`) !== -1) {
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
        if (config.method === "get") {
          config.params = { ...config.originalParams };
        } else {
          let params = { ...config.originalData };
          if (params.session_id) {
            token = params?.session_id;
            delete params.session_id;
          }
          let str = Object.keys(params).reduce((prev, item, inx) => {
            // console.log("item", item, prev, params);
            let value = params[item];
            let valueStr =
              typeof value === "object"
                ? encodeURIComponent(JSON.stringify(value))
                : value;
            return prev + `${inx > 0 ? "&" : ""}${item}=${valueStr}`;
          }, "");
          config.data = str;
        }
        if (token) {
          config.headers.Certificate = `${token}`;
        }
        if (!IS_DEV) {
          // 截取掉/ume/
          config.url = host + config.originalUrl.slice(proxyStr.length + 1);
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
        (!IS_DEV
          ? true
          : response.config.url.indexOf(`/${proxyStr}/`) !== -1) &&
        data.status !== "S";
      if (
        isErrorByLieRen &&
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
        "/cinCinemaInfoService/findCinCityToApp",
        "/cinCinemaFilmInfoService/findFilmInfoToApp",
        "/cinScheduleInfoService/findCinScheduleDataToApp",
        "/cinScheduleInfoService/findScheduleInfoToApp",
        "/cinSyncService/findSeatMapInfo",
        "/optimalCombinatService/getOptimalCombination"
      ];
      let isRetry = shouldRetry(error, config, maxRetries, retrieUrls);
      // console.log("isRetry", isRetry, config);
      if (isRetry) {
        // 检查是否需要重试
        config.retryCount = config.retryCount + 1;
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
