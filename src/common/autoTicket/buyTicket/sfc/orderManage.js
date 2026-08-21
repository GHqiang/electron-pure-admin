/**
 * SFC订单管理模块
 *
 * 职责：
 * - 订单价格计算
 * - 订单创建
 * - 订单购买
 * - 获取支付结果（取票码）
 * - 上传取票码到平台
 * - 转单逻辑
 * - 释放座位、取消订单
 *
 * 所属流程：出票流程
 *
 * 依赖模块：
 * - PlatManage: 平台管理模块（用于上传取票码、转单）
 * - SeatManage: 座位管理模块（用于释放座位）
 *
 * @module sfc/orderManage
 */
import {
  formatErrInfo,
  sendWxPusherMessage,
  mockDelay,
  trial,
  getCurrentTime
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO, sfcV3AppList } from "@/common/constant";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
import { encode } from "@/utils/sfc-member-password";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

const { updateQuanBlackInfo } = usesMachineBaseFun();

export default class SfcOrderManage {
  constructor(
    order,
    logger,
    platManage,
    isTestOrder,
    getCurrentParams,
    seatManage
  ) {
    this.logger = logger;
    this.platManage = platManage;
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isTestOrder = isTestOrder;
    this.isV3App = sfcV3AppList.includes(this.appFlag);
    this.getCurrentParams = getCurrentParams;
    this.seatManage = seatManage;
  }

