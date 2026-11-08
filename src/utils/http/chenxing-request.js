import { attachTracking } from "@/common/networkMonitor";
// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { GET_APP_INFO } from "@/common/constant";

import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getCurrentTime,
  formatErrInfo
} from "@/utils/utils";
import { handleNetworkRetry } from "./retry-helper";
import { enqueueNetworkError } from "@/common/networkErrorBatcher";
import { getServerBaseUrl } from "@/common/serverHost";
import {
  isRateLimitedPayload,
  buildRateLimitedError,
  createCircuitBreaker,
  isBreakerGuardedUrl,
  isResilienceApp
} from "./rateLimitGuard";

// ===== 上游限流韧性（2026-11-08，仅幸福蓝海）=====
// 背景：幸福看（辰星 3.0C）高峰期限流返回「现在人太多了，请耐心等待一下下哦」，
//       报价队列会以秒级频率持续重撞，导致报错风暴 + 请求量翻倍。
// 1) Toast 节流：同一文案 30 秒只弹一次，避免屏幕被同一错误刷满
// 2) 限流熔断：2 分钟窗口内 5 次限流 → 冷却 60 秒，期间只读查询快速失败、不再打扰上游
// 3) 其它辰星系列不受影响：不计数、不拦截、不节流
const TOAST_THROTTLE_MS = 30 * 1000;
const _toastLastAt = new Map();
const showErrorThrottled = msg => {
  if (!msg) return;
  const now = Date.now();
  const last = _toastLastAt.get(msg) || 0;
  if (now - last < TOAST_THROTTLE_MS) return;
  _toastLastAt.set(msg, now);
  // 文案种类有限，兜底清理防止 Map 膨胀
  if (_toastLastAt.size > 50) {
    const firstKey = _toastLastAt.keys().next().value;
    if (firstKey !== undefined) _toastLastAt.delete(firstKey);
  }
  ElMessage.error(msg);
};

const rateLimitBreaker = createCircuitBreaker({
  threshold: 5,
  cooldownMs: 60 * 1000
});

// 目标系列（幸福蓝海）走 30 秒文案节流；其它辰星系列保持原有「立即弹窗」行为
const notifyError = (appName, msg, silent) => {
  if (!msg || silent) return;
  if (isResilienceApp(appName)) showErrorThrottled(msg);
  else ElMessage.error(msg);
};

