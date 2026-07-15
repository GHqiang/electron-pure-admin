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
import svApi from "@/api/sv-api";
import { getCachedThirdPartyIdsWithCache } from "@/common/core/thirdPartyIdsCache";

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
   * @returns {Promise<Object>} { cinemaCode, cinemaLinkId, filmUniqueId, targetShow, ... } 或 { error }
   */
  async getBuyPrevCinemaInfo() {
    const { appFlag, order } = this;
    const { film_name, hall_name, show_time, cinema_code } = order;
    try {
      this.cacheHit = 0;
      // ======== 第三方 ID 缓存复用（完整版）：命中则跳过城市影院列表 + 影片列表 + 影片名匹配 ========
      let cinemaCode, cinemaLinkId, filmUniqueId;
      let cacheHit = 0;
      const cachedIds = await this.tryGetCachedThirdPartyIds();
      if (
        cachedIds?.cinemaCode &&
        cachedIds?.cinemaLinkId &&
        cachedIds?.filmUniqueId
      ) {
        cinemaCode = cachedIds.cinemaCode;
        cinemaLinkId = cachedIds.cinemaLinkId;
        filmUniqueId = cachedIds.filmUniqueId;
        cacheHit = this.cacheSource;
        this.logger.infoSave(
          "命中第三方ID缓存，跳过城市影院列表+影片列表+影片名匹配",
          { cachedIds }
        );
        // 场次时效性强，命中缓存后仍实时查询；失败则回退完整查询链
        const showResult = await this.getTargetShowInfo({
          cinemaCode,
          cinemaLinkId,
          filmUniqueId
        });
        if (showResult) {
          const { targetShow, matchedShowDate } = showResult;
          this.logger.infoSave("出票时获取电影放映信息", {
            targetShow,
            cinemaCode,
            cinemaLinkId
          });
          this.cinemaInfo = {
            ...targetShow,
            cinemaCode,
            cinemaLinkId,
            filmUniqueId
          };
          this.cacheHit = cacheHit;
          return {
            cinemaCode,
            cinemaLinkId,
            filmUniqueId,
            targetShow,
            showDate: matchedShowDate,
            showDateTime: targetShow.showDateTime,
            scheduleId: targetShow.scheduleId,
            scheduleKey: targetShow.scheduleKey
          };
        }
        // 场次匹配失败，回退完整查询链（cinemaCode/cinemaLinkId 影院级不会失效，仅重查影片列表+场次）
        this.logger.warnSave("缓存命中但场次实时匹配失败，回退完整查询链", {
          cachedIds
        });
        cacheHit = 0;
      } else {
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
          this.logger.errorSave("获取全部影院列表失败", { cityCinemaList });
          return { error: "获取全部影院列表失败" };
        }

        // 2. 根据影院编码匹配目标影院
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
          this.logger.errorSave("获取目标影院失败", {
            cinemaList,
            cinema_code,
            app_name: appFlag
          });
          return { error: "获取目标影院失败" };
        }
        cinemaCode = targetCinema.cinemaCode;
        cinemaLinkId = targetCinema.cinemaLinkId;
      }
      // ======== 缓存未命中，走原逻辑结束 ========

      if (!cacheHit) {
        // 3、获取影院放映信息
        const movieDataRes = await this.getMoviePlayInfo({
          cinemaCode,
          cinemaLinkId
        });
        const movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取影院放映信息失败", {
            error: movieDataRes?.error
          });
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
          this.logger.errorSave("获取目标影片信息失败", {
            film_name,
            movie_data
          });
          return { error: "获取目标影片信息失败" };
        }
        filmUniqueId = movieInfo.filmUniqueId;
      }

      // 5、获取场次列表
      const showResult = await this.getTargetShowInfo({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId
      });
      if (!showResult) {
        return { error: "匹配影片放映场次失败" };
      }
      const { targetShow, matchedShowDate } = showResult;

      this.logger.infoSave("出票时获取电影放映信息", {
        targetShow,
        cinemaCode,
        cinemaLinkId
      });
      this.cinemaInfo = {
        ...targetShow,
        cinemaCode,
        cinemaLinkId,
        filmUniqueId
      };
      this.cacheHit = cacheHit;
      return {
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        targetShow,
        showDate: matchedShowDate,
        showDateTime: targetShow.showDateTime,
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
   * 获取并匹配目标场次（支持次日重试）
   * 场次时效性强，命中缓存后仍实时查询，失败返回 null 触发回退
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.filmUniqueId - 电影唯一ID
   * @returns {Promise<{targetShow: Object, matchedShowDate: string}|null>} 匹配成功返回 { targetShow, matchedShowDate }，失败返回 null
   */
  async getTargetShowInfo({ cinemaCode, cinemaLinkId, filmUniqueId }) {
    const { hall_name, show_time } = this.order;
    let start_day = show_time.split(" ")[0];
    // showDate 始终返回当天日期（与原散调逻辑保持一致，避免次日匹配成功时 showDate 变化影响后续锁座/卡券API）
    let matchedShowDate = start_day;
    const showListRes = await this.getMoviePlayTime({
      cinemaCode,
      cinemaLinkId,
      filmUniqueId,
      showDate: start_day
    });
    const showList = showListRes?.moviePlayTime || [];
    let targetShowList = showList?.filter(
      item => +new Date(item.showDateTime) == +new Date(show_time)
    );
    let targetShow = targetShowList?.[0];
    if (targetShowList?.length > 1) {
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
      this.logger.infoSave("同一时间多场次0", { targetShowList });
    }
    if (!targetShow) {
      // 次日场次处理
      this.logger.infoSave("准备根据放映日期上一天来获取放映场次列表(次日)", {
        showListRes,
        show_time
      });
      // 查询次日场次列表用前一天日期，但返回的 matchedShowDate 仍保持当天日期（与原散调逻辑一致）
      const prevDay = getPreviousDay(start_day);
      const showListRes1 = await this.getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate: prevDay
      });
      const showList1 = showListRes1?.moviePlayTime || [];
      let targetShowList1 = showList1?.filter(
        item => +new Date(item.showDateTime) == +new Date(show_time)
      );
      targetShow = targetShowList1?.[0];
      if (targetShowList1?.length > 1) {
        targetShowList1 = targetShowList1.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hallName,
            hall_name,
            "hall_name"
          );
          return { ...item, ...repeatedCharsResult };
        });
        targetShowList1 = targetShowList1.sort(
          (a, b) => b.similarity - a.similarity
        );
        targetShow = targetShowList1[0];
        this.logger.infoSave("同一时间多场次1", {
          targetShowList: targetShowList1
        });
      }
      if (!targetShow) {
        this.logger.errorSave("匹配影片放映场次失败", {
          showListRes1,
          show_time
        });
        return null;
      }
    }
    return { targetShow, matchedShowDate };
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
}
