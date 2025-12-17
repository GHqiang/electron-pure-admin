import { defineStore } from "pinia";
// 优先从本地缓存里面取
let dictTableList = window.localStorage.getItem("dictTableList");
if (dictTableList) {
  dictTableList = JSON.parse(dictTableList);
}
// 字典表信息
export const dictTable = defineStore("dictTableList", {
  state: () => ({
    dictTableList: dictTableList || []
  }),
  getters: {
    dictInfo: state => {
      let list = state.dictTableList
        .filter(item => item.status === 1)
        .map(item => [item.dict_type, item.dict_value]);
      let info = Object.fromEntries(list);
      console.warn(`字典表信息`, info);
      return info;
    }
  },
  actions: {
    // 设置字典表信息
    setDictTableList(list) {
      console.warn(`设置字典表信息`, list);
      this.dictTableList = list;
      window.localStorage.setItem("dictTableList", JSON.stringify(list));
    }
  }
});

// 名称映射表信息
export const nameMatchTable = defineStore("nameMatchTableList", {
  state: () => ({
    nameList: []
  }),
  getters: {},
  actions: {
    // 设置字典表信息
    setNameMatchTableList(list) {
      console.warn(`设置名称映射表信息`, list);
      this.nameList = list;
    }
  }
});
