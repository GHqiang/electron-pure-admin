// 报价基类
// 提取所有影院系列报价的公共逻辑

import {
  formatErrInfo,
  calculateMarkup,
  isCurrentTimeInRange
} from "@/utils/utils.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();
/**
 * 报价基类
 * 所有影院系列的报价类都应继承此类
 */
export default class BaseOfferPrice {
  /**
   * 构造函数
   * @param {Object} params - 参数对象
   * @param {string} params.appFlag - 影院标识
   * @param {string} params.plat_name - 平台标识
   */
  constructor({ appFlag, plat_name }) {
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.logger = null; // 日志实例，在initModules中初始化
    // 用于存放当前报价规则下查询到的券类型信息（供 maxCostPrice 过滤使用）
    this.quanInfoList = [];
  }

  /**
   * 初始化依赖模块（子类实现）
   * @param {Object} order - 订单信息
   */
  initModules(order) {
    // 子类需要实现此方法，初始化 logger、cardQuanManage、cinemaManage、seatManage 等
    throw new Error(`影院系列 ${this.appFlag} 未实现 initModules 方法`);
  }

  /**
   * 获取最终报价信息（模板方法，唯一暴露给外部的方法）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果 { endPrice, offerRule, order_number } 或 { err_msg, err_info, endPrice: null, offerRule }
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 1. 初始化模块
      this.initModules(order);

      // 2. 获取最终匹配的报价规则
      let offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.buildErrorResponse();
      }
      this.logger.infoSave("最终匹配到的报价规则", offerRule);
      // 1、是否同步平台规则走平台报价过滤
      // fixedOfferToPlatList：允许固定报价是否走平台的平台类型数组;
      const fixedOfferToPlatList =
        dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];
      // 猎人固定报价走平台的时间范围9-23
      const lierenFixedOfferToPlatTimeRange =
        dictStore.dictInfo.lierenFixedOfferToPlatTimeRange?.split(",");
      // 报价走平台时间检查
      const offferIsToPlatTimeCheck =
        this.plat_name == "lieren"
          ? isCurrentTimeInRange(
              lierenFixedOfferToPlatTimeRange[0],
              lierenFixedOfferToPlatTimeRange[1]
            )
          : true;
      if (
        fixedOfferToPlatList.includes(this.plat_name) &&
        offerRule.offerType === "1" &&
        offferIsToPlatTimeCheck &&
        offerRule.platOfferList?.find(item => item.platName === this.plat_name)
          ?.isSyncPlat == 1
      ) {
        this.logger.errorSave("该规则由平台进行报价");
        return this.buildErrorResponse(offerRule);
      }

      // 3. 获取成本价
      const cost_price = await this.getCostPrice(offerRule);
      if (!cost_price) {
        this.logger.errorSave("获取成本价失败");
        return this.buildErrorResponse(offerRule);
      }
      offerRule.cost_price = cost_price; // 成本价

      // 4. 计算最终报价
      const endPrice = await this.calculateFinalPrice({
        cost_price,
        supplier_max_price: order.supplier_max_price,
        price: this.getOfferBasePrice(offerRule),
        rewards: order.rewards,
        offerType: offerRule.offerType,
        offerList,
        offerRule
      });

      if (!endPrice) {
        return this.buildErrorResponse(offerRule);
      }

      // 5. 组装返回结果
      offerRule.offer_end_amount = endPrice;
      this.logger.infoSave(`最终报价金额：${endPrice}`);

      // 6. 增加一个quanValue的过滤，依据最大券成本过滤
      if (
        offerRule.offerType === "1" &&
        offerRule?.maxCostPrice &&
        this.quanInfoList?.length > 1
      ) {
        offerRule.quanValue = offerRule.quanValue
          .split(",")
          .filter(item => {
            let targetQuanCost = this.quanInfoList.find(
              quanInfo => quanInfo.quan_value === item
            )?.quan_cost;
            return targetQuanCost < offerRule?.maxCostPrice;
          })
          .join();
      }
      console.warn(
        "this.logger.logList",
        JSON.parse(JSON.stringify(this.logger.logList))
      );
      return this.buildSuccessResponse(endPrice, offerRule, order.order_number);
    } catch (error) {
      this.logger?.errorSave("获取最终报价信息方法执行异常", error);
      return this.buildErrorResponse();
    }
  }

  /**
   * 获取基础报价金额
   * @param {Object} offerRule - 报价规则
   * @returns {number} 基础报价金额
   */
  getOfferBasePrice(offerRule) {
    return Number(offerRule.offerAmount || offerRule.memberOfferAmount);
  }

  /**
   * 构建错误响应
   * @param {Object} offerRule - 报价规则（可选）
   * @returns {Object} 错误响应 { err_msg, err_info, endPrice: null, offerRule }
   */
  buildErrorResponse(offerRule) {
    const { err_msg, err_info } = this.logger?.getLastErrMsgAndInfo() || {
      err_msg: "",
      err_info: ""
    };
    this.logger?.logUpload();
    return { err_msg, err_info, endPrice: null, offerRule };
  }

