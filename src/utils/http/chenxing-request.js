// src/utils/axiosInstance.js

import axios from "axios";
import axiosRetry from "axios-retry";
import { ElMessage } from "element-plus";
import { GE_APP_INFO } from "@/common/constant";

import { getCinemaLoginInfoList, sendWxPusherMessage } from "@/utils/utils";

const getToken = async appId => {
  try {
    // const tokenRes = await APP_API_OBJ[app_name].authToken({
    //   appId: "5868e8d75ba04beda426437ba93ef4c6"
    // });
    const res = await axios.request({
      url: "/svpi/chenxing-ser/api/auth/token",
      method: "post",
      data: {
        api: "api",
        v: "1.0",
        timestamp: +new Date(),
        sign: "sign",
        data: { appId: appId || "5868e8d75ba04beda426437ba93ef4c6" }
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
    console.log("res", res);
    return res?.data?.data;
  } catch (error) {
    console.error("tokenRes error", error);
  }
};
const paramsHandle = (params, app_name) => {
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  let token = targetLoginList?.[0]?.session_id || "";
  let appInfo = GE_APP_INFO(app_name);
  console.log("app_name", app_name, appInfo);
  let api_version = appInfo?.api_version || "";
  if (api_version == "3.0C") {
    let config = {
      k: params?.session_id || token, // 登录接口返回token
      t: 5,
      r: 1,
      v: "V4.0.2",
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
        channelNo: appInfo?.channelCode,
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
      pageNo: "",
      pageSize: "",
      channelCode: appInfo?.channelCode
    };
    return config;
  }
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
  const api_version = GE_APP_INFO(app_name)?.api_version || "";
  // console.warn("api_version", api_version);
  let chenxingToken, identityKey, identityType;

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
      if (GE_APP_INFO(app_name)) {
        if (!chenxingToken && config.url.indexOf("/auth/") === -1) {
          const tokenRes = await getToken();
          chenxingToken = tokenRes.token;
          identityKey = tokenRes.identityKey;
          identityType = tokenRes.identityType;
        }
        config.headers.authorization = "Bearer " + chenxingToken;
        config.headers["Content-Type"] = "application/json";
        config.headers["Identity-key"] = identityKey;
        config.headers["Identity-Type"] = identityType;

        if (config.method === "get") {
          config.params = paramsHandle(config.params, app_name);
          config.session_id = config.params.session_id;
        } else {
          // POST请求，使用formData封装参数
          config.data = paramsHandle(config.data, app_name);
          config.session_id = config.data.session_id;
        }
        // 生产环境不会跨域
        if (!IS_DEV) {
          config.url = "http://capi.oristarcloud.com" + config.url;
          if (api_version == "C") {
            config.url = "https://open.oristarcloud.com" + config.url.slice(9); // 截取掉/chenxing
          }
        } else {
          if (api_version == "C") {
            config.url = config.url.replace("chenxing", "svpi/chenxing-ser");
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
      // 对响应进行统一处理
      const data = response.data;
      let whitelistSp = [];

      let isError =
        api_version === "3.0C" ? data.code !== 200 : data.retCode != "0";
      if (
        isError &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        console.warn("接口响应失败", data);
        // 辰星C端失效处理，待添加3.0C端失效判断
        if (data.retMsg.includes("登录") || data.msg.includes("登录")) {
          let app_label = GE_APP_INFO(app_name).app_label;
          ElMessage.warning(`${app_label}登录失效，请重新设置登录信息`);
          let session_id = response?.config?.session_id;
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
          // 此处加个消息推送
          return Promise.reject(data);
        }
        ElMessage.error(data.msg || data.retMsg || "请求失败");
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
