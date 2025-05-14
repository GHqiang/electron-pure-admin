import {
  getCurrentTime,
  formatTimeOfTime,
  convertFullwidthToHalfwidth,
  getTargetCinema,
  mockDelay, // 模拟延时
  logUpload, // 日志上传
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  findMostRepeatedChars,
  couponInfoSpecial
} from "@/utils/utils";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
export default class CinemaInfo {
  constructor(order, logger, isTestOrder, offerRule, currentParamsList) {
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
      // 2、获取目标城市影院列表
      let cinemaList =
        cityCinemaList?.find(item => item.cityName.includes(city_name))
          ?.cinemaList || [];
      if (!cinemaList?.length) {
        this.logger.errorSave("获取目标城市影院列表失败", {
          city_name,
          cityCinemaList
        });
        return;
      }
      // 3、获取目标影院
      let targetCinema = cinemaList.find(
        item => item.cinemaCode === cinema_code
      );
      if (!targetCinema) {
        targetCinema = getTargetCinema(
          cinema_name,
          cinemaList,
          appFlag,
          city_name
        );
      }
      if (!targetCinema) {
        return this.logger.errorSave("根据订单中的影院名称获取目标影院失败", {
          cinema_name,
          cinemaList,
          appFlag,
          city_name
        });
      }
      cinemaInfo.cinemaId = targetCinema.cinemaId; // 赋值影院id
      cinemaInfo.cinemaCode = targetCinema.cinemaCode; // 赋值影院code
      // 4、拿到影院code进行影院指定卡相关处理(获取可用卡列表，根据可用卡调整登录信息顺序)
      await this.cinemaLinkCardHandle(cinemaInfo);
      // 5、获取目标影院放映列表
      const movie_data = await this.getMoviePlayInfo(cinemaInfo);
      if (!movie_data?.length) {
        return;
      }
      // 6、获取目标影片信息
      let movieInfo = movie_data.find(item => item.filmName === film_name);
      if (!movieInfo) {
        movieInfo = movie_data.find(
          item =>
            convertFullwidthToHalfwidth(item.filmName) ===
            convertFullwidthToHalfwidth(film_name)
        );
        if (!movieInfo) {
          this.logger.warn("获取目标影片信息失败", { movie_data, film_name });
          let targetFilmList = movie_data.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.filmName,
              film_name
            );
            return {
              ...item,
              ...repeatedCharsResult
            };
          });
          targetFilmList = targetFilmList.sort(
            (a, b) => b.similarity - a.similarity
          );
          // 必须有4个重复字符才采用模糊匹配结果
          if (targetFilmList[0]?.totalRepeated >= 4) {
            movieInfo = targetFilmList[0];
          } else {
            this.logger.errorSave("获取目标影片信息失败", {
              movie_data,
              film_name
            });
            return;
          }
        }
      }
      // 7、获取影片放映场次
      cinemaInfo.filmId = movieInfo.id;
      cinemaInfo.showDate = show_time.split(" ")[0];
      // 获取某个放映日期的场次列表
      const showList = await this.getMoviePlayTime(cinemaInfo);
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(item => item.startTime == show_time);
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hallName,
            hall_name
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
        this.logger.infoSave("同一时间多场次0", { targetShowList });
      }
      if (!targetShow) {
        this.logger.warn("匹配影片放映场次失败", { showList, show_time });
        this.logger.infoSave("匹配影片放映场次失败,准备获取次日放映场次列表", {
          showList,
          show_time
        });

        const showList1 = await getMoviePlayTime({
          ...cinemaInfo,
          showDate: getPreviousDay(cinemaInfo.showDate)
        });
        // 解决同一时间多场次问题
        let targetShowList = showList1.filter(
          item => item.startTime == show_time
        );
        targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hallName,
              hall_name
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
          this.logger.infoSave("同一时间多场次1", { targetShowList });
        }
        if (!targetShow) {
          return this.logger.errorSave("匹配影片放映场次失败", {
            showList1,
            show_time
          });
        }
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
      cityCinemaList = cityCinemaList.map(item => ({
        ...item,
        cityName: item.cityInfoDTO?.cityName,
        cinemaList: item.cinemaResultDTOList
      }));
      return cityCinemaList;
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", formatErrInfo(error));
    }
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
      const phone = this.currentParamsList[0].mobile;
      this.logger.infoSave(`首次出票手机号-${phone}`);
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

  
}
