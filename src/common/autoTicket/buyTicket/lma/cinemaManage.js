/**
 * LMA影院管理模块
 *
 * 职责：
 * - 获取城市影院列表
 * - 获取电影放映信息、放映日期、场次信息
 * - 匹配目标影院、电影、场次
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module lma/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  formatTimeStrByLma,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  isNextDay,
  getPreviousDay
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO } from "@/common/constant";

export default class LmaCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  // 获取购票前的影院信息（出票流程中使用）
  async getBuyPrevCinemaInfo({ cinema_code, appFlag }) {
    try {
      // 1. 获取城市影院列表
      const cinemaListRes = await this.getCityCinemaList({ appFlag });
      const cinemaList = cinemaListRes?.cinemaList || [];
      if (!cinemaList.length) {
        this.logger.errorSave("获取城市影院列表异常", {
          error: cinemaListRes?.error
        });
        return { error: "获取城市影院列表异常" };
      }

      // 2. 根据影院编码获取目标影院id
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.cinema_id;
      if (!cinema_id) {
        this.logger.errorSave("获取目标影院失败", {
          error: cinemaIdRes?.error,
          cinemaList,
          appFlag
        });
        return { error: "获取目标影院失败" };
      }

      return {
        cinema_id,
        city_id: cinemaIdRes?.city_id
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", { error });
      return { error: formatErrInfo(error) };
    }
  }

  // 获取城市影院列表
  async getCityCinemaList({ appFlag }) {
    try {
      const res = await this.appApi.getCinemaList();
      console.log("获取城市影院返回", res);
      let cinemaList = res.data?.list || [];
      cinemaList = cinemaList.map(item => {
        return {
          ...item,
          name: item.cinema_name,
          cinemaId: item.cinema_id
        };
      });
      return {
        cinemaList
      };
    } catch (error) {
      console.error("获取城市影院异常", error);
      return {
        error
      };
    }
  }

  // 获取电影信息（报价时使用）
  async getMovieInfo(item) {
    try {
      // 1、获取影院列表拿到影院id
      const {
        city_name,
        cinema_name,
        cinema_code,
        film_name,
        hall_name,
        show_time,
        app_name
      } = item;
      let res = await this.appApi.getCinemaList();
      console.log("获取全部影院返回", res);
      let cinemaList = res.data?.list || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.cinema_id
      }));
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: app_name,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.cinema_id;
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

      // 2、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({
        cinema_id
      });
      if (!moviePlayInfo) return null;

      // 3、匹配订单拿到会员价
      const { film } = moviePlayInfo;

      // 4、获取目标影片信息
      let movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: film?.map(item => ({
          ...item,
          filmName: item.title
        }))
      });
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          film
        });
        return null;
      }
      console.log("movieInfo", movieInfo, film_name);

      // 5、获取目标影片的放映日期
      const { short_code } = movieInfo;
      const playDateList = await this.getMoviePlayDate({
        cinema_id,
        short_code
      });
      let start_day = show_time.split(" ")[0];
      let start_time = show_time.split(" ")[1].slice(0, 5);

      // 是否是次日，如果是，showDay需要向前进一
      if (isNextDay(start_day, start_time, "lma")) {
        start_day = getPreviousDay(start_day);
      }

      let targetDate = playDateList?.find(
        item => formatTimeStrByLma(item.date) === start_day
      );
      if (!targetDate) {
        this.logger.errorSave("匹配影片放映日期失败", {
          playDateList,
          start_day
        });
        return null;
      }

      let showList = targetDate?.session || [];

      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.start_time === start_time
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.screen_name,
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
        this.logger.infoSave("同一时间多场次", {
          targetShowList
        });
      }

      if (!targetShow) {
        this.logger.errorSave("匹配影片放映场次失败", {
          showList,
          start_time
        });
        return null;
      }

      this.logger.infoSave("获取电影放映信息从而获取会员价", {
        targetShow
      });
      return { ...movieInfo, ...targetShow, cinema_id, short_code };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
    try {
      let { cinema_id } = data || {};
      let params = {
        cinema_id: cinema_id
      };
      console.log("获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取电影放映信息返回", res);
      return res.data;
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 获取电影放映日期
  async getMoviePlayDate(data) {
    let { cinema_id, short_code } = data || {};
    let params = {
      cinema_id,
      short_code
    };
    try {
      console.log("获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      this.logger.infoSave("获取电影放映日期返回", {
        params,
        res
      });
      return res.data || [];
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", {
        error: formatErrInfo(error),
        params
      });
      return [];
    }
  }
}
