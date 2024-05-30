import { defineStore } from "pinia";
import { ref } from "vue";
import { OFFER_LIST } from "@/common/constant";
export const useDataTableStore = defineStore("dataTable", {
  state: () => {
    return {
      items: ref([])
    };
  },
  actions: {
    // 从localStorage中获取数据
    async fetchItemsFromLocalStorage() {
      const data = localStorage.getItem("tableData");
      // console.log("localStorage-tableDataRule", data);
      if (data) {
        this.items = JSON.parse(data);
        if (this.items.length) {
          return;
        }
      }
      this.items = OFFER_LIST;
    },
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
      localStorage.setItem("tableData", JSON.stringify(this.items));
    }
  },
  getters: {
    // 可以添加getters以方便在组件中使用过滤、排序等逻辑
  }
});
