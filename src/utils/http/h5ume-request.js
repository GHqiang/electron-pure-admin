// src/utils/axiosInstance.js

import axios from "axios";
import { ElMessage } from "element-plus";
import { GET_APP_LIST, GE_APP_INFO } from "@/common/constant";
import { APP_API_OBJ } from "@/common/index";
// 统一日志类
import Logger from "@/common/logger";

import {
  logUpload,
  getCurrentTime,
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  mockDelay
} from "@/utils/utils";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { user_id }
} = platTokens();

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

const urlObj = {
  "mtop.alipic.lark.own.cinema.getcinemas":
    "mtop.alipic.lark.own.cinema.getcinemas",
  "mtop.alipic.lark.own.film.gethotfilms":
    "mtop.alipic.lark.own.film.getHotFilms",
  "mtop.alipic.lark.own.auth.getsidbytid":
    "mtop.alipic.lark.own.auth.getSidByTid",
  "mtop.alipic.lark.own.card.getcardlistbypage":
    "mtop.alipic.lark.own.card.getCardListByPage",
  "mtop.alipic.lark.own.schedule.getschedules":
    "mtop.alipic.lark.own.schedule.getSchedules",
  "mtop.alipic.lark.own.seat.getseatmap":
    "mtop.alipic.lark.own.seat.getSeatMap",
  "mtop.alipic.lark.own.seat.lockseats": "mtop.alipic.lark.own.seat.lockSeats",
  "mtop.alipic.lark.own.seat.unlockseats":
    "mtop.alipic.lark.own.seat.unlockSeats",
  "mtop.alipic.lark.own.pay.getpayprivilegeinfo":
    "mtop.alipic.lark.own.pay.getPayPrivilegeInfo",
  "mtop.alipic.lark.own.order.getorderlist":
    "mtop.alipic.lark.own.order.getOrderList",
  "mtop.alipic.lark.own.order.cancelorder":
    "mtop.alipic.lark.own.order.cancelOrder",
  "mtop.alipic.lark.own.order.getorderdetail":
    "mtop.alipic.lark.own.order.getOrderDetail",
  "mtop.alipic.lark.own.coupon.getmyonlinecoupons":
    "mtop.alipic.lark.own.coupon.getMyOnlineCoupons",
  "mtop.alipic.lark.own.lease.channelagreement":
    "mtop.alipic.lark.own.lease.channelAgreement",
  "mtop.alipic.lark.own.cinema.getcinemadetail":
    "mtop.alipic.lark.own.cinema.getCinemaDetail",
  "mtop.alipic.lark.own.coupon.bindcoupon":
    "mtop.alipic.lark.own.coupon.bindCoupon",
  "mtop.alipic.lark.own.pay.getpaydiscountprice":
    "mtop.alipic.lark.own.pay.getPayDiscountPrice",
  "mtop.alipic.lark.own.order.createticketorder":
    "mtop.alipic.lark.own.order.createTicketOrder"
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
  let api = urlObj[url.replace("/h5ume/", "")];
  return `${url}/1.0/?jsv=2.6.0&appKey=${appKey}&t=${t}&sign=${sign}&api=${api}&v=1.0&type=originaljson&timeout=20000&dataType=json`;
};

