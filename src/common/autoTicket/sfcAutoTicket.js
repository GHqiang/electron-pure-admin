import { computed } from "vue";
import {
  getCurrentFormattedDateTime,
  getCurrentTime,
  convertFullwidthToHalfwidth,
  cinemNameSpecial,
  getCinemaLoginInfoList
} from "@/utils/utils";

import lierenApi from "@/api/lieren-api";
import shengApi from "@/api/sheng-api";
import mangguoApi from "@/api/mangguo-api";
import mayiApi from "@/api/mayi-api";
import svApi from "@/api/sv-api";
import { encode } from "@/utils/sfc-member-password";

// 待出票数据
import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
const { deleteOrder } = stayTicketList;

// 影院自动出票规则
import { useAppRuleListStore } from "@/store/appTicketRuleTable";
const appRuleListStore = useAppRuleListStore();
const appTicketRuleList = computed(() => appRuleListStore.items);

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 影院特殊匹配列表及api
import {
  SPECIAL_CINEMA_OBJ,
  TICKET_CONPREFIX_OBJ,
  APP_OPENID_OBJ,
  APP_LIST
} from "@/common/constant";
import { SFC_API_OBJ } from "@/common/index";
const getOrginValue = value => JSON.parse(JSON.stringify(value));
let isTestOrder = false; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
    this.cityList = []; // 城市列表
    this.errMsg = ""; // 单次出票的错误语
    this.errInfo = ""; // 单次出票的错误信息
    this.appFlag = appFlag; // 影线标识
    this.conPrefix = TICKET_CONPREFIX_OBJ[appFlag]; // 打印前缀
    this.sfcApi = SFC_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.logList = []; // 操作运行日志
    this.prevOrderNumber = ""; // 上个订单号
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    const { conPrefix, appFlag } = this;
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    this.prevOrderNumber = "";
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      // 1、获取当前影院的队列规则状态，如果禁用直接停止
      let appQueueRule = getOrginValue(appTicketRuleList.value).filter(
        item => item.isEnabled && item.appName === appFlag
      );
      // console.log(conPrefix + "队列启动的执行规则", appQueueRule);
      if (!appQueueRule?.length) {
        // console.warn(conPrefix + "队列执行规则不存在或者未启用，直接停止");
        await this.stop();
        return;
      }
      // console.log(conPrefix + "队列每次执行时的规则", appQueueRule[0]);
      const { getInterval, handleInterval } = appQueueRule[0];
      let fetchDelay = getInterval;
      let processDelay = handleInterval;
      // console.warn(
      //   conPrefix +
      //     `队列启动, ${fetchDelay} 秒获取一次待报价订单, ${processDelay} 秒处理一次订单}`
      // );
      let orders = await this.fetchOrders(fetchDelay);
      // console.warn(conPrefix + "新的待出票订单列表", orders);
      // 将订单加入队列
      this.enqueue(orders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        // 取出队列首部订单并从队列里去掉
        const order = this.dequeue();
        if (order) {
          if (this.prevOrderNumber === order.order_number) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: `当前订单重复执行,直接执行下个`
            });
            this.logUpload(order);
          } else {
            // 处理订单
            const res = await this.orderHandle(order, processDelay);
            this.prevOrderNumber = order.order_number;
            // res: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
            console.warn(
              conPrefix + `单个订单自动出票${res?.submitRes ? "成功" : "失败"}`,
              order,
              res
            );
            this.logList.push({
              opera_time: getCurrentTime(),
              des: `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}，赋值上个订单号为当前订单号-${this.prevOrderNumber}`,
              info: {
                res
              }
            });
            if (!isTestOrder) {
              // 添加订单处理记录
              await this.addOrderHandleRecored(order, res);
              // 从缓存里面删除记录
              deleteOrder(order.order_number, appFlag);
              this.logList.push({
                opera_time: getCurrentTime(),
                des: `订单出票结束，远端已添加出票记录，本地缓存删除该订单数据`
              });
              this.logUpload(order);
            }
          }
        }
      }
    }
  }

  // 模拟延时
  delay(delayTime) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, delayTime * 1000);
    });
  }

  // 获取订单
  async fetchOrders(fetchDelay) {
    const { conPrefix, appFlag } = this;
    try {
      await this.delay(fetchDelay);
      let sfcStayOfferlist = getOrginValue(stayTicketList.items).filter(
        item => item.appName === appFlag
      );
      if (isTestOrder) {
        sfcStayOfferlist = [
          {
            id: 761,
            platName: "lieren",
            app_name: "sfc",
            ticket_num: 1,
            rewards: "0",
            offer_type: "1",
            order_number: "2024071012402352191",
            // cinema_code: '', // 影院id
            // supplierCode: 'ccf7b11cdc944cf1940a149cff4243f9', // 商户号
            supplier_end_price: 36,
            quan_value: "35",
            order_id: "6418878",
            tpp_price: "44.00",
            city_name: "宁波",
            cinema_addr: "鄞州区中山东路1083号世纪东方广场三楼",
            cinema_name: "SFC上影影城（宁波店）",
            hall_name: "7号厅（3小时停车券21点前扫码）",
            film_name: "云边有个小卖部",
            lockseat: "10排2座",
            show_time: "2024-07-10 14:30:00",
            cinema_group: "上影二线"
          }
        ];
      }
      // console.warn(
      //   conPrefix + "匹配已上架影院后的的待出票订单",
      //   sfcStayOfferlist
      // );
      if (!sfcStayOfferlist?.length) return [];
      const { handleSuccessOrderList, handleFailOrderList } = this;
      const orderOfferRecord = [
        ...handleSuccessOrderList,
        ...handleFailOrderList
      ];
      let newOrders = sfcStayOfferlist.filter(item => {
        // 过滤出来新订单（未进行过出票的）
        return !orderOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      console.warn(
        conPrefix + "从当前队列出票记录过滤后的的待报价订单",
        newOrders
      );
      return newOrders;
    } catch (error) {
      console.error(conPrefix + "获取待出票订单列表异常", error);
      return [];
    }
  }

  // 将订单添加至队列
  enqueue(orders) {
    const { conPrefix } = this;
    if (orders.length) {
      console.log(conPrefix + "添加新订单到队列");
      this.queue.push(...orders);
    } else {
      // console.log(conPrefix + "从出票记录过滤后，无新订单添加到队列");
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
      this.errMsg = "";
      this.errInfo = "";
      this.logList = [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`
      });
      await this.delay(delayTime);
      console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `订单出票${res?.submitRes ? "成功" : "失败"}`,
        //   info: {
        //     res
        //   }
        // });
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, offerRule }
        return res;
      } else {
        console.warn(conPrefix + "订单出票队列已停止");
      }
    } catch (error) {
      console.error(conPrefix + "订单执行出票异常", error);
    }
  }

  // 添加订单处理记录
  async addOrderHandleRecored(order, res) {
    const {
      conPrefix,
      appFlag,
      errMsg,
      errInfo,
      currentParamsList,
      currentParamsInx
    } = this;
    try {
      // res：{ profit, submitRes, qrcode, quan_code, card_id, offerRule }
      const serOrderInfo = {
        plat_name: order.platName,
        app_name: res?.offerRule?.app_name || appFlag,
        order_id: order.id,
        order_number: order.order_number,
        tpp_price: order.tpp_price,
        supplier_end_price: order.supplier_end_price,
        city_name: order.city_name,
        cinema_addr: order.cinema_addr,
        ticket_num: order.ticket_num,
        cinema_name: order.cinema_name,
        hall_name: order.hall_name,
        film_name: order.film_name,
        lockseat: order.lockseat,
        show_time: order.show_time,
        cinema_group: order.cinema_group,
        offer_type: res?.offerRule?.offer_type || "",
        offer_amount: res?.offerRule?.offer_amount || "",
        member_offer_amount: res?.offerRule?.member_offer_amount || "",
        quan_value: res?.offerRule?.quan_value || "",
        order_status: res?.submitRes ? "1" : "2",
        // remark: '',
        processing_time: getCurrentFormattedDateTime(),
        profit: res?.profit || "",
        qrcode: res?.qrcode || "",
        quan_code: res?.quan_code || "",
        card_id: res?.card_id || "",
        err_msg: errMsg || "",
        err_info: errInfo || "",
        rewards: order.rewards, // 是否是奖励订单 1是 0否
        transfer_fee: res?.transferParams?.transfer_fee || "", // 转单手续费
        mobile: currentParamsList[currentParamsInx]?.mobile || "" // 出票手机号
      };
      if (res?.submitRes) {
        this.handleSuccessOrderList.push(order);
      } else {
        this.handleFailOrderList.push(order);
      }
      await svApi.addTicketRecord(serOrderInfo);
      if (serOrderInfo.card_id && serOrderInfo.order_status === "1") {
        svApi.updateDayUsage({
          app_name: serOrderInfo.app_name,
          card_id: serOrderInfo.card_id
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `订单用卡出票成功后更新当天使用量`
        });
        this.logUpload(order);
      }
    } catch (error) {
      console.error(conPrefix + "添加订单处理记录异常", error);
    }
  }

  // 停止队列运行
  stop() {
    const { conPrefix } = this;
    this.isRunning = false;
    // console.warn(conPrefix + "主动停止订单自动出票队列");
    // 打印处理结果
    const { handleSuccessOrderList, handleFailOrderList } = this;
    // console.warn(
    //   conPrefix +
    //     `订单处理记录：成功 ${handleSuccessOrderList.length} 个，失败 ${handleFailOrderList.length} 个`
    // );
    // console.warn(
    //   conPrefix + "订单处理记录：成功-",
    //   handleSuccessOrderList,
    //   " 失败-",
    //   handleFailOrderList
    // );
  }
  // 设置错误信息
  setErrInfo(errMsg, errInfo) {
    try {
      if (errMsg === "") {
        // 清空重置
        this.errMsg = "";
      } else {
        // 如果上个错误信息存在就不允许有新的错误信息
        this.errMsg = this.errMsg || errMsg;
      }
      if (errInfo === "") {
        // 清空重置
        this.errInfo = "";
      } else {
        // 如果上个错误信息存在就不允许有新的错误信息
        if (this.errInfo) return;
        if (errInfo) {
          if (errInfo instanceof Error) {
            const cleanedError = {
              message: errInfo.message,
              stack: errInfo.stack,
              name: errInfo.name
            };
            this.errInfo = JSON.stringify(
              cleanedError,
              (key, value) =>
                typeof value === "function" || value instanceof Error
                  ? undefined
                  : value,
              2
            );
          } else {
            try {
              this.errInfo = JSON.stringify(errInfo);
            } catch (error) {
              console.warn("错误信息转换异常", error);
              this.errInfo = errInfo.toString();
            }
          }
        }
      }
    } catch (error) {
      console.warn("错误信息转换异常1", error);
    }
  }

  // 释放座位 flag: 1-转单，2换号
  async releaseSeat(unlockSeatInfo, flag) {
    const { conPrefix } = this;
    const { city_id, cinema_id, show_id, start_day, start_time, session_id } =
      unlockSeatInfo;
    try {
      const seatList = await this.getSeatLayout(
        {
          city_id,
          cinema_id,
          show_id,
          session_id
        },
        flag
      );
      let errFlag = ["正常出票", "转单", "换号出票"][flag];
      if (!seatList?.length) {
        this.setErrInfo(`${errFlag}-获取座位布局为空`);
        return false;
      }
      let availableSeatList = seatList.filter(item => item[2] === "0"); // 1表示已售
      let seat_ids = availableSeatList.map(item => item[0])?.[0]; // 第0个代表座位id
      if (!seat_ids) {
        this.setErrInfo(`${errFlag}-获取未售座位为空`);
        return false;
      }
      // // 4、锁定座位
      let lockParams = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id
      };
      console.warn(conPrefix + "转单时释放座位传参", lockParams);
      await this.lockSeat(lockParams); // 锁定座位
      // this.currentParamsList[this.currentParamsInx].releaseStatus = 1;
      return true;
    } catch (error) {
      console.warn("释放座位失败", error);
      if (error?.msg === "登录失效") {
        let inx = this.currentParamsList.findIndex(
          item => item.session_id === session_id
        );
        this.currentParamsList[inx].errMsg = "登录失效";
      }
      let errFlag = ["正常出票", "转单", "换号出票"][flag];
      this.setErrInfo(`${errFlag}-释放座位异常`, error);
      return false;
    }
  }

  // 转单
  async transferOrder(order, unlockSeatInfo) {
    const { conPrefix, errMsg } = this;
    const { platName } = order;
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");
    // 关闭自动转单只针对座位异常生效
    if (isTestOrder || (isAutoTransfer == "0" && errMsg === "锁定座位异常")) {
      console.warn("锁定座位异常关闭自动转单");
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `自动转单处于关闭状态`
      });
      // this.logUpload(order);
      return;
    }
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      let session_id = this.currentParamsList[this.currentParamsInx].session_id;
      // 3、获取座位布局
      if (unlockSeatInfo) {
        const isPass = await this.releaseSeat(
          { ...unlockSeatInfo, session_id },
          1
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `转单前释放座位${isPass ? "成功" : "失败"}`
        });
      }
      let params;
      if (platName === "lieren") {
        params = {
          id: order.id,
          confirm: 1
        };
      } else if (platName === "sheng") {
        params = {
          orderCode: order.order_number,
          supplierCode: order.supplierCode
          // reason: ""
        };
      } else if (platName === "mangguo") {
        params = {
          order_id: order.id,
          remark: "渠道无法出票"
        };
      } else if (platName === "mayi") {
        params = {
          tradeno: order.id,
          certificateImgUrl: "",
          reason: "",
          type: "bj_error"
        };
      }
      console.log(conPrefix + "转单参数", params);
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi
      };
      console.warn(conPrefix + "【转单】参数", params);
      const res = await requestApi[platName].transferOrder(params);
      console.warn(conPrefix + "【转单】结果", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `转单成功`
      });
      const { supplier_end_price, ticket_num } = order;
      let transfer_fee = (
        (Number(ticket_num) * Number(supplier_end_price) * 100 * 3) /
        10000
      ).toFixed(2);
      let transferParams = {
        transfer_fee // 转单手续费
      };
      console.warn(conPrefix + "【转单】手续费", transfer_fee);
      return transferParams;
    } catch (error) {
      console.error(conPrefix + "【转单】异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `转单原因-${this.errMsg}——${this.errInfo}`
      });
      this.setErrInfo("订单转单异常", error);
    }
  }

  // 日志上传
  async logUpload(order) {
    try {
      let log_list = this.logList.slice();
      this.logList = [];
      const { platName, order_number } = order;
      const { appFlag } = this;
      await svApi.addTicketOperaLog({
        plat_name: platName,
        app_name: appFlag,
        order_number,
        log_list
      });
    } catch (error) {
      console.error("日志上送异常", error);
    }
  }

  // 单个订单出票
  async singleTicket(item) {
    // 放到这里即使修改token也不用重启队列了
    const { conPrefix, appFlag } = this;
    const { id, platName, supplierCode, order_number } = item;
    this.currentParamsList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );
    try {
      console.warn(conPrefix + "单个待出票订单信息", item);
      // 1、解锁座位
      if (!isTestOrder) {
        if (platName === "lieren") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        } else if (platName === "sheng") {
          await this.startDeliver({ order_number, supplierCode });
          this.delay(2);
          await this.unlockSeat({
            platName,
            order_number,
            supplierCode,
            inx: 1
          });
        } else if (platName === "mangguo") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `订单首次解锁座位完成`
        });
      }
    } catch (error) {
      console.error(conPrefix + "解锁座位失败准备试错3次，间隔3秒", error);
      // 试错3次，间隔3秒
      let params = {
        order_id: id,
        order_number,
        supplierCode
      };
      const res = await this.trial(
        inx => this.unlockSeat({ ...params, inx }),
        3,
        3
      );
      if (!res) {
        console.error(conPrefix + "单个订单试错后仍解锁失败", "需要走转单逻辑");
        // 转单逻辑待补充
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `订单首次解锁失败试错后解锁成功`
      });
    }
    this.logUpload(item);
    try {
      // 解锁成功后延迟6秒再执行
      await this.delay(6);
      // 2、一键买票
      this.currentParamsInx = 0;
      const result = await this.oneClickBuyTicket(item);
      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
      if (result) {
        console.warn(conPrefix + "单个订单出票完成");
        return result;
      } else {
        console.warn(conPrefix + "单个订单出票失败");
      }
    } catch (error) {
      console.error(conPrefix + "单个订单出票异常", error);
      this.setErrInfo("单个订单出票异常", error);
    }
  }
  // 确认接单
  async startDeliver({ order_number, supplierCode }) {
    const { conPrefix } = this;
    try {
      let params = {
        orderCode: order_number,
        supplierCode
      };
      console.log(conPrefix + "确认接单参数", params);
      const res = await shengApi.confirmOrder(params);
      console.log(conPrefix + "确认接单返回", res);
      return res;
    } catch (error) {
      console.warn("确认接单异常", error);
    }
  }

  // 解锁座位
  async unlockSeat({
    platName,
    order_id,
    inx = 0,
    order_number: orderCode,
    supplierCode
  }) {
    const { conPrefix } = this;
    try {
      let params;
      if (platName === "lieren") {
        params = {
          order_id
        };
      } else if (platName === "sheng") {
        params = {
          orderCode,
          supplierCode
        };
      } else if (platName === "mangguo") {
        params = {
          order_id
        };
      } else if (platName === "mayi") {
        params = {
          tradeno: order_id
        };
      }
      console.log(conPrefix + "解锁参数", params);
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi
      };
      const res = await requestApi[platName].unlockSeat(params);
      console.log(conPrefix + "解锁返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "解锁异常", error);
      this.setErrInfo(`订单第${inx}次解锁失败`, error);
      return Promise.reject(error);
    }
  }

  // 一键买票逻辑
  async oneClickBuyTicket(item) {
    const { conPrefix, appFlag } = this;
    try {
      console.log(conPrefix + "一键买票待下单信息", item);
      let {
        id: order_id,
        order_number,
        city_name,
        cinema_name,
        hall_name,
        film_name,
        show_time,
        lockseat,
        ticket_num,
        supplier_end_price,
        rewards,
        supplierCode,
        platName,
        otherParams
      } = item;
      // otherParams主要是为了换号出票时不用再走之前流程
      let {
        offerRule,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time
      } = otherParams || {};
      console.log("this.currentParamsInx开始", this.currentParamsInx);
      if (this.currentParamsInx === 0) {
        const phone = this.currentParamsList[0].mobile;
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `首次出票手机号-${phone}`,
          info: {
            currentParamsList: this.currentParamsList
          }
        });
        // 获取该订单的报价记录，按对应报价规则出票
        const offerRes = await svApi.queryOfferList({
          user_id: tokens.userInfo.user_id,
          order_status: "1",
          app_name: appFlag,
          order_number
        });
        let offerRecord = offerRes?.data?.offerList || [];
        offerRule = offerRecord?.[0];
        // 测试专用
        if (isTestOrder) {
          offerRule = { offer_type: "1", quan_value: "35" };
          // offerRule = { offer_type: "2", member_price: "29.9" };
        }
        console.warn(
          conPrefix + "从该订单的报价记录获取到的报价规则",
          offerRule
        );
        if (!offerRule) {
          console.error(
            conPrefix +
              "获取该订单的报价记录失败，不进行出票，此处不转单，直接跳过",
            offerRecord
          );
          this.setErrInfo("获取该订单报价记录失败，不转单跳过");
          return;
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `获取该订单报价记录成功`
        });
        // 从报价记录里取出会员价赋值到订单里方便后面计算利润
        // item.member_price = offerRule.member_price;
        await this.getCityList();
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `获取城市列表成功`
        // });
        city_id = this.cityList.find(
          item => item.name.indexOf(city_name) !== -1
        )?.id;
        // 1、获取城市影城列表
        const cinemaList = await this.getCityCinemaList(city_id);
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `获取影院列表成功`
        // });
        cinema_id = this.getCinemaId(cinema_name, cinemaList);
        if (!cinema_id) {
          console.error(conPrefix + "根据订单中的影院名称获取影院id失败");
          this.setErrInfo("根据订单中的影院名称获取影院id失败");
          // this.logList.push({
          //   opera_time: getCurrentTime(),
          //   des: `根据订单中的影院名称获取影院id失败`,
          //   info: {
          //     cinemaList,
          //     cinema_name
          //   }
          // });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 2、获取影院放映信息
        const moviePlayInfo = await this.getMoviePlayInfo({
          city_id,
          cinema_id
        });
        let movie_data = moviePlayInfo?.movie_data || [];
        if (!movie_data?.length) {
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `获取影院放映信息成功`
        // });
        let movieObj = movie_data.find(item => item.movie_name === film_name);
        if (!movieObj) {
          console.warn(
            "影院放映信息匹配订单影片名称失败",
            movie_data,
            film_name
          );
          movieObj = movie_data.find(
            item =>
              convertFullwidthToHalfwidth(item.movie_name) ===
              convertFullwidthToHalfwidth(film_name)
          );
          if (!movieObj) {
            this.setErrInfo(
              "影院放映信息匹配订单影片名称失败-全角字符转换成半角后"
            );
            // this.logList.push({
            //   opera_time: getCurrentTime(),
            //   des: `影院放映信息匹配订单影片名称失败`,
            //   info: {
            //     movie_data,
            //     film_name
            //   }
            // });
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
        }
        // let movie_id = movieObj?.movie_id || ''
        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1].slice(0, 5);
        console.log(
          conPrefix + "movieObj===>",
          movieObj,
          start_day,
          start_time
        );
        let showList = movieObj?.shows[start_day] || [];
        console.log(conPrefix + "showList===>", showList);
        show_id =
          showList.find(item => item.start_time === start_time)?.show_id || "";
        if (!show_id) {
          this.setErrInfo("影院放映信息匹配订单放映时间失败");
          // this.logList.push({
          //   opera_time: getCurrentTime(),
          //   des: `影院放映信息匹配订单放映时间失败`,
          //   info: {
          //     showList,
          //     start_time
          //   }
          // });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 3、获取座位布局
        const seatList = await this.getSeatLayout({
          city_id,
          cinema_id,
          show_id
        });
        if (!seatList?.length) {
          console.error(conPrefix + "获取座位布局不存在");
          this.setErrInfo("获取座位布局不存在");
          // this.logList.push({
          //   opera_time: getCurrentTime(),
          //   des: `获取座位布局不存在`
          // });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `获取座位布局成功`
        // });
        let seatName = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
        console.log(conPrefix + "seatName", seatName);
        let selectSeatList = seatName.split(",");
        console.log(conPrefix + "selectSeatList", selectSeatList);
        let targetList = seatList.filter(item =>
          selectSeatList.includes(item[5])
        );
        console.log(conPrefix + "targetList", targetList);
        seat_ids = targetList.map(item => item[0]).join();
      } else {
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          info: {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        });
        // 清空上个号的出票失败信息
        this.errMsg = "";
        this.errInfo = "";
        // 如果上个号释放座位token失效了就直接锁定token
        if (
          this.currentParamsList[this.currentParamsInx - 1].errMsg !==
          "登录失效"
        ) {
          // 拿上一个号的session去释放座位
          let currentParams = this.currentParamsList[this.currentParamsInx - 1];
          // 先释放座位
          const unlockSeatInfo = {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time,
            session_id: currentParams.session_id
          };
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `上个号准备释放座位token-${currentParams.session_id}`
          });
          const isPass = await this.releaseSeat(unlockSeatInfo, 2);
          if (!isPass) {
            if (this.currentParamsInx === this.currentParamsList.length - 1) {
              console.error(conPrefix + "换号结束还是失败", "走转单逻辑");
              this.logList.push({
                opera_time: getCurrentTime(),
                des: `换号结束还是失败，走转单`
              });
              const transferParams = await this.transferOrder(item, {
                city_id,
                cinema_id,
                show_id,
                start_day,
                start_time
              });
              return { offerRule, transferParams };
            } else {
              this.currentParamsInx++;
              return await this.oneClickBuyTicket({
                ...item,
                otherParams: {
                  offerRule,
                  city_id,
                  cinema_id,
                  show_id,
                  seat_ids,
                  start_day,
                  start_time
                }
              });
            }
          }
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `上个号释放座位成功`
          });
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `上个号释放座位时token失效`
          });
        }
      }
      // 4、锁定座位
      let params = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      };
      try {
        await this.lockSeat(params); // 锁定座位
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `首次锁定座位成功`
        });
      } catch (error) {
        console.error(conPrefix + "锁定座位失败准备试错2次，间隔5秒", error);
        // 试错3次，间隔5秒
        const res = await this.trial(inx => this.lockSeat(params, inx), 2, 5);
        if (!res) {
          console.error(
            conPrefix + "单个订单试错后仍锁定座位失败",
            "需要走转单逻辑"
          );
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `首次锁定座位失败试错后锁定成功`
        });
      }
      // 5、使用优惠券或者会员卡
      const { card_id, quan_code, profit } = await this.useQuanOrCard({
        order_number,
        city_name,
        cinema_name,
        hall_name,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        rewards,
        offerRule
      });
      if (!card_id && !quan_code) {
        console.log("this.currentParamsInx", this.currentParamsInx);
        console.log("this.currentParamsList", this.currentParamsList);
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix + "优惠券和会员卡都无法使用，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.setErrInfo("优惠券和会员卡都无法使用，单个订单直接出票结束");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `优惠券和会员卡都无法使用，准备转单`
          });
          const transferParams = await this.transferOrder(item, {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `非最后一次用卡用券失败，走换号`
          });
          // this.logUpload(item);
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              start_day,
              start_time
            }
          });
        }
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `使用优惠券或者会员卡成功`
      });
      // 6计算订单价格
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { session_id } = currentParams;
      const priceInfo = await this.priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id,
        quan_code,
        session_id
      });
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix +
              "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.setErrInfo("使用优惠券或会员卡后计算订单价格失败");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `使用优惠券或会员卡后计算订单价格失败，准备转单`
          });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `非最后一次创建订单前计算价格失败，走换号`
          });
          // this.logUpload(item);
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              start_day,
              start_time
            }
          });
        }
      }
      let pay_money = Number(priceInfo.total_price); // 此处是为了将订单价格30.00转为30，将0.00转为0
      console.log(conPrefix + "订单最后价格", pay_money, priceInfo);
      if (offerRule.offer_type === "1" && pay_money !== 0) {
        this.setErrInfo("用券计算订单价格后价格不为0，走转单");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `用券计算订单价格后价格不为0，准备转单`
        });
        const transferParams = await this.transferOrder(item, {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time
        });
        return { offerRule, transferParams };
      }
      // else if (offerRule.offer_type !== "1") {
      //   let real_member_price = offerRule.real_member_price;
      //   if (pay_money > Number(real_member_price) * Number(ticket_num)) {
      //     this.setErrInfo("用卡计算订单价格后价格大于真实会员价*票数，走转单", {
      //       pay_money,
      //       real_member_price,
      //       ticket_num
      //     });
      //     const transferParams = await this.transferOrder(item, {
      //       city_id,
      //       cinema_id,
      //       show_id,
      //       start_day,
      //       start_time
      //     });
      //     return { offerRule, transferParams };
      //   }
      // }
      if (isTestOrder) {
        return { offerRule };
      }
      // 订单价格计算成功清除原先关于订单价格异常的错误信息
      if (this.errMsg.includes("计算订单价格异常")) {
        this.errMsg = "";
        this.errInfo = "";
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `创建订单前计算订单价格成功`
      });
      // 7、创建订单
      const order_num = await this.createOrder({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id,
        coupon: quan_code,
        seat_info: lockseat.replaceAll(" ", ",").replaceAll("座", "号"),
        pay_money
      });
      if (!order_num) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix + "创建订单失败，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.setErrInfo("创建订单失败，单个订单直接出票结束");
          // this.logList.push({
          //   opera_time: getCurrentTime(),
          //   des: `创建订单失败，单个订单直接出票结束`
          // });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `非最后一次创建订单失败，走换号`
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              start_day,
              start_time
            }
          });
        }
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `创建订单成功`
      });
      // 8、购买电影票
      const buyRes = await this.buyTicket({
        city_id,
        cinema_id,
        order_num,
        pay_money
      });
      if (!buyRes) {
        console.error(
          conPrefix + "订单购买失败，单个订单直接出票结束",
          "走转单逻辑"
        );
        this.setErrInfo("订单购买失败，单个订单直接出票结束");
        // this.logList.push({
        //   opera_time: getCurrentTime(),
        //   des: `订单购买失败，单个订单直接出票结束`
        // });
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        const transferParams = await this.transferOrder(item, {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time
        });
        return { offerRule, transferParams };
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `订单购买成功`
      });
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.lastHandle({
        city_id,
        cinema_id,
        order_num,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        platName,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `订单最后处理成功:获取取票码并上传`
        });
      }
      console.log(conPrefix + "一键买票完成");
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code,
        card_id,
        offerRule
      };
    } catch (error) {
      console.error(conPrefix + "一键买票异常", error);
      this.setErrInfo("一键买票异常", error);
      return { offerRule };
    }
  }

  // 获取城市影院列表
  async getCityCinemaList(city_id) {
    const { conPrefix } = this;
    try {
      let params = {
        city_id
      };
      console.log(conPrefix + "获取城市影院参数", params);
      const res = await this.sfcApi.getCinemaList(params);
      console.log(conPrefix + "获取城市影院返回", res);
      let list = res.data.cinema_data || [];
      return list;
    } catch (error) {
      console.error(conPrefix + "获取城市影院异常", error);
      this.setErrInfo("获取城市影院异常", error);
    }
  }

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        width: "500"
      };
      console.log(conPrefix + "获取电影放映信息参数", params);
      const res = await this.sfcApi.getMoviePlayInfo(params);
      console.log(conPrefix + "获取电影放映信息返回", res);
      return res.data;
    } catch (error) {
      console.error(conPrefix + "获取电影放映信息异常", error);
      this.setErrInfo("获取电影放映信息异常", error);
    }
  }

  // 获取座位布局 flag:1-转单 2-换号
  async getSeatLayout(data, flag = 0) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, show_id, session_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        width: "240"
      };
      if (session_id) {
        params.session_id = session_id;
      } else {
        params.session_id =
          this.currentParamsList[this.currentParamsInx].session_id;
      }
      console.log(conPrefix + "获取座位布局参数", params);
      const res = await this.sfcApi.getMoviePlaySeat(params);
      console.log(conPrefix + "获取座位布局返回", res);
      return res.data?.play_data?.seat_data || [];
    } catch (error) {
      let errFlag = ["正常出票", "转单", "换号出票"][flag];
      console.error(conPrefix + "获取座位布局异常", error);
      this.setErrInfo(`${errFlag}获取座位布局异常`, error);
    }
  }

  // 锁定座位
  async lockSeat(data, inx = 0) {
    const { conPrefix } = this;
    try {
      let {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id
      } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        force_lock: "-1",
        seat_ids: seat_ids,
        start_day: start_day,
        start_time: start_time,
        session_id
      };
      console.log(conPrefix + "锁定座位参数", params);
      const res = await this.sfcApi.lockSeat(params);
      console.log(conPrefix + "锁定座位返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "锁定座位异常", error);
      this.setErrInfo(`第${inx}次锁定座位异常`, error);
      return Promise.reject(error);
    }
  }

  // 使用优惠券或者会员卡
  async useQuanOrCard(params) {
    const { conPrefix } = this;
    let {
      city_name,
      cinema_name,
      hall_name,
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      ticket_num,
      supplier_end_price,
      offerRule,
      rewards
    } = params;
    try {
      console.log(
        conPrefix +
          `待出票订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
      );
      const {
        offer_type: offerType,
        quan_value: quanValue,
        member_price,
        real_member_price
      } = offerRule;
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { session_id, mobile } = currentParams;
      // 拿订单号去匹配报价记录
      if (offerType !== "1") {
        console.log(conPrefix + "使用会员卡出票");
        console.log(conPrefix + "报价记录里的会员价", member_price);
        if (!member_price) {
          console.warn(
            conPrefix + "使用优惠券或者会员卡前获取会员价异常",
            member_price
          );
          this.setErrInfo("使用优惠券或者会员卡前获取会员价异常");
          return {
            card_id: "",
            profit: 0 // 利润
          };
        }
        // 1、获取会员卡列表
        const cardList = await this.getCardList({
          city_id,
          cinema_id,
          session_id
        });
        // 2、使用会员卡
        let member_total_price = (member_price * 100 * ticket_num) / 100;
        const { card_id, profit } = await this.useCard({
          member_total_price,
          cardList,
          supplier_end_price,
          ticket_num,
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          member_price,
          real_member_price,
          rewards,
          session_id,
          mobile
        });
        return {
          card_id,
          profit // 利润
        };
      } else {
        console.log(conPrefix + "使用优惠券出票");
        // 1、获取优惠券列表
        const quanList = await this.getQuanList({
          city_id,
          cinema_id,
          session_id
        });
        // 2、使用优惠券
        const { useQuans, profit } = await this.useQuan({
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          ticket_num,
          supplier_end_price,
          quanList,
          quanValue,
          rewards,
          session_id
        });
        return {
          quan_code: useQuans.join(),
          profit: profit // 利润
        };
      }
    } catch (error) {
      console.error(conPrefix + "使用优惠券或者会员卡异常", error);
      this.setErrInfo("使用优惠券或者会员卡异常", error);
      return {
        card_id: "",
        quan_code: "",
        profit: 0 // 利润
      };
    }
  }

  // 计算订单价格
  async priceCalculation(data) {
    const { conPrefix } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      card_id,
      quan_code,
      session_id
    } = data || {};
    try {
      // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
      await this.delay(1);
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        seat_ids: seat_ids,
        quan_code: "",
        card_id: "",
        additional_goods_info: "", // 附加商品信息
        goods_info: "", // 商品信息
        is_first: "0", // 是否是首次购买 0-不是 1-是
        option_goods_info: "", // 可选的额外商品信息
        update_time: getCurrentFormattedDateTime(),
        session_id
      };
      if (quan_code) {
        params.quan_code = quan_code; // 优惠券编码
      } else if (card_id) {
        params.card_id = card_id; // 会员卡id
      }
      console.log(conPrefix + "计算订单价格参数", params);
      const res = await this.sfcApi.priceCalculation(params);
      console.log(conPrefix + "计算订单价格返回", res);
      return res.data?.price;
    } catch (error) {
      console.error(conPrefix + "计算订单价格异常", error);
      this.setErrInfo(
        "计算订单价格异常:" + JSON.stringify({ card_id, quan_code }),
        error
      );
    }
  }

  // 创建订单
  async createOrder(data) {
    const { conPrefix } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      seat_info,
      pay_money,
      card_id,
      coupon
    } = data || {};
    try {
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { mobile, member_pwd, session_id } = currentParams;
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
        promo_id: "0", // 促销活动ID，这里为0，表示没有参与特定的促销活动
        update_time: getCurrentFormattedDateTime(),
        session_id
      };
      let order_num;
      if (card_id) {
        params.card_id = card_id; // 会员卡id
        params.card_password = encode(""); // 会员卡密码
        try {
          console.log(conPrefix + "创建订单参数", params);
          const res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          order_num = res.data?.order_num || "";
        } catch (error) {
          console.warn(conPrefix + "会员卡第一次创建订单失败", error);
          console.warn(
            conPrefix + "调整会员卡密码参数再次发起创建订单请求",
            params
          );
          params.card_password = encode(member_pwd); // 会员卡密码
          const res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          order_num = res.data?.order_num || "";
        }
      } else if (coupon) {
        params.coupon = coupon; // 优惠券券码
        console.log(conPrefix + "创建订单参数", params);
        const res = await this.sfcApi.createOrder(params);
        console.log(conPrefix + "创建订单返回", res);
        order_num = res.data?.order_num || "";
      }
      return order_num;
    } catch (error) {
      console.error(conPrefix + "创建订单异常", error);
      this.setErrInfo("创建订单异常", error);
    }
  }

  // 订单购买
  async buyTicket(data) {
    const { conPrefix, appFlag } = this;
    try {
      let { city_id, cinema_id, order_num, pay_money } = data || {};
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { session_id } = currentParams;
      let params = {
        city_id,
        cinema_id,
        open_id: APP_OPENID_OBJ[appFlag], // 微信openId
        order_num, // 订单号
        pay_money, // 支付金额
        pay_type: "", // 购买方式 传空意味着用优惠券或者会员卡
        session_id
      };
      console.log(conPrefix + "订单购买参数", params);
      const res = await this.sfcApi.buyTicket(params);
      console.log(conPrefix + "订单购买返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "订单购买异常", error);
      this.setErrInfo("订单购买异常", error);
    }
  }

  // 获取购票信息
  async payOrder(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, order_num, session_id, inx } = data || {};
      let params = {
        city_id,
        cinema_id,
        order_num, // 订单号
        order_type: "ticket", // 订单类型
        order_type_num: 1, // 订单子类型数量，可能是指购买的该类型票的数量
        session_id
      };
      console.log(conPrefix + "支付订单参数", params);
      const res = await this.sfcApi.payOrder(params);
      console.log(conPrefix + "支付订单返回", res);
      let qrcode = res.data.qrcode || "";
      if (qrcode) {
        if (inx) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `第${inx}次异步轮询获取支付结果成功`
          });
        }
        return qrcode;
      }
      if (inx) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次异步轮询获取支付结果失败`
        });
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      console.error(conPrefix + "支付订单异常", error);
      this.setErrInfo("获取订单支付结果异常", error);
      return Promise.reject(error);
    }
  }

  // 提交出票码
  async submitTicketCode({
    platName,
    order_id,
    qrcode,
    order_number,
    supplierCode,
    lockseat,
    flag
  }) {
    const { conPrefix } = this;
    try {
      let params;
      if (platName === "lieren") {
        params = {
          // order_id: id || 5548629,
          // qupiao2: "[{\"result\":\"2024031154980669\",\"yzm\":\"\"}]"
          order_id,
          qupiao2: JSON.stringify([
            {
              result: qrcode.split("|")[0],
              yzm: qrcode.split("|")?.[1] || ""
            }
          ])
        };
      } else if (platName === "sheng") {
        params = {
          orderCode: order_number, // 省APP的订单编号
          supplierCode: supplierCode,
          deliverInfos: JSON.stringify([{ code: qrcode }]), // 提交的时候转成文本，格式是JSON数组，可以多个取票码
          success: true // 是否成功 ，true，false需小写
          // message: "", // 出票失败原因，不能发货才有（失败的情况下一定要传）
          // desc: "" // 描述，允许空，换座信息也填在这里，如更换1排4座，1排5座
        };
      } else if (platName === "mangguo") {
        params = {
          order_id, // 省APP的订单编号
          tickets: JSON.stringify([
            {
              num: lockseat.split(" ").length,
              old_imgs: "",
              old_text_ycode: qrcode.split("|")?.[1] || "",
              text_info: qrcode.split("|")[0]
            }
          ]),
          seats: JSON.stringify(lockseat.split(" "))
        };
      } else if (platName === "mayi") {
        params = {
          tradeno: order_id, // 蚂蚁APP的订单编号
          ticketCodeList: JSON.stringify([
            {
              picUrl: "",
              ticketCode: qrcode,
              verifyCinemaName: true,
              verifyMovieName: true,
              verifyPlaytime: true
            }
          ])
        };
      }
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi
      };
      console.log(conPrefix + "提交出票码参数", params);
      const res = await requestApi[platName].submitTicketCode(params);
      console.log(conPrefix + "提交出票码返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "提交出票码异常", error);
      if (flag !== 2) {
        this.setErrInfo("提交出票码异常", error);
      } else {
        let err_info;
        if (error instanceof Error) {
          const cleanedError = {
            message: error.message,
            stack: error.stack,
            name: error.name
          };
          err_info = JSON.stringify(
            cleanedError,
            (key, value) =>
              typeof value === "function" || value instanceof Error
                ? undefined
                : value,
            2
          );
        } else {
          try {
            err_info = JSON.stringify(errInfo);
          } catch (error) {
            console.warn("错误信息转换异常", error);
            err_info = errInfo.toString();
          }
        }
        svApi.updateTicketRecord({
          order_number,
          err_msg: "系统延迟后提交出票码异常",
          err_info
        });
      }
    }
  }

  /**
   * 试错方法
   * @param { Function } 	callback	要试错的方法，携带参数的话可以在传参时嵌套一层
   * @param { Number } 	number	    试错次数
   * @param { Number } 	delayTime	试错间隔时间
   */
  trial(callback, number = 1, delayTime = 0) {
    const { conPrefix } = this;
    let inx = 0,
      trialTimer = null;
    return new Promise(resolve => {
      trialTimer = setInterval(async () => {
        console.log("inx", inx, "number", number, "trialTimer", trialTimer);
        if (inx < number && trialTimer) {
          ++inx;
          console.log(conPrefix + `第${inx}次试错开始`);
          try {
            const result = await callback(inx);
            console.log(conPrefix + `第${inx}次试错成功`, result);
            clearInterval(trialTimer);
            resolve(result);
          } catch (error) {
            console.error(conPrefix + `第${inx}次试错失败`, error);
          }
        } else {
          console.log(conPrefix + `第${inx}次试错结束`);
          clearInterval(trialTimer);
          resolve();
        }
      }, delayTime * 1000);
    });
  }

  async lastHandle({
    city_id,
    cinema_id,
    order_num,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    platName,
    session_id,
    lockseat
  }) {
    const { conPrefix } = this;
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.payOrder({
          city_id,
          cinema_id,
          order_num,
          session_id
        });
      } catch (error) {}
      if (!qrcode) {
        console.error(conPrefix + "获取订单结果失败，单个订单直接出票结束");
        this.setErrInfo(
          "获取订单支付结果，取票码不存在，暂时返回异步获取",
          qrcode
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `获取订单支付结果，取票码不存在，暂时返回异步获取`
        });
        this.logUpload({ platName, order_number });
        this.asyncFetchQrcodeSubmit({
          city_id,
          cinema_id,
          order_num,
          session_id,
          order_id,
          app_name,
          card_id,
          platName,
          order_number,
          supplierCode,
          lockseat
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `非异步获取订单支付结果成功`
      });
      const submitRes = await this.submitQrcode({
        order_id,
        qrcode,
        app_name,
        card_id,
        order_number,
        supplierCode,
        platName,
        lockseat,
        flag: 1
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `非异步提交取票码成功`
      });
      return { submitRes, qrcode };
    } catch (error) {
      console.warn("出票最后处理异常", error);
      this.setErrInfo("", "");
      this.setErrInfo("出票最后处理异常", error);
    }
  }

  async asyncFetchQrcodeSubmit({
    city_id,
    cinema_id,
    order_num,
    session_id,
    order_id,
    app_name,
    card_id,
    platName,
    order_number,
    supplierCode,
    lockseat
  }) {
    try {
      // 没搁30秒查一次，查20次，10分钟
      const qrcode = await this.trial(
        inx =>
          this.payOrder({
            city_id,
            cinema_id,
            order_num,
            session_id,
            inx
          }),
        20,
        30
      );
      if (!qrcode) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `系统延迟轮询10分钟后获取取票码仍失败`
        });
        this.logUpload({ platName, order_number });
        svApi.updateTicketRecord({
          order_number,
          err_msg: "系统延迟轮询10分钟后获取取票码仍失败"
        });
        return;
      }
      await this.submitQrcode({
        order_id,
        qrcode,
        app_name,
        card_id,
        order_number,
        supplierCode,
        platName,
        lockseat,
        flag: 2
      });
    } catch (error) {
      console.warn("异步轮询获取取票码上传提交异常", error);
    }
  }

  async submitQrcode({
    order_id,
    qrcode,
    app_name,
    card_id,
    order_number,
    supplierCode,
    platName,
    lockseat,
    flag
  }) {
    const { conPrefix } = this;
    try {
      // 10、提交取票码
      const submitRes = await this.submitTicketCode({
        platName,
        order_id,
        qrcode,
        order_number,
        supplierCode,
        lockseat,
        flag
      });
      if (!submitRes) {
        console.error(conPrefix + "订单提交取票码失败，单个订单直接出票结束");
        // this.setErrInfo("订单提交取票码失败");
        return;
      }
      if (flag !== 1) {
        if (card_id) {
          // 更新单卡使用量
          svApi.updateDayUsage({
            app_name,
            card_id
          });
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `系统延迟后轮询获取提交取票码成功`
        });
        this.logUpload({ platName, order_number });
        // 更新出票结果
        svApi.updateTicketRecord({
          order_number,
          qrcode,
          order_status: "1",
          err_msg: "系统延迟后轮询获取提交取票码成功"
        });
      }
      return submitRes;
    } catch (error) {
      console.warn("提交取票码异常", error);
      this.setErrInfo("提交取票码异常", error);
    }
  }

  // 根据订单name获取影院id
  getCinemaId(cinema_name, list) {
    const { conPrefix, appFlag } = this;
    try {
      // 1、先全字匹配，匹配到就直接返回
      let cinema_id = list.find(item => item.name === cinema_name)?.id;
      if (cinema_id) {
        return cinema_id;
      }
      // 2、匹配不到的如果满足条件就走特殊匹配
      console.warn(conPrefix + "全字匹配影院名称失败", cinema_name, list);
      let cinemaName = cinemNameSpecial(cinema_name);
      if (SPECIAL_CINEMA_OBJ[appFlag].length) {
        let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appFlag].find(
          item => item.order_cinema_name === cinemaName
        );
        if (specialCinemaInfo) {
          cinemaName = specialCinemaInfo.sfc_cinema_name;
        } else {
          console.warn(
            conPrefix + "特殊匹配影院名称失败",
            cinemaName,
            SPECIAL_CINEMA_OBJ[appFlag]
          );
        }
      }
      // 3、去掉空格及换行符后全字匹配
      // 去除空格及括号后的影院列表
      let noSpaceCinemaList = list.map(item => {
        return {
          ...item,
          name: cinemNameSpecial(item.name)
        };
      });
      cinema_id = noSpaceCinemaList.find(item => item.name === cinemaName)?.id;
      if (cinema_id) {
        return cinema_id;
      }
      console.error(
        conPrefix + "去掉空格及换行符后全字匹配失败",
        cinemaName,
        noSpaceCinemaList
      );
      this.setErrInfo("根据订单name获取影院id-去掉空格及换行符后全字匹配失败");
    } catch (error) {
      console.error(conPrefix + "根据订单name获取影院id失败", error);
      this.setErrInfo("根据订单name获取影院id失败", error);
    }
  }

  // 获取电影信息
  async getMovieInfo(item) {
    const { conPrefix, cityList } = this;
    try {
      // 1、获取影院列表拿到影院id
      const { city_name, cinema_name, film_name, show_time } = item;
      let city_id = cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      let params = {
        city_id: city_id
      };
      console.log(conPrefix + "获取城市影院参数", params);
      const res = await this.sfcApi.getCinemaList(params);
      console.log(conPrefix + "获取城市影院返回", res);
      let cinemaList = res.data?.cinema_data || [];
      let cinema_id = this.getCinemaId(cinema_name, cinemaList);
      if (!cinema_id) {
        console.error(conPrefix + "获取目标影院失败");
        return;
      }
      // 2、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({ city_id, cinema_id });
      // 3、匹配订单拿到会员价
      const { movie_data } = moviePlayInfo;
      let movieInfo = movie_data.find(
        item =>
          convertFullwidthToHalfwidth(item.movie_name) ===
          convertFullwidthToHalfwidth(film_name)
      );
      if (!movieInfo) {
        console.warn(
          conPrefix + "影院放映信息匹配订单影片名称全字匹配失败",
          movie_data,
          film_name
        );
        this.setErrInfo("影院放映信息匹配订单影片名称全字匹配失败");
        movieInfo = movie_data.find(
          item =>
            convertFullwidthToHalfwidth(item.movie_name) ===
            convertFullwidthToHalfwidth(film_name)
        );
      }
      if (movieInfo) {
        let { shows } = movieInfo;
        let showDay = show_time.split(" ")[0];
        let showList = shows[showDay] || [];
        let showTime = show_time.split(" ")[1].slice(0, 5);
        let ticketInfo = showList.find(item => item.start_time === showTime);
        return ticketInfo;
      }
    } catch (error) {
      console.error(conPrefix + "获取当前场次电影信息异常", error);
      this.setErrInfo("获取当前场次电影信息异常", error);
    }
  }

  // 获取优惠券列表
  async getQuanList(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, session_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        session_id,
        request_from: "1"
      };
      console.log(conPrefix + "获取优惠券列表参数", params);
      const res = await this.sfcApi.getQuanList(params);
      console.log(conPrefix + "获取优惠券列表返回", res);
      let list = res.data.list || [];
      // let noUseLIst = ['1598162363509715', '1055968062906716', '1284460567801315', '1116166666409614']
      // 过滤掉不可用券
      // list = list.filter(item => item.coupon_num.indexOf("t") === -1);
      return list;
    } catch (error) {
      console.error(conPrefix + "获取优惠券列表异常", error);
      this.setErrInfo("获取优惠券列表异常", error);
    }
  }

  // 绑定券
  async bandQuan({ coupon_num, session_id }) {
    const { conPrefix } = this;
    // 由于要用二线城市影院且40券通用，故写死
    let params = {
      city_id: "304",
      cinema_id: "33",
      session_id,
      coupon_code: coupon_num,
      from_goods: "2"
    };
    try {
      await this.delay(1);
      const res = await this.sfcApi.bandQuan(params);
      // console.log("res", res);
      if (res.data?.success === "1") {
        return coupon_num;
      } else {
        console.error(conPrefix + "绑定新券异常", res);
        this.setErrInfo(
          conPrefix + "绑定新券异常:" + JSON.stringify(params),
          res
        );
      }
    } catch (error) {
      console.error(conPrefix + "绑定新券异常", error);
      this.setErrInfo(
        conPrefix + "绑定新券异常:" + JSON.stringify(params),
        error
      );
    }
  }

  // 获取新券
  async getNewQuan({
    quanValue,
    quanNum,
    city_id,
    cinema_id,
    session_id,
    asyncFlag
  }) {
    const { conPrefix, appFlag } = this;
    try {
      let quanRes = await svApi.queryQuanList({
        quan_value: quanValue,
        app_name: appFlag,
        quan_status: "1",
        page_num: 1,
        page_size: quanNum
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `从服务端获取券完成`
      });

      let quanList = quanRes.data.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        console.error(conPrefix + `数据库${quanValue}面额券不足`);
        this.setErrInfo(`数据库${quanValue}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(conPrefix + `正在尝试绑定券 ${quan.coupon_num}...`);
        const coupon_num = await this.bandQuan({
          city_id,
          cinema_id,
          session_id,
          coupon_num: quan.coupon_num
        });
        if (coupon_num) {
          bandQuanList.push({ coupon_num, quan_cost: quan.quan_cost });
          svApi.addUseQuanRecord({
            coupon_num: coupon_num,
            app_name: appFlag,
            quan_status: "2",
            use_time: getCurrentFormattedDateTime()
          });
        }
      }
      return bandQuanList;
    } catch (error) {
      console.error(conPrefix + "获取新券异常", error);
      this.setErrInfo("获取新券异常", error);
    }
  }

  // 使用优惠券
  async useQuan({
    city_id,
    cinema_id,
    show_id,
    seat_ids,
    ticket_num,
    supplier_end_price,
    quanList,
    quanValue,
    rewards,
    session_id
  }) {
    const { conPrefix } = this;
    try {
      // 规则如下:
      // 1、成本不能高于中标价，即40券不能出中标价38.8的单
      // 2、1张票一个券，不能出现2张票用3个券的情况
      // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
      let quans = quanList || []; // 优惠券列表
      let targetQuanList = quans
        .filter(item => item.coupon_info.indexOf(quanValue) !== -1)
        .map(item => {
          return {
            coupon_num: item.coupon_num,
            quan_cost: quanValue == 40 ? 38.8 : Number(quanValue)
          };
        });
      if (targetQuanList?.length < ticket_num) {
        console.error(
          conPrefix + `${quanValue} 面额券不足，从服务端获取并绑定`,
          targetQuanList
        );
        const newQuanList = await this.getNewQuan({
          city_id,
          cinema_id,
          quanValue,
          session_id,
          quanNum: Number(ticket_num) - targetQuanList.length
        });
        if (newQuanList?.length) {
          targetQuanList = [...targetQuanList, ...newQuanList];
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `从服务端获取券绑定完成`
        });
        if (targetQuanList?.length < ticket_num) {
          console.error(
            conPrefix + `从服务端获取并绑定后${quanValue} 面额券仍不足，`,
            targetQuanList
          );
          this.setErrInfo(`${quanValue} 面额券从数据库获取后仍不足`);
          return {
            profit: 0,
            useQuans: []
          };
        }
      }
      if (targetQuanList?.length - ticket_num < 10) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `本次出票后券小于10，开始异步绑定券;`
        });
        this.getNewQuan({
          city_id,
          cinema_id,
          quanValue,
          session_id,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1
        });
      }
      // 用券列表
      let useQuans = targetQuanList.filter((item, index) => index < ticket_num);
      let profit = 0; // 利润
      useQuans.forEach(item => {
        profit =
          profit +
          Number(supplier_end_price) -
          item.quan_cost -
          (Number(supplier_end_price) * 100) / 10000;
      });
      useQuans = useQuans.map(item => item.coupon_num);
      if (rewards == 1) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 400) / 10000;
        profit += rewardPrice;
      }
      // 四舍五入保留两位小数后再转为数值类型
      profit = profit.toFixed(2);

      return {
        profit,
        useQuans
      };
    } catch (error) {
      console.error(conPrefix + "使用优惠券异常", error);
      this.setErrInfo("使用优惠券异常", error);
      return {
        profit: 0,
        useQuans: []
      };
    }
  }

  // 获取会员卡列表
  async getCardList(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, session_id } = data || {};
      let params = {
        city_id,
        cinema_id,
        session_id
      };
      console.log(conPrefix + "获取会员卡列表参数", params);
      const res = await this.sfcApi.getCardList(params);
      console.log(conPrefix + "获取会员卡列表返回", res);
      let list = res.data?.card_data || [];
      return list;
    } catch (error) {
      console.error(conPrefix + "获取会员卡列表异常", error);
      this.setErrInfo("获取会员卡列表异常", error);
    }
  }

  // 使用会员卡
  async useCard({
    member_total_price,
    cardList,
    supplier_end_price,
    ticket_num,
    city_id,
    cinema_id,
    show_id,
    seat_ids,
    member_price,
    real_member_price,
    rewards,
    session_id,
    mobile
  }) {
    const { conPrefix, appFlag } = this;
    try {
      let cards = cardList || [];
      let cardFilter = cards.filter(
        item => Number(item.balance) >= Number(member_total_price)
      );
      if (!cardFilter?.length) {
        console.error(conPrefix + "使用会员卡失败，会员卡余额不足");
        this.setErrInfo(APP_LIST[appFlag] + "会员卡余额不足", {
          cards,
          member_total_price,
          session_id,
          mobile
        });
        return {
          profit: 0,
          card_id: ""
        };
      }
      let cardData = cardFilter.sort((a, b) => {
        // 如果a是默认卡且b不是，默认卡排前面
        if (a.default_card === "1" && b.default_card !== "1") return -1;
        // 如果b是默认卡且a不是，默认卡排前面
        if (a.default_card !== "1" && b.default_card === "1") return 1;
        // 如果两者都是默认卡或都不是，默认维持原有顺序
        return 0;
      });
      let card_id;
      // 开始尝试使用卡并获取成功使用的卡的结果
      const attemptCardsSequentially = async () => {
        for (const card of cardData) {
          console.log(conPrefix + `正在尝试使用卡 ${card.card_num}...`);
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `正在尝试使用卡 ${card.card_num}`
          });
          const result = await this.priceCalculation({
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            card_id: card.id,
            session_id
          });
          if (result) {
            let cardCalcFail =
              Number(result.total_price) >
              (Number(real_member_price) * 100 * Number(ticket_num)) / 100;
            if (cardCalcFail) {
              let isChangeCard = card.id !== cardData[cardData.length - 1].id;
              this.logList.push({
                opera_time: getCurrentTime(),
                des: `该会员卡计算后价格-${result.total_price}高于真实会员价-${real_member_price}*座位数-${ticket_num},${isChangeCard ? "准备换卡" : ""};`
              });
            } else {
              card_id = card.id;
              console.log(conPrefix + "卡使用成功，返回结果并停止尝试。");
              return result; // 卡使用成功，返回结果并结束函数
            }
          }
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `所有会员卡尝试均失败;`
        });
        console.error(conPrefix + "所有卡尝试均失败。");
        return null; // 所有卡尝试失败后返回null
      };
      // 3、计算价格要求最终价格小于中标价
      const priceInfo = await attemptCardsSequentially();
      if (!priceInfo) {
        console.error(conPrefix + "计算订单价格失败，单个订单直接出票结束");
        // this.setErrInfo(
        //   APP_LIST[appFlag] + "计算订单价格失败，单个订单直接出票结束"
        // );
        return {
          profit: 0,
          card_id: ""
        };
      }
      console.warn(
        conPrefix + "会员卡出票最终价格",
        priceInfo?.total_price,
        supplier_end_price,
        ticket_num,
        "中标价格*座位数：",
        Number(supplier_end_price) * ticket_num
      );
      // 卡的话 1块钱成本就是一块钱，利润 =  中标价格-会员出票价格 -手续费（中标价格1%）
      let profit =
        supplier_end_price -
        member_price -
        (Number(supplier_end_price) * 100) / 10000;
      profit = Number(profit) * Number(ticket_num);
      if (rewards == 1) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 400) / 10000;
        profit += rewardPrice;
      }
      profit = Number(profit).toFixed(2);
      if (profit < 0) {
        console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
        this.setErrInfo(
          APP_LIST[appFlag] + "最终利润为负，单个订单直接出票结束"
        );
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return {
          profit: 0,
          card_id: ""
        };
      }
      return {
        card_id,
        profit
      };
    } catch (error) {
      // 此处异常一定是代码异常无需考虑重试
      console.error(conPrefix + "使用会员卡异常", error);
      this.setErrInfo("使用会员卡异常", error);
      return {
        card_id: "",
        profit: 0
      };
    }
  }
  // 获取城市列表
  async getCityList() {
    const { conPrefix } = this;
    try {
      let params = {};
      console.log(conPrefix + "获取城市列表参数", params);
      const res = await this.sfcApi.getCityList(params);
      console.log(conPrefix + "获取城市列表返回", res);
      this.cityList = res.data.all_city || [];
    } catch (error) {
      console.error(conPrefix + "获取城市列表异常", error);
      this.setErrInfo("获取城市列表异常", error);
    }
  }
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);
export default createTicketQueue;
