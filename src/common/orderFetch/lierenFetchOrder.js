// 平台获取订单队列
import { onMounted, computed } from "vue";

import lierenApi from "@/api/lieren-api";
import svApi from "@/api/sv-api";

import {
  getCinemaFlag,
  logUpload,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【猎人自动获取订单】——"; // console打印前缀
const getOrginValue = value => JSON.parse(JSON.stringify(value));

// 创建一个订单自动报价队列类
class OrderAutoFetchQueue {
  constructor() {
    this.isRunning = false; // 初始化时队列未运行
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    console.log(conPrefix + "队列启动");
    // 设置队列为运行状态
    this.isRunning = true;
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      let fetchDelay = 2;
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
      if (!stayList?.length) return;
      stayList = stayList.map(item => ({ ...item, plat_name: "lieren" }));
      // 先过滤出来目前已上架影院的，然后添加影院标识，最后从历史记录过滤
      stayList = stayList
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      if (stayList?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        stayList = stayList.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        // console.warn(conPrefix + "猎人待出票列表从远端过滤后", stayList);
      }
      if (!stayList?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      let logList = [
        {
          opera_time: getCurrentFormattedDateTime(),
          des: "新的待出票订单列表",
          level: "info",
          info: {
            newOrders: stayList
          }
        }
      ];
      logUpload(
        {
          plat_name: "lieren",
          type: 2
        },
        logList
      );
      stayList.forEach(item => {
        // 动态生成事件名称
        const eventName = `newOrder_${item.appName}`;
        // 创建一个事件对象
        const newOrderEvent = new CustomEvent(eventName, { detail: item });
        window.dispatchEvent(newOrderEvent);
      });
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

// 判断该订单是否是新订单
const judgeHandle = (item, app_name, offerList, ticketList) => {
  try {
    let targetOfferList = offerList.filter(
      itemA => itemA.app_name === app_name && itemA.order_status === "1"
    );
    let targetTicketList = ticketList.filter(
      itemA => itemA.app_name === app_name
    );
    let isOffer = targetOfferList.some(
      itemA => itemA.order_number === item.order_number
    );
    let isTicket = targetTicketList.some(
      itemA => itemA.order_number === item.order_number
    );
    // 报过价没出过票就是新订单
    return isOffer && !isTicket;
  } catch (error) {
    console.error(conPrefix + "判断该订单是否是新订单异常", error);
  }
};

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
    // console.log(conPrefix + "获取猎人待出票订单列表参数", params);
    const res = await lierenApi.stayTicketingList(params);
    // let mockRes = {
    //   success: true,
    //   code: 1,
    //   message: "成功！",
    //   total: 1,
    //   data: [
    //     {
    //       id: 144,
    //       plat_name: "lieren",
    //       app_name: "sfc",
    //       ticket_num: 2,
    //       order_number: "2024062013010376202",
    //       supplier_end_price: 32,
    //       order_id: "6243881",
    //       tpp_price: "36.00",
    //       city_name: "天津",
    //       cinema_addr:
    //         "和平区天津市和平区小白楼街和平路263号天津天河城第八层809商铺",
    //       cinema_name: "SFC上影影城（天津天河城IMAX店）",
    //       hall_name: "5号激光厅",
    //       film_name: "加菲猫家族",
    //       lockseat: "6排1座 6排2座",
    //       show_time: "2024-06-21 15:25:00",
    //       cinema_group: "上影二线"
    //     }
    //   ],
    //   time: 1710125670
    // };
    // let list = mockRes?.data || [];
    let list = res?.data || [];
    // console.log(conPrefix + "获取猎人待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取猎人待出票列表异常", error);
    return [];
  }
}

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "lieren",
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取猎人历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "lieren",
      page_num: 1,
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取猎人历史出票记录异常", error);
    return [];
  }
};

onMounted(() => {
  console.log(conPrefix + "onMounted");
});

export default orderFetchQueue;
