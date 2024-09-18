import {
  getCinemaFlag, // 获取影院标识
  getCurrentFormattedDateTime, // 格式化当前日期时间
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化errInfo
  parseTimeStr
} from "@/utils/utils";
import { TEST_NEW_PLAT_LIST } from "@/common/constant.js";

import svApi from "@/api/sv-api"; // 机器api
import shangzhanApi from "@/api/shangzhan-api"; // 商展平台api
// 获取最终报价信息实体类
import getOfferPriceFun from "./commonOfferHandle.js";
// 平台toke列表
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动报价队列类
class OrderAutoOfferQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.conPrefix = "【商展自动报价】——"; // console打印前缀
    this.logList = []; // 队列运行日志
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    const { conPrefix } = this;
    console.log(conPrefix + "开始执行");
    // 设置队列为运行状态
    this.isRunning = true;
    this.handledOrders = new Map();
    this.queue = [];
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      let platQueueRule = window.localStorage.getItem("platQueueRule");
      platQueueRule = JSON.parse(platQueueRule).filter(
        item => item.platName === "shangzhan"
      );
      const { getInterval, handleInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      let processDelay = handleInterval;
      let orders = await this.fetchOrders(fetchDelay);
      // 将订单加入队列
      this.queue.push(...orders);
      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        const order = this.queue.shift(); // 取出队列首部订单并从队列里去掉
        if (order) {
          // 处理订单
          const offerResult = await this.orderHandle(order, processDelay);
          // offerResult：{ res, offerRule } || { offerRule, err_msg, err_info } || undefined
          // 添加订单处理记录
          await this.addOrderHandleRecored(order, offerResult);
          console.warn(
            conPrefix + `单个订单自动报价${offerResult?.res ? "成功" : "失败"}`,
            order
          );
        }
      }
    }
  }
  // 获取订单
  async fetchOrders(fetchDelay) {
    const { conPrefix } = this;
    try {
      await mockDelay(fetchDelay);
      // 获取待报价列表
      const stayList = await this.getStayOfferList();
      if (!stayList?.length) return [];
      let sfcStayOfferlist = stayList.map(item => {
        const {
          order_sn: id,
          order_detail,
          city_name,
          address: cinema_addr,
          ticket_num,
          cinema_name,
          hall_name,
          film_name,
          film_img = "",
          show_time,
          is_urgent = "",
          cinema_code = ""
        } = item;
        return {
          plat_name: "shangzhan",
          id,
          tpp_price: order_detail[0]?.price_ori,
          supplier_max_price: order_detail[0]?.check_price,
          city_name,
          cinema_addr,
          ticket_num,
          cinema_name,
          hall_name,
          film_name,
          film_img,
          show_time: parseTimeStr(show_time)?.startTime,
          rewards: 0, // 商展无奖励，只有快捷
          is_urgent, // 1紧急 0非紧急
          cinema_group: "",
          cinema_code, // 影院id
          order_number: item.order_sn || "",
          lockseat: "",
          order_detail
        };
      });
      // console.warn(conPrefix + "转换后的订单列表", sfcStayOfferlist);
      sfcStayOfferlist = sfcStayOfferlist
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            app_name: getCinemaFlag(item)
          };
        });
      // console.warn(
      //   conPrefix + "匹配已上架影院后的的待报价订单",
      //   sfcStayOfferlist
      // );
      if (!sfcStayOfferlist?.length) return [];
      let newOrders = sfcStayOfferlist.filter(
        item => !this.handledOrders.has(item.order_number)
      );
      // console.warn(
      //   conPrefix + "从当前队列报价记录过滤后的的待报价订单",
      //   newOrders
      // );
      if (!newOrders?.length) return [];
      newOrders.forEach(item => {
        this.handledOrders.set(item.order_number, 1);
        let logList = [
          {
            opera_time: getCurrentFormattedDateTime(),
            des: "商展新的待报价订单",
            level: "info",
            info: {
              newOrder: item
            }
          }
        ];
        logUpload(
          {
            plat_name: item.plat_name,
            app_name: item.app_name,
            order_number: item.order_number,
            type: 1
          },
          logList
        );
      });
      return newOrders;
    } catch (error) {
      console.error(conPrefix + "获取待报价订单异常", error);
      return [];
    }
  }
  // 处理订单
  async orderHandle(order, delayTime) {
    const { conPrefix } = this;
    try {
      await mockDelay(delayTime);
      // console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const offerResult = await this.singleOffer({
          order,
          offerList: [] // 动态调价暂时不用先传空
        });
        // { res, offerRule } || { offerRule, err_msg, err_info } || undefined
        return offerResult;
      } else {
        console.warn(conPrefix + "订单报价队列已停止");
      }
    } catch (error) {
      console.error("订单执行报价异常", error);
    }
  }

  // 添加订单处理记录
  async addOrderHandleRecored(order, offerResult) {
    const { conPrefix } = this;
    try {
      // 数据库存储
      // offerResult: { res, offerRule } || { offerRule } || undefined
      console.warn(
        conPrefix + "数据库存储报价记录",
        order,
        offerResult,
        this.logList
      );
      let errInfoObj = this.logList
        .filter(item => item?.level === "error")
        ?.reverse()?.[0];
      let serOrderInfo = {
        // user_id: order.user_id,
        plat_name: "shangzhan",
        app_name:
          order.app_name || offerResult?.offerRule?.shadowLineName || "",
        order_id: order.id,
        order_number: order.order_number,
        lockseat: order.lockseat,
        tpp_price: order.tpp_price,
        supplier_max_price: order.supplier_max_price,
        city_name: order.city_name,
        cinema_addr: order.cinema_addr,
        ticket_num: order.ticket_num,
        cinema_name: order.cinema_name,
        hall_name: order.hall_name,
        film_name: order.film_name,
        show_time: order.show_time,
        cinema_code: order.cinema_code,
        cinema_group: order.cinema_group,
        offer_type: offerResult?.offerRule?.offerType,
        offer_amount: offerResult?.offerRule?.offerAmount,
        rule_status: offerResult?.offerRule?.status,
        member_offer_amount: offerResult?.offerRule?.memberOfferAmount,
        member_price: offerResult?.offerRule?.memberCostPrice,
        real_member_price: offerResult?.offerRule?.real_member_price,
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        // remark: '',
        processing_time: getCurrentFormattedDateTime(),
        err_msg: offerResult?.err_msg || errInfoObj?.des || "",
        err_info:
          offerResult?.err_info ||
          (errInfoObj?.info ? formatErrInfo(errInfoObj?.info?.error) : ""),
        rewards: order.rewards, // 是否是奖励订单 1是 0否
        rule: tokens.userInfo.rule || 2
      };
      // 上传该订单的运行日志
      logUpload(
        {
          plat_name: "shangzhan",
          app_name: serOrderInfo.app_name,
          order_number: serOrderInfo.order_number,
          type: 1
        },
        this.logList
      );
      if (!isTestOrder) {
        console.warn("数据库存储当前订单报价记录", serOrderInfo);
        await svApi.addOfferRecord(serOrderInfo);
      }
    } catch (error) {
      console.error(conPrefix + "添加订单处理记录异常", error);
    }
  }

  // 提交报价
  async submitOffer(params) {
    const { conPrefix } = this;
    try {
      console.log(conPrefix + "提交报价参数", params);
      if (isTestOrder) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "测试单暂不进行报价",
          level: "info",
          info: { params }
        });
        return;
      }
      const res = await shangzhanApi.submitOffer(params);
      console.log(conPrefix + "提交报价返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "提交报价入参和返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "提交报价异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "提交报价异常",
        level: "error",
        info: { error, params }
      });
    }
  }

  // 单个报价
  async singleOffer({ order, offerList }) {
    const { conPrefix } = this;
    try {
      let offerExample = getOfferPriceFun({
        appFlag: order.app_name,
        plat_name: "shangzhan"
      });
      const result = await offerExample.getEndOfferPrice({
        order,
        offerList
      });
      // result: {endPrice, offerRule} | {offerRule, err_msg, err_info} | {err_msg, err_info}
      if (!result) {
        console.error(conPrefix + "获取最终报价返回空");
        return;
      }
      let { endPrice, offerRule, err_msg, err_info } = result || {};
      console.warn(conPrefix + "获取最终报价返回", endPrice);
      if (!endPrice) {
        return { offerRule, err_msg, err_info };
      }
      if (TEST_NEW_PLAT_LIST.includes("shangzhan")) {
        endPrice = endPrice - 1;
      }
      let area_id = order.order_detail[0]?.area_id;
      // 先测试单个座位分区报价，多个后面再说
      const res = await this.submitOffer({
        order_sn: order.order_number,
        seat_data: {
          area_id: area_id,
          quoted: endPrice.tofixed()
        },
        bidd_notify: ""
      });
      return { res, offerRule };
    } catch (error) {
      console.error(conPrefix + "单个报价异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "单个报价异常",
        level: "error",
        info: { error }
      });
    }
  }
  // 停止队列运行
  stop() {
    const { conPrefix } = this;
    this.isRunning = false;
    console.warn(conPrefix + "主动停止订单自动报价队列");
  }
  // 获取待报价订单列表
  async getStayOfferList() {
    const { conPrefix } = this;
    try {
      const res = await shangzhanApi.queryStayOfferList({
        page: 1, // 默认1
        limit: 20, // 默认10
        keyword: "",
        citys: ""
      });
      let list = res.data?.list || [];
      // console.log(conPrefix + "获取待报价列表返回", list);
      return list;
    } catch (error) {
      console.error(conPrefix + "获取待报价列表异常", error);
      logUpload(
        {
          plat_name: "shangzhan",
          type: 1
        },
        [
          {
            opera_time: getCurrentFormattedDateTime(),
            des: "获取待报价列表异常",
            level: "error",
            info: {
              error
            }
          }
        ]
      );
      return [];
    }
  }
}

// 报价队列实例
const offerQueue = new OrderAutoOfferQueue();
// 导出队列实例
export default offerQueue;
