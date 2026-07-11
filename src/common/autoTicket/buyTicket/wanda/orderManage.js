// 订单管理模块
import {
  formatErrInfo,
  mockDelay,
  trial,
  sendWxPusherMessage
} from "@/utils/utils";
import { wandaAesDecrypt } from "@/utils/wandaAesDecrypt";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";

export default class OrderManage {
  constructor(order, logger, platManage, isTestOrder) {
    this.logger = logger; // 日志模块
    this.platManage = platManage; // 平台管理模块
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder; // 是否是测试订单
  }

  /**
   * 锁座并验证订单状态（含重试）
   *
   * 仅返回 orderId 不算成功，需轮询 order_status.api 确认
   * subTicketOrderStatus[0].orderStatus === 40 才算锁座成功
   * 失败自动取消订单后重新锁座
   *
   * @param {Object} params
   * @param {string} params.dId - 场次ID
   * @param {string} params.mobile - 手机号
   * @param {string} params.seatId - 座位ID串
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<{success: boolean, order_num: string}>}
   */
  async lockAndCreateOrder({ dId, mobile, seatId, session_id }) {
    const maxRetry = 3; // 最多重试 3 次
    let lastOrderNum = "";

    for (let attempt = 0; attempt < maxRetry; attempt++) {
      if (attempt > 0) {
        this.logger.infoSave(`锁座验证失败，第${attempt + 1}次重新锁座`);
        // 取消上次失败的订单（订单可能已回滚，忽略取消失败）
        if (lastOrderNum) {
          await this.cancelOrder({
            orderId: lastOrderNum,
            session_id
          }).catch(() => {});
        }
        await mockDelay(1);
      }

      // Step 1: 锁座（直接调 appApi.createOrder，不走 seatManage 的额外重试）
      let lockRes;
      try {
        lockRes = await this.appApi.createOrder({
          dId,
          retailerCode: "MX",
          mobile,
          seatId,
          json: true
        });
      } catch (error) {
        this.logger.errorSave(`第${attempt + 1}次锁座异常`, {
          error: formatErrInfo(error)
        });
        continue;
      }

      const order_num = lockRes?.data?.orderId;
      this.logger.infoSave(`createOrder 第${attempt + 1}次返回`, {
        orderId: order_num,
        bizCode: lockRes?.data?.bizCode,
        bizMsg: lockRes?.data?.bizMsg
      });

      if (!order_num) {
        this.logger.infoSave(`第${attempt + 1}次锁座-orderId为空`);
        continue;
      }
      lastOrderNum = order_num;

      // Step 2: 轮询 order_status.api 验证订单是否真正就绪
      const ready = await this.waitForOrderReady({
        orderId: order_num,
        session_id
      });

      if (ready) {
        return { success: true, order_num };
      }

      this.logger.infoSave(
        `第${attempt + 1}次锁座后订单状态异常(orderStatus≠40)`
      );
    }

    // 全部重试失败 → 等价于获取目标座位失败
    return { success: false, order_num: "" };
  }

