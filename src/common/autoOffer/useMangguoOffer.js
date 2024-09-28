import {
  getCinemaFlag, // 获取影院标识
  getCurrentFormattedDateTime, // 格式化当前日期时间
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化errInfo
  getCinemaLoginInfoList
} from "@/utils/utils";
import svApi from "@/api/sv-api"; // 机器api
import mangguoApi from "@/api/mangguo-api"; // 芒果平台api
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
    this.isOfferRunning = false;
    this.conPrefix = "【芒果自动报价】——"; // console打印前缀
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
        item => item.platName === "mangguo"
      );
      const { getInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      await this.fetchOrders(fetchDelay);
    }
  }

  // 处理新订单
  handleNewOrder(item) {
    console.warn(this.conPrefix + "新的待报价订单", item);
    this.handledOrders.set(item.order_number, 1);
    let logList = [
      {
        opera_time: getCurrentFormattedDateTime(),
        des: "芒果新的待报价订单",
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
    this.insertOrderIntoQueue(item);
    if (!this.isOfferRunning) {
      this.startProcessingQueue();
    }
  }

  // 插入队列
  insertOrderIntoQueue(order) {
    // this.queue.push(order);
    // 根据倒计时时间插入订单
    // 如果时间不足配置阈值，即不够进行报价，则不进行插入
    const index = this.queue.findIndex(
      item => order.offer_end_time < item.offer_end_time
    );
    if (index === -1) {
      this.queue.push(order);
    } else {
      this.queue.splice(index, 0, order);
    }
  }

  // 开始队列上传
  async startProcessingQueue() {
    const { conPrefix } = this;
    this.isOfferRunning = true;
    // 处理队列中的订单，直到队列为空或停止
    while (this.queue.length > 0 && this.isRunning) {
      const order = this.queue.shift(); // 取出队列首部订单并从队列里去掉
      if (order) {
        // 处理订单
        const offerResult = await this.orderHandle(order);
        // offerResult：{ res, offerRule } || { offerRule, err_msg, err_info } || undefined
        // 添加订单处理记录
        await this.addOrderHandleRecored(order, offerResult);
        console.warn(
          conPrefix + `单个订单自动报价${offerResult?.res ? "成功" : "失败"}`,
          order
        );
      }
    }
    this.isOfferRunning = false;
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
          id,
          maoyan_price,
          supplier_max_price,
          city_name,
          relation_to_cinema,
          ticket_num,
          cinema_name,
          hall_name,
          film_name,
          film_img,
          show_time,
          is_urgent,
          order_number,
          cinemaid,
          line_name // 品牌名 上影上海、上影二线等
        } = item;
        return {
          plat_name: "mangguo",
          id: id,
          tpp_price: maoyan_price,
          supplier_max_price: supplier_max_price,
          city_name: city_name,
          cinema_addr: relation_to_cinema.cinema_addr,
          ticket_num: ticket_num,
          cinema_name: cinema_name,
          hall_name: hall_name,
          film_name: film_name,
          film_img: film_img,
          show_time: show_time,
          rewards: 0, // 芒果无奖励，只有快捷
          is_urgent: is_urgent, // 1紧急 0非紧急
          cinema_group: line_name,
          cinema_code: cinemaid, // 影院id
          order_number: order_number,
          // 转为截止时间戳，原值： 180 倒计时(单位秒)
          offer_end_time: +new Date() + item.quote_countdown * 1000
        };
      });
      // console.warn(conPrefix + "转换后的订单列表", sfcStayOfferlist);
      sfcStayOfferlist = sfcStayOfferlist
        .filter(item => {
          let appFlag = getCinemaFlag(item);
          // 如果没有对应登录信息先过滤掉
          let appLoginInfo = getCinemaLoginInfoList().find(
            item => item.app_name === appFlag && item.mobile && item.session_id
          );
          if (appLoginInfo) {
            return appFlag;
          }
        })
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
        this.handleNewOrder(item);
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
        plat_name: "mangguo",
        app_name:
          order.app_name || offerResult?.offerRule?.shadowLineName || "",
        order_id: order.id,
        order_number: order.order_number,
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
        processing_time: getCurrentFormattedDateTime(),
        err_msg: offerResult?.err_msg || errInfoObj?.des || "",
        err_info:
          offerResult?.err_info ||
          (errInfoObj?.info ? formatErrInfo(errInfoObj?.info) : ""),
        rewards: order.rewards, // 是否是奖励订单 1是 0否
        rule: tokens.userInfo.rule || 2,
        offer_rule_id: offerResult?.offerRule?.id
      };
      // 上传该订单的运行日志
      logUpload(
        {
          plat_name: "mangguo",
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
  async submitOffer({ order_id, price }) {
    const { conPrefix } = this;
    let params = { order_id, price };
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
      const res = await mangguoApi.submitOffer(params);
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
        plat_name: "mangguo"
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
      const { endPrice, offerRule, err_msg, err_info } = result || {};
      console.warn(conPrefix + "获取最终报价返回", endPrice);
      if (!endPrice) {
        return { offerRule, err_msg, err_info };
      }
      const res = await this.submitOffer({
        order_id: order.id,
        price: endPrice * 100
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
  async getStayOfferList(page, stayList = []) {
    const { conPrefix } = this;
    try {
      const res = await mangguoApi.queryStayOfferList({
        order_type: "1",
        page: page || 1,
        page_size: 100,
        sort_field: "created_at",
        sort_order: "desc"
      });
      let list = res.data.list || [];
      // let count = res.data.count || 1; // 总数
      // stayList = [...stayList, ...list];
      // if (list.length < 20) {
      //   return stayList;
      // } else {
      //   return await this.getStayOfferList(count++, stayList);
      // }
      // console.log(conPrefix + "获取待报价列表返回", list);
      return list;
    } catch (error) {
      console.error(conPrefix + "获取待报价列表异常", error);
      logUpload(
        {
          plat_name: "mangguo",
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
