// 哈哈平台报价队列
// 继承BaseOfferQueue，实现哈哈平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import HahaAdapter from "../adapters/HahaAdapter.js";
import {
  getCinemaCode,
  getCurrentTime,
  logUpload,
  mockDelay
} from "@/utils/utils.js";
import Logger from "../../logger.js";

/**
 * 哈哈平台报价队列
 */
export default class HahaOfferQueue extends BaseOfferQueue {
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

      // 转换订单格式（cinema_code 仍按原逻辑用 getCinemaCode 解析）
      const normalized = stayList
        .map(item => {
          const {
            id,
            maoyan_price,
            maxPrice,
            cityName,
            address,
            seat_num,
            cinemaName,
            hallName,
            movieName,
            image,
            time,
            order_id
          } = item;
          return {
            plat_name: "haha",
            id: id,
            tpp_price: maoyan_price,
            supplier_max_price: Number(maxPrice),
            city_name: cityName,
            cinema_addr: address,
            ticket_num: seat_num,
            cinema_name: cinemaName,
            hall_name: hallName,
            film_name: movieName,
            film_img: image,
            show_time: time,
            rewards: 0, // 哈哈无奖励，只有快捷
            is_urgent: 0, // 1紧急 0非紧急
            cinema_group: "", // 哈哈没有影院标识
            cinema_code: "", // 影院id
            order_number: order_id,
            // 转为截止时间戳，原值： 1727009811
            offer_end_time: item.endDownTime * 1000
          };
        })
        .map(item => ({
          ...item,
          cinema_code: getCinemaCode(item),
          plat_name: "haha"
        }));

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
          stayList.find(itemA => itemA.order_id === item.order_number)
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
          plat_name: "haha",
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
