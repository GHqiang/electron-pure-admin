// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import Cookies from "js-cookie";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentFormattedDateTime,
  mockDelay
} from "@/utils/utils";
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
        let targetList = loginInfoList.filter(
          itemA => itemA.app_name === app_name && itemA.session_id
        );
        let targetInfo = targetList?.[0] || "";
        if (targetList?.length > 1) {
          targetInfo = targetList.find(itemA =>
            tokens.userInfo.user_id != 1
              ? itemA.mobile === tokens.userInfo.phone
              : true
          );
        }
        let token = targetInfo?.session_id || "";

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

        let params =
          config.method === "get" ? config.originalParams : config.originalData;
        if (params.lmaToken) {
          token = params?.lmaToken;
          delete params.lmaToken;
        }
        if (token) {
          config.headers["lmatoken"] = "ig_session=" + token;
          // config.headers["cookie"] = "ig_session=" + token;
          // config.headers["Cookie"] = `ig_session=${token}`;
        }
        if (config.method === "get") {
          config.params = params;
        } else {
          config.data = new URLSearchParams(params); // 转换为 URLSearchParams
        }
        // 生产环境不会跨域
        config.url = IS_DEV
          ? config.url.replace("lma", "svpi/third-ser")
          : "http://47.113.191.173:3000" +
            "/third-ser" +
            config.originalUrl.slice(4);
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
      // 如果是重试后的成功响应，记录日志
      if (response?.config?.retryCount > 0) {
        logUpload(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentFormattedDateTime(),
              des: "接口重试成功",
              level: "info",
              info: {
                retryCount: response?.config?.retryCount,
                originalUrl: response?.config?.originalUrl
              }
            }
          ]
        );
      }

      // 对响应进行统一处理
      const data = response.data;
      // let whitelistSp = ['/sp/order', '/sp/unlock']
      let whitelistSp = [];

      let isError =
        response.config.url.indexOf("/third-ser/") !== -1 && !data.status;
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
      // console.warn('error-config', config, 'error-response', response)
      // 确保 config 存在
      if (!config) {
        console.warn("请求配置丢失，请稍后再试");
        return Promise.reject(error);
      }

      // 初始化 retryCount 如果它不存在
      if (config.retryCount === undefined) {
        config.retryCount = 0;
      }
      const maxRetries = config.maxRetries || 3;
      const retryDelay = config.retryDelay || 1; // 1 second
      // 重试接口名单
      let retrieUrls = [
        "/index/film",
        "/index/sell_session",
        "/ibuypro/index",
        "/imember/index",
        "/icoupon/index"
      ];
      let isRetry = shouldRetry(error, config, maxRetries, retrieUrls);
      // console.log("isRetry", isRetry, config);
      if (isRetry) {
        // 检查是否需要重试
        config.retryCount = config.retryCount + 1;
        console.log(`请求失败，正在进行第 ${config.retryCount} 次重试...`);

        // 等待一段时间后重试
        await mockDelay(retryDelay);

        // 重试请求
        return instance(config);
      }
      // 仍旧重试失败增加日志上送
      if (config.retryCount) {
        logUpload(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentFormattedDateTime(),
              des: "接口重试到最后还是失败",
              level: "info",
              info: {
                originalUrl: config.originalUrl,
                retryCount: config.retryCount,
                params: config.params,
                data: config.data
              }
            }
          ]
        );
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
    try {
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
    } catch (e) {
      //TODO handle the exception
      return false;
    }
  };

  return instance;
};
export default createAxios;
