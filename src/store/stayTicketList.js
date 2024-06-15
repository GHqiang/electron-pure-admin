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
      // console.warn("添加待出票订单", list);
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
      // console.warn("删除已出票订单", order_number, appName);
      // 模拟删除逻辑
      this.items = this.items.filter(
        item =>
          !(item.order_number === order_number && item.appName === appName)
      );
      window.localStorage.setItem("stayTicketList", JSON.stringify(this.items));
    },
    // 删除某些或者全部影院的待出票数据，不传删全部
    removeStayTicketListByApp(appName) {
      this.items = this.items.filter(item =>
        appName ? item.appName !== appName : false
      );
      window.localStorage.setItem("stayTicketList", JSON.stringify(this.items));
    }
  }
});
