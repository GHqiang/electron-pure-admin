/**
 * 万达影院管理模块
 *
 * 职责：
 * - 获取城市列表
 * - 获取城市影院列表
 * - 获取电影放映信息、放映日期、场次信息
 * - 匹配目标影院、电影、场次
 *
 * 所属流程：报价流程、出票流程
 *
 * @module wanda/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class WandaCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取城市列表（Wanda API: data.city）
   * @returns {Promise<Array>} 城市列表
   */
  async getCityList() {
    try {
      let params = {};
      console.log("获取万达城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log("获取万达城市列表返回", res);
      return res.data?.city || [];
    } catch (error) {
      this.logger.errorSave("获取万达城市列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取城市影院列表
   * Wanda API: by_locationid_v6_4.api，入参 locationId
   * 响应: { code: 0, data: { bizCode: 0, cinemaInfoList: [{ storeId, cinemaName, ... }] } }
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @returns {Promise<Object>} { cinemaList, error? }
   */
  async getCityCinemaList({ city_id }) {
    try {
      let params = { locationId: city_id };
      console.log("获取万达城市影院参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取万达城市影院返回", res);
      // 拦截器已解包 response.data，业务数据在 res.data 下
      let cinemaList = res.data?.cinemaInfoList || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.storeId,
        cinema_name: itemA.cinemaName
      }));
      return { cinemaList };
    } catch (error) {
      this.logger.errorSave("获取万达城市影院列表异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error), cinemaList: [] };
    }
  }

  /**
   * 获取购票前的影院信息（出票流程中使用）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinema_code - 影院编码
   * @param {string} params.city_name - 城市名称
   * @returns {Promise<Object>} { cinema_id, city_id } 或 { error }
   */
  async getBuyPrevCinemaInfo({ cinema_code, city_name }) {
    try {
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        this.logger.errorSave("获取万达城市列表为空");
        return { error: "获取城市列表为空" };
      }

      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        this.logger.errorSave("获取万达城市ID失败", { city_name, cityList });
        return { error: "获取城市ID失败" };
      }

      const cinemaListRes = await this.getCityCinemaList({ city_id });
      const cinemaList = cinemaListRes?.cinemaList || [];
      if (!cinemaList.length) {
        this.logger.errorSave("获取万达城市影院列表异常", {
          error: cinemaListRes?.error
        });
        return { error: cinemaListRes?.error || "获取城市影院列表为空" };
      }

      // 通过编码映射匹配目标影院
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      // getTargetCinemaCommon 返回匹配到的列表项，cinemaId 来自 storeId
      let cinema_id = cinemaIdRes?.cinemaId;
      if (!cinema_id) {
        this.logger.errorSave("获取万达目标影院失败", {
          cinema_code,
          cinemaList: cinemaList.slice(0, 3)
        });
        return { error: "获取目标影院失败" };
      }

      return { cinema_id, city_id };
    } catch (error) {
      this.logger.errorSave("获取万达购票前影院信息异常", { error });
      return { error: formatErrInfo(error) };
    }
  }

  /**
   * 获取电影放映信息（万达版本：按城市获取影片列表）
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @returns {Promise<Object|null>} 电影放映信息或null
   */
  async getMoviePlayInfo(data) {
    try {
      let { city_id } = data || {};
      let params = { cityId: city_id };
      console.log("获取万达电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取万达电影放映信息返回", res);
      return {
        movieData: res.data?.movie_data || []
      };
    } catch (error) {
      this.logger.errorSave("获取万达电影放映信息异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error) };
    }
  }

  /**
   * 获取影院详情（出票流程使用）
   */
  async getCinemaDetail({ storeId, session_id }) {
    try {
      const res = await this.appApi.getCinemaDetail(
        { cinemaid: storeId, json: true },
        { data: { wanda_token: session_id } }
      );
      return res?.data?.cinemaDetial || null;
    } catch (error) {
      this.logger.errorSave("获取万达影院详情异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取电影放映排期（按影院+影片+日期）
   */
  async getShowTimeList({ cinemaId, filmId, date, session_id }) {
    try {
      const res = await this.appApi.getShowtimeByCinemaFilmDate({
        cinemaId,
        filmId,
        date,
        json: true
      });
      return res?.data?.showtimeFilmDateInfo || null;
    } catch (error) {
      this.logger.errorSave("获取万达排期异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取电影信息（报价时使用）
   *
   * 流程：城市→影院→排期(by_cinema.api)→按影厅名+时间匹配场次
   * by_cinema.api 响应 { data: { showtimeFilmInf: [{ filmId, showtimeFilmDateInf: [{ date, showtimesInf: { showtimeList } }] }] } }
   *
   * @param {Object} item - 订单信息
   * @returns {Promise<Object|null>} { ...targetShow, city_id, cinema_id } 或 null
   */
  async getMovieInfo(item) {
    try {
      const {
        city_name,
        cinema_code,
        film_name,
        hall_name,
        show_time,
        app_name
      } = item;

      // 1、获取城市列表拿到城市ID
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        this.logger.errorSave("获取万达城市列表为空");
        return null;
      }
      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        this.logger.errorSave("获取万达城市ID失败", { city_name, cityList });
        return null;
      }

      // 2、获取城市影院列表，匹配目标影院
      let params = { locationId: city_id };
      let res = await this.appApi.getCinemaList(params);
      let cinemaList = res.data?.cinemaInfoList || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.storeId,
        cinema_name: itemA.cinemaName
      }));

      let cinemaIdRes = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.cinemaId;
      if (!cinema_id) {
        this.logger.errorSave("获取万达目标影院失败", {
          cinema_code,
          cinema_name,
          app_name,
          city_name
        });
        return null;
      }

      // 3、获取电影列表匹配影片名 → 得到 filmId (=movieId)
      const movieListRes = await this.getMoviePlayInfo({ city_id });
      const movieList = movieListRes?.movieData || [];
      const matchedMovie = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movieList.map(m => ({
          ...m,
          filmName: m.film_name || m.nameCN
        }))
      });
      if (!matchedMovie) {
        this.logger.errorSave("获取万达目标影片信息失败", { film_name });
        return null;
      }
      const targetFilmId = matchedMovie.film_id || matchedMovie.movieId;
      this.logger.infoSave("匹配到万达电影", { film_name, targetFilmId });

      // 4、通过 by_cinema.api 获取该影院所有排期，按 filmId 过滤
      const showtimeRes = await this.appApi.getShowtimeByCinema({
        cinemaId: cinema_id,
        json: true
      });
      const showtimeFilmInf = showtimeRes?.data?.showtimeFilmInf || [];
      const targetFilm = showtimeFilmInf.find(f => f.filmId === targetFilmId);
      if (!targetFilm) {
        this.logger.errorSave("该影院没有此影片的排期", {
          cinema_id,
          film_name,
          targetFilmId
        });
        return null;
      }

      // 5、在该影片的排期中，按日期+realtime+影厅匹配场次
      const showDay = show_time.split(" ")[0];
      const showTime = show_time.split(" ")[1].slice(0, 5);
      const targetDate = Number(showDay.replace(/-/g, ""));
      // 订单放映时间转时间戳（毫秒），与API的realtime精确比对
      const orderTs = new Date(showDay + " " + showTime + ":00").getTime();
      const dateInfos = targetFilm.showtimeFilmDateInf || [];

      let targetShow = null;
      for (const di of dateInfos) {
        if (di.date !== targetDate) continue;
        const showtimeList = di.showtimesInf?.showtimeList || [];
        for (const show of showtimeList) {
          const hall = show.hallName || show.hall_name || "";
          if (show.realtime === orderTs && hall_name.indexOf(hall) !== -1) {
            targetShow = show;
            break;
          }
        }
        if (targetShow) break;
      }

      if (!targetShow) {
        this.logger.errorSave("匹配万达影片放映场次失败", {
          cinema_id,
          showDay,
          showTime,
          hall_name
        });
        return null;
      }
      const media = targetShow.filmList?.[0]?.version;
      const show_id = targetShow.hallId;
      const member_price = targetShow.salesPrice; // 会员价 可能会不准确，需要从座位里获取最高价格
      const nonmember_price = null;
      const movieInfo = {
        ...targetShow,
        city_id,
        cinema_id,
        film_id: targetFilmId,
        media,
        show_id,
        member_price,
        nonmember_price
      };
      this.logger.infoSave("获取万达电影排期信息", movieInfo);
      return movieInfo;
    } catch (error) {
      this.logger.errorSave("获取万达当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
}
