// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 20 * 1000
});
const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/ume/") !== -1) {
      config.headers["Content-Type"] = "multipart/form-data";
      // 猎人平台接口添加token
      let loginInfoList = window.localStorage.getItem("loginInfoList");
      if (loginInfoList) {
        loginInfoList = JSON.parse(loginInfoList);
      }
      let obj = loginInfoList.find(
        itemA => itemA.app_name === "ume" && itemA.session_id
      );
      let token = obj?.session_id || "";
      // console.log("ume-token", token);
      if (config.method === "get") {
        let params = config.params;
        if (params.session_id) {
          token = params.session_id;
          delete config.params.session_id;
        }
      } else {
        let params = config.data;
        if (params.session_id) {
          token = params.session_id;
          delete config.data.session_id;
        }
        const formData = new FormData();
        // 添加 Certificate 到 FormData 中
        formData.append("params", JSON.stringify(config.data));
        config.data = formData;
      }
      if (token) {
        config.headers.Certificate = `${token}`;
      }
      if (!IS_DEV) {
        // 截取掉/sfc/
        config.url = "https://oc.yuekeyun.com" + config.url.slice(4);
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
      response.config.url.indexOf("/ume/") !== -1 && data.status !== "S";
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
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
      ElMessage.error("网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
