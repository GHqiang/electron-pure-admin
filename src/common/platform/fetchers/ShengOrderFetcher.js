// 省平台订单获取
// 继承BaseOrderFetcher，实现省平台特定的订单获取逻辑

import BaseOrderFetcher from "../../core/BaseOrderFetcher.js";
import ShengAdapter from "../adapters/ShengAdapter.js";
import Logger from "../../logger.js";
import { getCinemaFlag, getCurrentTime, logUpload } from "@/utils/utils.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();
const {
  userInfo: { name }
} = tokens;

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
            cinema_code: film.standardId,
            order_number: code,
            supplierCode,
            seats: seats || [], // 报价接口需要：seatInfo = JSON.stringify(seats.map(s => ({ seatId: s.seatId, supplierPrice })))
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
      const newOrders = this.filterNewOrders(processedList);

      // 如果不是测试订单，从远端过滤已出票的订单
      if (newOrders?.length && !this.isTestOrder) {
        const ticketList = await this.getTicketList();
        const finalOrders = newOrders.filter(item => {
          // 判断该订单是否是新订单：报过价且没出过票
          let targetOfferList = offerList.filter(itemA => {
            if (item.appName !== "wanxiang") {
              return (
                itemA.app_name === item.appName && itemA.order_status === "1"
              );
            } else {
              return (
                ["wanxiang", "wanxiangh5"].includes(itemA.app_name) &&
                itemA.order_status === "1"
              );
            }
          });
          let targetTicketList = ticketList.filter(itemA => {
            if (item.appName !== "wanxiang") {
              return itemA.app_name === item.appName;
            } else {
              return ["wanxiang", "wanxiangh5"].includes(itemA.app_name);
            }
          });
          let isOffer = targetOfferList.some(
            itemA => itemA.order_number === item.order_number
          );
          let isTicket = targetTicketList.some(
            itemA => itemA.order_number === item.order_number
          );
          // 报过价没出过票就是新订单
          return isOffer && !isTicket;
        });

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
                oldOrder: rawStayList.find(
                  itemA => itemA.code === item.order_number
                )
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
   * 获取省待出票订单列表
   * @returns {Promise<Array>} 订单列表
   */
  async shengOrderFetch() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchTicketOrderList(params);

      // 过滤已记录的订单
      const filteredList = res.filter(
        item => !this.platOrderList.some(itemA => itemA.code === item.code)
      );

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
        queryFields: "order_number,app_name"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取省历史出票记录异常", error);
      this.logger.errorSave("获取省历史出票记录异常", { error });
      return [];
    }
  }
}
