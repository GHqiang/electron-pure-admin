import {
  getCinemaFlag, // 获取影院标识
  getCurrentFormattedDateTime, // 格式化当前日期时间
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  formatErrInfo // 格式化errInfo
} from "@/utils/utils";
import svApi from "@/api/sv-api"; // 机器api
import shengApi from "@/api/sheng-api"; // 省平台api
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
    this.conPrefix = "【省自动报价】——"; // console打印前缀
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
        item => item.platName === "sheng"
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
          orderId,
          showPrice,
          grabPrice,
          detail,
          order,
          supplierCode, // 供应商号
          seatInfo, // 座位信息
          orderCode
        } = item;
        // orderId    订单id    integer
        // id         抢单id    integer
        // grabPrice  最高限价  string
        // showPrice  市场价    string
        // grabPrice  最高限价  string
        // orderCode  订单code  string
        const {
          quantity,
          sourceData: {
            show,
            film,
            cinema: { label, cinemaId }
          }
        } = detail;
        // quantity   座位数    integer

        let cinema_group = label[0]?.name || "";
        return {
          plat_name: "sheng",
          id: orderId,
          tpp_price: showPrice,
          supplier_max_price: Number(
            Number(grabPrice) / Number(quantity).toFixed(2)
          ),
          city_name: film.cityName,
          cinema_addr: film.address,
          ticket_num: quantity,
          cinema_name: film.cinemaName,
          hall_name: show.hallName,
          film_name: film.filmName,
          film_img: film.imgUrl,
          show_time: show.startTime,
          rewards: 0, // 省无奖励，只有快捷
          quick: order.quick, // true表示为快捷订单（需12分钟内完成发货），false表示为特惠订单（需45分钟内完成发货）
          // 省暂定和猎人针对sfc影院名字一样
          cinema_group: cinema_group,
          cinema_code: cinemaId, // 影院id
          order_number: orderCode,
          seats: seatInfo // 座位信息
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
            des: "省新的待报价订单",
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
        plat_name: "sheng",
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
          plat_name: "sheng",
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
  async submitOffer({ supplierCode, orderCode, seatInfo }) {
    const { conPrefix } = this;
    let params = {
      supplierCode,
      orderCode,
      seatInfo
    };
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
      const res = await shengApi.submitOffer(params);
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
        plat_name: "sheng"
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
        // supplierCode: "ccf7b11cdc944cf1940a149cff4243f9", // 供应商号-付勋
        // supplierCode: "2820ad3f7b644ad898771deee7c324a1", // 供应商号-兜
        supplierCode: tokens.shengToken,
        orderCode: order.order_number,
        // 暂时先减1测试
        seatInfo: JSON.stringify(
          order.seats.map(item => ({
            seatId: item.seatId,
            supplierPrice: endPrice
          }))
        )
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
      // 获取一次清空一次
      // let list = stayOfferList.slice();
      // stayOfferList = [];

      const res = await shengApi.queryStayOfferList({
        // supplierCode: "ccf7b11cdc944cf1940a149cff4243f9", // 供应商号-付勋
        // supplierCode: "2820ad3f7b644ad898771deee7c324a1", // 供应商号-兜
        supplierCode: tokens.shengToken,
        status: "0", // 0待报价订单，1已报价订单
        page: page || 1 // 1页20条
      });
      let list = res.data.rows || [];
      // let count = res.data.count || 1;
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
          plat_name: "sheng",
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
