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

// 影片版本短码记忆（进程内）
// 第三方ID缓存 key 只有 影院+影片名、不含影片版本，命中后可能是别的版本短码（如 IMAX2D 版套到 2D 场次）。
// 兜底解析出正确短码后，按「影院+影片+影厅版本(IMAX/普通)」记住它，后续同版本订单直接命中，
// 不必每单都先查错版本再兜底——省请求、出票更快。
const FILM_VERSION_MEMO_MAX = 500;
const FILM_VERSION_MEMO_TTL_MS = 6 * 60 * 60 * 1000;
const _filmVersionMemo = new Map();

const buildFilmVersionMemoKey = ({
  app_name,
  cinema_code,
  film_name,
  hall_name
}) =>
  `${app_name}|${cinema_code}|${film_name}|${
    /imax/i.test(hall_name || "") ? "imax" : "normal"
  }`;

const getFilmVersionMemo = params => {
  const key = buildFilmVersionMemoKey(params);
  const entry = _filmVersionMemo.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    _filmVersionMemo.delete(key);
    return null;
  }
  return entry.value;
};

const setFilmVersionMemo = (params, value) => {
  if (!value?.short_code) return;
  const key = buildFilmVersionMemoKey(params);
  // 先删后插，保证 Map 顺序即最近使用顺序
  _filmVersionMemo.delete(key);
  _filmVersionMemo.set(key, {
    value,
    expireAt: Date.now() + FILM_VERSION_MEMO_TTL_MS
  });
  while (_filmVersionMemo.size > FILM_VERSION_MEMO_MAX) {
    _filmVersionMemo.delete(_filmVersionMemo.keys().next().value);
  }
};

