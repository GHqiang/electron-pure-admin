// 卡券使用模块（适配所有影院）
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
export default class CardQuan {
  constructor(order, logger, isTestOrder, offerRule, currentParamsList) {
    this.order = order;
    this.appFlag = order.app_name;
    this.offerRule = offerRule;
    this.logger = logger;
    this.currentParamsList = currentParamsList;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  // 使用优惠券或会员卡（核心方法）
  async useQuanOrCard({ offerRule, handlingFee, rewards, appFlag, plat_name }) {
    try {
      const { supplier_end_price, ticket_num, plat_name } = this.order;
      
      // 1、获取卡券列表
      let cardList = await this.getCardList(cardParams);
      let quanList = await this.getQuanList(quanParams);
      // 2、按报价规则用卡用券
      const {
        offer_type,
        member_price, // 成本价
        offer_rule_id
      } = this.offerRule;
      let is_auto_use_quan = false; // 是否灵活用券
      let useCardParms = {
        cardList,
        member_price, // 成本价
        handlingFee,
        rewards,
        supplier_end_price,
        ticket_num,
        plat_name
      };
      if (offer_type !== "1") {
        const ruleInfo = getOfferRuleById(offer_rule_id);
        if (ruleInfo) {
          const { autoUseQuanStatus, autoUseQuanPrice, auto_quan_value } =
            ruleInfo;
          if (
            autoUseQuanStatus === "1" &&
            supplier_end_price > autoUseQuanPrice &&
            auto_quan_value
          ) {
            is_auto_use_quan = true;
            offerRule.quan_value = auto_quan_value;
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "灵活用券条件生效，重置报价规则里的券类型为灵活用券类型",
              level: "info",
              info: {
                autoUseQuanStatus,
                supplier_end_price,
                autoUseQuanPrice,
                auto_quan_value
              }
            });
          }
        }
        if (!is_auto_use_quan) {
          console.log(conPrefix + "使用会员卡出票");
          return await this.useCardHandle(useCardParms);
        }
      }
      if (offerRule.offer_type == "1" || is_auto_use_quan) {
        console.log(conPrefix + "使用优惠券出票");
        if (is_auto_use_quan) {
          const quanInfo = await this.getQuanInfo(
            offerRule.quan_value,
            appFlag
          );
          offerRule.quan_id = quanInfo?.id;
          offerRule.quan_cost = quanInfo?.quan_cost;
          offerRule.quan_flag = quanInfo?.quan_flag;
          offerRule.quan_fee = quanInfo?.quan_fee;
          offerRule.is_store = quanInfo?.is_store;
          offerRule.black_quans = quanInfo?.black_quans;
        }
        let { quan_value, quan_cost, quan_flag, quan_fee, black_quans } =
          offerRule;
        // 根据券标识获取目标券
        let targetQuanList = quanList.filter(
          item =>
            couponInfoSpecial(item.couponName) === couponInfoSpecial(quan_flag)
        );
        // 增加已用完过滤，防止核销延迟导致用券失败
        const usedQuanList = await this.queryUsedQuanList({
          quan_value: offerRule.quan_value,
          app_name: appFlag
        });
        // 最近用券记录过滤
        if (usedQuanList?.length) {
          targetQuanList = targetQuanList.filter(
            item =>
              !usedQuanList.some(itemA =>
                itemA.quan_code?.includes(item.couponCode)
              )
          );
        }
        // 券黑名单过滤
        if (black_quans) {
          targetQuanList = targetQuanList.filter(
            item => !black_quans?.includes(item.couponCode)
          );
        }
        // 优先使用快过期的券
        targetQuanList = targetQuanList.sort(
          (a, b) => +new Date(a.endDateTime) - new Date(b.endDateTime)
        );
        // 更新券库存
        this.updateQuanStock({
          quan_stock: targetQuanList.length,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
        if (targetQuanList.length < ticket_num) {
          console.warn(conPrefix + "优惠券不够用");
          console.error(
            conPrefix + `${quan_value} 面额券不足，不支持从服务端同步获取`
          );
          if (is_auto_use_quan) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "灵活用券时获取目标券不足,转用卡处理",
              level: "info"
            });
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuans: []
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map((item, index) => {
          let seatCode = Object.keys(item.discountAmountMap);
          let discountAmount = 0;
          if (seatCode) {
            discountAmount = item.discountAmountMap?.[seatCode[index]];
            if (
              discountAmount &&
              Object.prototype.toString.call(discountAmount) ===
                "[object Object]" &&
              discountAmount[1]
            ) {
              discountAmount = discountAmount[1];
            }
          }
          return {
            couponInstanceId: item.couponInstanceId,
            couponType: item.templateType,
            // 以下两个值一样
            seatCode: seatCode[index],
            salesKeySku: seatCode[index],
            couponCode: item.couponCode,
            couponName: item.couponName,
            templateCode: item.templateCode,
            discountAmount
          };
        });
        let profit =
          supplier_end_price -
          quan_cost -
          (Number(supplier_end_price) * 100) / 10000;
        profit = Number(profit) * Number(ticket_num);
        if (rewards > 0) {
          // 特急奖励订单中标价格 * 张数 * 0.04;
          let rewardPrice =
            (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
            10000;
          profit += rewardPrice;
        }
        profit = Number(profit).toFixed(2);
        if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
          console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `使用优惠券后最终利润为负${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
            level: "error",
            info: {
              profit
            }
          });
          if (is_auto_use_quan) {
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuans: []
          };
        }
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.cardAmount >= quan_fee * 100 * ticket_num
          );
          if (!cardData?.length) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: `使用优惠券后发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
              level: "error",
              info: {
                quan_fee,
                cardList
              }
            });
            if (is_auto_use_quan) {
              offerRule.quan_value = "";
              return await this.useCardHandle(useCardParms);
            }
            return {
              useQuan: [],
              card_id: "",
              profit: 0 // 利润
            };
          }
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          useQuan,
          quanStock: targetQuanList.length,
          profit
        };
      }
    } catch (error) {
      console.error("使用会员卡或优惠券报错", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用会员卡或优惠券报错",
        level: "error",
        info: {
          error
        }
      });
      // return {}
    }
  }
  // 获取会员卡列表
  async getCardList(params) {
    try {
      this.logger.infoSave("获取会员卡列表参数", params);
      const res = await this.appApi.getCardList(params);
      this.logger.infoSave("获取会员卡列表返回", res);
      const cardList = res.data || [];
      return cardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡列表异常", error);
      return [];
    }
  }

  // 获取优惠券列表
  async getQuanList(params) {
    // const params = {
    //   cinemaCode,
    //   cinemaId,
    //   defaultCardNo,
    //   couponStatus: 1,
    //   session_id
    // };
    try {
      this.logger.infoSave("获取优惠券列表入参", params);
      const res = await this.appApi.getQuanList(params);
      this.logger.infoSave("获取优惠券列表返回", res);
      const quanList = res.data || [];
      return quanList;
    } catch (error) {
      this.logger.infoSave("获取优惠券列表异常", error);
      return [];
    }
  }
}
