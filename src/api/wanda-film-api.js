/**
 * 万达电影直连 API 接口列表（wandafilm.com）
 *
 * URL 格式: /wanda-film/{baseAlias}/path/to/api
 * baseAlias 说明:
 *   misc    → https://misc-api-prd-mx.wandafilm.com    (通用服务)
 *   cinema  → https://cinema-api-prd-mx.wandafilm.com  (影院/电影/排期)
 *   user    → https://user-api-prd-mx.wandafilm.com    (用户)
 *   ticket  → https://front-gateway-c.wandafilm.com     (票务:座位/订单, 统一网关)
 *   payment → https://payment-api-prd-mx.wandafilm.com (支付)
 *   card    → https://card-api-prd-mx.wandafilm.com    (会员卡)
 *   coupon  → https://coupon-api-prd-mx.wandafilm.com  (优惠券)
 *   activity → https://mkt-activity-api-prd-mx.wandafilm.com (活动)
 *   snack   → https://front-gateway-c.wandafilm.com     (卖品)
 */

import createAxios from "@/utils/http/wanda-film-request";

const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });

  // ============================================================
  // 4. 通用服务接口
  // ============================================================

  /** 城市列表（返回值 id 即为影院列表的 locationId） */
  const getCityList = (config = {}) =>
    axios.get("/wanda-film/misc/homepage/city.api", config);

  // ============================================================
  // 5.1 电影列表与详情
  // ============================================================

  /** 正在热映 */
  const getHotShowList = (params, config = {}) =>
    axios.get("/wanda-film/cinema/movie/hot_show_v6_4.api", {
      params,
      ...config
    });

  /** 即将上映 */
  const getComingList = (params, config = {}) =>
    axios.get("/wanda-film/cinema/movie/coming_v6_4.api", {
      params,
      ...config
    });

  /** 热映+即将上映（首页） */
  const getHotComingShow = (params, config = {}) =>
    axios.get("/wanda-film/cinema/movie/hot_coming_show.api", {
      params,
      ...config
    });

  /** 点播电影 */
  const getOnDemandShow = (params, config = {}) =>
    axios.get("/wanda-film/cinema/movie/on_demand_show.api", {
      params,
      ...config
    });

  /**
   * 影片列表（合并热映+即将上映+点播），供规则新建下拉使用
   * 与 SFC 系列的 getMoviePlayInfo 功能对齐
   */
  const getMoviePlayInfo = async (params = {}) => {
    const cityId = params.cityId;
    const commonParams = { cityId, json: true };

    const [hcRes, odRes] = await Promise.all([
      axios.get("/wanda-film/cinema/movie/hot_coming_show.api", {
        params: commonParams
      }),
      axios.get("/wanda-film/cinema/movie/on_demand_show.api", {
        params: commonParams
      })
    ]);

    // 响应拦截器已返回 response.data，直接取 .data 即为业务数据
    const hcData = hcRes.data || {};
    const odData = odRes.data || {};

    // 合并 hot + incoming + onDemand，按 movieId 去重
    const movieMap = new Map();
    const pushMovie = m => {
      if (m?.movieId && !movieMap.has(m.movieId)) {
        movieMap.set(m.movieId, {
          film_id: m.movieId,
          film_name: m.nameCN,
          ...m
        });
      }
    };

    (hcData.hotMovie || []).forEach(pushMovie);
    (hcData.incomingMovie || []).forEach(pushMovie);
    (odData.onDemandMovie || []).forEach(pushMovie);

    return {
      code: 0,
      data: {
        movie_data: Array.from(movieMap.values())
      }
    };
  };

  // ============================================================
  // 5.2 影院与排期
  // ============================================================

  /** 影院列表（按城市） */
  const getCinemaList = (params = {}, config = {}) =>
    axios.get("/wanda-film/cinema/cinema/by_locationid_v6_4.api", {
      params: { coordType: 2, ...params },
      ...config
    });

  /** 影院列表（含城市信息，通过后端映射表） */
  const getCinemaListWithCity = (config = {}) =>
    axios.get("/wanda-film/cinema/cinema/list-with-city", config);

  /** 影院详情 */
  const getCinemaDetail = (params, config = {}) =>
    axios.get("/wanda-film/cinema/cinema/by_cinemaid.api", {
      params,
      ...config
    });

  /** 影院排期列表 */
  const getShowtimeByCinema = (params, config = {}) =>
    axios.get("/wanda-film/cinema/showtime/by_cinema.api", {
      params,
      ...config
    });

  /** 影片排期（按影院/影片/日期） */
  const getShowtimeByCinemaFilmDate = (params, config = {}) =>
    axios.get("/wanda-film/cinema/showtime/by_cinema_film_date.api", {
      params,
      ...config
    });

  // ============================================================
  // 5.3 选座与锁座
  // ============================================================

  /** 实时座位图 */
  const getRealTimeSeat = (params, config = {}) =>
    axios.get("/wanda-film/ticket/order/real_time_seat.api", {
      params,
      ...config
    });

  /** 按场次码查询座位 */
  const getRealTimeSeatByCode = (params, config = {}) =>
    axios.get("/wanda-film/ticket/order/real_time_seat_by_code.api", {
      params,
      ...config
    });

  /** 自动选座 */
  const getAutoSeat = (params, config = {}) =>
    axios.get("/wanda-film/ticket/order/auto_seat.api", { params, ...config });

  /** 获取座位图标列表 */
  const getSeatIconsList = (params, config = {}) =>
    axios.get("/wanda-film/misc/acm/get_seaticons_list.api", {
      params,
      ...config
    });

  // ============================================================
  // 5.4 订单创建与确认
  // ============================================================

  /** 创建订单（锁座） */
  const createOrder = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/create_order.api", data, config);

  /** 确认订单（绑定手机） */
  const confirmOrder = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/confirm_order.api", data, config);

  /** 订单状态轮询 */
  const queryOrderStatus = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/order_status.api", data, config);

  /** 查询订单信息 */
  const queryOrderByUserId = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/query_by_userid.api", data, config);

  /** 查询订单列表 */
  const queryOrderList = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/query_order_list.api", data, config);

  /** 合并支付 */
  const mergePayment = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/merge_payment.api", data, config);

  /** 取消订单 */
  const cancelOrder = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/cancel.api", data, config);

  // ============================================================
  // 5.5 订单查询与管理
  // ============================================================

  /** 查询支付信息（升级版） */
  const queryPayInfoUpgrade = (data, config = {}) =>
    axios.post(
      "/wanda-film/ticket/order/query_pay_info_upgrade.api",
      data,
      config
    );

  /** 查询支付结果 */
  const queryPayDealResult = (data, config = {}) =>
    axios.post(
      "/wanda-film/ticket/order/query_pay_deal_result.api",
      data,
      config
    );

  /** 查询退款状态 */
  const queryOrderRefundStatus = (data, config = {}) =>
    axios.post(
      "/wanda-film/ticket/order/query_order_refund_status.api",
      data,
      config
    );

  /** 查询电影提醒 */
  const queryMovieRemindByUserId = (data, config = {}) =>
    axios.post(
      "/wanda-film/ticket/order/query_movie_remind_by_userid.api",
      data,
      config
    );

  /** 支付方式列表 */
  const getPayMethodList = (params, config = {}) =>
    axios.get("/wanda-film/payment/order/pay_method_list.api", {
      params,
      ...config
    });

  // ============================================================
  // 5.7 退款
  // ============================================================

  /** 退款详情 */
  const getRefundDetails = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/refund_details.api", data, config);

  /** 查询退款信息 */
  const queryRefundInfo = (data, config = {}) =>
    axios.post(
      "/wanda-film/ticket/order/query_order_info_for_refund.api",
      data,
      config
    );

  /** 执行退款 */
  const refundOrder = (data, config = {}) =>
    axios.post("/wanda-film/ticket/order/refund_order.api", data, config);

  // ============================================================
  // 4. 用户认证接口
  // ============================================================

  /** 第三方登录 */
  const thirdLogin = (data, config = {}) =>
    axios.post("/wanda-film/user/user/third_login.api", data, config);

  /** 检查登录状态 */
  const checkLogin = (data, config = {}) =>
    axios.post("/wanda-film/user/user/islogin.api", data, config);

  /** 发送短信验证码 */
  const sendSmsCode = (data, config = {}) =>
    axios.post("/wanda-film/user/user/third_mobile_code.api", data, config);

  /** 绑定手机号 */
  const bindMobile = (data, config = {}) =>
    axios.post("/wanda-film/user/user/third_bind_mobile.api", data, config);

  /** 获取图片验证码 */
  const applyVerifyImgCode = (params, config = {}) =>
    axios.get("/wanda-film/user/user/apply_verify_img_code.api", {
      params,
      ...config
    });

  /** 校验图片验证码 */
  const verifyImgCode = (data, config = {}) =>
    axios.post("/wanda-film/user/user/verify_img_code.api", data, config);

  // ============================================================
  // 6. 卡券接口
  // ============================================================

  /** 获取卡详情 */
  const getCardDetail = (params, config = {}) =>
    axios.get("/wanda-film/card/card/get_card.api", { params, ...config });

  /** 获取会员卡列表（同步用，对应 card/user_card/list.api） */
  const getCardList = (params, config = {}) =>
    axios.get("/wanda-film/card/card/user_card/list.api", {
      params,
      ...config
    });

  // 支付界面会员卡列表，需传参订单id：orderId: xxx, json: true
  const getPayCardList = (params, config = {}) =>
    axios.get("/wanda-film/card/pay/list.api", {
      params,
      ...config
    });

  /** 卡主题列表 */
  const getCardThemeList = (params, config = {}) =>
    axios.get("/wanda-film/card/card/theme/list.api", { params, ...config });

  /** 绑定会员卡 */
  const bindCard = (params, config = {}) =>
    axios.get("/wanda-film/card/card/bind.api", { params, ...config });

  /** 优惠券商品列表 */
  const getCouponGoodsList = (params, config = {}) =>
    axios.get("/wanda-film/coupon/coupon/goods/coupon_list.api", {
      params,
      ...config
    });

  /** 领取优惠券 */
  const gainCoupon = (data, config = {}) =>
    axios.post("/wanda-film/coupon/coupon/present/gain.api", data, config);

  /** 优惠券到期提醒列表 */
  const getCouponExpireAndEffective = (params, config = {}) =>
    axios.get("/wanda-film/coupon/coupon/expireandeffective.api", {
      params,
      ...config
    });

  // ============================================================
  // 6. 活动权益
  // ============================================================

  /** 获取可用活动权益/券 */
  const getActivityCoupon = (params, config = {}) =>
    axios.get("/wanda-film/activity/mkt/activity/secret/list.api", {
      params,
      ...config
    });

  return {
    // 通用服务
    getCityList,
    // 电影列表
    getHotShowList,
    getComingList,
    getHotComingShow,
    getOnDemandShow,
    getMoviePlayInfo,
    // 影院排期
    getCinemaList,
    getCinemaListWithCity,
    getCinemaDetail,
    getShowtimeByCinema,
    getShowtimeByCinemaFilmDate,
    // 选座
    getRealTimeSeat,
    getRealTimeSeatByCode,
    getAutoSeat,
    getSeatIconsList,
    // 订单
    createOrder,
    confirmOrder,
    queryOrderStatus,
    queryOrderByUserId,
    queryOrderList,
    mergePayment,
    cancelOrder,
    // 订单查询
    queryPayInfoUpgrade,
    queryPayDealResult,
    queryOrderRefundStatus,
    queryMovieRemindByUserId,
    getPayMethodList,
    // 退款
    getRefundDetails,
    queryRefundInfo,
    refundOrder,
    // 用户认证
    thirdLogin,
    checkLogin,
    sendSmsCode,
    bindMobile,
    applyVerifyImgCode,
    verifyImgCode,
    // 卡券
    getCardDetail,
    getCardList,
    getPayCardList, // 支付界面会员卡列表
    getCardThemeList,
    bindCard,
    getCouponGoodsList,
    gainCoupon,
    getCouponExpireAndEffective,
    // 活动权益
    getActivityCoupon
  };
};

export default createApi;
