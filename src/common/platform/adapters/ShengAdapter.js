// 省APP平台适配器
// 实现省APP平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import shengApi from "@/api/sheng-api.js";
// 平台toke列表
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

/**
 * 省APP平台适配器
 */
export default class ShengAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("sheng", shengApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表（按 count + 满页 20 翻页）
   *
   * 每页固定返回 20 条（传更大无效），按 count 翻页：
   *   - count 已确认为 status:"0" 过滤后的待报价总数（主判断依据）；
   *   - "满页 20"为辅：当前页 rows.length === 20 说明大概率还有下一页。
   *
   * 翻页终止条件（任一满足即停）：
   *   - 当前页 rows.length < 20（不满页=最后一页）
   *   - 已拉取条数 >= count
   *   - 达到 MAX_PAGE 保护上限（防 count 异常）
   *
   * 单页容错：每页独立 try/catch，某页失败时保留已拉数据降级返回，不再整轮返回 []。
   *
   * @param {Object} params - 查询参数（page 由翻页逻辑内部控制，外部传入将被覆盖）
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    const MAX_PAGE = 5; // 单轮最多拉 5 页 = 100 条，防 count 异常
    const PAGE_SIZE = 20; // 平台固定每页 20 条，传更大无效
    const allOrders = [];
    let page = 1;
    let count = 0;

    while (page <= MAX_PAGE) {
      try {
        const res = await this.api.queryStayOfferList({
          supplierCode: tokens.shengToken,
          status: "0", // 0待报价订单，1已报价订单
          ...params, // 允许外部覆盖 supplierCode 等参数
          page // page 由翻页循环控制，覆盖外部传入
        });
        const list = res?.data?.rows || [];
        count = res?.data?.count ?? count;

        allOrders.push(...list);
        console.log(
          `[sheng] 翻页 page=${page}/${MAX_PAGE} 本页${list.length}条 累计${allOrders.length}条 count=${count}`
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
   * 提交报价
   * @param {Object} params - 报价参数
   * @param {Object} [options] - 可选，{ logger?: Logger } 传入则使用调用方 logger，便于日志统一上传
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
      const params1 = {
        page: 1,
        status: "2", // 2表示未接单的订单
        supplierCode: tokens.shengToken,
        ...params
      };
      const params2 = {
        page: 1,
        status: "5", // 5表示已接单的订单
        supplierCode: tokens.shengToken,
        ...params
      };

      const [res1, res2] = await Promise.allSettled([
        this.api.stayTicketingList(params1),
        this.api.stayTicketingList(params2)
      ]);

      const list1 =
        res1.status === "fulfilled" ? res1.value?.data?.rows || [] : [];
      const list2 =
        res2.status === "fulfilled" ? res2.value?.data?.rows || [] : [];

      // 合并两个列表并去重
      const combinedList = [...list1, ...list2];
      const list = combinedList.filter((item, index, self) => {
        return index === self.findIndex(t => t.code === item.code);
      });

      return list;
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（省APP平台需要确认接单）
   * @param {Object} _order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(_order) {
    // 省APP平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
