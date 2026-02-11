// 猎人平台报价队列
// 继承BaseOfferQueue，实现猎人平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import LierenAdapter from "../adapters/LierenAdapter.js";
import {
  getCinemaFlag,
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload,
  mockDelay
} from "@/utils/utils.js";
import { LIERENR_REWARDS, GET_APP_INFO } from "@/common/constant.js";
import Logger from "../../logger.js";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun.js";

const { getRuleIdByPlat } = usesMachineBaseFun();

/**
 * 猎人平台报价队列
 */
export default class LierenOfferQueue extends BaseOfferQueue {
  /**
   * 构造函数
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(isTestOrder = false) {
    const logger = new Logger({ logType: 1 });
    const adapter = new LierenAdapter(logger, isTestOrder);
    super(adapter, "lieren", isTestOrder);
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

      // 过滤和转换订单
      const processedList = stayList
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
            plat_name: "lieren",
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code,
            rewards: LIERENR_REWARDS[item.order_urgent] || 0, // 0-普通 1-加急 2-特急 3-vip
            offer_end_time: item.sytime * 1000 // 转为时间戳
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
          stayList.find(itemA => itemA.order_number === item.order_number)
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
          plat_name: "lieren",
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
  /**
   * 获取规则ID
   * @param {Object} order - 订单信息
   * @returns {Promise<string|number|null>} 规则ID
   */
  async getRuleId(order) {
    try {
      return await getRuleIdByPlat({
        plat_name: "lieren",
        cinema_group: order.cinema_group,
        app_name: order.app_name
      });
    } catch (error) {
      this.logger.errorSave("获取规则ID异常", { error, order });
      return null;
    }
  }
}
