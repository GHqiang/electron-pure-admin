// 猎人平台报价队列
// 继承BaseOfferQueue，实现猎人平台特定的逻辑

import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import LierenAdapter from "../adapters/LierenAdapter.js";
import svApi from "@/api/sv-api";
import { appUserInfo } from "@/store/appUserInfo";
import { platTokens } from "@/store/platTokens";
import {
  getCinemaFlagDetail,
  getCurrentTime,
  hasAnyRoleLogin,
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
   * 启动拉单队列；启动前刷新一次同角色登录列表，避免「全角色无登录」误判。
   */
  async start() {
    // 不阻塞队列启动：登录页已加载过一次；这里异步刷新作兜底，失败的旧列表仍可用
    this._lastLoginRefreshAt = Date.now();
    this._refreshLoginInfoList();
    return super.start();
  }

  /**
   * 刷新同角色登录列表（queryLoginList 按当前 rule 拉取，含 link_user_id）。
   * 失败不影响队列启动/拉单，沿用本地旧列表。
   */
  async _refreshLoginInfoList() {
    if (this.isTestOrder) return;
    try {
      const rule = platTokens()?.userInfo?.rule;
      if (!rule) return;
      const res = await svApi.queryLoginList({ rule });
      const records = (res?.data?.loginList || []).map(item => ({
        app_name: item.app_name,
        mobile: item.mobile,
        session_id: item.session_id,
        tid: item.tid,
        member_pwd: item.member_pwd,
        first: item.first,
        is_xiaohao: item.is_xiaohao,
        link_user_id: item.link_user_id,
        daily_ticket_count: item.daily_ticket_count,
        update_time: item.update_time
      }));
      const store = appUserInfo();
      store.setLoginInfoList(records.filter(item => item.is_xiaohao != 1));
      store.setAllLoginInfoList(records);
    } catch (error) {
      console.warn("刷新同角色登录信息失败", error);
    }
  }

  /**
   * 获取订单
   * @param {number} fetchDelay - 获取间隔
   * @returns {Promise<void>}
   */
  async fetchOrders(fetchDelay) {
    // 同角色登录列表每 5 分钟刷新一次（启动时已刷新，失败则沿用旧列表）
    if (
      !this.isTestOrder &&
      (!this._lastLoginRefreshAt ||
        Date.now() - this._lastLoginRefreshAt > 5 * 60 * 1000)
    ) {
      this._lastLoginRefreshAt = Date.now();
      this._refreshLoginInfoList();
    }

    // C2：本轮拉单统计（finally 统一挂到基类，供 5 分钟摘要累加）
    const stats = {
      returned: 0,
      filtered: 0,
      enqueued: 0,
      failed: false
    };
    try {
      await mockDelay(fetchDelay);

      // 获取待报价列表
      const stayList = await this.getStayOfferList();
      if (!stayList?.length) return;

      // 第一遍：筛出可报价订单（映射表按 code 或名称匹配都算映射 + 同角色有登录）
      const quoteable = [];
      const anyRoleLoginCache = new Map();
      for (const item of stayList) {
        const detail = getCinemaFlagDetail(item, { requireSession: true });
        if (
          detail.reason === "unknown_cinema" ||
          detail.reason === "disabled_series"
        ) {
          continue;
        }
        if (detail.reason === "not_login") {
          const appName = detail.app_name;
          if (!anyRoleLoginCache.has(appName)) {
            anyRoleLoginCache.set(appName, hasAnyRoleLogin(appName));
          }
          if (!anyRoleLoginCache.get(appName)) continue;
        }
        quoteable.push({ item, detail });
      }
      stats.returned = quoteable.length;
      this._lastFetchStats = stats;

      // 第二遍：写 C1/丢弃记录，并转换入队
      const processedList = [];
      for (const { item, detail } of quoteable) {
        this._recordPullEvidence(item, detail, stats.returned);
        if (detail.reason) {
          stats.filtered++;
          this._recordDiscard(item, {
            reason: detail.reason,
            errType: 17, // 仅剩「同角色有登录、但当前客户端无可用登录」
            errMsg: this._buildDiscardMessage(detail, item),
            detail: detail.detail,
            appName: detail.app_name
          });
          continue;
        }
        const app_name = detail.app_name;
        processedList.push({
          ...item,
          plat_name: "lieren",
          app_name,
          appName: app_name,
          app_type_code: GET_APP_INFO(app_name)?.app_type_code,
          rewards: LIERENR_REWARDS[item.order_urgent] || 0, // 0-普通 1-加急 2-特急 3-vip
          offer_end_time: item.sytime * 1000 // 转为时间戳
        });
      }

      if (!processedList?.length) return;

      // 过滤已处理的订单
      // key 与 handleNewOrder 对齐：`${plat_name}_${order_number}`，否则预过滤失效，
      // 重叠缓冲（-2s）拉到的重复旧单会全部涌进 handleNewOrder（虽被 L502 拦住但浪费扫描）
      const newOrders = processedList.filter(
        item => !this.handledOrders.has(`lieren_${item.order_number}`)
      );
      stats.enqueued = newOrders?.length || 0;

      if (!newOrders?.length) return;

      // 处理新订单
      newOrders.forEach(item => {
        this.handleNewOrder(
          item,
          stayList.find(itemA => itemA.order_number === item.order_number)
        );
      });
    } catch (error) {
      // C2：处理异常也算失败轮次，避免「拉单循环正常」误判
      stats.failed = true;
      console.error("获取待报价订单异常", error);
    } finally {
      this._lastFetchStats = stats;
    }
  }

  /**
   * C1：写「拉单返回」L2 明细（同一单只写首次返回；只对相关订单写）
   * @param {Object} item - 平台原始订单
   * @param {Object} detail - getCinemaFlagDetail 返回值（含过滤结论）
   * @param {number} returnedCount - 本轮返回条数
   */
  _recordPullEvidence(item, detail, returnedCount) {
    const orderNumber = item?.order_number;
    if (!orderNumber || this.isTestOrder) return;
    const key = `lieren_${orderNumber}`;
    if (this._pullEvidenceLogged.has(key)) return;
    this._rememberKey(this._pullEvidenceLogged, key, 1000);
    const appName = detail?.app_name || "";
    this._uploadTraceEvidence({
      orderNumber,
      appName,
      des: "报价队列-拉单返回",
      info: {
        order_number: orderNumber,
        plat_name: "lieren",
        app_name: appName,
        cinema_code: item.cinema_code ?? "",
        cinema_name: item.cinema_name ?? "",
        offer_end_time: item.sytime ? item.sytime * 1000 : null,
        sytime: item.sytime ?? null,
        round_ts: this.lastFetchTimestamp || 0,
        fetch_timestamp: this._lastFetchParams?.timestamp ?? null,
        returned_count: returnedCount,
        // 过滤结论："" 可报价；not_login 当前客户端无可用登录（同角色其他人有登录）
        filter_reason: detail?.reason || "",
        reason_detail: detail?.detail || {}
      }
    });
  }

  /**
   * 丢弃原因文案（用户可读，细分进 err_msg）
   * @param {Object} detail - getCinemaFlagDetail 返回值
   * @param {Object} item - 订单
   * @returns {string}
   */
  _buildDiscardMessage(detail, item) {
    const { reason, app_name, detail: extra = {} } = detail;
    if (reason === "unknown_cinema") {
      return `入队前丢弃：影院未识别（cinema_code=${item.cinema_code || ""}）`;
    }
    if (reason === "disabled_series") {
      if (extra.source === "disableAppTypeList") {
        const appTypeCode = GET_APP_INFO(app_name)?.app_type_code || "";
        return `入队前丢弃：系列已手动禁用（${appTypeCode}）`;
      }
      return `入队前丢弃：影院未对当前用户开放（${app_name}）`;
    }
    if (reason === "not_login") {
      if (extra.source === "login_incomplete") {
        return "入队前丢弃：无可用登录（登录信息不完整：缺 mobile 或 session_id）";
      }
      return "入队前丢弃：无可用登录（未登录或登录不属于当前用户）";
    }
    return `入队前丢弃：不可报价（${reason || "unknown"}）`;
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
    // C1 证据字段：记录本轮水位线入参
    this._lastFetchParams = params;

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
