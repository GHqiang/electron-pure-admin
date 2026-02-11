// 影划算平台报价队列
// 继承BaseOfferQueue，实现影划算平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import YinghuasuanAdapter from "../adapters/YinghuasuanAdapter.js";
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
 * 影划算平台报价队列
 */
export default class YinghuasuanOfferQueue extends BaseOfferQueue {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new YinghuasuanAdapter(logger, isTestOrder);
    super(adapter, "yinghuasuan", isTestOrder);
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
            invitation_id: id,
            net_price: tpp_price,
            max_price: supplier_max_price,
            // deal_price, // 立即成交价格
            allow_last_time, // 该字段大于0，属于限时单，需要在该字段的时间戳前出票
            // seckill_point, // 秒杀所需积分
            // quick_reward, // 1代表有额外奖励
            city_name,
            cinema_address: cinema_addr,
            seat_num: ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_pic: film_img,
            show_time,
            standard_id
          } = item;
          return {
            plat_name: "yinghuasuan",
            id,
            tpp_price,
            supplier_max_price,
            city_name,
            cinema_addr,
            ticket_num,
            cinema_name,
            hall_name,
            film_name,
            film_img,
            show_time,
            rewards: 0, // 影划算无奖励，只有快捷
            allow_last_time, // 该字段大于0，属于限时单，需要在该字段的时间戳前出票
            cinema_group: "",
            cinema_code: standard_id || "", // 影院code
            order_number: id || "",
            order_sn: id || "", // 影划算使用 order_sn
            lockseat: "",
            // 转为截止时间戳，原值： 1727009794
            offer_end_time: item.stop_time * 1000
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
          stayList.find(itemA => itemA.invitation_id === item.order_number)
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
          plat_name: "yinghuasuan",
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
