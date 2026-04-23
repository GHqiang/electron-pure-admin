import svApi from "@/api/sv-api";
import lierenApi from "@/api/lieren-api";
import { getCurrentTime, sendWxPusherMessage } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();
// 机器相关方法接口
export default function useLierenOfferRuleSyncFun() {
  const {
    userInfo: { rule }
  } = platTokens();

  // 同步规则到猎人平台（新增/修改）
  const lierenOfferRuleSyncPlat = async ruleInfo => {
    let params;

    try {
      let lierenOffer = ruleInfo.platOfferList.find(
        item => item.platName === "lieren"
      );
      let lierenOfferRule = {
        ...ruleInfo,
        offerAmount: lierenOffer.value,
        platRuleId: lierenOffer.platRuleId,
        platOfferList: undefined
      };

      let city = lierenOfferRule.includeCityNames;
      if (city) {
        city = JSON.parse(city).join(",").replaceAll("市", "");
      }
      let exclude_city = lierenOfferRule.excludeCityNames;
      if (exclude_city) {
        exclude_city = JSON.parse(exclude_city).join(",").replaceAll("市", "");
      }

      let film = lierenOfferRule.includeFilmNames;
      if (film) {
        film = JSON.parse(film).join(",");
      }
      let exclude_film = lierenOfferRule.excludeFilmNames;
      if (exclude_film) {
        exclude_film = JSON.parse(exclude_film).join(",");
      }

      let hall = lierenOfferRule.includeHallNames;
      if (hall) {
        hall = JSON.parse(hall).join(",");
      }
      let exclude_hall = lierenOfferRule.excludeHallNames;
      if (exclude_hall) {
        exclude_hall = JSON.parse(exclude_hall).join(",");
      }

      let lierenMainAccountAkSk = dictStore.dictInfo.lierenMainAccountAkSk;
      if (lierenMainAccountAkSk) {
        lierenMainAccountAkSk = JSON.parse(lierenMainAccountAkSk);
        lierenMainAccountAkSk = lierenMainAccountAkSk[rule] || [];
      }

      params = {
        rule_id: lierenOfferRule.platRuleId,
        name: lierenOfferRule.ruleName,
        cinema_group: lierenOfferRule.cinema_group || "", // 院线，多个院线可用“,”号分隔；没有传空
        cinema_code: lierenOfferRule.cinema_code || "", // 包含影院专资，多个可用“,”号分隔；没有传空
        exclude_cinema_code: lierenOfferRule.exclude_cinema_code || "", // 排除影院专资，多个可用“,”号分隔；没有传空
        province: lierenOfferRule.province || "", // 包含省份，多个可用“,”号分隔；没有传空
        city: city || "", // 包含城市，多个可用“,”号分隔；没有传空
        exclude_city: exclude_city || "", // 排除城市，多个可用“,”号分隔；没有传空
        film: film || "", // 影片名称，多个可用“,”号分隔；没有传空
        exclude_film: exclude_film || "", // 排除影片名称，多个可用“,”号分隔；没有传空
        hall: hall || "", // 影厅名称，多个可用“,”号分隔；没有传空
        exclude_hall: exclude_hall || "", // 排除影厅名称，多个可用“,”号分隔；没有传空
        min_price: lierenOfferRule.min_price || 10, // 最低价，单位分；没有传默认为0
        max_price: lierenOfferRule.max_price || 500, // 最高价，单位分；没有传默认为500
        sum_mode: lierenOfferRule.offerType == 1 ? 2 : 4, //  2-固定价（价格值为30时，即报价30）》 3-市场价减价（市场35，价格值为5时35-5=30）》 4-会员价加减（需要报价时提交会员价，价格值为3时，会员价+3。价格值为-3时，会员价-3）
        price: Number(lierenOfferRule.offerAmount), // 固定价格或者加减价格
        state: ruleInfo.status == "1" ? 1 : 0, // 规则状态，1-启用，0-禁用
        // attach_price: 0, // 附加价格，会员价折扣模式报价有效
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("同步规则到猎人平台参数", params);
      const res = await lierenApi.ruleAdd(params);
      console.warn("同步规则到猎人平台成功", res);
      let rule_id = res?.data?.rule_id;
      if (!lierenOfferRule.platRuleId && rule_id) {
        // 编辑规则增加关联平台规则id
        await svApi.updateRuleRecord({
          id: lierenOfferRule.id,
          platOfferList: JSON.stringify(
            ruleInfo.platOfferList.map(item => {
              if (item.platName === "lieren") {
                return { ...item, platRuleId: rule_id };
              }
              return item;
            })
          ),
          update_time: getCurrentTime()
        });
        console.warn("编辑规则-增加关联平台规则id成功");
      }
    } catch (error) {
      console.warn("同步规则到猎人平台异常", error);
    }
  };

  // 同步规则到猎人平台（删除）
  const lierenOfferRuleDelPlat = async platRuleIdList => {
    try {
      let lierenMainAccountAkSk = dictStore.dictInfo.lierenMainAccountAkSk;
      if (lierenMainAccountAkSk) {
        lierenMainAccountAkSk = JSON.parse(lierenMainAccountAkSk);
        lierenMainAccountAkSk = lierenMainAccountAkSk[rule] || [];
      }
      const params = {
        rule_id: platRuleIdList,
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("猎人平台规则删除参数", params);
      const res = await lierenApi.ruleDel(params);
      console.warn("猎人平台规则删除成功", res);
    } catch (error) {
      console.warn("猎人平台规则删除异常", error);
    }
  };

  // 同步规则到猎人平台（启用禁用）
  const lierenOfferRuleEditStatusPlat = async ruleInfo => {
    try {
      let lierenMainAccountAkSk = dictStore.dictInfo.lierenMainAccountAkSk;
      if (lierenMainAccountAkSk) {
        lierenMainAccountAkSk = JSON.parse(lierenMainAccountAkSk);
        lierenMainAccountAkSk = lierenMainAccountAkSk[rule] || [];
      }
      let lierenOffer = ruleInfo.platOfferList.find(
        item => item.platName === "lieren"
      );
      let lierenOfferRule = {
        ...ruleInfo,
        offerAmount: lierenOffer.value,
        platRuleId: lierenOffer.platRuleId,
        platOfferList: undefined
      };
      console.warn("同步到猎人平台的规则", lierenOfferRule);
      const params = {
        rule_id: [lierenOfferRule.platRuleId],
        state: ruleInfo.status == "1" ? 1 : 0,
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("猎人平台规则状态修改参数", params);
      const res = await lierenApi.ruleState(params);
      console.warn("猎人平台规则状态修改成功", res);
    } catch (error) {
      console.warn("猎人平台规则状态修改异常", error);
    }
  };

  // 检查并更新同步到猎人的规则状态
  const checkAndUpdateLierenRuleState = async ruleList => {
    try {
      ruleList = JSON.parse(JSON.stringify(ruleList));
      ruleList = ruleList
        .filter(
          item =>
            item.offerType == 1 &&
            item.allow_offer_time &&
            +new Date(item.allow_offer_time) <= +new Date() &&
            item.platOfferList?.some(
              subItem => subItem.platName === "lieren" && subItem.platRuleId
            )
        )
        .map(item => {
          let lierenOffer = item.platOfferList.find(
            item => item.platName === "lieren"
          );
          return {
            ...item,
            ...lierenOffer
          };
        });

      let lierenMainAccountAkSk = dictStore.dictInfo.lierenMainAccountAkSk;
      if (lierenMainAccountAkSk) {
        lierenMainAccountAkSk = JSON.parse(lierenMainAccountAkSk);
        lierenMainAccountAkSk = lierenMainAccountAkSk[rule] || [];
      }

      const platRuleIdList = ruleList.map(item => item.platRuleId);
      if (!platRuleIdList.length) return;

      const lierenRuleRes = await lierenApi.ruleList({
        rule_id: platRuleIdList,
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      });
      const lierenRuleList = lierenRuleRes?.data || [];
      console.warn("同步到猎人平台需启用的规则列表", lierenRuleList);

      // 针对应该重新启用的规则，启用规则并同步到平台
      lierenRuleList
        .filter(item => item.state == 0)
        .forEach(item => {
          const params = {
            rule_id: item.rule_id,
            state: 1,
            lieren_ak: lierenMainAccountAkSk?.[0] || "",
            lieren_sk: lierenMainAccountAkSk?.[1] || ""
          };
          // console.log("启用规则入参", params);
          lierenApi.ruleState(params);
        });
    } catch (error) {
      console.warn("检查并更新同步到猎人的规则状态异常", error);
    }
  };
  return {
    lierenOfferRuleSyncPlat, // 同步规则到猎人平台（新增/修改）
    lierenOfferRuleDelPlat, // 同步规则到猎人平台（删除）
    lierenOfferRuleEditStatusPlat, // 同步规则到猎人平台（启用禁用）
    checkAndUpdateLierenRuleState // 检查并更新同步到猎人的规则状态
  };
}
