/**
 * 凤凰影院管理模块
 *
 * 职责：
 * - 获取城市影院列表
 * - 获取目标影院信息
 * - 获取影片放映信息
 * - 获取目标场次
 * - 根据可用卡/券调整登录信息顺序
 *
 * 所属流程：出票流程
 *
 * @module fenghuang/cinemaManage
 */
import {
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon,
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  mockDelay,
  getOfferRuleById
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import { getCachedThirdPartyIdsWithCache } from "@/common/core/thirdPartyIdsCache";
import { GET_APP_INFO } from "@/common/constant";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

/**
 * 凤凰影院管理类
 * 负责获取购票前的影院、影片、场次等信息
 */
export default class CinemaManage {
  constructor(order, logger, offerRule, currentParamsList) {
    this.order = order;
    this.appFlag = order.app_name;
    this.offerRule = offerRule;
    this.logger = logger;
    this.currentParamsList = currentParamsList;
    this.appApi = APP_API_OBJ[order.app_name];
    this.api_version = GET_APP_INFO(order.app_name)?.api_version;
  }

  // 获取购票前的影院信息（核心方法）// 1-报价 默认出票
  async getBuyPrevCinemaInfo({ flag, cardQuanManage }) {
    try {
      this.cacheHit = 0;
      const { appFlag } = this;
      const { city_name, cinema_code, cinema_name, film_name, show_time } =
        this.order;
      let cinemaInfo = {};

      // ======== 第三方 ID 缓存复用：命中则跳过城市/影院/影片查询，仅场次实时查 ========
      const cachedIds = await this.tryGetCachedThirdPartyIds();
      if (cachedIds) {
        const cachedInfo = this.buildCinemaInfoFromCache(cachedIds);
        if (cachedInfo) {
          // 出票场景仍需卡券排序（卡券可用性分钟级变化，不复用）
          if (flag != 1) {
            await this.cinemaLinkCardHandle(cachedInfo, cardQuanManage);
            cachedInfo.currentParamsList = this.currentParamsList;
          }
          // 场次时效性强，命中缓存后仍实时查询；失败则回退完整查询链
          const showOk = await this.fillShowInfoFromApi(cachedInfo);
          if (showOk) {
            this.logger.infoSave("命中第三方ID缓存，跳过城市/影院/影片查询链", {
              cachedIds
            });
            this.cacheHit = this.cacheSource;
            this.cinemaInfo = cachedInfo;
            return cachedInfo;
          }
          this.logger.warnSave(
            "缓存命中但场次实时匹配失败，回退完整查询链",
            { cachedIds }
          );
        }
      }
      // ======== 缓存未命中或回退，走原完整逻辑 ========

      // 1、获取全部城市及影院列表
      let cityCinemaList = await this.getCityCinemaList();
      if (!cityCinemaList?.length) {
        this.logger.errorSave("获取目标城市影院列表失败", {
          city_name,
          cityCinemaList
        });
        return;
      }

      // 2、获取全部影院列表
      let cinemaList = this.getTargetCityCinemas(cityCinemaList);
      if (!cinemaList?.length) {
        this.logger.errorSave("获取全部影院列表失败", {
          cityCinemaList
        });
        return;
      }
      console.log("cinemaList", cinemaList);
      // 3、获取目标影院
      let targetCinema = this.getTargetCinemaInfo(cinema_code, cinemaList);
      if (!targetCinema) {
        this.logger.errorSave("获取目标影院失败", {
          cinema_name,
          cinema_code,
          cinemaList,
          appFlag,
          city_name
        });
        return;
      }
      console.log("targetCinema", targetCinema);
      cinemaInfo.cinemaLinkId = targetCinema.cinemaLinkId;
      cinemaInfo.cinemaName = targetCinema.cinemaName;

      // 4、拿到影院code进行影院指定卡相关处理(获取可用卡列表，根据可用卡调整登录信息顺序)
      if (flag != 1) {
        // 出票调用时才需要这样处理
        await this.cinemaLinkCardHandle(cinemaInfo, cardQuanManage);
        cinemaInfo.currentParamsList = this.currentParamsList;
      }

      // 5、获取目标影院放映列表
      const movie_data = await this.getMoviePlayInfo(cinemaInfo);
      if (!movie_data?.length) {
        return;
      }
      console.log("movie_data", movie_data);
      // 6、获取目标影片信息
      let movieInfo = this.getTargetMovie(movie_data, film_name);
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          movie_data,
          film_name
        });
        return;
      }
      cinemaInfo.filmId = movieInfo.filmId;

      // 7、获取影片放映场次
      cinemaInfo.showDate = show_time.split(" ")[0];
      console.log("cinemaInfo", cinemaInfo);
      const targetShow = await this.getTargetShow(cinemaInfo);
      if (!targetShow) {
        return;
      }
      this.logger.infoSave("出票前获取电影放映信息", { targetShow });
      cinemaInfo.targetShow = targetShow;
      cinemaInfo.scheduleId = targetShow.scheduleId;
      cinemaInfo.scheduleKey = targetShow.scheduleKey;
      this.cinemaInfo = cinemaInfo; // 供 offerManage.buildSuccessResponse 透传，写入 third_party_ids（跨订单复用）
      return cinemaInfo;
    } catch (error) {
      this.logger.errorSave("获取购票前的影院信息异常", formatErrInfo(error));
    }
  }

  // 获取城市影院列表
  async getCityCinemaList(retryCount = 1) {
    const maxRetries = 3; // 最大重试次数
    try {
      let params = {};
      this.logger.info("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      this.logger.info("获取城市影院列表返回", res);
      let cityCinemaList = [];

      cityCinemaList = res.cityCinemas || [];
      cityCinemaList = cityCinemaList.map(item => ({
        ...item,
        cityCode: item.cityCode,
        cityName: item.cityName,
        cinemaList: (item.cinemas || []).map(itemA => ({
          ...itemA,
          cinemaId: itemA.cinemaLinkId,
          cinemaName: itemA.cinemaName,
          cinemaCode: ""
        }))
      }));
      if (!cityCinemaList?.length) {
        this.logger.errorSave("获取城市影院列表为空");
        if (retryCount < maxRetries) {
          this.logger.errorSave("1秒回重新获取影院列表");
          await mockDelay(1);
          return this.getCityCinemaList(retryCount + 1);
        }
        return;
      }
      return cityCinemaList;
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", formatErrInfo(error));
      if (retryCount < maxRetries) {
        this.logger.errorSave("1秒回重新获取影院列表");
        await mockDelay(1);
        return this.getCityCinemaList(retryCount + 1);
      }
      return undefined;
    }
  }

  // 获取全部影院列表
  getTargetCityCinemas(cityCinemaList) {
    return cityCinemaList.map(item => item.cinemaList)?.flat() || [];
  }

  // 获取目标影院
  getTargetCinemaInfo(cinemaCode, cinemaList) {
    let targetCinema = cinemaList.find(
      item => cinemaCode && item.cinemaCode == cinemaCode
    );
    if (!targetCinema) {
      targetCinema = getTargetCinemaCommon({
        app_name: this.appFlag,
        plat_cinema_code: cinemaCode,
        cinema_list: cinemaList
      });
    }
    return targetCinema;
  }

  // 获取目标影片信息
  getTargetMovie(movieData, filmName) {
    // 全字匹配
    let movieInfo = getMovieInfoFromFilmName({
      filmName: filmName,
      movieData: movieData?.map(item => ({
        ...item,
        filmName: item.filmName
      }))
    });
    if (!movieInfo) {
      // 模糊匹配
      this.logger.warn("全字匹配目标影片信息失败", { movieData, filmName });
    }
    return movieInfo;
  }

  // 影院指定卡相关处理(根据可用卡调整登录信息顺序)
  async cinemaLinkCardHandle(cinemaInfo, cardQuanManage) {
    const { ticket_num, supplier_end_price, app_name } = this.order;
    try {
      if (cinemaInfo.cinemaLinkId) {
        const usableCards = await this.getUsableCardList(
          cinemaInfo.cinemaLinkId,
          ticket_num
        );
        if (usableCards?.length) {
          cinemaInfo.usableCardList = usableCards; // 赋值可用卡列表
        }
        let isUseQuan = this.offerRule?.offer_type == "1";
        let auto_quan_info;
        if (this.offerRule?.offer_type != "1") {
          const ruleInfo = getOfferRuleById(this.offerRule.offer_rule_id);
          if (ruleInfo) {
            const { autoUseQuanStatus, autoUseQuanPrice, auto_quan_value } =
              ruleInfo;
            if (
              autoUseQuanStatus === "1" &&
              supplier_end_price > autoUseQuanPrice &&
              auto_quan_value
            ) {
              auto_quan_info = await cardQuanManage.getQuanInfo(
                auto_quan_value,
                app_name
              );
            }
          }
        }
        // 非固定报价或者灵活用券时按照卡券优先排序登录信息
        if (!(isUseQuan || auto_quan_info)) {
          let cardLinkMobile = usableCards.map(item => item.mobile);
          // 根据可用卡调整登录信息顺序
          this.currentParamsList = this.currentParamsList.sort((a, b) => {
            if (
              cardLinkMobile.includes(a.mobile) &&
              !cardLinkMobile.includes(b.mobile)
            ) {
              return -1; // a靠前
            }
            if (
              !cardLinkMobile.includes(a.mobile) &&
              cardLinkMobile.includes(b.mobile)
            ) {
              return 1;
            }
            return 0;
          });
          this.logger.infoSave("登录信息按照可用卡列表排序后", {
            currentParamsList: this.currentParamsList
          });
        } else {
          let quan_flag =
            this.offerRule?.quan_flag || auto_quan_info?.quan_flag;
          let quan_value =
            this.offerRule?.quan_value || auto_quan_info?.quan_value;
          const sortMobileList =
            await cardQuanManage.getSortPhoneByQuanTypeList(
              this.appFlag,
              quan_flag,
              quan_value,
              ticket_num
            );
          if (sortMobileList?.length) {
            this.currentParamsList = this.currentParamsList.sort((a, b) => {
              // 获取 a.mobile 在 sortMobileList 中的索引（不存在则返回 -1）
              const indexA = sortMobileList.indexOf(a.mobile);
              // 获取 b.mobile 在 sortMobileList 中的索引
              const indexB = sortMobileList.indexOf(b.mobile);

              // 规则1：a存在且b不存在 → a排前面
              if (indexA !== -1 && indexB === -1) return -1;

              // 规则2：a不存在且b存在 → b排前面
              if (indexA === -1 && indexB !== -1) return 1;

              // 其他情况：保持原顺序
              return 0;
            });
            this.logger.infoSave("登录信息按照可用券数量关联手机号排序后", {
              currentParamsList: this.currentParamsList,
              sortMobileList
            });
          }
        }
      }
    } catch (error) {
      this.logger.errorSave("影院指定卡相关处理异常", formatErrInfo(error));
    }
  }

  // 获取影院可用会员卡
  async getUsableCardList(cinemaLinkId, ticket_num) {
    const { appFlag } = this;
    try {
      // 获取已维护的卡列表
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,balance,mobile,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
      });
      let list = res.data.cardList || [];
      // 对卡列表进行可用过滤处理
      return this.filterUsableCardList(list, ticket_num, cinemaLinkId);
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", formatErrInfo(error));
    }
  }
  // 过滤可用卡
  filterUsableCardList(list, ticket_num, cinemaLinkId) {
    list = list.map(item => ({
      ...item,
      // 使用日非当天的就是0
      daily_usage:
        item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
      // 使用日非当月的就是0
      month_usage: !isDateInCurrentMonth(item.usage_date)
        ? 0
        : item.monthly_usage || 0
    }));
    this.logger.infoSave("获取该影院已维护会员卡列表返回", { list });

    // 获取该影院的可用手机号列表
    let useMobileList = getCinemaLoginInfoList(!this.order.need_unsplit_login)
      .filter(
        item => item.app_name === this.appFlag && item.mobile && item.session_id
      )
      .map(item => item.mobile);
    // 根据可用手机号对卡列表进行过滤
    let cardListByMobile = list.filter(item =>
      useMobileList.includes(item.mobile)
    );
    this.logger.infoSave("根据可用手机号对卡列表进行过滤", {
      useMobileList,
      cardListByMobile: cardListByMobile.map(item => item.card_num)
    });

    // 根据当天及当月出票量限制进行过滤
    let cardListLimit = cardListByMobile.filter(item => {
      const { use_limit_day, use_limit_month, daily_usage, month_usage } = item;
      if (!use_limit_day && !use_limit_month) return true;
      return (
        (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
        (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
      );
    });
    this.logger.infoSave("根据当天及当月出票量限制对卡列表进行过滤", {
      cardListLimit: cardListLimit.map(item => item.card_num)
    });

    // 根据影院指定卡进行过滤
    let useCanCardList = cardListLimit.filter(item => {
      return !item.linkCinemaIds
        ? true
        : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
    });
    // 设置指定影院的卡优先
    useCanCardList = useCanCardList.sort((a, b) => {
      if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
      if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
      return 0;
    });
    this.logger.infoSave("根据制定影院对卡列表进行过滤", {
      useCanCardList: useCanCardList.map(item => item.card_num)
    });
    return useCanCardList;
  }
  // 获取影院放映信息
  async getMoviePlayInfo({ cinemaLinkId }) {
    try {
      let params = {
        cinemaLinkId,
        pageInit: false
        // isNoCache: true // 放开时可在报价规则那里调试是否走代理
      };
      this.logger.info("获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      // this.logger.infoSave("获取电影放映信息返回", res);
      const hotFilms = res?.hotFilms || [];
      let soonFilms = res?.soonFilms || [];
      soonFilms = soonFilms
        .map(item => item.films)
        .flat()
        .filter(item => item.saleType === "P");
      let movie_data = [...hotFilms, ...soonFilms];
      movie_data = movie_data.map(item => ({
        ...item,
        film_id: item.filmId,
        film_name: item.filmName
      }));
      if (!movie_data?.length) {
        this.logger.errorSave("获取电影放映信息返回空");
        return;
      }
      return movie_data;
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", formatErrInfo(error));
    }
  }
  // 获取电影放映场次
  async getMoviePlayTime(cinemaInfo) {
    const { cinemaLinkId, filmId, showDate } = cinemaInfo;
    try {
      let params = {
        cinemaLinkId,
        pageInit: false
      };
      this.logger.info("获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      let filmList = res?.filmSchedules || [];
      let showList =
        filmList.find(item => item.filmId == filmId)?.dateSchedules || [];
      console.log("showList", showList);
      let moviePlayTime =
        showList.find(
          item => item.businessDate == +new Date(showDate + " 00:00:00")
        )?.schedules || [];
      if (!moviePlayTime?.length) {
        this.logger.errorSave("获取电影放映场次返回空");
        this.logger.infoSave("获取电影放映场次返回", res);
      }
      return moviePlayTime;
    } catch (error) {
      this.logger.errorSave("获取电影放映场次异常", formatErrInfo(error));
      return [];
    }
  }

  // 获取目标场次
  async getTargetShow(cinemaInfo, retryNextDay = true) {
    try {
      const showList = await this.getMoviePlayTime(cinemaInfo);
      console.log("showList1", showList);
      const targetShow = this._findTargetShow(showList);

      if (targetShow) {
        return targetShow;
      }

      if (retryNextDay) {
        this.logger.warn("当日场次未匹配，尝试次日场次", { cinemaInfo });
        return this.getTargetShow(
          {
            ...cinemaInfo,
            showDate: getPreviousDay(cinemaInfo.showDate)
          },
          false
        );
      }
      this.logger.errorSave("匹配影片放映场次失败", { showList, cinemaInfo });
    } catch (error) {
      this.logger.errorSave("场次匹配异常", formatErrInfo(error));
    }
  }

  // 匹配目标场次
  _findTargetShow(showList) {
    const { hall_name, show_time } = this.order;
    const MIN_SIMILARITY_THRESHOLD = 3;
    let targetShowList = showList.filter(
      item => +new Date(item.startTime) === +new Date(show_time)
    );

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
   * 用缓存的 ID 构造 cinemaInfo（跳过城市/影院/影片查询链）
   * @param {Object} cachedIds - 缓存的第三方 ID 集合
   * @returns {Object|null} cinemaInfo，缺少关键字段时返回 null
   */
  buildCinemaInfoFromCache(cachedIds) {
    if (!cachedIds?.cinemaLinkId) return null;
    const cinemaInfo = {
      cinemaLinkId: cachedIds.cinemaLinkId,
      cinemaName: this.order.cinema_name,
      filmId: cachedIds.filmId || null,
      showDate: this.order.show_time?.split(" ")[0] || null,
      _fromCache: true
    };
    return cinemaInfo;
  }

  /**
   * 命中缓存后仅实时查询场次（场次时效性强，不复用）
   * 复用 getTargetShow 逻辑，失败返回 false 触发回退
   * @param {Object} cinemaInfo - 已填充 ID 的 cinemaInfo
   * @returns {Promise<boolean>} 场次匹配成功返回 true
   */
  async fillShowInfoFromApi(cinemaInfo) {
    try {
      if (!cinemaInfo.cinemaLinkId || !cinemaInfo.filmId) return false;
      const targetShow = await this.getTargetShow(cinemaInfo);
      if (!targetShow) return false;
      cinemaInfo.targetShow = targetShow;
      cinemaInfo.scheduleId = targetShow.scheduleId;
      cinemaInfo.scheduleKey = targetShow.scheduleKey;
      return true;
    } catch (error) {
      this.logger.errorSave("缓存命中后实时查询场次异常", {
        error: formatErrInfo(error)
      });
      return false;
    }
  }
}
