// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { sendWxPusherMessage } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
import md5 from "@/utils/md5";

const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";
let merCode = "00696"; // 兜哥商户号
let priKey = "9PX4UDEGH3NBODPNMP3LO2EBRTKSYHPW"; // 兜哥商户密钥

// 请求拦截器
instance.interceptors.request.use(
  config => {
    // priKey = localStorage.getItem("mayiPlatSubToken");
    // merCode = localStorage.getItem("mayiPlatUserUUID");
    // 检查必填配置
    if (!merCode || !priKey) {
      console.error(
        "ERROR: VITE_MER_CODE or VITE_PRI_KEY not configured in .env"
      );
      ElMessage.error("接口配置缺失，请联系管理员");
      return Promise.reject(new Error("Missing API config"));
    }
    const isPost = config.method?.toLowerCase() === "post";

    // 生成公共参数
    const time = Math.floor(Date.now() / 1000).toString(); // 秒级时间戳
    const publicParams = {
      merCode,
      time,
      v: "1.0" // 接口版本
    };

    // 处理业务参数（支持字符串/对象格式）
    let businessParams = (isPost ? config.data : config.params) || {};
    // 合并参数并处理空值
    const params = { ...businessParams, ...publicParams };
    // console.log("params:", params);
    Object.keys(params).forEach(key => {
      if (params[key] == null) {
        // 处理 null/undefined
        params[key] = "";
      }
    });

    // 生成签名（按文档要求排序+拼接）
    const sortedKeys = Object.keys(params).sort();
    let signStr = "";
    for (const key of sortedKeys) {
      if (key !== "sign") {
        // 排除sign参数
        signStr += `${key}=${params[key]}&`;
      }
    }
    signStr = signStr.slice(0, -1); // 移除末尾&
    const sign = md5.hex_md5(signStr + priKey);

    // 添加签名
    params.sign = sign;

    if (isPost) {
      // POST: 使用 form-urlencoded
      config.headers["Content-Type"] =
        "application/x-www-form-urlencoded;charset=utf-8";
      config.data = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join("&");
    } else {
      // GET: 参数必须放在 params 中（Axios 会自动拼到 URL）
      config.params = params;
    }
    // 生产环境地址处理
    config.url = IS_DEV
      ? config.url
      : `https://piao.mayiufu.com${config.url}`.replace("/newwww", "");

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
    // console.log("response:", data);
    let isErrorByLieRen =
      response.config.url.indexOf("/open/api/") !== -1 && !data.success;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      ElMessage.error(data?.msg || "请求失败");
      // if (data.error?.msg?.includes("登录信息已过期")) {
      //   sendWxPusherMessage({
      //     msgType: 1,
      //     app_name: "蚂蚁平台",
      //     expirePhone: "机器手机号",
      //     transferTip: `登录失效，请检查登录信息维护`
      //   });
      // }
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
