// 省APP平台报价队列
// 继承BaseOfferQueue，实现省APP平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import ShengAdapter from "../adapters/ShengAdapter.js";
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
 * 省APP平台报价队列
 */
export default class ShengOfferQueue extends BaseOfferQueue {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new ShengAdapter(logger, isTestOrder);
    super(adapter, "sheng", isTestOrder);
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

      // 奖励百分比枚举
      const rewardsTypeObj = {
        0: 0,
        1: 1.5,
        2: 2.5,
        3: 0
      };

      // 转换订单格式
      const processedList = stayList
        .map(item => {
          const {
            orderId,
            showPrice,
            grabPrice,
            detail,
            order,
            supplierCode, // 供应商号
            seatInfo, // 座位信息
            orderCode,
            property // 奖励字段标识0 （45分钟无奖励）1（10分钟奖励中标价格1.5个点）2（五分钟奖励订单2.5个点） 3 （27分钟无奖励）
          } = item;
          const {
            quantity,
            sourceData: {
              show,
              film,
              cinema: { label, cinemaId }
            }
          } = detail;

          let cinema_group = label[0]?.name || "";
          return {
            plat_name: "sheng",
            id: orderId,
            tpp_price: showPrice,
            supplier_max_price: Number(
              (Number(grabPrice) / Number(quantity)).toFixed(2)
            ),
            city_name: film.cityName,
            cinema_addr: film.address,
            ticket_num: quantity,
            cinema_name: film.cinemaName,
            hall_name: show.hallName,
            film_name: film.filmName,
            film_img: film.imgUrl,
            show_time: show.startTime,
            rewards: rewardsTypeObj?.[property] || 0, // 奖励百分比
            quick: order.quick, // true表示为快捷订单（需12分钟内完成发货），false表示为特惠订单（需45分钟内完成发货）
            cinema_group: cinema_group,
            cinema_code: cinemaId || "",
            order_number: orderCode,
            supplierCode: supplierCode,
            seatInfo: seatInfo,
            seats: seatInfo, // 座位信息
            // 转为截止时间戳
            offer_end_time: +new Date(order.biddingEndTime)
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
          stayList.find(itemA => itemA.orderCode === item.order_number)
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
          plat_name: "sheng",
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
