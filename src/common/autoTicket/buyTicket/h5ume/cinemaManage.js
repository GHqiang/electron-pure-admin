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
import svApi from "@/api/sv-api";
import { getCachedThirdPartyIdsWithCache } from "@/common/core/thirdPartyIdsCache";

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

  // ==================== 第三方 ID 缓存复用 ====================

  /**
   * 查询第三方 ID 缓存（跨订单复用）
   * 按 app_name + cinema_code + film_name + show_time 查询 N 天内的报价记录（N 由字典表配置，默认 7 天）
   * @returns {Promise<Object|null>} 缓存的第三方 ID 集合，未命中或异常返回 null
   */
  async tryGetCachedThirdPartyIds() {
    try {
      const { app_name, cinema_code, film_name, show_time } = this.order;
      // 本地进程内 LRU 缓存（6 小时 TTL、容量 2000，参数由字典表配置）
      // 命中本地缓存直接返回，省掉对后端的 HTTP 调用；未命中再查后端，命中结果写本地缓存
      const { ids, source } = await getCachedThirdPartyIdsWithCache(
        { app_name, cinema_code, film_name, show_time },
        () =>
          svApi.getCachedThirdPartyIds({
            app_name,
            cinema_code,
            film_name,
            show_time
          })
      );
      this.cacheSource = source; // 1=本地命中, 2=远端命中, 0=未命中
      return ids;
    } catch (error) {
      this.logger.errorSave("查询第三方ID缓存异常", {
        error: formatErrInfo(error)
      });
      this.cacheSource = 0;
      return null;
    }
  }

  /**
   * 获取购票前的影院信息（出票流程中使用，含缓存复用）
   * 命中缓存：跳过城市影院列表 + 影片列表 + 影片名匹配，仅查放映日期 + 场次匹配
   * @returns {Promise<Object>} { cinemaLinkId, filmId, targetShow, hallId, scheduleId, scheduleKey } 或 { error }
   */
  async getBuyPrevCinemaInfo() {
    const { appFlag, order } = this;
    const { film_name, hall_name, show_time, cinema_code } = order;
    try {
      this.cacheHit = 0;
      // ======== 第三方 ID 缓存复用：命中则跳过城市影院列表 + 影片列表 + 影片名匹配 ========
      let cinemaLinkId, filmId;
      let cacheHit = 0;
      const cachedIds = await this.tryGetCachedThirdPartyIds();
      if (cachedIds?.cinemaLinkId && cachedIds?.filmId) {
        cinemaLinkId = cachedIds.cinemaLinkId;
        filmId = cachedIds.filmId;
        cacheHit = this.cacheSource;
        this.logger.infoSave(
          "命中第三方ID缓存，跳过城市影院列表+影片列表+影片名匹配",
          { cachedIds }
        );
        // 场次时效性强，命中缓存后仍实时查询；失败则回退完整查询链
        const showResult = await this.getTargetShowInfo({
          cinemaLinkId,
          filmId
        });
        if (showResult.targetShow) {
          const { targetShow } = showResult;
          this.logger.infoSave("出票时获取电影放映信息", {
            targetShow,
            cinemaLinkId
          });
          this.cinemaInfo = { ...targetShow, cinemaLinkId, filmId };
          this.cacheHit = cacheHit;
          return {
            cinemaLinkId,
            filmId,
            targetShow,
            hallId: targetShow.hallId,
            scheduleId: targetShow.scheduleId,
            scheduleKey: targetShow.scheduleKey
          };
        }
        // 场次匹配失败，回退完整查询链（cinemaLinkId 影院级不会失效，仅重查影片列表+场次）
        this.logger.warnSave("缓存命中但场次实时匹配失败，回退完整查询链", {
          cachedIds
        });
        cacheHit = 0;
      } else {
        // 1、获取城市影院列表
        let allCinemaList = await this.getCityCinemaList();
        if (!allCinemaList?.length) {
          return { error: "获取城市影院列表失败" };
        }
        let cinemaList =
          allCinemaList?.map(item => item.cinemaList)?.flat() || [];
        if (!cinemaList?.length) {
          return { error: "获取全部影院列表失败" };
        }
        // 2、获取目标影院
        let targetCinema = cinemaList.find(
          item => cinema_code && item.cinemaCode === cinema_code
        );
        if (!targetCinema) {
          targetCinema = getTargetCinemaCommon({
            app_name: appFlag,
            plat_cinema_code: cinema_code,
            cinema_list: cinemaList
          });
        }
        if (!targetCinema) {
          return { error: "获取目标影院失败" };
        }
        cinemaLinkId = targetCinema.cinemaLinkId;
      }
      // ======== 缓存未命中，走原逻辑结束 ========

      if (!cacheHit) {
        // 3、获取影院放映信息
        const movie_data = await this.getMoviePlayInfo({ cinemaLinkId });
        if (!movie_data?.length) {
          return { error: "获取影院放映信息失败" };
        }
        // 4、获取目标影片信息
        let movieInfo = getMovieInfoFromFilmName({
          filmName: film_name,
          movieData: movie_data?.map(item => ({
            ...item,
            filmName: item.filmName
          }))
        });
        if (!movieInfo) {
          return { error: "获取目标影片信息失败" };
        }
        filmId = movieInfo.filmId;
      }

      // 5、获取场次
      const showResult = await this.getTargetShowInfo({ cinemaLinkId, filmId });
      if (showResult.error) {
        return { error: showResult.error };
      }
      const { targetShow } = showResult;

      this.logger.infoSave("出票时获取电影放映信息", {
        targetShow,
        cinemaLinkId
      });
      this.cinemaInfo = { ...targetShow, cinemaLinkId, filmId };
      this.cacheHit = cacheHit;
      return {
        cinemaLinkId,
        filmId,
        targetShow,
        hallId: targetShow.hallId,
        scheduleId: targetShow.scheduleId,
        scheduleKey: targetShow.scheduleKey
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error) };
    }
  }

  /**
   * 获取并匹配目标场次
   * 场次时效性强，命中缓存后仍实时查询，失败返回 { error } 触发回退
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.filmId - 电影ID
   * @returns {Promise<{targetShow: Object}|{error: string}>} 匹配成功返回 { targetShow }，失败返回 { error }
   */
  async getTargetShowInfo({ cinemaLinkId, filmId }) {
    const { hall_name, show_time } = this.order;
    // 获取目标影片的放映日期
    const playDateList = await this.getMoviePlayDate({
      cinemaLinkId,
      filmId
    });
    if (!playDateList?.length) {
      return { error: "获取影片放映日期失败" };
    }
    let targetShowInfo = playDateList?.find(item =>
      item.schedules?.some(
        itemA => +new Date(+itemA.showTime) === +new Date(show_time)
      )
    );
    const showList = targetShowInfo?.schedules || [];
    let targetShowList = showList.filter(
      itemA => +new Date(+itemA.showTime) === +new Date(show_time)
    );
    let targetShow = targetShowList[0];
    if (targetShowList.length > 1) {
      targetShowList = targetShowList.map(item => {
        const repeatedCharsResult = findMostRepeatedChars(
          item.hallName,
          hall_name,
          "hall_name"
        );
        return { ...item, ...repeatedCharsResult };
      });
      targetShowList = targetShowList.sort(
        (a, b) => b.similarity - a.similarity
      );
      targetShow = targetShowList[0];
      this.logger.infoSave("同一时间多场次", { targetShowList });
    }
    if (!targetShow) {
      return { error: "匹配影片放映场次失败" };
    }
    return { targetShow };
  }
}
