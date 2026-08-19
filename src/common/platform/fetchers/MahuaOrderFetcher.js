// 麻花平台订单获取
// 继承BaseOrderFetcher，实现麻花平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import MahuaAdapter from "../adapters/MahuaAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();

/**
 * 麻花平台订单获取
 */
export default class MahuaOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new MahuaAdapter(logger, isTestOrder);
    super(adapter, "mahua", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.mahuaOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList.map(item => {
        const {
          id,
          biddingPrice: supplier_end_price,
          movieCityName: city_name,
          movieCinemaAddress: cinema_addr,
          buyNum: ticket_num,
          movieCinemaName: cinema_name,
          movieHallName: hall_name,
          movieName: film_name,
          movieShowTime: show_time,
          acceptChangeSeat
        } = item;

        return {
          id,
          tpp_price: "",
          supplier_end_price,
          city_name,
          cinema_addr,
          ticket_num,
          cinema_name,
          hall_name,
          film_name,
          show_time,
          rewards: 0,
          is_urgent: 0,
          cinema_group: "",
          cinema_code: "",
          // 出票单号（待出票列表id），用于平台操作与出票记录展示
          plat_order_sn: id,
          offer_order_number: "",
          // 先占位为出票单号，orderDetail 后替换为报价单号（与报价记录对齐）
          order_number: id,
          lockseat: "",
          acceptChangeSeat,
          plat_name: "mahua"
        };
      });
      let orderList = [];
      const diagnoseLogs = [];

      for (let index = 0; index < processedList.length; index++) {
        const orderItem = processedList[index];
        const res = await this.platformAdapter.orderDetail({
          getOrderId: orderItem.id
        });
        if (res) {
          diagnoseLogs.push({
            opera_time: getCurrentTime(),
            des: "麻花订单详情返回",
            level: res.standardId ? "info" : "warn",
            info: {
              orderId: orderItem.id,
              cinema_name: orderItem.cinema_name,
              standardId: res.standardId,
              putOrderId: res.putOrderId,
              fullRes: res
            }
          });
          orderList.push({
            ...orderItem,
            cinema_code: res.standardId,
            // 报价单号：出票记录 order_number 与报价记录对齐，保证可按订单号互查
            order_number: res.putOrderId || orderItem.id,
            offer_order_number: res.putOrderId || orderItem.id,
            // 换座标识：优先取订单详情接口，兜底取待出票列表
            acceptChangeSeat:
              res?.acceptChangeSeat ?? orderItem.acceptChangeSeat
          });
        } else {
          diagnoseLogs.push({
            opera_time: getCurrentTime(),
            des: "麻花订单详情接口返回空",
            level: "warn",
            info: { orderId: orderItem.id, cinema_name: orderItem.cinema_name }
          });
        }
      }

      const beforeFilterLen = orderList.length;
      orderList = orderList
        .filter(item => item.cinema_code && getCinemaFlag(item))
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name
          };
        });
      const afterFilterLen = orderList.length;

      if (beforeFilterLen !== afterFilterLen) {
        diagnoseLogs.push({
          opera_time: getCurrentTime(),
          des: "麻花订单getCinemaFlag过滤",
          level: "info",
          info: { 过滤前: beforeFilterLen, 过滤后: afterFilterLen }
        });
      }

      // 过滤新订单
      const newOrders = this.filterNewOrders(orderList);

      if (diagnoseLogs.length) {
        logUpload(
          { plat_name: "mahua", app_name: "", order_number: "", type: 2 },
          diagnoseLogs
        );
      }

      // 如果不是测试订单，从远端过滤已出票的订单
      if (newOrders?.length && !this.isTestOrder) {
        const ticketList = await this.getTicketList();
        const finalOrders = newOrders.filter(item => {
          const isTicket = ticketList
            .filter(itemA => itemA.app_name === item.appName)
            .some(itemA => itemA.order_number === item.order_number);
          return !isTicket;
        });

        if (!finalOrders?.length) return;

        console.warn("待出票列表新订单", finalOrders);

        // 发送新订单消息
        finalOrders.forEach(item => {
          const logList = [
            {
              opera_time: getCurrentTime(),
              des: "麻花新的待出票订单",
              level: "info",
              info: {
                newOrder: item,
                oldOrder: rawStayList.find(
                  order => order.id === item.order_number
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

          this.sendNewOrderMsg(item);
          this.recordOrder(item);
        });
      } else if (newOrders?.length) {
        // 测试订单直接发送
        logUpload(
          { plat_name: "mahua", app_name: "", order_number: "", type: 2 },
          [
            {
              opera_time: getCurrentTime(),
              des: "麻花测试订单直接发送",
              level: "info",
              info: { orders: newOrders }
            }
          ]
        );
        newOrders.forEach(item => {
          this.sendNewOrderMsg(item);
          this.recordOrder(item);
        });
      }
    } catch (error) {
      console.error("获取订单列表异常", error);
      this.logger.errorSave("获取订单列表异常", { error });
    }
  }

  /**
   * 获取麻花待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async mahuaOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item => !this.platOrderList.some(itemA => itemA.id === item.id)
      );

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取麻花待出票列表异常", error);
      this.logger.errorSave("获取麻花待出票列表异常", { error });
      return [];
    }
  }

  /**
   * 获取报价记录
   * @returns {Promise<Array>} 报价记录列表
   */
  async getOfferList() {
    try {
      const res = await svApi.queryOfferList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "mahua",
        page_num: 1,
        page_size: 50,
        isNeedTotalNum: 0,
        queryFields:
          "order_number,app_name,cinema_code,show_time,cinema_name,hall_name,film_name,ticket_num"
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error("获取麻花历史报价记录异常", error);
      this.logger.errorSave("获取麻花历史报价记录异常", { error });
      return [];
    }
  }

  /**
   * 获取出票记录
   * @returns {Promise<Array>} 出票记录列表
   */
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "mahua",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取麻花历史出票记录异常", error);
      this.logger.errorSave("获取麻花历史出票记录异常", { error });
      return [];
    }
  }
}
