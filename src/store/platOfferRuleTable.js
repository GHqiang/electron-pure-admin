import { defineStore } from "pinia";

export const useTableDataStore = defineStore("platforms", {
  state: () => ({
    items: [
      {
        id: 1,
        name: "Platform A",
        interval: 60,
        token: "TOKEN123",
        isEnabled: true
      }
      // 更多初始数据...
    ],
    newItem: { name: "", interval: 60, token: "", isEnabled: true } // 初始化表单状态
  }),
  actions: {
    toggleEnable(id) {
      const inx = this.items.findIndex(p => p.id === id);
      console.log("inx", inx);
      if (inx > 0) {
        this.items[inx].isEnabled = !this.items[inx].isEnabled;
      }
    },
    addNewItem() {
      // 这里仅模拟新增，实际项目中应通过API调用
      const newPlat = {
        id: this.items.length + 1,
        ...this.newItem
      };
      this.items.push(newPlat);
      this.newItem = { name: "", interval: 60, token: "", isEnabled: true }; // 重置表单
    },
    startEdit(id) {
      this.editingId = id;
    },
    saveEdit(newValue) {
      // 模拟保存逻辑，实际应用中会替换为API调用
      const index = this.items.findIndex(item => item.id === this.editingId);
      console.log("index", index, newValue);
      if (index > -1) {
        this.items[index] = newValue;
      }
      this.editingId = null;
    },
    cancelEdit() {
      this.editingId = null;
    },
    deleteItem(id) {
      // 模拟删除逻辑
      this.items = this.items.filter(item => item.id !== id);
    }
  }
});
