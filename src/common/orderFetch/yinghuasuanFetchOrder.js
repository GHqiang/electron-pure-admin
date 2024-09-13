// 影划算平台获取订单队列
import { onMounted, computed } from "vue";

import yinghuasuanApi from "@/api/yinghuasuan-api";
import svApi from "@/api/sv-api";
// 平台自动获取订单规则列表
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatFetchOrderStore();

const platFetchOrderRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "yinghuasuan")
);

import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
const { addNewOrder } = stayTicketList;
import {
  getCinemaFlag,
  logUpload,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【影划算自动获取订单】——"; // console打印前缀
const getOrginValue = value => JSON.parse(JSON.stringify(value));

// 创建一个订单自动报价队列类
class OrderAutoFetchQueue {
  constructor() {
    this.isRunning = false; // 初始化时队列未运行
    this.confimrOrderList = []; // 已接单列表（用于匹配过滤待出票订单）
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    console.log(conPrefix + "队列启动");
    // 设置队列为运行状态
    this.isRunning = true;
    this.confimrOrderList = [];
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
      // 获取待确认列表并确认接单
      await getStayConfirmOrderAndSure();
      await this.delay(1);
      let stayList = await orderFetch();
      if (!stayList?.length) return;
      let sfcStayOfferlist = stayList
        .map(item => {
          const {
            quote_price: supplier_end_price,
            cinema_id: cinema_code,
            order_sn: order_number
          } = item;
          const {
            id,
            net_price: tpp_price,
            city_name,
            cinema_address: cinema_addr,
            seat_num: ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_pic: film_img,
            show_time,
            fast_buy: is_urgent,
            brand_name: cinema_group // 品牌名 上影上海、上影二线等
          } = item.demands;
          return {
            id: id || "", // 他这里没这个id字段
            tpp_price,
            supplier_end_price,
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            rewards: 0, // 影划算无奖励，只有快捷
            is_urgent, // 1紧急 0非紧急
            cinema_group,
            cinema_code, // 影院id
            order_number,
            lockseat: seat_no.split(",").join(" ") || "", // 最终要以空格拼接多座的话
            plat_name: "yinghuasuan"
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
      //   conPrefix + "影划算待出票列表从本地缓存过滤后",
      //   sfcStayOfferlist
      // );
      if (sfcStayOfferlist?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        let targetList = [];
        for (var i = 0; i < sfcStayOfferlist.length; i++) {
          const item = sfcStayOfferlist[i];
          // 先匹配是否接单
          const res = await judgeHandle(
            item,
            item.appName,
            offerList,
            ticketList
          );
          if (res?.isNewOrder) {
            let offerRecord = res.offerRecord;
            if (offerRecord?.order_id) {
              // 更新报价记录的order_number后再添加，否则出票那匹配不到报价规则
              const updateRes = await updateOfferReocrd({
                whereObj: {
                  order_id: offerRecord?.order_id,
                  plat_name: "yinghuasuan"
                },
                updateObj: {
                  order_number: item.order_number
                }
              });
              if (updateRes?.upRes) {
                targetList.push(item);
              }
            }
          }
        }
        // console.warn(
        //   conPrefix + "影划算待出票列表从远端过滤后",
        //   targetList
        // );
      }
      if (!targetList?.length) return;
      console.warn(conPrefix + "待出票列表新订单", targetList);
      let logList = [
        {
          opera_time: getCurrentFormattedDateTime(),
          des: "新的待出票订单列表",
          level: "info",
          info: {
            newOrders: targetList
          }
        }
      ];
      logUpload(
        {
          plat_name: "yinghuasuan",
          type: 2
        },
        logList
      );
      // addNewOrder(targetList);
      targetList.forEach(item => {
        // 动态生成事件名称
        const eventName = `newOrder_${item.appName}`;
        // 创建一个事件对象
        const newOrderEvent = new CustomEvent(eventName, { detail: {} });
        newOrderEvent.detail = item;
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

// 更新报价记录
const updateOfferReocrd = async params => {
  try {
    await svApi.updateOfferRecord(params);
    return {
      upRes: true
    };
  } catch (error) {
    console.error("更新报价记录异常", error);
    //TODO handle the exception
    return {
      error
    };
  }
};

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
      itemA =>
        itemA.cinema_name === item.cinema_name &&
        itemA.show_time === item.show_time &&
        itemA.lockseat === item.lockseat
    );
    let isTicket = targetTicketList.some(
      itemA => itemA.order_number === item.order_number
    );
    // 报过价没出过票就是新订单
    return {
      isNewOrder: isOffer && !isTicket,
      offerRecord: targetOfferList?.[0]
    };
  } catch (error) {
    console.error(conPrefix + "判断该订单是否是新订单异常", error);
  }
};

// 获取待确认订单并接单
const getStayConfirmOrderAndSure = async () => {
  try {
    let list = await stayConfirmOrderFetch();
    // 从已接单列表里过滤
    list = list.filter(
      item => !this.confimrOrderList.some(itemA => itemA.id === item.id)
    );
    list = list.map(item => ({
      ...item.demands,
      id: item.id,
      inv_id: item.inv_id,
      quote_price: item.quote_price
    }));
    if (list?.length) {
      const offerList = await getOfferList();
      // 匹配报价记录
      list = list.filter(item => {
        return !offerList.some(itemA => itemA.order_id === item.inv_id);
      });
      // 和报价记录匹配上了再接单
      for (var i = 0; i < list.length; i++) {
        const item = list[i];
        const res = await startDeliver(item);
        if (res) {
          this.confimrOrderList.push(order);
        }
      }
    }
  } catch (error) {
    console.error(conPrefix + "获取影划算待确认列表异常", error);
    return [];
  }
};

// 获取待确认订单列表
const stayConfirmOrderFetch = async () => {
  try {
    let params = {
      status: "0%2C1",
      page: 1
    };
    // console.log(conPrefix + "获取影划算待出票订单列表参数", params);
    const res = await yinghuasuanApi.queryStayConfirmList(params);
    let list = res?.data.data || [];
    // console.log(conPrefix + "获取影划算待确认列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取影划算待确认列表异常", error);
    return [];
  }
};

// 确认接单
const startDeliver = async order => {
  try {
    let params = {
      quote_id: order.id
    };
    console.log("确认接单参数", params);
    const res = await yinghuasuanApi.confirmOrder(params);
    console.log("确认接单返回", res);
    return res;
  } catch (error) {
    console.warn("确认接单异常", error);
  }
};

// 获取待出票订单列表
const orderFetch = async () => {
  try {
    let params = {
      status: "1",
      page: 1,
      keywords: "",
      old: "0"
    };
    // console.log(conPrefix + "获取影划算待出票订单列表参数", params);
    const res = await yinghuasuanApi.stayTicketingList(params);
    let list = res?.data?.data || [];
    // console.log(conPrefix + "获取影划算待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取待出票列表异常", error);
    return [];
  }
};

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "yinghuasuan",
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "yinghuasuan",
      page_num: 1,
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取历史出票记录异常", error);
    return [];
  }
};

onMounted(() => {
  console.log(conPrefix + "onMounted");
});

export default orderFetchQueue;
