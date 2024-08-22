/**
 * @description: ume-耀莱影院api列表
 */
/**
 * @description: sfc上影api列表
 */

import createAxios from "@/utils/http/ume-request";
const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });
  // 获取城市及影院列表
  const getCinemaList = params =>
    axios.post(
      `/${app_name}/api/storeServer/cinCinemaInfoService/findCinCityToApp`,
      params
    );

  // 获取电影放映列表
  const getMoviePlayInfo = params =>
    axios.post(
      `/${app_name}/api/storeServer/cinCinemaFilmInfoService/findFilmInfoToApp`,
      params
    );

  // 获取电影放映日期
  const getMoviePlayDate = params =>
    axios.post(
      `/${app_name}/api/storeServer/cinScheduleInfoService/findCinScheduleDataToApp`,
      params
    );

  // 获取电影放映场次
  const getMoviePlayTime = params =>
    axios.post(
      `/${app_name}/api/storeServer/cinScheduleInfoService/findScheduleInfoToApp`,
      params
    );

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.post(
      `/${app_name}/api/storeServer/cinSyncService/findSeatMapInfo`,
      params
    );

  // 锁定座位
  const lockSeat = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/createMovieTicketsOrder`,
      params
    );

  // 获取卡券列表
  const getCardQuanList = params =>
    axios.post(
      `/${app_name}/api/storeServer/optimalCombinatService/getOptimalCombination`,
      params
    );

  // 订单价格计算
  const priceCalculation = params =>
    axios.post(`/sfc/v2/price/calculate`, params);

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
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/commitMovieTicketsOrder`,
      params
    );

  // 获取订单时间
  const getOrderTime = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/getOrderTime`,
      params
    );
  // 获取订单列表
  const findStoreTkOrderInfoApp = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/findStoreTkOrderInfoApp`,
      params
    );

  // 取消订单
  const cannelOneOrder = params =>
    axios.post(
      `/${app_name}/api/storeServer/StoreReturnOrderService/cannelOneOrder`,
      params
    );

  // 电影票购买
  const buyTicket = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/saveMemberOrderPayAmount`,
      params
    );

  // 获取影院优惠活动
  const findZoneByChannel = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeActivityZoneService/findZoneByChannel`,
      params
    );

  // 获取其它活动信息
  const findTsgGift = params =>
    axios.post(
      `/${app_name}/api/storeServer/ticketSaleGiftActivityService/findTsgGift`,
      params
    );

  // 获取购票信息
  const getPayResult = params =>
    axios.post(
      `/${app_name}/api/storeServer/storeTkOrderHeaderService/findStoreTkOrderInfoApp`,
      params
    );

  // 绑定优惠券
  const bandQuan = params =>
    axios.post(
      `/${app_name}/api/storeServer/couponYlInstanceService/findIsNeedPin`,
      params
    );

  // 获取订单列表
  const getOrderList = params =>
    axios.get(`/sfc/order/movie-ticket-orders`, { params });

  return {
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayDate,
    getMoviePlayTime,
    getMoviePlaySeat,
    lockSeat,
    getCardQuanList,
    priceCalculation,
    findStoreMemberMoviegoersByMemberId,
    updateStoreOrderMoviegoers,
    createOrder,
    cannelOneOrder,
    getOrderTime,
    getPayResult,
    getOrderList,
    findStoreTkOrderInfoApp,
    buyTicket,
    findZoneByChannel,
    findTsgGift,
    bandQuan
  };
};
export default createApi;