const noProxyUrlList = [
  "cinema.getcinemas", // 调试时可注释
  "auth.getsidbytid",
  "film.gethotfilms",
  "schedule.getschedules",
  "seat.getseatmap",
  "seat.lockseats",
  "seat.unlockseats",
  "pay.getpayprivilegeinfo",
  "pay.getpaydiscountprice",
  "coupon.getmyonlinecoupons",
  "card.getcardlistbypage",
  "order.cancelorder",
  "coupon.bindcoupon",
  "order.getorderlist",
  "order.getorderdetail"
];
// 是否不需要代理
const checkUrlNoNeedProxy = url => {
  return noProxyUrlList.some(item => url?.toLowerCase().includes(item));
};
const createAxios = ({ app_name, timeout = 20 }) => {
  let logger = new Logger({ logType: 6 });
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: timeout * 1000,
    withCredentials: true
  });

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";
  let newToken = "",
    ua = "",
    umidToken = "",
    mobile = "",
    newSidObj = {},
    newTidObj = {};

  // 初始化全局日志
  logger.init({
    plat_name: "",
    app_name,
    order_number: ""
  });
  // 在文件顶部添加会话请求队列
  const sessionRefreshQueue = new Map();
  // 获取新的sid
  const getNewSid = async config => {
    // 使用 config.tid 而不是全局 tid 变量
    const currentTid = config.tid;
    const currentMobile = config.mobile;

    // 生成队列标识（APP+手机号）
    const queueKey = `${app_name}_${currentMobile}`;

    // 如果已有续期请求在进行，直接等待结果
    if (sessionRefreshQueue.has(queueKey)) {
      return sessionRefreshQueue.get(queueKey);
    }

    // 创建新的续期请求
    const refreshPromise = (async () => {
      try {
        // logger.infoSave("发起新的SID续期请求", {
        //   mobile: currentMobile,
        //   tid: currentTid,
        //   url: config.url
        // });

        const sidRes = await APP_API_OBJ[app_name].getsidbytid({
          empCode: "",
          leaseCode: "",
          tid: currentTid // 使用当前请求的 tid
        });

        // logger.infoSave("新的SID续期结果", sidRes);

        // 更新会话缓存
        if (sidRes?.bizValue?.sid && sidRes?.bizValue?.account?.mobile) {
          const newSid = sidRes.bizValue.sid;
          const newTid = sidRes.bizValue.tid;
          const mobile = sidRes.bizValue.account.mobile;

          // 确保只更新对应手机号的会话
          newSidObj[mobile] = newSid;
          newTidObj[mobile] = newTid;

          // logger.infoSave("更新会话缓存", {
          //   mobile,
          //   newSid,
          //   newTid
          // });
        }

        return sidRes;
      } catch (error) {
        logger.errorSave("SID续期请求失败", {
          error: error.message,
          mobile: currentMobile,
          tid: currentTid
        });
        throw error;
      } finally {
        // 无论成功失败都清理队列
        sessionRefreshQueue.delete(queueKey);
        logger.logUpload();
      }
    })();

    // 加入队列
    sessionRefreshQueue.set(queueKey, refreshPromise);
    return refreshPromise;
  };

  // 请求拦截器
  instance.interceptors.request.use(
    async config => {
      if (config.url.indexOf("/h5ume/") !== -1) {
        // 如果未获取到cookie里面的token且接口非获取影院列表接口时需要调一下获取下
        if (!newToken && !config.url.includes("cinema.getcinemas")) {
          // 此处是为了更新newToken
          try {
            await APP_API_OBJ[app_name].getCinemaList();
          } catch (error) {
            console.error("获取影院列表失败", error);
          }
        }
        config.headers["Content-Type"] = "application/x-www-form-urlencoded";
        let targetLoginList = getCinemaLoginInfoList().filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        );
        // 登录标识：larkSid
        // e6b99a4fe34244d680a8e57ae79eff3b
        config.sid = targetLoginList?.[0]?.session_id || "";
        config.tid = targetLoginList?.[0]?.tid || "";
        // 先自己匹配登录信息，然后从参数里获取更新
        if (config.data?.umeToken) {
          config.sid = config.data.umeToken;
          config.tid = targetLoginList.find(
            itemA => itemA.session_id === config.sid
          )?.tid;
          delete config.data.umeToken;
        }
        if (!config.mobile) {
          // 每个登录信息的tid不会变的
          mobile = targetLoginList.find(
            itemA => itemA.tid === config.tid
          )?.mobile;
          config.mobile = mobile;
        } else {
          mobile = config.mobile;
          // console.warn("重试的请求", config);
        }
        // console.log("newSidObj", newSidObj);
        // console.log("newTidObj", newTidObj);

        // 如果对应的手机号的token有新的直接获取新的
        if (mobile && newSidObj[mobile]) {
          config.sid = newSidObj[mobile];
        }
        if (mobile && newTidObj[mobile]) {
          config.tid = newTidObj[mobile];
        }
        // 保存原始参数和原始URL
        if (!config.originalData) {
          config.originalData = {
            ...config.data,
            channelCode: GE_APP_INFO(app_name)?.channelCode,
            larkSid: config.sid,
            version: "H5",
            appVersion: "H5_5.0"
          };
        } else {
          // 更新重试请求里的sid
          config.originalData.larkSid = config.sid;
        }
        let params = config.originalData;
        if (!config.originalUrl) {
          config.url = getUrl(newToken, config.url, params);
          config.originalUrl = config.url;
        }
        // if (!ua || !umidToken) {
        const uidRes = await getumidToken();
        // console.log("uidRes", uidRes);
        ua = uidRes?.ua;
        umidToken = uidRes?.umidToken;
        // }
        if (newToken) {
          config.headers["umetoken"] = newToken;
          config.headers["gray-lease-code"] =
            GE_APP_INFO(app_name)?.channelCode?.split("_H5_")[0];
          config.headers["accesstoken"] = null;
          config.headers["bx-ua"] = ua;
          config.headers["bx-umidtoken"] = umidToken;
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

        config.responseType = "arraybuffer";
      }
      // 默认都走代理，白名单不走代理
      let isNoProxy = checkUrlNoNeedProxy(config.url);
      if (isNoProxy) {
        config.headers["Is-No-Proxy"] = 1;
      }
      config.headers["APP-NAME"] = app_name;
      config.headers["USER-ID"] = user_id;
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
        // logUpload(
        //   {
        //     plat_name: "",
        //     app_name: app_name,
        //     order_number: "",
        //     type: ""
        //   },
        //   [
        //     {
        //       opera_time: getCurrentTime(),
        //       des: "接口重试成功",
        //       level: "info",
        //       info: {
        //         retryCount: response?.config?.retryCount,
        //         originalUrl: response?.config?.originalUrl
        //       }
        //     }
        //   ]
        // );
      }

      // 对响应进行统一处理
      const headers1 = response.headers; // 响应头
      let data = response.data;
      // console.log("data===>", data);
      // console.log("headers1===>", headers1);
      // if (headers1.is_zstd == 1 && !data?.bizValue) {
      //   data = await decompress(data);
      //   console.log("解压后的数据:", data);
      // }
      try {
        const decoder = new TextDecoder("utf-8");
        const jsonStr = decoder.decode(data);
        // data = data.toString("utf-8");
        // console.log("data===>1", jsonStr);
        data = JSON.parse(jsonStr);
      } catch (error) {
        console.warn("json解析失败==>", error);
      }

      // console.log("headers1===>", headers1);
      // console.log("response.config", response.config);
      // let whitelistSp = ['/sp/order', '/sp/unlock']
      let whitelistSp = [];
      let config = response.config;
      // console.log("config", config.mobile);
      let isError =
        response.config.url.indexOf("/ume-ser/") !== -1 &&
        data?.data?.bizCode !== "0";
      if (
        isError &&
        !whitelistSp.some(item => response.config.url.includes(item))
      ) {
        let errReason = data?.data?.bizMsg || data?.ret?.[0];
        // 令牌为空或者过期是cookie里的_m_h5_tk为空或者过期
        if (
          [
            "FAIL_SYS_TOKEN_EXOIRED::令牌过期",
            "FAIL_SYS_TOKEN_EMPTY::令牌为空"
          ].includes(errReason)
        ) {
          let cookieStr = String(headers1["set_cookie"]);
          let _m_h5_tk = extractCookieValueByRegex(cookieStr, "_m_h5_tk=");
          let _m_h5_tk_enc = extractCookieValueByRegex(
            cookieStr,
            "_m_h5_tk_enc="
          );
          let umetoken = headers1.umetoken;
          // console.log("oldToken", token);
          // 接口重试时token续期
          if (_m_h5_tk) {
            const regex = new RegExp(`(_m_h5_tk=[^;]+);?`);
            umetoken =
              umetoken?.indexOf("_m_h5_tk=") > -1
                ? umetoken.replace(regex, `_m_h5_tk=${_m_h5_tk};`)
                : `_m_h5_tk=${_m_h5_tk};`;
          }
          if (_m_h5_tk_enc) {
            const regex = new RegExp(`(_m_h5_tk_enc=[^;]+);?`);
            umetoken =
              umetoken?.indexOf("_m_h5_tk_enc=") > -1
                ? umetoken.replace(regex, `_m_h5_tk_enc=${_m_h5_tk_enc};`)
                : umetoken + ` _m_h5_tk_enc=${_m_h5_tk_enc};`;
            newToken = umetoken;
          }

          // console.log("newtoken", newToken);
          // 重新生成接口url(主要是sign签名和参数有关)
          config.url = config.originalUrl.split("/1.0/")[0];
          config.originalUrl = null;
          return instance(config);
        }

        // 登录超时是larkSid过期
        if (
          ["2001", "1002"].includes(data?.data?.bizCode) ||
          ["登录超时，请重新登录", "登录已失效，请重新登录后再操作"].includes(
            data?.data?.bizAlertMsg
          )
        ) {
          let isRetryCount = !config.retryCount || config.retryCount < 5;
          if (isRetryCount && !data?.api?.includes("own.auth.getsidbytid")) {
            config.retryCount = (config.retryCount || 0) + 1;
            await getNewSid(config);
            // 重新生成接口url(主要是sign签名和参数有关)
            config.url = config.originalUrl.split("/1.0/")[0];
            config.originalUrl = "";
            // 这里会重新走响应拦截流程
            return instance(config);
          } else {
            logger.errorSave("Session过期无法续期", {
              retryCount: config.retryCount,
              mobile: config.mobile,
              url: config.url,
              sid: config.sid,
              tid: config.tid
            });
            logger.logUpload();
          }
        }

        let errMsg =
          GET_APP_LIST()[app_name] + (data?.ret?.[0] || data.msg || "请求失败");
        ElMessage.error(errMsg);
        return Promise.reject(data);
      }
      // console.warn("data?.data", data?.data);
      return data?.data;
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
        "cinema.getcinemas",
        "film.gethotfilms",
        "schedule.getschedules",
        "seat.getseatmap",
        "pay.getpayprivilegeinfo"
      ];
      let isRetry = shouldRetry(error, config, maxRetries, retrieUrls);
      // console.log("isRetry", isRetry, config);
      if (isRetry) {
        // 检查是否需要重试
        config.retryCount = config.retryCount + 1;
        console.log(`请求失败，正在进行第 ${config.retryCount} 次重试...`);

        // 等待一段时间后重试
        await mockDelay(retryDelay);
        config.url = config.originalUrl.split("/1.0/")[0];
        config.originalUrl = null;
        // 重试请求
        return instance(config);
      }
      // 仍旧重试失败增加日志上送
      if (config.retryCount) {
        // logUpload(
        //   {
        //     plat_name: "",
        //     app_name: app_name,
        //     order_number: "",
        //     type: ""
        //   },
        //   [
        //     {
        //       opera_time: getCurrentTime(),
        //       des: "接口重试到最后还是失败",
        //       level: "info",
        //       info: {
        //         originalUrl: config.originalUrl,
        //         retryCount: config.retryCount,
        //         params: config.params,
        //         data: config.data
        //       }
        //     }
        //   ]
        // );
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
              `请求异常 ${response.status}: ${error.message || error.msg}`
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
