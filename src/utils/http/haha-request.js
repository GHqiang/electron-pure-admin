// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { platTokens } from "@/store/platTokens";
import { cryptoFunctions } from "@/utils/utils";
const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

function jsonToUrlEncoded(json) {
  return Object.keys(json)
    .map(key => {
      if (typeof json[key] === "object" && !Array.isArray(json[key])) {
        // If the value is an object, recursively call the function and prepend the key.
        return Object.keys(json[key]).flatMap(subKey => {
          const subValue = json[key][subKey];
          return jsonToUrlEncoded({ [`${key}[${subKey}]`]: subValue });
        });
      } else if (Array.isArray(json[key])) {
        // If the value is an array, map over each element with the appropriate index.
        return json[key].flatMap((value, index) => {
          if (typeof value === "object") {
            return Object.keys(value).flatMap(subKey => {
              const subValue = value[subKey];
              return jsonToUrlEncoded({
                [`${key}[${index}][${subKey}]`]: subValue
              });
            });
          } else {
            return `${`${key}[${index}]`}=${value}`;
          }
        });
      } else {
        // If the value is neither an object nor an array, simply encode and append.
        return `${key}=${json[key]}`;
      }
    })
    .reduce((acc, curr) => acc.concat(curr), [])
    .join("&");
}

// function jsonToUrlEncoded(json) {
//   return Object.keys(json)
//     .map(key => {
//       return encodeURIComponent(key) + "=" + encodeURIComponent(json[key]);
//     })
//     .join("&");
// }

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/api/") !== -1) {
      // 猎人平台接口添加token
      // console.log("tokens.lierenToken", tokens.lierenToken);
      const token = tokens.hahaToken || "";
      if (token) {
        config.headers["Token"] = `${token}`;
      }
      // 生产环境不会跨域
      config.url = IS_DEV ? config.url : "https://hahapiao.cn" + config.url;

      if (config.url.indexOf("/api/Synchro/pushOrder") !== -1) {
        // 特殊处理pushOrder接口
        config.headers["Content-Type"] ===
          "application/x-www-form-urlencoded;charset=UTF-8";
        config.data = jsonToUrlEncoded(config.data);
      }
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
    let data = response.data;
    // let whitelistSp = ['/sp/order', '/sp/unlock']
    let whitelistSp = [];

    let isErrorByLieRen =
      response.config.url.indexOf("/api/") !== -1 && data.code != 200;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data.message || data.msg || "请求失败");
      return Promise.reject(data);
    }
    if (response.config.url.includes("/api/Synchro/pcToList")) {
      data.data = cryptoFunctions.decrypt(data.data, tokens.hahaToken);
      data.data = JSON.parse(data.data);
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
