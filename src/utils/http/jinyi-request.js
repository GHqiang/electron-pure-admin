// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { GET_APP_LIST, GET_APP_INFO } from "@/common/constant";
import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo,
  mockDelay
} from "@/utils/utils";

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

/**
 * 判断是否是服务器错误 (5xx)
 */
const isServerError = error => {
  return (
    error.response &&
    error.response.status >= 500 &&
    error.response.status < 600
  );
};

/**
 * 创建带重试机制的请求函数
 */
const createRetryRequest = (instance, config) => {
  const maxRetries = 2; // 最大重试次数
  const retryDelay = 1; // 基础延迟时间（秒）
  const retryUrls = ["/ticket/", "/citys/"]; // 需要重试的接口路径

  // 判断是否需要重试
  const shouldRetry = url => {
    return retryUrls.some(retryUrl => url.includes(retryUrl));
  };

  // 重试请求
  const retryRequest = async (retryCount = 0) => {
    try {
      // console.log(`🚀 发起请求: ${config.url} (重试次数: ${retryCount})`);
      return await instance.request(config);
    } catch (error) {
      const currentRetry = retryCount + 1;
      const url = config.url || "";

      // 判断是否应该重试
      const isRetryable =
        shouldRetry(url) &&
        (isNetworkError(error) ||
          isTimeoutError(error) ||
          isServerError(error));

      // 检查是否达到最大重试次数
      if (isRetryable && currentRetry <= maxRetries) {
        const delayTime = retryDelay * currentRetry;
        console.log(
          `🔄 准备第 ${currentRetry} 次重试 (${config.url})，等待 ${delayTime}ms`
        );
        console.log(`错误类型:`, {
          isNetworkError: isNetworkError(error),
          isTimeoutError: isTimeoutError(error),
          isServerError: isServerError(error),
          code: error.code,
          message: error.message
        });

        // 等待延迟
        await mockDelay(delayTime);

        // 重新发起请求
        console.log(`🔁 开始第 ${currentRetry} 次重试 (${config.url})`);
        return retryRequest(currentRetry);
      }

      // 不再重试，抛出错误
      console.log(
        `❌ 请求失败，不再重试 (${config.url})，重试次数: ${currentRetry}`
      );
      throw error;
    }
  };

  return retryRequest();
};

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
        }
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

      if (
        isErrorByLieRen &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        let errMsg = GET_APP_LIST()[app_name] + (data.msg || "请求失败");
        ElMessage.error(errMsg);

        if (data.msg?.includes("登录信息已失效，请重新登录")) {
          // 推送登录信息
          let session_id = response?.config?.session_id;
          let targetLoginList = getCinemaLoginInfoList().filter(
            item => item.app_name === app_name && item.mobile && item.session_id
          );
          let phone = targetLoginList.find(
            item => item.session_id == session_id
          )?.mobile;
        }
        return Promise.reject(data);
      }

      return data;
    },
    async error => {
      const { response, config } = error;

      // 对HTTP错误码进行处理
      if (response && response.status) {
        switch (response.status) {
          case 401:
            break;
          default:
            ElMessage.error(
              `请求错误 ${response.status}: ${error.message || error.msg}`
            );
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
        if (!isTimeoutError(error) && !isNetworkError(error)) {
          ElMessage.error("金逸小程序网络连接异常，请稍后再试");
        }
      }

      return Promise.reject(error);
    }
  );

  // 创建带重试功能的请求包装函数
  const retryInstance = {
    // 重写request方法
    request: async config => {
      try {
        return await createRetryRequest(instance, config);
      } catch (error) {
        // 如果重试后仍然失败，抛出错误
        throw error;
      }
    },

    // 重写常用的HTTP方法
    get: async (url, config) => {
      const mergedConfig = { ...config, method: "GET", url };
      return retryInstance.request(mergedConfig);
    },

    post: async (url, data, config) => {
      const mergedConfig = { ...config, method: "POST", url, data };
      return retryInstance.request(mergedConfig);
    },

    // put: async (url, data, config) => {
    //   const mergedConfig = { ...config, method: "PUT", url, data };
    //   return retryInstance.request(mergedConfig);
    // },

    // delete: async (url, config) => {
    //   const mergedConfig = { ...config, method: "DELETE", url };
    //   return retryInstance.request(mergedConfig);
    // },

    // 保留原始axios实例以供特殊使用
    _originalInstance: instance
  };

  return retryInstance;
};

export default createAxios;
