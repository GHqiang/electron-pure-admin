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
    // 拉单水位线（秒级时间戳）：0 表示未初始化，首轮拉单时设为当前时间
    // 不做 localStorage 持久化：停机后旧水位线远小于当前时间，中间订单大多查不到或已过报价截止，无意义
    // 仅在拉单成功后才提交/更新，失败保留旧值（见 getStayOfferList）
    this.lastFetchTimestamp = 0;
  }

  /**
   * 重置拉单状态（覆盖基类钩子）
   * stop→start 重启时清空水位线，首轮拉单会以当前时间作为起点，
   * 避免使用停机前的旧水位线（旧值远小于当前时间，中间订单无意义）。
   */
  resetFetchState() {
    this.lastFetchTimestamp = 0;
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
      // key 与 handleNewOrder 对齐：`${plat_name}_${order_number}`，否则预过滤失效，
      // 重叠缓冲（-2s）拉到的重复旧单会全部涌进 handleNewOrder（虽被 L502 拦住但浪费扫描）
      const newOrders = processedList.filter(
        item => !this.handledOrders.has(`lieren_${item.order_number}`)
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
   * 获取待报价订单列表（timestamp 增量拉取）
   *
   * 水位线策略：
   *   - 首次（lastFetchTimestamp=0）：以当前时间作为水位线，传 timestamp = now - 2。
   *     不走平台"未读取订单"全量逻辑——全量也按当前时间查、且可能不全；
   *     平台侧存量旧单大多已过报价截止时间，拉到也无意义。
   *   - 后续：传 timestamp = lastFetchTimestamp - 2（减 2 秒重叠缓冲，防同秒边界漏单）。
   *   - stop→start 重启：resetFetchState 把水位线清 0，首轮重新以当前时间起步，
   *     不用停机前的旧水位线（旧值远小于当前时间，中间订单无意义）。
   *
   * 水位线更新时机（关键）：
   *   - 请求前用局部变量 requestStartTs 暂存本轮起点（秒）；
   *   - 请求成功后才提交为 lastFetchTimestamp；
   *   - 请求失败（catch）不提交，lastFetchTimestamp 保持旧值，下一轮仍按旧水位线重拉。
   *   - 不使用返回订单里的某个时间字段作为水位线：字段名/时区/精度不可靠。
   *
   * 重叠缓冲（-2s）带来的重复订单，由 handleNewOrder 的 handledOrders 按 平台_订单号 去重兜底。
   *
   * @returns {Promise<Array>} 订单列表
   */
  async getStayOfferList() {
    // 请求前暂存本轮起点（秒）：仅在成功后才提交为水位线，失败保留旧值
    const requestStartTs = Math.floor(Date.now() / 1000);

    // 首次（lastFetchTimestamp=0）以当前时间起步；后续用上轮水位线 -2s 重叠缓冲
    // Math.max(0, ...) 守卫：防止水位线被篡改为异常小值导致 timestamp 为负
    const baseTs = this.lastFetchTimestamp || requestStartTs;
    const params = { timestamp: Math.max(0, baseTs - 2) };

    try {
      const res = await this.platformAdapter.fetchOrderList(params);
      // 成功才提交水位线
      this.lastFetchTimestamp = requestStartTs;
      console.log(
        `[lieren] 拉单成功 返回${res?.length || 0}条 ` +
          `params=${JSON.stringify(params)} nextTimestamp=${this.lastFetchTimestamp}`
      );
      return res || [];
    } catch (error) {
      // 失败不提交水位线，lastFetchTimestamp 保持旧值，下一轮仍按旧水位线重拉
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
              error,
              // 标记本次水位线，便于诊断"失败期间是否漏单"
              lastFetchTimestamp: this.lastFetchTimestamp,
              params
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
   * @param {Object} logger - 日志实例
   * @param {Object} offerRule - 报价规则
   * @returns {Promise<string|number|null>} 规则ID
   */
  async getRuleId(order, logger, offerRule) {
    try {
      // 固定报价规则且已设置同步猎人平台时不返回规则id
      const isSyncToLieren =
        offerRule.platOfferList?.find(item => item.platName === "lieren")
          ?.isSyncPlat == 1;
      if (offerRule.offerType == "1" && isSyncToLieren) {
        return null;
      }
      return await getRuleIdByPlat({
        plat_name: "lieren",
        cinema_group: order.cinema_group,
        cinema_code: order.cinema_code,
        app_name: order.app_name,
        logger
      });
    } catch (error) {
      this.logger.errorSave("获取规则ID异常", { error, order });
      return null;
    }
  }
}

// 测试平台报价代码
window.lierenOfferQueue = () => {
  const testOrder = {
    plat_name: "lieren",
    id: "12412221440316515",
    tpp_price: 42,
    supplier_max_price: 39,
    city_name: "南京",
    cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
    ticket_num: 1,
    cinema_name: "金逸影城(光美江宁弘阳IMAX店)",
    hall_name: "7号MX4D激光厅(儿童需购票)",
    film_name: "飞驰人生3",
    show_time: "2026-03-17 21:10:00",
    rewards: 0,
    is_urgent: false,
    cinema_group: "",
    cinema_code: "32016011",
    order_number: "12412221440316515",
    offer_end_time: 1773742065000,
    app_name: "guangmeiwenhua"
  };
  return new LierenOfferQueue(true).orderHandle(testOrder);
};
