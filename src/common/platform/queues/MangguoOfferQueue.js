// 芒果平台报价队列
// 继承BaseOfferQueue，实现芒果平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import MangguoAdapter from "../adapters/MangguoAdapter.js";
import {
  getCinemaFlag,
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload,
  mockDelay
} from "@/utils/utils.js";
import { GET_APP_INFO } from "@/common/constant.js";
import Logger from "../../logger.js";

/**
 * 芒果平台报价队列
 */
export default class MangguoOfferQueue extends BaseOfferQueue {
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
   * @param {number} fetchDelay - 获取间隔
   * @returns {Promise<void>}
   */
  async fetchOrders(fetchDelay) {
    try {
      await mockDelay(fetchDelay);

      // 获取待报价列表
      const stayList = await this.getStayOfferList();
      if (!stayList?.length) return;

      // 转换订单格式
      const processedList = stayList
        .map(item => {
          const {
            id,
            maoyan_price,
            supplier_max_price,
            city_name,
            relation_to_cinema,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            is_urgent,
            order_number,
            cinemaid,
            line_name // 品牌名 上影上海、上影二线等
          } = item;
          return {
            plat_name: "mangguo",
            id: id,
            tpp_price: maoyan_price,
            supplier_max_price: supplier_max_price,
            city_name: city_name,
            cinema_addr: relation_to_cinema?.cinema_addr || "",
            ticket_num: ticket_num,
            cinema_name: cinema_name,
            hall_name: hall_name,
            film_name: film_name,
            film_img: film_img,
            show_time: show_time,
            rewards: 0, // 芒果无奖励，只有快捷
            is_urgent: is_urgent, // 1紧急 0非紧急
            cinema_group: line_name,
            cinema_code: relation_to_cinema?.cinema_code || "", // 影院id
            order_number: order_number,
            // 转为截止时间戳，原值： 180 倒计时(单位秒)
            offer_end_time: +new Date() + item.quote_countdown * 1000
          };
        })
        .filter(item => {
          const appFlag = getCinemaFlag(item);
          // 如果没有对应登录信息先过滤掉
          const appLoginInfo = getCinemaLoginInfoList().find(
            loginItem =>
              loginItem.app_name === appFlag &&
              loginItem.mobile &&
              loginItem.session_id
          );
          return appLoginInfo && appFlag;
        })
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code
          };
        });

      if (!processedList?.length) return;

      // 过滤已处理的订单
      const newOrders = processedList.filter(
        item => !this.handledOrders.has(item.order_number)
      );

      if (!newOrders?.length) return;

      // 处理新订单
      newOrders.forEach(item => {
        this.handleNewOrder(
          item,
          stayList.find(itemA => itemA.order_number == item.order_number)
        );
      });
    } catch (error) {
      console.error("获取待报价订单异常", error);
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
          plat_name: "mangguo",
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
