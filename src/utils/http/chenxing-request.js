// src/utils/axiosInstance.js

import axios from "axios";
import axiosRetry from "axios-retry";
import { ElMessage } from "element-plus";
import { GET_APP_INFO } from "@/common/constant";

import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";

const getToken = async (app_name, IS_DEV) => {
  try {
    // const tokenRes = await APP_API_OBJ[app_name].authToken({
    //   appId: "5868e8d75ba04beda426437ba93ef4c6"
    // });
    let url = "/svpi/chenxing-ser/api/auth/token";
    if (!IS_DEV) {
      url = "http://47.113.191.173:3000/chenxing-ser/api/auth/token";
    }
    const res = await axios.request({
      url: url,
      method: "post",
      data: {
        api: "api",
        v: "1.0",
        timestamp: +new Date(),
        sign: "sign",
        data: { appId: GET_APP_INFO(app_name)?.appId }
      },
      headers: {
        // "accept": "application/json, text/plain, */*",
        // "accept-language": "zh-CN,zh;q=0.9,ar;q=0.8",
        // "cache-control": "no-cache",
        "content-type": "application/json"
        // "pragma": "no-cache",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-site",
        // 'host': 'open.oristarcloud.com'
      }
    });
    // console.log("res", res);
    return res?.data?.data;
  } catch (error) {
    console.error("tokenRes error", error);
    throw error; // 确保错误能被后续捕获
  }
};

