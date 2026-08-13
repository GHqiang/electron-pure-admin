// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { handleNetworkRetry } from "./retry-helper";
import { saveFailLogToLocal } from "@/common/localFailLog";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 创建axios实例
const instance = axios.create({
  //   baseURL: process.env.VITE_API_BASE_URL,
  baseURL: "",
  timeout: 30 * 1000
});

const NODE_ENV = process.env.NODE_ENV;
const IS_DEV = NODE_ENV === "development";

// ========== 服务健康检测 ==========
// 服务不可用状态码：502(网关错误) 503(服务不可用) 504(网关超时) 429(请求过多/负载满)
const SERVICE_DOWN_STATUS_CODES = [502, 503, 504, 429];
// 连续失败阈值，超过此数认为服务已挂
const SERVICE_DOWN_THRESHOLD = 10;
// 通知冷却时间（毫秒），避免短时间内重复发送微信消息
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

let serviceDownCount = 0;
let lastNotifyTime = 0;
let hasLoggedOut = false; // 防止重复触发退出登录

/**
 * 检测是否为服务不可用的状态码
 * @param {number} status - HTTP 状态码
 * @returns {boolean}
 */
const isServiceDownStatus = status => {
  return SERVICE_DOWN_STATUS_CODES.includes(status);
};

/**
 * 触发服务不可用处理：退出登录 + 发送微信通知
 * @param {number} status - 触发的 HTTP 状态码
 * @param {string} statusText - 状态描述
 */
const handleServiceDown = (status, statusText) => {
  // 防止重复触发
  if (hasLoggedOut) return;
  hasLoggedOut = true;

  const now = Date.now();
  const statusDesc = {
    502: "Bad Gateway（网关错误）",
    503: "Service Unavailable（服务不可用）",
    504: "Gateway Timeout（网关超时）",
    429: "Too Many Requests（负载已满）"
  };
  const desc = statusDesc[status] || `HTTP ${status}`;
  const errorMsg = `机器服务异常：${desc}，连续失败${serviceDownCount}次，系统自动退出登录`;

  console.error(`[服务健康检测] ${errorMsg}`);

  // 发送微信通知（带冷却时间）
  if (now - lastNotifyTime > NOTIFY_COOLDOWN_MS) {
    lastNotifyTime = now;
    sendWxPusherMessage({
      msgType: 9, // 9-日志上传异常
      app_name: "机器服务",
      transferTip: errorMsg
    }).catch(err => {
      console.error("[服务健康检测] 微信通知发送失败:", err);
    });
  }

  // 退出登录：清除本地状态并刷新页面
  ElMessage({
    type: "error",
    message: "机器服务已断开，系统将自动退出登录",
    center: true,
    duration: 5 * 1000,
    onClose: () => {
      console.warn("[服务健康检测] 清除token并刷新页面");
      tokens.removeSelfPlatToken();
      window.localStorage.removeItem("selfToken");
      window.localStorage.removeItem("userInfo");
      window.localStorage.removeItem("user-info");
      location.reload();
    }
  });
};

// 请求拦截器
instance.interceptors.request.use(
  config => {
    if (config.url.indexOf("/svpi/") !== -1) {
      // 自身平台接口添加token
      const token = tokens.selfToken || localStorage.getItem("selfToken") || "";
      // console.log("token", token);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url
        : "http://47.113.191.173:3000" + config.url.slice(5);
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
    // 请求成功，重置服务不可用计数器
    serviceDownCount = 0;
    hasLoggedOut = false;

    // 对响应进行统一处理
    const data = response.data;
    let whitelistSp = [];

    let isErrorByLieRen =
      (IS_DEV ? response.config.url.indexOf("/svpi/") !== -1 : true) &&
      data.code !== 1;
    if (
      isErrorByLieRen &&
      !whitelistSp.some(item => response.config.url.includes(item))
    ) {
      console.warn("接口响应失败", data);
      if (data.errCode === 401) {
        ElMessage({
          type: "error",
          message: "登录失效，请重新登录",
          center: true,
          duration: 5 * 1000,
          onClose: () => {
            console.warn("准备清除token刷新页面");
            tokens.removeSelfPlatToken();
            window.localStorage.removeItem("selfToken");
            window.localStorage.removeItem("userInfo");
            window.localStorage.removeItem("user-info");
            // 刷新页面以确保状态完全重置
            location.reload();
          }
        });
        return Promise.reject(data);
      }
      ElMessage.error(data.msg || "请求失败");
      return Promise.reject(data);
    }
    return data;
  },
  async error => {
    const { response } = error;

    // 尝试网络重试（无白名单限制，与原来 axios-retry 行为一致）
    const retryResult = await handleNetworkRetry(
      error,
      error.config,
      instance,
      {
        maxRetries: 2,
        whitelist: [] // 空数组表示所有接口都允许重试
      }
    );
    if (retryResult) {
      return retryResult;
    }

    // 对HTTP错误码进行处理
    if (response && response.status) {
      // 检测服务不可用状态码
      if (isServiceDownStatus(response.status)) {
        serviceDownCount++;
        console.warn(
          `[服务健康检测] 检测到服务异常 HTTP ${response.status}，连续失败次数：${serviceDownCount}/${SERVICE_DOWN_THRESHOLD}`
        );

        if (serviceDownCount >= SERVICE_DOWN_THRESHOLD) {
          handleServiceDown(response.status, response.statusText);
        }

        // 仍然走原有的错误处理逻辑
        ElMessage.error(
          `服务异常 (${response.status})，第${serviceDownCount}次失败`
        );
        return Promise.reject(error);
      }

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
      // 网络异常本地落盘（整改 D3）：弹窗时间与后端 proxy_record/连接池日志对表用
      try {
        saveFailLogToLocal(
          [
            {
              des: "机器服务网络连接异常",
              level: "error",
              info: {
                url: error.config?.url || "",
                code: error.code || "",
                message: error.message || "",
                timeoutMs: error.config?.timeout || 0,
                retried: !!retryResult
              }
            }
          ],
          { plat_name: "jiqi", app_name: "", order_number: "", type: "" },
          "network-error"
        );
      } catch (e) {
        /* 日志落盘失败不影响主流程 */
      }
      logUpload(
        {
          plat_name: "jiqi",
          app_name: "",
          order_number: "",
          type: ""
        },
        [
          {
            opera_time: getCurrentTime(),
            des: "机器服务网络连接异常",
            level: "error",
            info: {
              error: formatErrInfo(error)
            }
          }
        ]
      );
      ElMessage.error("机器服务网络连接异常，请稍后再试");
    }
    return Promise.reject(error);
  }
);

export default instance;
