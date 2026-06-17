// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { GET_APP_LIST } from "@/common/constant";

import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { handleNetworkRetry } from "./retry-helper";
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
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        let targetInfo = targetLoginList?.[0] || "";
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
          config.session_id = token;
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
      // 如果是重试后的成功响应，记录日志
      if (response?.config?.retryCount > 0) {
        // logUpload(
        //   {
        //     plat_name: "",
        //     app_name: app_name,
        //     order_number: "",
        //     type: ""
        //   },
        //   [
        //     {
        //       opera_time: getCurrentTime(),
        //       des: "接口重试成功",
        //       level: "info",
        //       info: {
        //         retryCount: response?.config?.retryCount,
        //         originalUrl: response?.config?.originalUrl
        //       }
        //     }
        //   ]
        // );
      }

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
        let errMsg =
          GET_APP_LIST()[app_name] + (data.message || data.msg || "请求失败");
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
      // console.warn('error-config', config, 'error-response', response)
      // 确保 config 存在
      if (!config) {
        console.warn("请求配置丢失，请稍后再试");
        return Promise.reject(error);
      }

      // 支持接口调用时自定义控制最大重试次数
      const maxRetries = config.maxRetries || 3;
      // 重试接口名单
      let retrieUrls = [
        "/cinCinemaInfoService/findCinCityToApp",
        "/cinCinemaFilmInfoService/findFilmInfoToApp",
        "/cinScheduleInfoService/findCinScheduleDataToApp",
        "/cinScheduleInfoService/findScheduleInfoToApp",
        "/cinSyncService/findSeatMapInfo",
        "/optimalCombinatService/getOptimalCombination"
      ];
      const retryResult = await handleNetworkRetry(error, config, instance, {
        maxRetries: config.maxRetries || 3,
        whitelist: retrieUrls
      });
      if (retryResult) {
        return retryResult;
      }
      // 重试耗尽，继续原有错误处理
      if (config.retryCount) {
        // logUpload(
        //   {
        //     plat_name: "",
        //     app_name: app_name,
        //     order_number: "",
        //     type: ""
        //   },
        //   [
        //     {
        //       opera_time: getCurrentTime(),
        //       des: "接口重试到最后还是失败",
        //       level: "info",
        //       info: {
        //         originalUrl: config.originalUrl,
        //         retryCount: config.retryCount,
        //         params: config.params,
        //         data: config.data
        //       }
        //     }
        //   ]
        // );
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
              des: "UME小程序网络连接异常",
              level: "error",
              info: {
                error: formatErrInfo(error)
              }
            }
          ]
        );
        ElMessage.error("UME小程序网络连接异常，请稍后再试");
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

export default createAxios;
