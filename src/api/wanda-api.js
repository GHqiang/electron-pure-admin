/**
 * @description: 万达api列表
 */

import axios from "@/utils/http/wanda-request";

// 获取城市列表(可支持自定义控制axios配置，如超时时间、重试次数、重试间隔，配合拦截器使用)
const getCityList = (params, config = {}) =>
  axios.get("/wanda/homepage/city.api#misc-api-prd-mx", { params, ...config });

// 获取某个城市的影院列表
const getCinemaList = params =>
  axios.get("/wanda/cinema/by_locationid_v6_4.ap#cinema-api-prd-mx", {
    params
  });
// 获取线上电影列表
const getMovieList = params =>
  axios.get("/wanda/movie/hot_coming_show.api#cinema-api-prd-mx", { params });

// 获取电影放映场次信息
const getMoviePlayInfo = params =>
  axios.get("/wanda/cinema/by_filmid_v6_4.api#cinema-api-prd-mx", {
    params
  });

export default {
  getCityList,
  getCinemaList,
  getMovieList,
  getMoviePlayInfo
};
