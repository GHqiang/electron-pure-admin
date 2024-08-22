// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";

let appHostObj = {
  ume: "https://oc.yuekeyun.com",
  wanmei: "https://oc.yuekeyun.com",
  yinghuang: "https://oc.yuekeyun.com",
  zheyingshidai: "https://oc.yuekeyun.com",
  renhengmeng: "https://oc.yuekeyun.com",
  yaolai: "https://jccinema.yuekeyun.com"
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

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf(`/${app_name}/`) !== -1) {
        config.headers["Content-Type"] === "application/x-www-form-urlencoded;";
        // 猎人平台接口添加token
        let loginInfoList = window.localStorage.getItem("loginInfoList");
        if (loginInfoList) {
          loginInfoList = JSON.parse(loginInfoList);
        }
        let obj = loginInfoList.find(
          itemA => itemA.app_name === app_name && itemA.session_id
        );
        let token = obj?.session_id || "";
        // console.log("ume-token", token);
        if (config.method === "get") {
        } else {
          let params = config.data;
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
          // config.headers.tenantCode = `cinema_umedy`;
        }
        if (!IS_DEV) {
          // 截取掉/sfc/
          config.url =
            appHostObj[app_name] + config.url.slice(app_name.length + 1);
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
        (!IS_DEV ? true : response.config.url.indexOf(`/${app_name}/`) !== -1) &&
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

  return instance;
};

export default createAxios;
