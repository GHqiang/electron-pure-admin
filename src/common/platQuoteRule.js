// 「是否由平台报价」判定（纯函数、无 store 依赖，便于单测）
//
// 背景：报价守卫（BaseOfferPrice.getEndOfferPrice）与规则匹配阶段的「原价不报」过滤
// 必须使用同一份判定，否则会出现：
// - 过滤层把由平台报价的规则剔除 → 本地记「规则为空」，平台仍照报（错位 + 统计噪音）；
// - 平台报价时段外（平台不报、本地算价）时，过滤因条件不一致而不生效。
export const isPlatQuotedRule = ({
  plat_name,
  offerRule,
  dictInfo,
  offerToPlatTimeOk = true
}) => {
  const fixedOfferToPlatList = dictInfo?.fixedOfferToPlatList?.split(",") || [];
  return (
    fixedOfferToPlatList.includes(plat_name) &&
    offerRule?.offerType === "1" &&
    offerToPlatTimeOk &&
    offerRule?.platOfferList?.find(item => item.platName === plat_name)
      ?.isSyncPlat == 1
  );
};
