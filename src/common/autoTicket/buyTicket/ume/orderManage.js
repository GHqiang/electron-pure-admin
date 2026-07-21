/**
 * UME订单管理模块
 *
 * 职责：
 * - 订单创建
 * - 订单购买
 * - 获取支付结果（取票码）
 * - 上传取票码到平台
 * - 转单逻辑
 * - 取消订单
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - PlatManage: 平台管理模块（用于上传取票码、转单）
 *
 * @module ume/orderManage
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  mockDelay,
  trial,
  getCurrentTime
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";

const { updateQuanBlackInfo } = usesMachineBaseFun();

export default class UmeOrderManage {
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
   * @param {string} params.orderCode - 订单编码
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string|number} params.orderHeaderId - 订单头ID
   * @param {string|number} params.scheduleId - 场次ID
   * @param {string} params.scheduleKey - 场次Key
   * @param {string} params.filmUniqueId - 电影唯一ID
   * @param {string} params.showDate - 放映日期
   * @param {Array} params.ticketDetail - 座位详情
   * @param {string} params.showDateTime - 放映日期时间
   * @param {string|number} params.lockOrderId - 锁座订单ID
   * @param {number} params.timestamp - 时间戳
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<Object>} { cards, coupons, activities, error? }
   */
  async getOptimalCardQuanCompose({
    orderCode,
    cinemaCode,
    cinemaLinkId,
    orderHeaderId,
    scheduleId,
    scheduleKey,
    filmUniqueId,
    showDate,
    ticketDetail,
    showDateTime,
    lockOrderId,
    timestamp,
    session_id
  }) {
    try {
      let params = {
        params: {
          orderCode,
          cinemaCode,
          cinemaLinkId,
          sysSourceCode: "YZ001",
          orderHeaderId,
          timestamp,
          productInfo: null,
          orderType: "ticket_order",
          scheduleId,
          scheduleKey,
          filmUniqueId,
          showDate,
          ticketDetail,
          showDateTime,
          channelCode: "QD0000001",
          lockFlag: lockOrderId
        },
        ...(session_id && { session_id })
      };
      console.log("获取最优卡券列表组合参数", params);
      const res = await this.appApi.getCardQuanList(params);
      console.log("获取最优卡券列表组合返回", res);
      let ticketOptimalComb = res.data?.ticketOptimalComb || {};
      return {
        cards: ticketOptimalComb.cards || [],
        coupons: ticketOptimalComb.coupons || [],
        activities: ticketOptimalComb.activities || []
      };
    } catch (error) {
      console.error("获取最优卡券列表组合返回异常", error);
      return {
        error: formatErrInfo(error)
      };
    }
  }

  /**
   * 创建订单
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string|number} data.orderHeaderId - 订单头ID
   * @param {Array} data.coupon - 优惠券数组
   * @param {string} data.quan_flag - 券标识
   * @param {string} data.card_id - 会员卡ID
   * @param {string|number} data.activityId - 活动ID
   * @param {number} data.total_price - 总价
   * @param {number} data.timestamp - 时间戳
   * @param {number} [data.isTimeoutRetry=1] - 是否超时重试，默认1
   * @param {string} data.session_id - 会话ID
   * @param {string} data.mobile - 手机号
   * @returns {Promise<Object>} 创建订单结果
   */
  async createOrder(data) {
    const { appFlag } = this;
    let {
      cinemaCode,
      cinemaLinkId,
      orderHeaderId,
      coupon,
      quan_flag,
      card_id,
      activityId,
      total_price,
      timestamp,
      isTimeoutRetry = 1, // 默认超时重试
      session_id,
      mobile
    } = data;
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          cinemaCode,
          cinemaLinkId,
          sysSourceCode: "YZ001",
          timestamp,
          ticket: {
            orderHeaderId: "" + orderHeaderId,
            activityId: activityId || null,
            coupon: coupon || [],
            totalPrice: total_price
          },
          product: null,
          mainPushCard: null,
          cardId: card_id || "",
          ticketMobile: mobile,
          inviteCode: "",
          channelCode: "QD0000001",
          ...(["ume", "renhengmeng", "tpyyc"].includes(appFlag) && {
            fulfillPlace: "影院柜台",
            fulfillTime: "",
            fulfillType: ""
          }),
          ...(appFlag === "yaolai" && {
            digitalCode: "",
            isManual: "N"
          })
        },
        session_id
      };
      this.logger.infoSave("创建订单参数", { params });
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave("创建订单返回", res);
      let createOrderRes = res.data;
      return createOrderRes;
    } catch (error) {
      this.logger.errorSave("创建订单异常", {
        error
      });
      if (error?.msg?.includes("超时") && isTimeoutRetry === 1) {
        this.logger.infoSave("创建订单接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const createOrderRes = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (createOrderRes) {
            this.logger.infoSave("创建订单请求接口超时，延迟2秒后重试成功", {
              createOrderRes
            });
            return createOrderRes;
          }
        } catch (error) {
          this.logger.errorSave("创建订单请求接口超时，延迟2秒后重试失败", {
            error
          });
        }
      }
      // 券不可用，更新黑名单信息
      if (error?.msg?.includes("券") && error?.msg?.includes("不可用")) {
        let coupon = error?.msg?.split(" ")?.[1];
        const { plat_name, order_number } = this.order;
        // 更新券黑名单
        updateQuanBlackInfo({
          coupon,
          quan_flag,
          plat_name,
          order_number,
          app_name: this.appFlag,
          logger: this.logger
        });
      }
    }
  }

  /**
   * 购买订单
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.orderCode - 订单编码
   * @param {string} data.orderDate - 订单日期
   * @param {string} data.card_id - 会员卡ID
   * @param {Array} data.useQuan - 使用的优惠券数组
   * @param {string} data.paymentWay - 支付方式
   * @param {string} data.cardNo - 卡号
   * @param {string|number} data.orderHeaderId - 订单头ID
   * @param {string} data.session_id - 会话ID
   * @param {Object} data.orderInfo - 订单信息
   * @returns {Promise<Object>} { buyRes, zoneRes, tsgRes, error?, params }
   */
  async buyTicket(data) {
    const {
      cinemaCode,
      cinemaLinkId,
      orderCode,
      orderDate,
      card_id,
      useQuan,
      paymentWay,
      cardNo,
      orderHeaderId,
      session_id,
      orderInfo
    } = data;
    let params = {
      params: {
        paymentWay,
        orderHeaderId: "" + orderHeaderId,
        cardNo: card_id || cardNo || "",
        isMultiplePay: "",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      },
      session_id
    };
    try {
      console.log("订单购买参数", params);
      const buyRes = await this.appApi.buyTicket(params);
      console.log("订单购买返回", buyRes);
      let zoneRes, tsgRes;
      if (useQuan?.length) {
        zoneRes = await this.appApi.findZoneByChannel({
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            zoneSource: "20",
            cinemaCode,
            cinemaLinkId
          },
          session_id
        });
        console.warn("获取优惠活动返回结果", zoneRes);
        tsgRes = await this.appApi.findTsgGift({
          params: {
            channelCode: "QD0000001",
            sysSourceCode: "YZ001",
            cinemaCode,
            cinemaLinkId,
            orderHeaderId,
            orderDate,
            orderCode
          },
          session_id
        });
        console.warn("获取其它活动返回结果", tsgRes);
      }
      return {
        params,
        buyRes,
        zoneRes,
        tsgRes
      };
    } catch (error) {
      console.error("订单购买异常", error);
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
   * 获取支付结果（取票码）
   * @param {Object} data - 参数对象
   * @param {string|number} data.orderHeaderId - 订单头ID
   * @param {string} data.session_id - 会话ID
   * @param {Object} [data.logger] - 日志实例（可选）
   * @param {number} [data.inx=1] - 第几次查询，默认1
   * @returns {Promise<string>} qrcode 取票码
   */
  async getPayResult(data) {
    let { orderHeaderId, session_id, inx = 1, logger } = data || {};
    let qrcode;
    let targetLogger = logger || this.logger;
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          isDetail: "Y",
          orderHeaderId,
          keepLoading: true,
          channelCode: "QD0000001"
        },
        session_id
      };
      if (inx == 1) {
        targetLogger.infoSave("获取支付结果参数", { params });
      }
      const res = await this.appApi.getPayResult(params);
      targetLogger.infoSave(`第${inx}次获取支付结果返回`, { res });
      let list = res.data || [];
      qrcode = list[0]?.ticketCode?.split(",").join("|") || "";
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
    }
    // 获取失败后从已完成订单里匹配获取
    try {
      const listRes = await this.appApi.findStoreTkOrderInfoApp({
        params: {
          orderType: "ticket_order",
          isDetail: "Y",
          channelCode: "QD0000001"
        },
        pageIndex: 1,
        pageRow: 5,
        session_id
      });
      targetLogger.infoSave(`第${inx}次获取已完成订单列表返回`, {
        listRes: listRes?.data?.slice(0, 2)
      });
      let payList = listRes.data || [];
      let targetObj = payList.find(item => item.orderHeaderId == orderHeaderId);
      qrcode = targetObj?.ticketCode?.split(",").join("|");
      targetLogger.errorSave(
        `第${inx}次从已完成订单里获取取票码${qrcode ? "成功" : "失败"}`,
        {
          qrcode
        }
      );
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取已完成订单列表异常`, {
        error
      });
    }
    if (qrcode) {
      return qrcode;
    }
    return Promise.reject("获取支付结果不存在");
  }

  /**
   * 最后处理：获取支付结果并上传取票码
   * @param {Object} data - 参数对象
   * @param {string|number} data.orderHeaderId - 订单头ID
   * @param {string|number} data.order_id - 订单ID
   * @param {string} data.app_name - 应用名称
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.order_number - 订单号（平台）
   * @param {string} data.supplierCode - 供应商代码
   * @param {string} data.plat_name - 平台名称
   * @param {Object} data.orderInfo - 订单信息
   * @param {string} data.lockseat - 锁定座位信息
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<Object>} { submitRes?, qrcode? }
   */
  async lastHandle({
    orderHeaderId,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    plat_name,
    orderInfo,
    lockseat,
    session_id,
    profit
  }) {
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderHeaderId,
          session_id
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        this.asyncFetchQrcodeSubmit({
          orderHeaderId,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat,
          session_id,
          profit
        });
        return;
      }
      this.logger.infoSave("非异步获取订单支付结果成功");
      const submitRes = await this.submitQrcode({
        qrcode,
        orderInfo,
        flag: 1,
        logger: this.logger
      });
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("出票最后处理发现异常", {
        error
      });
    }
  }

  /**
   * 异步轮询获取取票码并提交
   * @param {Object} data - 参数对象
   * @param {string|number} data.orderHeaderId - 订单头ID
   * @param {string|number} data.order_id - 订单ID
   * @param {string} data.app_name - 应用名称
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.plat_name - 平台名称
   * @param {string} data.order_number - 订单号（平台）
   * @param {string} data.supplierCode - 供应商代码
   * @param {Object} data.orderInfo - 订单信息
   * @param {string} data.lockseat - 锁定座位信息
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<void>}
   */
  async asyncFetchQrcodeSubmit({
    orderHeaderId,
    app_name,
    plat_name,
    order_number,
    orderInfo,
    session_id,
    profit
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init({ plat_name, order_number, app_name });
    try {
      logger.errorSave("异步轮询获取取票码并提交方法开始执行");
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderHeaderId,
            session_id,
            inx,
            logger
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
              orderHeaderId,
              session_id,
              inx,
              logger
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
      await this.submitQrcode({
        qrcode,
        orderInfo,
        flag: 2,
        logger,
        profit
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
   * 提交取票码
   * @param {Object} data - 参数对象
   * @param {string} data.qrcode - 取票码
   * @param {number} data.flag - 标识：1-正常，2-异步轮询
   * @param {Object} data.logger - 日志对象
   * @param {Object} data.orderInfo - 订单信息
   * @returns {Promise<Object>} submitRes
   */
  async submitQrcode({ qrcode, flag, logger, orderInfo, profit }) {
    const { plat_name, order_number } = orderInfo;
    try {
      // 10、提交取票码
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag,
        logger,
        orderInfo: JSON.parse(JSON.stringify(orderInfo))
      });
      if (!submitRes || submitRes?.error) {
        logger.errorSave("订单提交取票码失败，单个订单直接出票结束");
        let errInfo = formatErrInfo(submitRes?.error);
        sendWxPusherMessage({
          orderInfo,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return;
      }
      if (flag !== 1) {
        // 更新出票结果
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
      logger.errorSave("提交取票码异常", { error });
    }
  }

  /**
   * 转单
   * @param {Object} unlockSeatInfo - 解锁座位信息
   * @returns {Promise<Object>} transferParams
   */
  async transferOrder(unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { cinemaCode, cinemaLinkId, orderHeaderId } = unlockSeatInfo;
      const currentParams = this.getCurrentParams();
      const current = currentParams?.list?.[currentParams?.inx] || {};
      const session_id = current.session_id;
      if (orderHeaderId && session_id) {
        await this.cancelOrder({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId,
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

  /**
   * 取消订单
   * @param {Object} unlockSeatInfo - 解锁座位信息
   * @param {string|number} unlockSeatInfo.cinemaCode - 影院编码
   * @param {string|number} unlockSeatInfo.cinemaLinkId - 影院链接ID
   * @param {string|number} unlockSeatInfo.orderHeaderId - 订单头ID
   * @param {string} unlockSeatInfo.session_id - 会话ID
   * @returns {Promise<Object>} res
   */
  async cancelOrder({ cinemaCode, cinemaLinkId, orderHeaderId, session_id }) {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        orderHeaderId,
        cinemaCode,
        cinemaLinkId
      },
      ...(session_id && { session_id })
    };
    try {
      const res = await this.appApi.cannelOneOrder(params);
      this.logger.infoSave("取消订单返回", {
        res,
        params
      });
      return res;
    } catch (error) {
      this.logger.errorSave("取消订单异常", {
        error,
        params
      });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }

  /**
   * 获取观影人列表（耀莱特殊处理）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<Object>} { moviegoersList, error? }
   */
  async findStoreMemberMoviegoersByMemberId({
    cinemaCode,
    cinemaLinkId,
    session_id
  }) {
    try {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        },
        session_id
      };
      console.log("获取观影人列表参数", params);
      const res = await this.appApi.findStoreMemberMoviegoersByMemberId(params);
      console.log("获取观影人列表返回", res);
      let moviegoersList = res.data || [];
      return {
        moviegoersList
      };
    } catch (error) {
      console.error("获取观影人列表异常", error);
      return {
        error: formatErrInfo(error)
      };
    }
  }

  /**
   * 添加观影人（耀莱特殊处理）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string|number} params.orderHeaderId - 订单头ID
   * @param {Array} params.orderMoviegoers - 观影人数组
   * @param {string} params.session_id - 会话ID
   * @returns {Promise<Object>} { error? }
   */
  async updateStoreOrderMoviegoers({
    cinemaCode,
    cinemaLinkId,
    orderHeaderId,
    orderMoviegoers,
    session_id
  }) {
    try {
      let params = {
        params: {
          orderHeaderId,
          orderMoviegoers,
          keepLoading: true,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        },
        session_id
      };
      console.log("添加观影人参数", params);
      const res = await this.appApi.updateStoreOrderMoviegoers(params);
      console.log("添加观影人返回", res);
      return res;
    } catch (error) {
      console.error("添加观影人异常", error);
      return {
        error: formatErrInfo(error)
      };
    }
  }
}
