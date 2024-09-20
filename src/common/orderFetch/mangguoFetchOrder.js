// sheng平台获取订单队列
import mangguoApi from "@/api/mangguo-api";
import svApi from "@/api/sv-api";

import {
  getCinemaFlag,
  logUpload,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【芒果自动获取订单】——"; // console打印前缀

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
      let stayList = await orderFetch();
      if (!stayList?.length) return;
      let sfcStayOfferlist = stayList
        .map(item => {
          const {
            id,
            maoyan_price,
            supplier_end_price,
            city_name,
            relation_to_cinema,
            relation_to_seat,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            is_urgent,
            order_number,
            cinemaid,
            line_name // 品牌名 上影上海、上影二线等
          } = item;
          return {
            id: id,
            tpp_price: maoyan_price,
            supplier_end_price: supplier_end_price,
            city_name: city_name,
            cinema_addr: relation_to_cinema.cinema_addr,
            ticket_num: ticket_num,
            cinema_name: cinema_name,
            hall_name: hall_name,
            film_name: film_name,
            film_img: film_img,
            show_time: show_time,
            rewards: 0, // 芒果无奖励，只有快捷
            is_urgent: is_urgent, // 1紧急 0非紧急
            cinema_group: line_name,
            cinema_code: cinemaid, // 影院id
            order_number: order_number,
            lockseat: relation_to_seat
              .map(itemA => itemA.position_seat.replace(/\s+/g, ""))
              .join(" "),
            plat_name: "mangguo"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      sfcStayOfferlist = sfcStayOfferlist.filter(item => {
        // 过滤出来新订单（未发送过新订单消息的）
        return !this.orderRecord.some(
          itemA =>
            itemA.plat_name === item.plat_name &&
            itemA.order_number === item.order_number
        );
      });
      if (sfcStayOfferlist?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        // console.warn(
        //   conPrefix + "芒果待出票列表从远端过滤后",
        //   sfcStayOfferlist
        // );
      }
      if (!sfcStayOfferlist?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      sfcStayOfferlist.forEach(item => {
        let logList = [
          {
            opera_time: getCurrentFormattedDateTime(),
            des: "芒果新的待出票订单",
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

// 获取待出票订单列表
async function orderFetch() {
  try {
    let params = {
      page_size: 12,
      order_type: "1"
    };
    // console.log(conPrefix + "获取芒果待出票订单列表参数", params);
    const res = await mangguoApi.stayTicketingList(params);
    let list = res?.data.list || [];
    // console.log(conPrefix + "获取芒果待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取芒果待出票列表异常", error);
    return [];
  }
}

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "mangguo",
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取芒果历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "mangguo",
      page_num: 1,
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取芒果历史出票记录异常", error);
    return [];
  }
};

export default orderFetchQueue;