// 供单测清理记忆，避免用例间互相影响
export function clearFilmVersionMemo() {
  _filmVersionMemo.clear();
}

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

      // 同影片同影厅版本的正确短码请求过一次就记住，直接用，避免每单都先查错版本再兜底
      if (cacheHit > 0) {
        const memo = getFilmVersionMemo({
          app_name,
          cinema_code,
          film_name,
          hall_name
        });
        if (memo?.short_code && memo.short_code !== short_code) {
          short_code = memo.short_code;
          movieInfo = {
            ...(movieInfo || {}),
            ...memo
          };
          this.logger.infoSave("命中影片版本短码记忆", { short_code, memo });
        }
      }

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

      // 缓存命中但场次匹配不到：卢米埃同一影片会按版本拆成不同 short_code
      // （如 生化危机 2D/原版=067101570026、IMAX2D/原版=067701570026），
      // 而第三方ID缓存 key 只有 影院+影片名、不含版本，可能拿到其它版本的短码，
      // 导致 sell_session 查不到目标场次。此处重查影片列表，按同名各版本重新匹配。
      if (!targetShow && (skipPlayInfo || cacheHit > 0)) {
        const versionMatch = await this.matchShowByFilmVersions({
          cinema_id,
          film_name,
          hall_name,
          start_day,
          start_time,
          excludeShortCode: short_code,
          film,
          variants: this.cachedVersions
        });
        if (versionMatch) {
          targetShow = versionMatch.targetShow;
          short_code = versionMatch.short_code;
          movieInfo = {
            ...movieInfo,
            ...versionMatch.movieInfo
          };
          // 记住该影厅版本的正确短码，后续同版本订单直接命中，不再兜底
          setFilmVersionMemo(
            { app_name, cinema_code, film_name, hall_name },
            versionMatch.movieInfo
          );
        }
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

  /**
   * 缓存命中但场次匹配失败时的兜底：按影片版本（short_code）逐条重查场次
   * 背景：第三方ID缓存 key 只有 app_name + cinema_code + film_name，不含影片版本，
   *      多版本影片（如 2D/原版 与 IMAX2D/原版）会互相串用短码，导致场次匹配失败。
   * 策略：先用后端返回的候选版本（省一次影片列表请求），仍不命中再重查影片列表兜底
   *      —— 历史报价记录里可能只有当前错误版本，光靠候选列表会漏掉真正可用的版本。
   * @returns {Promise<Object|null>} { targetShow, short_code, movieInfo } 或 null
   */
  async matchShowByFilmVersions({
    cinema_id,
    film_name,
    hall_name,
    start_day,
    start_time,
    excludeShortCode,
    film: providedFilm,
    variants
  }) {
    try {
      const hallIsImax = /imax/i.test(hall_name || "");
      const triedShortCodes = new Set(excludeShortCode ? [excludeShortCode] : []);
      const toCandidate = item => ({
        short_code: item.short_code,
        feature: item.feature,
        language_type: item.language_type
      });

      // 逐个候选版本试场次，命中（同时间多场次取影厅名最像的）即返回
      const attempt = async candidates => {
        let best = null;
        for (const candidate of candidates) {
          triedShortCodes.add(candidate.short_code);
          const playDateList = await this.getMoviePlayDate({
            cinema_id,
            short_code: candidate.short_code
          });
          const targetDate = playDateList?.find(
            item => formatTimeStrByLma(item.date) === start_day
          );
          let showListOfTime = (targetDate?.session || []).filter(
            item => item.start_time === start_time
          );
          if (!showListOfTime.length) continue;
          let targetShow = showListOfTime[0];
          let similarity = 0;
          if (showListOfTime.length > 1) {
            showListOfTime = showListOfTime.map(item => {
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
            showListOfTime = showListOfTime.sort(
              (a, b) => b.similarity - a.similarity
            );
            targetShow = showListOfTime[0];
            similarity = targetShow.similarity || 0;
          }
          if (!best || similarity > best.similarity) {
            best = { targetShow, similarity, candidate };
          }
          // 已按影厅命中该版本，无需继续试其它版本
          if (similarity > 0) break;
        }
        return best;
      };

      let best = null;
      // 1、后端候选版本（with_versions=1，新后端才有）：直接用，省一次影片列表请求
      if (variants?.length) {
        const variantCandidates = variants
          .filter(item => item?.short_code && !triedShortCodes.has(item.short_code))
          .map(toCandidate)
          // 与影厅版本一致的优先试，命中更快
          .sort((a, b) => {
            const aScore = /imax/i.test(a.language_type || "") === hallIsImax ? 0 : 1;
            const bScore = /imax/i.test(b.language_type || "") === hallIsImax ? 0 : 1;
            return aScore - bScore;
          });
        if (variantCandidates.length) {
          best = await attempt(variantCandidates);
        }
      }

      // 2、候选版本没救回来（历史里只有当前错误版本 / 旧后端没有候选）：
      //    重查影片列表，按同名影片取全部版本再试
      if (!best) {
        const film = providedFilm?.length
          ? providedFilm
          : (await this.getMoviePlayInfo({ cinema_id }))?.film || [];
        if (!film.length) return null;
        const normalizeName = name =>
          String(name ?? "")
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
            .toLowerCase();
        // 先按影片全名取同名条目（同一影片的各个版本），取不到再按归一化名称兜底
        let filmCandidates = film.filter(item => item.title === film_name);
        if (!filmCandidates.length) {
          const targetName = normalizeName(film_name);
          filmCandidates = film.filter(
            item => normalizeName(item.title) === targetName
          );
        }
        filmCandidates = filmCandidates
          .filter(item => item.short_code && !triedShortCodes.has(item.short_code))
          .map(toCandidate);
        if (!filmCandidates.length) return null;
        best = await attempt(filmCandidates);
      }
      if (!best) return null;

      this.logger.warnSave("缓存场次匹配失败，按影片版本兜底命中", {
        film_name,
        excludeShortCode,
        matchedShortCode: best.candidate.short_code,
        session_id: best.targetShow.session_id
      });
      // 只回填有值的属性：候选（历史缓存）可能缺 feature/language_type，
      // 用 undefined 覆盖会把调用方已有的影片属性冲掉（报价的电影格式过滤会拿到 undefined）
      const matchedMovieInfo = { short_code: best.candidate.short_code };
      if (best.candidate.feature != null) {
        matchedMovieInfo.feature = best.candidate.feature;
      }
      const matchedLanguageType =
        best.candidate.language_type || best.targetShow?.language_type;
      if (matchedLanguageType != null) {
        matchedMovieInfo.language_type = matchedLanguageType;
      }
      return {
        targetShow: best.targetShow,
        short_code: best.candidate.short_code,
        movieInfo: matchedMovieInfo
      };
    } catch (error) {
      // 兜底链路异常属补救动作，用 warnSave（只进 L2）避免覆盖根因缓存，
      // 否则后续转单/失败原因会被这条异常顶掉
      this.logger.warnSave("按影片版本重匹配场次异常", {
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
    this.cachedVersions = null;
    try {
      const { app_name, cinema_code, film_name, show_time } = this.order;
      // 本地进程内 LRU 缓存（6 小时 TTL、容量 2000，参数由字典表配置）
      // 命中本地缓存直接返回，省掉对后端的 HTTP 调用；未命中再查后端，命中结果写本地缓存
      // withVersions：额外带回「同影片各版本候选短码」（后端 with_versions=1），
      // 用于缓存命中却场次匹配失败时直接换版本重试，省掉影片列表请求；旧后端不返回则为空
      const { ids, versions, source } = await getCachedThirdPartyIdsWithCache(
        { app_name, cinema_code, film_name, show_time },
        () =>
          svApi.getCachedThirdPartyIds({
            app_name,
            cinema_code,
            film_name,
            show_time,
            with_versions: 1
          }),
        { withVersions: true }
      );
      this.cacheSource = source; // 1=本地命中, 2=远端命中, 0=未命中
      this.cachedVersions = versions?.length ? versions : null;
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
