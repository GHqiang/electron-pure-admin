// 守兔平台订单获取
// 继承BaseOrderFetcher，实现守兔平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import ShoutuAdapter from "../adapters/ShoutuAdapter.js";
import Logger from "../../logger.js";
import {
  getCinemaFlag,
  getCurrentTime,
  logUpload,
  removeParenthesesContent
} from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

/**
 * 守兔平台订单获取
 */
export default class ShoutuOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new ShoutuAdapter(logger, isTestOrder);
    super(adapter, "shoutu", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.shoutuOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
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
            city_name: city_name ? city_name.replaceAll("市", "") : "",
            cinema_addr: "",
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            show_time: startTime,
            rewards: 0,
            is_urgent: 0,
            cinema_group: "",
            cinema_code,
            order_number,
            lockseat: lockseat
              ? removeParenthesesContent(lockseat).replaceAll("号", "座")
              : "",
            plat_name: "shoutu"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name
          };
        });

      // 过滤新订单
      const newOrders = this.filterNewOrders(processedList);

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
              des: "守兔新的待出票订单",
              level: "info",
              info: {
                newOrder: item,
                oldOrder: rawStayList.find(
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

          this.sendNewOrderMsg(item);
          this.recordOrder(item);
        });
      } else if (newOrders?.length) {
        // 测试订单直接发送
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
   * 获取守兔待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async shoutuOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item =>
          !this.platOrderList.some(itemA => itemA.orderId === item.orderId)
      );

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取守兔待出票列表异常", error);
      this.logger.errorSave("获取守兔待出票列表异常", { error });
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
        plat_name: "shoutu",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取守兔历史出票记录异常", error);
      this.logger.errorSave("获取守兔历史出票记录异常", { error });
      return [];
    }
  }
}
