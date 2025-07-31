import axios from "axios";
import { ElMessage } from "element-plus";
import { GE_APP_INFO } from "@/common/constant";
import { APP_API_OBJ } from "@/common/index";
// 统一日志类
import Logger from "@/common/logger";
let logger = new Logger({ logType: 3 });

import {
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  formatErrInfo
} from "@/utils/utils";
import { md5 } from "./crypto"; // 从原代码中提取的 MD5 函数（见下文）
window.md51 = md5;
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { user_id }
} = platTokens();

// MTOP 配置
const MTOP_CONFIG = {
  baseURL: "https://mtop.yuekeyun.com",
  //  ("waptest" === r.subDomain ? "4272" : "12574478")
  jsv: "2.4.12",
  appKey: "12574478",
  version: "1.0", // 默认 API 版本
  subVersion: "2.0", // 默认 API 版本
  useSign: true // 是否启用签名
};

// 获取bx-ua及bx-umidtoken
const getumidToken = () => {
  return new Promise((resolve, reject) => {
    const { use: a } = window.AWSC || {};
    const i = new Promise(e => {
      if (!a) return e("");
      try {
        a("um", (t, n) => {
          "loaded" === t
            ? n.init(
                {
                  appName: "lark-cinemaprod",
                  serviceLocation: "cn"
                },
                (t, n) => {
                  e(("success" === t && n.tn) || "");
                }
              )
            : e("");
        });
      } catch (t) {
        e("");
      }
    });

    const o = new Promise(e => {
      if (!a) return e("");
      try {
        a("uab", (t, n) => {
          if ("loaded" === t) {
            const t = n.getUA();
            e(t || "");
          } else {
            e("");
          }
        });
      } catch (t) {
        e("");
      }
    });

    Promise.all([i, o])
      .then(e => {
        let [t, n] = e;
        resolve({
          umidToken: t || "",
          ua: n || ""
        });
      })
      .catch(() => {
        resolve({
          umidToken: "",
          ua: ""
        });
      });
  });
};

// 不走代理的url列表
const noProxyUrlList = [
  "cinema.citycinemas", // 调试时可注释
  "authn.refresh",
  "cinemafilms.get",
  "film.cinemafilms",
  "schedule.filmschedules",
  "seat.scheduleseats.get",
  "seat.scheduleseats.lock",
  "seat.scheduleseatprices.get",
  "card.membercards.get",
  "coupon.mycoupon.get",
  "order.ticketorder.settle",
  "order.ticketorderpromo.settle",
  "order.detail.get",
  "seat.scheduleseats.unlock",
  "coupon.mycoupon.bindcoupon"
];
// 是否不需要代理
const checkUrlNoNeedProxy = url => {
  return noProxyUrlList.some(item => url?.toLowerCase().includes(item));
};

