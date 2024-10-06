/**
 * @description: 卢米埃api列表(小程序)，安卓需要mp替换为api,且部分url需改变
 */

import createAxios from "@/utils/http/lma-request";
import citys from "@/data/lma-city";
import cinemas from "@/data/lma-cinema";

const createApi = ({ app_name }) => {
  let axios = createAxios({
    app_name: app_name
  });
  // 获取城市列表
  const getCityList = () => ({
    status: true,
    code: "0",
    data: {
      list: citys
    }
  });

  // 获取影院列表
  const getCinemaList = city_id => {
    return {
      status: true,
      code: "0",
      data: {
        list: cinemas.filter(item => item.city_id == city_id)
      }
    };
  };

  // 获取城市影院版本信息（用于过滤城市及影院）
  const getDiffVersion = params =>
    axios.get("/lma/mp/icity/get_diff_version", {
      params
    });
  // 获取电影放映列表
  const getMoviePlayInfo = params =>
    axios.get("/lma/mp/index/film", { params, withCredentials: true });

  // 获取电影放映场次
  const getMoviePlayDate = params =>
    axios.get("/lma/mp/index/sell_session", { params });

  // 获取座位布局
  const getMoviePlaySeat = params =>
    axios.get("/lma/mp/ibuypro/index", { params });

  // 锁定座位
  const lockSeat = params => axios.post("/lma/mp/ibuypro/add_ticket", params);

  // 锁座后获取订单信息（可做计算价格）
  const getOrderInfo = params =>
    axios.get("/lma/mp/iorder/get_order", {
      params
    });
  // 获取会员卡列表
  const getCardList = params => axios.get("/lma/mp/imember/index", { params });

  // 获取优惠券列表
  const getQuanList = params => axios.get("/lma/mp/icoupon/index", { params });

  // 个人中心优惠券列表，优先用券时使用
  const getQuanListByFirstUseQuan = params =>
    axios.get("/lma/mp/icoupon/index", { params });

  // 订单价格计算
  const priceCalculation = params =>
    axios.get("/lma/mp/iorder/get_order", { params });

  // 创建订单
  const createOrder = params => axios.post("/sfc/v2/order/ng-create", params);

  // 电影票购买
  const buyTicket = params => axios.get("/sfc/ticket/ng-buy", { params });

  // 支付订单并返回购票信息
  const payOrder = params =>
    axios.get("/sfc/order/get-my-order-result", { params });

  // 获取订单列表
  const getOrderList = params =>
    axios.get("/lma/mp/ihistory/ticket", { params });

  // 获取订单详情
  const getOrderDetail = params =>
    axios.get("/lma/mp/ihistory/ticket_info", { params });

  // 取消订单
  const cancelOrder = params => axios.post("/lma/mp/iorder/cancel", { params });

  // 绑定优惠券
  const bandQuan = params =>
    axios.get("/sfc/v2/coupon/bind-coupon-code", { params });

  return {
    getCityList,
    getCinemaList,
    getMoviePlayInfo,
    getMoviePlayDate, // 获取电影放映场次
    getMoviePlaySeat,
    lockSeat,
    getCardList,
    getQuanList,
    getQuanListByFirstUseQuan,
    priceCalculation,
    createOrder,
    payOrder,
    getOrderDetail,
    cancelOrder,
    getOrderList,
    buyTicket,
    bandQuan
  };
};
export default createApi;
