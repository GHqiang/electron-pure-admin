// 麻花平台报价队列
// 继承BaseOfferQueue，实现麻花平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import MahuaAdapter from "../adapters/MahuaAdapter.js";
import { getCurrentTime, logUpload, mockDelay } from "@/utils/utils.js";
import Logger from "../../logger.js";

/**
 * 麻花平台报价队列
 */
export default class MahuaOfferQueue extends BaseOfferQueue {
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
          id,
          salePrice: maoyan_price,
          discountPriceUp: supplier_max_price,
          movieCityName: city_name,
          buyNum: ticket_num,
          movieCinemaName: cinema_name,
          movieHallName: hall_name,
          movieName: film_name,
          movieShowTime: show_time,
          movieCinemaAddress: cinema_addr,
          standardId: cinema_code,
          biddingEndtime: offer_end_time,
          buySeats: lockseat
        } = item;
        return {
          plat_name: "mahua",
          id: id,
          tpp_price: maoyan_price,
          supplier_max_price: supplier_max_price,
          city_name: city_name,
          cinema_addr: cinema_addr,
          ticket_num: ticket_num,
          cinema_name: cinema_name,
          hall_name: hall_name,
          film_name: film_name,
          show_time: show_time,
          lockseat,
          rewards: 0, // 麻花无奖励，只有快捷
          is_urgent: 0, // 1紧急 0非紧急
          cinema_group: "",
          cinema_code: cinema_code, // 影院id
          order_number: id,
          // 转为截止时间戳
          offer_end_time: +new Date(offer_end_time)
        };
      });

      // 与 lieren 同口径：映射 + 同角色登录；写 C1/A17/B
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
          stayList.find(itemA => itemA.id === item.order_number)
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
          plat_name: "mahua",
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
