// 芒果平台适配器
// 实现芒果平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import mangguoApi from "@/api/mangguo-api.js";

/**
 * 芒果平台适配器
 */
export default class MangguoAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("mangguo", mangguoApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表（page_size 300 + 按 count 翻页）
   *
   * 翻页终止条件（任一满足即停）：
   *   - 当前页 list.length < page_size（最后一页必然不满，自然终止）
   *   - 已拉取条数 >= count
   *   - 达到 MAX_PAGE 保护上限（防 count 异常导致死循环）
   *
   * 单页容错：每页独立 try/catch，某页失败时保留已拉数据降级返回，不再整轮返回 []。
   *
   * @param {Object} params - 查询参数（page/page_size 由翻页逻辑内部控制，外部传入将被覆盖）
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    const MAX_PAGE = 5; // 单轮最多拉 5 页 = 1500 条，防 count 异常
    const PAGE_SIZE = 300;
    const allOrders = [];
    let page = 1;
    let count = 0;

    while (page <= MAX_PAGE) {
      try {
        const res = await this.api.queryStayOfferList({
          order_type: "1",
          sort_field: "created_at",
          sort_order: "desc",
          ...params, // 允许外部覆盖 order_type/sort 等筛选参数
          page, // page 由翻页循环控制，覆盖外部传入
          page_size: PAGE_SIZE
        });
        const list = res?.data?.list || [];
        count = res?.data?.count ?? count;

        allOrders.push(...list);
        console.log(
          `[mangguo] 翻页 page=${page}/${MAX_PAGE} 本页${list.length}条 累计${allOrders.length}条 count=${count}`
        );

        // 终止条件：当前页不满 / 已拉够 / 当前页为空
        // count>0 守卫：count 取不到时不用此条件，靠"满页判断"自然终止
        if (
          list.length < PAGE_SIZE ||
          (count > 0 && allOrders.length >= count) ||
          list.length === 0
        ) {
          break;
        }
        page++;
      } catch (error) {
        // 单页容错：失败时保留已拉数据降级返回，不再整轮返回 []
        this.logger.errorSave("获取待报价订单列表异常（翻页）", {
          error,
          page,
          pulled: allOrders.length,
          count
        });
        break;
      }
    }

    return allOrders;
  }

  /**
   * 获取待出票订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchTicketOrderList(params = {}) {
    try {
      const res = await this.api.stayTicketingList({
        page_size: 12,
        order_type: "1",
        ...params
      });
      return res?.data?.list || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 提交报价
   * @param {Object} params - 报价参数
   * @returns {Promise<Object>} 提交结果
   */
  async submitOffer(params, options = {}) {
    const log = this._getLogger(options);
    try {
      log.infoSave("提交报价参数", params);

      if (this.isTestOrder) {
        log.infoSave("测试单暂不进行报价", { params });
        return { code: 1, msg: "测试单" };
      }

      const res = await this.api.submitOffer(params);
      log.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      log.errorSave("提交报价异常", { error, params });
    }
  }
}
