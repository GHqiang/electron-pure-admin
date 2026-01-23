// 商展平台报价队列
// 继承BaseOfferQueue，实现商展平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import ShangzhanAdapter from "../adapters/ShangzhanAdapter.js";
import {
  getCinemaFlag,
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload,
  mockDelay,
  parseTimeStr
} from "@/utils/utils.js";
import { GET_APP_INFO } from "@/common/constant.js";
import Logger from "../../logger.js";

/**
 * 商展平台报价队列
 */
export default class ShangzhanOfferQueue extends BaseOfferQueue {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new ShangzhanAdapter(logger, isTestOrder);
    super(adapter, "shangzhan", isTestOrder);
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
            order_sn: id,
            order_detail,
            city_name,
            address: cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img = "",
            show_time,
            is_urgent = "",
            cinema_code = ""
          } = item;
          return {
            plat_name: "shangzhan",
            id,
            tpp_price: order_detail[0]?.price_ori,
            supplier_max_price: order_detail[0]?.check_price,
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time: parseTimeStr(show_time)?.startTime || show_time,
            rewards: 0, // 商展无奖励，只有快捷
            is_urgent, // 1紧急 0非紧急
            cinema_group: "",
            cinema_code, // 影院id
            order_number: item.order_sn || "",
            lockseat: "",
            order_detail
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
          stayList.find(itemA => itemA.order_sn === item.order_number)
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
          plat_name: "shangzhan",
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
