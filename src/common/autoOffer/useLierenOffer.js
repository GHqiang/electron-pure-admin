import { computed } from "vue";
import {
  getCinemaFlag, // 获取影院标识
  judgeHandle, // 判断是否是新订单
  getCurrentFormattedDateTime, // 格式化当前日期时间
  logUpload, // 日志上传
  mockDelay, // 模拟延时
  getOrginValue, // 获取对象源值
  formatErrInfo // 格式化errInfo
} from "@/utils/utils";

import svApi from "@/api/sv-api"; // 机器api
import lierenApi from "@/api/lieren-api"; // 猎人平台api

// 获取最终报价信息实体类
import getOfferPriceFun from "./commonOfferHandle.js";

// 平台toke列表
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

// 平台自动报价队列规则列表
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatTableDataStore();
const platOfferRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "lieren")
);

// app报价规则列表 使用computed确保items响应式
import { useDataTableStore } from "@/store/offerRule";
const dataTableStore = useDataTableStore();
const appOfferRuleList = computed(() =>
  dataTableStore.items
    .filter(item =>
      item.platOfferList?.length
        ? item.platOfferList.map(item => item.platName).includes("lieren")
        : item.orderForm.split(",").includes("lieren")
    )
    .map(itemA => {
      let offerAmount = itemA.offerAmount || "";
      let addAmount = itemA.addAmount || "";
      return {
        ...itemA,
        offerAmount:
          itemA.offerType === "1"
            ? itemA.platOfferList?.find(item => item.platName === "lieren")
                ?.value || offerAmount
            : itemA.offerType === "3"
              ? offerAmount
              : "",
        addAmount:
          itemA.offerType === "2"
            ? itemA.platOfferList?.find(item => item.platName === "lieren")
                ?.value || addAmount
            : ""
      };
    })
);