  /**
   * 等待订单就绪（对照小程序 orderstatus + modefiyPhone）
   *
   * 小程序流程（selectseat/index.js:758）：
   * 1. create_order.api 后轮询 order_status.api，每500ms直到 orderStatus !== 10
   * 2. 手机号不同时调用 confirm_order.api 绑定手机
   * 3. orderStatus === 40（待付款）表示订单可查询
   *
   * @param {Object} params
   * @param {string} params.orderId - 订单ID
   * @param {string} params.session_id - 会话ID
   * @param {string} params.mobilePhone - 目标手机号（绑定用）
   * @returns {Promise<boolean>} 订单是否就绪
   */
  async waitForOrderReady({ orderId, session_id, mobilePhone = "" }) {
    const maxRetry = 30; // 30次 × 0.5秒 = 15秒（小程序12秒超时）

    for (let i = 0; i < maxRetry; i++) {
      try {
        const params = { orderId, wanda_token: session_id };
        const res = await this.appApi.queryOrderStatus(params);

        if (i === 0) {
          this.logger.infoSave("订单状态轮询首次返回", { res, orderId });
        }

        const orderStatus = res?.data?.orderStatus;
        const subOrderStatus =
          res?.data?.subTicketOrderStatus?.[0]?.orderStatus;

        if (orderStatus === 10) {
          // 10 = 处理中，继续轮询
          if ((i + 1) % 5 === 0) {
            this.logger.info(
              `订单状态轮询第${i + 1}次: orderStatus=10（处理中，继续等待）`
            );
          }
          await mockDelay(0.5);
          continue;
        }

        // ★ 对照小程序 selectseat/index.js:771-782：
        //   orderStatus !== 10 表示处理完成，需进一步检查子订单状态
        //   - subTicketOrderStatus[0].orderStatus === 40 → 待付款，可查询
        //   - subTicketOrderStatus[0].orderStatus === 20 → 锁座失败
        //   - subTicketOrderStatus 为空 → 锁座失败（订单被回滚）
        //   只有 40 才表示订单真正就绪可查询
        const orderReady = subOrderStatus === 40;
        this.logger.infoSave(
          `订单处理完成: orderStatus=${orderStatus}, subOrderStatus=${subOrderStatus}，` +
            `${orderReady ? "订单就绪" : "锁座失败"}，共轮询${i + 1}次`
        );

        if (!orderReady) {
          // 锁座失败，不继续
          return false;
        }

        // 参照小程序 selectseat/index.js:771：手机号不同时调用 confirm_order.api
        if (mobilePhone) {
          try {
            const confirmParams = {
              orderId,
              mobilePhone,
              wanda_token: session_id
            };
            const confirmRes = await this.appApi.confirmOrder(confirmParams);
            this.logger.infoSave("绑定订单手机号返回", {
              confirmRes,
              orderId,
              mobilePhone
            });
          } catch (err) {
            this.logger.warn?.("绑定订单手机号异常（不影响主流程）", {
              error: formatErrInfo(err),
              orderId
            });
          }
        }

        return true;
      } catch (error) {
        if (i < maxRetry - 1) {
          this.logger.info(`订单状态查询异常，${0.5}秒后重试...`, {
            error: formatErrInfo(error)
          });
          await mockDelay(0.5);
          continue;
        }
        this.logger.errorSave("订单状态轮询异常", {
          orderId,
          error: formatErrInfo(error)
        });
        return false;
      }
    }

    this.logger.errorSave("订单状态轮询超时", { orderId, maxRetry });
    return false;
  }

  // 转单
  async transferOrder(unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      // 2、取消订单(创建订单id存在时)
      if (unlockSeatInfo.orderId) await this.cancelOrder(unlockSeatInfo);
    }

    // 3、平台转单
    // 获取转单原因
    const errInfoObj = this.logger.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
    // 关闭自动转单只针对座位异常生效
    // if (this.isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
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

