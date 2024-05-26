// 平台获取订单队列
import { onMounted, computed } from "vue";

import lierenApi from "@/api/lieren-api";

// 平台自动获取订单规则列表
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatFetchOrderStore();

const platFetchOrderRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "lieren")
);

import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
const { addNewOrder } = stayTicketList;
let conPrefix = "【猎人平台自动获取订单队列】——"; // console打印前缀
const getOrginValue = value => JSON.parse(JSON.stringify(value));

// 创建一个订单自动报价队列类
class OrderAutoFetchQueue {
  constructor() {
    this.isRunning = false; // 初始化时队列未运行
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    // 设置队列为运行状态
    this.isRunning = true;
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      // 1、获取当前平台的队列规则状态，如果禁用直接停止
      let platQueueRule = getOrginValue(
        getOrginValue(platFetchOrderRuleList.value)
      ).filter(item => item.isEnabled);
      // console.log(conPrefix + "队列启动的执行规则", platQueueRule);
      if (!platQueueRule?.length) {
        console.warn(conPrefix + "队列执行规则不存在或者未启用，直接停止");
        await this.stop();
        return;
      }
      const { getInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      await this.fetchOrders(fetchDelay);
    }
  }

  // 模拟延时
  delay(delayTime) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, delayTime * 1000);
    });
  }

  // 获取订单
  async fetchOrders(fetchDelay) {
    try {
      await this.delay(fetchDelay);
      let stayList = await lierenOrderFetch();
      stayList = stayList.map(item => ({ ...item, platName: "lieren" }));
      console.log(conPrefix + "猎人待出票列表", stayList);
      addNewOrder(stayList);
    } catch (error) {
      console.error(conPrefix + "获取订单列表异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    console.warn(conPrefix + "主动停止订单自动获取队列");
  }
}
// 报价队列实例
const orderFetchQueue = new OrderAutoFetchQueue();

// 获取猎人待出票订单列表
async function lierenOrderFetch() {
  try {
    let params = {
      page: 1,
      limit: 100,
      sort: "id",
      desc: "desc",
      type: 2
    };
    console.log(conPrefix + "获取猎人待出票订单列表参数", params);
    const res = await lierenApi.stayTicketingList(params);
    // let mockRes = {
    //   success: true,
    //   code: 1,
    //   message: "成功！",
    //   total: 1,
    //   data: [
    //     {
    //       id: 6103172,
    //       supplier_id: 714632,
    //       order_number: "2024052211291357372",
    //       tpp_price: "61.00",
    //       ticket_num: 1,
    //       city_name: "上海",
    //       film_img:
    //         "https://gw.alicdn.com/tfscom/i1/O1CN01PTduxS1oVqloZeODY_!!6000000005231-0-alipicbeacon.jpg",
    //       cinema_addr: "上海市浦东新区张杨路501号第一八佰伴10楼（近浦东南路）",
    //       cinema_name: "上海华夏久金国际影城",
    //       hall_name: "1厅",
    //       film_name: "末路狂花钱",
    //       show_time: "2024-05-27 20:50:00",
    //       section_at: 1716348565,
    //       winning_at: 1716348610,
    //       lock_if: 1,
    //       lockseat: "3排2座",
    //       seat_flat: 0,
    //       urgent: 0,
    //       is_multi: 0,
    //       seat_type: 0,
    //       cinema_code: "31070901",
    //       supplier_end_price: 40,
    //       rewards: 0,
    //       overdue: 0,
    //       cinema_group: "久金国际",
    //       type: 0,
    //       group_urgent: 0,
    //       sytime: 1716349300,
    //       orderNumber: "2024052211291357372",
    //       processingTime: 1716348629972,
    //       qrcode: "",
    //       quan_code: "",
    //       card_id: "",
    //       offerRule: "",
    //       offerRuleName: "",
    //       offerType: "",
    //       quanValue: ""
    //     }
    //   ],
    //   time: 1710125670
    // };
    // let list = mockRes?.data || [];
    let list = res?.data || [];
    console.log(conPrefix + "获取猎人待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取猎人待出票列表异常", error);
    return [];
  }
}

onMounted(() => {
  console.log(conPrefix + "onMounted");
});

export default orderFetchQueue;
