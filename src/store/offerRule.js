import { defineStore } from "pinia";
import { OFFER_LIST } from "@/common/constant";
let tableData = window.localStorage.getItem("offerRuletList");
if (tableData) {
  tableData = JSON.parse(tableData);
}
export const useDataTableStore = defineStore("dataTable", {
  state: () => {
    return {
      items: tableData || OFFER_LIST || []
    };
  },
  actions: {
    addItem(item) {
      this.items.push(item);
      this.saveToLocalStorage();
    },
    updateItem(index, updatedItem) {
      this.items[index] = updatedItem;
      this.saveToLocalStorage();
    },
    deleteItem(index) {
      this.items.splice(index, 1);
      this.saveToLocalStorage();
    },
    batchDeleteItem(ids) {
      let tempArr = this.items.filter(item => !ids.includes(item.id));
      console.log("tempArr==>", tempArr);
      this.items = tempArr;
      this.saveToLocalStorage();
    },
    saveToLocalStorage() {
      localStorage.setItem("offerRuletList", JSON.stringify(this.items));
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
  }
});
