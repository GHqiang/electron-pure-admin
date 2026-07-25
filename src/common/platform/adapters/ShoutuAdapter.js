// 守兔平台适配器
// 实现守兔平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import shoutuApi from "@/api/shoutu-api.js";

/**
 * 守兔平台适配器
 */
export default class ShoutuAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("shoutu", shoutuApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表（现有 while 翻页加固）
   *
   * 加固点：
   *   - totalPage 取不到时不再静默退化为只拉 1 页：用 total 估算，仍取不到则靠"满页判断"自然终止；
   *   - 双保险终止条件：pageNo >= totalPage 或 已拉 >= total；
   *   - 单页容错：每页独立 try/catch，失败时保留已拉 allOrders 降级返回，不再整轮返回 []；
   *   - 最大页数保护 MAX_PAGE=5（50×5=250 条，覆盖日常量级）；
   *   - 每页输出可观测日志（pageNo/totalPage/本页条数/累计/total）。
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    const MAX_PAGE = 5; // 单轮最多拉 5 页 = 250 条，防 totalPage 异常
    const PAGE_SIZE = 50; // 平台固定上限 50，传更大无效
    const allOrders = [];
    let pageNo = 1;
    let total = 0;
    let totalPage = 0;

    while (pageNo <= MAX_PAGE) {
      try {
        const res = await this.api.queryStayOfferList({
          ...params,
          pageNo, // pageNo 由翻页循环控制
          pageSize: PAGE_SIZE
        });
        const list = res?.data?.list || [];
        total = res?.data?.total ?? total;
        totalPage = res?.data?.totalPage ?? totalPage;

        allOrders.push(...list);
        // totalPage 取不到时用 total 估算；仍取不到则用 Infinity 靠"满页判断"自然终止
        const effectiveTotalPage =
          totalPage || (total > 0 ? Math.ceil(total / PAGE_SIZE) : Infinity);
        console.log(
          `[shoutu] 翻页 page=${pageNo}/${MAX_PAGE} 本页${list.length}条 累计${allOrders.length}条 total=${total} totalPage=${totalPage}`
        );

        // 双保险终止：pageNo >= totalPage / 已拉 >= total / 当前页不满 / 当前页为空
        if (
          pageNo >= effectiveTotalPage ||
          (total > 0 && allOrders.length >= total) ||
          list.length < PAGE_SIZE ||
          list.length === 0
        ) {
          break;
        }
        pageNo++;
      } catch (error) {
        // 单页容错：失败时保留已拉数据降级返回，不再整轮返回 []
        this.logger.errorSave("获取待报价订单列表异常（翻页）", {
          error,
          pageNo,
          pulled: allOrders.length,
          total,
          totalPage
        });
        break;
      }
    }

    return allOrders;
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

  /**
   * 获取待出票订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchTicketOrderList(params = {}) {
    try {
      const res = await this.api.stayTicketingList({
        pageNo: 1,
        pageSize: 10,
        isImportantUser: 0,
        sortField: "",
        sortType: "",
        orderType: "",
        queryStatus: 3,
        ...params
      });
      return res?.data?.page?.list || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（守兔平台需要确认接单）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(order) {
    // 守兔平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
