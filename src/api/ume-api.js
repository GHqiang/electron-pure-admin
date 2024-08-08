/**
 * @description: ume-耀莱影院api列表
 */
/**
 * @description: sfc上影api列表
 */

import createAxios from "@/utils/http/ume-request";
const createApi = ({ appName }) => {
  let axios = createAxios({
    appName: appName
  });
  // 获取城市及影院列表
  const getCinemaList = params =>
    axios.post(
      `/${appName}/api/storeServer/cinCinemaInfoService/findCinCityToApp`,
      params
    );

  // 获取电影放映列表
  const getMoviePlayInfo = params =>
    axios.post(
      `/${appName}/api/storeServer/cinCinemaFilmInfoService/findFilmInfoToApp`,
      params
    );

  // 获取电影放映日期
  const getMoviePlayDate = params =>
    axios.post(
      `/${appName}/api/storeServer/cinScheduleInfoService/findCinScheduleDataToApp`,
      params
    );

  // 获取电影放映场次
  const getMoviePlayTime = params =>
    axios.post(
      `/${appName}/api/storeServer/cinScheduleInfoService/findScheduleInfoToApp`,
      params
    );

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.post(
      `/${appName}/api/storeServer/cinSyncService/findSeatMapInfo`,
      params
    );

  // 锁定座位
  const lockSeat = params =>
    axios.post(
      `/${appName}/api/storeServer/storeTkOrderHeaderService/createMovieTicketsOrder`,
      params
    );

  // 获取卡券列表
  const getCardQuanList = params =>
    axios.post(
      `/${appName}/api/storeServer/optimalCombinatService/getOptimalCombination`,
      params
    );

  // 订单价格计算
  const priceCalculation = params =>
    axios.post(`/sfc/v2/price/calculate`, params);

  // 获取零食商品信息
  const findProductInfoByCinema = params =>
    axios.post(
      `/${appName}/api/storeServer/productInfoService/findProductInfoByCinema`,
      params
    );
  // 获取微信菜单信息
  const findAppMenuInfoV2 = params =>
    axios.post(
      `/${appName}/api/storeServer/wechatMenuInfoService/findAppMenuInfoV2`,
      params
    );

  // 获取订单微信消息模版
  const getTemplateIdList = params =>
    axios.post(
      `/${appName}/api/storeServer/wechatMiniAppMessageService/getTemplateIdList`,
      params
    );

  // 获取配送服务相关的影厅列表
  const findDeliveryGetHallList = params =>
    axios.post(
      `/${appName}/api/storeServer/storeOrderExpressDeliveryService/findDeliveryGetHallList`,
      params
    );

  // 获取配送商品的日期信息
  const findDeliveryGoodsDateInfo = params =>
    axios.post(
      `/${appName}/api/storeServer/storeOrderExpressDeliveryService/findDeliveryGoodsDateInfo`,
      params
    );

  // 耀莱创建订单前需要先获取观影人列表添加观影人
  // 获取观影人列表
  const findStoreMemberMoviegoersByMemberId = params =>
    axios.post(
      "/yaolai/api/storeServer/storeOrderMoviegoersService/findStoreMemberMoviegoersByMemberId",
      params
    );

  // 添加观影人
  const updateStoreOrderMoviegoers = params =>
    axios.post(
      "/yaolai/api/storeServer/storeOrderMoviegoersService/updateStoreOrderMoviegoers",
      params
    );
  // 创建订单
  const createOrder = params =>
    axios.post(
      `/${appName}/api/storeServer/storeTkOrderHeaderService/commitMovieTicketsOrder`,
      params
    );

  // 获取订单时间
  const getOrderTime = params =>
    axios.post(
      `/${appName}/api/storeServer/storeTkOrderHeaderService/getOrderTime`,
      params
    );
  // 获取订单列表
  const findStoreTkOrderInfoApp = params =>
    axios.post(
      `/${appName}/api/storeServer/storeTkOrderHeaderService/findStoreTkOrderInfoApp`,
      params
    );

  // 取消订单
  const cannelOneOrder = params =>
    axios.post(
      `/${appName}/api/storeServer/StoreReturnOrderService/cannelOneOrder`,
      params
    );
  // 电影票购买
  const buyTicket = params => axios.get(`/sfc/ticket/ng-buy`, { params });

  // 支付订单并返回购票信息
  const payOrder = params =>
    axios.get(`/sfc/order/get-my-order-result`, { params });

  // 获取订单列表
  const getOrderList = params =>
    axios.get(`/sfc/order/movie-ticket-orders`, { params });

  // 绑定优惠券
  const bandQuan = params =>
    axios.get(`/sfc/v2/coupon/bind-coupon-code`, { params });

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayDate,
    getMoviePlayTime,
    getMoviePlaySeat,
    lockSeat,
    getCardQuanList,
    priceCalculation,
    findProductInfoByCinema,
    findAppMenuInfoV2,
    getTemplateIdList,
    findStoreMemberMoviegoersByMemberId,
    updateStoreOrderMoviegoers,
    findDeliveryGetHallList,
    findDeliveryGoodsDateInfo,
    createOrder,
    cannelOneOrder,
    getOrderTime,
    payOrder,
    getOrderList,
    findStoreTkOrderInfoApp,
    buyTicket,
    bandQuan
  };
};
export default createApi;