const urlObj = {
  "mtop.alipic.lark.cinema.citycinemas.get":
    "mtop.alipic.lark.cinema.cityCinemas.get",
  "mtop.alipic.lark.account.authn.refresh":
    "mtop.alipic.lark.account.authn.refresh",
  "mtop.alipic.lark.combo.common.get": "mtop.alipic.lark.combo.common.get",
  "mtop.alipic.lark.card.membercards.get":
    "mtop.alipic.lark.card.memberCards.get",
  "mtop.alipic.lark.film.cinemafilms.get":
    "mtop.alipic.lark.film.cinemaFilms.get",
  "mtop.alipic.lark.schedule.filmschedules.get":
    "mtop.alipic.lark.schedule.filmSchedules.get",
  "mtop.alipic.lark.seat.scheduleseats.get":
    "mtop.alipic.lark.seat.scheduleSeats.get",
  "mtop.alipic.lark.seat.scheduleseats.lock":
    "mtop.alipic.lark.seat.scheduleSeats.lock",
  "mtop.alipic.lark.order.ticketorder.settle":
    "mtop.alipic.lark.order.ticketOrder.settle",
  "mtop.alipic.lark.order.ticketorder.create":
    "mtop.alipic.lark.order.ticketOrder.create",
  "mtop.alipic.lark.order.detail.get": "mtop.alipic.lark.order.detail.get",
  "mtop.alipic.lark.order.order.cancel": "mtop.alipic.lark.order.order.cancel",
  "mtop.alipic.lark.coupon.mycoupon.get":
    "mtop.alipic.lark.coupon.myCoupon.get",
  "mtop.alipic.lark.seat.scheduleseatprices.get":
    "mtop.alipic.lark.seat.scheduleSeatPrices.get",
  "mtop.alipic.lark.order.ticketorderpromo.settle":
    "mtop.alipic.lark.order.ticketOrderPromo.settle",
  "mtop.alipic.lark.seat.scheduleseats.unlock":
    "mtop.alipic.lark.seat.scheduleSeats.unlock",
  "mtop.alipic.lark.order.orders.get": "mtop.alipic.lark.order.orders.get"
};
// 获取url
const getUrl = (token, sid, url, params) => {
  const { version, subVersion, jsv, appKey } = MTOP_CONFIG;
  // console.log(token, url, params);
  let signToken = token.split(";")?.[0]?.split("_")[0];
  let t = new Date().getTime();
  // 生成请求签名
  let signStr =
    signToken + "&" + t + "&" + appKey + "&" + JSON.stringify(params);
  let sign = md5(signStr);
  let api = urlObj[url.replace("/fenghuang/", "")];
  let path = `${url}/${version}/${subVersion}/?jsv=${jsv}&appKey=${appKey}&t=${t}&sign=${sign}&c=${token}&v=${version}&type=originaljson&dataType=json&timeout=20000&url=${api}&api=${api}`;
  const noSidUrlList = ["authn.refresh", "citycinemas.get"];
  if (sid && !noSidUrlList.some(item => url.includes(item))) {
    path = path + `&sid=${sid}`;
  }
  path = path + `&_bx-m=1`;
  return path;
};