  /**
   * 构建成功响应
   * @param {number} endPrice - 最终报价
   * @param {Object} offerRule - 报价规则
   * @param {string} orderNumber - 订单号
   * @returns {Object} 成功响应 { endPrice, offerRule, order_number, cinemaInfo, cacheHit }
   *   - cinemaInfo: 报价过程中解析出的影院/影片/场次信息，透传给 addOrderHandleRecord 用于写入 third_party_ids（跨订单复用）
   *     优先取 this.cinemaManage.cinemaInfo（各系列 cinemaManage 解析成功后赋值），兜底 this.cinemaInfo
   *   - cacheHit: 报价时命中来源（0=未命中，1=本地缓存命中，2=远端缓存命中），透传给 addOrderHandleRecord 写入 offer_record.cache_hit
   *     优先取 this.cinemaManage.cacheHit（各系列 cinemaManage 在缓存命中时赋值），兜底 this.cacheHit
   */
  buildSuccessResponse(endPrice, offerRule, orderNumber) {
    this.logger?.logUpload();
    const cinemaInfo = this.cinemaManage?.cinemaInfo || this.cinemaInfo || null;
    const cacheHit = this.cinemaManage?.cacheHit ?? this.cacheHit ?? 0;
    return {
      endPrice,
      offerRule,
      order_number: orderNumber,
      cinemaInfo,
      cacheHit
    };
  }

  /**
   * 获取最终匹配的报价规则（子类实现）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object|null>} 报价规则或null
   */
  async getEndMatchOfferRule(order) {
    throw new Error(
      `影院系列 ${this.appFlag} 未实现 getEndMatchOfferRule 方法`
    );
  }

  /**
   * 获取成本价（默认实现，绝大多数系列通用）
   * 约定：
   * - 固定报价（券）：通过子类注入的 this.cardQuanManage.getQuanInfo 查询券成本
   *   - 多券类型时取最小 quan_cost，并写入 this.quanInfoList，供后续过滤使用
   * - 会员价加价：直接使用 memberCostPrice
   *
   * 子类若有特殊需求（例如第三方返回结构特殊），可以覆写本方法。
   *
   * @param {Object} offerRule - 报价规则
   * @returns {Promise<number|null>} 成本价或null
   */
  async getCostPrice(offerRule) {
    const offerType = offerRule.offerType;
    const quanValue = offerRule.quanValue;
    const memberCostPrice = offerRule.memberCostPrice || 0;

    if (offerType === "1") {
      this.quanInfoList = [];
      if (!this.cardQuanManage?.getQuanInfo) {
        this.logger?.errorSave?.(
          "getCostPrice: 固定报价但未注入 cardQuanManage.getQuanInfo"
        );
        return null;
      }
      const quanInfo = await this.cardQuanManage.getQuanInfo(
        quanValue,
        this.appFlag
      );
      // 多券类型时取最小成本价
      if (Array.isArray(quanInfo)) {
        this.quanInfoList = quanInfo;
        const quan_cost = Math.min(
          ...quanInfo.map(item => Number(item.quan_cost || 0))
        );
        return quan_cost;
      }
      return quanInfo?.quan_cost ?? null;
    }

    return Number(memberCostPrice) || null;
  }

  /**
   * 获取会员价（子类实现，仅加价规则需要）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Object} params.movieData - 电影数据（可选）
   * @returns {Promise<Object|null>} 会员价信息或null
   */
  async getMemberPrice({ order, movieData }) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getMemberPrice 方法`);
  }

  /**
   * 计算最终报价（子类实现）
   * @param {Object} params - 参数对象
   * @param {number} params.cost_price - 成本价
   * @param {number} params.supplier_max_price - 平台最高限价
   * @param {number} params.price - 基础报价
   * @param {number} params.rewards - 奖励比例
   * @param {string} params.offerType - 报价类型
   * @param {Array} params.offerList - 报价列表
   * @param {Object} params.offerRule - 报价规则
   * @returns {Promise<number|null>} 最终报价或null
   */
  async calculateFinalPrice(params) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 calculateFinalPrice 方法`);
  }

  /**
   * 获取真实加价金额（默认实现，绝大多数系列通用）
   *
   * 说明：
   * - 使用通用的 calculateMarkup 工具函数
   * - addMountRule 格式与历史规则保持一致，例如：["30", ">=+2", "<+1"]
   *
   * @param {Object} params
   * @param {number} params.real_member_price - 真实会员价
   * @param {Array<string>} params.addMountRule - 加价规则数组
   * @returns {number|null}
   */
  getRealAddMount({ real_member_price, addMountRule }) {
    try {
      const comparePrice = addMountRule?.[0];
      if (!comparePrice || !Array.isArray(addMountRule)) return null;
      const realAddMount = calculateMarkup(
        comparePrice,
        real_member_price,
        addMountRule.slice(1)
      );
      this.logger?.infoSave?.("getRealAddMount 计算结果", {
        real_member_price,
        addMountRule,
        realAddMount
      });
      return realAddMount;
    } catch (error) {
      this.logger?.errorSave?.("获取真实加价金额异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
}
