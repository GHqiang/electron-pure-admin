// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { APP_LIST } from "@/common/constant";
import {
  logUpload,
  getCurrentFormattedDateTime,
  mockDelay
} from "@/utils/utils";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

// 签名生成方法
const getSign = t => {
  function e(t, e) {
    return (t << e) | (t >>> (32 - e));
  }
  function r(t, e) {
    var r, n, i, o, s;
    return (
      (i = 2147483648 & t),
      (o = 2147483648 & e),
      (s = (1073741823 & t) + (1073741823 & e)),
      (r = 1073741824 & t) & (n = 1073741824 & e)
        ? 2147483648 ^ s ^ i ^ o
        : r | n
          ? 1073741824 & s
            ? 3221225472 ^ s ^ i ^ o
            : 1073741824 ^ s ^ i ^ o
          : s ^ i ^ o
    );
  }
  function n(t, n, i, o, s, a, u) {
    return (
      (t = r(
        t,
        r(
          r(
            (function (t, e, r) {
              return (t & e) | (~t & r);
            })(n, i, o),
            s
          ),
          u
        )
      )),
      r(e(t, a), n)
    );
  }
  function i(t, n, i, o, s, a, u) {
    return (
      (t = r(
        t,
        r(
          r(
            (function (t, e, r) {
              return (t & r) | (e & ~r);
            })(n, i, o),
            s
          ),
          u
        )
      )),
      r(e(t, a), n)
    );
  }
  function o(t, n, i, o, s, a, u) {
    return (
      (t = r(
        t,
        r(
          r(
            (function (t, e, r) {
              return t ^ e ^ r;
            })(n, i, o),
            s
          ),
          u
        )
      )),
      r(e(t, a), n)
    );
  }
  function s(t, n, i, o, s, a, u) {
    return (
      (t = r(
        t,
        r(
          r(
            (function (t, e, r) {
              return e ^ (t | ~r);
            })(n, i, o),
            s
          ),
          u
        )
      )),
      r(e(t, a), n)
    );
  }
  function a(t) {
    var e,
      r = "",
      n = "";
    for (e = 0; 3 >= e; e++)
      r += (n = "0" + ((t >>> (8 * e)) & 255).toString(16)).substr(
        n.length - 2,
        2
      );
    return r;
  }
  var u, c, l, f, h, d, p, m, y, g;
  for (
    g = (function (t) {
      for (
        var e,
          r = t.length,
          n = r + 8,
          i = 16 * ((n - (n % 64)) / 64 + 1),
          o = new Array(i - 1),
          s = 0,
          a = 0;
        r > a;

      )
        (s = (a % 4) * 8),
          (o[(e = (a - (a % 4)) / 4)] = o[e] | (t.charCodeAt(a) << s)),
          a++;
      return (
        (s = (a % 4) * 8),
        (o[(e = (a - (a % 4)) / 4)] = o[e] | (128 << s)),
        (o[i - 2] = r << 3),
        (o[i - 1] = r >>> 29),
        o
      );
    })(
      (t = (function (t) {
        t = t.replace(/\r\n/g, "\n");
        for (var e = "", r = 0; r < t.length; r++) {
          var n = t.charCodeAt(r);
          128 > n
            ? (e += String.fromCharCode(n))
            : n > 127 && 2048 > n
              ? ((e += String.fromCharCode((n >> 6) | 192)),
                (e += String.fromCharCode((63 & n) | 128)))
              : ((e += String.fromCharCode((n >> 12) | 224)),
                (e += String.fromCharCode(((n >> 6) & 63) | 128)),
                (e += String.fromCharCode((63 & n) | 128)));
        }
        return e;
      })(t))
    ),
      d = 1732584193,
      p = 4023233417,
      m = 2562383102,
      y = 271733878,
      u = 0;
    u < g.length;
    u += 16
  )
    (c = d),
      (l = p),
      (f = m),
      (h = y),
      (d = n(d, p, m, y, g[u + 0], 7, 3614090360)),
      (y = n(y, d, p, m, g[u + 1], 12, 3905402710)),
      (m = n(m, y, d, p, g[u + 2], 17, 606105819)),
      (p = n(p, m, y, d, g[u + 3], 22, 3250441966)),
      (d = n(d, p, m, y, g[u + 4], 7, 4118548399)),
      (y = n(y, d, p, m, g[u + 5], 12, 1200080426)),
      (m = n(m, y, d, p, g[u + 6], 17, 2821735955)),
      (p = n(p, m, y, d, g[u + 7], 22, 4249261313)),
      (d = n(d, p, m, y, g[u + 8], 7, 1770035416)),
      (y = n(y, d, p, m, g[u + 9], 12, 2336552879)),
      (m = n(m, y, d, p, g[u + 10], 17, 4294925233)),
      (p = n(p, m, y, d, g[u + 11], 22, 2304563134)),
      (d = n(d, p, m, y, g[u + 12], 7, 1804603682)),
      (y = n(y, d, p, m, g[u + 13], 12, 4254626195)),
      (m = n(m, y, d, p, g[u + 14], 17, 2792965006)),
      (d = i(
        d,
        (p = n(p, m, y, d, g[u + 15], 22, 1236535329)),
        m,
        y,
        g[u + 1],
        5,
        4129170786
      )),
      (y = i(y, d, p, m, g[u + 6], 9, 3225465664)),
      (m = i(m, y, d, p, g[u + 11], 14, 643717713)),
      (p = i(p, m, y, d, g[u + 0], 20, 3921069994)),
      (d = i(d, p, m, y, g[u + 5], 5, 3593408605)),
      (y = i(y, d, p, m, g[u + 10], 9, 38016083)),
      (m = i(m, y, d, p, g[u + 15], 14, 3634488961)),
      (p = i(p, m, y, d, g[u + 4], 20, 3889429448)),
      (d = i(d, p, m, y, g[u + 9], 5, 568446438)),
      (y = i(y, d, p, m, g[u + 14], 9, 3275163606)),
      (m = i(m, y, d, p, g[u + 3], 14, 4107603335)),
      (p = i(p, m, y, d, g[u + 8], 20, 1163531501)),
      (d = i(d, p, m, y, g[u + 13], 5, 2850285829)),
      (y = i(y, d, p, m, g[u + 2], 9, 4243563512)),
      (m = i(m, y, d, p, g[u + 7], 14, 1735328473)),
      (d = o(
        d,
        (p = i(p, m, y, d, g[u + 12], 20, 2368359562)),
        m,
        y,
        g[u + 5],
        4,
        4294588738
      )),
      (y = o(y, d, p, m, g[u + 8], 11, 2272392833)),
      (m = o(m, y, d, p, g[u + 11], 16, 1839030562)),
      (p = o(p, m, y, d, g[u + 14], 23, 4259657740)),
      (d = o(d, p, m, y, g[u + 1], 4, 2763975236)),
      (y = o(y, d, p, m, g[u + 4], 11, 1272893353)),
      (m = o(m, y, d, p, g[u + 7], 16, 4139469664)),
      (p = o(p, m, y, d, g[u + 10], 23, 3200236656)),
      (d = o(d, p, m, y, g[u + 13], 4, 681279174)),
      (y = o(y, d, p, m, g[u + 0], 11, 3936430074)),
      (m = o(m, y, d, p, g[u + 3], 16, 3572445317)),
      (p = o(p, m, y, d, g[u + 6], 23, 76029189)),
      (d = o(d, p, m, y, g[u + 9], 4, 3654602809)),
      (y = o(y, d, p, m, g[u + 12], 11, 3873151461)),
      (m = o(m, y, d, p, g[u + 15], 16, 530742520)),
      (d = s(
        d,
        (p = o(p, m, y, d, g[u + 2], 23, 3299628645)),
        m,
        y,
        g[u + 0],
        6,
        4096336452
      )),
      (y = s(y, d, p, m, g[u + 7], 10, 1126891415)),
      (m = s(m, y, d, p, g[u + 14], 15, 2878612391)),
      (p = s(p, m, y, d, g[u + 5], 21, 4237533241)),
      (d = s(d, p, m, y, g[u + 12], 6, 1700485571)),
      (y = s(y, d, p, m, g[u + 3], 10, 2399980690)),
      (m = s(m, y, d, p, g[u + 10], 15, 4293915773)),
      (p = s(p, m, y, d, g[u + 1], 21, 2240044497)),
      (d = s(d, p, m, y, g[u + 8], 6, 1873313359)),
      (y = s(y, d, p, m, g[u + 15], 10, 4264355552)),
      (m = s(m, y, d, p, g[u + 6], 15, 2734768916)),
      (p = s(p, m, y, d, g[u + 13], 21, 1309151649)),
      (d = s(d, p, m, y, g[u + 4], 6, 4149444226)),
      (y = s(y, d, p, m, g[u + 11], 10, 3174756917)),
      (m = s(m, y, d, p, g[u + 2], 15, 718787259)),
      (p = s(p, m, y, d, g[u + 9], 21, 3951481745)),
      (d = r(d, c)),
      (p = r(p, l)),
      (m = r(m, f)),
      (y = r(y, h));
  return (a(d) + a(p) + a(m) + a(y)).toLowerCase();
};

