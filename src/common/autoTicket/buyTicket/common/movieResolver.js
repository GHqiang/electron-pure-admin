/**
 * 影片/场次解析工具
 * 统一封装各影院系列的影片和场次匹配逻辑
 *
 * 说明：
 * - 通过 appFlag 获取 app_type_code（系列标识）来判断不同系列的数据结构差异
 * - 同一系列下的不同影院（appFlag）共享相同的解析逻辑
 */

import {
  getMovieInfoFromFilmName,
  findMostRepeatedChars,
  isNextDay,
  getPreviousDay
} from "@/utils/utils";
import { GET_APP_INFO } from "@/common/constant";

/**
 * 系列配置：定义不同系列的数据结构特征
 * 新增系列时只需在此添加配置即可
 */
const SERIES_CONFIG = {
  // SFC系列
  sfc_applet: {
    // 场次列表在 movieInfo.shows[start_day] 中
    getShowList: (movieInfo, _start_day) => movieInfo.shows?.[_start_day] || [],
    // 场次时间字段
    getShowTime: show => show.start_time,
    // 影厅名称字段
    getHallName: show => show.hall_name,
    // 跨天判断时传给 isNextDay 的参数
    isNextDayType: "sfc"
  },
  // LMA系列
  lma_applet: {
    getShowList: (movieInfo, _start_day) => {
      // LMA 的场次在 targetDate.session 中，需要外部传入 playDateList
      // 这里返回空，由调用方处理
      return movieInfo.session || [];
    },
    getShowTime: show => show.start_time,
    getHallName: show => show.screen_name,
    isNextDayType: "lma"
  },
  // UME系列（小程序）
  ume_applet: {
    getShowList: (_movieInfo, _start_day) => {
      // UME 的场次在 moviePlayTime 中，需要外部传入
      // 这里返回空，由调用方处理
      return [];
    },
    getShowTime: show => {
      // UME 使用 showDateTime，需要转换为时间字符串
      if (show.showDateTime) {
        const date = new Date(show.showDateTime);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
      }
      return show.start_time || "";
    },
    getHallName: show => show.hallName,
    isNextDayType: "ume" // 默认值，UME 通常不需要跨天判断
  },
  // UME H5系列
  ume_h5: {
    getShowList: (movieInfo, _start_day) => {
      // H5UME 的场次在 schedules 中
      return movieInfo.schedules || [];
    },
    getShowTime: show => {
      if (show.showTime) {
        const date = new Date(+show.showTime);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
      }
      return show.start_time || "";
    },
    getHallName: show => show.hallName,
    isNextDayType: "umeh5"
  },
  // 辰星系列
  chenxing_applet: {
    getShowList: (movieInfo, _start_day) => movieInfo.shows?.[_start_day] || [],
    getShowTime: show => show.start_time,
    getHallName: show => show.hall_name,
    isNextDayType: "chenxing" // 默认值
  },
  // 凤凰系列
  fenghuang_applet: {
    getShowList: (movieInfo, _start_day) => movieInfo.shows?.[_start_day] || [],
    getShowTime: show => show.start_time,
    getHallName: show => show.hall_name,
    isNextDayType: "fenghuang" // 默认值
  }
};

/**
 * 获取系列配置
 * @param {string} appFlag - 具体影院标识
 * @returns {Object|null} 系列配置对象或 null
 */
function getSeriesConfig(appFlag) {
  if (!appFlag) return null;
  const appInfo = GET_APP_INFO(appFlag);
  if (!appInfo?.app_type_code) return null;
  const config = SERIES_CONFIG[appInfo.app_type_code];
  if (!config) {
    console.warn(
      `未找到系列配置: appFlag=${appFlag}, app_type_code=${appInfo.app_type_code}`
    );
  }
  return config;
}

/**
 * 解析影片和场次
 *
 * @param {Object} params
 * @param {string} params.film_name - 影片名称
 * @param {string} params.hall_name - 影厅名称
 * @param {string} params.show_time - 放映时间（格式：YYYY-MM-DD HH:mm:ss）
 * @param {string} params.appFlag - 具体影院标识（用于获取系列标识）
 * @param {Array} params.movieData - 影片数据列表
 * @param {Object} [params.movieInfo] - 已匹配的影片信息（可选，如果已匹配可直接传入）
 * @param {Array} [params.showList] - （可选，某些场次列表系列需要外部传入，如 LMA、UME）
 * @param {Function} [params.showDataAdapter] - 场次数据适配器（可选，用于特殊转换，优先级高于系列配置）
 * @returns {Object|null} { movieInfo, targetShow, start_day, start_time } 或 null
 */