  /**
   * 计算订单价格
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string|number} data.show_id - 场次ID
   * @param {string} data.seat_ids - 座位ID
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.quan_code - 优惠券编码
   * @param {string} data.member_coupon_id - 会员卡赠送线下券ID
   * @param {string} data.coupon_id - 会员卡赠送线上券ID
   * @param {string} data.session_id - 会话ID
   * @param {string} data.appFlag - 应用标识
   * @returns {Promise<Object>} { price?, error? }
   */
  async priceCalculation(data) {
    const {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      card_id,
      quan_code,
      session_id,
      appFlag,
      member_coupon_id,
      coupon_id,
      is_first,
      isUseCardFail
    } = data;
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      seat_ids: seat_ids,
      quan_code: "",
      card_id: "",
      additional_goods_info: "", // 附加商品信息
      goods_info: "", // 商品信息
      is_first: is_first || "0", // 是否是首次购买 0-不是 1-是
      option_goods_info: "", // 可选的额外商品信息
      update_time: getCurrentTime(),
      session_id
    };
    let isV3App = sfcV3AppList.includes(appFlag);
    if (isV3App) {
      params.is_open_svip = "0";
    }
    try {
      // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
      await mockDelay(0.5);
      if (quan_code) {
        params.quan_code = quan_code; // 优惠券编码
      }
      if (card_id && !isV3App) {
        params.card_id = card_id; // 会员卡id
      }
      if (member_coupon_id) {
        params.member_coupon_id = member_coupon_id; // 会员卡赠送线下券id
      }
      if (coupon_id) {
        // 会员卡赠送线上券id（线上券时还要必传card_id，而且创建订单接口也需要特殊处理）
        params.coupon_id = coupon_id;
        // 用卡失败时去掉卡号
        if (isUseCardFail) {
          delete params.card_id;
          delete params.quan_code;
          params.goods_coupon_id = "";
        }
      }
      this.logger.infoSave("计算订单价格参数", {
        params
      });
      const res = await this.appApi.priceCalculation(params);
      let price = res.data;
      this.logger.infoSave("计算订单价格返回", res);
      const defaultCardId = price?.defaultCardPrice?.default_card?.id;
      if (card_id && defaultCardId && defaultCardId !== card_id) {
        this.logger.infoSave(
          "计算订单价格返回的用卡id和入参卡id不一致，重新请求"
        );
        return this.priceCalculation({
          ...data,
          is_first: 0
        });
      }
      return price;
    } catch (error) {
      this.logger.errorSave("计算订单价格异常", { error });
      // { "error": "{\"status\":0,\"errcode\":\"-1\",\"msg\":\"当前价格为会员卡的售票系统补贴价，无法叠加使用线上券，请分开支付\",\"data\":{}}" }
      // 8.3.3版本疑似线上券不必传card_id了，先做兼容处理，后续等确认了接口变更了再优化掉这个兼容逻辑
      if (
        error?.msg?.includes(
          "当前价格为会员卡的售票系统补贴价，无法叠加使用线上券"
        )
      ) {
        this.logger.infoSave(
          "当前价格为会员卡的售票系统补贴价，无法叠加使用线上券，准备去掉card_id重试计算订单价格"
        );
        return this.priceCalculation({
          ...data,
          isUseCardFail: true
        });
      }
      return { error };
    }
  }

  /**
   * 创建订单
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string|number} data.show_id - 场次ID
   * @param {string} data.seat_ids - 座位ID
   * @param {string} data.seat_info - 座位描述
   * @param {string|number} data.pay_money - 支付金额
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.coupon - 优惠券券码（线下券场景；线上券/线下会员券场景为空）
   * @param {string} data.coupon_nums - 本次实际用券的券码串（逗号分隔，三种券类型统一，
   *   券不可用时按此更新黑名单——黑名单按券码 coupon_num 过滤，券 ID 无法参与比对）
   * @param {string} data.quan_flag - 券标识
   * @param {string} data.plat_name - 平台名称
   * @param {string} data.order_number - 订单号
   * @param {string} data.member_coupon_id - 会员卡赠送线下券ID
   * @param {string} data.coupon_id - 会员卡赠送线上券ID
   * @param {string} data.promo_id - 促销活动ID
   * @param {string} data.payType - 支付类型
   * @param {number} data.isTimeoutRetry - 是否超时重试，默认1
   * @returns {Promise<string>} order_num 订单号
   */
  async createOrder(data) {
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      seat_info,
      pay_money,
      card_id,
      coupon,
      coupon_nums,
      quan_flag,
      plat_name,
      order_number,
      member_coupon_id,
      coupon_id,
      promo_id,
      payType,
      isTimeoutRetry = 1 // 默认超时重试
    } = data || {};
    try {
      const currentParams = this.getCurrentParams();
      const current = currentParams?.list?.[currentParams?.inx] || {};
      const { mobile, member_pwd, session_id } = current;
      let params = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        seat_info, // 座位描述，如：7排11号,7排10号
        phone: mobile || "", // 用户手机号
        additional_goods_info: "", // 附加商品信息
        companion_info: "", // 携伴信息
        goods_info: "", // 商品信息
        option_goods_info: "", // 可选的额外商品信息
        pay_money, // 支付金额
        promo_id, // 促销活动ID
        update_time: getCurrentTime(),
        session_id
      };
      if (coupon) {
        params.coupon = coupon; // 优惠券券码
      } else if (member_coupon_id) {
        params.member_coupon_id = member_coupon_id; // 开卡赠送线下券id
      }
      if (coupon_id) {
        params.coupon_id = coupon_id; // 线上券id
      }
      if (card_id && payType === "cardPay") {
        // isV3App版本是只有一个卡，故只用支付的时候输入密码即可
        params.card_id = card_id; // 会员卡id
        params.card_password = encode(member_pwd || ""); // 会员卡密码
      }
      this.logger.infoSave("创建订单参数", { params });
      let res = await this.appApi.createOrder(params);
      this.logger.infoSave("创建订单返回", { res });
      let order_num = res.data?.order_num || "";
      return order_num;
    } catch (error) {
      this.logger.errorSave("创建订单异常", { error });
      if (
        formatErrInfo(error)?.includes("密码") &&
        formatErrInfo(error)?.includes("错误")
      ) {
        this.logger.infoSave("发送密码配置错误提醒");
        sendWxPusherMessage({
          orderInfo: this.order,
          msgType: 5,
          cardNoByPwdError: card_id,
          failReason: "密码输入错误，请检查卡号密码是否正确"
        });
      }
      // 只有内部用户支持该功能，外部用户待券维护分开后再放开该功能
      if (
        error?.msg?.includes("请联系影院将使用该券的原订单后台退款后") &&
        isTimeoutRetry === 1
      ) {
        // 黑名单按券码 coupon_num 过滤：线上券(coupon_id)/线下会员券(member_coupon_id)
        // 场景 coupon(=quan_code) 为空，优先用 useRes 带出的券码串 coupon_nums，
        // 否则黑名单不更新、坏券反复参与出票（2026-08-20 修复）
        const blackCoupon = coupon_nums || coupon;
        this.logger.infoSave("创建订单时发现券不可用，进行更新黑名单处理", {
          quan_flag,
          coupon: blackCoupon
        });
        // 更新券黑名单
        updateQuanBlackInfo({
          coupon: blackCoupon,
          quan_flag,
          plat_name,
          order_number,
          app_name: this.appFlag,
          logger: this.logger
        });
      }
      if (error?.msg === "请求接口超时,请重试" && isTimeoutRetry === 1) {
        this.logger.infoSave("创建订单请求接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const order_num = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (order_num) {
            this.logger.infoSave("创建订单请求接口超时，延迟1秒后重试成功", {
              order_num
            });
            return order_num;
          }
        } catch (error) {
          this.logger.errorSave("创建订单请求接口超时，延迟2秒后重试失败", {
            error
          });
        }
      }
    }
  }

  /**
   * 购买订单
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string} data.order_num - 订单号
   * @param {string|number} data.pay_money - 支付金额
   * @param {string} data.session_id - 会话ID
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.pay_password - 支付密码
   * @param {Object} data.orderInfo - 订单信息
   * @returns {Promise<Object>} { buyRes?, error?, params }
   */
  async buyTicket(data) {
    const {
      city_id,
      cinema_id,
      order_num,
      pay_money,
      session_id,
      card_id,
      pay_password,
      orderInfo
    } = data;
    let params = {
      city_id,
      cinema_id,
      open_id: GET_APP_INFO(this.appFlag)?.sfc_open_id, // 微信openId
      order_num, // 订单号
      pay_money, // 支付金额
      pay_type: "", // 购买方式 传空意味着用优惠券或者会员卡
      session_id
    };
    try {
      if (this.isV3App && card_id) {
        params.pay_type = "wallet";
        params.pay_password = pay_password;
      }
      this.logger.infoSave("订单购买参数", params);
      const buyRes = await this.appApi.buyTicket(params);
      this.logger.infoSave("订单购买返回", buyRes);
      return {
        buyRes,
        params
      };
    } catch (error) {
      this.logger.errorSave("订单购买异常", error);
      if (
        formatErrInfo(error)?.includes("密码") &&
        formatErrInfo(error)?.includes("错误")
      ) {
        this.logger.infoSave("发送密码配置错误提醒");
        sendWxPusherMessage({
          orderInfo,
          msgType: 5,
          cardNoByPwdError: card_id,
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
   * 获取购票信息（取票码）
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string} data.order_num - 订单号
   * @param {string} data.session_id - 会话ID
   * @param {Object} data.logger - 日志对象
   * @param {number} data.inx - 第几次查询，默认1
   * @returns {Promise<string>} qrcode 取票码
   */
  async payOrder(data) {
    const { isV3App } = this;
    let {
      city_id,
      cinema_id,
      order_num,
      session_id,
      logger,
      inx = 1
    } = data || {};
    try {
      let params = {
        city_id,
        cinema_id,
        order_num, // 订单号
        order_type: "ticket", // 订单类型
        order_type_num: 1, // 订单子类型数量，可能是指购买的该类型票的数量
        session_id
      };
      if (isV3App) {
        params.business_type = "1";
      }
      if (inx === 1) {
        logger.infoSave("获取支付结果传参", {
          params
        });
      }
      const res = await this.appApi.payOrder(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, { res });
      let qrcode = res.data.qrcode || "";
      if (qrcode) {
        return qrcode;
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, {
        error
      });

      // v3版本没这个接口
      if (!isV3App) {
        let params = {
          cinema_id,
          city_id,
          order_status: "0",
          page: "1",
          session_id,
          width: "240"
        };
        try {
          const res = await this.appApi.getOrderList(params);
          let list = res.data?.order_data || [];
          if (list.length) {
            let targetObj = list.find(item => item.order_num === order_num);
            if (targetObj) {
              let qrcode = targetObj.ticket_code?.split(",").join("|");
              if (qrcode) {
                logger.infoSave(`第${inx}次从已完成订单里获取取票码成功`, {
                  qrcode
                });
                return qrcode;
              } else {
                logger.errorSave(`第${inx}次从已完成订单里获取取票码失败`, {
                  list,
                  order_num
                });
              }
            }
          }
        } catch (error) {
          logger.errorSave(
            `第${inx}次从已完成订单里获取取票码异常`,
            formatErrInfo(error)
          );
        }
      }
      return Promise.reject(error);
    }
  }

  /**
   * 最后处理：获取支付结果并上传取票码
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string} data.order_num - 订单号
   * @param {string|number} data.order_id - 订单ID
   * @param {string} data.app_name - 应用名称
   * @param {string} data.card_id - 会员卡ID
   * @param {string} data.order_number - 订单号（平台）
   * @param {string} data.supplierCode - 供应商代码
   * @param {string} data.plat_name - 平台名称
   * @param {string} data.session_id - 会话ID
   * @param {Object} data.orderInfo - 订单信息
   * @param {string} data.lockseat - 锁定座位信息
   * @returns {Promise<Object>} { submitRes?, qrcode? }
   */
  async lastHandle({
    city_id,
    cinema_id,
    order_num,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    plat_name,
    session_id,
    orderInfo,
    lockseat,
    profit
  }) {
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.payOrder({
          city_id,
          cinema_id,
          order_num,
          session_id,
          logger: this.logger
        });
      } catch {
        // 忽略 lastHandle 异常，继续返回
      }
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
          city_id,
          cinema_id,
          order_num,
          session_id,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat,
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
      // submitRes: {} | undefined
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
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string} data.order_num - 订单号
   * @param {string} data.session_id - 会话ID
   * @param {string} data.app_name - 应用名称
   * @param {string} data.plat_name - 平台名称
   * @param {string} data.order_number - 订单号（平台）
   * @param {Object} data.orderInfo - 订单信息
   * @returns {Promise<void>}
   */
  async asyncFetchQrcodeSubmit({
    city_id,
    cinema_id,
    order_num,
    session_id,
    app_name,
    plat_name,
    order_number,
    orderInfo,
    profit
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init(orderInfo);
    logger.errorSave("异步轮询获取取票码并提交方法开始执行");
    try {
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.payOrder({
            city_id,
            cinema_id,
            order_num,
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
            this.payOrder({
              city_id,
              cinema_id,
              order_num,
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
        logger.errorSave("订单提交取票码失败");

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
    this.logger.errorSave("降级-转单-进入", unlockSeatInfo || {});
    if (unlockSeatInfo) {
      const { order_num } = unlockSeatInfo;
      const currentParams = this.getCurrentParams();
      const current = currentParams?.list?.[currentParams?.inx] || {};
      const session_id = unlockSeatInfo.session_id ?? current.session_id;
      if (order_num) {
        await this.cancelOrder({ ...unlockSeatInfo, session_id });
      } else {
        await this.releaseSeat({ ...unlockSeatInfo, session_id }, 1);
      }
    }
    // 3、平台转单
    // 获取转单原因（优先读 _lastErrCache，防止 logList 被 logUpload 异步清空导致失败原因为空）
    let { err_msg: errMsg = "", err_info: errInfo = "" } =
      this.logger.getLastErrMsgAndInfo() || {};
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
    // 关闭自动转单只针对座位异常生效
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
   * 释放座位
   * @param {Object} unlockSeatInfo - 解锁座位信息
   * @param {number} flag - 标识：1-转单，2-换号
   * @returns {Promise<Object>} res
   */
  async releaseSeat(unlockSeatInfo, flag) {
    const { city_id, cinema_id, show_id, start_day, start_time, session_id } =
      unlockSeatInfo;
    try {
      const seatDataRes = await this.seatManage.getSeatLayout({
        city_id,
        cinema_id,
        show_id,
        session_id
      });
      let errFlag = ["", "转单释放座位时", "换号出票释放座位时"][flag];
      let seatList = seatDataRes?.seatData || [];
      if (!seatList?.length) {
        this.logger.errorSave(`${errFlag}-获取座位布局异常`, {
          error: seatDataRes?.error
        });
        return;
      }
      let availableSeatList = seatList.filter(item => item[2] === "0"); // 1表示已售
      let seat_ids = availableSeatList.map(item => item[0])?.[0]; // 第0个代表座位id
      if (!seat_ids) {
        this.logger.errorSave(`${errFlag}-获取未售座位为空`, {
          seatList
        });
        return;
      }
      // 4、锁定座位
      let lockParams = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id,
        logLevel: 1
      };
      this.logger.warn("转单时释放座位传参", lockParams);
      const res = await this.seatManage.lockSeatHandle(lockParams); // 锁定座位
      this.logger.infoSave("释放座位入参及返回", {
        lockParams,
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
    }
  }

  /**
   * 取消订单
   * @param {Object} unlockSeatInfo - 解锁座位信息
   * @returns {Promise<Object>} res
   */
  async cancelOrder(unlockSeatInfo) {
    let { order_num, session_id } = unlockSeatInfo || {};
    let params = {
      order_num,
      session_id
    };
    try {
      // SFC 使用专门的 cancelOrder API，而不是 lockSeat
      const res = await this.appApi.cancelOrder(params);
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
    }
  }
}
