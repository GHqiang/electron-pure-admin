import {
  getCinemaFlag, // 获取影院标识
  getCurrentTime, // 格式化当前日期时间
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化errInfo
  getCinemaLoginInfoList,
  dynamicPrice,
  subDecimal,
  addDecimal
} from "@/utils/utils";
// 统一日志类
import Logger from "@/common/logger";
import svApi from "@/api/sv-api"; // 机器api
import mahuaApi from "@/api/mahua-api"; // 麻花平台api
import {
  GET_APP_TYPE_LIST,
  GET_APP_INFO,
  MIN_ALLOW_OFFER_SJC,
  NO_FEE_PLAT_LIST
} from "@/common/constant.js";
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
    this.conPrefix = "【麻花自动报价】——"; // console打印前缀
    this.logList = []; // 队列运行日志
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start(is_test) {
    isTestOrder = is_test;
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
        item => item.platName === "mahua"
      );
      const { getInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      await this.fetchOrders(fetchDelay);
    }
  }

  // 处理新订单
  handleNewOrder(item, oldOrder) {
    // 增加报价截止时间判断，小于等于1秒则不处理
    if (
      item.offer_end_time &&
      item.offer_end_time - new Date().getTime() <= MIN_ALLOW_OFFER_SJC
    ) {
      return;
    }
    console.warn(this.conPrefix + "新的待报价订单", item);
    this.handledOrders.set(item.order_number, 1);

    // 如果 handledOrders 的大小超过了100，则移除最早添加的条目
    if (this.handledOrders.size > 100) {
      const firstKey = this.handledOrders.keys().next().value;
      if (firstKey !== undefined) {
        this.handledOrders.delete(firstKey);
      }
    }
    let logList = [
      {
        opera_time: getCurrentTime(),
        des: "麻花新的待报价订单",
        level: "info",
        info: {
          newOrder: item,
          oldOrder
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
    if (!this.isOfferRunning && this.isRunning) {
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
        this.orderHandle(order);
        // offerResult：{ res, offerRule } || { offerRule, err_msg, err_info } || undefined
        // 添加订单处理记录
        // console.warn(
        //   conPrefix + `单个订单自动报价${offerResult?.res ? "成功" : "失败"}`,
        //   order
        // );
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
          salePrice: maoyan_price,
          discountPriceUp: supplier_max_price,
          movieCityName: city_name,
          buyNum: ticket_num,
          movieCinemaName: cinema_name,
          movieHallName: hall_name,
          movieName: film_name,
          movieShowTime: show_time,
          movieCinemaAddress: cinema_addr,
          standardId: cinema_code,
          biddingEndtime: offer_end_time
        } = item;
        return {
          plat_name: "mahua",
          id: id,
          tpp_price: maoyan_price,
          supplier_max_price: supplier_max_price,
          city_name: city_name,
          cinema_addr: cinema_addr,
          ticket_num: ticket_num,
          cinema_name: cinema_name,
          hall_name: hall_name,
          film_name: film_name,
          show_time: show_time,
          rewards: 0, // 麻花无奖励，只有快捷
          is_urgent: 0, // 1紧急 0非紧急
          cinema_group: "",
          cinema_code: cinema_code, // 影院id
          order_number: id,
          // 转为截止时间戳，原值： 180 倒计时(单位秒)
          offer_end_time: +new Date(offer_end_time)
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
          let app_name = getCinemaFlag(item);
          return {
            ...item,
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code
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
        this.handleNewOrder(
          item,
          stayList.find(itemA => itemA.id == item.order_number)
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
      // await mockDelay(delayTime);
      // console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const offerResult = await this.singleOffer({
          order,
          offerList: [] // 动态调价暂时不用先传空
        });
        // { res, offerRule } || { offerRule, err_msg, err_info } || undefined
        await this.addOrderHandleRecored(order, offerResult);
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
        plat_name: "mahua",
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
        rule_status: offerResult?.offerRule?.status,
        offer_end_amount: offerResult?.offerRule?.offer_end_amount,
        member_price: offerResult?.offerRule?.cost_price,
        real_member_price: offerResult?.offerRule?.real_member_price,
        member_discount: offerResult?.offerRule?.member_discount,
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        processing_time: getCurrentTime(),
        err_msg: offerResult?.err_msg || errInfoObj?.des || "",
        err_info:
          offerResult?.err_info ||
          (errInfoObj?.info ? formatErrInfo(errInfoObj?.info) : ""),
        rewards: order.rewards, // 是否是奖励订单 1是 0否
        rule: tokens.userInfo.rule,
        offer_rule_id: offerResult?.offerRule?.id,
        adjust_price: offerResult?.offerRule?.adjustPrice, // 动态调价调整价格
        price_spread: offerResult?.offerRule?.price_spread, // 成本价距离高频中标价的差值
        app_type: order.app_type_code
      };
      // 上传该订单的运行日志
      logUpload(
        {
          plat_name: "mahua",
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

  // 预计利润
  getProfit(offerRule, order) {
    const { cost_price, offer_end_amount } = offerRule;
    const { plat_name, rewards = 0, ticket_num } = order;
    let shouxufei = (offer_end_amount * 100) / 10000;
    if (NO_FEE_PLAT_LIST.includes(plat_name)) {
      shouxufei = 0;
    }
    // 奖励费用
    const rewardPrice =
      rewards > 0 ? (offer_end_amount * 100 * rewards) / 10000 : 0;
    // console.log('offer_end_amount', offer_end_amount, rewardPrice, cost_price, shouxufei)
    return (
      (subDecimal(
        addDecimal(offer_end_amount, rewardPrice),
        addDecimal(cost_price, shouxufei)
      ).toFixed(2) *
        10000 *
        ticket_num) /
      10000
    );
  }
  // 提交报价
  async submitOffer({ order_id, price, offerRule, order }) {
    const { conPrefix } = this;
    let params = {
      putOrderId: order_id,
      biddingPrice: price,
      isDirectGetOrder: 0 // 是否抢单
    };
    let minGrabProfitValue = window.localStorage.getItem("minGrabProfit");
    let expectProfit = this.getProfit(offerRule, order);
    if (minGrabProfitValue && +expectProfit >= +minGrabProfitValue) {
      params.isDirectGetOrder = 1;
    }
    try {
      console.log(conPrefix + "提交报价参数", params);
      if (isTestOrder) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "测试单暂不进行报价",
          level: "info",
          info: { params }
        });
        return;
      }
      const res = await mahuaApi.submitOffer(params);
      console.log(conPrefix + "提交报价返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
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
        opera_time: getCurrentTime(),
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
        plat_name: "mahua"
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
      let { endPrice, offerRule, err_msg, err_info, app_name } = result || {};
      console.warn(conPrefix + "获取最终报价返回", endPrice);
      if (!endPrice) {
        return { offerRule, err_msg, err_info };
      }
      if (app_name === "wanxiangh5") {
        order.app_name = app_name;
      }
      // 动态调价处理
      let logger = new Logger({
        logType: 1
      });
      logger.init(order);
      endPrice = await dynamicPrice({ order, offerRule, logger });
      offerRule.offer_end_amount = endPrice;
      console.warn("动态调价后的最终报价", endPrice, offerRule);
      logger.logUpload();
      const res = await this.submitOffer({
        order_id: order.id,
        price: "" + endPrice,
        offerRule,
        order
      });
      return { res, offerRule };
    } catch (error) {
      console.error(conPrefix + "单个报价异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
      const res = await mahuaApi.queryStayOfferList({
        pageNum: 1,
        pageLimit: 200,
        provName: "",
        cityName: "",
        cinemaName: "",
        movieName: "",
        acceptChangeSeat: "",
        ticketsNum: "",
        minPrice: "",
        maxPrice: "",
        cinemaClassify: [],
        cinemaClassifyOfficial: []
      });
      let list = res.rtnData || [];
      return list;
    } catch (error) {
      console.error(conPrefix + "获取待报价列表异常", error);
      logUpload(
        {
          plat_name: "mahua",
          type: 1
        },
        [
          {
            opera_time: getCurrentTime(),
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
