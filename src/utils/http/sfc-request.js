// sfc请求拦截器封装
import axios from "axios";
import { ElMessage } from "element-plus";
import { APP_LIST } from "@/common/constant";
import md5 from "../md5.js";
import {
  sendWxPusherMessage,
  logUpload,
  getCurrentFormattedDateTime,
  mockDelay
} from "@/utils/utils";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

const createAxios = ({ group, app_name, timeout = 20 }) => {
  // 创建axios实例
  const instance = axios.create({
    //   baseURL: process.env.VITE_API_BASE_URL,
    baseURL: "",
    timeout: timeout * 1000
  });

  // 公共请求参数对象，包含一些默认的请求头信息，如group、pver、source、ver等
  var i = {
    group: group,
    pver: "7.0",
    source: "4",
    ver: "7.7.3",
    city_id: "",
    cinema_id: "",
    client_id: "",
    session_id: ""
  };

  /*
   * 用于对请求参数对象进行填充，将全局APP状态填充或更新请求参数，例如城市ID（city_id）、影院ID（cinema_id）和会话ID（session_id）
   * @param {Object} e 请求参数对象
   */
  var a = function (e) {
    // var o = getApp().getCity() ? getApp().getCity().id : "", r = getApp().getCinema() ? getApp().getCinema().id : "", i = getApp().globalData.session_id;
    // if (getApp().globalData.isUpLoadFromThirdPlatform) {
    //     var _ = getApp().globalData.ext_json.group;
    //     e.group = _ || "";
    // }
    // e.city_id = o || "", e.cinema_id = r || "", e.session_id = i || "";
    // e.group = "20045";
    // e.city_id = '500'
    // e.cinema_id = '19'

    let loginInfoList = window.localStorage.getItem("loginInfoList");
    if (loginInfoList) {
      loginInfoList = JSON.parse(loginInfoList);
    }
    // console.log("loginInfoList", loginInfoList);
    // 优先用自己账号token
    let obj = loginInfoList.find(
      itemA =>
        itemA.app_name === app_name &&
        itemA.session_id &&
        (tokens.userInfo.user_id != 1
          ? itemA.mobile === tokens.userInfo.phone
          : true)
    );

    e.session_id = obj?.session_id || "";
    // console.log("sfcRequest===>", e);
  };

  /*
   * 用于对请求参数对象进行合并，将源对象中没有的属性从目标对象中复制过来
   * @param {Object} e 目标对象
   * @param {Object} o 源对象
   */
  var n = function (e, o) {
    for (var r in o)
      o.hasOwnProperty(r) && !e.hasOwnProperty(r) && (e[r] = o[r]);
    // 如果入参里面传了session_id就不会从o里面赋值了
  };

  /*
   * 用于对一个对象的属性进行排序后返回一个新的对象
   * @param {Object} e 请求参数对象
   * @return {Object} 返回排序后的对象
   */
  var t = function (e) {
    for (var o = Object.keys(e).sort(), r = {}, i = 0; i < o.length; i++)
      r[o[i]] = e[o[i]];
    return r;
  };
  /*
   * 用于对请求参数进行MD5加密处理，首先对参数进行排序，然后进行两次MD5加密，并在中间连接一个固定字符串
   * @param {Object} o 请求参数对象
   * @return {String} 返回加密后的字符串
   */
  var d = function (o) {
    var r = "";
    for (var i in o) r += i + "=" + o[i] + "&";
    return (
      (r = r.substr(0, r.length - 1)),
      (r = md5.hex_md5(md5.hex_md5(r) + "cf0e5311eaffda07c28253e6916c7cf3"))
    );
  };

  // 请求参数前置处理
  const paramsHandle = e => {
    return a(i), n(e, i), ((e = t(e))[".sig"] = d(e)), e;
  };

  const NODE_ENV = process.env.NODE_ENV;
  const IS_DEV = NODE_ENV === "development";

  // 请求拦截器
  instance.interceptors.request.use(
    config => {
      if (config.url.indexOf("/sfc/") !== -1) {
        // 保存原始参数和原始URL
        if (!config.originalParams) {
          config.originalParams = { ...config.params };
        }
        if (!config.originalData) {
          config.originalData = { ...config.data };
        }
        if (!config.originalUrl) {
          config.originalUrl = config.url;
        }
        if (config.method === "get") {
          config.params = paramsHandle(config.originalParams);
        } else {
          config.data = paramsHandle(config.originalData);
        }

        // 重试时使用原始url进行截取
        if (!IS_DEV) {
          // 截取掉/sfc/
          config.url = "https://group.leying.com" + config.originalUrl.slice(4);
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
      let whitelistSfc = ["/v2/user/send-login-or-reg-validate-code"];

      let isErrorBySFC =
        (!IS_DEV ? true : response.config.url.indexOf("/sfc/") !== -1) &&
        data.status === 0;
      if (
        isErrorBySFC &&
        !whitelistSfc.some(item => response.config.url.includes(item))
      ) {
        if (data.errcode === "205" && data.msg === "登录失效") {
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
        ElMessage.error(data.msg || "请求失败");
        return Promise.reject(data);
      }
      return data;
    },
    async error => {
      const { response, config } = error;
      // console.warn('error-config', config, 'error-response', response)
      // 确保 config 存在
      if (!config) {
        console.warn("请求配置丢失，请稍后再试");
        return Promise.reject(error);
      }

      // 初始化 retryCount 如果它不存在
      if (config.retryCount === undefined) {
        config.retryCount = 0;
      }
      // 支持接口调用时自定义控制最大重试次数和重试间隔
      const maxRetries = config.maxRetries || 3;
      const retryDelay = config.retryDelay || 1; // 1 second
      // 重试接口名单
      let retrieUrls = [
        "/city/list",
        "/cinema/list",
        "/cinema/play-info",
        "/play/seat"
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
            ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
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
