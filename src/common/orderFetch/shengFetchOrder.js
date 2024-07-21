// sheng平台获取订单队列
import { onMounted, computed } from "vue";

import shengApi from "@/api/sheng-api";
import svApi from "@/api/sv-api";
import { SFC_CINEMA_NAME } from "@/common/constant";
// 平台自动获取订单规则列表
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatFetchOrderStore();

const platFetchOrderRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "sheng")
);

import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
const { addNewOrder } = stayTicketList;
import { getCinemaFlag, getCurrentFormattedDateTime } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

let conPrefix = "【省自动获取订单】——"; // console打印前缀
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
            marketPrice,
            supplierPrice,
            detail,
            code,
            supplierCode,
            type,
            status,
            deliverMinute,
            stopDeliverTime
          } = item;
          // id             订单id    integer
          // marketPrice    市场价    string
          // supplierPrice  供应价    string
          // code           订单code  string
          // type           订单类型   integer    0-电影，1-KFC，3-卡券
          // status         订单状态   integer    2=待接单 5=已接单 4=完成 3=已发货 9=取消 10=售后申请 11=售后成功 12=售后失败 15=售后拒绝 14=系统审核中
          // deliverMinute  是否特惠   integer    0 有大于0的数据则为快捷订单，其它为特惠订单
          // stopDeliverTime 截止发货时间 string  示例：2024-01-11 12:58:33

          const {
            quantity,
            sourceData: { show, film, cinema, label, seats }
          } = detail;
          // quantity   座位数    integer

          return {
            id: id, // 订单id
            tpp_price: marketPrice,
            supplier_end_price: Number(
              Number(supplierPrice) / Number(quantity).toFixed(2)
            ),
            city_name: film.cityName,
            cinema_addr: film.address,
            ticket_num: quantity,
            cinema_name: film.cinemaName,
            hall_name: show.hallName,
            film_name: film.filmName,
            film_img: film.imgUrl,
            show_time: show.startTime,
            rewards: 0, // 省无奖励，只有快捷
            quick: deliverMinute > 0, // true表示为快捷订单（需12分钟内完成发货），false表示为特惠订单（需45分钟内完成发货）
            // 省暂定和猎人针对sfc影院名字一样
            cinema_group: SFC_CINEMA_NAME.includes(film.cinemaName)
              ? "上影上海"
              : "其它自动",
            cinema_code: cinema.cinemaId, // 影院id
            order_number: code, // 订单号
            supplierCode, // 商户号
            lockseat: seats.map(itemA => itemA.name).join(" "),
            platName: "sheng"
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
      console.warn(
        conPrefix + "省待出票列表从本地缓存过滤后",
        sfcStayOfferlist
      );
      if (sfcStayOfferlist?.length) {
        const offerList = await getOfferList();
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        console.warn(conPrefix + "省待出票列表从远端过滤后", sfcStayOfferlist);
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
      page: 1, // （一页20条）
      status: "2", // 查询状态，只能查询2和5，2表示未接单的订单，5表示已接单的订单
      supplierCode: "ccf7b11cdc944cf1940a149cff4243f9" // 供应商号
    };
    // console.log(conPrefix + "获取省待出票订单列表参数", params);
    const res = await shengApi.stayTicketingList(params);
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
    let list = res?.data.rows || [];
    // console.log(conPrefix + "获取省待出票列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取省待出票列表异常", error);
    return [];
  }
}

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "sheng",
      start_time: getCurrentFormattedDateTime(+new Date() - 1 * 60 * 60 * 1000),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取省历史报价记录异常", error);
    return [];
  }
};

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "sheng",
      page_num: 1,
      page_size: 50
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取省历史出票记录异常", error);
    return [];
  }
};

onMounted(() => {
  console.log(conPrefix + "onMounted");
});

export default orderFetchQueue;
