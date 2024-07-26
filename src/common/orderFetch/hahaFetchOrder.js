// 哈哈平台获取订单队列
import { onMounted, computed } from "vue";

import hahaApi from "@/api/haha-api";
import svApi from "@/api/sv-api";
// 平台自动获取订单规则列表
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatFetchOrderStore();

const platFetchOrderRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "haha")
);

import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
const { addNewOrder } = stayTicketList;
import { getCinemaFlag, getCurrentFormattedDateTime } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【哈哈自动获取订单】——"; // console打印前缀
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
      // if (!window.isFirst) {
      //   console.time("第一次获取数据到解锁耗时");
      //   window.isFirst = true;
      // }
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
            cinema_group: line_name,
            cinema_code: "", // 影院id
            order_number: orderNumber,
            lockseat: seatInfo
              .split(",")
              .map(itemA => itemA + "座")
              .join(" "),
            bid: b_id,
            platName: "haha"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      let stayTicketListByCache = getOrginValue(stayTicketList.items);
      sfcStayOfferlist = sfcStayOfferlist.filter(
        item =>
          !stayTicketListByCache.some(
            itemA =>
              itemA.order_number === item.order_number &&
              itemA.app_name === item.app_name
          )
      );
      // console.warn(
      //   conPrefix + "哈哈待出票列表从本地缓存过滤后",
      //   sfcStayOfferlist
      // );
      if (sfcStayOfferlist?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        // console.warn(
        //   conPrefix + "哈哈待出票列表从远端过滤后",
        //   sfcStayOfferlist
        // );
      }
      if (!sfcStayOfferlist?.length) return;
      addNewOrder(sfcStayOfferlist);
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
    console.log(conPrefix + "获取哈哈待出票列表返回", list);
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
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
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
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取哈哈历史出票记录异常", error);
    return [];
  }
};

onMounted(() => {
  console.log(conPrefix + "onMounted");
});

export default orderFetchQueue;
