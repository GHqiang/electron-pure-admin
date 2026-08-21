// 蚂蚁平台订单获取
// 继承BaseOrderFetcher，实现蚂蚁平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import MayiAdapter from "../adapters/MayiAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { GET_APP_INFO } from "@/common/constant.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

/**
 * 蚂蚁平台订单获取
 */
export default class MayiOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new MayiAdapter(logger, isTestOrder);
    super(adapter, "mayi", isTestOrder);
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.mayiOrderFetch();

      if (!rawStayList?.length) return;

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            tradeno,
            unitprice,
            baojia,
            cityName,
            address,
            seat,
            quantity,
            cinemaName,
            roomName,
            movieName,
            logo,
            playTime,
            jiorder,
            cinemaStdCode,
            cinemaChain
          } = item;

          return {
            id: tradeno,
            tpp_price: unitprice,
            supplier_end_price: baojia,
            city_name: cityName,
            cinema_addr: address,
            ticket_num: quantity,
            cinema_name: cinemaName,
            hall_name: roomName,
            film_name: movieName,
            film_img: logo,
            show_time: playTime,
            rewards: 0,
            is_urgent: jiorder === "Y" ? 1 : 0,
            cinema_group: cinemaChain,
            cinema_code: cinemaStdCode,
            order_number: tradeno,
            lockseat: seat ? seat.split(",").join(" ") : "",
            plat_name: "mayi"
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

      // 记录日志
      const logList = [
        {
          opera_time: getCurrentTime(),
          des: `${name}：蚂蚁获取待出票列表返回`,
          level: "info",
          info: {
            stayList: newOrders
          }
        }
      ];

      logUpload(
        {
          plat_name: "mayi",
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
          // 走 Logger 采集（v3Mode 系列同步进 L2 明细），des 保持原文案
          this.logOrderEvent(item, "info", "蚂蚁新的待出票订单", {
            newOrder: item,
            oldOrder: rawStayList.find(
              order => order.tradeno === item.order_number
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
   * 获取蚂蚁待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async mayiOrderFetch() {
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
      console.error("获取蚂蚁待出票列表异常", error);
      this.logger.errorSave("获取蚂蚁待出票列表异常", { error });
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
        plat_name: "mayi",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取蚂蚁历史出票记录异常", error);
      this.logger.errorSave("获取蚂蚁历史出票记录异常", { error });
      return [];
    }
  }
}
