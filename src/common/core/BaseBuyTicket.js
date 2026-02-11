// 出票基类
// 提取所有影院系列出票的公共逻辑

import {
  formatErrInfo,
  mockDelay,
  sendWxPusherMessage
} from "@/utils/utils.js";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";

const tokens = platTokens();

/**
 * 出票基类
 * 所有影院系列的出票类都应继承此类
 *
 * 说明：
 * - 影院系列（app_type_code）：如 chenxing_applet、sfc_applet、ume_applet 等，代表一类影院的出票逻辑
 * - 具体影院（appFlag/app_name）：每个系列下的不同影院，如辰星系列下的 guangmeiwenhua、yaolai 等
 * - 每个系列类（如 ChenxingBuyTicket、SfcBuyTicket）处理该系列下所有 appFlag 的出票逻辑
 */
export default class BaseBuyTicket {
  /**
   * 构造函数
   * @param {Object} order - 订单信息
   * @param {Object} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(order, logger, isTestOrder) {
    this.appFlag = order.app_name; // 影线标识
    this.order = order; // 订单信息
    this.isTestOrder = isTestOrder; // 是否是测试订单
    this.logger = logger; // 日志模块
    this.currentParamsList = []; // 当前登录参数列表
    this.currentParamsInx = 0; // 当前登录参数索引
    this.currentSessionId = ""; // 当前session_id
    this.currentPhone = ""; // 当前手机号
    this.offerRule = null; // 报价规则

    // 初始化模块（子类实现）
    this.initModules();
  }

  /**
   * 初始化依赖模块（子类实现）
   * 子类需要在此方法中初始化 platManage、seatManage、orderManage 等模块
   */
  initModules() {
    // 子类需要实现此方法
    throw new Error(`影院系列 ${this.appFlag} 未实现 initModules 方法`);
  }