  /**
   * 取消订单
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 取消订单结果对象，或 null（取消失败）
   */
  async cancelOrder({ orderId, session_id }) {
    let params = { orderId, wanda_token: session_id };
    try {
      const res = await this.appApi.cancelOrder(params);
      this.logger.infoSave("取消订单返回", { res, params });
      return res?.data || null;
    } catch (error) {
      this.logger.errorSave("万达取消订单异常", {
        error: formatErrInfo(error),
        params
      });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 计算订单价格（查询 Wanda 订单全价，作为成本基准）
   * @param {Object} params - 参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 包含 total_price 的对象，或 null（查询失败）
   *
   * 逻辑说明：
   * - 调用 queryOrderByUserId 获取订单详情
   * - 从订单详情中提取 ticketAmount 或 salesAmount 作为 total_price
   * - 返回 { total_price } 供后续报价规则使用
   */
  async priceCalculation({ orderId, session_id }) {
    let params = { orderId, wanda_token: session_id };
    // 锁座后 Wanda 后端有索引延迟，queryOrderByUserId 可能立即返回空，加重试
    const maxRetry = 3;
    for (let i = 0; i < maxRetry; i++) {
      try {
        const res = await this.appApi.queryOrderByUserId(params);
        if (i === 0) {
          this.logger.infoSave("查询用户订单返回", { res, params });
        }
        const orderRes = res?.data || {};
        if (!orderRes?.orderInf?.length) {
          if (i < maxRetry - 1) {
            this.logger.info(
              `查询用户订单为空（bizCode=${orderRes.bizCode}），${i + 1}秒后重试...`
            );
            await mockDelay(1);
            continue;
          }
          this.logger.errorSave("查询用户订单重试后仍为空", {
            orderId,
            bizCode: orderRes.bizCode
          });
          return null;
        }
        const orderInfo =
          orderRes.orderInf.find(item => item.orderId === orderId) || {};
        this.logger.infoSave("计算价格返回", orderInfo);
        return orderInfo;
      } catch (error) {
        if (i < maxRetry - 1) {
          this.logger.info(`查询用户订单异常，${i + 1}秒后重试...`);
          await mockDelay(1);
          continue;
        }
        this.logger.errorSave("万达计算订单价格异常", {
          error: formatErrInfo(error)
        });
      }
    }
  }

  /**
   * 购买订单（合并支付，含卡券 requestInfo）
   * @param {Object} params - 购买参数对象
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.mobilePhone - 用户手机号
   * @param {string} params.cinemaId - 影院 ID
   * @param {Object} params.requestInfo - 卡券 requestInfo 对象
   * @param {string} params.session_id - 会话 ID
   * @return {Object|null} 购买结果对象，或 null（购买失败）
   *
   * 逻辑说明：
   * - 调用 mergePayment API 进行合并支付
   * - 传入必要参数（orderId, mobilePhone, cinemaId, requestInfo, wanda_token）
   * - 返回购买结果，供后续轮询支付结果使用
   */
  async createOrder({
    orderId,
    mobilePhone,
    cinemaId,
    requestInfo,
    session_id
  }) {
    let params = {
      orderId,
      mobilePhone,
      cinemaId,
      requestInfo: JSON.stringify(requestInfo),
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("购买订单参数", params);
      const res = await this.appApi.mergePayment(params);

      // merge_payment 返回 data 是 AES-ECB 密文，需解密
      // 单座卡支付通常返回密文（同步扣款），多座返回明文 JSON（异步授权）
      let resData = res;
      let isDecrypted = false;
      if (res && typeof res.data === "string" && res.code === 0) {
        const decrypted = wandaAesDecrypt(res.data);
        if (decrypted) {
          try {
            resData = { ...res, data: JSON.parse(decrypted) };
            isDecrypted = true;
          } catch (e) {
            this.logger.errorSave("解密支付结果JSON失败", {
              error: e?.message,
              rawData: res.data?.substring(0, 200)
            });
          }
        } else {
          this.logger.errorSave("AES解密返回空", {
            rawData: res.data?.substring(0, 200)
          });
        }
      }

      const bizCode = resData.data?.bizCode;
      const bizMsg = resData.data?.bizMsg;
      const tradeNo = resData.data?.tradeNo;
      this.logger.infoSave("购买订单返回", {
        isDecrypted,
        bizCode,
        bizMsg,
        tradeNo,
        resData
      });
      return {
        success: bizCode === 0,
        tradeNo
      };
    } catch (error) {
      this.logger.errorSave("购买订单异常", {
        error: formatErrInfo(error)
      });
      if (
        formatErrInfo(error).includes("超时") ||
        formatErrInfo(error).includes("timeout of")
      ) {
        this.logger.infoSave("订单支付接口超时，请关注该订单购买出票情况");
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "订单支付接口超时，请关注该订单购买出票情况",
          failReason: formatErrInfo(error)
        });
        return { isTimeout: true };
      }
    }
  }

