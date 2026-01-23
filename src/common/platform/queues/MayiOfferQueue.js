// 蚂蚁平台报价队列
// 继承BaseOfferQueue，实现蚂蚁平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import MayiAdapter from "../adapters/MayiAdapter.js";
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
 * 蚂蚁平台报价队列
 */
export default class MayiOfferQueue extends BaseOfferQueue {
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
            tradeno,
            unitprice,
            maxBaojia,
            cityName,
            address,
            quantity,
            cinemaName,
            roomName,
            movieName,
            logo,
            playTime,
            jiorder,
            cinemaStdCode,
            cinemaChain // 品牌名 上影上海、上影二线等
          } = item;
          return {
            plat_name: "mayi",
            id: tradeno,
            tpp_price: unitprice,
            supplier_max_price: maxBaojia,
            city_name: cityName,
            cinema_addr: address,
            ticket_num: quantity,
            cinema_name: cinemaName,
            hall_name: roomName,
            film_name: movieName,
            film_img: logo,
            show_time: playTime,
            rewards: 0, // 蚂蚁无奖励，只有快捷
            is_urgent: jiorder === "Y" ? 1 : 0, // 1紧急 0非紧急
            cinema_group: cinemaChain,
            cinema_code: cinemaStdCode, // 影院code编码，和app影院code一致
            order_number: tradeno,
            // 转为截止时间戳，原值： "2024-09-22 21:02:55"
            offer_end_time: +new Date(item.addtime)
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
          stayList.find(itemA => itemA.tradeno === item.order_number)
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
          plat_name: "mayi",
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
