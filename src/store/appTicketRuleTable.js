import { defineStore } from "pinia";

// 每次优先从localStorage里获取
let appQueueRule = window.localStorage.getItem("appQueueRule");
if (appQueueRule) {
  appQueueRule = JSON.parse(appQueueRule);
  appQueueRule = appQueueRule.map(item => ({
    ...item,
    isEnabled: false
  }));
}
export const useAppRuleListStore = defineStore("appRuleList", {
  state: () => ({
    items: appQueueRule || [
      {
        id: 1,
        appName: "sfc",
        getInterval: 2, // 订单获取间隔
        handleInterval: 1, // 订单执行间隔
        isEnabled: false
      },
      {
        id: 2,
        appName: "jiujin",
        getInterval: 2, // 订单获取间隔
        handleInterval: 1, // 订单执行间隔
        isEnabled: false
      },
      {
        id: 3,
        appName: "jinji",
        getInterval: 2, // 订单获取间隔
        handleInterval: 1, // 订单执行间隔
        isEnabled: false
      }
    ],
    newItem: {
      appName: "",
      getInterval: 2,
      handleInterval: 1,
      isEnabled: false
    } // 初始化表单状态
  }),
  actions: {
    // 切换是否启用状态
    toggleEnable(id) {
      const inx = this.items.findIndex(p => p.id === id);
      // console.log("inx", inx);
      if (inx > -1) {
        this.items[inx].isEnabled = !this.items[inx].isEnabled;
      }
      window.localStorage.setItem("appQueueRule", JSON.stringify(this.items));
    },
    // 添加
    addNewItem() {
      const newPlat = {
        id: this.items[this.items.length - 1].id + 1,
        ...this.newItem
      };
      this.items.push(newPlat);
      this.newItem = {
        appName: "",
        getInterval: 2,
        handleInterval: 1,
        isEnabled: false
      }; // 重置表单
      window.localStorage.setItem("appQueueRule", JSON.stringify(this.items));
    },
    // 保存编辑
    saveEdit(newValue) {
      const index = this.items.findIndex(item => item.id === newValue.id);
      // console.log("index", index, newValue);
      if (index > -1) {
        this.items[index] = newValue;
      }
      window.localStorage.setItem("appQueueRule", JSON.stringify(this.items));
    },
    deleteItem(id) {
      // 模拟删除逻辑
      this.items = this.items.filter(item => item.id !== id);
      window.localStorage.setItem("appQueueRule", JSON.stringify(this.items));
    }
  }
});