export function resolveMovieAndShow({
  film_name,
  hall_name,
  show_time,
  appFlag,
  movieData,
  movieInfo: providedMovieInfo,
  showList: providedShowList,
  showDataAdapter
}) {
  // 参数校验
  if (!appFlag) {
    console.error("resolveMovieAndShow: appFlag 不能为空");
    return null;
  }

  // 获取系列配置
  const seriesConfig = getSeriesConfig(appFlag);
  if (!seriesConfig) {
    console.error(`resolveMovieAndShow: 无法获取系列配置, appFlag=${appFlag}`);
    return null;
  }

  // 1. 匹配影片（如果未提供）
  let movieInfo = providedMovieInfo;
  if (!movieInfo) {
    if (!movieData?.length) {
      console.warn("resolveMovieAndShow: movieData 为空");
      return null;
    }
    movieInfo = getMovieInfoFromFilmName({
      filmName: film_name,
      movieData: movieData.map(item => ({
        ...item,
        filmName: item.filmName || item.movie_name || item.title
      }))
    });
    if (!movieInfo) {
      console.warn(
        `resolveMovieAndShow: 未找到匹配的影片, film_name=${film_name}`
      );
      return null;
    }
  }

  // 2. 处理跨天场次
  let start_day = show_time.split(" ")[0];
  let start_time = show_time.split(" ")[1]?.slice(0, 5) || "";

  if (!start_time) {
    console.warn(`resolveMovieAndShow: 无法解析时间, show_time=${show_time}`);
    return null;
  }

  // 根据系列配置判断是否跨天
  if (
    seriesConfig.isNextDayType &&
    isNextDay(start_day, start_time, seriesConfig.isNextDayType)
  ) {
    start_day = getPreviousDay(start_day);
  }

  // 3. 获取场次列表
  let showList = providedShowList;
  if (!showList || showList.length === 0) {
    showList = seriesConfig.getShowList(movieInfo, start_day);
  }

  if (!showList?.length) {
    console.warn(`resolveMovieAndShow: 未找到场次列表, start_day=${start_day}`);
    return null;
  }

  // 4. 按时间过滤场次
  const targetShowList = showList.filter(show => {
    let showTimeStr;
    if (showDataAdapter) {
      // 如果提供了适配器，优先使用适配器
      const adapted = showDataAdapter(show);
      showTimeStr =
        adapted.start_time || adapted.showTime || adapted.showDateTime;
    } else {
      // 否则使用系列配置的提取方法
      showTimeStr = seriesConfig.getShowTime(show);
    }

    if (!showTimeStr) return false;

    // 时间匹配：精确匹配或日期时间戳匹配
    return (
      showTimeStr === start_time ||
      showTimeStr.slice(0, 5) === start_time ||
      +new Date(showTimeStr) === +new Date(show_time)
    );
  });

  if (!targetShowList.length) {
    console.warn(
      `resolveMovieAndShow: 未找到匹配时间的场次, start_time=${start_time}`
    );
    return null;
  }

  // 5. 如果同一时间有多场次，按影厅名称相似度选择
  let targetShow = targetShowList[0];
  if (targetShowList.length > 1) {
    const scoredShows = targetShowList.map(show => {
      let hallName;
      if (showDataAdapter) {
        const adapted = showDataAdapter(show);
        hallName = adapted.hall_name || adapted.hallName || adapted.screen_name;
      } else {
        hallName = seriesConfig.getHallName(show);
      }

      if (!hallName) {
        return { ...show, similarity: 0 };
      }

      const repeatedCharsResult = findMostRepeatedChars(
        hallName,
        hall_name,
        "hall_name"
      );
      return {
        ...show,
        ...repeatedCharsResult
      };
    });

    scoredShows.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    targetShow = scoredShows[0];
  }

  return {
    movieInfo,
    targetShow,
    start_day,
    start_time
  };
}

/**
 * 获取系列配置（供外部查询使用）
 * @param {string} appFlag - 具体影院标识
 * @returns {Object|null} 系列配置对象或 null
 */
export function getMovieResolverConfig(appFlag) {
  return getSeriesConfig(appFlag);
}
