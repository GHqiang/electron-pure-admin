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
import svApi from "@/api/sv-api";
import { getCachedThirdPartyIdsWithCache } from "@/common/core/thirdPartyIdsCache";

export default class LmaCinemaManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  // 获取购票前的影院信息（出票流程中使用，复用 getMovieInfo 的完整缓存逻辑）
  async getBuyPrevCinemaInfo() {
    try {
      const movieInfo = await this.getMovieInfo(this.order);
      if (!movieInfo) {
        return { error: "获取影院/影片/场次信息失败" };
      }
      const show_time = this.order.show_time;
      let start_day = show_time.split(" ")[0];
      let start_time = show_time.split(" ")[1].slice(0, 5);
      if (isNextDay(start_day, start_time, "lma")) {
        start_day = getPreviousDay(start_day);
      }
      return {
        cinema_id: movieInfo.cinema_id,
        city_id: movieInfo.city_id,
        short_code: movieInfo.short_code,
        show_id: movieInfo.session_id,
        start_day,
        start_time,
        targetShow: movieInfo,
        movieInfo
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", {
        error: formatErrInfo(error)
      });
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
      this.cacheHit = 0;
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

      // ======== 第三方 ID 缓存复用（完整版+）：命中且 feature/language_type 齐全时，跳过 getCinemaList + getMoviePlayInfo ========
      let cinema_id;
      let city_id;
      let movieInfo = null;
      let short_code = null;
      let cacheHit = 0;
      let skipPlayInfo = false; // 缓存命中且影片属性齐全，可跳过 getMoviePlayInfo
      const cachedIds = await this.tryGetCachedThirdPartyIds();
      if (cachedIds?.cinema_id && cachedIds?.short_code) {
        cinema_id = cachedIds.cinema_id;
        short_code = cachedIds.short_code;
        city_id = cachedIds.city_id;
        cacheHit = this.cacheSource;
        // 影片属性齐全则连 getMoviePlayInfo 也跳过（feature/language_type 是影片级属性，同影院同影片一致）
        if (cachedIds.feature != null && cachedIds.language_type != null) {
          skipPlayInfo = true;
          movieInfo = {
            feature: cachedIds.feature,
            language_type: cachedIds.language_type,
            short_code
          };
        }
        this.logger.infoSave("命中第三方ID缓存，跳过城市影院列表+影片名匹配", {
          cachedIds,
          skipPlayInfo
        });
      } else {
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
        cinema_id = cinemaIdRes?.cinema_id;
        city_id = cinemaIdRes?.city_id;
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
      }
      // ======== 缓存未命中，走原逻辑结束 ========

      // 2、获取影院放映信息（缓存命中且影片属性齐全时跳过；否则需调 getMoviePlayInfo 拿影片列表）
      let film = null;
      if (!skipPlayInfo) {
        const moviePlayInfo = await this.getMoviePlayInfo({ cinema_id });
        if (!moviePlayInfo) return null;
        film = moviePlayInfo.film;
      }

      // 3、获取目标影片信息（已通过缓存构造 movieInfo 时跳过）
      if (!skipPlayInfo) {
        if (cacheHit) {
          // 缓存命中但影片属性缺失：按 short_code 从影片列表查找，跳过影片名匹配
          movieInfo = film?.find(it => it.short_code === short_code);
          if (!movieInfo) {
            // 缓存的 short_code 在影片列表里找不到（可能已下映），回退到影片名匹配
            this.logger.warnSave(
              "缓存 short_code 在影片列表中未找到，回退到影片名匹配",
              { cachedIds, short_code }
            );
            movieInfo = getMovieInfoFromFilmName({
              filmName: film_name,
              movieData: film?.map(it => ({
                ...it,
                filmName: it.title
              }))
            });
            if (movieInfo) {
              short_code = movieInfo.short_code;
            }
          }
        } else {
          movieInfo = getMovieInfoFromFilmName({
            filmName: film_name,
            movieData: film?.map(it => ({
              ...it,
              filmName: it.title
            }))
          });
          if (movieInfo) {
            short_code = movieInfo.short_code;
          }
        }
      }
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          film
        });
        return null;
      }
      console.log("movieInfo", movieInfo, film_name);

      // 4、获取目标影片的放映日期
      let playDateList = await this.getMoviePlayDate({
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

      // 降级：缓存命中且跳过了 getMoviePlayInfo，但场次实时匹配失败（影片可能已下映），回退到 getMoviePlayInfo + 影片名匹配
      if (!targetDate && skipPlayInfo) {
        this.logger.warnSave(
          "缓存命中跳过 getMoviePlayInfo 后场次匹配失败，回退 getMoviePlayInfo 重新匹配",
          { cachedIds, short_code, start_day }
        );
        const moviePlayInfo = await this.getMoviePlayInfo({ cinema_id });
        if (moviePlayInfo) {
          film = moviePlayInfo.film;
          movieInfo =
            film?.find(it => it.short_code === short_code) ||
            getMovieInfoFromFilmName({
              filmName: film_name,
              movieData: film?.map(it => ({
                ...it,
                filmName: it.title
              }))
            });
          if (movieInfo) {
            short_code = movieInfo.short_code;
            // 重新查放映日期
            playDateList = await this.getMoviePlayDate({
              cinema_id,
              short_code
            });
            targetDate = playDateList?.find(
              item => formatTimeStrByLma(item.date) === start_day
            );
          }
        }
      }

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
      const result = { ...movieInfo, ...targetShow, cinema_id, city_id, short_code };
      this.cinemaInfo = result; // 供 offerManage.buildSuccessResponse 透传，写入 third_party_ids（跨订单复用）
      this.cacheHit = cacheHit;
      return result;
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
