// src/utils/axiosInstance.js

import axios from "axios";
import md5 from "../md5.js";
import { ElMessage } from "element-plus";
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

const paramsHandle = e => {
  e.timestamp = +new Date();
  let paramKeys = Object.keys(e).sort();
  let signatureStr = "";

  // 遍历排序后的key，构建签名前的字符串
  paramKeys.forEach(key => {
    signatureStr += `${key}=${e[key]}&`;
  });

  // 添加时间戳到签名字符串
  signatureStr += `key=${e.timestamp}`;

  // MD5加密并转换为大写
  e.sign = md5.hex_md5(signatureStr).toUpperCase();

  // 创建 FormData 对象
  let formData = new FormData();

  // 遍历 JSON 对象的键值对
  Object.keys(e).forEach(key => {
    formData.append(key, e[key]);
  });

  return formData;
};

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/supplier/") !== -1) {
      // config.headers["Content-Type"] = "multipart/form-data"; // 设置正确的 Content-Type
      config.headers["Content-Type"] = "application/x-www-form-urlencoded";

      // console.log("config.headers", config.headers);
      if (config.method === "get") {
        // 如果是GET请求，将参数添加到URL中
        const urlParams = new URLSearchParams(config.params);
        config.url += "?" + urlParams.toString();
        delete config.params;
      } else {
        // POST请求，使用formData封装参数
        config.data = paramsHandle(config.data);

        // 将Content-Type设置为 application/x-www-form-urlencoded

        // 将formData转换为查询字符串
        const query = new URLSearchParams(config.data);
        config.url += "?" + query.toString();
        delete config.data;
      }
      // 生产环境不会跨域
      config.url = IS_DEV ? config.url : "https://api.shenga.co" + config.url;
    }
    // console.log("请求config", config);
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
      response.config.url.indexOf("/supplier/") !== -1 && !data.success;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || "请求失败");
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
          ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
      }
    } else {
      ElMessage.error("网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