// 正则匹配获取cookie串内的对应key值
const extractCookieValueByRegex = (cookieString, prefix) => {
  // 构造正则表达式，其中prefix是我们要匹配的前缀
  // (?=;)是一个正向前瞻断言，表示匹配后面紧跟分号的位置，但不包括分号在内
  // |$表示匹配字符串的结尾
  const regex = new RegExp(`${prefix}([^;]*)(?=;|$)`);
  const match = cookieString.match(regex);

  // 如果找到匹配项，则返回捕获组（即我们想要的值）
  // 否则返回undefined
  return match ? match[1] : undefined;
};

// 获取url
const getUrl = (token, url, params) => {
  // console.log(token, url, params);
  let signToken = token
    .split("; ")
    .map(item => item.split("="))
    .find(item => item[0] === "_m_h5_tk")?.[1]
    ?.split("_")?.[0];
  let t = new Date().getTime();
  let appKey = "12574478";
  let signStr =
    signToken + "&" + t + "&" + appKey + "&" + JSON.stringify(params);
  let sign = getSign(signStr);
  let api = url.replace("/h5ume/", "");
  return `${url}/1.0/?jsv=2.6.0&appKey=${appKey}&t=${t}&sign=${sign}&api=${api}&v=1.0&type=originaljson&timeout=20000&dataType=json`;
};
const createAxios = ({ app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: 20 * 1000,
    withCredentials: true
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";

  // 请求拦截器
  instance.interceptors.request.use(
    async config => {
      if (config.url.indexOf("/h5ume/") !== -1) {
        config.headers["Content-Type"] = "application/x-www-form-urlencoded";
        // 猎人平台接口添加token
        let loginInfoList = window.localStorage.getItem("loginInfoList");
        if (loginInfoList) {
          loginInfoList = JSON.parse(loginInfoList);
        }
        let targetList = loginInfoList.filter(
          itemA => itemA.app_name === app_name && itemA.session_id
        );
        let targetInfo = targetList?.[0] || "";
        if (targetList?.length > 1) {
          targetInfo = targetList.find(itemA =>
            tokens.userInfo.user_id != 1
              ? itemA.mobile === tokens.userInfo.phone
              : true
          );
        }
        let token = targetInfo?.session_id || "";
        token =
          "cna=YlyXHzyqrzICAQEk9RVF4M27; xlly_s=1; _m_h5_tk=2b6658e6c1e054a8a798429d5b6e95d0_1732372148724; _m_h5_tk_enc=a6a97ba13aa8cac824ae2530d015058a; tfstk=fjFmdh_PU-kX1KJymTlfQ-z-yLB-lEGscldtXfnNU0o7XKrOhASiqrvYHoQf_Cro2SnYkjJGsuZo0rUOfCYZqoRtHlFgFC4Q5SQj6ZGblfGNvMCKsraj1F8L1Ws8zNu1TsWMs6UblU8DbweP9hcW9YyZblkq43uI4noabcJPrVu90dR4ba4rVVL2bqoaz0uE8KlZ_lzPrVGRTto4e8VPD5AlipkjB70m3tzq4Cu7ZqDmYrPD_C8soxmUu0SCRcwqUPMg1FOiBryQf2r20Gm_ZzP4LkSJHmynSyegYNpjyAVjZcPVOemziPVoh8K232cmmvPqneQQlAyuZjFVfpa8rmknw8B5DAh0mJiI3Ts7jzmYbSDymgnTpzFqEkSJZlMgQShzgg5h4T9yL44W1DCu5d9s34govV5Xw66aEItlravn5xuSzZ7lrd9s34govabkKVMqP47V.; isg=BCkpAxWPahkyhlb8Va-ySwZWONWD9h0oClGsiMsepZBPkkmkE0Yt-BeEUDCkCrVg";

        // 保存原始参数和原始URL
        if (!config.originalParams) {
          config.originalParams = {
            ...config.params,
            empCode: "",
            leaseCode: "",
            channelCode: "BEICHEN_H5_PROD_10106_MPS",
            larkSid: "e783ed22b3944c81bbd55bbe66c606a6",
            version: "H5",
            appVersion: "H5_5.0"
          };
        }
        if (!config.originalData) {
          config.originalData = {
            ...config.data,
            empCode: "",
            leaseCode: "",
            channelCode: "BEICHEN_H5_PROD_10106_MPS",
            larkSid: "e783ed22b3944c81bbd55bbe66c606a6",
            version: "H5",
            appVersion: "H5_5.0"
          };
        }
        let params =
          config.method === "get" ? config.originalParams : config.originalData;
        if (params.umeToken) {
          token = params?.umeToken;
          delete params.umeToken;
        }
        if (!config.originalUrl) {
          config.url = getUrl(token, config.url, params);
          config.originalUrl = config.url;
        }

        if (token) {
          config.headers["umetoken"] = token;
          // config.headers["cookie"] =  token;
        }
        if (config.method === "get") {
          config.params = params;
        } else {
          config.data = { data: JSON.stringify(params) };
        }
        // 延时白名单
        let delayUrlList = [
          "mp/index/film",
          "mp/index/sell_session",
          "mp/ibuypro/index",
          "mp/ibuypro/add_ticket",
          "mp/imember/change",
          "mp/imember/index",
          "mp/icoupon/index",
          "mp/iorder/get_order",
          "mp/icoupon/add",
          "mp/ihistory/ticket_info",
          "mp/iorder/complete"
        ];
        if (delayUrlList.some(item => config.originalUrl?.includes(item))) {
          await mockDelay(0.1);
        }
        // 生产环境不会跨域
        config.url = IS_DEV
          ? config.url.replace("h5ume", "svpi/ume-ser")
          : "http://47.113.191.173:3000" +
            "/ume-ser" +
            config.originalUrl.slice(6);
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
    async response => {
      // 如果是重试后的成功响应，记录日志
      if (response?.config?.retryCount > 0) {
        logUpload(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentFormattedDateTime(),
              des: "接口重试成功",
              level: "info",
              info: {
                retryCount: response?.config?.retryCount,
                originalUrl: response?.config?.originalUrl
              }
            }
          ]
        );
      }

      // 对响应进行统一处理
      const data = response.data;
      // console.log("data===>", data);
      // console.log("response.config", response.config);
      // let whitelistSp = ['/sp/order', '/sp/unlock']
      let whitelistSp = [];
      let config = response.config;
      let isError =
        response.config.url.indexOf("/ume-ser/") !== -1 &&
        data?.data?.bizCode !== "0";
      if (
        isError &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        if (data?.ret?.[0] == "FAIL_SYS_TOKEN_EXOIRED::令牌过期") {
          if (!config.retryCount) {
            config.retryCount = 1;
            config.url = config.originalUrl.split("/1.0/")[0];
            // console.log("config.url", config.url);
            let cookieStr = String(data.headers1["set-cookie"]);
            let _m_h5_tk = extractCookieValueByRegex(cookieStr, "_m_h5_tk=");
            let _m_h5_tk_enc = extractCookieValueByRegex(
              cookieStr,
              "_m_h5_tk_enc="
            );
            let token = data.headers1.umetoken;
            // console.log("oldToken", token);
            // 接口重试时token续期
            if (_m_h5_tk) {
              const regex = new RegExp(`(_m_h5_tk=[^;]+);?`);
              token = token.replace(regex, `_m_h5_tk=${_m_h5_tk};`);
            }
            if (_m_h5_tk_enc) {
              const regex = new RegExp(`(_m_h5_tk_enc=[^;]+);?`);
              token = token.replace(regex, `_m_h5_tk_enc=${_m_h5_tk_enc};`);
            }
            // console.log("newtoken", token);
            config.headers["umetoken"] = token;
            let params =
              config.method === "get"
                ? config.originalParams
                : config.originalData;
            // console.log("params", params);
            config.url = getUrl(token, config.url, params);
            console.log("retryCount-config", config);
            config.url = config.url.replace("h5ume", "svpi/ume-ser");
            return instance(config);
          } else {
            ElMessage.warning(
              `${APP_LIST[app_name]}登录失效，请重新设置登录信息`
            );
            sendWxPusherMessage({
              msgType: 1,
              app_name: APP_LIST[app_name],
              transferTip: `${APP_LIST[app_name]}登录失效，请检查登录信息维护`
            });

            // 此处加个消息推送
            return Promise.reject(data);
          }
        }
        let isOften = data?.msg?.includes("操作过于频繁");
        if (isOften) {
          // 等待一段时间后重试
          await mockDelay(3);
          // 重试请求
          return instance(response?.config);
        }

        let errMsg =
          APP_LIST[app_name] + (data?.ret?.[0] || data.msg || "请求失败");
        ElMessage.error(errMsg);
        return Promise.reject(data);
      }
      return data?.data?.bizValue;
    },
    async error => {
      const { response, config } = error;
      console.warn("error-config", config, "error-response", response);
      // 确保 config 存在
      if (!config) {
        console.warn("请求配置丢失，请稍后再试");
        return Promise.reject(error);
      }

      // 初始化 retryCount 如果它不存在
      if (config.retryCount === undefined) {
        config.retryCount = 0;
      }
      const maxRetries = config.maxRetries || 3;
      const retryDelay = config.retryDelay || 1; // 1 second
      // 重试接口名单
      let retrieUrls = [
        "/index/film",
        "/index/sell_session",
        "/ibuypro/index",
        "/imember/index",
        "/icoupon/index"
      ];
      let isRetry = shouldRetry(error, config, maxRetries, retrieUrls);
      // console.log("isRetry", isRetry, config);
      if (isRetry) {
        // 检查是否需要重试
        config.retryCount = config.retryCount + 1;
        console.log(`请求失败，正在进行第 ${config.retryCount} 次重试...`);

        // 等待一段时间后重试
        await mockDelay(retryDelay);

        // 重试请求
        return instance(config);
      }
      // 仍旧重试失败增加日志上送
      if (config.retryCount) {
        logUpload(
          {
            plat_name: "",
            app_name: app_name,
            order_number: "",
            type: ""
          },
          [
            {
              opera_time: getCurrentFormattedDateTime(),
              des: "接口重试到最后还是失败",
              level: "info",
              info: {
                originalUrl: config.originalUrl,
                retryCount: config.retryCount,
                params: config.params,
                data: config.data
              }
            }
          ]
        );
      }
      // 对HTTP错误码进行处理
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

  // 判断是否需要重试
  const shouldRetry = (error, config, maxRetries, retrieUrls) => {
    try {
      let isCountCheck = config.retryCount < maxRetries;
      let isUrlCheck = retrieUrls.some(item => config.url.includes(item));
      let isErrorCheck = false;
      // 检查错误类型
      if (axios.isAxiosError(error)) {
        const message = error.message.toLowerCase();
        isErrorCheck =
          message.includes("timeout of") || message.includes("network error");
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
