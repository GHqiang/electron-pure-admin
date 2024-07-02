import { defineStore } from "pinia";
let offerRuleList = window.localStorage.getItem("offerRuleList");
if (offerRuleList) {
  offerRuleList = JSON.parse(offerRuleList);
}
export const useDataTableStore = defineStore("dataTable", {
  state: () => {
    return {
      items: offerRuleList || []
    };
  },
  actions: {
    // 设置规则列表
    setRuleList(list) {
      console.warn(`设置影报价规则信息`, list);
      this.items = list;
      window.localStorage.setItem("offerRuleList", JSON.stringify(list));
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
  }
});
