/**
 * H5UME订单管理模块
 *
 * 职责：
 * - 订单创建
 * - 订单购买
 * - 获取支付结果（取票码）
 * - 上传取票码到平台
 * - 转单逻辑
 * - 取消订单
 * - 释放座位
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - PlatManage: 平台管理模块（用于上传取票码、转单）
 *
 * @module h5ume/orderManage
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  mockDelay,
  trial,
  getCurrentTime
} from "@/utils/utils";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import {
  COUPON_RETRY_LIMIT,
  COUPON_SINGLE_RETRY_LIMIT
} from "@/common/autoTicket/buyTicket/common/retryConfig";

// 用券创建订单异常换券重试：可重试的错误关键词
// 命中其一即视为可换券重试（优惠券核算异常 / 券被竞态用掉）
const COUPON_RETRY_ERROR_KEYS = [
  "PROMOCOUPON_CAL_ERROR",
  "优惠券优惠计算异常",
  "COUPONCOUNT_TICKET_NOT_SAME",
  "券数量和票数量不一致"
];

/**
 * 判断创建订单错误是否可换券重试
 * 命中"优惠券优惠计算异常"或"券数量和票数量不一致"时返回 true
 * @param {*} error - createOrder 透出的 error
 * @returns {boolean}
 */
function isCouponRetryableError(error) {
  const errStr = formatErrInfo(error) || "";
  return COUPON_RETRY_ERROR_KEYS.some(key => errStr.includes(key));
}

/**
 * 提取券类错误标识(用于判断连续相同错误)
 * 优先返回命中的错误关键词(bizCode/错误描述),否则返回完整错误字符串
 * @param {*} error - createOrder 透出的 error
 * @returns {string}
 */
function getCouponErrorKey(error) {
  const errStr = formatErrInfo(error) || "";
  return COUPON_RETRY_ERROR_KEYS.find(key => errStr.includes(key)) || errStr;
}

/**
 * 根据当前 useQuan 重建用券场景的 payments（COUPON 段）
 * @param {Array} useQuan - 当前生效券
 * @param {string} card_id - 补手续费卡号（可选）
 * @param {number} quan_fee - 券手续费
 * @returns {Array} payments 数组
 */
function buildCouponPayments(useQuan, card_id, quan_fee) {
  const payments = useQuan.map(item => ({
    payMethod: "COUPON",
    couponCodeParams:
      item.couponCode +
      "-" +
      item.couponType +
      (item.concreteProductType == "COMMON" ? "-TICKET" : "")
  }));
  if (quan_fee > 0 && card_id) {
    payments.push({ payMethod: "CARD", payCardNumber: card_id });
  }
  return payments;
}

export default class H5UmeOrderManage {
  constructor(order, logger, platManage, isTestOrder, getCurrentParams) {
    this.logger = logger;
    this.platManage = platManage;
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder;
    this.getCurrentParams = getCurrentParams;
  }