  /**
   * 单个订单出票（模板方法，唯一暴露给外部的方法）
   * @returns {Promise<Object|undefined>} 出票结果或undefined
   */
  async singleTicket() {
    try {
      this.logger.infoSave("单个待出票订单信息", this.order);

      // 1、获取影院登录信息并设置当前token
      await this.getCinemaLoginInfo();

      // 2、获取该订单报价规则
      await this.getOrderOfferRule();
      this.logger.infoSave("订单报价记录信息", {
        offerRule: JSON.parse(JSON.stringify(this.offerRule))
      });

      // 3、校验报价规则是否允许出票
      const isNeedBuyTicket = this.checkOfferRuleRes();
      if (!isNeedBuyTicket) {
        this.logger.infoSave("校验报价规则不允许出票");
        return {
          offerRule: this.offerRule
        };
      }
      this.logger.infoSave("校验报价规则允许出票");

      // 4、平台解锁座位(重新出票不需要解锁座位)
      if (!this.isTestOrder && !this.order.isAgain) {
        this.logger.infoSave("开始准备解锁座位");
        const unlockRes = await this.platManage.unlockSeatByPlat();
        if (!unlockRes) {
          this.logger.infoSave("平台解锁失败准备走转单逻辑");
          this.logger.error("平台解锁失败走转单逻辑");
          return await this.orderManage.transferOrder();
        }
      }

      this.offerRule.lockseat = this.order.lockseat;

      // 5、一键买票
      await mockDelay(1); // 解锁成功后延迟1秒再执行
      const result = await this.oneClickBuyTicket({
        ...this.order,
        otherParams: {
          offerRule: this.offerRule
        }
      });

      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule, mobile } || undefined
      if (result) {
        console.warn("单个订单出票完成");
        return result;
      } else {
        console.warn("单个订单出票失败");
      }
    } catch (error) {
      this.logger.errorSave("单个订单出票执行出错", formatErrInfo(error));
    } finally {
      console.warn("单个订单出票流程结束", this.logger.logList);
    }
  }

  /**
   * 获取影院登录信息并设置当前token（子类实现）
   * @returns {Promise<void>}
   */
  async getCinemaLoginInfo() {
    throw new Error(`影院系列 ${this.appFlag} 未实现 getCinemaLoginInfo 方法`);
  }

  /**
   * 获取订单报价规则
   * 从报价记录中获取该订单对应的报价规则，设置到 this.offerRule
   * 子类可以重写此方法以实现特殊逻辑（如测试模式）
   * @returns {Promise<void>}
   */
  async getOrderOfferRule() {
    const { app_name, order_number, plat_name, offer_order_number } =
      this.order;
    try {
      // 获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: tokens.userInfo?.user_id || tokens.userInfo?.user_id,
        order_status: "1",
        app_name,
        order_number: plat_name !== "mahua" ? order_number : offer_order_number,
        plat_name
      });
      this.offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logger.errorSave("获取该订单报价记录异常", { error });
    }
  }

  /**
   * 校验报价规则是否允许出票
   * 检查 this.offerRule 是否存在且允许出票：
   * - rule_status="3" 表示仅报价，不允许出票
   * - quan_value="jinbaojia" 表示仅报价券，不允许出票
   * @returns {boolean} true=允许出票，false=不允许出票（会发送微信通知）
   */
  checkOfferRuleRes() {
    const { offerRule } = this;
    if (
      !offerRule ||
      offerRule?.rule_status === "3" ||
      offerRule?.quan_value === "jinbaojia"
    ) {
      let str = "获取该订单报价记录失败，微信通知手动出票";
      if (offerRule?.rule_status === "3") {
        str = "该订单报价规则为仅报价，需手动出票";
      } else if (offerRule?.quan_value === "jinbaojia") {
        str = "该订单报价规则用券类型为仅报价券，需手动出票";
      }
      this.logger.errorSave(str, { offerRule });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return false;
    }
    return true;
  }

  /**
   * 一键买票核心流程（子类实现）
   * @param {Object} params - 参数对象
   * @param {Object} params.otherParams - 其他参数
   * @param {Object} params.otherParams.offerRule - 报价规则
   * @returns {Promise<Object|undefined>} 出票结果或undefined
   */
  async oneClickBuyTicket(params) {
    throw new Error(`影院系列 ${this.appFlag} 未实现 oneClickBuyTicket 方法`);
  }

  /**
   * 通用一键买票模板（可选）
   *
   * 说明：
   * - 当前仅作为“骨架”提供给子类逐步迁移使用，不会自动被调用
   * - 子类可以在内部这样使用：
   *   return this.coreOneClickBuyTicket({ rawOrder: item, hooks: { ... } })
   *
   * @param {Object} context
   * @param {Object} context.rawOrder 原始订单对象（通常为 singleTicket 里透传的 this.order 或 item）
   * @param {Object} [context.hooks] 可选钩子集合，用于覆盖默认实现
   */
  async coreOneClickBuyTicket(context) {
    const ctx = {
      ...context,
      offerRule: this.offerRule,
      appFlag: this.appFlag,
      logger: this.logger,
      currentParamsList: this.currentParamsList,
      currentParamsInx: this.currentParamsInx
    };

    const hooks = ctx.hooks || {};

    const runHook = async (name, defaultImpl, args) => {
      const fn = hooks[name] || defaultImpl?.bind(this);
      if (!fn) {
        throw new Error(
          `coreOneClickBuyTicket 缺少必要钩子实现: ${name}（影院系列 ${this.appFlag}）`
        );
      }
      return await fn(args || ctx);
    };

    // 默认实现只串联钩子，不做具体业务，避免破坏现有逻辑
    const cinemaCtx = await runHook("resolveCinemaAndMovie", null);
    const seatCtx = await runHook("resolveSeats", null, cinemaCtx);
    const lockCtx = await runHook("lockSeatsWithRetry", null, seatCtx);
    const benefitCtx = await runHook("useCardOrQuan", null, lockCtx);
    const priceCtx = await runHook("calcAndValidatePrice", null, benefitCtx);
    const orderCtx = await runHook("createOrder", null, priceCtx);

    if (this.isTestOrder) {
      return await this.handleTestMode(orderCtx);
    }

    const payCtx = await runHook("payAndFetchQrcode", null, orderCtx);
    const result = await runHook("buildTicketResult", null, payCtx);
    return result;
  }

  /**
   * 通用：用券价格校验
   * @param {Object} params
   * @param {Object} params.offerRule 报价规则
   * @param {number} params.ticket_num 票数
   * @param {number} params.paymentAmount 实际支付金额（统一使用“元”为单位）
   * @param {Array} params.useQuan 使用的券列表
   * @returns {{ok: boolean, reason?: string, quan_fee_total?: number}}
   */
  validateCouponPrice({ offerRule, ticket_num, paymentAmount, useQuan }) {
    const result = { ok: true };
    if (!offerRule || offerRule.offer_type !== "1" || !useQuan?.length) {
      return result;
    }
    let quan_fee = Number(offerRule.quan_fee || 0);
    // 券手续费 * 票数
    const quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
    result.quan_fee_total = quan_fee_total;

    if (paymentAmount > quan_fee_total) {
      result.ok = false;
      result.reason = "用完券发现支付金额大于券手续费*票数";
    }
    return result;
  }

  /**
   * 通用：用卡价格与利润校验
   * @param {Object} params
   * @param {Object} params.offerRule 报价规则
   * @param {number} params.ticket_num 票数
   * @param {number} params.paymentAmount 实际支付金额（元）
   * @param {number} params.profit 当前利润（元）
   * @returns {{ok: boolean, profit: number, reason?: string}}
   */
  validateCardPriceAndProfit({ offerRule, ticket_num, paymentAmount, profit }) {
    const res = { ok: true, profit };
    if (!offerRule || offerRule.offer_type === "1") return res;

    // 真实会员价 * 票数
    let real_member_price = Number(offerRule.real_member_price || 0);
    const real_member_total_price =
      (real_member_price * 1000 * ticket_num) / 1000;

    if (paymentAmount > real_member_total_price) {
      const diff = this.subDecimalSafe(paymentAmount, real_member_total_price);
      if (diff < profit) {
        res.profit = this.subDecimalSafe(profit, diff);
      } else {
        res.ok = false;
        res.reason = "用完卡发现无利润";
      }
    } else if (paymentAmount < real_member_total_price) {
      const member_discount = Number(offerRule.member_discount || 100);
      const add =
        ((real_member_total_price - paymentAmount) * member_discount) / 100;
      res.profit = Number((Number(profit) + add).toFixed(2));
    }
    return res;
  }

  /**
   * 安全减法，避免浮点精度问题
   */
  subDecimalSafe(a, b) {
    try {
      return (Number(a) * 1000 - Number(b) * 1000) / 1000;
    } catch (e) {
      return Number(a) - Number(b);
    }
  }

  /**
   * 通用：换号或转单降级处理
   *
   * @param {Object} params
   * @param {string} params.reason 触发降级原因（仅用于日志）
   * @param {Object} params.unlockOrCancelParams 转单时需要的参数
   * @param {Object} params.rebuildParams 换号后重新调用 oneClickBuyTicket 所需参数
   * @returns {Promise<Object>} { offerRule, transferParams } 或 oneClickBuyTicket 返回
   */
  async fallbackWithChangePhoneOrTransfer({
    reason,
    unlockOrCancelParams,
    rebuildParams
  }) {
    const { currentParamsInx, currentParamsList } = this;
    this.logger.infoSave("触发降级处理：换号或转单", {
      reason,
      currentParamsInx,
      total: currentParamsList.length
    });

    if (currentParamsInx === currentParamsList.length - 1) {
      const transferParams =
        await this.orderManage.transferOrder(unlockOrCancelParams);
      return { offerRule: this.offerRule, transferParams };
    } else {
      this.logger.infoSave("非最后一次账号，走换号逻辑");
      this.currentParamsInx++;
      return await this.oneClickBuyTicket(rebuildParams);
    }
  }

  /**
   * 构造测试模式下的购买参数（方便子类统一打印）
   * 子类可以在 hooks 中扩展额外字段
   */
  buildTestBuyParams(base) {
    const { order } = this;
    return {
      ...base,
      appFlag: this.appFlag,
      orderInfo: {
        order_number: order.order_number,
        plat_name: order.plat_name,
        supplier_end_price: order.supplier_end_price,
        ticket_num: order.ticket_num,
        card_id: base.card_id,
        quan_code: base.quan_code,
        paymentAmount: base.paymentAmount,
        profit: base.profit,
        rewards: order.rewards
      }
    };
  }

  /**
   * 通用测试模式处理：
   * - 打印/记录购买参数
   * - 调用子类的 cancelOrReleaseOrderForTest 释放资源
   * - 返回 { offerRule }
   */
  async handleTestMode(ctx) {
    const buyParams = this.buildTestBuyParams(ctx || {});
    console.log("========== 测试模式：购买参数 ==========");
    console.log(JSON.stringify(buyParams, null, 2));
    this.logger.infoSave("测试模式：购买参数", buyParams);

    if (typeof this.cancelOrReleaseOrderForTest === "function") {
      try {
        await this.cancelOrReleaseOrderForTest(ctx);
      } catch (error) {
        this.logger.errorSave("测试模式：取消订单/释放座位异常", {
          error: formatErrInfo(error)
        });
      }
    }

    return { offerRule: this.offerRule };
  }
}
