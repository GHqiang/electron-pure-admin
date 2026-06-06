/**
 * 万达卡券管理模块
 *
 * 职责：
 * - 获取会员卡列表、优惠券列表、使用卡券
 *
 * @module wanda/cardQuanManage
 */
import { formatErrInfo } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class WandaCardQuanManage {
  constructor(order, logger, orderManage = null) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
    this.usableCardList = [];
    this.curPhone = "";
    this.orderManage = orderManage;
  }

  /**
   * 获取会员卡列表
   */
  async getCardList(loginParams) {
    try {
      const session_id = loginParams?.session_id || "";
      const tid = loginParams?.tid || "";
      const res = await this.appApi.getCardList(
        { category: 1, json: true },
        { data: { wanda_token: session_id, wanda_identifier: tid } }
      );
      const items = res?.data?.res?.items || [];
      this.usableCardList = items.filter(
        item => item.available !== false && item.status === 8
      );
      return this.usableCardList;
    } catch (error) {
      this.logger.errorSave("获取万达会员卡列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取可用的会员卡列表（按余额排序）
   */
  getUsableCardList() {
    return this.usableCardList.sort(
      (a, b) => (b.balance || 0) - (a.balance || 0)
    );
  }

  /**
   * 获取优惠券列表
   */
  async getQuanList(loginParams) {
    try {
      const session_id = loginParams?.session_id || "";
      const tid = loginParams?.tid || "";
      const res = await this.appApi.getCouponExpireAndEffective(
        { json: true, page: 1, pageSize: 50 },
        { data: { wanda_token: session_id, wanda_identifier: tid } }
      );
      return res?.data?.couponList || [];
    } catch (error) {
      this.logger.errorSave("获取万达优惠券列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取券成本信息（基类 getCostPrice 依赖此方法）
   * @param {string} quanValue - 券值，逗号分隔多个券类型
   * @param {string} appFlag - 影院标识
   * @returns {Object|Array|null} { quan_cost } 或 [{ quan_cost }]
   */
  async getQuanInfo(quanValue, appFlag) {
    // 暂无券库存系统时，返回零成本（固定报价直接赚差价）
    if (!quanValue) {
      return { quan_cost: 0 };
    }
    // TODO: 接入万达券库存查询
    return { quan_cost: 0 };
  }
}
