// useCinemaBaseFun.js (组合式函数)
import { APP_API_OBJ } from "@/common/index.js";
import { computed } from "vue";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GET_JINYI_LIST,
  GET_APP_INFO
} from "@/common/constant";

import { getCinemaLoginInfoList, mockDelay } from "@/utils/utils";

// 影院相关方法接口
export default function useCinemaBaseFun() {
  const UME_LIST = computed(() => GET_UME_LIST());
  const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
  const CHENXING_LIST = computed(() => GET_CHENXING_LIST());
  const FENGHUANG_LIST = computed(() => GET_FENGHUANG_LIST());
  const JINYI_LIST = computed(() => GET_JINYI_LIST());

  let cityCinemaList = []; // 城市影院列表（仅特殊影院有值）

  // 获取全部城市列表
  const getCityList = async app_name => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      let list;
      if (UME_LIST.value.includes(app_name)) {
        // 传参固定值可能有潜在风险
        let params = {
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            cinemaCode: "32012801",
            cinemaLinkId: "15946"
          }
        };
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res.data || [];
        list = cityCinemaList.map(item => ({
          city_name: item.cityName,
          city_id: item.cityCode
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        let params = {
          empCode: "",
          leaseCode: ""
        };
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res.bizValue?.cities || [];
        list = cityCinemaList.map(item => ({
          city_name: item.cityName,
          city_id: item.cityCode
        }));
      } else if (FENGHUANG_LIST.value.includes(app_name)) {
        let params = {};
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res.cityCinemas || [];
        list = cityCinemaList.map(item => ({
          city_name: item.cityName,
          city_id: item.cityCode
        }));
      } else if (JINYI_LIST.value.includes(app_name)) {
        let params = {};
        const res = await cinemaApi.getCinemaList(params);
        cityCinemaList = res?.data?.normal || [];
        list = cityCinemaList.map(item => ({
          city_name: item.city_name,
          city_id: item.city_id
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let params = {};
        const res = await cinemaApi.getCinemaList(params);
        let api_version = GET_APP_INFO(app_name)?.api_version || "";
        if (api_version === "3.0C") {
          cityCinemaList = res.data || [];
          list = cityCinemaList.map(item => ({
            city_name: item.cityInfoDTO.cityName,
            city_id: item.cityInfoDTO.cityCode
          }));
        } else if (api_version === "C") {
          cityCinemaList = res.data?.resultDOList || [];
          list = cityCinemaList.map(item => ({
            city_name: item.cityInfo.chName,
            city_id: item.cityInfo.id
          }));
        }
      } else if (app_name === "lma") {
        const res = await cinemaApi.getCityList();
        list = res.data.list || [];
        list = list.map(item => ({
          city_name: item.city_name,
          city_id: item.city_id
        }));
      } else if (app_name === "wanda") {
        const res = await cinemaApi.getCityList();
        list = res?.data?.city || [];
        list = list.map(item => ({
          city_name: item.name,
          city_id: item.id
        }));
      } else {
        // sfc系列
        const res = await cinemaApi.getCityList({});
        list = res?.data?.all_city || [];
        list = list.map(item => ({
          city_name: item.name,
          city_id: item.id
        }));
      }
      console.log("获取城市列表返回", list);
      return list;
    } catch (error) {
      console.warn("获取城市列表异常", error);
    }
  };

  // 获取全部影院列表
  const getAllCinemaList = async (app_name, cityList) => {
    try {
      let allCinemaList = [];
      for (let index = 0; index < cityList.length; index++) {
        const item = cityList[index];
        let list = await getCinemaListByCityId(app_name, item.city_id);
        // 卢米埃/万达：数据自带 city_id，用 cityList 查找真实城市名称
        list = list.map(itemA =>
          app_name === "lma" || app_name === "wanda"
            ? {
                ...itemA,
                city_name:
                  cityList.find(city => city.city_id === itemA.city_id)
                    ?.city_name ||
                  itemA.city_name ||
                  ""
              }
            : {
                ...itemA,
                city_name: item.city_name,
                city_id: item.city_id
              }
        );
        if (list.length > 0) {
          allCinemaList = allCinemaList.concat(list);
        }
        // 卢米埃/万达：一次获取全量影院，无需继续遍历
        if (app_name === "lma" || app_name === "wanda") {
          break;
        }
      }
      return allCinemaList;
    } catch (error) {
      console.warn("获取全部影院列表异常", error);
    }
  };

  // 根据城市获取影院列表
  const getCinemaListByCityId = async (
    app_name,
    city_id,
    forceRealCity = false
  ) => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      console.log("根据城市获取影院列表", app_name, city_id);
      let cinemaList = [];
      if (UME_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.cityCode === city_id)?.cinemaList ||
          [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinemaCode,
          cinema_name: item.cinemaName,
          cinema_code: item.cinemaCode //同步影院code时使用
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.cityCode === city_id)?.cinemas || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinemaLinkId,
          cinema_name: item.cinemaName,
          cinema_code: "" //同步影院code时使用
        }));
      } else if (FENGHUANG_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.cityCode === city_id)?.cinemas || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinemaLinkId,
          cinema_name: item.cinemaName,
          cinema_code: "" //同步影院code时使用
        }));
      } else if (JINYI_LIST.value.includes(app_name)) {
        cinemaList =
          cityCinemaList.find(item => item.city_id === city_id)?.cinemas || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinema_id,
          cinema_name: item.cinema_name,
          cinema_code: item.cinema_code //同步影院code时使用
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let api_version = GET_APP_INFO(app_name)?.api_version || "";
        if (api_version === "3.0C") {
          cinemaList =
            cityCinemaList.find(item => item.cityInfoDTO.cityCode === city_id)
              ?.cinemaResultDTOList || [];
          cinemaList = cinemaList.map(item => ({
            ...item,
            cinema_id: item.cinemaCode,
            cinema_name: item.cinemaName,
            cinema_code: item.cinemaCode //同步影院code时使用
          }));
        } else if (api_version === "C") {
          cinemaList =
            cityCinemaList.find(item => item.cityInfo.id === city_id)
              ?.cinemas || [];
          cinemaList = cinemaList.map(item => ({
            ...item,
            cinema_id: item.unifiedCode,
            cinema_name: item.name,
            cinema_code: item.unifiedCode //同步影院code时使用
          }));
        }
      } else if (app_name === "lma") {
        // 卢米埃：接口返回全量影院（见 src/data/lma-cinema.js），每条自带 city_id、cinema_id，直接沿用
        const res = await cinemaApi.getCinemaList(city_id);
        cinemaList = res.data.list || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.cinema_id,
          cinema_name: item.cinema_name,
          city_id: item.city_id,
          cinema_code: ""
        }));
      } else if (app_name === "wanda") {
        // 调后端映射接口，一次获取全量影院+城市信息
        const res = await cinemaApi.getCinemaListWithCity();
        cinemaList = res?.data?.cinemaInfoList || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.storeId,
          cinema_name: item.cinemaName,
          city_id: item.city_id,
          city_name: item.city_name,
          cinema_code: "" //同步影院code时使用
        }));
      } else {
        // sfc系列
        const res = await cinemaApi.getCinemaList({ city_id });
        cinemaList = res.data?.cinema_data || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinema_id: item.id,
          cinema_name: item.name,
          cinema_code: "" //同步影院code时使用
        }));
      }
      console.log("根据城市获取影院列表", cinemaList);
      return cinemaList;
    } catch (error) {
      console.warn("根据城市获取影院列表异常", error);
    }
  };

  // 获取线上电影列表
  const getFilmList = async (app_name, oneCity, oneCinema) => {
    const cinemaApi = APP_API_OBJ[app_name];
    try {
      let list = [];
      if (UME_LIST.value.includes(app_name)) {
        const params = {
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            cinemaCode: oneCinema.cinemaCode,
            cinemaLinkId: oneCinema.cinemaLinkId
          }
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        list =
          res.data?.find(item => item.showStatus === "SHOWING")?.fimlList || [];
        list = list.map(item => ({
          ...item,
          film_id: item.filmHeadId,
          film_name: item.filmName
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        const params = {
          empCode: "",
          leaseCode: "",
          cinemaLinkId: oneCinema.cinemaLinkId,
          posterSize: "SMALL"
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        list = res?.bizValue || [];
        list = list.map(item => ({
          ...item,
          film_id: item.filmId,
          film_name: item.filmName
        }));
      } else if (FENGHUANG_LIST.value.includes(app_name)) {
        const params = {
          cinemaLinkId: oneCinema.cinemaLinkId
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        const hotFilms = res?.hotFilms || [];
        let soonFilms = res?.soonFilms || [];
        soonFilms = soonFilms
          .map(item => item.films)
          .flat()
          .filter(item => item.saleType === "P");
        list = [...hotFilms, ...soonFilms];
        list = list.map(item => ({
          ...item,
          film_id: item.filmId,
          film_name: item.filmName
        }));
      } else if (JINYI_LIST.value.includes(app_name)) {
        const params = {
          cinema_id: oneCinema.cinema_id
        };
        const res = await cinemaApi.getMoviePlayInfo(params);
        list = res?.data || [];
        list = list.map(item => ({
          ...item,
          film_id: item.movie_id,
          film_name: item.name
        }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let api_version = GET_APP_INFO(app_name)?.api_version || "";
        const params = {
          cinemaCode: oneCinema.cinemaCode,
          cinemaId: oneCinema.cinemaId,
          pageNo: 1,
          pageSize: 1000,
          platForm: 5
        };
        if (api_version === "C") {
          params.cinemaCode = oneCinema.unifiedCode;
        }
        const res = await cinemaApi.getMoviePlayInfo(params);
        if (api_version === "3.0C") {
          list = res?.data?.items || [];
          list = list.map(item => ({
            ...item,
            film_id: item.id,
            film_name: item.filmName
          }));
        } else if (api_version === "C") {
          list = res?.data?.hitFilmResultDOList || [];
          list = list.map(item => ({
            ...item,
            film_id: item.id,
            film_name: item.name
          }));
        }
      } else if (app_name === "lma") {
        const res = await cinemaApi.getMoviePlayInfo({
          cinema_id: oneCinema.cinema_id
        });
        list = res.data.film || [];
        list = list.map(item => ({
          ...item,
          film_id: item.film_code,
          film_name: item.title
        }));
      } else if (app_name === "wanda") {
        const res = await cinemaApi.getMoviePlayInfo({
          cityId: oneCity.city_id
        });
        list = res?.data?.movie_data || [];
        list = list.map(item => ({
          ...item,
          film_id: item.film_id,
          film_name: item.film_name
        }));
      } else {
        // sfc系列
        const params = {
          city_id: oneCity.city_id,
          cinema_id: oneCinema.cinema_id,
          width: "240",
          movie_page_num: "1"
        };
        const res = await cinemaApi.getMovieList(params);
        list = res.data?.movie_data || [];
        list = list.map(item => ({
          ...item,
          film_id: item.id,
          film_name: item.movie_name
        }));
      }
      console.log("获取线上电影列表返回", list);
      return list.reduce((prev, item) => {
        if (prev.some(p => p.film_id == item.film_id)) return prev;
        return [...prev, item];
      }, []);
    } catch (error) {
      console.warn("获取线上电影列表异常", error);
    }
  };

  // 获取会员卡
  const getCardListByApp = async (
    app_name,
    phone,
    session_id,
    index,
    abnormalLoginInfoList = [] // 登录异常的会员卡列表(无太大用)
  ) => {
    let params = {};
    let cardList = [];
    if (!session_id) {
      let loginInfoList = getCinemaLoginInfoList().filter(
        itemA => itemA.app_name == app_name && itemA.mobile == phone
      );
      session_id = loginInfoList[0]?.session_id;
    }
    try {
      if (UME_LIST.value.includes(app_name)) {
        params.params = {
          status: "CAN_USED",
          channelCode: "QD0000001",
          sysSourceCode: "YZ001"
          // cinemaCode: "11015502",
          // cinemaLinkId: "15953"
        };
        params.session_id = session_id;
      } else if (H5_UME_LIST.value.includes(app_name)) {
        params = {
          cinemaLinkId: GET_APP_INFO(app_name)?.cinemaLinkId,
          pageNo: 1,
          pageSize: 30,
          umeToken: session_id
        };
      } else if (FENGHUANG_LIST.value.includes(app_name)) {
        params = {
          cinemaLinkId: GET_APP_INFO(app_name)?.cinemaLinkId,
          pageNumber: 1,
          pageSize: 20,
          pageInit: false,
          fenghuangToken: session_id
        };
      } else if (JINYI_LIST.value.includes(app_name)) {
        params = {
          cinema_id: GET_APP_INFO(app_name)?.cinemaLinkId,
          session_id
        };
      } else if (CHENXING_LIST.value.includes(app_name)) {
        params = {
          session_id
        };
      } else if (app_name === "lma") {
        params.lmaToken = session_id;
      } else {
        params.session_id = session_id;
      }
      await mockDelay(H5_UME_LIST.value.includes(app_name) ? 1 : 0.01);
      if (index % 8) {
        await mockDelay(1);
      }
      let res =
        await APP_API_OBJ[app_name][
          app_name == "hbchyxd" ? "getCardAndQuanList" : "getCardList"
        ](params);
      // console.warn("获取会员卡列表返回", res);
      // 只获取有效卡，无效卡要过滤掉
      if (UME_LIST.value.includes(app_name)) {
        cardList = res.data || [];
        cardList = cardList.filter(item => item.cardStatus === "ENABLED");
        cardList = cardList.map(item => ({
          card_id: item.cardInstanceId + "",
          card_num: item.cardNo,
          balance: item.cardAmount / 100 + ""
        }));
      } else if (H5_UME_LIST.value.includes(app_name)) {
        cardList = res.bizValue || [];
        cardList = cardList.map(item => ({
          card_id: item.cardNumber,
          card_num: item.cardNumber,
          balance: (item.balance || 0) / 100 + ""
        }));
      } else if (FENGHUANG_LIST.value.includes(app_name)) {
        cardList = res.memberCards || [];
        cardList = cardList
          .filter(
            item => item.cardType !== "BENEFIT" && item.cardStatus === "ENABLED"
          )
          .map(item => ({
            card_id: item.cardNo,
            card_num: item.cardNo,
            balance: (item.balance || 0) / 100 + ""
          }));
        // 进行关联影院处理
        cardList = await getCardLinkCinemaListAll({
          cinemaLinkId: params.cinemaLinkId,
          session_id,
          app_name,
          cardList
        });
      } else if (JINYI_LIST.value.includes(app_name)) {
        // cardList = res.data?.solid_card || [];
        let solid_card = res.data?.member_info?.solid_card;
        solid_card = Array.isArray(solid_card)
          ? solid_card
          : solid_card && JSON.stringify(solid_card) !== "{}"
            ? [solid_card]
            : [];
        let virtual_card = res.data?.member_info?.virtual_card;
        virtual_card = Array.isArray(virtual_card)
          ? virtual_card
          : virtual_card && JSON.stringify(virtual_card) !== "{}"
            ? [virtual_card]
            : [];
        cardList = [...solid_card, ...virtual_card];
        console.log("cardList", cardList);
        cardList = cardList
          .filter(item => item.card_status === "USABLE")
          .map(item => ({
            card_id: item.card_id,
            card_num: item.card_no_show,
            balance: (item.card_balance || 0) + ""
          }));
      } else if (CHENXING_LIST.value.includes(app_name)) {
        let api_version = GET_APP_INFO(app_name)?.api_version || "";
        if (api_version === "3.0C") {
          cardList = res.data || [];
          cardList = cardList.map(item => ({
            card_id: item.cardNo,
            card_num: item.cardNo,
            balance: (item.amount || 0) + ""
          }));
        } else if (api_version === "C") {
          cardList = res.data?.datalist || [];
          cardList = cardList.map(item => ({
            card_id: item.cardNo,
            card_num: item.cardNo,
            balance: (item.amount || 0) + ""
          }));
        }
      } else if (app_name === "lma") {
        // 卢米埃只获取主卡，其它的出票后更新卡余额
        cardList = res.data?.sleep || [];
        cardList.unshift({
          card_number: res.data.card_number,
          balance: res.data.money_str
          // is_main_card: 1
        });
        cardList = cardList.map(item => ({
          card_id: item.card_number + "",
          card_num: item.card_number,
          balance: item.balance
          // is_main_card: item.is_main_card
        }));
        const card_list = await getLmaOtherCardBalance(cardList, session_id);
        cardList = card_list;
      } else {
        // sfc系列
        if (app_name === "hbchyxd") {
          let member_info = res?.data?.member_info;
          cardList = [];
          if (member_info) {
            cardList.push({
              card_id: member_info.member_id,
              card_num: member_info.member_id,
              balance: member_info.balance
            });
          }
        } else {
          cardList = res.data?.card_data || [];
          cardList = cardList
            .filter(item => item.card_status === "1")
            .map(item => {
              return {
                card_id: item.id + "", // 卡id
                card_num: item.card_num, // 卡号
                balance: item.balance + "", // 卡余额
                cinema_name: item.cinema_name // 卡关联影院
              };
            });
        }
      }
      console.warn(app_name + "——获取会员卡列表返回的cardList", cardList);
      cardList = cardList.map(item => ({
        ...item,
        app_name,
        mobile: phone
      }));
      return cardList;
    } catch (err) {
      console.warn(app_name + "——获取会员卡列表异常", err, params, app_name);
      abnormalLoginInfoList.push({
        app_name,
        mobile: phone,
        session_id
      });
      return [];
    }
  };
  window.getCardListByApp = getCardListByApp;

  // 会员卡关联影院处理
  const getCardLinkCinemaListAll = async ({
    cinemaLinkId,
    session_id,
    app_name,
    cardList
  }) => {
    try {
      for (let i = 0; i < cardList.length; i++) {
        const linkCinemaIds = await getCardLinkCinemaList({
          cinemaLinkId,
          cardNo: cardList[i].card_num,
          fenghuangToken: session_id,
          app_name
        });
        // console.log("linkCinemaIds", linkCinemaIds);
        if (linkCinemaIds) {
          cardList[i].linkCinemaIds = linkCinemaIds;
        }
      }
      return cardList;
    } catch (error) {
      return cardList;
    }
  };

  // 获取卡适用影院
  const getCardLinkCinemaList = async ({
    cinemaLinkId,
    cardNo,
    fenghuangToken,
    app_name
  }) => {
    try {
      const res = await APP_API_OBJ[app_name].getCardDetail({
        cinemaLinkId,
        cardNo,
        fenghuangToken
      });
      const availableCinemas = res.availableCinemas || [];
      // console.log("availableCinemas1", availableCinemas);
      return availableCinemas
        .map(item => item.cinemaLinkId)
        .filter(item => item)
        .join(",");
    } catch (error) {
      console.error("获取卡适用影院异常", error);
    }
  };
  // 卢米埃获取其它卡余额
  const getLmaOtherCardBalance = async (cardList, session_id) => {
    let card_list = JSON.parse(JSON.stringify(cardList));
    for (let index = 1; index < card_list.length; index++) {
      const item = card_list[index];
      const changeCardRes = await changeCardHandle({
        card_number: item.card_num,
        lmaToken: session_id
      });
      if (!changeCardRes?.error) {
        item.balance = changeCardRes?.data?.money_str || "0";
      }
    }
    // 再切换为主卡
    await changeCardHandle({
      card_number: card_list[0].card_num,
      lmaToken: session_id
    });
    return card_list;
  };

  // 卢米埃切换卡
  const changeCardHandle = async ({ card_number, lmaToken }) => {
    try {
      let params = {
        card_number,
        lmaToken
      };
      console.log("切换卡参数", params);
      const res = await APP_API_OBJ["lma"].changeCard(params);
      console.log("切换卡返回", res);
      return res;
    } catch (error) {
      console.error("切换卡异常", error);
      return {
        error
      };
    }
  };

  return {
    getCityList,
    getAllCinemaList,
    getCinemaListByCityId,
    getFilmList,
    getCardListByApp
  };
}
