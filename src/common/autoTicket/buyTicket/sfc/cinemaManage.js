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
import svApi from "@/api/sv-api";
import { getCachedThirdPartyIdsWithCache } from "@/common/core/thirdPartyIdsCache";

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
      this.cacheHit = 0; // 标记是否命中第三方ID缓存，供 buildSuccessResponse 读取
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

      // ======== 第三方 ID 缓存复用：命中则跳过城市/影院列表查询 ========
      const cachedIds = await this.tryGetCachedThirdPartyIds();
      let city_id, cinema_id;
      let cacheHit = 0; // 跟踪缓存命中状态，成功返回前赋给 this.cacheHit
      if (cachedIds?.city_id && cachedIds?.cinema_id) {
        city_id = cachedIds.city_id;
        cinema_id = cachedIds.cinema_id;
        cacheHit = this.cacheSource;
        this.logger.infoSave("命中第三方ID缓存，跳过城市/影院列表查询", {
          cachedIds
        });
      } else {
        const cityList = await this.getCityList();
        if (!cityList?.length) {
          return null;
        }
        city_id = cityList.find(
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
        cinema_id = cinemaIdRes?.id;
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
      this.cinemaInfo = { ...targetShow, city_id, cinema_id }; // 供 offerManage.buildSuccessResponse 透传，写入 third_party_ids（跨订单复用）
      this.cacheHit = cacheHit;
      return this.cinemaInfo;
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 获取购票前的影院信息（出票流程中使用，复用 getMovieInfo 的缓存逻辑）
  async getBuyPrevCinemaInfo() {
    try {
      const result = await this.getMovieInfo(this.order);
      if (!result) {
        return { error: "获取影院/影片/场次信息失败" };
      }
      const show_time = this.order.show_time;
      let start_day = show_time.split(" ")[0];
      let start_time = show_time.split(" ")[1].slice(0, 5);
      if (isNextDay(start_day, start_time, "sfc")) {
        start_day = getPreviousDay(start_day);
      }
      return {
        city_id: result.city_id,
        cinema_id: result.cinema_id,
        show_id: result.show_id,
        start_day,
        start_time,
        targetShow: result,
        movieInfo: result
      };
    } catch (error) {
      this.logger.errorSave("获取购票前影院信息异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error) };
    }
  }

  // ==================== 第三方 ID 缓存复用 ====================

  /**
   * 查询第三方 ID 缓存（跨订单复用）
   * 按 app_name + cinema_code + film_name + show_time 查询 N 天内的报价记录（N 由字典表配置，默认 7 天）
   * SFC 为精简版：命中时仅跳过城市/影院列表查询，影片/场次仍实时查（getMoviePlayInfo 一次调用即获影片+场次）
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