const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: timeout * 1000,
    withCredentials: true
  });
  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";
  let tokenC = "",
    ua = "",
    umidToken = "",
    sid = "", // 授权刷新接口返回的accessToken
    tid = "", // 用于授权刷新接口传参，从该接口获取返回值refreshToken
    mobile = "",
    newSidObj = {};

  logger.init({
    plat_name: "",
    app_name,
    order_number: ""
  });
  // 获取新的sid
  const getNewSid = async (retryCount = 0) => {
    let MAX_RETRIES = 2;
    try {
      const sidRes = await APP_API_OBJ[app_name].authRefresh({
        refreshToken: tid
      });
      logger.infoSave("sid续期返回", {
        sidRes
      });
      logger.logUpload();
      // console.log("sidRes", sidRes);
      return sidRes;
      // let sid = sidRes?.bizValue?.sid;
      // if (sid) {
      //   sid = sid;
      //   // 更新对应手机号的token
      //   if (config.mobile) {
      //     newLarkSidObj[config.mobile] = sid;
      //   }
      // }
    } catch (error) {
      console.error("获取sid失败", error);
      logger.errorSave("sid续期失败", {
        app_name,
        tid,
        mobile,
        error: formatErrInfo(error)
      });
      logger.logUpload();
      if (retryCount < MAX_RETRIES) {
        return getNewSid(retryCount + 1); // 递归重试
      }
    }
  };
  // 请求拦截器
  instance.interceptors.request.use(
    async config => {
      config.headers["Content-Type"] = "application/x-www-form-urlencoded";
      // 仅处理 MTOP 请求（路径以 /fenghuang 开头）
      if (!config.url.startsWith("/fenghuang")) return config;
      let targetLoginList = getCinemaLoginInfoList().filter(
        item => item.app_name === app_name && item.mobile && item.session_id
      );
      // 登录标识：larkSid
      // e6b99a4fe34244d680a8e57ae79eff3b
      sid = targetLoginList?.[0]?.session_id || "";
      tid = targetLoginList?.[0]?.tid || "";
      if (config.data?.fenghuangToken) {
        sid = config.data?.fenghuangToken;
        tid = targetLoginList.find(itemA => itemA.session_id === sid)?.tid;
        delete config.data.fenghuangToken;
      }
      mobile = targetLoginList.find(itemA => itemA.session_id === sid)?.mobile;
      // 如果对应的手机号的token有新的直接获取新的
      if (mobile && newSidObj[mobile]) {
        sid = newSidObj[mobile];
      }
      config.mobile = mobile;
      // 保存原始参数和原始URL
      if (!config.originalData) {
        config.originalData = {
          ...config.data,
          channelCode: GE_APP_INFO(app_name)?.channelCode,
          leaseCode: GE_APP_INFO(app_name)
            ?.channelCode?.split("_")?.[0]
            ?.toLowerCase()
        };
      }
      let params = config.originalData;
      if (!config.originalUrl) {
        config.url = getUrl(tokenC, sid, config.url, params);
        config.originalUrl = config.url;
      }

      const uidRes = await getumidToken();
      // console.log("uidRes", uidRes);
      ua = uidRes?.ua;
      umidToken = uidRes?.umidToken;
      if (sid) {
        config.headers["fenghuangtoken"] = sid;
        config.headers["bx-ua"] = ua;
        config.headers["bx-umidtoken"] = umidToken;
      }
      config.headers["x-tap"] = "wx";
      config.headers["x-xweb_xhr"] = "1";
      // 该字段必须，否则会报“小程序访问未授权”(这里需要注意下是否每个小程序会不一样)
      // 可从抓包请求头里找referer字段(23不确定是从哪来的，appId可随便找个借口看请求头里referer字段中间部分)
      config.headers["referer-url"] =
        `https://servicewechat.com/${GE_APP_INFO(app_name)?.appId}/page-frame.html`;

      // 默认都走代理，白名单不走代理
      let isNoProxy = checkUrlNoNeedProxy(config.url);
      if (isNoProxy) {
        config.headers["Is-No-Proxy"] = 1;
      }
      config.headers["APP-NAME"] = app_name;
      config.headers["USER-ID"] = user_id;

      if (config.method === "get") {
        config.params = params;
      } else {
        config.data = { data: JSON.stringify(params) };
      }

      // 生产环境不会跨域
      config.url = IS_DEV
        ? config.url.replace("fenghuang", "svpi/fenghuang-ser")
        : "http://47.113.191.173:3000" +
          "/fenghuang-ser" +
          config.originalUrl.slice(10);

      config.responseType = "arraybuffer";

      return config;
    },
    error => {
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    async response => {
      // 对响应进行统一处理
      const headers1 = response.headers; // 响应头
      let data = response.data;
      let config = response.config;
      // console.log("headers1===>", headers1);
      // console.log("config===>", config);

      try {
        const decoder = new TextDecoder("utf-8");
        const jsonStr = decoder.decode(data);
        // data = data.toString("utf-8");
        // console.log("data===>1", jsonStr);
        data = JSON.parse(jsonStr);
      } catch (error) {
        console.warn("json解析失败==>", error);
      }
      // console.log("data===>", data);

      let isError =
        response.config.url.indexOf("/fenghuang-ser/") !== -1 &&
        !data?.ret?.[0]?.includes("SUCCESS::调用成功");

      if (isError) {
        let errReason = data?.data?.bizMsg || data?.ret?.[0];
        console.error("失败原因", errReason, config.retryCount, sid, tid);
        // 刷新接口的刷新令牌过期（需要重新登录抓包维护该值tid）
        if (
          errReason === "FAIL_BIZ_INVALID_REFRESH_TOKEN::令牌过期" &&
          config.url.includes("authn.refresh")
        ) {
          console.warn("tid过期需重新维护登录信息");
          let app_label = GE_APP_INFO(app_name).app_label;
          ElMessage.warning(`${app_label}登录失效，请重新设置登录信息`);
          console.warn("登录失效", app_label, mobile);
          sendWxPusherMessage({
            msgType: 1,
            app_name: app_label,
            expirePhone: mobile,
            transferTip: `${app_label}登录失效，请检查登录信息维护`
          });
          // 消息推送待补充，提示用户重新登录维护登录信息
          return Promise.reject(`${app_label}登录失效`);
        }
        let isRetryCount = !config.retryCount || config.retryCount < 3;
        if (
          ["FAIL_SYS_SESSION_EXPIRED::Session过期"].includes(errReason) &&
          isRetryCount &&
          !config.url.includes("authn.refresh")
        ) {
          logger.errorSave("Session过期准备续期", { sid, tid });
          config.retryCount = (config.retryCount || 0) + 1;
          const sidRes = await getNewSid(tid);
          console.warn("sid过期获取sidRes结果", sidRes);
          if (sidRes?.accessToken) {
            // 更新对应手机号的token
            if (config.mobile) {
              sid = sidRes.accessToken;
              newSidObj[config.mobile] = sidRes.accessToken;
            }
            tid = sidRes.refreshToken;
            // 重新生成接口url(主要是sign签名和参数有关)
            config.url = config.originalUrl.split("/1.0/")[0];
            config.url = getUrl(tokenC, sid, config.url, config.originalData);
            config.url = IS_DEV
              ? config.url.replace("fenghuang", "svpi/fenghuang-ser")
              : "http://47.113.191.173:3000" +
                "/fenghuang-ser" +
                config.url.slice(10);
            return instance(config);
          }
        }
        if (
          isRetryCount &&
          [
            "FAIL_SYS_TOKEN_EMPTY::令牌为空",
            "FAIL_SYS_TOKEN_ILLEGAL::非法令牌",
            "FAIL_SYS_TOKEN_EXOIRED::令牌过期"
          ].includes(errReason)
        ) {
          if (data?.c) {
            console.warn("填充token令牌", data.c);
            tokenC = data.c; // 更新token
            // 重新生成接口url(主要是sign签名和参数有关)
            config.url = config.originalUrl.split("/1.0/")[0];
            config.url = getUrl(tokenC, sid, config.url, config.originalData);
            config.url = IS_DEV
              ? config.url.replace("fenghuang", "svpi/fenghuang-ser")
              : "http://47.113.191.173:3000" +
                "/fenghuang-ser" +
                config.url.slice(10);
            return instance(config);
          }
        }
        return Promise.reject(data);
      }
      return data?.data;
    },
    error => {
      // 错误上报逻辑
      console.error("请求失败:", error);
      return Promise.reject(error);
    }
  );

  // 判断是否需要重试
  const shouldRetry = (error, config, maxRetries, retrieUrls) => {
    try {
      let isCountCheck = config.retryCount < maxRetries;
      let isUrlCheck = retrieUrls.some(item =>
        config.url?.toLowerCase().includes(item)
      );
      let isErrorCheck = false;
      // 检查错误类型
      if (axios.isAxiosError(error)) {
        const message = error.message?.toLowerCase();
        isErrorCheck =
          message.includes("timeout") ||
          message.includes("network error") ||
          message.includes("Request failed with status code 408");
      }
      // console.log(
      //   "isCountCheck",
      //   isCountCheck,
      //   "isUrlCheck",
      //   isUrlCheck,
      //   isErrorCheck
      // );
      return isCountCheck && isUrlCheck && isErrorCheck;
    } catch (e) {
      //TODO handle the exception
      return false;
    }
  };

  return instance;
};
export default createAxios;
