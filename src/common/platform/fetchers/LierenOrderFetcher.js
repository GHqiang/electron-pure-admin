// 猎人平台订单获取
// 继承BaseOrderFetcher，实现猎人平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import LierenAdapter from "../adapters/LierenAdapter.js";
import {
  getCinemaFlag,
  getCurrentTime,
  logUpload,
  getCinemaLoginInfoList,
  sendWxPusherMessage
} from "@/utils/utils.js";
import { GET_APP_INFO, LIERENR_REWARDS } from "@/common/constant.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

// 标记测试订单状态
let isTestOrder = false;

/**
 * 猎人平台订单获取
 */
export default class LierenOrderFetcher extends BaseOrderFetcher {
  /**
   * 构造函数
   */
  constructor() {
    const adapter = new LierenAdapter();
    super(adapter, "lieren");
    this.isTestOrder = false;
  }

  /**
   * 获取订单
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const stayList = await this.lierenOrderFetch();
      
      if (!stayList?.length) return;

      // 添加平台标识
      const processedList = stayList.map(item => ({
        ...item,
        plat_name: "lieren"
      }));

      // 先过滤出来目前已上架影院的，然后添加影院标识
      const filteredList = processedList
        .filter(item => getCinemaFlag(item))
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name
          };
        });

      // 过滤新订单
      const newOrders = this.filterNewOrders(filteredList);

      // 记录日志
      const logList = [
        {
          opera_time: getCurrentTime(),
          des: `${name}：猎人获取待出票列表返回`,
          level: "info",
          info: {
            stayList: newOrders
          }
        }
      ];

      logUpload(
        {
          plat_name: "lieren",
          app_name: "",
          order_number: "",
          type: 2
        },
        logList
      );

      // 如果不是测试订单，从远端过滤已出票的订单
      if (newOrders?.length && !isTestOrder && !this.isTestOrder) {
        const ticketList = await this.getTicketList();
        const finalOrders = newOrders.filter(item => {
          const isTicket = ticketList
            .filter(itemA => itemA.app_name === item.appName)
            .some(itemA => itemA.order_number === item.order_number);
          return !isTicket;
        });

        if (!finalOrders?.length) return;

        console.warn(this.conPrefix + "待出票列表新订单", finalOrders);

        // 发送新订单消息
        finalOrders.forEach(item => {
          const logList = [
            {
              opera_time: getCurrentTime(),
              des: "猎人新的待出票订单",
              level: "info",
              info: {
                newOrder: item
              }
            }
          ];

          logUpload(
            {
              plat_name: item.plat_name,
              app_name: item.appName,
              order_number: item.order_number,
              type: 2
            },
            logList
          );

          this.sendNewOrderMsg(item);
          this.recordOrder(item);
        });
      } else if (newOrders?.length) {
        // 测试订单直接发送
        newOrders.forEach(item => {
          this.sendNewOrderMsg(item);
          this.recordOrder(item);
        });
      }
    } catch (error) {
      console.error(this.conPrefix + "获取订单列表异常", error);
      this.logger.errorSave("获取订单列表异常", { error });
    }
  }

  /**
   * 获取猎人待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async lierenOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item =>
          !this.platOrderList.some(
            itemA => itemA.order_number === item.order_number
          )
      );

      // 添加奖励信息
      const processedList = filteredList.map(item => ({
        ...item,
        rewards: LIERENR_REWARDS[item.order_urgent] || 0 // 0-普通 1-加急 2-特急 3-vip
      }));

      // 记录平台订单
      this.recordPlatformOrders(processedList);

      // 测试订单处理
      if (isTestOrder || this.isTestOrder) {
        const mockRes = {
          success: true,
          code: 1,
          message: "成功！",
          total: 1,
          data: [
            {
              id: 7787887,
              supplier_id: 714632,
              order_number: "2024100520441715153",
              tpp_price: "79.00",
              ticket_num: 2,
              city_name: "北京",
              cinema_addr:
                "徐汇区凯滨路218号绿地缤纷城中庭3楼（近东安路、龙华中路）",
              cinema_name: "卢米埃北京芳草地影城",
              hall_name: "7号厅",
              film_name: "浴火之路",
              show_time: "2024-10-06 21:40:00",
              lockseat: "5排8座 5排9座",
              cinema_code: "31074201",
              supplier_end_price: 39.5,
              cinema_group: "卢米埃"
            }
          ],
          time: 1710125670
        };
        return mockRes.data || [];
      }

      return processedList;
    } catch (error) {
      console.error(this.conPrefix + "获取猎人待出票列表异常", error);
      this.logger.errorSave("获取猎人待出票列表异常", { error });
      return [];
    }
  }

  /**
   * 获取出票记录
   * @returns {Promise<Array>} 出票记录列表
   */
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "lieren",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error(this.conPrefix + "获取猎人历史出票记录异常", error);
      this.logger.errorSave("获取猎人历史出票记录异常", { error });
      return [];
    }
  }
}
