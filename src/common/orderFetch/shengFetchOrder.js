// sheng平台获取订单队列
import shengApi from "@/api/sheng-api";
import svApi from "@/api/sv-api";

import {
  getCinemaFlag,
  logUpload,
  getCurrentTime,
  formatTimeOfTime,
  sendWxPusherMessage,
  mockDelay
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;
let conPrefix = "【省自动获取订单】——"; // console打印前缀

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
    this.platOrderList = []; // 平台查询订单记录
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      await mockDelay(5);
      this.fetchOrders();
    }
  }

  // 获取订单
  async fetchOrders() {
    try {
      let stayList = await this.orderFetch();
      if (!stayList?.length) return;
      console.warn("省待出票列表返回", stayList);
      // let logList = [
      //   {
      //     opera_time: getCurrentTime(),
      //     des: "省待出票列表返回",
      //     level: "info",
      //     info: {
      //       stayList
      //     }
      //   }
      // ];
      // logUpload(
      //   {
      //     plat_name: "sheng",
      //     type: 2
      //   },
      //   logList
      // );
      const offerList = await getOfferList();
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
          let cinema_group = label?.[0]?.name || cinema?.label?.[0]?.name || "";
          if (!cinema_group) {
            let targetObj = offerList.find(item => item.order_number === code);
            cinema_group = targetObj?.cinema_group;
          }
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
            rewards: "", // 省的奖励从报价记录里获取
            quick: deliverMinute > 0, // true表示为快捷订单（需12分钟内完成发货），false表示为特惠订单（需45分钟内完成发货）
            // 省暂定和猎人针对sfc影院名字一样
            cinema_group: cinema_group,
            cinema_code: film.standardId, // 影院id
            order_number: code, // 订单号
            supplierCode, // 商户号
            lockseat: seats.map(itemA => itemA.name).join(" "),
            plat_name: "sheng"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          let app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name
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
      // let logList = [
      //   {
      //     opera_time: getCurrentTime(),
      //     des: `省获取待出票列表返回`,
      //     level: "info",
      //     info: {
      //       stayList: stayList
      //     }
      //   }
      // ];
      // logUpload(
      //   {
      //     plat_name: "sheng",
      //     app_name: "",
      //     order_number: "",
      //     type: 2
      //   },
      //   logList
      // );
      if (sfcStayOfferlist?.length) {
        const ticketList = await getTicketList();
        sfcStayOfferlist = sfcStayOfferlist.filter(item =>
          judgeHandle(item, item.appName, offerList, ticketList)
        );
        console.warn(
          conPrefix + "省待出票列表从远端过滤后",
          sfcStayOfferlist,
          offerList,
          ticketList
        );
      }
      if (!sfcStayOfferlist?.length) return;
      console.warn(conPrefix + "待出票列表新订单", sfcStayOfferlist);
      sfcStayOfferlist.forEach(item => {
        let logList = [
          {
            opera_time: getCurrentTime(),
            des: "省新的待出票订单",
            level: "info",
            info: {
              newOrder: item,
              oldOrder: stayList.find(itemA => itemA.code === item.order_number)
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
          this.sendWxMsgByOrder(
            order,
            "报价记录里app_name不存在,机器无法判断用小程序还是凤凰云智出票，需手动出票"
          );
          return;
        }
      }
      // 动态生成事件名称
      const eventName = `newOrder_${order.appName}`;
      // 创建一个事件对象
      const newOrderEvent = new CustomEvent(eventName, {
        detail: order
      });
      window.dispatchEvent(newOrderEvent);
    } catch (error) {
      this.sendWxMsgByOrder(order, JSON.stringify(error));
    }
  }
  // 发送微信消息
  sendWxMsgByOrder(order, errMsg) {
    sendWxPusherMessage({
      orderInfo: order,
      transferTip: "此处不转单，直接跳过，需手动出票",
      failReason: errMsg
    });
  }
  // 停止队列运行
  stop() {
    this.isRunning = false;
    console.warn(conPrefix + "主动停止订单自动获取队列");
  }

  // 获取待出票订单列表
  async orderFetch() {
    try {
      let params1 = {
        page: 1, // （一页20条）
        status: "2", // 查询状态，只能查询2和5，2表示未接单的订单，5表示已接单的订单
        // supplierCode: "ccf7b11cdc944cf1940a149cff4243f9", // 供应商号-付勋
        // supplierCode: "2820ad3f7b644ad898771deee7c324a1" // 供应商号-兜
        supplierCode: tokens.shengToken
      };
      let params2 = {
        page: 1,
        status: "5",
        supplierCode: tokens.shengToken
      };

      const [res1, res2] = await Promise.allSettled([
        shengApi.stayTicketingList(params1),
        shengApi.stayTicketingList(params2)
      ]);

      let list1 = res1.status === "fulfilled" ? res1.value.data.rows : [];
      let list2 = res2.status === "fulfilled" ? res2.value.data.rows : [];

      // 合并两个列表
      let combinedList = [...list1, ...list2];

      // 去重
      let list = combinedList.filter((item, index, self) => {
        return index === self.findIndex(t => t.code === item.code);
      });

      if (list.length) {
        list = list.filter(
          item => !this.platOrderList.some(itemA => itemA.code === item.code)
        );
        this.platOrderList.push(...list);
        let ln = this.platOrderList.length;
        if (ln > 100) {
          this.platOrderList = this.platOrderList.slice(-100);
        }
      }
      return list;
      // console.log(conPrefix + "获取省待出票列表返回", list);
    } catch (error) {
      console.error(conPrefix + "获取省待出票列表异常", error);
      return [];
    }
  }
}
// 报价队列实例
const orderFetchQueue = new OrderAutoFetchQueue();

// 判断该订单是否是新订单
const judgeHandle = (item, app_name, offerList, ticketList) => {
  try {
    let targetOfferList = offerList.filter(itemA => {
      if (app_name !== "wanxiang") {
        return itemA.app_name === app_name && itemA.order_status === "1";
      } else {
        return (
          ["wanxiang", "wanxiangh5"].includes(itemA.app_name) &&
          itemA.order_status === "1"
        );
      }
    });
    let targetTicketList = ticketList.filter(itemA => {
      if (app_name !== "wanxiang") {
        return itemA.app_name === app_name;
      } else {
        return ["wanxiang", "wanxiangh5"].includes(itemA.app_name);
      }
    });
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

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "sheng",
      page_num: 1,
      page_size: 50,
      isNeedTotalNum: 0,
      queryFields: "order_number,app_name,cinema_group,order_status"
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
      page_size: 30,
      isNeedTotalNum: 0,
      queryFields: "order_number,app_name"
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取省历史出票记录异常", error);
    return [];
  }
};

export default orderFetchQueue;
