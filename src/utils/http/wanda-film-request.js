// src/utils/http/wanda-film-request.js
// 万达电影直连 API 请求实例（wandafilm.com 域名）
// 通过后端 /wanda-film-ser/ 代理转发，自动完成 Wanda 签名

import axios from "axios";
import { ElMessage } from "element-plus";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { GET_APP_LIST } from "@/common/constant";
import { handleNetworkRetry } from "./retry-helper";

// 允许重试的接口白名单（查询类接口）
const retryWhitelist = [
  "/wanda-film/cinema", // 影院信息
  "/wanda-film/film", // 电影信息
  "/wanda-film/schedule", // 场次信息
  "/wanda-film/seat", // 座位信息
  "/wanda-film/order/query" // 订单查询
];

const createAxios = ({ app_name, timeout = 25 }) => {
  // 创建 axios 实例
  const instance = axios.create({
    baseURL: "",
    timeout: timeout * 1000
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf("/wanda-film/") !== -1) {
        // 获取tokens
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        let session_id = targetLoginList?.[0]?.session_id || "";
        if (config.data?.wanda_token) {
          // console.warn("config.data?.wanda_token", config.data?.wanda_token);
          session_id = config.data.wanda_token;
          delete config.data.wanda_token;
        }
        if (config.params?.wanda_token) {
          // console.warn(
          //   "config.params?.wanda_token",
          //   config.params?.wanda_token
          // );
          session_id = config.params.wanda_token;
          delete config.params.wanda_token;
        }
        let tid = targetLoginList?.[0]?.tid || "";
        if (session_id) {
          tid =
            targetLoginList.find(item => item.session_id === session_id)?.tid ||
            tid;
        }
        // 传递万达用户令牌：X-RY-TOKEN	P6A22AEE986AEC3237CDAC4FDYYNHYKIIYWYHWIZFHWPH
        config.headers["user-token"] = session_id || "";
        // "P6A2168BD9E6DC4301B4D5B34YYNHYKIIYWYHWIFHNDPH";
        // X-RY-USER	YYAHYOZZYW
        config.headers["user-identifier"] = tid || "";
        // "YYAHYOZZYW";

        // 环境适配：开发环境通过 vite proxy，生产环境直连后端
        if (IS_DEV) {
          // 开发环境：通过 Vite proxy (/svpi) 转发
          config.url = config.url.replace("wanda-film", "svpi/wanda-film-ser");
        } else {
          // 生产环境：直连后端服务
          config.url =
            "http://47.113.191.173:3000" +
            config.url.replace("wanda-film", "wanda-film-ser");
        }
      }
      return config;
    },
    error => {
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    response => {
      const data = response.data;

      // 检查万达 API 业务错误
      let isErrorByWanda =
        response.config.url.indexOf("/wanda-film-ser/") !== -1 &&
        data &&
        data.code !== 0;

      if (isErrorByWanda) {
        const msg = data.msg || data.message || data.data?.bizMsg || "请求失败";
        ElMessage.error(msg);

        // 登录失效检测
        if (msg.includes("登录") || data.code === 1016) {
          sendWxPusherMessage({
            msgType: 1,
            app_name: GET_APP_LIST()[app_name] || app_name,
            expirePhone: "机器手机号",
            transferTip: `${GET_APP_LIST()[app_name] || app_name}登录失效，请检查登录信息维护`
          });
        }
        return Promise.reject(data);
      }
      return data;
    },
    async error => {
      const config = error.config;

      // 尝试网络重试（仅白名单接口）
      const retryResult = await handleNetworkRetry(error, config, instance, {
        maxRetries: 3,
        whitelist: retryWhitelist
      });
      if (retryResult) {
        return retryResult;
      }

      const { response } = error;
      if (response && response.status) {
        switch (response.status) {
          case 401:
            break;
          case 504:
            ElMessage.error(
              `${GET_APP_LIST()[app_name] || app_name} API 请求超时`
            );
            break;
          default:
            ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
        }
      } else {
        logUpload(
          {
            plat_name: "wanda-film",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentTime(),
              des: `${GET_APP_LIST()[app_name] || app_name}网络连接异常`,
              level: "error",
              info: {
                error: formatErrInfo(error)
              }
            }
          ]
        );
        ElMessage.error(
          `${GET_APP_LIST()[app_name] || app_name}网络连接异常，请稍后再试`
        );
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

export default createAxios;
