/**
 * H5UME影院管理模块
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
 * @module h5ume/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class H5UmeCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取城市影院列表
   * @returns {Promise<Array>} 城市影院列表
   */
  async getCityCinemaList() {
    let params = {
      empCode: "",
      leaseCode: ""
    };
    try {
      this.logger.info("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      this.logger.info("获取城市影院列表返回", res);

      let list = res.bizValue?.cities || [];
      // 通过排查以往ume系列订单，发现cinemaCode和cinemaLinkId值并不一样，故此处先不赋同值
      list = list.map(item => ({
        cityName: item.cityName,
        cinemaList: item.cinemas.map(itemA => ({
          ...itemA,
          cinemaId: itemA.cinemaLinkId
        }))
      }));
      console.log("list", list);
      return list;
    } catch (error) {
      this.logger.errorSave("获取城市影院异常", {
        error: formatErrInfo(error),
        params
      });
      return null;
    }
  }

  /**
   * 获取电影放映列表
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @returns {Promise<Array>} 电影放映列表
   */
  async getMoviePlayInfo({ cinemaLinkId }) {
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      posterSize: "SMALL"
    };
    try {
      this.logger.info("获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      let fimlList = res?.bizValue || [];
      console.log("获取影院放映列表返回", res);
      return fimlList;
    } catch (error) {
      console.log("获取影院放映列表返回异常", error);
      this.logger.errorSave("获取电影放映列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取电影放映日期列表
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.filmId - 电影ID
   * @returns {Promise<Array>} 电影放映日期列表
   */
  async getMoviePlayDate({ cinemaLinkId, filmId }) {
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        cinemaLinkId
      };
      this.logger.info("获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      this.logger.info("获取电影放映日期返回", res);
      let films = res?.bizValue?.films || [];
      let filmDates = films.find(item => item.filmId === filmId)?.dates || [];
      return filmDates;
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", { error });
      return [];
    }
  }
}
