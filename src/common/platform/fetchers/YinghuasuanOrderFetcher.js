// 影划算平台订单获取
// 继承BaseOrderFetcher，实现影划算平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import YinghuasuanAdapter from "../adapters/YinghuasuanAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload, mockDelay } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

/**
 * 影划算平台订单获取
 */
export default class YinghuasuanOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new YinghuasuanAdapter(logger, isTestOrder);
    super(adapter, "yinghuasuan", isTestOrder);
    // 已接单列表（用于匹配过滤待出票订单）
    this.confirmOrderList = [];
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      // 影划算特殊逻辑：先获取待确认列表并确认接单
      await this.getStayConfirmOrderAndSure();
      await mockDelay(1);
      
      // 然后获取待出票列表
      const rawStayList = await this.yinghuasuanOrderFetch();

      if (!rawStayList?.length) return;

      // 获取报价记录
      const offerList = await this.getOfferList();

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          // 待出票列表的record_id和待确认列表的in_id一致
          const order_number = this.confirmOrderList.find(
            itemA => itemA.in_id == item.record_id
          )?.offer_order_number;

          const {
            quote_price: supplier_end_price,
            order_sn,
            is_lock_seat,
            net_price: tpp_price,
            demands,
            record_id
          } = item;

          if (!demands) return null;

          const {
            quick_reward,
            city_name,
            cinema_address: cinema_addr,
            seat_num: ticket_num,
            cinema_name,
            hall_name,
            film_name,
            show_time,
            seat_no,
            standard_id: cinema_code,
            brand_name: cinema_group
          } = demands;

          return {
            id: order_sn || "",
            order_sn,
            plat_order_sn: order_sn,
            tpp_price,
            supplier_end_price,
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            show_time,
            rewards: 0,
            cinema_group,
            cinema_code,
            order_number, // 通过record_id匹配获取
            is_lock_seat,
            lockseat: seat_no ? seat_no.split(",").join(" ") : "",
            plat_name: "yinghuasuan",
            record_id // 保留用于日志
          };
        })
        .filter(item => item && getCinemaFlag(item) && item.order_number)
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
          // 先根据order_number(offer_order_number)获取已确认的in_id，再根据in_id对比record_id获取原订单
          // 注意：旧实现中使用 itemA.in_id === item.order_number，但item.order_number是offer_order_number
          // 所以应该使用 offer_order_number 来匹配
          const confirmItem = this.confirmOrderList.find(
            itemA => itemA.offer_order_number === item.order_number
          );
          const originalOrder = rawStayList.find(
            itemA => itemA.record_id === confirmItem?.in_id
          );

          const logList = [
            {
              opera_time: getCurrentTime(),
              des: "影划算新的待出票订单",
              level: "info",
              info: {
                newOrder: item,
                oldOrder: originalOrder
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
   * 获取待确认订单并接单
   * @returns {Promise<void>}
   */
  async getStayConfirmOrderAndSure() {
    try {
      // 获取待确认订单列表
      let list = await this.platformAdapter.fetchStayConfirmList({});
      
      // 从已接单列表里过滤
      list = list.filter(
        item => !this.confirmOrderList.some(itemA => itemA.in_id === item.in_id)
      );

      if (!list?.length) return;

      // 获取报价记录
      const offerList = await this.getOfferList();

      // 匹配报价记录
      list = list.filter(item =>
        offerList.some(itemA => itemA.order_id === item.in_id)
      );

      // 确认接单
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const res = await this.platformAdapter.confirmOrder({
          in_id: item.in_id
        });

        if (!res?.error) {
          const offerRecord = offerList.find(
            itemA => itemA.order_id === item.in_id
          );
          this.confirmOrderList.push({
            ...item.demands,
            in_id: item.in_id,
            bro_id: item.bro_id,
            quote_price: item.quote_price,
            offer_order_number: offerRecord?.order_number
          });

          // 防止数据太大占用系统内存
          if (this.confirmOrderList.length > 30) {
            this.confirmOrderList = this.confirmOrderList.slice(20);
          }
        }
      }
    } catch (error) {
      console.error("获取待确认订单并接单异常", error);
      this.logger.errorSave("获取待确认订单并接单异常", { error });
    }
  }

  /**
   * 获取影划算待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async yinghuasuanOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item =>
          !this.platOrderList.some(itemA => itemA.record_id === item.record_id)
      );

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取影划算待出票列表异常", error);
      this.logger.errorSave("获取影划算待出票列表异常", { error });
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
        plat_name: "yinghuasuan",
        order_status: 1,
        page_num: 1,
        page_size: 100,
        isNeedTotalNum: 0,
        queryFields: "order_id,order_number,app_name"
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error("获取影划算历史报价记录异常", error);
      this.logger.errorSave("获取影划算历史报价记录异常", { error });
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
        plat_name: "yinghuasuan",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取影划算历史出票记录异常", error);
      this.logger.errorSave("获取影划算历史出票记录异常", { error });
      return [];
    }
  }
}