  // 获取购票信息（最多重试 3 次，间隔 1 秒）
  // 注意：此方法只负责查取票码，支付轮询已上提到 getQrcodeUploadByPlat 中一次性完成
  async getPayResult(data) {
    let { orderId, session_id, logger, inx = 1 } = data || {};
    const maxRetry = 3;
    for (let i = 0; i < maxRetry; i++) {
      let qrcode;
      try {
        let params = { orderId, wanda_token: session_id };
        if (inx == 1 && i === 0) {
          logger.infoSave("获取支付结果参数", params);
        } else {
          logger.info(`获取支付结果第${i + 1}次尝试`, params);
        }
        // 用 query_by_userid 获取订单详情（含取票码 electronicCode）
        const res = await this.appApi.queryOrderByUserId(params);
        if (i === 0) {
          logger.infoSave(`第${inx}次获取支付结果返回`, res);
        }

        const orderInf = res?.data?.orderInf || res?.orderInf || [];
        const orderInfo =
          orderInf.find(o => o.orderId === orderId) || orderInf[0] || {};
        const { orderStatus, subTicketOrderInfo = [] } = orderInfo;
        const subOrder = subTicketOrderInfo[0];

        if (orderStatus && orderStatus == 100) {
          qrcode =
            subOrder?.electronicCode?.[0] ||
            subOrder?.snackExchangeCode ||
            subOrder?.verifyCode ||
            "";
        }
        if (orderStatus === 30) {
          logger.errorSave("万达出票失败", { orderStatus, subOrder });
          return Promise.reject("万达出票失败");
        }
        // 记录非终态（如40=待付款），方便排查支付未完成的原因
        if (orderStatus && orderStatus !== 100 && orderStatus !== 30) {
          logger.info(
            `获取支付结果第${i + 1}次: orderStatus=${orderStatus}（非终态，继续等待）`
          );
        }
        if (qrcode) {
          logger.infoSave("获取取票码成功", { qrcode });
          return qrcode;
        }
      } catch (error) {
        logger.errorSave(
          `第${inx}次获取订单支付结果异常`,
          formatErrInfo(error)
        );
      }
      // 未获取到则等待 1 秒后重试
      if (i < maxRetry - 1) {
        await mockDelay(1);
      }
    }
    return Promise.reject("获取支付结果不存在");
  }

