// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { sendWxPusherMessage, formatErrInfo } from "@/utils/utils";
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
const tableDataStore = usePlatTableDataStore();
// window.tableDataStore = tableDataStore;
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
import mahuaApi from "@/api/mahua-api";

// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

// 是否正在刷新token的标志
let isRefreshing = false;
// 重试队列，每一项是一个待执行的函数
let requests = [];

// 添加token续期方法（需要根据实际情况实现）
const refreshToken = async () => {
  try {
    // 这里需要根据您的实际业务实现token刷新逻辑
    // 示例：调用刷新token的API
    const res = await mahuaApi.refreshToken({
      refreshToken: localStorage.getItem("mahuPlatSubToken")
    });
    if (res?.rtnData?.token) {
      // 修改队列里面的token
      tableDataStore.saveMahuaNewRefreshToken({
        platToken: res?.rtnData?.token,
        platSubToken: res?.rtnData?.refreshToken
      });
      localStorage.setItem("mahuaRefreshTokenResult", JSON.stringify(res));
      tokens.setMahuaPlatToken(res?.rtnData?.token);
      localStorage.setItem("mahuPlatSubToken", res?.rtnData?.refreshToken);
      return res;
    } else {
      localStorage.setItem("mahuaRefreshTokenResult", JSON.stringify(res));
      return { errMsg: "刷新token返回空——" + JSON.stringify(res) };
    }
  } catch (error) {
    console.error("Token刷新失败:", error);
    localStorage.setItem("mahuaRefreshTokenResult", formatErrInfo(error));
    return { errMsg: formatErrInfo(error) };
  }
};

// 处理token过期的情况
const handleTokenExpired = response => {
  const originalRequest = response.config;

  // 如果正在刷新token，将当前请求加入队列
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      requests.push(token => {
        originalRequest.headers["Token"] = token;
        resolve(instance(originalRequest));
      });
    });
  }

  // 设置刷新标志
  isRefreshing = true;

  // 尝试刷新token
  return refreshToken()
    .then(res => {
      if (!res.errMsg) {
        // 刷新成功，执行队列中的所有请求
        requests.forEach(cb => cb(tokens.mahuaToken));
        requests = [];

        // 重试原始请求
        originalRequest.headers["Token"] = tokens.mahuaToken;
        return instance(originalRequest);
      } else {
        // 刷新失败，拒绝所有请求
        requests.forEach(cb => cb(null));
        requests = [];
        // 发送过期通知
        sendWxPusherMessage({
          msgType: 7,
          plat_name: "麻花平台",
          expirePhone: "机器手机号",
          transferTip: `麻花平台token续期失败，请检查登录信息维护${res.errMsg}`
        });
        // ElMessage.error("Token续期失败，请重新登录");
        return Promise.reject(response.data);
      }
    })
    .finally(() => {
      isRefreshing = false;
    });
};

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/mhapi/") !== -1) {
      // 猎人平台接口添加token
      // console.log("tokens.lierenToken", tokens.lierenToken);
      const token = tokens.mahuaToken || "";
      if (token) {
        config.headers["Token"] = `${token}`;
      }
      config.headers["Channelid"] = "C00001";
      config.headers["Txntime"] = +new Date();
      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "https://mhdyp.com/" + config.url.slice(3);
      if (!config.originalUrl) {
        config.originalUrl = config.url;
      } else {
        config.url = config.originalUrl;
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
      response.config.url.indexOf(IS_DEV ? "/mhapi/" : "/api/") !== -1 &&
      data.rtnCode !== "000000";
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      if (data.rtnMsg?.includes("token已过期")) {
        // 处理token过期
        return handleTokenExpired(response);
      }
      ElMessage.error(data.message || data.msg || "请求失败");
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
      ElMessage.error("麻花网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