  /**
   * 获取最优卡券列表组合
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string|number} params.hallId - 影厅ID
   * @param {string|number} params.scheduleId - 场次ID
   * @param {string} params.scheduleKey - 场次Key
   * @param {string} params.seatIds - 座位ID，格式：用|分隔
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<Object>} { cards, preferCouponInfo, privileges, error? }
   */
  async getOptimalCardQuanCompose({
    cinemaLinkId,
    hallId,
    scheduleId,
    scheduleKey,
    seatIds,
    session_id
  }) {
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      umeToken: session_id
    };
    try {
      this.logger.infoSave("获取最优卡券列表组合参数", params);
      const res = await this.appApi.getCardQuanList(params);
      let orderInfo = res.bizValue;
      this.logger.info("获取最优卡券列表组合返回", {
        orderInfo,
        params
      });
      return orderInfo;
    } catch (error) {
      this.logger.errorSave("获取最优卡券列表组合返回异常", { error });
      return null;
    }
  }

  /**
   * 单次调用创建订单接口（不含任何重试）
   * @param {Object} data - 参数对象
   * @returns {Promise<Object>} 创建订单结果（成功返回 bizValue，失败返回 { error }）
   */
  async createOrderOnce(data) {
    let {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      lockOrderId,
      tickets,
      totalPrice,
      payAmount,
      payments
    } = data;
    const { session_id, mobile } =
      this.getCurrentParams?.()?.list?.[this.getCurrentParams?.()?.inx] || {};
    try {
      let params = {
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        lockOrderId,
        tickets,
        totalPrice,
        payAmount,
        payments,
        mobile,
        umeToken: session_id
      };
      this.logger.infoSave("创建订单参数", { params });
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave("创建订单返回", { res });
      return res.bizValue;
    } catch (error) {
      this.logger.errorSave("创建订单异常", { error });
      return { error };
    }
  }

  /**
   * 创建订单（含超时重试 + 用券场景换券重试）
   *
   * 重试策略：
   * - 超时：用卡时内部重试一次，失败直接返回（超时非券类问题，不触发换券重试）
   * - 用券场景非超时异常：从备选券池换券重试
   *   - 备选池 >= 票数：全量替换（整批换下一批），受 COUPON_RETRY_LIMIT 限制
   *     全量下一批不足票数时直接停止走转单
   *   - 备选池 < 票数但 > 0：逐个替换（定位坏券），受 COUPON_SINGLE_RETRY_LIMIT 限制
   *   - 备选池 = 0：停止走转单
   *
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string|number} data.scheduleId - 场次ID
   * @param {string} data.scheduleKey - 场次Key
   * @param {string|number} data.lockOrderId - 锁座订单ID
   * @param {string} data.tickets - 座位信息JSON字符串
   * @param {number} data.totalPrice - 总价
   * @param {number} data.payAmount - 支付金额
   * @param {string} data.payments - 支付方式JSON字符串
   * @param {string} [data.card_id] - 会员卡ID（可选）
   * @param {Array} [data.useQuan] - 当前生效券（用券场景必传，用于换券重试）
   * @param {Array} [data.remainQuanList] - 备选券池（用券场景必传）
   * @param {string} [data.seatIds] - 座位ID（|分隔，COMMON券重跑checkQuan用）
   * @param {number} [data.quan_fee] - 券手续费（重建payments用）
   * @param {number} [data.ticket_num] - 票数
   * @param {boolean} [data.isUseQuanScene] - 是否用券场景
   * @param {number} [data.isTimeoutRetry=1] - 是否超时重试，默认1
   * @returns {Promise<Object>} 创建订单结果（成功时附带 finalUseQuan 标识最终用券）
   */
  async createOrder(data) {
    let {
      card_id,
      useQuan = [],
      isUseQuanScene = false,
      isTimeoutRetry = 1 // 默认超时重试
    } = data;

    let createOrderRes = await this.createOrderOnce(data);

    // 成功直接返回
    if (createOrderRes?.orderId) {
      return createOrderRes;
    }

    let lastError = createOrderRes?.error;
    const isTimeout = formatErrInfo(lastError).includes("超时");

    // 超时场景:用卡时内部重试一次,失败直接返回(超时非券类问题,不触发换券重试)
    if (isTimeout) {
      if (isTimeoutRetry === 1 && card_id) {
        this.logger.infoSave("创建订单接口超时，延迟1秒后重试");
        await mockDelay(1);
        const retryRes = await this.createOrder({
          ...data,
          isTimeoutRetry: 0
        });
        if (retryRes?.orderId) {
          this.logger.infoSave("创建订单请求接口超时，延迟2秒后重试成功");
          return retryRes;
        }
        this.logger.errorSave("创建订单请求接口超时，延迟2秒后重试失败");
      }
      // 超时失败直接返回,不透出 error
      return;
    }

    // 非超时异常:非用券场景透出 error(主链路可据此判断),用券场景进入换券重试
    if (!isUseQuanScene || !useQuan?.length) {
      return { error: lastError };
    }

    // 用券场景换券重试
    if (!isCouponRetryableError(lastError)) {
      // 非可重试错误(如网络异常),透出 error
      return { error: lastError };
    }

    // 委托给独立的换券重试方法
    return await this.retryCreateOrderWithCouponSwap(data, lastError);
  }

  /**
   * 用券场景创建订单异常换券重试
   *
   * 策略:自适应、不切换
   * - 备选池 >= 票数:全量替换(整批换下一批),受 COUPON_RETRY_LIMIT 限制
   *   全量下一批不足票数时直接停止走转单(不退化到逐个)
   * - 备选池 < 票数但 > 0:逐个替换(累积,定位坏券),受 COUPON_SINGLE_RETRY_LIMIT 限制
   * - 备选池 = 0:停止走转单
   *
   * @param {Object} data - createOrder 入参(含 useQuan/remainQuanList/seatIds/quan_fee/ticket_num 等)
   * @param {*} firstError - 首次失败错误
   * @returns {Promise<Object|undefined>} 成功返回 { ...bizValue, finalUseQuan },失败返回 undefined
   */
  async retryCreateOrderWithCouponSwap(data, firstError) {
    const {
      card_id,
      useQuan = [],
      remainQuanList = [],
      seatIds,
      quan_fee = 0,
      ticket_num,
      cinemaLinkId,
      scheduleId,
      scheduleKey
    } = data;

    // 当前生效券(深拷贝,避免污染原 useQuan)
    let workingUseQuan = [...useQuan];
    // 备选券池队列
    let remainQuanPool = [...remainQuanList];
    // 已试过券码集合(日志用)
    let triedCouponCodes = useQuan.map(item => item.couponCode);
    let couponRetryInx = 0;
    let lastError = firstError;
    let finalUseQuan = useQuan; // 最终用券(成功时返回)
    // 是否已用过全量替换;一旦用过,后续备选不足票数时直接停止,不退化到逐个
    let usedFullSwap = false;
    // 连续相同错误检测(首次错误算第1次)
    let prevErrorKey = getCouponErrorKey(firstError);
    let sameErrorCount = 1;

    while (true) {
      // 备选池耗尽 → 停止
      if (!remainQuanPool.length) {
        this.logger.errorSave("换券重试耗尽,走转单", {
          triedCouponCodes,
          remainCount: 0
        });
        break;
      }

      // 动态选策略:备选充足走全量,不足走逐个
      const isFullSwap = remainQuanPool.length >= ticket_num;
      // 全量策略下下一批不足票数时直接停止走转单(不切到逐个)
      if (!isFullSwap && usedFullSwap) {
        this.logger.errorSave("全量换券后备选不足票数,走转单", {
          triedCouponCodes,
          remainCount: remainQuanPool.length,
          ticket_num
        });
        break;
      }

      let swappedInCodes;
      let swapMode;
      if (isFullSwap) {
        const couponRetryLimit = COUPON_RETRY_LIMIT;
        if (couponRetryInx >= couponRetryLimit) {
          this.logger.errorSave("换券重试耗尽,走转单", {
            triedCouponCodes,
            remainCount: remainQuanPool.length
          });
          break;
        }
        // 全量替换:取下一批 ticket_num 张整批替换
        workingUseQuan = remainQuanPool.splice(0, ticket_num);
        finalUseQuan = workingUseQuan;
        usedFullSwap = true;
        swappedInCodes = workingUseQuan.map(item => item.couponCode);
        swapMode = "全量替换";
      } else {
        const couponRetryLimit = COUPON_SINGLE_RETRY_LIMIT;
        if (couponRetryInx >= couponRetryLimit) {
          this.logger.errorSave("换券重试耗尽,走转单", {
            triedCouponCodes,
            remainCount: remainQuanPool.length
          });
          break;
        }
        // 逐个替换:累积替换,每次只换一个位置
        const swapPos = couponRetryInx % ticket_num;
        const nextOne = remainQuanPool.shift();
        workingUseQuan[swapPos] = nextOne;
        finalUseQuan = workingUseQuan;
        swappedInCodes = [nextOne.couponCode];
        swapMode = `逐个替换位置${swapPos}`;
      }
      triedCouponCodes.push(...swappedInCodes);
      this.logger.infoSave("创建订单优惠券异常,换券重试", {
        retryInx: couponRetryInx + 1,
        swapMode,
        newCouponCodes: swappedInCodes,
        triggerError: formatErrInfo(lastError)
      });

      // 重建 payments
      const newPayments = JSON.stringify(
        buildCouponPayments(workingUseQuan, card_id, Number(quan_fee || 0))
      );
      // 重跑券核销查询(放开类型限制,所有券均重跑)
      await this.checkQuan({
        couponCodes: workingUseQuan.map(item => item.couponCode).join(),
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        seatIds,
        commonCouponJson: JSON.stringify(
          workingUseQuan.map(item => ({
            couponCode: item.couponCode,
            concreteProductType: "TICKET"
          }))
        )
      });

      // 重试创建订单
      const createOrderRes = await this.createOrderOnce({
        ...data,
        payments: newPayments
      });

      if (createOrderRes?.orderId) {
        // 成功,返回时附带最终用券,供主链路替换
        return { ...createOrderRes, finalUseQuan };
      }

      lastError = createOrderRes?.error;
      // 非可重试错误 → 停止
      if (!isCouponRetryableError(lastError)) {
        this.logger.errorSave("创建订单异常(非券类错误),走转单", {
          error: lastError
        });
        break;
      }
      // 超时错误 → 停止(重试中遇到超时不再重试)
      if (formatErrInfo(lastError).includes("超时")) {
        this.logger.errorSave("换券重试中遇到超时,走转单", {
          error: lastError
        });
        break;
      }
      // 连续相同错误检测:换券后仍返回相同错误,说明非单券问题,提前停止
      const currErrorKey = getCouponErrorKey(lastError);
      if (currErrorKey === prevErrorKey) {
        sameErrorCount++;
      } else {
        prevErrorKey = currErrorKey;
        sameErrorCount = 1;
      }
      if (sameErrorCount >= 2) {
        this.logger.errorSave("连续2次相同错误,换券无效,走转单", {
          errorKey: currErrorKey,
          triedCouponCodes
        });
        break;
      }
      couponRetryInx++;
    }

    // 重试耗尽,返回 undefined(主链路走原转单逻辑)
    return;
  }

  /**
   * 购买电影票
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.cardNo - 会员卡号
   * @param {string} params.orderId - 订单ID
   * @param {string} params.session_id - 会话ID
   * @param {string} params.member_pwd - 会员密码
   * @param {Object} params.orderInfo - 订单信息
   * @returns {Promise<Object>} { buyRes, error? }
   */
  async buyTicket({
    cinemaLinkId,
    cardNo,
    orderId,
    session_id,
    member_pwd,
    orderInfo
  }) {
    let params = {
      cinemaLinkId,
      orderId,
      orderType: "TICKET",
      umeToken: session_id
    };
    if (cardNo) {
      params.cardNumber = cardNo;
    }
    params.cardCinemaLinkId = cinemaLinkId;
    params.cardPassword = member_pwd;

    try {
      console.log("订单购买参数", params);
      const buyRes = await this.appApi.buyTicket(params);
      console.log("订单购买返回", buyRes);
      return {
        params,
        buyRes
      };
    } catch (error) {
      console.error("订单购买异常", error);
      if (
        formatErrInfo(error)?.includes("密码") &&
        formatErrInfo(error)?.includes("错误")
      ) {
        this.logger.infoSave("发送密码配置错误提醒");
        sendWxPusherMessage({
          orderInfo,
          msgType: 5,
          cardNoByPwdError: cardNo,
          failReason: "密码输入错误，请检查卡号密码是否正确"
        });
      }
      if (
        formatErrInfo(error).includes("超时") ||
        formatErrInfo(error).includes("timeout of")
      ) {
        sendWxPusherMessage({
          orderInfo,
          transferTip: "订单支付接口超时，请关注该订单购买出票情况",
          failReason: formatErrInfo(error)
        });
      }
      return {
        error,
        params
      };
    }
  }

  /**
   * 取消订单
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.orderId - 订单ID
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelOrder({ cinemaLinkId, orderId, session_id }) {
    let params = {
      empCode: "",
      leaseCode: "",
      orderType: "TICKET",
      cinemaLinkId,
      orderId,
      umeToken: session_id
    };
    try {
      const res = await this.appApi.cannelOneOrder(params);
      this.logger.infoSave("取消订单返回", {
        res,
        params
      });
      return res;
    } catch (error) {
      this.logger.errorSave("降级-取消订单-异常", {
        error,
        params
      });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
      return false;
    }
  }

  /**
   * 释放座位
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string|number} params.lockOrderId - 锁座订单ID
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<boolean>} 是否成功
   */
  async releaseSeat({ cinemaLinkId, lockOrderId, session_id }) {
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      lockOrderId,
      umeToken: session_id
    };
    try {
      const res = await this.appApi.unlockSeat(params);
      this.logger.infoSave("释放座位入参及返回", {
        params,
        res
      });
      return res;
    } catch (error) {
      this.logger.errorSave("降级-释放座位-异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "释放座位失败，建议手动释放座位，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
      return false;
    }
  }

  /**
   * 获取支付结果（取票码）
   * @param {Object} data - 参数对象
   * @param {string} data.orderId - 订单ID
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.session_id - 会话ID
   * @param {boolean} [data.isUseQuan] - 是否使用券
   * @param {number} [data.inx=1] - 重试次数
   * @param {Logger} [data.logger] - 日志实例（可选）
   * @returns {Promise<string>} 取票码
   */
  async getPayResult(data) {
    let {
      orderId,
      cinemaLinkId,
      session_id,
      logger,
      isUseQuan,
      inx = 1
    } = data || {};
    let qrcode;
    let targetLogger = logger || this.logger;
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        orderId,
        orderType: "TICKET",
        cinemaLinkId,
        needMatchConsumeGift: !!isUseQuan,
        umeToken: session_id
      };
      if (inx == 1) {
        targetLogger.infoSave("获取支付结果参数", { params });
      }
      const res = await this.appApi.getOrderInfo(params);
      targetLogger.infoSave(`第${inx}次获取支付结果返回`, { res });
      qrcode =
        res?.bizValue?.ticketInfo?.confirmationId?.split(",").join("|") || "";
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
      // 获取失败后从已完成订单里匹配获取
      try {
        const listRes = await this.appApi.getOrderList({
          umeToken: session_id
        });
        targetLogger.infoSave(`第${inx}次获取已完成订单列表返回`, {
          listRes: listRes?.bizValue?.slice(0, 2)
        });
        let payList = listRes.bizValue || [];
        let targetObj = payList.find(item => item.orderId == orderId);
        qrcode = targetObj?.ticketInfo?.confirmationId?.split(",").join("|");
        targetLogger.infoSave(
          `第${inx}次从已完成订单里获取取票码${qrcode ? "成功" : "失败"}`,
          {
            qrcode
          }
        );
      } catch (error) {
        targetLogger.errorSave(`第${inx}次获取已完成订单列表异常`, { error });
      }
    }
    if (qrcode) {
      return qrcode;
    }
    return Promise.reject("获取支付结果不存在");
  }

  /**
   * 从订单列表获取订单信息
   * @param {Object} params - 参数对象
   * @param {string} params.session_id - 会话ID
   * @param {number} [params.retryCount=1] - 重试次数
   * @returns {Promise<Object>} 订单信息
   */
  async getOrderInfoByOrderList({ session_id, retryCount = 1 }) {
    const MAX_RETRY_COUNT = 3;
    try {
      const params = {
        umeToken: session_id
      };
      this.logger.infoSave("获取订单列表参数", params);
      const res = await this.appApi.getOrderList(params);
      let orderList = res?.bizValue || [];
      this.logger.infoSave("获取订单列表返回", {
        orderList: orderList.slice(0, 5)
      });
      const { film_name, show_time, lockseat } = this.order;
      let targerOrder = orderList.find(item => {
        const { filmName, showDate, seatNames } = item.ticketInfo || {};
        return (
          filmName === film_name &&
          +new Date(show_time) == showDate &&
          seatNames.split("|").every(itemA => lockseat.includes(itemA))
        );
      });
      if (targerOrder) {
        this.logger.infoSave("从订单列表获取到目标订单", { targerOrder });
        return targerOrder;
      }
      // 重试2次获取订单列表
      if (!targerOrder && retryCount < MAX_RETRY_COUNT) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          retryCount: retryCount + 1
        });
      }
    } catch (error) {
      this.logger.errorSave("从订单列表获取到目标订单异常", { error });
      // 重试2次获取订单列表
      if (retryCount < MAX_RETRY_COUNT) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          retryCount: retryCount + 1
        });
      }
    }
  }

  /**
   * 核销券
   * @param {Object} data - 参数对象
   * @param {string} data.couponCodes - 券码，多个用逗号分隔
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string|number} data.scheduleId - 场次ID
   * @param {string} data.scheduleKey - 场次Key
   * @param {string} data.seatIds - 座位ID，格式：用|分隔
   * @param {string} data.commonCouponJson - 通用券JSON字符串
   * @returns {Promise<void>}
   */
  async checkQuan(data) {
    try {
      const { session_id } =
        this.getCurrentParams?.()?.list?.[this.getCurrentParams?.()?.inx] || {};
      let params = {
        ...data,
        umeToken: session_id
      };
      this.logger.infoSave("核销券参数", { params });
      const res = await this.appApi.checkQuan(params);
      this.logger.infoSave("核销券返回", { res });
    } catch (error) {
      this.logger.errorSave("核销券异常", { error });
    }
  }

  /**
   * 最后处理：获取取票码并上传
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单ID
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {number} params.order_id - 平台订单ID
   * @param {string} params.app_name - 影院标识
   * @param {string} [params.card_id] - 会员卡ID（可选）
   * @param {string} params.order_number - 订单号
   * @param {string} params.supplierCode - 供应商编码
   * @param {string} params.plat_name - 平台名称
   * @param {Object} params.orderInfo - 订单信息
   * @param {string} params.lockseat - 座位信息
   * @param {boolean} [params.isUseQuan] - 是否使用券
   * @returns {Promise<Object>} { qrcode, submitRes }
   */
  async lastHandle({
    orderId,
    cinemaLinkId,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    plat_name,
    orderInfo,
    lockseat,
    isUseQuan
  }) {
    const { appFlag } = this;
    try {
      let qrcode;
      const session_id =
        this.getCurrentParams?.()?.list?.[this.getCurrentParams?.()?.inx]
          ?.session_id;
      try {
        // 获取订单结果
        qrcode = await this.getPayResult({
          orderId,
          cinemaLinkId,
          session_id,
          isUseQuan
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "获取订单支付结果，取票码不存在，准备开始异步轮询获取"
        });
        this.asyncFetchQrcodeSubmit({
          orderId,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat,
          session_id,
          isUseQuan
        });
        return;
      }
      this.logger.infoSave("非异步获取订单支付结果成功");
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag: 1,
        logger: this.logger,
        orderInfo: JSON.parse(JSON.stringify(orderInfo))
      });
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("出票最后处理发现异常", { error });
    }
  }

  /**
   * 异步轮询获取取票码并提交
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单ID
   * @param {number} params.order_id - 平台订单ID
   * @param {string} params.app_name - 影院标识
   * @param {string} [params.card_id] - 会员卡ID（可选）
   * @param {string} params.plat_name - 平台名称
   * @param {string} params.order_number - 订单号
   * @param {string} params.supplierCode - 供应商编码
   * @param {Object} params.orderInfo - 订单信息
   * @param {string} params.lockseat - 座位信息
   * @param {string} params.session_id - 会话ID
   * @param {boolean} [params.isUseQuan] - 是否使用券
   * @returns {Promise<void>}
   */
  async asyncFetchQrcodeSubmit({
    orderId,
    order_id,
    app_name,
    card_id,
    plat_name,
    order_number,
    supplierCode,
    orderInfo,
    lockseat,
    session_id,
    isUseQuan
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init(orderInfo);
    try {
      logger.errorSave("异步轮询获取取票码并提交方法开始执行");
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderId,
            cinemaLinkId: this.order.cinemaLinkId,
            session_id,
            inx,
            logger,
            isUseQuan
          }),
        9,
        20,
        "",
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        logger.errorSave("系统延迟轮询3分钟后获取取票码仍失败");
        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.getPayResult({
              orderId,
              cinemaLinkId: this.order.cinemaLinkId,
              session_id,
              inx,
              logger,
              isUseQuan
            }),
          21,
          20,
          "",
          7 * 60
        );
      }
      if (!qrcode) {
        logger.errorSave("系统延迟轮询10分钟后获取取票码仍失败");
        // 上送异步轮询获取取票码失败日志
        logger.logUpload();
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟轮询10分钟后获取取票码仍失败"
          }
        });
        return;
      }
      await this.platManage.submitTicketCode({
        qrcode,
        flag: 2,
        logger,
        orderInfo: JSON.parse(JSON.stringify(orderInfo))
      });
      // 上送异步轮询获取取票码成功日志
      logger.logUpload();
    } catch (error) {
      logger.errorSave("异步轮询获取取票码上传提交异常", { error });
      // 上送异步轮询获取取票码异常日志
      logger.logUpload();
    }
  }

  /**
   * 转单处理
   * @param {Object} unlockSeatInfo - 解锁座位信息
   * @returns {Promise<Object>} 转单参数
   */
  async transferOrder(unlockSeatInfo) {
    this.logger.errorSave("降级-转单-进入", unlockSeatInfo || {});
    if (unlockSeatInfo) {
      const {
        cinemaLinkId,
        lockOrderId,
        orderId,
        session_id: unlockSessionId
      } = unlockSeatInfo || {};
      const current = this.getCurrentParams?.();
      const list = current?.list;
      const inx = current?.inx;
      const session_id = unlockSessionId ?? list?.[inx]?.session_id;
      // 1、释放座位(仅锁座id存在时)
      if (!orderId && lockOrderId) {
        await this.releaseSeat({ cinemaLinkId, lockOrderId, session_id });
      }
      // 2、取消订单(创建订单id存在时)
      if (orderId) {
        await this.cancelOrder({
          cinemaLinkId,
          orderId,
          session_id
        });
      }
    }

    // 3、平台转单
    // 获取转单原因（优先读 _lastErrCache，防止 logList 被 logUpload 异步清空导致失败原因为空）
    let { err_msg: errMsg = "", err_info: errInfo = "" } =
      this.logger.getLastErrMsgAndInfo() || {};
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
    let des = "自动转单处于关闭状态，只取消订单释放座位，需手动出票或转单";
    if (this.order.isAgain) {
      des = "重新出票失败，不转单只取消订单释放座位，需手动出票或转单";
    }
    if (this.isTestOrder || isAutoTransfer !== "1" || this.order.isAgain) {
      this.logger.infoSave("自动转单处于关闭状态");
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: des,
        failReason: `${errMsg}——${errInfo}`
      });
      return;
    }
    return await this.platManage.orderTransferByPlat(errMsg, errInfo);
  }
}
