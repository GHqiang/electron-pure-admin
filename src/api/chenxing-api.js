/**
 * @description: 辰星api列表
 */

import createAxios from "@/utils/http/chenxing-request";
import { GET_APP_INFO } from "@/common/constant";
import { requestViaMain } from "@/utils/utils"; // 你已封装的主进程请求方法
import { paramsHandle } from "@/utils/http/chenxing-request"; // 确保你已导出 paramsHandle
const IS_DEV = process.env.NODE_ENV === "development";
const createApi = ({ app_name }) => {
  // 启用新版本服务影院列表
  let axios = createAxios({
    app_name: app_name
  });
  let api_version = GET_APP_INFO(app_name)?.api_version;
  let api_v = GET_APP_INFO(app_name)?.api_v || "V4.0.2";

  const apiPathByVerObj = {
    getCinemaList: {
      "V4.0.2": "/selfSupport/front/cticket/getCinemaList",
      "V3.1.2": "/selfSupport/front/cticket/getCinemaList"
    },
    getCardList: {
      "V4.0.2": "/selfSupport/trade/front/user/cards",
      "V3.1.2": "/selfSupport/trade/front/user/cards/crmMultiCard"
    },
    getQuanList: {
      "V4.0.2": "/selfSupport/front/coupon/list",
      "V3.1.2": "/selfSupport/front/coupon/v2/list"
    },
    getMoviePlayInfo: {
      "V4.0.2": "/selfSupport/front/cticket/getHitFilm",
      "V3.1.2": "/selfSupport/front/cticket/v2/getHitFilm"
    },
    getUpcomingFilm: {
      "V4.0.2": "/selfSupport/front/cticket/getUpcomingFilm",
      "V3.1.2": "/selfSupport/front/cticket/v2/getUpcomingFilm"
    },
    getMoviePlayTime: {
      "V4.0.2": "/selfSupport/front/cticket/loadSchedule",
      "V3.1.2": "/selfSupport/front/cticket/v2/loadSchedule"
    },
    priceCalculation: {
      "V4.0.2": "/selfSupport/trade/front/orders/calculatePrice",
      "V3.1.2": "/selfSupport/trade/front/orders/calculatePriceV2"
    }
  };
  let apiUrlObj = {
    // 授权token
    authToken: {
      "3.0C": "/selfSupport/front/cticket/getCinemaList",
      C: "/chenxing/api/auth/token"
    },
    getUserInfo: {
      "3.0C": "/selfSupport/front/cticket/getCinemaList",
      C: "/chenxing/api/middleground/member/user/getUserInfo "
    },
    // 获取影院列表
    getCinemaList: {
      // "3.0C": ["/selfSupport/front/cticket/getCinemaList", "post"],
      "3.0C": apiPathByVerObj.getCinemaList[api_v],
      C: "/chenxing/api/middleground/ticket/c/cbase/cityAndCinemaList"
    },
    // 获取热映电影放映信息
    getMoviePlayInfo: {
      "3.0C": apiPathByVerObj.getMoviePlayInfo[api_v],
      C: "/chenxing/api/middleground/ticket/c/cticket/getHitFilm"
    },
    // 获取预售电影放映信息
    getUpcomingFilm: {
      "3.0C": apiPathByVerObj.getUpcomingFilm[api_v],
      C: "/chenxing/api/middleground/ticket/c/cticket/getUpcomingFilm"
    },
    // 获取电影放映场次
    getMoviePlayTime: {
      "3.0C": apiPathByVerObj.getMoviePlayTime[api_v],
      C: "/chenxing/api/middleground/ticket/c/cticket/getHitFilmAndFilmSession"
    },
    // 获取座位布局
    getMoviePlaySeat: {
      "3.0C": "/selfSupport/front/cticket/loadWxPlanSite",
      C: "/chenxing/api/middleground/ticket/c/cticket/getSessionSeat"
    },
    // 锁定座位
    lockSeat: {
      "3.0C": "/selfSupport/trade/front/advanceOrder/lockSeat",
      C: "/chenxing/api/middleground/trade/online/directly/cart/lockSeat"
    },
    // 获取会员卡列表
    getCardList: {
      "3.0C": apiPathByVerObj.getCardList[api_v],
      C: "/chenxing/api/middleground/member/user/cards"
    },
    // 获取优惠券列表
    getQuanList: {
      "3.0C": apiPathByVerObj.getQuanList[api_v],
      C: "/chenxing/api/middleground/member/fin/voucher/ticketEnable"
    },
    // 计算价格
    priceCalculation: {
      "3.0C": apiPathByVerObj.priceCalculation[api_v],
      C: "/chenxing/api/middleground/trade/online/directly/cart/calculatePrice"
    },
    // 创建订单
    createOrder: {
      "3.0C": "/selfSupport/trade/front/orders/submitOrder",
      C: "/chenxing/api/middleground/trade/online/directly/order/submitOrder"
    },
    // 支付订单
    buyTicket: {
      "3.0C": "/selfSupport/trade/front/order/onlinePay",
      C: "/chenxing/api/middleground/trade/online/directly/payment/onlinePay"
    },
    // 获取订单信息
    queryOrderDetail: {
      "3.0C": "/selfSupport/trade/front/orders/queryOrderDetail",
      C: "/chenxing/api/middleground/trade/online/directly/order/queryOrderDetail"
    },
    // 取消订单
    cancelOrder: {
      "3.0C": "/selfSupport/trade/front/orders/cancelOrder",
      C: "/chenxing/api/middleground/trade/online/directly/order/cancelOrder"
    },
    // 释放座位
    releaseSeat: {
      "3.0C": "/selfSupport/trade/front/advanceOrder/releaseSeat",
      C: "/chenxing/api/middleground/trade/online/directly/cart/releaseSeat"
    },
    // 绑定优惠券
    bandQuan: {
      "3.0C": "/selfSupport/front/coupon/bindToPhone",
      C: "/chenxing/api/middleground/member/fin/voucher/bind"
    }
  };

  let apiFunObj = {};

  Object.entries(apiUrlObj).map(([funName, apiUrl]) => {
    const path = apiUrl[api_version];
    if (!path) {
      console.warn(`未找到 ${app_name} 的 ${funName} 接口路径`);
      apiFunObj[funName] = () =>
        Promise.reject(new Error("API path not found"));
      return;
    }
    apiFunObj[funName] = async (params = {}) => {
      return axios.post(path, params || {});
      // 判断是否需要走主进程代理
      // if (IS_DEV && api_version === "3.0C") {
      //   // 1. 处理参数（复用原有逻辑）
      //   const processedParams = paramsHandle(params, app_name);

      //   // 2. 构造完整 URL
      //   const fullUrl = "https://capi.oristarcloud.com" + path;

      //   // 3. 调用主进程代理（所有 3.0C 接口目前都是 POST）
      //   try {
      //     const result = await requestViaMain({
      //       url: fullUrl,
      //       method: "POST",
      //       headers: {
      //         "Content-Type": "application/json"
      //       },
      //       data: processedParams,
      //       timeout: 20000
      //     });
      //     return result; // 注意：requestViaMain 已经返回 .data
      //   } catch (error) {
      //     // 统一错误格式，便于上层 ElMessage 捕获
      //     return Promise.reject(error);
      //   }
      // } else {
      //   // 走原 axios 流程
      //   return axios.post(path, params || {});
      // }
    };
  });
  // console.log("apiFunObj", apiFunObj);
  return apiFunObj;
};
export default createApi;
