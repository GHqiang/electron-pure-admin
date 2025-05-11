// src/utils/axiosInstance.js

import axios from "axios";
import axiosRetry from "axios-retry";
import { ElMessage } from "element-plus";
import { platTokens } from "@/store/platTokens";
import { GE_APP_INFO } from "@/common/constant";

import {
  logUpload,
  getCurrentTime,
  mockDelay,
  getCinemaLoginInfoList
} from "@/utils/utils";
const tokens = platTokens();

const paramsHandle = (params, app_name) => {
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  let token = targetLoginList?.[0]?.session_id || "";
  // console.log("targetLoginList", targetLoginList);
  let config = {
    k: params?.session_id || token, // 登录接口返回token
    t: 5,
    r: 1,
    v: "V4.0.2",
    s: "Windows 11 x64",
    i: "00000000-0000-0000-0000-000000000000",
    d: "microsoft",
    channelNo: GE_APP_INFO(app_name)?.channelCode,
    channelCode: GE_APP_INFO(app_name)?.channelCode,
    // channelName: "中影嘉华-自营",
    tenantId: targetLoginList?.[0]?.tid || "", // 登录接口返回
    unifiedCode: params?.cinemaCode || undefined
    // cinemaCode: "33018961"
    // cinemaId: 405384
    // cinemaName: "中影嘉华国际影城（拱墅全景声巨幕店）"
    // marketingName: "172.30.82.8",
    // marketingCode: "CRM001",
    // defaultCardNo: "",
    // crmGroup: "CRM001"
  };
  // console.log("config", config);
  return {
    ...params,
    ...config
  };
};
const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: timeout * 1000
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
      return axiosRetry.isNetworkError(error) || error.code === "ECONNABORTED"; // 明确添加超时错误（由axios配置timeout触发）;
      // || (error.response && error.response.status >= 500)
    }
  });

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf("/selfSupport/") !== -1) {
        config.headers["Content-Type"] = "application/json";
        if (config.method === "get") {
          config.params = paramsHandle(config.params, app_name);
        } else {
          // POST请求，使用formData封装参数
          config.data = paramsHandle(config.data, app_name);
        }
        // 生产环境不会跨域
        config.url = IS_DEV
          ? config.url
          : "http://capi.oristarcloud.com" + config.url;
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

      let isError =
        (IS_DEV ? response.config.url.indexOf("/selfSupport/") !== -1 : true) &&
        data.code !== 200;
      if (
        isError &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        console.warn("接口响应失败", data);
        if (data.code === 401) {
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
            ElMessage.error(`请求错误 ${response.status}: ${error.msg}`);
        }
      } else {
        ElMessage.error("网络连接异常，请稍后再试");
      }
      return Promise.reject(error);
    }
  );
  return instance;
};

export default createAxios;
