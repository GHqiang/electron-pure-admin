// 哈哈平台订单获取
// 继承BaseOrderFetcher，实现哈哈平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import HahaAdapter from "../adapters/HahaAdapter.js";
import Logger from "../../logger.js";
import {
  getCinemaFlag,
  getCinemaCode,
  getCurrentTime,
  logUpload,
  removeLeadingZeros
} from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();

/**
 * 哈哈平台订单获取
 */
export default class HahaOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new HahaAdapter(logger, isTestOrder);
    super(adapter, "haha", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.hahaOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            id,
            maoyan_price,
            price,
            city,
            seatInfo,
            num,
            cinemaName,
            ting,
            movie,
            image,
            time,
            orderNumber,
            b_id
          } = item;

          const lockseat = seatInfo
            ? seatInfo
                .split(",")
                .map(itemA => removeLeadingZeros(itemA + "座"))
                .join(" ")
            : "";

          return {
            id,
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
            rewards: 0,
            is_urgent: 0,
            cinema_group: "",
            cinema_code: "",
            order_number: orderNumber,
            lockseat,
            bid: b_id,
            plat_name: "haha"
          };
        })
        .filter(item => getCinemaFlag(item))
        .map(item => {
          const app_name = getCinemaFlag(item);
          const cinema_code = getCinemaCode(item);
          return {
            ...item,
            cinema_code,
            app_name,
            appName: app_name
          };
        })
        .filter(item => item.cinema_code); // 过滤掉没有cinema_code的订单

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
   * 获取哈哈待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async hahaOrderFetch() {
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
      console.error("获取哈哈待出票列表异常", error);
      this.logger.errorSave("获取哈哈待出票列表异常", { error });
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
        plat_name: "haha",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取哈哈历史出票记录异常", error);
      this.logger.errorSave("获取哈哈历史出票记录异常", { error });
      return [];
    }
  }
}
