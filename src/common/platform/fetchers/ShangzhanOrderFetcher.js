// 商展平台订单获取
// 继承BaseOrderFetcher，实现商展平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import ShangzhanAdapter from "../adapters/ShangzhanAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, parseTimeStr } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { GET_APP_INFO } from "@/common/constant.js";

const tokens = platTokens();

/**
 * 商展平台订单获取
 */
export default class ShangzhanOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new ShangzhanAdapter(logger, isTestOrder);
    super(adapter, "shangzhan", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.shangzhanOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            id,
            bidding_data,
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            seatdata,
            cinema_code = "",
            cinema_group = "",
            order_sn
          } = item;

          return {
            id,
            tpp_price: "",
            supplier_end_price: Number(bidding_data?.[0]?.price_ori || 0),
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time: parseTimeStr(show_time)?.startTime || show_time,
            rewards: 0,
            is_urgent: "",
            cinema_group,
            cinema_code,
            order_number: order_sn,
            lockseat: seatdata ? seatdata.split(",").join(" ") : "",
            plat_name: "shangzhan"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code
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
          // 走 Logger 采集（v3Mode 系列同步进 L2 明细），des 保持原文案
          this.logOrderEvent(item, "info", "商展新的待出票订单", {
            newOrder: item,
            oldOrder: rawStayList.find(
              itemA => itemA.order_sn === item.order_number
            )
          });

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
   * 获取商展待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async shangzhanOrderFetch() {
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
      console.error("获取商展待出票列表异常", error);
      this.logger.errorSave("获取商展待出票列表异常", { error });
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
        plat_name: "shangzhan",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取商展历史出票记录异常", error);
      this.logger.errorSave("获取商展历史出票记录异常", { error });
      return [];
    }
  }
}
