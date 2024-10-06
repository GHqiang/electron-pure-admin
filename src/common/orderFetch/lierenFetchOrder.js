// 平台获取订单队列
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
const isTestOrder = false;

// 创建一个订单自动报价队列类
class OrderAutoFetchQueue {
  constructor() {
    this.isRunning = false; // 初始化时队列未运行
    this.orderRecord = []; // 订单记录
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    console.log(conPrefix + "队列启动");
    // 设置队列为运行状态
    this.isRunning = true;
    this.orderRecord = []; // 订单记录
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
      stayList = stayList.filter(item => {
        // 过滤出来新订单（未发送过新订单消息的）
        return !this.orderRecord.some(
          itemA =>
            itemA.plat_name === item.plat_name &&
            itemA.order_number === item.order_number
        );
      });
      // 如果是测试订单就不从远端过滤
      if (stayList?.length && !isTestOrder) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        stayList = stayList.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        // console.warn(conPrefix + "猎人待出票列表从远端过滤后", stayList);
      }
      if (!stayList?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      stayList.forEach(item => {
        let logList = [
          {
            opera_time: getCurrentFormattedDateTime(),
            des: "猎人新的待出票订单",
            level: "info",
            info: {
              newOrder: item
            }
          }
        ];
        logUpload(
          {
            plat_name: item.plat_name,
            app_name: item.appName,
            order_number: item.order_number,
            type: 2
          },
          logList
        );
        // 动态生成事件名称
        const eventName = `newOrder_${item.appName}`;
        // 创建一个事件对象
        const newOrderEvent = new CustomEvent(eventName, { detail: item });
        this.orderRecord.push(item);
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
    let mockRes = {
      success: true,
      code: 1,
      message: "成功！",
      total: 1,
      data: [
        {
          id: 7787887,
          supplier_id: 714632,
          order_number: "2024100520441715153",
          tpp_price: "79.00",
          ticket_num: 2,
          city_name: "北京",
          cinema_addr:
            "徐汇区凯滨路218号绿地缤纷城中庭3楼（近东安路、龙华中路）",
          cinema_name: "卢米埃北京芳草地影城",
          hall_name: "7号厅",
          film_name: "浴火之路",
          show_time: "2024-10-06 21:40:00",
          lockseat: "5排8座 5排9座",
          cinema_code: "31074201",
          supplier_end_price: 39.5,
          cinema_group: "卢米埃"
        }
      ],
      time: 1710125670
    };
    let list = res?.data || [];
    if (isTestOrder) {
      list = mockRes?.data || [];
    }
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

export default orderFetchQueue;
