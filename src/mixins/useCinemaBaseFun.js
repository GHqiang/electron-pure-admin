// useCinemaBaseFun.js (组合式函数)
import { APP_API_OBJ } from "@/common/index.js";
import { computed } from "vue";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GE_APP_INFO
} from "@/common/constant";

export default function useCinemaBaseFun() {
  const UME_LIST = computed(() => GET_UME_LIST());
  const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
  const CHENXING_LIST = computed(() => GET_CHENXING_LIST());

  let cityCinemaList = []; // 城市影院列表（仅特殊影院有值）

  // 获取全部城市列表
  const getCityList = async app_name => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      let list;
      if (UME_LIST.value.includes(app_name)) {
        // 传参固定值可能有潜在风险
        let params = {
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            cinemaCode: "32012801",
            cinemaLinkId: "15946"
          }
        };
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res.data || [];
        list = cityCinemaList.map(item => ({
          city_name: item.cityName,
          city_id: item.cityCode
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        let params = {
          empCode: "",
          leaseCode: ""
        };
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res.bizValue?.cities || [];
        list = cityCinemaList.map(item => ({
          city_name: item.cityName,
          city_id: item.cityCode
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let params = {};
        const res = await cinemaApi.getCinemaList(params);
        let api_version = GE_APP_INFO(app_name)?.api_version || "";
        if (api_version === "3.0C") {
          cityCinemaList = res.data || [];
          list = cityCinemaList.map(item => ({
            city_name: item.cityInfoDTO.cityName,
            city_id: item.cityInfoDTO.cityCode
          }));
        } else if (api_version === "C") {
          cityCinemaList = res.data?.resultDOList || [];
          list = cityCinemaList.map(item => ({
            city_name: item.cityInfo.chName,
            city_id: item.cityInfo.id
          }));
        }
      } else if (app_name === "lma") {
        const res = await cinemaApi.getCityList();
        list = res.data.list || [];
        list = list.map(item => ({
          city_name: item.city_name,
          city_id: item.city_id
        }));
      } else {
        // sfc系列
        const res = await cinemaApi.getCityList({});
        list = res?.data?.all_city || [];
        list = list.map(item => ({
          city_name: item.name,
          city_id: item.id
        }));
      }
      console.log("获取城市列表返回", list);
      return list;
    } catch (error) {
      console.warn("获取城市列表异常", error);
    }
  };

  // 获取全部影院列表
  const getAllCinemaList = async (app_name, cityList) => {
    try {
      let allCinemaList = [];
      for (let index = 0; index < cityList.length; index++) {
        const item = cityList[index];
        let list = await getCinemaListByCityId(app_name, item.city_id);
        list = list.map(itemA => {
          return {
            ...itemA,
            city_name: item.city_name,
            city_id: item.city_id
          };
        });
        if (list.length > 0) {
          allCinemaList = allCinemaList.concat(list);
        }
      }
      return allCinemaList;
    } catch (error) {
      console.warn("获取全部影院列表异常", error);
    }
  };

  // 根据城市获取影院列表
  const getCinemaListByCityId = async (app_name, city_id) => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      console.log("根据城市获取影院列表", app_name, city_id);
      let cinemaList = [];
      if (UME_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.cityCode === city_id)?.cinemaList ||
          [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinemaCode,
          cinema_name: item.cinemaName
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.cityCode === city_id)?.cinemas || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinemaLinkId,
          cinema_name: item.cinemaName
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let api_version = GE_APP_INFO(app_name)?.api_version || "";
        if (api_version === "3.0C") {
          cinemaList =
            cityCinemaList.find(item => item.cityInfoDTO.cityCode === city_id)
              ?.cinemaResultDTOList || [];
          cinemaList = cinemaList.map(item => ({
            ...item,
            cinema_id: item.cinemaCode,
            cinema_name: item.cinemaName
          }));
        } else if (api_version === "C") {
          cinemaList =
            cityCinemaList.find(item => item.cityInfo.id === city_id)
              ?.cinemas || [];
          cinemaList = cinemaList.map(item => ({
            ...item,
            cinema_id: item.unifiedCode,
            cinema_name: item.name
          }));
        }
      } else if (app_name === "lma") {
        const res = await cinemaApi.getCinemaList(city_id);
        cinemaList = res.data.list || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinema_id,
          cinema_name: item.cinema_name
        }));
      } else {
        // sfc系列
        const res = await cinemaApi.getCinemaList({ city_id });
        cinemaList = res.data?.cinema_data || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.id,
          cinema_name: item.name
        }));
      }
      console.log("根据城市获取影院列表", cinemaList);
      return cinemaList;
    } catch (error) {
      console.warn("根据城市获取影院列表异常", error);
    }
  };

  // 获取线上电影列表
  const getFilmList = async (app_name, oneCity, oneCinema) => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      let list = [];
      if (UME_LIST.value.includes(app_name)) {
        const params = {
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            cinemaCode: oneCinema.cinemaCode,
            cinemaLinkId: oneCinema.cinemaLinkId
          }
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        list =
          res.data?.find(item => item.showStatus === "SHOWING")?.fimlList || [];
        list = list.map(item => ({
          ...item,
          film_id: item.filmHeadId,
          film_name: item.filmName
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        const params = {
          empCode: "",
          leaseCode: "",
          cinemaLinkId: oneCinema.cinemaLinkId,
          posterSize: "SMALL"
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        list = res?.bizValue || [];
        list = list.map(item => ({
          ...item,
          film_id: item.filmId,
          film_name: item.filmName
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let api_version = GE_APP_INFO(app_name)?.api_version || "";
        const params = {
          cinemaCode: oneCinema.cinemaCode,
          cinemaId: oneCinema.cinemaId,
          pageNo: 1,
          pageSize: 1000,
          platForm: 5
        };
        if (api_version === "C") {
          params.cinemaCode = oneCinema.unifiedCode;
        }
        const res = await cinemaApi.getMoviePlayInfo(params);
        if (api_version === "3.0C") {
          list = res?.data?.items || [];
          list = list.map(item => ({
            ...item,
            film_id: item.id,
            film_name: item.filmName
          }));
        } else if (api_version === "C") {
          list = res?.data?.hitFilmResultDOList || [];
          list = list.map(item => ({
            ...item,
            film_id: item.id,
            film_name: item.name
          }));
        }
      } else if (app_name === "lma") {
        const res = await cinemaApi.getMoviePlayInfo({
          cinema_id: oneCinema.cinema_id
        });
        list = res.data.film || [];
        list = list.map(item => ({
          ...item,
          film_id: item.film_code,
          film_name: item.title
        }));
      } else {
        // sfc系列
        const params = {
          city_id: oneCity.city_id,
          cinema_id: oneCinema.cinema_id,
          width: "240",
          movie_page_num: "1"
        };
        const res = await cinemaApi.getMovieList(params);
        list = res.data?.movie_data || [];
        list = list.map(item => ({
          ...item,
          film_id: item.id,
          film_name: item.movie_name
        }));
      }
      console.log("获取线上电影列表返回", list);
      return list;
    } catch (error) {
      console.warn("获取线上电影列表异常", error);
    }
  };

  return { getCityList, getAllCinemaList, getFilmList };
}
