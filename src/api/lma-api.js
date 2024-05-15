
/**
 * @description: 卢米埃api列表
 */

import axios from '@/utils/lma-request'

// 获取图片验证码
const getImgCode = (params) => axios.post('/lma/api/icode/img_captcha', params)

// 发送短信验证码
const getSmsCode = (params) => axios.post('/lma/api/icode/sms_captcha', params)

// 登录
const lmaLogin = (params) => axios.post('/lma/api/iuser/login', params)

// 退出登录
const lmaLogout = (params) => axios.post('/lma/api/iuser/login_out', params)

// 获取城市列表
const getCityList = (params) => axios.get('/api/city/list', {params})

// 获取影院列表
const getCinemaList = (params) => axios.get('/api/cinema/list', {params})

// 获取影院影片列表
const getCinemaFilmList = (params) => axios.get('/lma/api/index/sell_film', {params})

// 获取影片放映信息
const getMoviePlayInfo = (params) => axios.get('/lma/api/index/sell_session', {params})

// 获取座位布局
const getMoviePlaySeat = (params) => axios.get('/lma/api/ibuypro/index', {params})

// 锁定座位(返回订单号)
const lockSeat = (params) => axios.post('/lma/api/ibuypro/add_ticket', params)

// 获取订单信息
const getOrderInfo = (params) => axios.get('/lma/api/iorder/get_order', {params})

// 获取观影推荐套餐
const getRecommendPackage = (params) => axios.get('/lma/api/ibuypro/concess', {params})

// 取消订单
const cancelOrder = (params) => axios.post('/lma/api/iorder/cancel', params)

// 获取会员卡列表
const getCardList = (params) => axios.get('/api/card/get-user-cinema-card', {params})

// 获取优惠券列表
const getQuanList = (params) => axios.get('/api/v2/coupon/get-offline-coupon-list', {params})

// 订单价格计算
const priceCalculation = (params) => axios.post('/api/v2/price/calculate', params)

// 创建订单
const createOrder = (params) => axios.post('/api/v2/order/ng-create', params)

// 电影票购买
const buyTicket = (params) => axios.get('/api/ticket/ng-buy', {params})

// 支付订单并返回购票信息
const payOrder = (params) => axios.get('/api/order/get-my-order-result', {params})

// 获取最近一次订单信息
const getLastOrder = (params) => axios.get('/api/order/get-last-order', {params})

// 获取订单列表
const getOrderList = (params) => axios.get('/api/order/movie-ticket-orders', {params})

export default {
    getImgCode,
    getSmsCode,
    lmaLogin,
    lmaLogout,
    getCityList,
    getCinemaList,
    getCinemaFilmList,
    getMoviePlayInfo,
    getMoviePlaySeat,
    lockSeat,
    getOrderInfo,
    getRecommendPackage,
    cancelOrder,
    getCardList,
    getQuanList,
    priceCalculation,
    createOrder,
    payOrder,
    getLastOrder,
    getOrderList,
    buyTicket
}