/**
 * 万达影院管理模块
 *
 * 职责：
 * - 获取城市列表
 * - 获取城市影院列表
 * - 获取电影放映信息、放映日期、场次信息
 * - 匹配目标影院、电影、场次
 * - 影院指定卡/券处理、登录信息排序
 *
 * 所属流程：报价流程、出票流程
 *
 * @module wanda/cinemaManage
 */
import {
  formatErrInfo,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  getCinemaLoginInfoList
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

export default class WandaCinemaManage {
  constructor(order, logger, offerRule, currentParamsList) {
    this.order = order;
    this.appFlag = order.app_name;
    this.offerRule = offerRule;
    this.logger = logger;
    this.currentParamsList = currentParamsList;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取购票前的影院信息（唯一暴漏方法）
   * 流程：城市→影院→卡券排序→影片→场次
   * @param {Object} params
   * @param {number} params.flag - 1=报价（跳过卡券排序），其他=出票
   * @param {Object} params.cardQuanManage - 卡券管理实例
   * @returns {Object|undefined} cinemaInfo
   */
  async getBuyPrevCinemaInfo({ flag, cardQuanManage }) {
    try {
      const { appFlag } = this;
      const { city_name, cinema_code, cinema_name, film_name, show_time } =
        this.order;
      let cinemaInfo = {};

      // 1、获取城市列表 → 匹配城市ID
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        this.logger.errorSave("获取万达城市列表为空");
        return;
      }
      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      if (!city_id) {
        this.logger.errorSave("获取万达城市ID失败", { city_name });
        return;
      }

      // 2、获取城市影院列表 → 匹配目标影院
      const { cinemaList } = await this.getCityCinemaList({ city_id });
      if (!cinemaList?.length) {
        this.logger.errorSave("获取万达城市影院列表为空", { city_id });
        return;
      }
      let targetCinema = this.getTargetCinemaInfo(cinema_code, cinemaList);
      if (!targetCinema) {
        this.logger.errorSave("获取万达目标影院失败", {
          cinema_name,
          cinema_code,
          appFlag,
          city_name
        });
        return;
      }

      cinemaInfo.city_id = city_id;
      cinemaInfo.cinema_id = targetCinema.storeId;
      cinemaInfo.cinema_name = targetCinema.cinemaName;
      cinemaInfo.cinema_code = targetCinema.storeId;

      // 3、影院指定卡/券处理：获取可用卡列表 + 按卡券排序登录信息（出票才需要）
      if (flag != 1) {
        await this.cinemaLinkCardHandle(cinemaInfo, cardQuanManage);
        cinemaInfo.currentParamsList = this.currentParamsList;
      }

      // 4、按城市获取影片列表 → 匹配目标影片
      const movieData = await this.getMoviePlayInfo({ city_id });
      const movieList = movieData?.movieData || [];
      if (!movieList?.length) {
        this.logger.errorSave("获取万达电影放映信息返回空", { city_id });
        return;
      }
      let movieInfo = this.getTargetMovie(movieList, film_name);
      if (!movieInfo) {
        this.logger.errorSave("获取万达目标影片信息失败", { film_name });
        return;
      }
      this.logger.infoSave("匹配到目标影片", movieInfo);

      cinemaInfo.film_id = movieInfo.film_id;

      // 5、按影院+影片+日期获取排期 → 匹配目标场次
      const targetShow = await this.getTargetShow(cinemaInfo);
      if (!targetShow) {
        return;
      }
      cinemaInfo.targetShow = targetShow;
      cinemaInfo.media = targetShow.filmList?.[0]?.version;
      cinemaInfo.show_id = targetShow.showtimeId;
      cinemaInfo.member_price = targetShow.salesPrice; // 会员价 可能会不准确，需要从座位里获取最高价格
      this.logger.infoSave("获取电影购票前信息", cinemaInfo);
      return cinemaInfo;
    } catch (error) {
      this.logger.errorSave("获取购票前的影院信息异常", formatErrInfo(error));
    }
  }

  /**
   * 获取城市列表（Wanda API: data.city）
   * @returns {Promise<Array>} 城市列表
   */
  async getCityList() {
    try {
      let params = {};
      console.log("获取万达城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log("获取万达城市列表返回", res);
      return res.data?.city || [];
    } catch (error) {
      this.logger.errorSave("获取万达城市列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取城市影院列表
   * Wanda API: by_locationid_v6_4.api，入参 locationId
   * 响应: { code: 0, data: { bizCode: 0, cinemaInfoList: [{ storeId, cinemaName, ... }] } }
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @returns {Promise<Object>} { cinemaList, error? }
   */
  async getCityCinemaList({ city_id }) {
    try {
      let params = { locationId: city_id };
      console.log("获取万达城市影院参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取万达城市影院返回", res);
      // 拦截器已解包 response.data，业务数据在 res.data 下
      let cinemaList = res.data?.cinemaInfoList || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.storeId,
        cinema_name: itemA.cinemaName
      }));
      return { cinemaList };
    } catch (error) {
      this.logger.errorSave("获取万达城市影院列表异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error), cinemaList: [] };
    }
  }

  /**
   * 根据影院编码匹配目标影院
   */
  getTargetCinemaInfo(cinema_code, cinemaList) {
    let targetCinema = cinemaList.find(
      item => cinema_code && item.cinemaId == cinema_code
    );
    if (!targetCinema) {
      targetCinema = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
    }
    return targetCinema;
  }

  // ==================== 卡券排序 ====================

  /**
   * 影院指定卡/券处理 — 根据可用卡调整登录信息顺序
   */
  async cinemaLinkCardHandle(cinemaInfo, cardQuanManage) {
    const { ticket_num } = this.order;
    try {
      if (!cinemaInfo.cinema_id) return;

      const usableCards = await this.getUsableCardList(
        cinemaInfo.cinema_id,
        ticket_num
      );
      if (usableCards?.length) {
        // 赋值可用卡列表
        cinemaInfo.usableCardList = usableCards;
      }

      if (this.offerRule?.offer_type != 1) {
        // 用卡场景：有可用卡的手机号排前面
        const cardLinkMobile = usableCards.map(item => item.mobile);
        this.currentParamsList = this.currentParamsList.sort((a, b) => {
          if (
            cardLinkMobile.includes(a.mobile) &&
            !cardLinkMobile.includes(b.mobile)
          )
            return -1;
          if (
            !cardLinkMobile.includes(a.mobile) &&
            cardLinkMobile.includes(b.mobile)
          )
            return 1;
          return 0;
        });
        this.logger.infoSave("登录信息按照可用卡列表排序后", {
          currentParamsList: this.currentParamsList
        });
      } else {
        // 用券场景：券库存多的手机号排前面
        const sortMobileList =
          await cardQuanManage.getSortPhoneByQuanTypeList?.(
            this.appFlag,
            this.offerRule?.quan_flag,
            this.offerRule?.quan_value,
            ticket_num
          );
        if (sortMobileList?.length) {
          this.currentParamsList = this.currentParamsList.sort((a, b) => {
            const indexA = sortMobileList.indexOf(a.mobile);
            const indexB = sortMobileList.indexOf(b.mobile);
            if (indexA !== -1 && indexB === -1) return -1;
            if (indexA === -1 && indexB !== -1) return 1;
            return 0;
          });
          this.logger.infoSave("登录信息按照可用券数量关联手机号排序后", {
            currentParamsList: this.currentParamsList,
            sortMobileList
          });
        }
      }
    } catch (error) {
      this.logger.errorSave("影院指定卡相关处理异常", formatErrInfo(error));
    }
  }

  /**
   * 获取影院可用会员卡（SV后台维护的卡列表，与金逸共用同一套卡管理）
   */
  async getUsableCardList(cinema_id, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,balance,mobile,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
      });
      let list = res.data.cardList || [];
      return this.filterUsableCardList(list, ticket_num, cinema_id);
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", formatErrInfo(error));
      return [];
    }
  }

  /**
   * 过滤可用卡：手机号→使用量限制→影院指定卡
   */
  filterUsableCardList(list, ticket_num, cinema_id) {
    list = list.map(item => ({
      ...item,
      daily_usage:
        item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
      month_usage: !isDateInCurrentMonth(item.usage_date)
        ? 0
        : item.monthly_usage || 0
    }));

    // 可用手机号过滤
    const useMobileList = getCinemaLoginInfoList(!this.order.need_unsplit_login)
      .filter(
        item => item.app_name === this.appFlag && item.mobile && item.session_id
      )
      .map(item => item.mobile);
    let cardListByMobile = list.filter(item =>
      useMobileList.includes(item.mobile)
    );

    // 当天/当月出票量限制
    let cardListLimit = cardListByMobile.filter(item => {
      const { use_limit_day, use_limit_month, daily_usage, month_usage } = item;
      if (!use_limit_day && !use_limit_month) return true;
      return (
        (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
        (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
      );
    });

    // 影院指定卡 → 指定卡优先 → 余额高优先
    let useCanCardList = cardListLimit
      .filter(item =>
        !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id)
      )
      .sort((a, b) => {
        if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
        if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
        return 0;
      })
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    this.logger.infoSave("可用卡过滤结果", {
      cinema_id,
      count: useCanCardList.length,
      cards: useCanCardList.map(c => c.card_num)
    });
    return useCanCardList;
  }

  // ==================== 影片/场次匹配 ====================

  /**
   * 匹配目标影片
   */
  getTargetMovie(movieData, film_name) {
    return getMovieInfoFromFilmName({
      filmName: film_name,
      movieData: movieData.map(m => ({
        ...m,
        filmName: m.film_name
      }))
    });
  }

  /**
   * 获取目标场次（支持次日重试）
   */
  async getTargetShow(cinemaInfo) {
    const { cinema_id, film_id, film_name } = cinemaInfo;
    const { show_time, hall_name } = this.order;
    let show_date = show_time.split(" ")[0].replaceAll("-", "");
    try {
      const res = await this.appApi.getShowtimeByCinema({
        cinemaId: cinema_id,
        json: true
      });
      const showtimeFilmInf = res?.data?.showtimeFilmInf || [];
      const targetFilm = showtimeFilmInf.find(f => f.filmId === film_id);
      if (!targetFilm) {
        this.logger.errorSave("该影院没有此影片的排期", { cinema_id, film_id });
        return [];
      }

      // 5、在该影片的排期中，按日期+realtime+影厅匹配场次
      const dateInfos = targetFilm.showtimeFilmDateInf || [];
      console.log("万达目标影片场次列表", dateInfos);

      let dateInfo = dateInfos.find(d => d.date === Number(show_date));
      if (!dateInfo) return [];
      let showList = dateInfo.showtimesInf?.showtimeList || [];

      let targetShow = this._findTargetShow(showList);

      if (targetShow) {
        return targetShow;
      }

      // 次日重试
      show_date = getPreviousDay(show_date);
      this.logger.warnSave("首次匹配场次失败，尝试次日重试", { show_date });
      dateInfo = dateInfos.find(d => d.date === Number(show_date));
      if (!dateInfo) return [];
      showList = dateInfo.showtimesInf?.showtimeList || [];
      targetShow = this._findTargetShow(showList);
      if (targetShow) {
        return targetShow;
      }
      this.logger.warnSave("次日重试匹配场次仍失败");

      if (!targetShow) {
        this.logger.errorSave("匹配万达影片放映场次失败", {
          cinema_id,
          showDay,
          showTime,
          hall_name
        });
        return null;
      }
    } catch (error) {
      this.logger.errorSave("场次匹配异常", formatErrInfo(error));
    }
  }

  /**
   * 匹配目标场次（Wanda: realtime时间戳精确匹配 + 厅名相似度排序）
   */
  _findTargetShow(showList) {
    const { hall_name, show_time } = this.order;
    const MIN_SIMILARITY_THRESHOLD = 3;
    const orderTs = new Date(show_time).getTime();

    let targetShowList = showList.filter(item => item.realtime === orderTs);
    if (targetShowList.length === 0) return;
    if (targetShowList.length === 1) return targetShowList[0];

    // 多场次按厅名相似度排序
    targetShowList = targetShowList.map(item => ({
      ...item,
      ...findMostRepeatedChars(item.hallName, hall_name, "hall_name")
    }));
    targetShowList.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    this.logger.infoSave("多场次匹配结果", {
      bestMatch: targetShowList[0],
      similarityThreshold: MIN_SIMILARITY_THRESHOLD
    });
    if (targetShowList[0]?.totalRepeated >= MIN_SIMILARITY_THRESHOLD) {
      return targetShowList[0];
    }
  }

  // ==================== 以下为原有方法，保持不变 ====================

  /**
   * 获取电影放映信息（万达版本：按城市获取影片列表）
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @returns {Promise<Object|null>} 电影放映信息或null
   */
  async getMoviePlayInfo(data) {
    try {
      let { city_id } = data || {};
      let params = { cityId: city_id };
      console.log("获取万达电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取万达电影放映信息返回", res);
      return {
        movieData: res.data?.movie_data || []
      };
    } catch (error) {
      this.logger.errorSave("获取万达电影放映信息异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error) };
    }
  }
}