  /**
   * ★ 对照小程序 loopCheckOrderStatus + checkCouponStatus 支付轮询流程
   *
   * 小程序逻辑（pages/ticket/order/confirm/index.js）：
   * 1. merge_payment 成功后调用 loopCheckOrderStatus
   * 2. loopCheckOrderStatus 每 600ms 轮询 query_pay_info_upgrade.api，直到 paymentStatus=30
   * 3. 储值卡（无 prepayParams）→ 直接进入 checkCouponStatus
   * 4. checkCouponStatus 每 600ms 轮询 query_pay_deal_result.api，直到 status=2（成功）
   *
   * 注意：query_pay_info_upgrade 不只是"查询"，它会实际触发储值卡支付状态的升级。
   * 不调这个接口，卡永远不会被扣款（orderStatus 永远停在 40 待付款）。
   *
   * @param {Object} params
   * @param {string} params.orderId - 订单 ID
   * @param {string} params.tradeNo - merge_payment 返回的交易流水号
   * @param {Object} params.logger - 日志对象
   */
  async _waitForPayment({ orderId, tradeNo, logger }) {
    // ─── 阶段1：轮询 query_pay_info_upgrade，等待 paymentStatus === 30 ───
    logger.infoSave("[支付轮询-阶段1] 开始轮询 query_pay_info_upgrade", {
      orderId,
      tradeNo
    });
    const maxRetry1 = 30; // 30次 × 1秒 = 30秒（小程序30秒超时）
    let paymentReady = false;

    for (let i = 0; i < maxRetry1; i++) {
      try {
        const res = await this.appApi.queryPayInfoUpgrade({ orderId, tradeNo });
        const paymentStatus = res?.data?.res?.paymentStatus;
        logger.info(
          `[支付轮询-阶段1] 第${i + 1}次: paymentStatus=${paymentStatus}`
        );

        // 首次调用记录完整返回体，方便排查字段缺失问题
        if (i === 0) {
          logger.infoSave("[支付轮询-阶段1] 首次查询返回", {
            orderId,
            tradeNo,
            response: res?.data
          });
        }

        if (paymentStatus === 30) {
          // 支付准备就绪
          paymentReady = true;
          logger.infoSave("[支付轮询-阶段1] paymentStatus=30，支付准备就绪", {
            orderId,
            tradeNo,
            response: res?.data?.res
          });

          // 判断是否有微信支付 prepayParams（储值卡支付时为空）
          const prepayParams = res?.data?.res?.payment?.prepayParams;
          if (prepayParams && prepayParams.length > 0) {
            logger.infoSave(
              "[支付轮询-阶段1] 检测到微信支付 prepayParams，但当前仅支持储值卡",
              { orderId, tradeNo, prepayParams }
            );
            // 微信支付路径需要前端调起 wx.requestPayment，本项目不支持，直接报错
            throw new Error("检测到微信支付流程，当前仅支持储值卡支付");
          }
          // 储值卡：prepayParams 为空，直接进入阶段2
          logger.infoSave(
            `[支付轮询-阶段1] 储值卡路径（无prepayParams），进入阶段2（共轮询${i + 1}次）`
          );
          break;
        }

        if (paymentStatus === 20) {
          // 支付失败
          const errInfo =
            res?.data?.res?.paymentErrorInfo || "支付失败(状态20)";
          logger.errorSave("[支付轮询-阶段1] 支付失败 paymentStatus=20", {
            orderId,
            tradeNo,
            errInfo,
            response: res?.data?.res
          });
          throw new Error(`支付失败: ${errInfo}`);
        }

        // paymentStatus === 10（处理中）或其他值，继续等待
        // 记录非预期状态值，方便发现新的状态码
        if (
          paymentStatus !== undefined &&
          ![10, 20, 30].includes(paymentStatus)
        ) {
          logger.infoSave(
            `[支付轮询-阶段1] 第${i + 1}次: 未预期的 paymentStatus=${paymentStatus}`,
            { orderId, tradeNo, response: res?.data?.res }
          );
        }
      } catch (error) {
        if (error.message?.includes("支付失败")) throw error;
        logger.errorSave(`[支付轮询-阶段1] 查询异常`, {
          orderId,
          tradeNo,
          error: error?.message || error
        });
      }

      if (i < maxRetry1 - 1) {
        await mockDelay(1); // 间隔1秒（小程序用600ms，这里用1秒更稳妥）
      }
    }

    if (!paymentReady) {
      throw new Error(
        `[支付轮询-阶段1] 超时(${maxRetry1}秒)，paymentStatus未变为30`
      );
    }

    // ─── 阶段2：轮询 query_pay_deal_result，等待 status === 2（成功） ───
    logger.infoSave("[支付轮询-阶段2] 开始轮询 query_pay_deal_result", {
      orderId,
      tradeNo
    });
    const maxRetry2 = 30; // 30次 × 1秒 = 30秒
    let dealSuccess = false;

    for (let i = 0; i < maxRetry2; i++) {
      try {
        const res = await this.appApi.queryPayDealResult({ orderId, tradeNo });
        const status = res?.data?.res?.status;
        logger.info(`[支付轮询-阶段2] 第${i + 1}次: status=${status}`);

        // 首次调用记录完整返回体
        if (i === 0) {
          logger.infoSave("[支付轮询-阶段2] 首次查询返回", {
            orderId,
            tradeNo,
            response: res?.data
          });
        }

        if (status === 2) {
          // ★ 支付成功
          dealSuccess = true;
          logger.infoSave(
            `[支付轮询-阶段2] 支付结果确认成功 status=2（共轮询${i + 1}次）`,
            { orderId, tradeNo, response: res?.data?.res }
          );
          break;
        }

        if (status === 3) {
          // ★ 对照小程序：status=3 + errorType=0 对储值卡 = 支付成功
          // 小程序 checkCouponStatus 中 status=3 时 redirect 到订单详情页，并非报错
          const errorType = res?.data?.res?.errorType;
          if (errorType === 0) {
            dealSuccess = true;
            logger.infoSave(
              `[支付轮询-阶段2] 储值卡支付成功 status=3 errorType=0（共轮询${i + 1}次）`,
              { orderId, tradeNo, response: res?.data?.res }
            );
            break;
          }
          // errorType ≠ 0 才是真正的支付失败
          logger.errorSave("[支付轮询-阶段2] 支付结果失败 status=3", {
            orderId,
            tradeNo,
            errorType,
            response: res?.data?.res
          });
          throw new Error(`支付结果失败: errorType=${errorType}`);
        }

        // status === 1（处理中），继续等待
      } catch (error) {
        if (error.message?.includes("支付结果失败")) throw error;
        logger.errorSave(`[支付轮询-阶段2] 查询异常`, {
          orderId,
          tradeNo,
          error: error?.message || error
        });
      }

      if (i < maxRetry2 - 1) {
        await mockDelay(1);
      }
    }

    if (!dealSuccess) {
      throw new Error(`[支付轮询-阶段2] 超时(${maxRetry2}秒)，status未变为2`);
    }

    logger.infoSave("[支付轮询] 全部完成，订单已支付", { orderId, tradeNo });
  }

