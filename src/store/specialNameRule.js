import { defineStore } from "pinia";
let specialNameList = window.localStorage.getItem("specialNameList");
if (specialNameList) {
  specialNameList = JSON.parse(specialNameList);
}
export const useDataTableStoreBySpecialName = defineStore(
  "specialNameDataTable",
  {
    state: () => {
      return {
        items: specialNameList || []
      };
    },
    actions: {
      // 设置规则列表
      setRuleList(list) {
        console.warn(`设置影院特殊匹配列表信息`, list);
        this.items = list;
        window.localStorage.setItem("specialNameList", JSON.stringify(list));
      }
    },
    getters: {
      // 可以添加getters以方便在组件中使用过滤、排序等逻辑
      specialNameList(state) {
        return state.items;
      }
    }
  }
);
