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
    },
    // 获取影院标识
    getCinemaAppFlag({
      cinema_code: plat_cinema_code,
      cinema_name: plat_cinema_name
    }) {
      let targetCinema = this.items.find(
        item => item.plat_cinema_code === plat_cinema_code
      );
      if (!targetCinema) {
        targetCinema = this.items.find(item =>
          item.plat_cinema_name?.split("#").includes(plat_cinema_name.trim())
        );
      }
      return targetCinema?.app_name;
    },
    // 获取影院映射信息
    getCinemaMatchInfo(plat_cinema_code, app_name) {
      return this.items.find(
        item =>
          plat_cinema_code &&
          app_name &&
          item.plat_cinema_code === plat_cinema_code &&
          item.app_name === app_name
      );
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
    },
    // 获取影院code
    getCinemaCode(cinemaName) {
      return this.items.find(item => item.cinemaName === cinemaName)
        ?.cinemaCode;
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
    yangcongCinemaList(state) {
      return state.items;
    }
  }
});
