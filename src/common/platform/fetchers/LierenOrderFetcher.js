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
      // 待出票队列调用：跳过系列禁用与登录信息检查，未登录/被禁系列订单也需先接单占位
      const filteredList = processedList
        .filter(item => getCinemaFlag(item, false, true))
        .map(item => {
          const app_name = getCinemaFlag(item, false, true);
          return {
            ...item,
            app_name,
            appName: app_name
          };
        });

      // 过滤新订单
      let newOrders = this.filterNewOrders(filteredList);
      // 支持换座时此处不再单一根据订单号过滤，放到后面根据出票记录过滤
      if (dictStore.dictInfo.supportChangeSeatPlatList.includes("lieren")) {
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
      if (!newOrders?.length) return;
      // 如果不是测试订单，从远端过滤已出票的订单
      if (!this.isTestOrder) {
        const ticketList = await this.getTicketList();
        // 根据出票记录过滤订单列表，判断是否为新订单或换座成功的订单
        newOrders = newOrders.map(item => {
          const ticketInfo = ticketList.find(
            itemA =>
              itemA.app_name === item.app_name &&
              itemA.order_number === item.order_number
          );
          let isNewOrder, changeSeatSuccess;
          if (!ticketInfo) {
            isNewOrder = true;
          } else {
            isNewOrder = false;
            // 9代表申请换座中
            if (
              dictStore.dictInfo.supportChangeSeatPlatList.includes("lieren") &&
              ticketInfo.order_status == 9
            ) {
              // 座位状态：0正常出票 1-申请换座中 2-客服返回有原座 5-供应商取消换座 3-换座成功 4-不支持换座取消中
              // （座位状态为0，2，3，5时可出票，其他状态请等待座位状态变更）
              if ([0, 2, 3, 5].includes(item.seat_status)) {
                isNewOrder = true;
                changeSeatSuccess = true;
              } else {
                changeSeatSuccess = false;
              }
              // 根据订单座位状态更新出票记录的换座信息
              this.updateTicketOrderInfo(item);
            }
          }
          return {
            ...item,
            isNewOrder,
            changeSeatSuccess
          };
        });

        const finalOrders = newOrders.filter(item => item.isNewOrder);

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
                newOrder: item,
                isAgain: item.changeSeatSuccess
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
          // 换座成功需发送重新出票消息
          if (item.changeSeatSuccess) {
            // 动态生成事件名称
            const eventName = `newOrder_${item.appName}`;
            // 创建一个事件对象
            const newOrderEvent = new CustomEvent(eventName, {
              detail: {
                // 将所有数据放入 detail 对象
                order: item,
                isAgain: true,
                // 标识为换座后的重新出票,buyTicket 据此跳过再次申请换座(防止死循环)
                isFromChangeSeat: true
              }
            });
            window.dispatchEvent(newOrderEvent);
          } else {
            this.sendNewOrderMsg(item);
          }
          this.recordOrder(item);
        });
      } else {
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

  // 更新出票记录换座信息
  async updateTicketOrderInfo(order) {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "lieren",
        order_number: order.order_number,
        isNeedTotalNum: 0,
        queryFields: "change_seat_info,order_status"
      });
      const ticketList = ticketRes.data.ticketList || [];
      let ticketInfo = ticketList[0];
      if (ticketInfo?.order_status != 9) {
        // 如果订单状态不是申请换座中，则不更新换座信息
        return;
      }

      // 0正常出票 1-申请换座中 2-客服返回有原座 3-换座成功 4-不支持换座取消中 5-供应商取消换座
      const seat_status = order.seat_status;
      const seat_status_text = [
        "正常出票",
        "申请换座中",
        "客服返回有原座",
        "换座成功",
        "不支持换座取消中",
        "供应商取消换座"
      ];
      // 原先换座信息，用于记录换座结果
      let change_seat_info = ticketInfo?.change_seat_info || "";
      if ([0, 2, 3, 5].includes(seat_status)) {
        change_seat_info += `换座结果：${seat_status}-${seat_status_text[seat_status]}，新座位：${order.lockseat}`;
        await svApi.updateTicketRecord({
          whereObj: {
            order_number: order.order_number,
            plat_name: order.plat_name,
            user_id: tokens.userInfo?.user_id
          },
          updateObj: {
            change_seat_info,
            lockseat: order.lockseat, // 新座位
            order_status: 5 // 重新出票中
          }
        });
      } else {
        // 如果已经更新过换座信息则不再更新换座结果，避免重复更新
        if (!change_seat_info?.includes("等待换座结果")) {
          change_seat_info += `换座结果：${seat_status}-${seat_status_text[seat_status]}，等待换座结果，原座位${order.lockseat}`;
          await svApi.updateTicketRecord({
            whereObj: {
              order_number: order.order_number,
              plat_name: order.plat_name,
              user_id: tokens.userInfo?.user_id
            },
            updateObj: {
              change_seat_info
            }
          });
        }
      }
    } catch (error) {}
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
      // 如果支持换座，先不过滤
      if (dictStore.dictInfo.supportChangeSeatPlatList.includes("lieren")) {
        // 过滤已记录的订单
        filteredList = res.slice(); // 先不过滤，后面根据出票记录过滤
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
        page_size: 100,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name,order_status"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取猎人历史出票记录异常", error);
      this.logger.errorSave("获取猎人历史出票记录异常", { error });
      return [];
    }
  }
}
