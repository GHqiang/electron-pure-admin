// 省平台订单获取
// 继承BaseOrderFetcher，实现省平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import ShengAdapter from "../adapters/ShengAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

const tokens = platTokens();

/**
 * 省平台订单获取
 */
export default class ShengOrderFetcher extends BaseOrderFetcher {
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
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    try {
      const rawStayList = await this.shengOrderFetch();

      if (!rawStayList?.length) return;

      const offerList = await this.getOfferList();

      // 数据转换
      const processedList = rawStayList
        .map(item => {
          const {
            id,
            marketPrice,
            supplierPrice,
            detail,
            code,
            supplierCode,
            property
          } = item;

          const {
            quantity,
            changeSeat, // 电影票需要 是否换附近座位 0，不换（允许联系客户换座），1可以换，2不换（不允许联系客户换座）
            sourceData: { show, film, cinema, label, seats }
          } = detail;

          let cinema_group = label?.[0]?.name || cinema?.label?.[0]?.name || "";
          if (!cinema_group) {
            const targetObj = offerList.find(
              item => item.order_number === code
            );
            cinema_group = targetObj?.cinema_group || "";
          }

          return {
            id,
            tpp_price: marketPrice,
            supplier_end_price: Number(
              (Number(supplierPrice) / Number(quantity)).toFixed(2)
            ),
            city_name: film.cityName,
            cinema_addr: film.address,
            ticket_num: quantity,
            cinema_name: film.cinemaName,
            hall_name: show.hallName,
            film_name: film.filmName,
            film_img: film.imgUrl,
            show_time: show.startTime,
            rewards: "",
            quick: property,
            cinema_group,
            cinema_code: cinema.standardId,
            order_number: code,
            supplierCode,
            changeSeatApplyStatus: item.changeSeatApplyStatus, // 申请换座状态：1-拒绝，2-同意(换座成功)
            changeSeat,
            seats: seats || [],
            lockseat: (seats || []).map(itemA => itemA.name).join(" "),
            plat_name: "sheng"
          };
        })
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
      let newOrders = this.filterNewOrders(processedList);
      // 支持换座时不再单一根据订单号过滤，放到后面根据出票记录过滤
      if (dictStore.dictInfo.supportChangeSeatPlatList.includes("sheng")) {
        newOrders = processedList.slice();
      }

      // 如果不是测试订单，从远端过滤已出票的订单
      if (newOrders?.length && !this.isTestOrder) {
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
              dictStore.dictInfo.supportChangeSeatPlatList.includes("sheng") &&
              ticketInfo.order_status == 9 &&
              item.changeSeatApplyStatus
            ) {
              // changeSeatApplyStatus: 1-拒绝，2-同意(换座成功，seats是换座后座位)
              if (item.changeSeatApplyStatus === 2) {
                isNewOrder = true;
                changeSeatSuccess = true;
              } else {
                changeSeatSuccess = false;
              }
              // 根据换座状态更新出票记录的换座信息
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
              des: "省新的待出票订单",
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
            const eventName = `newOrder_${item.appName}`;
            const newOrderEvent = new CustomEvent(eventName, {
              detail: {
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
   * 获取省待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async shengOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      let filteredList = res.filter(
        item => !this.platOrderList.some(itemA => itemA.code === item.code)
      );
      // 如果支持换座，先不过滤，后面根据出票记录过滤
      if (dictStore.dictInfo.supportChangeSeatPlatList.includes("sheng")) {
        filteredList = res.slice();
      }

      // 记录平台订单
      this.recordPlatformOrders(filteredList);

      return filteredList;
    } catch (error) {
      console.error("获取省待出票列表异常", error);
      this.logger.errorSave("获取省待出票列表异常", { error });
      return [];
    }
  }

  /**
   * 获取报价记录
   * @returns {Promise<Array>} 报价记录列表
   */
  async getOfferList() {
    try {
      const res = await svApi.queryOfferList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "sheng",
        page_num: 1,
        page_size: 50,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name,cinema_group,order_status"
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error("获取省历史报价记录异常", error);
      this.logger.errorSave("获取省历史报价记录异常", { error });
      return [];
    }
  }

  /**
   * 更新出票记录换座信息
   * @param {Object} order - 订单信息（含 changeSeatApplyStatus）
   */
  async updateTicketOrderInfo(order) {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "sheng",
        order_number: order.order_number,
        isNeedTotalNum: 0,
        queryFields: "change_seat_info,order_status"
      });
      const ticketList = ticketRes.data.ticketList || [];
      let ticketInfo = ticketList[0];
      if (ticketInfo?.order_status != 9) {
        return;
      }

      // changeSeatApplyStatus: 1-拒绝，2-同意(换座成功)
      const status = order.changeSeatApplyStatus;
      const statusText = { 1: "拒绝换座", 2: "同意换座" };
      let change_seat_info = ticketInfo?.change_seat_info || "";

      if (status === 2) {
        // 换座成功：更新座位并标记重新出票
        change_seat_info += `换座结果：${status}-${statusText[status]}，新座位：${order.lockseat}`;
        await svApi.updateTicketRecord({
          whereObj: {
            order_number: order.order_number,
            plat_name: order.plat_name,
            user_id: tokens.userInfo?.user_id
          },
          updateObj: {
            change_seat_info,
            lockseat: order.lockseat,
            order_status: 5 // 重新出票中
          }
        });
      } else {
        // 换座被拒绝
        if (!change_seat_info?.includes("换座结果")) {
          change_seat_info += `换座结果：${status}-${statusText[status]}，原座位：${order.lockseat}`;
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
   * 获取出票记录
   * @returns {Promise<Array>} 出票记录列表
   */
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        plat_name: "sheng",
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "order_number,app_name,order_status"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取省历史出票记录异常", error);
      this.logger.errorSave("获取省历史出票记录异常", { error });
      return [];
    }
  }
}
