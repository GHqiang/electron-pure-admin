/**
 * UME影院管理模块
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
 * @module ume/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  getPreviousDay
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class UmeCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取城市影院列表
   * @returns {Promise<Object>} { cityCinemaList, error? }
   */
  async getCityCinemaList() {
    try {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode: "32012801",
          cinemaLinkId: "15946"
        }
      };
      console.log("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院列表返回", res);
      let cityCinemaList = res.data || [];
      cityCinemaList = cityCinemaList.map(item => ({
        ...item,
        cinemaCode: item.cinemaCode
      }));
      return {
        cityCinemaList
      };
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", {
        error: formatErrInfo(error)
      });
      return {
        error: formatErrInfo(error)
      };
    }
  }

  /**
   * 获取购票前的影院信息（出票流程中使用）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinema_code - 影院编码
   * @param {string} params.city_name - 城市名称
   * @returns {Promise<Object>} { cinemaCode, cinemaLinkId } 或 { error }
   */
  async getBuyPrevCinemaInfo({ cinema_code, city_name }) {
    try {
      // 1. 获取城市影院列表
      const cityCinemaListRes = await this.getCityCinemaList();
      const cityCinemaList = cityCinemaListRes?.cityCinemaList || [];
      if (!cityCinemaList.length) {
        this.logger.errorSave("获取城市影院列表失败", {
          error: cityCinemaListRes?.error
        });
        return { error: "获取城市影院列表失败" };
      }
      let cinemaList =
        cityCinemaList?.map(item => item.cinemaList)?.flat() || [];
      if (!cinemaList?.length) {
        this.logger.errorSave("获取全部影院列表失败", {
          cityCinemaList
        });
        return { error: "获取全部影院列表失败" };
      }

      // 2. 根据影院编码匹配目标影院
      let targetCinema = cinemaList.find(
        item => cinema_code && item.cinemaCode === cinema_code
      );
      if (!targetCinema) {
        targetCinema = getTargetCinemaCommon({
          app_name: this.appFlag,
          plat_cinema_code: cinema_code,
          cinema_list: cinemaList
        });
      }
      if (!targetCinema) {
        this.logger.errorSave("获取目标影院失败", {
          cinemaList,
          cinema_code,
          city_name,
          app_name: this.appFlag
        });
        return { error: "获取目标影院失败" };
      }

      return {
        cinemaCode: targetCinema.cinemaCode,
        cinemaLinkId: targetCinema.cinemaLinkId
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", { error });
      return { error: formatErrInfo(error) };
    }
  }

  /**
   * 获取电影放映信息
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @returns {Promise<Object>} { movieData, error? }
   */
  async getMoviePlayInfo(data) {
    try {
      let { cinemaCode, cinemaLinkId } = data || {};
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        }
      };
      console.log("获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取影院放映列表返回", res);
      // 只获取出售中的列表，即将上映暂不返回
      let movieData =
        res.data
          ?.map(item => item.fimlList)
          .flat()
          .filter(item =>
            ["SHOWING", "SOON_SHOW_TICKET"].includes(item.showStatus)
          ) || [];
      return {
        movieData
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
   * 获取电影放映日期
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.filmUniqueId - 电影唯一ID
   * @returns {Promise<Array>} 电影放映日期列表
   */
  async getMoviePlayDate(data) {
    try {
      let { cinemaCode, cinemaLinkId, filmUniqueId } = data || {};
      let params = {
        params: {
          cinemaCode: cinemaCode,
          filmUniqueId: filmUniqueId,
          keepLoading: true,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaLinkId: cinemaLinkId
        }
      };
      console.log("获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log("获取电影放映日期返回", res);
      return res.data || [];
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", {
        error: formatErrInfo(error),
        params: data
      });
      return [];
    }
  }

  /**
   * 获取电影放映场次
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.filmUniqueId - 电影唯一ID
   * @param {string} data.showDate - 放映日期，格式：YYYY-MM-DD
   * @returns {Promise<Object>} { moviePlayTime, error? }
   */
  async getMoviePlayTime(data) {
    let { cinemaCode, cinemaLinkId, filmUniqueId, showDate } = data || {};
    let params = {
      params: {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        showDate: showDate,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
      }
    };
    try {
      console.log("获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      console.log("获取电影放映场次返回", res);
      return {
        moviePlayTime: res.data || []
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
}
