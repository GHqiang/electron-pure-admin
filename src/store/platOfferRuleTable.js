import { defineStore } from "pinia";

// 每次优先从localStorage里获取
let platQueueRule = window.localStorage.getItem("platQueueRule");
if (platQueueRule) {
  platQueueRule = JSON.parse(platQueueRule);
  platQueueRule = platQueueRule.map(item => ({
    ...item,
    // platToken: "",
    isEnabled: false
  }));
}
// 平台自动报价
export const usePlatTableDataStore = defineStore("platforms", {
  state: () => ({
    items: platQueueRule || [
      {
        id: 1,
        platName: "lieren",
        getInterval: 2, // 订单获取间隔
        platToken: "",
        isEnabled: false
      }
    ],
    newItem: {
      platName: "",
      getInterval: 2,
      platToken: "",
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
      window.localStorage.setItem("platQueueRule", JSON.stringify(this.items));
    },
    // 添加
    addNewItem() {
      const newPlat = {
        id: this.items[this.items.length - 1].id + 1,
        ...this.newItem
      };
      this.items.push(newPlat);
      this.newItem = {
        platName: "",
        getInterval: 2,
        platToken: "",
        isEnabled: false
      }; // 重置表单
      window.localStorage.setItem("platQueueRule", JSON.stringify(this.items));
    },
    // 保存编辑
    saveEdit(newValue) {
      const index = this.items.findIndex(item => item.id === newValue.id);
      // console.log("index", index, newValue);
      if (index > -1) {
        this.items[index] = newValue;
      }
      window.localStorage.setItem("platQueueRule", JSON.stringify(this.items));
    },
    // 保存麻花新续期token
    saveMahuaNewRefreshToken({ platToken, platSubToken }) {
      const index = this.items.findIndex(item => item.platName === "mahua");
      // console.log("index", index, newValue);
      if (index > -1) {
        this.items[index] = { ...this.items[index], platToken, platSubToken };
      }
      window.localStorage.setItem("platQueueRule", JSON.stringify(this.items));
    },
    deleteItem(id) {
      // 模拟删除逻辑
      this.items = this.items.filter(item => item.id !== id);
      window.localStorage.setItem("platQueueRule", JSON.stringify(this.items));
    }
  }
});
