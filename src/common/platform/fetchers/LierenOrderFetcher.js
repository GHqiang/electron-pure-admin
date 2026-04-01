// 猎人平台订单获取
// 继承BaseOrderFetcher，实现猎人平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import LierenAdapter from "../adapters/LierenAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import { LIERENR_REWARDS } from "@/common/constant.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

/**
 * 猎人平台订单获取
 */
export default class LierenOrderFetcher extends BaseOrderFetcher {
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
      let newOrders = this.filterNewOrders(filteredList);
      // 支持换座时此处不再单一根据订单号过滤，放到后面根据出票记录过滤
      if (dictStore.dictInfo.lierenIsSupportChangeSeat == 1) {
        newOrders = filteredList.slice();
      }
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
      if (newOrders?.length && !this.isTestOrder) {
        const ticketList = await this.getTicketList();
        // 座位状态：0正常出票 1-申请换座中 2-客服返回有原座 5-供应商取消换座 3-换座成功 4-不支持换座取消中 （座位状态为0，2，3，5时可出票，其他状态请等待座位状态变更）
        const finalOrders = newOrders.filter(item => {
          const ticketInfo = ticketList.find(
            itemA =>
              itemA.app_name === item.appName &&
              itemA.order_number === item.order_number
          );
          let isTicket = ticketInfo ? true : false;
          if (ticketInfo && dictStore.dictInfo.lierenIsSupportChangeSeat == 1) {
            // 如果订单发起过换座申请（订单状态为9），则需要校验座位状态是否可以出票,0235可出票即当做没出过票
            isTicket =
              ticketInfo.order_status === 9
                ? ![(0, 2, 3, 5)].includes(item.seat_status)
                : true;
          }
          return !isTicket;
        });

        if (!finalOrders?.length) return;

        console.warn("待出票列表新订单", finalOrders);

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
      console.error("获取订单列表异常", error);
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
      let filteredList = res.filter(
        item =>
          !this.platOrderList.some(
            itemA => itemA.order_number === item.order_number
          )
      );
      // 如果支持换座，仅过滤掉座位状态为申请换座中和不支持换座取消中的订单
      if (dictStore.dictInfo.lierenIsSupportChangeSeat == 1) {
        // 过滤已记录的订单
        filteredList = res.filter(
          item =>
            // 座位状态：1-申请换座中 4-不支持换座取消中
            ![1, 4].includes(item.seat_status)
        );
      }

      // 添加奖励信息
      const processedList = filteredList.map(item => ({
        ...item,
        rewards: LIERENR_REWARDS[item.order_urgent] || 0 // 0-普通 1-加急 2-特急 3-vip
      }));

      // 记录平台订单
      this.recordPlatformOrders(processedList);

      return processedList;
    } catch (error) {
      console.error("获取猎人待出票列表异常", error);
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
      console.error("获取猎人历史出票记录异常", error);
      this.logger.errorSave("获取猎人历史出票记录异常", { error });
      return [];
    }
  }
}
