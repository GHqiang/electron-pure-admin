// sfc请求拦截器封装
import axios from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import { APP_LIST } from "@/common/constant";
import md5 from "../md5.js";
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
    let obj = loginInfoList.find(
      itemA => itemA.app_name === app_name && itemA.session_id
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
        if (config.method === "get") {
          config.params = paramsHandle(config.params);
        } else {
          config.data = paramsHandle(config.data);
        }
        if (!IS_DEV) {
          // 截取掉/sfc/
          config.url = "https://group.leying.com" + config.url.slice(4);
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
          ElMessage.warning(`${APP_LIST[app_name]}登录失效，请重新设置登录信息`);
          // ElMessageBox.confirm(
          //   `${APP_LIST[app_name]}登录失效，请重新登录`,
          //   "提示",
          //   {
          //     confirmButtonText: "我知道了",
          //     type: "warning",
          //     showCancelButton: false,
          //     showClose: false,
          //     closeOnClickModal: false,
          //     closeOnPressEscape: false
          //   }
          // )
          //   .then(() => {
          //     // removeSfcUserInfo(app_name);
          //     router.push({ path: "/set/appLogin" });
          //   })
          //   .catch(() => {});
          // return;
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
            ElMessage.error(`请求错误 ${response.status}: ${error.message}`);
        }
      } else {
        ElMessage.error("网络连接异常，请稍后再试");
      }
      return Promise.reject(error);
    }
  );
  return instance;
};

export default createAxios;