const paramsHandle = (params, app_name) => {
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  let token = targetLoginList?.[0]?.session_id || "";
  let appInfo = GET_APP_INFO(app_name);
  // console.log("app_name", app_name, appInfo);
  let api_version = appInfo?.api_version || "";

  if (api_version == "3.0C") {
    let config = {
      k: params?.session_id || token, // 登录接口返回token
      t: 5,
      r: 1,
      v: appInfo?.api_v || "V4.0.2",
      s: "Windows 11 x64",
      i: "00000000-0000-0000-0000-000000000000",
      d: "microsoft",
      channelNo: appInfo?.channelCode,
      channelCode: appInfo?.channelCode,
      // channelName: "中影嘉华-自营",
      tenantId: targetLoginList?.[0]?.tid || "", // 登录接口返回
      unifiedCode: params?.cinemaCode || undefined
      // cinemaCode: "33018961"
      // cinemaId: 405384
      // cinemaName: "中影嘉华国际影城（拱墅全景声巨幕店）"
      // marketingName: "172.30.82.8", // 影院列表可以拿到
      // marketingCode: "CRM001", // 影院列表可以拿到
      // defaultCardNo: "",
      // crmGroup: "CRM001" // 影院列表可以拿到
    };
    // console.log("config", config);
    return {
      ...params,
      ...config
    };
  } else if (api_version == "C") {
    let config = {
      api: "api",
      v: "1.0",
      timestamp: +new Date(),
      sign: "sign",
      data: {
        k: params?.session_id || token, // 登录接口返回token,
        t: 5,
        r: 1,
        v: "V4.0.0",
        s: "Windows 11 x64",
        i: "00000000-0000-0000-0000-000000000000",
        d: "microsoft",
        channelNo: appInfo?.channelCode,
        channelCode: appInfo?.channelCode,
        tenantId: token.split(":")[0],
        unifiedCode: params.cinemaCode,
        // cinemaCode: "42011801",
        // cinemaId: "136365",
        unifiedCinemaId: params.cinemaId,
        // channelName: "银兴国际影城-自营",
        // cinemaName: "银兴国际影城仙桃店",
        // unifiedCinemaName: "银兴国际影城仙桃店",
        ...params
      },
      pageNo: params.pageNo || "",
      pageSize: params.pageSize || "",
      channelCode: appInfo?.channelCode
    };
    return config;
  }
};
export { paramsHandle };
const createAxios = ({ app_name, timeout = 20 }) => {
  const instance = axios.create({
    baseURL: "",
    timeout: timeout * 1000
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";
  const api_version = GET_APP_INFO(app_name)?.api_version || "";

  // 用于存储token刷新状态
  let chenxingToken = null;
  let identityKey = null;
  let identityType = null;
  let isRefreshingToken = false;
  let tokenRefreshQueue = [];

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
    async config => {
      if (GET_APP_INFO(app_name)) {
        // 获取token（如果尚未获取且需要）
        if (
          !chenxingToken &&
          api_version == "C" &&
          config.url.indexOf("/auth/") === -1
        ) {
          try {
            const tokenRes = await getToken(app_name, IS_DEV);
            chenxingToken = tokenRes?.token;
            // 放开后可用会员卡同步功能测试401场景
            // chenxingToken = "";
            identityKey = tokenRes?.identityKey;
            identityType = tokenRes?.identityType;
          } catch (error) {
            console.error("Failed to get token", error);
          }
        }

        // 设置请求头
        if (chenxingToken) {
          config.headers.authorization = "Bearer " + chenxingToken;
          config.headers["Identity-key"] = identityKey;
          config.headers["Identity-Type"] = identityType;
        }
        config.headers["Content-Type"] = "application/json";
        // 如果是c端401过期后重试不再处理参数和url
        if (config.isRetry) return config;
        // 处理参数
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        let token = targetLoginList?.[0]?.session_id || "";

        if (config.method === "get") {
          config.params = paramsHandle(config.params, app_name);
          config.session_id = config.params?.session_id || token;
        } else {
          // POST请求，使用formData封装参数
          config.data = paramsHandle(config.data, app_name);
          config.session_id = config.data?.session_id || token;
        }
        config.headers["version"] = api_version;

        // 处理URL
        if (!IS_DEV) {
          if (api_version == "C") {
            // 需要服务器转发
            config.url =
              "http://47.113.191.173:3000" +
              "/chenxing-ser" +
              config.url.slice(9); // 截取掉/chenxing
          } else {
            // 不需要转发
            config.url = "https://capi.oristarcloud.com" + config.url;
          }
        } else {
          if (api_version == "C") {
            config.url = config.url.replace("chenxing", "svpi/chenxing-ser");
          } else if (api_version == "3.0C") {
            config.url = "/svpi/chenxing-ser" + config.url;
          }
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
      const data = response.data;
      let config = response.config;
      let whitelistSp = [];

      // 检查API版本并判断错误
      let isError =
        api_version === "3.0C" ? data.code !== 200 : data.retCode !== "0";

      if (isError && !whitelistSp.some(item => config.url.includes(item))) {
        console.warn("接口响应失败", data);
        let isCExpried =
          ["用户未登录", "会话无效或已过期"].some(item =>
            data.retMsg?.includes(item)
          ) && api_version == "C";
        let is3CExpried = data.msg?.includes("登录") && api_version == "3.0C";

        if (isCExpried || is3CExpried) {
          let app_label = GET_APP_INFO(app_name).app_label;
          ElMessage.warning(`${app_label}登录失效，请重新设置登录信息`);
          let session_id = config?.session_id;
          let targetLoginList = getCinemaLoginInfoList().filter(
            item => item.app_name === app_name && item.mobile && item.session_id
          );
          let phone = targetLoginList.find(
            item => item.session_id == session_id
          )?.mobile;

          console.warn("登录失效", app_label, phone);
          sendWxPusherMessage({
            msgType: 1,
            app_name: app_label,
            expirePhone: phone,
            transferTip: `${app_label}登录失效，请检查登录信息维护`
          });

          return Promise.reject(data);
        }

        ElMessage.error(data.msg || data.retMsg || "请求失败");
        return Promise.reject(data);
      }
      return data;
    },
    async error => {
      const { response } = error;
      if (response) {
        switch (response.status) {
          case 401:
            // 非C端场景直接返回异常
            if (api_version !== "C") {
              ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
              return Promise.reject(error);
            }
            // 处理401：刷新token并重试
            if (isRefreshingToken) {
              // 正在刷新token，将请求加入队列
              return new Promise((resolve, reject) => {
                tokenRefreshQueue.push({ resolve, reject });
              });
            }

            isRefreshingToken = true;
            let config = error.config;
            console.log("error-config", config);
            config.isRetry = true;
            try {
              // 获取新token
              const tokenRes = await getToken(app_name, IS_DEV);

              // 更新token信息
              chenxingToken = tokenRes?.token;
              identityKey = tokenRes?.identityKey;
              identityType = tokenRes?.identityType;

              // 更新axios默认headers
              instance.defaults.headers.common["authorization"] =
                "Bearer " + chenxingToken;
              instance.defaults.headers.common["Identity-key"] = identityKey;
              instance.defaults.headers.common["Identity-Type"] = identityType;

              // 重试所有等待的请求
              tokenRefreshQueue.forEach(({ resolve }) => {
                resolve(instance(config));
              });
              tokenRefreshQueue = [];
              isRefreshingToken = false;

              // 重试当前请求
              return instance(config);
            } catch (refreshError) {
              // 刷新失败
              tokenRefreshQueue.forEach(({ reject }) => {
                reject(refreshError);
              });
              tokenRefreshQueue = [];
              isRefreshingToken = false;

              // 显示错误信息
              ElMessage.error("登录失效，请重新登录");
              return Promise.reject(refreshError);
            }

          case 403:
            ElMessage.error("权限不足");
            break;

          default:
            ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
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
              des: "辰星网络连接异常",
              level: "error",
              info: {
                error: formatErrInfo(error)
              }
            }
          ]
        );
        ElMessage.error("辰星网络连接异常，请稍后再试");
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

export default createAxios;
