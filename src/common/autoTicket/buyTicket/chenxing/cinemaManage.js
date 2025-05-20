import {
  convertFullwidthToHalfwidth,
  getTargetCinema,
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  findMostRepeatedChars
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();
export default class CinemaManage {
  constructor(order, logger, offerRule, currentParamsList) {
    this.order = order;
    this.appFlag = order.app_name;
    this.offerRule = offerRule;
    this.logger = logger;
    this.currentParamsList = currentParamsList;
  }

  // 获取购票前的影院信息（核心方法）
  async getBuyPrevCinemaInfo() {
    try {
      const { appFlag } = this;
      const { city_name, cinema_code, cinema_name, film_name, show_time } =
        this.order;
      let cinemaInfo = {};

      // 1、获取全部城市及影院列表
      let cityCinemaList = await this.getCityCinemaList();
      if (!cityCinemaList?.length) {
        this.logger.errorSave("获取目标城市影院列表失败", {
          city_name,
          cityCinemaList
        });
        return;
      }

      // 2、获取目标城市影院列表
      let cinemaList = this.getTargetCityCinemas(cityCinemaList, city_name);
      if (!cinemaList?.length) {
        this.logger.errorSave("获取目标城市影院列表失败", {
          city_name,
          cityCinemaList
        });
        return;
      }

      // 3、获取目标影院
      let targetCinema = this.getTargetCinemaInfo(
        city_name,
        cinemaList,
        cinema_name,
        cinema_code
      );
      if (!targetCinema) {
        this.logger.errorSave("根据订单中的影院名称获取目标影院失败", {
          cinema_name,
          cinemaList,
          appFlag,
          city_name
        });
        return;
      }
      cinemaInfo.cinemaId = targetCinema.cinemaId;
      cinemaInfo.cinemaCode = targetCinema.cinemaCode;

      // 4、拿到影院code进行影院指定卡相关处理(获取可用卡列表，根据可用卡调整登录信息顺序)
      await this.cinemaLinkCardHandle(cinemaInfo);
      cinemaInfo.currentParamsList = this.currentParamsList;
      // 5、获取目标影院放映列表
      const movie_data = await this.getMoviePlayInfo(cinemaInfo);
      if (!movie_data?.length) {
        return;
      }

      // 6、获取目标影片信息
      let movieInfo = this.getTargetMovie(movie_data, film_name);
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          movie_data,
          film_name
        });
        return;
      }
      cinemaInfo.filmId = movieInfo.id;

      // 7、获取影片放映场次
      cinemaInfo.showDate = show_time.split(" ")[0];
      const targetShow = await this.getTargetShow(cinemaInfo);
      if (!targetShow) {
        return;
      }
      this.logger.infoSave("出票前获取电影放映信息", { targetShow });
      cinemaInfo.targetShow = targetShow;

      return cinemaInfo;
    } catch (error) {
      this.logger.errorSave("获取购票前的影院信息异常", formatErrInfo(error));
    }
  }

  // 获取城市影院列表
  async getCityCinemaList() {
    const { appFlag } = this;
    try {
      let params = {};
      this.logger.info("获取城市影院列表参数", params);
      const res = await APP_API_OBJ[appFlag].getCinemaList(params);
      this.logger.info("获取城市影院列表返回", res);
      let cityCinemaList = res.data || [];
      if (!cityCinemaList?.length) {
        this.logger.errorSave("获取城市影院列表为空");
        return;
      }
      return cityCinemaList.map(item => ({
        ...item,
        cityName: item.cityInfoDTO?.cityName,
        cinemaList: item.cinemaResultDTOList
      }));
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", formatErrInfo(error));
    }
  }

  // 获取目标城市影院列表
  getTargetCityCinemas(cityCinemaList, cityName) {
    return (
      cityCinemaList.find(item => item.cityName.includes(cityName))
        ?.cinemaList || []
    );
  }

  // 获取目标影院
  getTargetCinemaInfo(cityName, cinemaList, cinemaName, cinemaCode) {
    let targetCinema = cinemaList.find(item => item.cinemaCode === cinemaCode);
    if (!targetCinema) {
      targetCinema = getTargetCinema(
        cinemaName,
        cinemaList,
        this.appFlag,
        cityName
      );
    }
    return targetCinema;
  }

  // 获取目标影片信息
  getTargetMovie(movieData, filmName) {
    // 全字匹配
    let movieInfo = movieData.find(item => item.filmName === filmName);
    if (!movieInfo) {
      // 特殊处理后匹配
      movieInfo = movieData.find(
        item =>
          convertFullwidthToHalfwidth(item.filmName) ===
          convertFullwidthToHalfwidth(filmName)
      );
      if (!movieInfo) {
        // 模糊匹配
        this.logger.warn("获取目标影片信息失败", { movieData, filmName });
        let targetFilmList = movieData.map(item => {
          return {
            ...item,
            ...findMostRepeatedChars(item.filmName, filmName)
          };
        });
        targetFilmList = targetFilmList.sort(
          (a, b) => b.similarity - a.similarity
        );
        // 必须有4个重复字符才采用模糊匹配结果
        if (targetFilmList[0]?.totalRepeated >= 4) {
          movieInfo = targetFilmList[0];
        }
      }
    }
    return movieInfo;
  }

  // 影院指定卡相关处理(根据可用卡调整登录信息顺序)
  async cinemaLinkCardHandle(cinemaInfo) {
    const { ticket_num } = this.order;
    try {
      if (cinemaInfo.cinemaId && this.offerRule.offer_type != 1) {
        const usableCards = await this.getUsableCardList(
          cinemaInfo.cinemaId,
          ticket_num
        );
        if (usableCards?.length) {
          cinemaInfo.usableCardList = usableCards; // 赋值可用卡列表
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
        }
        this.logger.infoSave("登录信息按照可用卡列表排序后", {
          currentParamsList: this.currentParamsList
        });
      }
    } catch (error) {
      this.logger.errorSave("影院指定卡相关处理异常", formatErrInfo(error));
    }
  }

  // 获取影院可用会员卡
  async getUsableCardList(cinemaId, ticket_num) {
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
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item => item.app_name === appFlag && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      // 根据可用手机号对卡列表进行过滤
      let cardListByMobile = list.filter(item =>
        useMobileList.includes(item.mobile)
      );
      this.logger.infoSave("根据可用手机号对卡列表进行过滤", {
        useMobileList,
        cardListByMobile
      });

      // 根据当天及当月出票量限制进行过滤
      let cardListLimit = cardListByMobile.filter(item => {
        const { use_limit_day, use_limit_month, daily_usage, month_usage } =
          item;
        if (!use_limit_day && !use_limit_month) return true;
        return (
          (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
          (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
        );
      });
      this.logger.infoSave("根据当天及当月出票量限制对卡列表进行过滤", {
        cardListLimit
      });

      // 根据影院指定卡进行过滤
      let useCanCardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaId);
      });
      this.logger.infoSave("根据制定影院对卡列表进行过滤", {
        useCanCardList
      });
      return useCanCardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", formatErrInfo(error));
    }
  }

  // 获取影院放映信息
  async getMoviePlayInfo({ cinemaCode, cinemaId }) {
    const { appFlag } = this;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        unifiedCode: cinemaCode,
        pageNo: 1,
        pageSize: 1000,
        platForm: 5
      };
      this.logger.info("获取电影放映信息参数", params);
      let res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
      this.logger.infoSave("获取电影放映信息返回", res);

      const movie_data = res.data?.items || [];
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
    const { cinemaCode, cinemaId, filmId, showDate } = cinemaInfo;
    const { appFlag } = this;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        filmId,
        featureDate: showDate,
        updateNode: "date"
      };
      this.logger.info("获取电影放映场次参数", params);
      const res = await APP_API_OBJ[appFlag].getMoviePlayTime(params);
      this.logger.infoSave("获取电影放映场次返回", res);
      const moviePlayTime = res.data?.planList || [];
      if (!moviePlayTime?.length) {
        this.logger.errorSave("获取电影放映场次返回空");
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
      const targetShow = this._findTargetShow(showList);

      if (targetShow) {
        this.logger.infoSave("场次匹配成功", { targetShow });
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
      this.logger.errorSave("未找到匹配场次", { cinemaInfo, showList });
    } catch (error) {
      this.logger.errorSave("场次匹配异常", formatErrInfo(error));
    }
  }

  // 匹配目标场次
  _findTargetShow(showList) {
    const { hall_name, show_time } = this.order;
    const MIN_SIMILARITY_THRESHOLD = 3;
    let targetShowList = showList.filter(item => item.startTime === show_time);

    if (targetShowList.length === 0) return;
    if (targetShowList.length === 1) return targetShowList[0];

    // 多场次按厅名相似度排序
    targetShowList = targetShowList.map(item => ({
      ...item,
      ...findMostRepeatedChars(item.hallName, hall_name)
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
}
