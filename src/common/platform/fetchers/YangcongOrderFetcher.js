// 洋葱平台订单获取
// 继承BaseOrderFetcher，实现洋葱平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import YangcongAdapter from "../adapters/YangcongAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
import { useYangcongCinemaList } from "@/store/specialNameRule.js";

const yangcongCinemaListObj = useYangcongCinemaList();
/**
 * 洋葱平台订单获取
 */
export default class YangcongOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new YangcongAdapter(logger, isTestOrder);
    super(adapter, "yangcong", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.yangcongOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            tradeno,
            unitPrice,
            baojia,
            cityName,
            cinemaAddress,
            seatNames,
            quantity,
            cinemaName,
            hallName,
            movieName,
            logoUrl,
            playTime,
            cinemaChain,
            standardCode
          } = item;

          return {
            id: tradeno,
            tpp_price: unitPrice,
            supplier_end_price: baojia,
            city_name: cityName,
            cinema_addr: cinemaAddress,
            ticket_num: quantity,
            cinema_name: cinemaName,
            hall_name: hallName,
            film_name: movieName,
            film_img: logoUrl,
            show_time: playTime,
            rewards: 0,
            is_urgent: "",
            cinema_group: cinemaChain,
            cinema_code: standardCode,
            order_number: tradeno,
            lockseat: seatNames ? seatNames.split("|").join(" ") : "",
            plat_name: "yangcong"
          };
        })
        .filter(item => item.cinema_code && getCinemaFlag(item))
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
              des: "洋葱新的待出票订单",
              level: "info",
              info: {
                newOrder: item,
                oldOrder: rawStayList.find(
                  order => order.tradeno === item.order_number
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
   * 获取洋葱待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async yangcongOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item =>
          !this.platOrderList.some(itemA => itemA.tradeno === item.tradeno)
      );

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取洋葱待出票列表异常", error);
      this.logger.errorSave("获取洋葱待出票列表异常", { error });
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
        plat_name: "yangcong",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取洋葱历史出票记录异常", error);
      this.logger.errorSave("获取洋葱历史出票记录异常", { error });
      return [];
    }
  }
}
