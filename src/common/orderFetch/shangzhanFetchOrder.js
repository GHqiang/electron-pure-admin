// 商展平台获取订单队列
import { onMounted, computed } from "vue";

import shangzhanApi from "@/api/shangzhan-api";
import svApi from "@/api/sv-api";

import {
  getCinemaFlag,
  logUpload,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【商展自动获取订单】——"; // console打印前缀
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
      let stayList = await orderFetch();
      if (!stayList?.length) return;
      let sfcStayOfferlist = stayList
        .map(item => {
          const {
            order_sn: id,
            bidding_data,
            city_name,
            address: cinema_addr,
            seatdata,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img = "",
            show_time,
            cinema_code = "",
            cinema_group = "" // 品牌名 上影上海、上影二线等
          } = item;
          return {
            id,
            tpp_price: "",
            supplier_end_price: Number(bidding_data[0]?.price_ori),
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time: parseTimeStr(show_time)?.startTime,
            rewards: 0, // 商展无奖励，只有快捷
            is_urgent: "", // 1紧急 0非紧急
            cinema_group,
            cinema_code, // 影院id
            order_number: item.order_sn,
            lockseat: seatdata.split(",").join(" "),
            plat_name: "shangzhan"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      if (sfcStayOfferlist?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        // console.warn(
        //   conPrefix + "商展待出票列表从远端过滤后",
        //   sfcStayOfferlist
        // );
      }
      if (!sfcStayOfferlist?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      let logList = [
        {
          opera_time: getCurrentFormattedDateTime(),
          des: "新的待出票订单列表",
          level: "info",
          info: {
            newOrders: stayList.filter(item =>
              sfcStayOfferlist.some(
                itemA => itemA.order_number === item.order_sn
              )
            )
          }
        }
      ];
      logUpload(
        {
          plat_name: "shangzhan",
          type: 2
        },
        logList
      );
      sfcStayOfferlist.forEach(item => {
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

// 获取待出票订单列表
async function orderFetch() {
  try {
    // console.log(conPrefix + "获取商展待出票订单列表参数", params);
    const res = await shangzhanApi.stayTicketingList({});
    let list = res?.data || [];
    // console.log(conPrefix + "获取商展待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取商展待出票列表异常", error);
    return [];
  }
}

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "shangzhan",
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取商展历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "shangzhan",
      page_num: 1,
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取商展历史出票记录异常", error);
    return [];
  }
};

function parseTimeStr(timeStr) {
  // 当前年份
  const currentYear = new Date().getFullYear();

  // 解析输入的字符串
  const parts = timeStr.split(" ");
  const datePart = parts[0].replace("日", ""); // 移除 "日" 字符
  const timePart = parts[1];

  // 解析日期部分
  const [month, day] = datePart.split("月");
  const [startTime, endTime] = timePart.split("-");

  // 格式化日期和时间
  const startFormatted = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${startTime}:00`;
  const endFormatted = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${endTime}:00`;

  return {
    startTime: startFormatted,
    endTime: endFormatted
  };
}
export default orderFetchQueue;
