// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { GET_APP_LIST, GET_APP_INFO } from "@/common/constant";
import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { handleNetworkRetry } from "./retry-helper";

/**
 * 判断是否是网络错误
 */
const isNetworkError = error => {
  return (
    !error.response &&
    Boolean(error.code) && // 确保有错误码
    error.code !== "ECONNABORTED" && // 排除超时错误
    /^(ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT)$/.test(
      error.code
    )
  );
};

/**
 * 判断是否是超时错误
 */
const isTimeoutError = error => {
  return (
    error.code === "ECONNABORTED" ||
    error.message?.includes("timeout") ||
    error.message?.includes("超时")
  );
};

/** 是否跳过全局错误提示（如报价换座锁座失败） */
const shouldShowErrorMessage = config => !config?.silentError;

// 允许重试的接口白名单（查询类接口）
const retryWhitelist = [
  "/ticket/channelCode/citys/", // 金逸接口（查询类）
  "/ticket/channelCode/cinema/cinema_id/movies",
  "/ticket/channelCode/cinema/cinema_id/shows/",
  "/ticket/channelCode/cinema/cinema_id/hall/info/",
  "/ticket/channelCode/cinema/cinema_id/hall/saleable/",
  "/ticket/channelCode/cinema/cinema_id/order/info",
  "/ticket/channelCode/user/orders/",
  "/ticket/channelCode/cinema/cinema_id/user/info/",
  "/ticket/channelCode/cinema/cinema_id/order/vcc/usable/count",
  "/ticket/channelCode/cinema/cinema_id/vistax/voucher/list"
];

const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    baseURL: "",
    timeout: timeout * 1000
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      // 添加自定义配置标记
      config.__retryCount = config.__retryCount || 0;
      config.__startTime = Date.now();
      // console.log("config.url", config.url);
      if (config.url.indexOf(`/ticket/`) !== -1) {
        // 设置请求类型
        config.headers["Content-Type"] =
          config.method == "post"
            ? "application/x-www-form-urlencoded"
            : "multipart/form-data";

        // 猎人平台接口添加token
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        let targetInfo = targetLoginList?.[0] || "";
        let token = targetInfo?.session_id || "";
        let currentPhone = targetInfo?.mobile || "";

        let channelCode = GET_APP_INFO(app_name)?.channelCode || "";
        let cinema_id =
          (config.method == "post" ? config.data : config.params)?.cinema_id ||
          "";
        let session_id =
          (config.method == "post" ? config.data : config.params)?.session_id ||
          "";

        if (session_id) {
          if (config.method == "post" && config.data?.session_id) {
            delete config.data.session_id;
          } else if (config.method == "get" && config.params?.session_id) {
            delete config.params.session_id;
          }
          token = session_id;
          // 查找当前 session_id 对应的手机号
          const sessionInfo = targetLoginList.find(
            item => item.session_id == session_id
          );
          if (sessionInfo?.mobile) {
            currentPhone = sessionInfo.mobile;
          }
        }
        // 保存手机号到 config 中，供响应拦截器使用
        config.__phone = currentPhone;
        config.__session_id = token;
        if (token) {
          config.headers.token = `${token}`;
        }
        if (config.url.includes("cinema_id")) {
          if (config.method == "post" && config.data?.cinema_id) {
            delete config.data.cinema_id;
          } else if (config.method == "get" && config.params?.cinema_id) {
            delete config.params.cinema_id;
          }
        }
        config.url =
          (IS_DEV ? "" : "https://ct.womovie.cn") +
          config.url
            .replace("channelCode", channelCode)
            .replace("cinema_id", cinema_id);
      }

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
        response.config.url.indexOf(`/ticket/`) !== -1 &&
        data.msg !== "successfully";

      const isLoginExpired = data.msg?.includes("获取TOKEN超时");
      if (
        isErrorByLieRen &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        let errMsg = GET_APP_LIST()[app_name] + (data.msg || "请求失败");
        // 报价换座等场景传 silentError，登录失效仍提示
        if (shouldShowErrorMessage(response.config) || isLoginExpired) {
          ElMessage.error(errMsg);
        }

        if (isLoginExpired) {
          ElMessage.warning(
            `${GET_APP_LIST()[app_name]}登录失效，请重新设置登录信息`
          );
          // 直接从 config 中获取之前保存的手机号
          let phone = response?.config?.__phone || "";
          sendWxPusherMessage({
            msgType: 1,
            app_name: GET_APP_LIST()[app_name],
            expirePhone: phone,
            transferTip: `${GET_APP_LIST()[app_name]}登录失效，请检查登录信息维护`
          });
        }
        return Promise.reject(data);
      }

      return data;
    },
    async error => {
      const { response, config } = error;

      // 尝试网络重试（仅白名单接口）
      const retryResult = await handleNetworkRetry(error, config, instance, {
        maxRetries: 2,
        whitelist: retryWhitelist
      });
      if (retryResult) {
        return retryResult;
      }

      // 对HTTP错误码进行处理
      if (response && response.status) {
        switch (response.status) {
          case 401:
            break;
          default:
            if (shouldShowErrorMessage(config)) {
              ElMessage.error(
                `请求错误 ${response.status}: ${error.message || error.msg}`
              );
            }
        }
      } else {
        // 网络错误或超时错误
        logUpload(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentTime(),
              des: "金逸小程序网络连接异常",
              level: "error",
              info: {
                error: formatErrInfo(error)
              }
            }
          ]
        );

        // 只有特定错误才显示全局提示，重试的错误不显示
        if (
          shouldShowErrorMessage(config) &&
          !isTimeoutError(error) &&
          !isNetworkError(error)
        ) {
          ElMessage.error("金逸小程序网络连接异常，请稍后再试");
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

export default createAxios;
