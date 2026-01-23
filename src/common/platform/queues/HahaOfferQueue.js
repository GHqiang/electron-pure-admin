// 哈哈平台报价队列
// 继承BaseOfferQueue，实现哈哈平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import HahaAdapter from "../adapters/HahaAdapter.js";
import {
  getCinemaFlag,
  getCinemaCode,
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload,
  mockDelay
} from "@/utils/utils.js";
import { GET_APP_INFO } from "@/common/constant.js";
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
            maxPrice,
            cityName,
            address,
            seat_num,
            cinemaName,
            hallName,
            movieName,
            image,
            time,
            order_id,
            cinemaId
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
          const cinema_code = getCinemaCode(item);
          return {
            ...item,
            cinema_code,
            plat_name: "haha",
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code
          };
        })
        .filter(item => item.cinema_code);

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
          stayList.find(itemA => itemA.order_id === item.order_number)
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