  /**
   * 最后处理：获取取票码并上传，失败则异步轮询
   *
   * 流程分层：
   * 1. _waitForPayment —— 一次性支付轮询（对照小程序 loopCheckOrderStatus + checkCouponStatus）
   * 2. getPayResult —— 查取票码（3次×1秒快速重试）
   * 3. asyncFetchQrcodeSubmit —— 异步长轮询取票码（3分钟+7分钟），不再触碰支付
   */
  async getQrcodeUploadByPlat({ order_num, tradeNo, session_id, profit }) {
    try {
      // ── 第1层：一次性支付轮询（tradeNo 在此消费，后续不再重复）──
      if (tradeNo) {
        try {
          this.logger.infoSave("[支付轮询] 开始一次性支付确认", {
            orderId: order_num,
            tradeNo
          });
          await this._waitForPayment({
            orderId: order_num,
            tradeNo,
            logger: this.logger
          });
          this.logger.infoSave("[支付轮询] 支付确认完成，开始获取取票码", {
            orderId: order_num
          });
        } catch (e) {
          this.logger.errorSave("[支付轮询] 支付确认失败", {
            orderId: order_num,
            tradeNo,
            error: e?.message || e
          });
          sendWxPusherMessage({
            orderInfo: this.order,
            transferTip: "支付确认失败，需人工核查订单是否已扣款",
            failReason: `[支付轮询] ${e?.message || "未知错误"}`
          });
          // 支付失败不继续，直接返回
          return;
        }
      } else {
        // 无 tradeNo 时说明 merge_payment 未返回交易流水号（可能是同步扣款已完成）
        this.logger.infoSave(
          "[支付轮询] 无 tradeNo，跳过支付轮询（可能为同步扣款场景）",
          { orderId: order_num }
        );
      }

      // ── 第2层：快速查取票码 ──
      let qrcode;
      try {
        qrcode = await this.getPayResult({
          orderId: order_num,
          session_id,
          logger: this.logger
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        this.asyncFetchQrcodeSubmit({
          order_num,
          session_id,
          profit
        });
        return;
      }
      this.logger.infoSave("非异步获取订单支付结果成功");
      const { order_number, plat_name } = this.order;
      const submitRes = await this.submitQrcode({
        qrcode,
        order_number,
        plat_name,
        flag: 1,
        logger: this.logger
      });
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("获取取票码并上传发现异常", formatErrInfo(error));
    }
  }

  // 异步轮询获取取票码并提交（只轮询取票码，不重复触发支付）
  async asyncFetchQrcodeSubmit({ order_num, session_id, profit }) {
    let logger = new Logger({ logType: 3 });
    logger.init(this.order);
    const { plat_name, order_number } = this.order;
    let conPrefix = "";
    try {
      logger.infoSave("异步轮询获取取票码并提交方法开始执行", {
        orderId: order_num
      });
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderId: order_num,
            session_id,
            logger,
            inx
          }),
        9,
        20,
        conPrefix,
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        logger.errorSave("系统延迟轮询3分钟后获取取票码仍失败");

        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.getPayResult({
              orderId: order_num,
              session_id,
              logger,
              inx
            }),
          21,
          20,
          conPrefix,
          7 * 60
        );
      }
      if (!qrcode) {
        logger.errorSave("系统延迟轮询7分钟后获取取票码仍失败");
        logger.logUpload();
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟轮询7分钟后获取取票码仍失败"
          }
        });
        return;
      }
      await this.submitQrcode({
        qrcode,
        order_number,
        plat_name,
        flag: 2,
        logger,
        profit
      });
      logger.logUpload();
    } catch (error) {
      console.warn("异步轮询获取取票码上传提交异常", error);
      logger.logUpload();
    }
  }

  // 上传取票码
  async submitQrcode({
    qrcode,
    order_number,
    plat_name,
    flag,
    logger,
    profit
  }) {
    try {
      // 10、提交取票码
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag,
        logger,
        orderInfo: JSON.parse(JSON.stringify(this.order))
      });
      if (!submitRes || submitRes?.error) {
        logger.errorSave("订单提交取票码失败，单个订单直接出票结束");

        let errInfo = submitRes?.error;
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return;
      }
      if (flag !== 1) {
        // 异步提交 -更新出票结果
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            qrcode,
            order_status: "1",
            err_msg: "系统延迟后轮询获取提交取票码成功",
            ...(profit ? { profit } : {})
          }
        });
      }
      return submitRes;
    } catch (error) {
      logger.errorSave("提交取票码异常", error);
    }
  }
}
