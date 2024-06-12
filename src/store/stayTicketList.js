import { defineStore } from "pinia";

// 待出票列表
// 每次优先从localStorage里获取
let stayTicketList = window.localStorage.getItem("stayTicketList");
if (stayTicketList) {
  stayTicketList = JSON.parse(stayTicketList);
}
export const useStayTicketList = defineStore("stayTicketList", {
  state: () => ({
    items: stayTicketList || []
  }),
  actions: {
    // 添加
    addNewOrder(list) {
      list.forEach(item => {
        if (
          !this.items.some(
            itemA =>
              itemA.order_number === item.order_number &&
              itemA.platName === item.platName
          )
        ) {
          this.items.push(item);
        }
      });
      window.localStorage.setItem("stayTicketList", JSON.stringify(this.items));
    },
    deleteOrder(order_number, appName) {
      // 模拟删除逻辑
      this.items = this.items.filter(
        item =>
          !(item.order_number === order_number && item.appName === appName)
      );
      window.localStorage.setItem("stayTicketList", JSON.stringify(this.items));
    }
  }
});