// console.log("队列执行规则", getOrginValue(platOfferRuleList.value));
// console.log("自动报价规则", getOrginValue(appOfferRuleList.value));

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动报价队列类
class OrderAutoOfferQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
    this.offerList = []; // 报价记录列表
    this.conPrefix = "【猎人自动报价】——"; // console打印前缀
    this.logList = []; // 队列运行日志
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start(platToken) {
    const { conPrefix } = this;
    if (platToken) {
      tokens.setLierenPlatToken(platToken);
    }
    console.log(conPrefix + "开始执行");
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      // 1、获取当前平台的队列规则状态，如果禁用直接停止
      let platQueueRule = getOrginValue(platOfferRuleList.value).filter(
        item => item.isEnabled
      );
      // console.log(conPrefix + "队列启动的执行规则", platQueueRule);
      if (!platQueueRule?.length) {
        console.error(conPrefix + "队列不存在或未启用，直接停止");
        await this.stop();
        return;
      }
      const { getInterval, handleInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      let processDelay = handleInterval;
      let orders = await this.fetchOrders(fetchDelay);
      logUpload(
        {
          plat_name: "lieren",
          type: 1
        },
        this.logList
      );
      // console.warn(conPrefix + "新的待报价订单列表", orders);
      // 将订单加入队列
      this.enqueue(orders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        const order = this.dequeue(); // 取出队列首部订单并从队列里去掉
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
      let sfcStayOfferlist = stayList
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      // console.warn(
      //   conPrefix + "匹配已上架影院后的的待报价订单",
      //   sfcStayOfferlist
      // );
      if (!sfcStayOfferlist?.length) return [];
      const { handleSuccessOrderList, handleFailOrderList } = this;
      let orderOfferRecord = [
        ...handleSuccessOrderList,
        ...handleFailOrderList
      ];
      let newOrders = sfcStayOfferlist.filter(item => {
        // 过滤出来新订单（未进行过报价的）
        return !orderOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      // console.warn(
      //   conPrefix + "从当前队列报价记录过滤后的的待报价订单",
      //   newOrders
      // );
      if (!newOrders?.length) return [];
      // 如果过滤到这时候还有单子再调接口进行历史报价记录过滤
      const offerList = await this.getOfferList();
      this.offerList = offerList;
      newOrders = newOrders.filter(item =>
        judgeHandle(item, item.appName, offerList)
      );
      // console.warn(
      //   conPrefix + "从服务端历史报价记录过滤后的的待报价订单",
      //   newOrders
      // );
      return newOrders;
    } catch (error) {
      console.error(conPrefix + "获取待报价订单异常", error);
      return [];
    }
  }

  // 将订单添加至队列
  enqueue(orders) {
    const { conPrefix } = this;
    if (orders.length) {
      // console.log(conPrefix + "添加新订单到队列");
      this.queue.push(...orders);
    } else {
      // console.log(conPrefix + "从报价记录过滤后，无新订单添加到队列");
    }
  }

  // 从队列中移除并返回首部订单
  dequeue() {
    return this.queue.shift();
  }

  // 处理订单
  async orderHandle(order, delayTime) {
    const { conPrefix } = this;
    try {
      this.logList = [];
      await mockDelay(delayTime);
      // console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const offerResult = await this.singleOffer({
          order,
          offerList: this.offerList
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
      const log_list = getOrginValue(this.logList);
      let errInfoObj = log_list
        .filter(item => item?.level === "error")
        ?.reverse()?.[0];
      let serOrderInfo = {
        // user_id: order.user_id,
        plat_name: "lieren",
        app_name: order.appName || offerResult?.offerRule?.shadowLineName || "",
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
        member_offer_amount: offerResult?.offerRule?.memberOfferAmount,
        member_price: offerResult?.offerRule?.memberPrice,
        real_member_price: offerResult?.offerRule?.real_member_price,
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        // remark: '',
        processing_time: getCurrentFormattedDateTime(),
        err_msg: offerResult?.err_msg || errInfoObj?.des || "",
        err_info:
          offerResult?.err_info ||
          (errInfoObj?.info ? formatErrInfo(errInfoObj?.info?.error) : ""),
        rewards: order.rewards // 是否是奖励订单 1是 0否
      };
      if (offerResult?.res) {
        this.handleSuccessOrderList.push(order);
      } else {
        // 失败场景添加offer_rule用以排查问题
        serOrderInfo.offer_rule = offerResult?.offerRule
          ? JSON.stringify(getOrginValue(offerResult.offerRule))
          : "";
        this.handleFailOrderList.push(order);
      }
      // 上传该订单的运行日志
      logUpload(
        {
          plat_name: "lieren",
          app_name: serOrderInfo.app_name,
          order_number: serOrderInfo.order_number,
          type: 1
        },
        log_list
      );
      if (isTestOrder) {
        console.warn("数据库存储当前订单报价记录", serOrderInfo);
        return;
      }
      await svApi.addOfferRecord(serOrderInfo);
    } catch (error) {
      console.error(conPrefix + "添加订单处理记录异常", error);
    }
  }

  // 提交报价
  async submitOffer({ id, price }) {
    const { conPrefix } = this;
    try {
      let params = { id, price };
      console.log(conPrefix + "提交报价参数", params);
      if (isTestOrder) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "测试单暂不进行报价",
          level: "error",
          info: { error: { code: 0, msg: "这是个测试" } }
        });
        return;
      }
      const res = await lierenApi.submitOffer(params);
      console.log(conPrefix + "提交报价返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "提交报价异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "提交报价异常",
        level: "error",
        info: { error }
      });
    }
  }

  // 单个报价
  async singleOffer({ order, offerList }) {
    const { conPrefix } = this;
    try {
      let offerExample = getOfferPriceFun({
        appFlag: order.appName,
        platName: "lieren"
      });
      const result = await offerExample.getEndOfferPrice({
        order,
        offerList,
        appOfferRuleList: getOrginValue(appOfferRuleList.value)
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
      const res = await this.submitOffer({ id: order.id, price: endPrice });
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
    this.logList.push({
      opera_time: getCurrentFormattedDateTime(),
      des: "停止订单自动报价队列",
      level: "info"
    });
    logUpload({ plat_name: "lieren", type: 1 }, this.logList);
    // 打印处理结果
    const { handleSuccessOrderList, handleFailOrderList } = this;
    console.warn(
      conPrefix +
        `订单处理记录：成功 ${handleSuccessOrderList.length} 个，失败 ${handleFailOrderList.length} 个`
    );
    console.warn(
      conPrefix + "订单处理记录：成功-",
      handleSuccessOrderList,
      " 失败-",
      handleFailOrderList
    );
  }
  // 获取待报价订单列表
  async getStayOfferList() {
    const { conPrefix } = this;
    try {
      let params = {
        page: 1,
        limit: 100,
        sort: "id",
        desc: "desc",
        type: 0
      };
      // console.log(conPrefix + "获取待报价订单列表参数", params);
      const res = await lierenApi.stayTicketingList(params);
      let mockRes = {
        success: true,
        code: 1,
        message: "成功！",
        total: 1,
        data: [
          {
            id: 6964398,
            tpp_price: "42.00",
            supplier_max_price: 39,
            city_name: "杭州",
            cinema_addr: "临平区南苑街道迎宾路501号余之城生活广场东区6楼",
            ticket_num: 2,
            cinema_name: "SFC上影影城（杭州余之城IMAX店）",
            hall_name: "2号付费按摩椅厅",
            film_name: "死侍与金刚狼",
            film_img:
              "https://gw.alicdn.com/tfscom/i1/O1CN01y7MtHL1LgjLODdiFA_!!6000000001329-0-alipicbeacon.jpg",
            show_time: "2024-08-03 19:35:00",
            section_at: 1722674477,
            seat_flat: 0,
            urgent: 0,
            is_multi: 0,
            seat_type: 0,
            offer: null,
            rewards: 0,
            overdue: 0,
            cinema_group: "上影二线",
            cinema_code: "33018841",
            group_urgent: 0,
            order_number: "2024080316413050736",
            sytime: 1722674522
          }
        ],
        time: 1710125678
      };
      let list;
      if (isTestOrder) {
        list = mockRes?.data || [];
      } else {
        list = res?.data || [];
      }
      console.log(conPrefix + "获取待报价列表返回", list);
      return list;
    } catch (error) {
      console.error(conPrefix + "获取待报价列表异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取待报价列表异常",
        level: "error",
        info: {
          error
        }
      });
      return [];
    }
  }
  // 获取报价记录
  async getOfferList() {
    const { conPrefix } = this;
    try {
      const res = await svApi.queryOfferList({
        user_id: tokens.userInfo.user_id,
        plat_name: "lieren",
        start_time: getCurrentFormattedDateTime(
          +new Date() - 0.5 * 60 * 60 * 1000
        ),
        end_time: getCurrentFormattedDateTime()
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error(conPrefix + "获取历史报价记录异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取历史报价记录异常",
        level: "error",
        info: {
          error
        }
      });
      return Promise.reject("获取历史报价异常");
    }
  }
}

// 报价队列实例
const offerQueue = new OrderAutoOfferQueue();
// 导出队列实例
export default offerQueue;
