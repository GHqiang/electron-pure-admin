import { defineStore } from "pinia";
export const useDataTableStoreBySpecialName = defineStore(
  "specialNameDataTable",
  {
    state: () => {
      return {
        items: []
      };
    },
    actions: {
      // 设置规则列表
      setRuleList(list) {
        console.warn(`设置影院特殊匹配列表信息`, list);
        this.items = list;
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
