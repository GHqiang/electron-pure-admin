// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { platTokens } from "@/store/platTokens";
import { sendWxPusherMessage } from "@/utils/utils";

const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 15 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

let realToken,
  expires,
  token_type = "Bearer";

// 刷新token方法
const refreshToken = async params => {
  try {
    const res = await axios.post(
      "https://merchant-api.yinghuasuan.com/open/v1/getToken",
      params
    );
    console.log("获取token返回", res);
    const tokenData = res.data?.data;
    if (tokenData) {
      realToken = tokenData.token;
      token_type = tokenData.token_type;
      expires = +new Date() + tokenData.expires * 1000;
      tokens.setYinghuasuanPlatRealToken(`${token_type} ${realToken}`);
    }
  } catch (error) {
    console.log("获取token返回异常", error);
  }
};

// token是否过期或无效
const isTokenExpires = () => {
  return !realToken || expires - +new Date() < 3 * 60 * 1000;
};
// 请求拦截器
instance.interceptors.request.use(
  async config => {
    // console.log("tokens.yinghuasuanToken", tokens.yinghuasuanToken);
    const open_secret = tokens.yinghuasuanToken || "";
    const mobile =
      tokens.userInfo?.mobile ||
      localStorage.getItem("yinghuasuanPlatUserUUID");
    if (isTokenExpires()) {
      await refreshToken({
        open_secret,
        mobile
      });
    }
    if (realToken) {
      config.headers.Authorization = `${token_type} ${realToken}`;
    }
    // 生产环境不会跨域
    config.url = IS_DEV
      ? config.url
      : "https://merchant-api.yinghuasuan.com" + config.url;
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

    let isErrorByLieRen = data.code !== 200;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      if (data.msg?.includes("登陆") || data.msg?.includes("登录")) {
        sendWxPusherMessage({
          msgType: 1,
          app_name: "影划算平台",
          expirePhone: "机器手机号",
          transferTip: `平台登录失效，请检查登录信息维护`
        });
      }
      ElMessage.error(data.msg || "请求失败");
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
