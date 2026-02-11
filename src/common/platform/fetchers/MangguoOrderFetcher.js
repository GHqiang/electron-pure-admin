// 芒果平台订单获取
// 继承BaseOrderFetcher，实现芒果平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import MangguoAdapter from "../adapters/MangguoAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

/**
 * 芒果平台订单获取
 */
export default class MangguoOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new MangguoAdapter(logger, isTestOrder);
    super(adapter, "mangguo", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.mangguoOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            id,
            maoyan_price,
            supplier_end_price,
            city_name,
            relation_to_cinema,
            relation_to_seat,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            is_urgent,
            order_number,
            line_name
          } = item;

          return {
            id,
            tpp_price: maoyan_price,
            supplier_end_price,
            city_name,
            cinema_addr: relation_to_cinema?.cinema_addr || "",
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            rewards: 0,
            is_urgent,
            cinema_group: line_name,
            cinema_code: relation_to_cinema?.cinema_code,
            order_number,
            lockseat:
              relation_to_seat
                ?.map(itemA => itemA.position_seat.replace(/\s+/g, ""))
                .join(" ") || "",
            plat_name: "mangguo"
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

      // 记录日志
      const logList = [
        {
          opera_time: getCurrentTime(),
          des: `${name}：芒果获取待出票列表返回`,
          level: "info",
          info: {
            stayList: newOrders
          }
        }
      ];

      logUpload(
        {
          plat_name: "mangguo",
          app_name: "",
          order_number: "",
          type: 2
        },
        logList
      );

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
              des: "芒果新的待出票订单",
              level: "info",
              info: {
                newOrder: item,
                oldOrder: rawStayList.find(
                  order => order.order_number === item.order_number
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
   * 获取芒果待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async mangguoOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item =>
          !this.platOrderList.some(
            itemA => itemA.order_number === item.order_number
          )
      );

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取芒果待出票列表异常", error);
      this.logger.errorSave("获取芒果待出票列表异常", { error });
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
        plat_name: "mangguo",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取芒果历史出票记录异常", error);
      this.logger.errorSave("获取芒果历史出票记录异常", { error });
      return [];
    }
  }
}
