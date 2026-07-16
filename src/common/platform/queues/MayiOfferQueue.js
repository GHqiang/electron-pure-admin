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
import { dictTable } from "@/store/dictTable.js";

// 蚂蚁订单 offer_end_time 实际为订单创建时间（+new Date(item.addtime)），
// 通过字典表 mayiOfferDefaultTimeoutMs 配置虚拟报价超时时长：
// - 已配置（>0）：入队时 offer_end_time = 创建时间 + 该值，并关闭 skipOfferEndTimeCheck 让各检查点生效
// - 未配置（0/缺省）：保持原行为，offer_end_time = 创建时间，skipOfferEndTimeCheck=true 跳过校验
const dictStore = dictTable();

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
   * 覆盖基类的截止时间检查决策：
   * 蚂蚁原配置 skipOfferEndTimeCheck=true（因为 offer_end_time 是创建时间，无意义）。
   * 当字典表配置了 mayiOfferDefaultTimeoutMs（>0）时，入队已把 offer_end_time 改为虚拟截止时间，
   * 此时各检查点应恢复生效，返回 false（不跳过）。
   * 未配置时保持基类行为（按 features.skipOfferEndTimeCheck 处理，蚂蚁默认 true）。
   * @returns {boolean} true=跳过截止校验，false=按 offer_end_time 校验
   */
  _shouldSkipOfferEndTimeCheck() {
    const defaultTimeoutMs = Number(
      dictStore.dictInfo.mayiOfferDefaultTimeoutMs
    );
    if (defaultTimeoutMs > 0) return false; // 已配虚拟截止时间，恢复校验
    return super._shouldSkipOfferEndTimeCheck();
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
            // 蚂蚁订单无真实报价截止时间，原值 addtime 为订单创建时间。
            // 若配置了字典表 mayiOfferDefaultTimeoutMs，则虚拟截止时间 = 创建时间 + 该值，
            // 让 findNextOrderToRun / orderHandle 入口等各检查点正常工作，避免僵尸订单长期堆积。
            // 未配置时仍保持原值（创建时间），由 skipOfferEndTimeCheck 跳过校验。
            offer_end_time: (() => {
              const createAt = +new Date(item.addtime);
              const defaultTimeoutMs = Number(
                dictStore.dictInfo.mayiOfferDefaultTimeoutMs
              );
              return defaultTimeoutMs > 0
                ? createAt + defaultTimeoutMs
                : createAt;
            })()
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