const getToken = async (app_name, IS_DEV) => {
  try {
    // const tokenRes = await APP_API_OBJ[app_name].authToken({
    //   appId: "5868e8d75ba04beda426437ba93ef4c6"
    // });
    let url = "/svpi/chenxing-ser/api/auth/token";
    if (!IS_DEV) {
      url = getServerBaseUrl(url) + "/chenxing-ser/api/auth/token";
    }
    const res = await axios.request({
      url: url,
      method: "post",
      data: {
        api: "api",
        v: "1.0",
        timestamp: +new Date(),
        sign: "sign",
        data: { appId: GET_APP_INFO(app_name)?.appId }
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
    // console.log("res", res);
    return res?.data?.data;
  } catch (error) {
    console.error("tokenRes error", error);
    throw error; // 确保错误能被后续捕获
  }
};

const paramsHandle = (params, app_name) => {
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  let token = targetLoginList?.[0]?.session_id || "";
  let appInfo = GET_APP_INFO(app_name);
  // console.log("app_name", app_name, appInfo);
  let api_version = appInfo?.api_version || "";

  if (api_version == "3.0C") {
    let config = {
      k: params?.session_id || token, // 登录接口返回token
      t: 5,
      r: 1,
      v: appInfo?.api_v || "V4.0.2",
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
      // marketingName: "172.30.82.8", // 影院列表可以拿到
      // marketingCode: "CRM001", // 影院列表可以拿到
      // defaultCardNo: "",
      // crmGroup: "CRM001" // 影院列表可以拿到
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
      pageNo: params.pageNo || "",
      pageSize: params.pageSize || "",
      channelCode: appInfo?.channelCode
    };
    return config;
  }
};
export { paramsHandle };
const createAxios = ({ app_name, timeout = 20 }) => {
  const instance = axios.create({
    baseURL: "",
    timeout: timeout * 1000
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";
  const api_version = GET_APP_INFO(app_name)?.api_version || "";

  // 用于存储token刷新状态
  let chenxingToken = null;
  let identityKey = null;
  let identityType = null;
  let isRefreshingToken = false;
  let tokenRefreshQueue = [];

  // 请求拦截器
  instance.interceptors.request.use(
    async config => {
      if (GET_APP_INFO(app_name)) {
        // 限流冷却期内直接快速失败（仅幸福蓝海 + 仅只读查询）
        // 锁座/下单/支付/释放/取消等写接口永不被拦，避免座位残留或支付中断
        if (
          isResilienceApp(app_name) &&
          isBreakerGuardedUrl(config.url) &&
          rateLimitBreaker.isOpen(app_name)
        ) {
          return Promise.reject(
            buildRateLimitedError(
              { msg: "上游限流冷却中，已跳过本次请求" },
              app_name
            )
          );
        }
        // 获取token（如果尚未获取且需要）
        if (
          !chenxingToken &&
          api_version == "C" &&
          config.url.indexOf("/auth/") === -1
        ) {
          try {
            const tokenRes = await getToken(app_name, IS_DEV);
            chenxingToken = tokenRes?.token;
            // 放开后可用会员卡同步功能测试401场景
            // chenxingToken = "";
            identityKey = tokenRes?.identityKey;
            identityType = tokenRes?.identityType;
          } catch (error) {
            console.error("Failed to get token", error);
          }
        }

        // 设置请求头
        if (chenxingToken) {
          config.headers.authorization = "Bearer " + chenxingToken;
          config.headers["Identity-key"] = identityKey;
          config.headers["Identity-Type"] = identityType;
        }
        config.headers["Content-Type"] = "application/json";
        // 如果是c端401过期后重试不再处理参数和url
        if (config.isRetry) return config;
        // 处理参数
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        let token = targetLoginList?.[0]?.session_id || "";

        if (config.method === "get") {
          config.params = paramsHandle(config.params, app_name);
          config.session_id = config.params?.session_id || token;
        } else {
          // POST请求，使用formData封装参数
          config.data = paramsHandle(config.data, app_name);
          config.session_id = config.data?.session_id || token;
        }
        config.headers["version"] = api_version;

        // 处理URL
        if (!IS_DEV) {
          if (api_version == "C") {
            // 需要服务器转发（分片端口，8-17 弹窗根治）
            config.url =
              getServerBaseUrl(config.url) +
              "/chenxing-ser" +
              config.url.slice(9); // 截取掉/chenxing
          } else {
            // 不需要转发
            config.url = "https://capi.oristarcloud.com" + config.url;
          }
        } else {
          if (api_version == "C") {
            config.url = config.url.replace("chenxing", "svpi/chenxing-ser");
          } else if (api_version == "3.0C") {
            config.url = "/svpi/chenxing-ser" + config.url;
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
      const data = response.data;
      let config = response.config;
      let whitelistSp = [];
      const isSilent = config?.silent === true;

      // 检查API版本并判断错误
      let isError =
        api_version === "3.0C" ? data.code !== 200 : data.retCode !== "0";

      if (isError && !whitelistSp.some(item => config.url.includes(item))) {
        console.warn("接口响应失败", data);
        let isCExpried =
          ["用户未登录", "会话无效或已过期"].some(item =>
            data.retMsg?.includes(item)
          ) && api_version == "C";
        let is3CExpried = data.msg?.includes("登录") && api_version == "3.0C";

        if (isCExpried || is3CExpried) {
          // 登录失效是真实业务响应：先结束半开/清零，且不计入限流，
          // 否则会占用熔断节奏、延迟甚至吞掉登录告警（2026-11-08 评审 I6）
          if (isResilienceApp(app_name)) {
            rateLimitBreaker.onNonRateLimited(app_name);
          }
          let app_label = GET_APP_INFO(app_name).app_label;
          ElMessage.warning(`${app_label}登录失效，请重新设置登录信息`);
          let session_id = config?.session_id;
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

          return Promise.reject(data);
        }

        // 上游限流识别：仅幸福蓝海启用（其它辰星系列保持原有行为）
        const rateLimited =
          isResilienceApp(app_name) && isRateLimitedPayload(data);
        if (rateLimited) {
          rateLimitBreaker.onRateLimited(app_name);
          // 后台报价/拉单等静默请求只在日志留痕；其余按同一文案 30 秒节流
          notifyError(
            app_name,
            data.msg || data.retMsg || "请求失败",
            isSilent
          );
          return Promise.reject(buildRateLimitedError(data, app_name));
        }

        if (isResilienceApp(app_name)) {
          rateLimitBreaker.onNonRateLimited(app_name);
        }
        notifyError(app_name, data.msg || data.retMsg || "请求失败", isSilent);
        return Promise.reject(data);
      }
      if (isResilienceApp(app_name)) {
        rateLimitBreaker.onNonRateLimited(app_name);
      }
      return data;
    },
    async error => {
      const { response } = error;
      // 熔断快速失败：不是真实网络异常，直接透传，避免误报「网络连接异常」/重复计数
      if (error?.isRateLimited) return Promise.reject(error);
      const isSilent = error.config?.silent === true;

      // HTTP 429：仅幸福蓝海走限流分支；其它系列保持原有「请求错误」处理
      if (response?.status === 429 && isResilienceApp(app_name)) {
        rateLimitBreaker.onRateLimited(app_name);
        notifyError(app_name, "请求过于频繁，请稍后再试", isSilent);
        return Promise.reject(error);
      }
      // 任何非限流错误（401/5xx/网络错误）都让熔断状态可恢复：
      // 否则半开探针遇到业务失败会长期停在「1 请求/25s」（评审 C1）
      if (isResilienceApp(app_name)) {
        rateLimitBreaker.onNonRateLimited(app_name);
      }

      // 尝试网络重试（无白名单限制，与原来 axios-retry 行为一致）
      const retryResult = await handleNetworkRetry(
        error,
        error.config,
        instance,
        {
          maxRetries: 3,
          whitelist: [] // 空数组表示所有接口都允许重试
        }
      );
      if (retryResult) {
        return retryResult;
      }

      if (response) {
        switch (response.status) {
          case 401:
            // 非C端场景直接返回异常
            if (api_version !== "C") {
              notifyError(
                app_name,
                `请求错误 ${response.status}: ${error.message}`,
                isSilent
              );
              return Promise.reject(error);
            }
            // 处理401：刷新token并重试
            if (isRefreshingToken) {
              // 正在刷新token，将请求加入队列
              return new Promise((resolve, reject) => {
                tokenRefreshQueue.push({ resolve, reject });
              });
            }

            isRefreshingToken = true;
            let config = error.config;
            console.log("error-config", config);
            config.isRetry = true;
            try {
              // 获取新token
              const tokenRes = await getToken(app_name, IS_DEV);

              // 更新token信息
              chenxingToken = tokenRes?.token;
              identityKey = tokenRes?.identityKey;
              identityType = tokenRes?.identityType;

              // 更新axios默认headers
              instance.defaults.headers.common["authorization"] =
                "Bearer " + chenxingToken;
              instance.defaults.headers.common["Identity-key"] = identityKey;
              instance.defaults.headers.common["Identity-Type"] = identityType;

              // 重试所有等待的请求
              tokenRefreshQueue.forEach(({ resolve }) => {
                resolve(instance(config));
              });
              tokenRefreshQueue = [];
              isRefreshingToken = false;

              // 重试当前请求
              return instance(config);
            } catch (refreshError) {
              // 刷新失败
              tokenRefreshQueue.forEach(({ reject }) => {
                reject(refreshError);
              });
              tokenRefreshQueue = [];
              isRefreshingToken = false;

              // 显示错误信息
              ElMessage.error("登录失效，请重新登录");
              return Promise.reject(refreshError);
            }

          case 403:
            notifyError(app_name, "权限不足", isSilent);
            break;

          default:
            notifyError(
              app_name,
              `请求错误 ${response.status}: ${error.message}`,
              isSilent
            );
        }
      } else {
        enqueueNetworkError(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentTime(),
              des: "辰星网络连接异常",
              level: "error",
              info: {
                error: formatErrInfo(error)
              }
            }
          ]
        );
        notifyError(app_name, "辰星网络连接异常，请稍后再试", isSilent);
      }
      return Promise.reject(error);
    }
  );

  attachTracking(instance);
  return instance;
};

export default createAxios;
