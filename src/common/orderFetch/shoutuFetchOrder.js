// sheng平台获取订单队列
import shoutuApi from "@/api/shoutu-api";
import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
import {
  getCinemaFlag,
  logUpload,
  getCurrentTime,
  formatTimeOfTime,
  sendWxPusherMessage,
  mockDelay,
  formatErrInfo
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;
let conPrefix = "【守兔自动获取订单】——"; // console打印前缀

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
      if (!this.prevRecordTime) {
        this.prevRecordTime = +new Date();
      }
      // let logger = new Logger({ logType: 3 });
      // logger.init({
      //   plat_name: "shoutu",
      //   app_name: "",
      //   order_number: ""
      // });
      let stayList = await this.orderFetch();
      // logger.infoSave("守兔获取待出票订单返回", { stayList });
      // logger.logUpload();
      if (!stayList?.length) return;
      let shoutuStaylist = stayList.map(item => {
        const {
          orderUUID: id,
          unitPrice: supplier_end_price,
          city: city_name,
          seat: lockseat,
          orderNum: ticket_num,
          cinemaName: cinema_name,
          hallName: hall_name,
          movieName: film_name,
          startTime,
          orderId: order_number,
          standardId: cinema_code
        } = item;
        return {
          id,
          supplier_end_price,
          city_name,
          cinema_addr: "",
          ticket_num,
          cinema_name,
          hall_name,
          film_name,
          show_time: formatTimeOfTime(startTime * 1000),
          rewards: 0, // 守兔无奖励，只有快捷
          is_urgent: 0, // 1紧急 0非紧急
          cinema_group: "",
          cinema_code, // 影院code
          order_number,
          lockseat,
          plat_name: "shoutu"
        };
      });
      // console.warn(conPrefix + "shoutuStaylist", shoutuStaylist);
      let shoutuStaylistFilter = shoutuStaylist
        .filter(item => getCinemaFlag(item))
        .map(item => {
          let app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name
          };
        });
      // console.warn(conPrefix + "shoutuStaylistFilter", shoutuStaylistFilter);

      let newStaylist = shoutuStaylistFilter.filter(item => {
        // 过滤出来新订单（未发送过新订单消息的）
        return !this.orderRecord.some(
          itemA =>
            itemA.plat_name === item.plat_name &&
            itemA.order_number === item.order_number
        );
      });
      let logList = [
        {
          opera_time: getCurrentTime(),
          des: `${name}：守兔获取待出票列表返回`,
          level: "info",
          info: {
            stayList: stayList
          }
        }
      ];
      logUpload(
        {
          plat_name: "shoutu",
          app_name: "",
          order_number: "",
          type: 2
        },
        logList
      );
      console.warn(conPrefix + "newStaylist", newStaylist);
      if (newStaylist?.length) {
        const ticketList = await getTicketList();
        newStaylist = newStaylist.filter(item => {
          let isTicket = ticketList
            .filter(itemA => itemA.app_name === item.appName)
            .some(itemA => itemA.order_number === item.order_number);
          return !isTicket;
        });
        console.warn(conPrefix + "守兔待出票列表从远端过滤后", newStaylist);
      }
      if (!newStaylist?.length) return;
      console.warn(conPrefix + "待出票列表新订单", stayList);
      newStaylist.forEach(item => {
        let logList = [
          {
            opera_time: getCurrentTime(),
            des: "守兔新的待出票订单",
            level: "info",
            info: {
              newOrder: item,
              oldOrder: stayList.find(
                order => order.orderId === item.order_number
              )
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
        // 如果 orderRecord 数组没有被适当清理或管理，随着程序运行时间的增长，可能会导致内存占用增加，进而影响性能。
        // 清理过期的订单记录，例如只保留最近的50条(防止数据太大)
        if (this.orderRecord.length > 50) {
          this.orderRecord.shift();
        }
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
          order.app_name = offerRecord.app_name;
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
      let params = {
        page: 1,
        appealStatus: "",
        endInitPrice: "",
        interceptStatus: "",
        isAllowChangeSeats: "",
        isImportUser: "",
        isImportantUser: 0,
        orderType: "",
        page: 1,
        pagesize: 20,
        sortField: "",
        sortType: "",
        startInitPrice: ""
      };
      // console.log(conPrefix + "获取守兔待出票订单列表参数", params);
      const res = await shoutuApi.stayTicketingList(params);
      let list = res?.data?.order_list || [];
      try {
        shoutuApi.findWaitRange({});
        shoutuApi.findWaitNum({});
      } catch (error) {}
      if (list.length) {
        // console.log(
        //   conPrefix + "获取守兔待出票列表返回0",
        //   JSON.parse(JSON.stringify(list))
        // );
        list = list.filter(
          item =>
            !this.platOrderList.some(itemA => itemA.orderId === item.orderId)
        );
        this.platOrderList.push(...list);
        let ln = this.platOrderList.length;
        if (ln > 100) {
          this.platOrderList = this.platOrderList.slice(-100);
        }
      }
      // console.log(
      //   conPrefix + "获取守兔待出票列表返回1",
      //   JSON.parse(JSON.stringify(list))
      // );
      return list;
    } catch (error) {
      console.error("获取守兔待出票列表异常", error);
      return [];
    }
  }
}
// 报价队列实例
const orderFetchQueue = new OrderAutoFetchQueue();

// 获取出票记录
const getTicketList = async () => {
  try {
    const ticketRes = await svApi.queryTicketList({
      user_id: tokens.userInfo?.user_id,
      plat_name: "shoutu",
      page_num: 1,
      page_size: 30,
      isNeedTotalNum: 0,
      queryFields: "order_number,app_name"
    });
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error(conPrefix + "获取守兔历史出票记录异常", error);
    return [];
  }
};

export default orderFetchQueue;
