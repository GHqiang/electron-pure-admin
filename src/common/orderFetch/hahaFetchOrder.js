// 哈哈平台获取订单队列
import hahaApi from "@/api/haha-api";
import svApi from "@/api/sv-api";

import { SFC_CINEMA_NAME } from "@/common/constant";
import {
  getCinemaFlag,
  logUpload,
  getCurrentTime,
  formatTimeOfTime,
  removeLeadingZeros,
  sendWxPusherMessage,
  mockDelay
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【哈哈自动获取订单】——"; // console打印前缀

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

  // 获取订单
  async fetchOrders(fetchDelay) {
    try {
      await mockDelay(fetchDelay);
      let stayList = await orderFetch();
      if (!stayList?.length) return;
      let sfcStayOfferlist = stayList
        .map(item => {
          const {
            id,
            maoyan_price,
            price,
            city,
            num,
            cinemaName,
            ting,
            movie,
            image,
            time,
            orderNumber,
            seatInfo,
            b_id // 确认接货id
          } = item;
          let lockseat = seatInfo
            .split(",")
            .map(itemA => removeLeadingZeros(itemA + "座"))
            .join(" ");
          return {
            id: id,
            tpp_price: maoyan_price,
            supplier_end_price: Number(price),
            city_name: city,
            cinema_addr: "",
            ticket_num: num,
            cinema_name: cinemaName,
            hall_name: ting,
            film_name: movie,
            film_img: image,
            show_time: time,
            rewards: 0, // 哈哈无奖励，只有快捷
            is_urgent: 0, // 1紧急 0非紧急
            cinema_group: SFC_CINEMA_NAME.includes(cinemaName)
              ? "上影上海"
              : "其它自动",
            cinema_code: "", // 影院id
            order_number: orderNumber,
            lockseat,
            bid: b_id,
            plat_name: "haha"
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
        // const offerList = await getOfferList();
        // const ticketList = await getTicketList();
        // sfcStayOfferlist = sfcStayOfferlist.filter(item =>
        //   judgeHandle(item, item.appName, offerList, ticketList)
        // );
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item => {
          let isTicket = ticketList
            .filter(itemA => itemA.app_name === item.appName)
            .some(itemA => itemA.order_number === item.order_number);
          return !isTicket;
        });
        // console.warn(
        //   conPrefix + "哈哈待出票列表从远端过滤后",
        //   sfcStayOfferlist
        // );
      }
      if (!sfcStayOfferlist?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      sfcStayOfferlist.forEach(item => {
        let logList = [
          {
            opera_time: getCurrentTime(),
            des: "哈哈新的待出票订单",
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
        this.sendNeworderMsg(item);
        this.orderRecord.push(item);
        window.dispatchEvent(newOrderEvent);
      });
    } catch (error) {
      console.error(conPrefix + "获取订单列表异常", error);
    }
  }

  // 发送新订单消息
  async sendNeworderMsg(item) {
    let order = JSON.parse(JSON.stringify(item));
    try {
      if (order.appName === "wanxiang") {
        // 调一个报价记录查看接口，判断用哪个出票
        const res = await svApi.queryOfferList({
          user_id: tokens.userInfo.user_id,
          plat_name: order.plat_name,
          order_number: order.order_number,
          order_status: "1",
          isNeedTotalNum: 0,
          queryFields: "plat_name,order_number,app_name,order_status"
        });
        let list = res.data.offerList || [];
        const offerRecord = list[0];
        // 两个队列根据报价记录里的app_name去选择用哪个出
        if (offerRecord?.app_name) {
          order.appName = offerRecord.app_name;
        } else {
          this.sendNeworderMsg(
            order,
            "报价记录里app_name不存在,机器无法判断用小程序还是凤凰云智出票，需手动出票"
          );
          return;
        }
      }
      // 动态生成事件名称
      const eventName = `newOrder_${order.appName}`;
      // 创建一个事件对象
      const newOrderEvent = new CustomEvent(eventName, { detail: order });
      window.dispatchEvent(newOrderEvent);
    } catch (error) {
      this.sendNeworderMsg(order, JSON.stringify(error));
    }
  }
  // 发送微信消息
  sendWxMsgByOrder(order, errMsg) {
    sendWxPusherMessage({
      plat_name: order.plat_name,
      order_number: order.order_number,
      city_name: order.city_name,
      cinema_name: order.cinema_name,
      film_name: order.film_name,
      show_time: order.show_time,
      lockseat: order.lockseat,
      hall_name: order.hall_name,
      supplier_end_price: order.supplier_end_price,
      transferTip: "此处不转单，直接跳过，需手动出票",
      failReason: errMsg
    });
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
      current: 1,
      pageSize: 10,
      total: 0,
      tab: 0,
      type: 1,
      mold: 1
    };
    // console.log(conPrefix + "获取哈哈待出票订单列表参数", params);
    const res = await hahaApi.stayTicketingList(params);
    let list = res?.data || [];
    // console.log(conPrefix + "获取哈哈待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取哈哈待出票列表异常", error);
    return [];
  }
}

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "haha",
      page_num: 1,
      page_size: 50
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取哈哈历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "haha",
      page_num: 1,
      page_size: 30,
      isNeedTotalNum: 0,
      queryFields: "order_number,app_name"
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取哈哈历史出票记录异常", error);
    return [];
  }
};

export default orderFetchQueue;
