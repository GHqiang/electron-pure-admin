/**
 * SFC影院管理模块
 *
 * 职责：
 * - 获取城市列表
 * - 获取城市影院列表
 * - 获取电影放映信息、放映日期、场次信息
 * - 匹配目标影院、电影、场次
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module sfc/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  isNextDay,
  getPreviousDay
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class SfcCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取城市列表
   * @returns {Promise<Array>} 城市列表
   */
  async getCityList() {
    try {
      let params = {};
      console.log("获取城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log("获取城市列表返回", res);
      return res.data?.all_city || [];
    } catch (error) {
      this.logger.errorSave("获取城市列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取城市影院列表
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @returns {Promise<Object>} { cinemaList, error? }
   */
  async getCityCinemaList({ city_id }) {
    try {
      let params = {
        city_id
      };
      console.log("获取城市影院参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院返回", res);
      let cinemaList = res.data?.cinema_data || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.id
      }));
      return {
        cinemaList
      };
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", {
        error: formatErrInfo(error)
      });
      return {
        error: formatErrInfo(error),
        cinemaList: []
      };
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
      // 1. 获取城市列表
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        this.logger.errorSave("获取城市列表为空");
        return { error: "获取城市列表为空" };
      }

      // 2. 根据城市名称获取城市ID
      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        this.logger.errorSave("获取城市ID失败", { city_name, cityList });
        return { error: "获取城市ID失败" };
      }

      // 3. 获取城市影院列表
      const cinemaListRes = await this.getCityCinemaList({ city_id });
      const cinemaList = cinemaListRes?.cinemaList || [];
      if (!cinemaList.length) {
        this.logger.errorSave("获取城市影院列表异常", {
          error: cinemaListRes?.error
        });
        return { error: cinemaListRes?.error || "获取城市影院列表为空" };
      }

      // 4. 根据影院编码匹配目标影院
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.id;
      if (!cinema_id) {
        this.logger.errorSave("获取目标影院失败", {
          error: cinemaIdRes?.error,
          cinemaList,
          cinema_code
        });
        return { error: cinemaIdRes?.error || "获取目标影院失败" };
      }

      return {
        cinema_id,
        city_id
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", { error });
      return { error: formatErrInfo(error) };
    }
  }

  /**
   * 获取电影放映信息
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @returns {Promise<Object|null>} 电影放映信息或null
   */
  async getMoviePlayInfo(data) {
    try {
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        width: "500"
      };
      console.log("获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取电影放映信息返回", res);
      return {
        movieData: res.data?.movie_data || []
      };
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", {
        error: formatErrInfo(error)
      });
      return {
        error: formatErrInfo(error)
      };
    }
  }

  /**
   * 获取电影信息（报价时使用）
   * @param {Object} item - 订单信息
   * @param {string} item.city_name - 城市名称
   * @param {string} item.cinema_name - 影院名称
   * @param {string|number} item.cinema_code - 影院编码
   * @param {string} item.film_name - 电影名称
   * @param {string} item.hall_name - 影厅名称
   * @param {string} item.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss
   * @param {string} item.cinema_group - 影院集团
   * @param {string} item.app_name - 影院标识
   * @returns {Promise<Object|null>} 电影信息（包含场次信息）或null
   */
  async getMovieInfo(item) {
    try {
      // 1、获取城市列表拿到城市ID
      const {
        city_name,
        cinema_name,
        cinema_code,
        film_name,
        hall_name,
        show_time,
        cinema_group,
        app_name
      } = item;
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        return null;
      }
      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        this.logger.errorSave("获取城市ID失败", { city_name, cityList });
        return null;
      }

      // 2、获取城市影院列表
      let params = {
        city_id: city_id
      };
      console.log("获取城市影院参数", params);
      let res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院返回", res);
      let cinemaList = res.data?.cinema_data || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.id
      }));

      // 3、根据影院编码匹配目标影院
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.id;
      if (!cinema_id) {
        this.logger.errorSave("获取目标影院失败", {
          error: cinemaIdRes?.error,
          cinemaList,
          cinema_name,
          app_name,
          city_name
        });
        return null;
      }

      // 4、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({
        city_id,
        cinema_id,
        cinema_group,
        cinema_name,
        city_name,
        app_name
      });
      if (!moviePlayInfo || moviePlayInfo.error) return null;

      // 5、匹配订单拿到会员价
      const { movieData: movie_data } = moviePlayInfo;
      let movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data?.map(item => ({
          ...item,
          filmName: item.movie_name
        }))
      });
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          movie_data: movie_data?.map(item => ({
            movie_name: item.movie_name
          }))
        });
        return null;
      }

      // 6、匹配场次
      let { shows } = movieInfo;
      let showDay = show_time.split(" ")[0];
      let showTime = show_time.split(" ")[1].slice(0, 5);
      // 是否是次日，如果是，showDay需要向前进一
      if (isNextDay(showDay, showTime, "sfc")) {
        showDay = getPreviousDay(showDay);
      }
      let showList = shows[showDay] || [];

      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.start_time === showTime
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hall_name,
            hall_name,
            "hall_name"
          );
          return {
            ...item,
            ...repeatedCharsResult
          };
        });
        targetShowList = targetShowList.sort(
          (a, b) => b.similarity - a.similarity
        );
        targetShow = targetShowList[0];
        this.logger.infoSave("同一时间多场次", { targetShowList });
      }
      if (!targetShow) {
        this.logger.errorSave("匹配影片放映场次失败", {
          movieInfo,
          show_time
        });
        return null;
      }

      // SFC特殊处理：hbchyxd使用normal_price作为member_price
      if (this.appFlag === "hbchyxd") {
        targetShow.member_price = targetShow.normal_price;
      }

      this.logger.infoSave("获取电影放映信息从而获取会员价", {
        targetShow,
        city_id,
        cinema_id
      });
      return { ...targetShow, city_id, cinema_id };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
}
