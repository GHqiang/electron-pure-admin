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
export const useCinemaCodeMatchList = defineStore("cinemaCodeMatchList", {
  state: () => {
    return {
      items: []
    };
  },
  actions: {
    // 设置规则列表
    setCinemaCodeMatchList(list) {
      console.warn(`设置影院映射列表信息`, list);
      this.items = list;
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
    cinemaCodeMatchList(state) {
      return state.items;
    }
  }
});

// 每次优先从localStorage里获取
let yangCongCinemaList = window.localStorage.getItem("yangCongCinemaList");
if (yangCongCinemaList) {
  yangCongCinemaList = JSON.parse(yangCongCinemaList);
}
// 洋葱影院列表
export const useYangcongCinemaList = defineStore("yangcongCinemaList", {
  state: () => {
    return {
      items: yangCongCinemaList || []
    };
  },
  actions: {
    // 设置规则列表
    setYangcongCinemaList(list) {
      console.warn(`设置洋葱平台影院列表信息`, list);
      this.items = list;
      window.localStorage.setItem("yangCongCinemaList", JSON.stringify(list));
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
    yangcongCinemaList(state) {
      return state.items;
    }
  }
});
