// 守兔平台报价队列
// 继承BaseOfferQueue，实现守兔平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import ShoutuAdapter from "../adapters/ShoutuAdapter.js";
import { getCurrentTime, logUpload, mockDelay } from "@/utils/utils.js";
import Logger from "../../logger.js";

/**
 * 守兔平台报价队列
 */
export default class ShoutuOfferQueue extends BaseOfferQueue {
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
   * @param {number} fetchDelay - 获取间隔
   * @returns {Promise<void>}
   */
  async fetchOrders(fetchDelay) {
    const stats = { returned: 0, filtered: 0, enqueued: 0, failed: false };
    try {
      await mockDelay(fetchDelay);

      // 获取待报价列表
      const stayList = await this.getStayOfferList();
      if (!stayList?.length) return;

      // 转换订单格式
      const normalized = stayList.map(item => {
        const {
          orderUUID: id,
          unitInitPrice: tpp_price,
          maxPrice: supplier_max_price,
          cinemaInfo,
          orderNum: ticket_num,
          orderId: order_number,
          isLovers,
          needInvoice // 守兔手续费分档依据（待报价接口返回）
        } = item;
        return {
          id, // 报价时使用
          plat_name: "shoutu",
          tpp_price: tpp_price,
          supplier_max_price: supplier_max_price,
          city_name: cinemaInfo[8]?.replaceAll("市", "") || "",
          cinema_addr: cinemaInfo[7] || "",
          ticket_num: ticket_num,
          cinema_name: cinemaInfo[0] || "",
          hall_name: cinemaInfo[1] || "",
          film_name: cinemaInfo[5] || "",
          film_img: cinemaInfo[6] || "",
          show_time: cinemaInfo[3] || "",
          rewards: 0, // 守兔无奖励，只有快捷
          is_urgent: 0, // 1紧急 0非紧急
          cinema_group: "",
          cinema_code: cinemaInfo[9] || "", // 影院code
          order_number: order_number,
          needInvoice,
          isLovers: isLovers, // 是否情侣座
          // 转为截止时间戳
          offer_end_time: +new Date(item.deadlineTime)
        };
      });

      const quoteable = this._collectQuoteableOrders(normalized);
      stats.returned = quoteable.length;
      this._lastFetchStats = stats;
      const { processed, filtered } = this._recordQuoteableEvidence(
        quoteable,
        stats.returned
      );
      stats.filtered = filtered;

      if (!processed?.length) return;

      // 过滤已处理的订单
      const newOrders = processed.filter(
        item => !this.handledOrders.has(`${this.platName}_${item.order_number}`)
      );
      stats.enqueued = newOrders?.length || 0;

      if (!newOrders?.length) return;

      // 处理新订单
      newOrders.forEach(item => {
        this.handleNewOrder(
          item,
          stayList.find(itemA => itemA.orderId === item.order_number)
        );
      });
    } catch (error) {
      stats.failed = true;
      console.error("获取待报价订单异常", error);
    } finally {
      this._lastFetchStats = stats;
    }
  }

  /**
   * 获取待报价订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async getStayOfferList() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchOrderList(params);
      return res || [];
    } catch (error) {
      console.error("获取待报价列表异常", error);
      logUpload(
        {
          plat_name: "shoutu",
          type: 1
        },
        [
          {
            opera_time: getCurrentTime(),
            des: "获取待报价列表异常",
            level: "error",
            info: {
              error
            }
          }
        ]
      );
      return [];
    }
  }
}
