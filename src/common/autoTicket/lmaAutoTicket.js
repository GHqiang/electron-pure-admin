import {
  getCurrentFormattedDateTime,
  convertFullwidthToHalfwidth,
  getCinemaId, // 根据影院名称获取影院id
  mockDelay, // 模拟延时
  logUpload, // 日志上传
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById, // 根据报价规则id获取详细内容
  couponInfoSpecial,
  formatTimeStrByLma
} from "@/utils/utils";

import svApi from "@/api/sv-api";
import { encode } from "@/utils/sfc-member-password";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 影院特殊匹配列表及api
import {
  TICKET_CONPREFIX_OBJ,
  APP_OPENID_OBJ,
  APP_LIST,
  QUAN_TYPE_COST,
  TEST_NEW_PLAT_LIST
} from "@/common/constant";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";

let isTestOrder = true; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.cityList = []; // 城市列表
    this.errMsg = ""; // 单次出票的错误语
    this.errInfo = ""; // 单次出票的错误信息
    this.appFlag = appFlag; // 影线标识
    this.conPrefix = TICKET_CONPREFIX_OBJ[appFlag]; // 打印前缀
    this.sfcApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.logList = []; // 操作运行日志
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
  }

  // 启动队列
  async start() {
    const { conPrefix } = this;
    this.prevOrderNumber = "";
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    this.handledOrders = new Map();
    console.warn(conPrefix + `队列启动，开始监听是否有新订单`);
    this.setupListeners();
  }

  // 监听新订单
  setupListeners() {
    // 先移除旧的监听器再注册新的，避免多次监听重复执行
    if (this.handleNewOrderBound) {
      window.removeEventListener(this.eventName, this.handleNewOrderBound);
    }

    this.handleNewOrderBound = this.handleNewOrder.bind(this);
    window.addEventListener(this.eventName, this.handleNewOrderBound);
  }

  // 测试新订单
  testSendNewOrder(order) {
    const { appFlag } = this;
    isTestOrder = true;
    let newOrder = order || {
      id: 761,
      plat_name: "lieren",
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
    };
    // 动态生成事件名称
    const eventName = `newOrder_${appFlag}`;
    // 创建一个事件对象
    const newOrderEvent = new CustomEvent(eventName, { detail: newOrder });
    window.dispatchEvent(newOrderEvent);
    console.log(
      `Sent new order to the ticketing queue (${appFlag}):`,
      newOrder
    );
  }

  // 处理新订单
  handleNewOrder(event) {
    const { appFlag, conPrefix } = this;
    const order = event.detail;
    // 检查是否已经处理过此订单
    if (this.handledOrders.has(order.plat_name + "_" + order.order_number)) {
      console.warn(conPrefix + "订单已被处理过，忽略重复消息", order);
      let logList = [
        {
          opera_time: getCurrentFormattedDateTime(),
          des: "订单已被处理过，忽略重复消息",
          level: "info",
          info: {
            repeatOrder: order
          }
        }
      ];
      logUpload(
        {
          plat_name: order.plat_name,
          app_name: appFlag,
          order_number: order.order_number,
          type: 3
        },
        logList
      );
      return;
    }

    // 标记此订单为已处理
    this.handledOrders.set(order.plat_name + "_" + order.order_number, 1);
    console.warn(conPrefix + "新的待出票订单", order);
    let logList = [
      {
        opera_time: getCurrentFormattedDateTime(),
        des: "自动出票队列获取到新的待出票订单",
        level: "info",
        info: {
          newOrders: order
        }
      }
    ];
    logUpload(
      {
        plat_name: order.plat_name,
        app_name: appFlag,
        order_number: order.order_number,
        type: 3
      },
      logList
    );
    this.queue.push(order);
    if (!this.isRunning) {
      this.startProcessingQueue();
    }
  }

  // 开始队列上传
  async startProcessingQueue() {
    const { conPrefix, appFlag } = this;
    this.isRunning = true;
    while (this.queue.length > 0 && this.isRunning) {
      // 取出队列首部订单并从队列里去掉
      const order = this.queue.shift();
      if (order) {
        if (this.prevOrderNumber === order.order_number) {
          let log_list = [
            {
              opera_time: getCurrentFormattedDateTime(),
              des: `当前订单重复执行,直接执行下个`,
              level: "error"
            }
          ];
          logUpload(
            {
              plat_name: order.plat_name,
              app_name: appFlag,
              order_number: order.order_number,
              type: 3
            },
            log_list
          );
        } else {
          // 处理订单
          const res = await this.orderHandle(order);
          this.prevOrderNumber = order.order_number;
          // res: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
          console.warn(
            conPrefix + `单个订单自动出票${res?.submitRes ? "成功" : "失败"}`,
            order,
            res
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}，赋值上个订单号为当前订单号-${this.prevOrderNumber}`,
            level: "error",
            info: {
              res
            }
          });
          if (!isTestOrder) {
            let params = {
              order,
              ticketRes: res,
              appFlag,
              errMsg: this.errMsg,
              errInfo: this.errInfo,
              mobile: this.currentParamsList[this.currentParamsInx].mobile
            };
            await addOrderHandleRecored(params);
            this.logList.push({
              opera_time: getCurrentFormattedDateTime(),
              des: `订单出票结束，远端已添加出票记录`,
              level: "info"
            });
            logUpload(
              {
                plat_name: order.plat_name,
                app_name: appFlag,
                order_number: order.order_number,
                type: 3
              },
              this.logList
            );
          }
        }
      }
    }
    this.isRunning = false;
  }

  // 将订单添加至队列
  enqueue(order) {
    const { conPrefix } = this;
    if (order) {
      console.log(conPrefix + "添加新订单到队列");
      this.queue.push(order);
    } else {
      // console.log(conPrefix + "从出票记录过滤后，无新订单添加到队列");
    }
  }

  // 处理订单
  async orderHandle(order, delayTime) {
    const { conPrefix } = this;
    try {
      this.errMsg = "";
      this.errInfo = "";
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`,
        level: "info",
        info: {
          order,
          delayTime
        }
      });
      // await mockDelay(delayTime);
      console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
        // this.logList.push({
        //   opera_time: getCurrentFormattedDateTime(),
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

  // 停止队列运行
  stop() {
    const { conPrefix } = this;
    this.isRunning = false;
    // 停止的时候判断是否有事件监听，有就移除
    if (this.handleNewOrderBound) {
      window.removeEventListener(this.eventName, this.handleNewOrderBound);
      this.handleNewOrderBound = null;
    }
    console.warn(conPrefix + "自动出票队列停止");
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
          this.errInfo = formatErrInfo(errInfo);
        }
      }
    } catch (error) {
      console.warn("错误信息转换异常1", error);
    }
  }

  // 转单
  async transferOrder(order, unlockSeatInfo) {
    const { conPrefix, errMsg, errInfo, appFlag } = this;
    const { plat_name } = order;
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");
    const {
      order_number,
      city_name,
      cinema_name,
      film_name,
      show_time,
      lockseat
    } = order;
    // 关闭自动转单只针对座位异常生效
    // if (isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    if (isTestOrder || isAutoTransfer !== "1") {
      console.warn("锁定座位异常关闭自动转单");
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `自动转单处于关闭状态`,
        level: "info"
      });
      sendWxPusherMessage({
        plat_name,
        order_number,
        city_name,
        cinema_name,
        film_name,
        show_time,
        lockseat,
        transferTip: "自动转单处于关闭状态,需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
      return;
    }
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      let lmaToken = this.currentParamsList[this.currentParamsInx].lmaToken;
      // 3、获取座位布局
      if (unlockSeatInfo) {
        const { order_str } = unlockSeatInfo;
        const cancelRes = await cannelOneOrder({
          order_str,
          appFlag,
          lmaToken
        });
        if (cancelRes.error) {
          sendWxPusherMessage({
            plat_name,
            order_number,
            city_name,
            cinema_name,
            film_name,
            show_time,
            lockseat,
            transferTip:
              "转单前取消订单失败，建议手动取消订单，以便后续订单正常出票",
            failReason: `${JSON.stringify(cancelRes.error)}`
          });
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `转单前释放座位${!cancelRes.error ? "成功" : "失败"}`,
          level: "info",
          info: {
            cancelRes
          }
        });
      }
      let params;
      if (plat_name === "lieren") {
        params = {
          id: order.id,
          confirm: 1
        };
      } else if (plat_name === "sheng") {
        params = {
          orderCode: order.order_number,
          supplierCode: order.supplierCode
          // reason: ""
        };
      } else if (plat_name === "mangguo") {
        params = {
          order_id: order.id,
          remark: "渠道无法出票"
        };
      } else if (plat_name === "mayi") {
        params = {
          tradeno: order.id,
          certificateImgUrl: "",
          reason: "",
          type: "bj_error"
        };
      } else if (plat_name === "yangcong") {
        params = {
          tradeno: order.id
        };
      } else if (plat_name === "haha") {
        params = {
          id: order.id,
          reasonId: 9,
          text: "其他-"
        };
      } else if (plat_name === "yinghuasuan") {
        params = {
          order_sn: order_number,
          close_cause: "价格过低无法出票"
        };
      } else if (plat_name === "shangzhan") {
        params = {
          order_sn: order_number,
          order_status: "3", // 出票状态（3：出票失败 9：出票成功）
          cancel_reason: "价格过低无法出票" // 出票失败原因（出票失败必传）
        };
      }
      console.log(conPrefix + "转单参数", params);
      console.warn(conPrefix + "【转单】参数", params);
      const res = await PLAT_API_OBJ[plat_name].transferOrder(params);
      console.warn(conPrefix + "【转单】结果", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `转单成功-${JSON.stringify(res)}`,
        level: "info"
      });
      sendWxPusherMessage({
        plat_name,
        order_number,
        city_name,
        cinema_name,
        film_name,
        show_time,
        lockseat,
        transferTip: "自动转单处于开启状态,已转单无需处理",
        failReason: `${errMsg}——${errInfo}`
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
        opera_time: getCurrentFormattedDateTime(),
        des: `转单原因-${this.errMsg}——${this.errInfo}`,
        level: "error"
      });
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `转单异常`,
        level: "error",
        info: {
          error
        }
      });
      sendWxPusherMessage({
        plat_name,
        order_number,
        city_name,
        cinema_name,
        film_name,
        show_time,
        lockseat,
        transferTip: "自动转单开启，转单失败，需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
    }
  }

  // 单个订单出票
  async singleTicket(item) {
    // 放到这里即使修改token也不用重启队列了
    const { conPrefix, appFlag } = this;
    const { id, plat_name, supplierCode, order_number, bid } = item;
    const { city_name, cinema_name, film_name, show_time, lockseat } = item;
    console.warn(conPrefix + "单个待出票订单信息", item);
    this.currentParamsList = getCinemaLoginInfoList()
      .filter(
        item =>
          item.app_name === appFlag &&
          item.mobile &&
          item.session_id &&
          item.member_pwd
      )
      .map(item => ({ ...item, lmaToken: item.session_id }))
      .sort((a, b) => {
        // 如果 a.priority 为真，则 a 应该排在 b 之前，因此返回负数
        if (a.mobile === tokens.userInfo.phone) return -1;
        // 如果 b.priority 为真，则 b 应该排在 a 之前，因此返回正数
        if (b.mobile === tokens.userInfo.phone) return 1;
        // 如果两个对象的 priority 属性都相同或都是假，则按默认顺序排列
        return 0;
      });
    this.currentParamsInx = 0;
    let offerRule;
    try {
      // 1、获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferList({
        user_id: tokens.userInfo.user_id,
        order_status: "1",
        app_name: appFlag,
        order_number,
        plat_name
      });
      let offerRecord = offerRes?.data?.offerList || [];
      offerRule = offerRecord?.[0];
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取该订单报价记录异常",
        level: "error",
        info: {
          error
        }
      });
    }
    // 测试专用
    if (isTestOrder) {
      // offerRule = { offer_type: "1", quan_value: "35" };
      offerRule = { offer_type: "2", member_price: "29.9" };
    }
    console.warn(conPrefix + "从该订单的报价记录获取到的报价规则", offerRule);
    if (!offerRule || offerRule?.rule_status === "3") {
      let str = "获取该订单报价记录失败，微信通知手动出票";
      if (offerRule) {
        str = "该订单报价规则为仅报价，需手动出票并抓包相关接口";
      }
      console.error(conPrefix + str, offerRule);
      this.setErrInfo(str);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: str,
        level: "error",
        info: {
          offerRule
        }
      });
      sendWxPusherMessage({
        plat_name,
        order_number,
        city_name,
        cinema_name,
        film_name,
        show_time,
        lockseat,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return {
        offerRule
      };
    }
    this.logList.push({
      opera_time: getCurrentFormattedDateTime(),
      des: `获取该订单报价记录成功`,
      level: "info",
      info: {
        offerRule
      }
    });
    try {
      console.warn(conPrefix + "单个待出票订单信息", item);
      // 1、解锁座位
      if (!isTestOrder) {
        if (plat_name === "lieren") {
          await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
        } else if (plat_name === "sheng") {
          const deliverRes = await startDeliver({
            plat_name,
            order_number,
            supplierCode,
            appFlag
          });
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "确认接单返回",
            level: "info",
            info: {
              deliverRes
            }
          });
          await mockDelay(2);
          await this.unlockSeat({
            plat_name,
            order_number,
            supplierCode,
            inx: 1
          });
        } else if (plat_name === "mangguo") {
          await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
        } else if (plat_name === "mayi") {
          await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
        } else if (plat_name === "yangcong") {
          await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
        } else if (plat_name === "haha") {
          const deliverRes = await startDeliver({ plat_name, bid, appFlag });
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "确认接单返回",
            level: "info",
            info: {
              deliverRes
            }
          });
          await mockDelay(2);
          await this.unlockSeat({
            plat_name,
            order_id: id,
            inx: 1
          });
        } else if (plat_name === "yinghuasuan") {
          await this.unlockSeat({
            plat_name,
            order_number,
            inx: 1
          });
        }
        // this.logList.push({
        //   opera_time: getCurrentFormattedDateTime(),
        //   des: `订单首次解锁座位完成`,
        //   level: "info"
        // });
      }
    } catch (error) {
      console.error(conPrefix + "解锁座位失败准备试错3次，间隔3秒", error);
      // 试错3次，间隔3秒
      let params = {
        order_id: id,
        order_number,
        supplierCode,
        plat_name
      };
      let delayConfig = {
        lieren: [3, 3],
        mangguo: [3, 3],
        sheng: [3, 3],
        mayi: [60, 1],
        yangcong: [3, 3],
        haha: [3, 3],
        yinghuasuan: [3, 3]
      };
      const res = await trial(
        inx => this.unlockSeat({ ...params, inx }),
        delayConfig[plat_name][0],
        delayConfig[plat_name][1],
        conPrefix
      );
      if (!res) {
        console.error(conPrefix + "单个订单试错后仍解锁失败", "需要走转单逻辑");
        // 转单逻辑待补充
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `订单首次解锁失败试错后解锁成功`,
        level: "info"
      });
    }
    try {
      // 解锁成功后延迟6秒再执行
      await mockDelay(1);
      // 2、一键买票
      const result = await this.oneClickBuyTicket({
        ...item,
        otherParams: {
          offerRule
        }
      });
      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
      if (result) {
        console.warn(conPrefix + "单个订单出票完成");
        return result;
      } else {
        console.warn(conPrefix + "单个订单出票失败");
      }
    } catch (error) {
      console.error(conPrefix + "单个订单出票异常", error);
    }
  }

  // 解锁座位
  async unlockSeat({
    plat_name,
    order_id,
    inx = 1,
    order_number: orderCode,
    supplierCode,
    formFlag
  }) {
    const { conPrefix } = this;
    try {
      let params;
      if (plat_name === "lieren") {
        params = {
          order_id
        };
      } else if (plat_name === "sheng") {
        params = {
          orderCode,
          supplierCode
        };
      } else if (plat_name === "mangguo") {
        params = {
          order_id
        };
      } else if (plat_name === "mayi") {
        params = {
          tradeno: order_id
        };
      } else if (plat_name === "yangcong") {
        params = {
          tradeno: order_id
        };
      } else if (plat_name === "haha") {
        params = {
          id: order_id
        };
      } else if (plat_name === "yinghuasuan") {
        params = {
          order_sn: orderCode
        };
      }
      console.log(conPrefix + "解锁参数", params);
      if (inx == 1) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `解锁座位参数`,
          level: "info",
          info: {
            params
          }
        });
      }

      const res = await PLAT_API_OBJ[plat_name].unlockSeat(params);
      console.log(conPrefix + "解锁返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次解锁座位返回`,
        level: "info",
        info: {
          res
        }
      });
      return res;
    } catch (error) {
      // 芒果偶尔会这样
      if ((error?.msg || error?.message || "").includes("已经解锁")) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次解锁座位发现已解锁`,
          level: "error",
          info: {
            error
          }
        });
        return;
      }
      // 哈哈偶尔会这样
      if (error?.msg === "当前订单座位没有被锁") {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次解锁座位发现座位没有被锁`,
          level: "error",
          info: {
            error
          }
        });
        return;
      }
      console.error(conPrefix + "解锁异常", error);
      this.setErrInfo(`第${inx}次解锁座位失败`, error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次解锁座位失败`,
        level: "error",
        info: {
          error
        }
      });
      // 这种情况下不需要返回异常
      if (plat_name === "mayi" && formFlag === 1) {
        return;
      }
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
        plat_name,
        otherParams
      } = item;
      // otherParams主要是为了换号出票时不用再走之前流程
      let {
        offerRule,
        city_id,
        cinema_id,
        short_code, // 影片编码
        show_id, // 场次
        seat_arr, // 座位信息
        order_str, // 锁座订单号
        start_day,
        start_time
      } = otherParams || {};
      rewards = offerRule?.rewards || 0;
      console.log("this.currentParamsInx开始", this.currentParamsInx);
      if (this.currentParamsInx === 0) {
        const phone = this.currentParamsList[0].mobile;
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `首次出票手机号-${phone}`,
          level: "info",
          info: {
            currentParamsList: this.currentParamsList
          }
        });
        // 2、获取城市列表
        const cityListRes = await getCityList({ appFlag });
        this.cityList = cityListRes?.cityList || [];
        if (!this.cityList?.length) {
          this.setErrInfo("获取城市列表异常", cityListRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取城市列表异常`,
            level: "error",
            info: {
              error: cityListRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        city_id = this.cityList.find(
          item => item.name.indexOf(city_name) !== -1
        )?.id;
        // 3、获取城市影城列表
        const cinemaListRes = await getCityCinemaList({ city_id, appFlag });
        const cinemaList = cinemaListRes?.cinemaList || [];
        if (!cinemaList.length) {
          this.setErrInfo("获取城市影院列表异常", cinemaListRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取城市影院列表异常`,
            level: "error",
            info: {
              error: cinemaListRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 4、根据影院名称获取目标影院id
        let cinemaIdRes = getCinemaId(
          cinema_name,
          cinemaList,
          appFlag,
          city_name
        );
        cinema_id = cinemaIdRes?.cinema_id;
        if (!cinema_id) {
          this.setErrInfo("根据影院名称获取目标影院id异常", cinemaIdRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: conPrefix + "获取目标影院失败",
            level: "error",
            info: {
              error: cinemaIdRes?.error,
              cinema_name,
              cinemaList,
              appFlag,
              city_name
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 5、获取目标影院放映列表
        const movieDataRes = await getMoviePlayInfo({
          cinema_id,
          appFlag
        });
        let movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.setErrInfo("获取影院放映列表异常", movieDataRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: conPrefix + "获取影院放映列表异常",
            level: "error",
            info: {
              error: movieDataRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
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
            this.logList.push({
              opera_time: getCurrentFormattedDateTime(),
              des: `影院放映信息匹配订单影片名称失败`,
              level: "error",
              info: {
                movie_data,
                film_name
              }
            });
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
        }
        short_code = movieObj?.short_code;
        // 6、获取放映日期
        let playDateListRes = await getMoviePlayDate({
          cinema_id,
          short_code,
          appFlag
        });
        let playDateList = playDateListRes?.playDate || [];
        if (!playDateList?.length) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: conPrefix + "获取影院放映日期异常",
            level: "error",
            info: {
              error: playDateListRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1].slice(0, 5);
        console.log(
          conPrefix + "movieObj===>",
          movieObj,
          start_day,
          start_time
        );
        let targetDate = playDateList?.find(
          item => formatTimeStrByLma(item.date) === start_day
        );
        if (!targetDate) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "匹配影片放映日期失败",
            info: {
              playDateList,
              start_day
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let showList = targetDate?.session || [];
        console.log(conPrefix + "showList===>", showList);
        show_id =
          showList.find(item => item.start_time === start_time)?.session_id ||
          "";
        if (!show_id) {
          this.setErrInfo("影院放映信息匹配订单放映时间失败");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `影院放映信息匹配订单放映时间失败`,
            level: "error",
            info: {
              showList,
              start_time
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let lmaToken = this.currentParamsList[this.currentParamsInx].lmaToken;
        // 3、获取座位布局
        const seatDataRes = await getSeatLayout({
          cinema_id,
          show_id,
          lmaToken,
          appFlag
        });
        let seatList = seatDataRes?.seatData || [];
        if (!seatList?.length) {
          console.error(conPrefix + "获取座位布局异常");
          this.setErrInfo("获取座位布局异常", seatDataRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取座位布局异常`,
            level: "error",
            info: {
              error: seatDataRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let seatName = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
        console.log(conPrefix + "seatName", seatName);
        let selectSeatList = seatName.split(",");
        console.log(conPrefix + "selectSeatList", selectSeatList);
        let label_arr = seatDataRes?.label_arr || [];

        seat_arr = seatList
          .filter(item => selectSeatList.includes(item.seat_info))
          .map(item => {
            // 去除自填充值
            const { seat_info, ...otherInfo } = item;
            return {
              ...otherInfo,
              price: label_arr.find(
                item => item.price_type === otherInfo.price_type
              )?.price
            };
          });
        console.log(conPrefix + "seat_arr", seat_arr);
        if (!seat_arr?.length) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `影院座位信息匹配订单座位失败`,
            level: "error",
            info: {
              seatList,
              seatName
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
      } else {
        // 先用上个号的token取消订单，然后再重新出票
        const cancelRes = await cannelOneOrder({
          order_str,
          appFlag,
          lmaToken: this.currentParamsList[this.currentParamsInx - 1].lmaToken
        });
        if (cancelRes.error) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `上个号取消订单失败`,
            info: {
              error: cancelRes.error
            }
          });
          console.warn("上个号取消订单失败,微信发送消息通知并直接走转单");
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 清空上个号的出票失败信息
        this.errMsg = "";
        this.errInfo = "";
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          info: {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        });
      }
      // 4、锁定座位
      let params = {
        cinema_id,
        short_code,
        show_id,
        seat_arr,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
      };
      let lockRes;
      try {
        lockRes = await this.lockSeatHandle(params); // 锁定座位
        // this.logList.push({
        //   opera_time: getCurrentFormattedDateTime(),
        //   des: `首次锁定座位成功`
        // });
      } catch (error) {
        console.error(conPrefix + "锁定座位失败准备试错2次，间隔5秒", error);
        // 试错3次，间隔5秒
        // 锁定座位尝试配置
        let delayConfig = {
          lieren: [6, 5],
          mangguo: [6, 5],
          sheng: [6, 5],
          mayi: [12, 10],
          yangcong: [12, 10],
          haha: [6, 5],
          yinghuasuan: [6, 5],
          shangzhan: [6, 5]
        };
        lockRes = await trial(
          inx => this.lockSeatHandle(params, inx),
          delayConfig[plat_name][0],
          delayConfig[plat_name][1],
          conPrefix
        );
        if (!lockRes) {
          console.error(
            conPrefix + "单个订单试错后仍锁定座位失败",
            "需要走转单逻辑"
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `首次锁定座位失败轮询尝试后仍失败，走转单`,
            level: "error"
          });
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `首次锁定座位失败试错后锁定成功`,
          level: "info"
        });
      }
      order_str = lockRes?.data?.order_str;
      console.warn("order_str", order_str);
      // 5、使用优惠券或者会员卡
      // 会员卡出票必传card_id，上影券必传quan_code，赠送线上券必传card_id和coupon_id，赠送线下券必传member_coupon_id
      const { card_id, quan_code, coupon_id, member_coupon_id, profit } =
        await this.useQuanOrCard({
          order_number,
          city_name,
          cinema_name,
          hall_name,
          city_id,
          cinema_id,
          show_id,
          seat_arr,
          ticket_num,
          supplier_end_price,
          rewards,
          offerRule,
          plat_name
        });
      if (!card_id && !quan_code && !member_coupon_id && !coupon_id) {
        console.log("this.currentParamsInx", this.currentParamsInx);
        console.log("this.currentParamsList", this.currentParamsList);
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix + "优惠券和会员卡都无法使用，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.setErrInfo("优惠券和会员卡都无法使用，单个订单直接出票结束");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `优惠券和会员卡都无法使用，准备转单`,
            level: "error"
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
            opera_time: getCurrentFormattedDateTime(),
            des: `非最后一次用卡用券失败，走换号`,
            level: "error"
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time
            }
          });
        }
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `使用优惠券或者会员卡成功`
      });
      // 6计算订单价格
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { lmaToken } = currentParams;
      const priceRes = await priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_arr,
        card_id,
        quan_code,
        member_coupon_id,
        lmaToken,
        appFlag,
        order_str
      });
      let priceInfo = priceRes?.price;
      if (priceRes?.error) {
        this.setErrInfo(priceRes?.errMsg, priceRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: priceRes?.errMsg,
          level: "error",
          info: {
            error: priceRes?.error
          }
        });
      }
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix +
              "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.setErrInfo("使用优惠券或会员卡后计算订单价格失败");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `使用优惠券或会员卡后计算订单价格失败，准备转单`,
            level: "error"
          });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            order_str
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `非最后一次创建订单前计算价格失败，走换号`,
            level: "error"
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
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
          opera_time: getCurrentFormattedDateTime(),
          des: `用券计算订单价格后价格不为0，准备转单`,
          level: "error"
        });
        const transferParams = await this.transferOrder(item, {
          order_str
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
      //       order_str
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
        opera_time: getCurrentFormattedDateTime(),
        des: `创建订单前计算订单价格成功`,
        level: "info"
      });
      // 7、创建订单
      let order_num = await this.createOrder({
        city_id,
        cinema_id,
        show_id,
        seat_arr,
        card_id,
        coupon: quan_code,
        member_coupon_id,
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
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            order_str
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `非最后一次创建订单失败，走换号`,
            level: "error"
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time
            }
          });
        }
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `创建订单成功`,
        level: "info"
      });
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        city_id,
        cinema_id,
        order_num,
        pay_money,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken,
        appFlag
      });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        console.error(
          conPrefix + "订单购买失败，单个订单直接出票结束",
          "走转单逻辑"
        );
        this.setErrInfo(
          "订单购买失败，单个订单直接出票结束",
          buyTicketRes?.error
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `订单购买失败，单个订单直接出票结束`,
          level: "error",
          info: {
            error: buyTicketRes?.error
          }
        });
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        const transferParams = await this.transferOrder(item, {
          order_str
        });
        return { offerRule, transferParams };
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `订单购买成功`,
        level: "info"
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
        plat_name,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken,
        orderInfo: item,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `订单最后处理成功:获取取票码并上传`,
          level: "info"
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

  // 锁定座位
  async lockSeatHandle(data, inx = 1) {
    const { conPrefix } = this;
    let { cinema_id, show_id, short_code, seat_arr, lmaToken } = data || {};
    try {
      let params = {
        cinema_id: cinema_id,
        session_id: show_id,
        short_code,
        voucher_arr: JSON.stringify([]),
        seat_arr: JSON.stringify(seat_arr),
        lmaToken
      };
      console.log(conPrefix + "锁定座位参数", params);
      if (inx == 1) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次锁定座位参数`,
          level: "info",
          info: {
            params
          }
        });
      }

      const res = await this.sfcApi.lockSeat(params);
      console.log(conPrefix + "锁定座位返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次锁定座位成功`,
        level: "info",
        info: {
          res
        }
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "锁定座位异常", error);
      this.setErrInfo("", "");
      this.setErrInfo(`第${inx}次锁定座位异常`, error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次锁定座位失败`,
        level: "error",
        info: {
          error
        }
      });
      return Promise.reject(error);
    }
  }

  // 使用优惠券或者会员卡
  async useQuanOrCard(params) {
    const { conPrefix, appFlag } = this;
    let {
      city_name,
      cinema_name,
      hall_name,
      city_id,
      cinema_id,
      show_id,
      seat_arr,
      ticket_num,
      supplier_end_price,
      offerRule,
      rewards,
      plat_name,
      order_number
    } = params;
    try {
      console.log(
        conPrefix +
          `待出票订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
      );
      const {
        offer_type,
        quan_value,
        member_price,
        real_member_price,
        offer_rule_id
      } = offerRule;
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { lmaToken, mobile } = currentParams;
      // 拿订单号去匹配报价记录
      if (offer_type !== "1") {
        const ruleInfo = getOfferRuleById(offer_rule_id);
        if (ruleInfo) {
          const { autoUseQuanStatus, autoUseQuanPrice, autoUseQuanFlag } =
            ruleInfo;
          let quanFlagList = autoUseQuanFlag
            ?.replace(/\s*/g, "")
            ?.replace(/;|；/g, "—")
            ?.split("—");
          if (
            autoUseQuanStatus === "1" &&
            supplier_end_price > autoUseQuanPrice &&
            quanFlagList?.length
          ) {
            const firstUseQuanRes = await this.firstUseQuanHandle({
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              lmaToken,
              appFlag,
              ticket_num,
              quanFlagList
            });
            if (firstUseQuanRes) {
              return {
                quan_code: "",
                card_id: firstUseQuanRes.card_id,
                coupon_id: firstUseQuanRes.coupon_id,
                member_coupon_id: firstUseQuanRes.member_coupon_id,
                profit: 0 // 利润
              };
            }
          }
        }
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
        const cardListRes = await getCardList({
          city_id,
          cinema_id,
          lmaToken,
          appFlag
        });
        const cardList = cardListRes?.cardList || [];
        if (!cardList?.length) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: conPrefix + "获取会员卡列表异常",
            level: "error",
            info: {
              error: cardListRes?.error
            }
          });
          return {
            card_id: "",
            profit: 0 // 利润
          };
        }
        // 2、使用会员卡
        let member_total_price = (real_member_price * 100 * ticket_num) / 100;
        const { card_id, profit } = await this.useCard({
          member_total_price,
          cardList,
          supplier_end_price,
          ticket_num,
          city_id,
          cinema_id,
          show_id,
          seat_arr,
          member_price,
          real_member_price,
          rewards,
          lmaToken,
          mobile,
          plat_name
        });
        return {
          card_id,
          profit // 利润
        };
      } else {
        console.log(conPrefix + "使用优惠券出票");
        // 1、获取优惠券列表
        const quanListRes = await getQuanList({
          city_id,
          cinema_id,
          lmaToken,
          appFlag
        });
        const quanList = quanListRes?.quanList || [];
        if (quanListRes?.error) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: conPrefix + "获取优惠券列表异常",
            level: "error",
            info: {
              error: quanListRes?.error
            }
          });
        }
        // 2、使用优惠券
        const { useQuans, profit } = await this.useQuan({
          city_id,
          cinema_id,
          show_id,
          seat_arr,
          ticket_num,
          supplier_end_price,
          quanList,
          quan_value,
          rewards,
          lmaToken,
          plat_name,
          order_number
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

  // 优先用券处理
  async firstUseQuanHandle(params) {
    const {
      city_id,
      cinema_id,
      show_id,
      seat_arr,
      lmaToken,
      appFlag,
      ticket_num,
      quanFlagList
    } = params;
    try {
      const quanListRes = await getQuanList({
        city_id,
        cinema_id,
        lmaToken,
        appFlag,
        firstFlag: 1
      });
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "优先用券时-获取优惠券列表返回",
        level: "info",
        info: {
          quanListRes
        }
      });
      const quanList = quanListRes?.quanList || [];
      let targetQuanList = quanList
        .filter(item =>
          quanFlagList.some(itemA =>
            couponInfoSpecial(item.coupon_name).includes(
              couponInfoSpecial(itemA)
            )
          )
        )
        .slice(0, ticket_num);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "优先用券时按券标识过滤后返回",
        level: "info",
        info: {
          targetQuanList,
          quanList,
          quanFlagList
        }
      });
      if (!targetQuanList?.length) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "优先用券时按券标识过滤后为空",
          level: "info"
        });
        return;
      }
      let card_id, coupon_id, member_coupon_id;
      if (targetQuanList[0]?.coupon_type === "1") {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "线上券优先用券时暂不处理",
          level: "info"
        });
        return;
        // 线上
        // const cardListRes = await getCardList({
        //   city_id,
        //   cinema_id,
        //   lmaToken,
        //   appFlag
        // });
        // const cardList = cardListRes?.cardList || [];
        // if (!cardList?.length) {
        //   this.logList.push({
        //     opera_time: getCurrentFormattedDateTime(),
        //     des: "线上券优先用券时获取会员卡列表异常",
        //     level: "error",
        //     info: {
        //       error: cardListRes?.error
        //     }
        //   });
        //   return;
        // }
        // card_id = cardList[0]?.card_num;
        // coupon_id = targetQuanList.map(item => item.id).join();
      } else {
        // 线下
        member_coupon_id = targetQuanList.map(item => item.id).join();
      }
      const priceRes = await priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_arr,
        card_id: "",
        quan_code: "",
        lmaToken,
        appFlag,
        member_coupon_id
      });
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "优先用券时计算价格返回",
        level: "info",
        info: {
          priceRes
        }
      });
      if (priceRes?.error) {
        return;
      }
      let priceInfo = priceRes?.price?.total_price;
      let pay_money = Number(priceInfo); // 此处是为了将订单价格30.00转为30，将0.00转为0
      if (pay_money !== 0) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `优先用券时计算价格后价格不为0`,
          level: "info",
          info: {
            priceInfo
          }
        });
        return;
      }
      return {
        card_id,
        coupon_id,
        member_coupon_id
      };
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "优先用券时发现异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 创建订单
  async createOrder(data) {
    const { conPrefix } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_arr,
      seat_info,
      pay_money,
      card_id,
      coupon,
      member_coupon_id,
      isTimeoutRetry = 1 // 默认超时重试
    } = data || {};
    try {
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { mobile, member_pwd, lmaToken } = currentParams;
      let params = {
        city_id,
        cinema_id,
        show_id,
        seat_arr,
        seat_info, // 座位描述，如：7排11号,7排10号
        phone: mobile || "", // 用户手机号
        additional_goods_info: "", // 附加商品信息
        companion_info: "", // 携伴信息
        goods_info: "", // 商品信息
        option_goods_info: "", // 可选的额外商品信息
        pay_money, // 支付金额
        promo_id: "0", // 促销活动ID，这里为0，表示没有参与特定的促销活动
        update_time: getCurrentFormattedDateTime(),
        lmaToken
      };
      let order_num, res;
      if (card_id) {
        params.card_id = card_id; // 会员卡id
        params.card_password = encode(""); // 会员卡密码
        try {
          console.log(conPrefix + "创建订单参数", params);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `创建订单参数`,
            level: "info",
            info: {
              params
            }
          });
          res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          order_num = res.data?.order_num || "";
        } catch (error) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `会员卡第一次使用空密码创建订单失败`,
            level: "error",
            info: {
              error
            }
          });
          await mockDelay(1);
          console.warn(conPrefix + "会员卡第一次创建订单失败", error);
          console.warn(
            conPrefix + "调整会员卡密码参数再次发起创建订单请求",
            params
          );
          params.card_password = encode(member_pwd); // 会员卡密码
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `创建订单参数`,
            level: "info",
            info: {
              params
            }
          });
          res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          order_num = res.data?.order_num || "";
        }
      } else if (coupon || member_coupon_id) {
        if (coupon) {
          params.coupon = coupon; // 优惠券券码
        } else {
          params.member_coupon_id = member_coupon_id; // 开卡赠送线下券
        }
        console.log(conPrefix + "创建订单参数", params);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `创建订单参数`,
          level: "info",
          info: {
            params
          }
        });
        res = await this.sfcApi.createOrder(params);
        console.log(conPrefix + "创建订单返回", res);
        order_num = res.data?.order_num || "";
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `创建订单返回`,
        level: "info",
        info: {
          res
        }
      });
      return order_num;
    } catch (error) {
      console.error(
        conPrefix + `创建订单异常:${JSON.stringify({ card_id, coupon })}`,
        error
      );
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `创建订单异常`,
        level: "error",
        info: {
          error
        }
      });
      this.setErrInfo("创建订单异常", error);
      if (error?.msg === "请求接口超时,请重试" && isTimeoutRetry === 1) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `创建订单请求接口超时，延迟1秒后重试`,
          level: "error"
        });
        await mockDelay(1);
        try {
          const order_num = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (order_num) {
            this.logList.push({
              opera_time: getCurrentFormattedDateTime(),
              des: `创建订单请求接口超时，延迟1秒后重试成功`,
              level: "info",
              info: {
                order_num
              }
            });
            return order_num;
          }
        } catch (err) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `创建订单请求接口超时，延迟2秒后重试失败`,
            level: "error",
            info: {
              err
            }
          });
        }
      }
    }
  }

  // 获取购票信息
  async payOrder(data) {
    const { conPrefix } = this;
    let {
      city_id,
      cinema_id,
      order_num,
      lmaToken,
      syncQueryLogList,
      inx = 1
    } = data || {};
    let targetLogList = syncQueryLogList || this.logList;
    try {
      let params = {
        city_id,
        cinema_id,
        order_num, // 订单号
        order_type: "ticket", // 订单类型
        order_type_num: 1, // 订单子类型数量，可能是指购买的该类型票的数量
        lmaToken
      };
      console.log(conPrefix + "支付订单参数", params);
      if (inx === 1) {
        targetLogList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取支付结果传参`,
          level: "info",
          info: {
            params
          }
        });
      }
      const res = await this.sfcApi.payOrder(params);
      console.log(conPrefix + "支付订单返回", res);
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次获取支付结果返回`,
        level: "info",
        info: {
          res
        }
      });
      let qrcode = res.data.qrcode || "";
      if (qrcode) {
        return qrcode;
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      console.error(conPrefix + "支付订单异常", error);
      this.setErrInfo("获取订单支付结果异常", error);
      let params = {
        cinema_id,
        city_id,
        order_status: "0",
        page: "1",
        lmaToken,
        width: "240"
      };
      try {
        const res = await this.sfcApi.getOrderList(params);
        let list = res.data?.order_data || [];
        if (list.length) {
          let targetObj = list.find(item => item.order_num === order_num);
          if (targetObj) {
            let qrcode = targetObj.ticket_code?.split(",").join("|");
            if (qrcode) {
              targetLogList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `第${inx}次从已完成订单里获取取票码成功`,
                level: "info",
                info: {
                  qrcode
                }
              });
              return qrcode;
            } else {
              targetLogList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `第${inx}次从已完成订单里获取取票码失败`,
                level: "error"
              });
            }
          }
        }
      } catch (error) {
        targetLogList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次从已完成订单里获取取票码异常`,
          level: "error",
          info: {
            error
          }
        });
      }
      return Promise.reject(error);
    }
  }

  // 提交出票码
  async submitTicketCode({
    plat_name,
    order_id,
    qrcode,
    order_number,
    supplierCode,
    lockseat,
    orderInfo,
    flag,
    syncQueryLogList
  }) {
    const { conPrefix, appFlag } = this;
    let targetLogList = flag === 1 ? this.logList : syncQueryLogList;
    let params;
    // sfc系统连锁店所有平台去除|
    if (appFlag === "sfc") {
      qrcode = qrcode.replace(/\|/g, "");
    }
    if (plat_name === "lieren") {
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
    } else if (plat_name === "sheng") {
      params = {
        orderCode: order_number, // 省APP的订单编号
        supplierCode: supplierCode,
        deliverInfos: JSON.stringify([{ code: qrcode }]), // 提交的时候转成文本，格式是JSON数组，可以多个取票码
        success: true // 是否成功 ，true，false需小写
        // message: "", // 出票失败原因，不能发货才有（失败的情况下一定要传）
        // desc: "" // 描述，允许空，换座信息也填在这里，如更换1排4座，1排5座
      };
    } else if (plat_name === "mangguo") {
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
    } else if (plat_name === "mayi") {
      params = {
        tradeno: order_id, // 蚂蚁APP的订单编号
        ticketCodeList: [
          {
            picUrl: "",
            ticketCode: qrcode
          }
        ]
      };
    } else if (plat_name === "yangcong") {
      params = {
        tradeno: order_id, // 蚂蚁APP的订单编号
        ticketCodeUrls: "",
        ticketCodes: qrcode
      };
    } else if (plat_name === "yinghuasuan") {
      params = {
        order_sn: order_number,
        ticket_code: qrcode,
        ticket_image: " ",
        real_seat_no: lockseat,
        ticket_original_info: [
          {
            url: " ",
            seat: lockseat.split(" "),
            ticketCode: {
              code: qrcode.split("|")[0],
              pwd: qrcode.split("|")?.[1] || ""
            }
          }
        ]
      };
    } else if (plat_name === "shangzhan") {
      params = {
        order_sn: order_number,
        order_status: "9", // 出票状态（3：出票失败 9：出票成功）
        // cancel_reason: "", // 出票失败原因（出票失败必传）
        ticket_list: [
          {
            ticket_code: qrcode.split("|")[0],
            ticket_msg_code: qrcode.split("|")?.[1] || ""
          }
        ]
      };
    } else if (plat_name === "haha") {
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `哈哈暂不上传取票码,需手动上传`,
        level: "info"
      });
      sendWxPusherMessage({
        plat_name,
        order_number,
        city_name: orderInfo?.city_name,
        cinema_name: orderInfo?.cinema_name,
        film_name: orderInfo?.film_name,
        show_time: orderInfo?.show_time,
        lockseat,
        transferTip: "哈哈暂不上传取票码,需手动上传",
        failReason: `哈哈暂不上传取票码,需手动上传`
      });
      return { code: 1, msg: "哈哈暂不上传取票码,需手动上传" };
      const { bid, cinema_name, hall_name, film_name, show_time } = orderInfo;
      params = {
        // oid: order_id,
        // bid,
        // seat: lockseat.split(" "), // [("5排4座", "5排3座")]
        // info: [
        //   {
        //     code: qrcode.split("|")[1], // 199079
        //     img: "",
        //     num: qrcode.split("|")[0], // 230628
        //     imgIndex: "",
        //     seat: lockseat.split(" "), // [("5排4座", "5排3座")]
        //     comparison: {
        //       movie: film_name,
        //       movieStatus: 1,
        //       showTime: show_time,
        //       showTimeStatus: 1,
        //       seat: lockseat.split(" "), // [("5排4座", "5排3座")]
        //       seatStatus: 1,
        //       cinema: cinema_name,
        //       cinemaStatus: 1,
        //       hall: hall_name,
        //       hallStatus: 1
        //     }
        //   }
        // ],
        // seat_type: 0,
        // recogniseSeat: lockseat.split(" ").map(item => ({
        //   oldSeat: item,
        //   newSeat: item,
        //   imgIndex: ""
        // }))

        // 以下app参数，上面是web参数
        oid: order_id,
        bid,
        seat: lockseat.split(" "),
        info: lockseat.split(" ").map((item, inx) => {
          if (inx === 0) {
            return {
              img: " ", // 传空格可以成功
              num: qrcode.split("|")[0],
              code: qrcode.split("|")[1],
              imgIndex: " ", // 传空格可以成功
              isChai: false,
              blob: "",
              seat: lockseat.split(" "),
              comparison: {
                movie: film_name,
                movieStatus: 1,
                showTime: show_time,
                showTimeStatus: 1,
                seat: lockseat.split(" "),
                seatStatus: 1,
                cinema: cinema_name,
                cinemaStatus: 1,
                hall: hall_name,
                hallStatus: 1
              }
            };
          } else {
            return {
              img: "",
              num: "",
              code: "",
              imgIndex: null
            };
          }
        }),
        seat_type: 0,
        ocr_code: [qrcode],
        recogniseSeat: lockseat.split(" ").map(item => ({
          oldSeat: item,
          newSeat: item,
          imgIndex: ""
        }))
      };
    }
    try {
      console.log(conPrefix + "提交出票码参数", params);
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `提交出票码参数`,
        level: "info",
        info: {
          params
        }
      });
      const res = await PLAT_API_OBJ[plat_name].submitTicketCode(params);
      console.log(conPrefix + "提交出票码返回", res);
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `提交取票码返回`,
        level: "info",
        info: {
          res
        }
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "提交出票码异常", error);
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `提交出票码异常`,
        level: "error",
        info: {
          error
        }
      });
      if (flag !== 2) {
        this.setErrInfo("提交出票码异常", error);
      } else {
        let err_info = formatErrInfo(error);
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟后提交出票码异常",
            err_info
          }
        });
      }
    }
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
    plat_name,
    lmaToken,
    orderInfo,
    lockseat
  }) {
    const { conPrefix, appFlag } = this;
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.payOrder({
          city_id,
          cinema_id,
          order_num,
          lmaToken
        });
      } catch (error) {}
      if (!qrcode) {
        console.error(conPrefix + "获取订单结果失败，单个订单直接出票结束");
        this.setErrInfo(
          "获取订单支付结果，取票码不存在，暂时返回异步获取",
          qrcode
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取订单支付结果，取票码不存在，暂时返回异步获取`,
          level: "error"
        });
        this.asyncFetchQrcodeSubmit({
          city_id,
          cinema_id,
          order_num,
          lmaToken,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `非异步获取订单支付结果成功`,
        level: "info"
      });
      const submitRes = await this.submitQrcode({
        order_id,
        qrcode,
        app_name,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        lockseat,
        orderInfo,
        flag: 1
      });
      // submitRes: {} | undefined
      if (submitRes) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `非异步提交取票码成功`,
          level: "info"
        });
      }
      return { submitRes, qrcode };
    } catch (error) {
      console.warn("出票最后处理异常", error);
      this.setErrInfo("", "");
      this.setErrInfo("出票最后处理异常", error);
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    city_id,
    cinema_id,
    order_num,
    lmaToken,
    order_id,
    app_name,
    card_id,
    plat_name,
    order_number,
    supplierCode,
    orderInfo,
    lockseat
  }) {
    const { conPrefix } = this;
    let syncQueryLogList = []; // 异步运行日志
    try {
      // 每搁30秒查一次，查10次，5分钟
      let qrcode = await trial(
        inx =>
          this.payOrder({
            city_id,
            cinema_id,
            order_num,
            lmaToken,
            inx,
            syncQueryLogList
          }),
        10,
        30,
        conPrefix,
        5 * 60
      );
      if (!qrcode) {
        // 5分钟后还失败消息推送
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name: orderInfo.city_name,
          cinema_name: orderInfo.cinema_name,
          film_name: orderInfo.film_name,
          show_time: orderInfo.show_time,
          lockseat,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: `系统延迟轮询5分钟后获取取票码仍失败`
        });
        // 每搁30秒查一次，查10次，5分钟
        qrcode = await trial(
          inx =>
            this.payOrder({
              city_id,
              cinema_id,
              order_num,
              lmaToken,
              inx,
              syncQueryLogList
            }),
          10,
          30,
          conPrefix,
          5 * 60
        );
      }
      if (!qrcode) {
        syncQueryLogList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `系统延迟轮询10分钟后获取取票码仍失败`,
          level: "error"
        });
        logUpload(
          {
            plat_name: plat_name,
            app_name: app_name,
            order_number: order_number,
            type: 3
          },
          syncQueryLogList
        );
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
        order_id,
        qrcode,
        app_name,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        lockseat,
        orderInfo,
        flag: 2,
        syncQueryLogList
      });
      logUpload(
        {
          plat_name: plat_name,
          app_name: app_name,
          order_number: order_number,
          type: 3
        },
        syncQueryLogList
      );
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
    plat_name,
    lockseat,
    orderInfo,
    flag,
    syncQueryLogList
  }) {
    const { conPrefix } = this;
    try {
      // 10、提交取票码
      const submitRes = await this.submitTicketCode({
        plat_name,
        order_id,
        qrcode,
        order_number,
        supplierCode,
        lockseat,
        orderInfo,
        flag,
        syncQueryLogList
      });
      let targetLogList = flag === 1 ? this.logList : syncQueryLogList;
      if (!submitRes) {
        console.error(conPrefix + "订单提交取票码失败，单个订单直接出票结束");
        targetLogList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `提交取票码失败`,
          level: "error"
        });
        const { errMsg, errInfo } = this;
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name: orderInfo?.city_name,
          cinema_name: orderInfo?.cinema_name,
          film_name: orderInfo?.film_name,
          show_time: orderInfo?.show_time,
          lockseat,
          transferTip: "提交取票码失败,需手动上传",
          failReason: `${errMsg}——${errInfo}`
        });
        return;
      }
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `提交取票码成功`,
        level: "info"
      });
      if (flag !== 1) {
        if (card_id) {
          // 更新单卡使用量
          svApi.updateDayUsage({
            app_name,
            card_id
          });
        }
        // 更新出票结果
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            qrcode,
            order_status: "1",
            err_msg: "系统延迟后轮询获取提交取票码成功"
          }
        });
      }
      return submitRes;
    } catch (error) {
      console.warn("提交取票码异常", error);
      this.setErrInfo("提交取票码异常", error);
    }
  }

  // 获取新券
  async getNewQuan({
    quan_value,
    quanNum,
    city_id,
    cinema_id,
    lmaToken,
    asyncFlag,
    asyncBandQuanList,
    plat_name,
    order_number
  }) {
    const { conPrefix, appFlag } = this;
    let targetLogList = asyncFlag === 1 ? asyncBandQuanList : this.logList;
    let conPrev = asyncFlag === 1 ? "异步绑券_" : "";
    try {
      let quanRes = await svApi.queryQuanList({
        quan_value: quan_value,
        app_name: appFlag,
        quan_status: "1",
        page_num: 1,
        page_size: quanNum
      });
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `${conPrev}从服务端获取券返回`,
        level: "info",
        info: {
          quanRes,
          quanNum,
          quan_value
        }
      });

      let quanList = quanRes?.data?.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        console.error(conPrefix + `数据库${quan_value}面额券不足`);
        this.setErrInfo(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(conPrefix + `正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          city_id,
          cinema_id,
          lmaToken,
          coupon_num: quan.coupon_num,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `${conPrev}绑定券返回`,
          level: "error",
          info: {
            ...couponNumRes
          }
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
      targetLogList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `${conPrev}获取新券异常`,
        level: "error",
        info: {
          error,
          quanNum,
          quan_value
        }
      });
      this.setErrInfo("获取新券异常", error);
    } finally {
      if (asyncFlag) {
        logUpload(
          {
            plat_name: plat_name,
            app_name: appFlag,
            order_number: order_number,
            type: 3
          },
          targetLogList
        );
      }
    }
  }

  // 使用优惠券
  async useQuan({
    city_id,
    cinema_id,
    ticket_num,
    supplier_end_price,
    quanList,
    quan_value,
    rewards,
    lmaToken,
    plat_name,
    order_number
  }) {
    const { conPrefix, appFlag } = this;
    try {
      // 规则如下:
      // 1、成本不能高于中标价，即40券不能出中标价38.8的单
      // 2、1张票一个券，不能出现2张票用3个券的情况
      // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
      let quans = quanList || []; // 优惠券列表
      let targetQuanList = quans
        .filter(item => item.coupon_info.indexOf(quan_value) !== -1)
        .map(item => {
          return {
            coupon_num: item.coupon_num,
            quan_cost: QUAN_TYPE_COST[quan_value]
          };
        });
      if (targetQuanList?.length < ticket_num) {
        console.error(
          conPrefix + `${quan_value} 面额券不足，从服务端获取并绑定`,
          targetQuanList
        );
        const newQuanList = await this.getNewQuan({
          city_id,
          cinema_id,
          quan_value,
          lmaToken,
          quanNum: Number(ticket_num) - targetQuanList.length
        });
        if (newQuanList?.length) {
          targetQuanList = [...targetQuanList, ...newQuanList];
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `从服务端获取券绑定完成`,
          level: "info",
          info: {
            newQuanList,
            targetQuanList,
            ticket_num
          }
        });
        if (targetQuanList?.length < ticket_num) {
          console.error(
            conPrefix + `从服务端获取并绑定后${quan_value} 面额券仍不足，`,
            targetQuanList
          );
          this.setErrInfo(`${quan_value} 面额券从数据库获取后仍不足`);
          return {
            profit: 0,
            useQuans: []
          };
        }
      }
      if (targetQuanList?.length - ticket_num < 10) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `本次出票后券小于10，开始异步绑定券;`,
          level: "info"
        });
        this.getNewQuan({
          city_id,
          cinema_id,
          quan_value,
          lmaToken,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1,
          asyncBandQuanList: [],
          plat_name,
          order_number
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
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
          10000;
        profit += rewardPrice;
      }
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
        this.setErrInfo(
          APP_LIST[appFlag] +
            "最终利润为负，单个订单直接出票结束, 利润：" +
            profit
        );
        return {
          profit: 0,
          useQuans: []
        };
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

  // 使用会员卡
  async useCard({
    member_total_price,
    cardList,
    supplier_end_price,
    ticket_num,
    city_id,
    cinema_id,
    show_id,
    seat_arr,
    member_price,
    real_member_price,
    rewards,
    lmaToken,
    mobile,
    plat_name
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
          lmaToken,
          mobile
        });
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "会员卡余额不足",
          level: "error",
          info: {
            cards,
            member_total_price,
            real_member_price,
            ticket_num
          }
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
            opera_time: getCurrentFormattedDateTime(),
            des: `正在尝试使用卡 ${card.card_num}`,
            level: "info"
          });
          const priceRes = await priceCalculation({
            city_id,
            cinema_id,
            show_id,
            seat_arr,
            card_id: card.id,
            lmaToken,
            appFlag
          });
          let price = priceRes?.price;
          if (priceRes?.error) {
            this.setErrInfo(priceRes?.errMsg, priceRes?.error);
            this.logList.push({
              opera_time: getCurrentFormattedDateTime(),
              des: priceRes?.errMsg,
              level: "error",
              info: {
                error: priceRes?.error
              }
            });
          }
          if (price) {
            let cardCalcFail =
              Number(price.total_price) >
              (Number(real_member_price) * 100 * Number(ticket_num)) / 100;
            if (cardCalcFail) {
              let isChangeCard = card.id !== cardData[cardData.length - 1].id;
              this.logList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `该会员卡计算后价格-${price.total_price}高于真实会员价-${real_member_price}*座位数-${ticket_num},${isChangeCard ? "准备换卡" : ""};`,
                level: "error"
              });
            } else {
              card_id = card.id;
              console.log(conPrefix + "卡使用成功，返回结果并停止尝试。");
              return price; // 卡使用成功，返回结果并结束函数
            }
          }
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `所有会员卡尝试均失败;`,
          level: "error"
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
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
          10000;
        profit += rewardPrice;
      }
      profit = Number(profit).toFixed(2);
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
        this.setErrInfo(
          APP_LIST[appFlag] +
            "最终利润为负，单个订单直接出票结束, 利润：" +
            profit
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
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);

// 获取城市列表
const getCityList = async ({ appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {};
    console.log(conPrefix + "获取城市列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCityList(params);
    console.log(conPrefix + "获取城市列表返回", res);
    let cityList = res.data?.list || [];
    // 转换数据保持和上面取值一致
    cityList = cityList.map(item => {
      return {
        name: item.city_name,
        id: item.city_id
      };
    });

    return {
      cityList
    };
  } catch (error) {
    console.error(conPrefix + "获取城市列表异常", error);
    return {
      error
    };
  }
};

// 获取城市影院列表
const getCityCinemaList = async ({ city_id, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id
    };
    console.log(conPrefix + "获取城市影院参数", params);
    const res = await APP_API_OBJ[appFlag].getCinemaList(city_id);
    console.log(conPrefix + "获取城市影院返回", res);
    let cinemaList = res.data?.list || [];
    // 转换数据保持和上面取值一致
    cinemaList = cinemaList.map(item => {
      return {
        ...item,
        name: item.cinema_name,
        id: item.cinema_id
      };
    });

    return {
      cinemaList
    };
  } catch (error) {
    console.error(conPrefix + "获取城市影院异常", error);
    return {
      error
    };
  }
};

// 获取电影放映列表
const getMoviePlayInfo = async ({ cinema_id, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      cinema_id: cinema_id
    };
    console.log(conPrefix + "获取电影放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log(conPrefix + "获取电影放映列表返回", res);
    let movieData = res.data?.film || [];
    // 转换数据保持和上面取值一致
    movieData = movieData.map(item => {
      return {
        ...item,
        movie_name: item.title
      };
    });
    return {
      movieData
    };
  } catch (error) {
    console.error(conPrefix + "获取电影放映列表异常", error);
    return {
      error
    };
  }
};

// 获取电影放映日期
const getMoviePlayDate = async ({ cinema_id, short_code, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      cinema_id,
      short_code
    };
    console.log(conPrefix + "获取电影放映日期参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayDate(params);
    console.log(conPrefix + "获取电影放映日期返回", res);
    let playDate = res.data || [];
    return {
      playDate
    };
  } catch (error) {
    console.error(conPrefix + "获取电影放映日期异常", error);
    return {
      error
    };
  }
};

// 获取座位布局
const getSeatLayout = async ({ cinema_id, show_id, lmaToken, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      cinema_id: cinema_id,
      session_id: show_id,
      lmaToken
    };
    console.log(conPrefix + "获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log(conPrefix + "获取座位布局返回", res);
    let seatData = res.data?.seat_arr || [];
    // 转换数据保持和上面取值一致，过滤出来可选座位
    seatData = seatData
      .map(item => item.column)
      .flat()
      .filter(item => item.is_seat === "1")
      .map(item => {
        return {
          ...item,
          seat_info: item.px + "排" + item.py + "号"
        };
      });
    console.log("seatData", seatData);
    return {
      seatData,
      label_arr: res.data?.label_arr || []
    };
  } catch (error) {
    console.error(conPrefix + "获取座位布局异常", error);
    return {
      error
    };
  }
};

// 获取会员卡列表
const getCardList = async ({ city_id, cinema_id, lmaToken, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id,
      cinema_id,
      lmaToken
    };
    console.log(conPrefix + "获取会员卡列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCardList(params);
    console.log(conPrefix + "获取会员卡列表返回", res);
    let cardList = res.data?.card_data || [];
    return {
      cardList
    };
  } catch (error) {
    console.error(conPrefix + "获取会员卡列表异常", error);
    return {
      error
    };
  }
};

// 获取优惠券列表
const getQuanList = async ({
  city_id,
  cinema_id,
  lmaToken,
  appFlag,
  firstFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      lmaToken,
      request_from: "1"
    };
    let quanList;
    if (firstFlag !== 1) {
      console.log(conPrefix + "获取优惠券列表参数", params);
      const res = await APP_API_OBJ[appFlag].getQuanList(params);
      console.log(conPrefix + "获取优惠券列表返回", res);
      quanList = res.data?.list || [];
    } else {
      delete params.request_from;
      params.status = "4";
      params.page = 1;
      const res = await APP_API_OBJ[appFlag].getQuanListByFirstUseQuan(params);
      console.log(conPrefix + "获取优惠券列表返回", res);
      quanList = res.data?.unused?.lists || [];
    }
    // let noUseLIst = ['1598162363509715', '1055968062906716', '1284460567801315', '1116166666409614']
    // 过滤掉不可用券
    // list = list.filter(item => item.coupon_num.indexOf("t") === -1);
    return {
      quanList
    };
  } catch (error) {
    console.error(conPrefix + "获取优惠券列表异常", error);
    return {
      error
    };
  }
};

// 计算订单价格
const priceCalculation = async ({
  city_id,
  cinema_id,
  show_id,
  seat_arr,
  card_id,
  quan_code,
  lmaToken,
  appFlag,
  member_coupon_id,
  coupon_id,
  order_str
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
    await mockDelay(1);
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      seat_arr,
      quan_code: "",
      card_id: "",
      additional_goods_info: "", // 附加商品信息
      goods_info: "", // 商品信息
      is_first: "0", // 是否是首次购买 0-不是 1-是
      option_goods_info: "", // 可选的额外商品信息
      update_time: getCurrentFormattedDateTime(),
      lmaToken
    };
    if (quan_code) {
      params.quan_code = quan_code; // 优惠券编码
    } else if (card_id) {
      params.card_id = card_id; // 会员卡id
    } else if (member_coupon_id) {
      params.member_coupon_id = member_coupon_id; // 会员卡赠送线下券id
    } else if (coupon_id) {
      // 会员卡赠送线上券id（线上券时还要必传card_id，而且创建订单接口也需要特殊处理）
      params.coupon_id = coupon_id;
    }
    console.log(conPrefix + "计算订单价格参数", params);
    const res = await APP_API_OBJ[appFlag].priceCalculation(params);
    console.log(conPrefix + "计算订单价格返回", res);
    let price = res.data?.price;
    return {
      price
    };
  } catch (error) {
    console.error(conPrefix + "计算订单价格异常", error);
    return {
      error,
      errMsg: "计算订单价格异常:" + JSON.stringify({ card_id, quan_code })
    };
  }
};

// 绑定券
const bandQuan = async ({ coupon_num, lmaToken, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    city_id: "304",
    cinema_id: "33",
    lmaToken,
    coupon_code: coupon_num,
    from_goods: "2"
  };
  try {
    await mockDelay(1);
    const res = await APP_API_OBJ[appFlag].bandQuan(params);
    // console.log("res", res);
    if (res.data?.success === "1") {
      return {
        coupon_num
      };
    } else {
      console.error(conPrefix + "绑定新券异常", res);
      return {
        errMsg: "绑定新券异常:" + JSON.stringify(res)
      };
    }
  } catch (error) {
    console.error(conPrefix + "绑定新券异常", error);
    return {
      error,
      errMsg: "绑定新券异常:" + JSON.stringify(params)
    };
  }
};

// 取消订单
const cannelOneOrder = async ({ order_str, appFlag, lmaToken }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      order_str,
      ...(lmaToken && { lmaToken })
    };
    console.log(conPrefix + "取消订单参数", params);
    const res = await APP_API_OBJ[appFlag].cannelOneOrder(params);
    console.log(conPrefix + "取消订单返回", res);
    return {
      cancelRes: res
    };
  } catch (error) {
    console.error(conPrefix + "取消订单异常", error);
    return {
      error
    };
  }
};

// 订单购买
const buyTicket = async ({
  city_id,
  cinema_id,
  order_num,
  pay_money,
  lmaToken,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id,
      cinema_id,
      open_id: APP_OPENID_OBJ[appFlag], // 微信openId
      order_num, // 订单号
      pay_money, // 支付金额
      pay_type: "", // 购买方式 传空意味着用优惠券或者会员卡
      lmaToken
    };
    console.log(conPrefix + "订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log(conPrefix + "订单购买返回", buyRes);
    return {
      buyRes
    };
  } catch (error) {
    console.error(conPrefix + "订单购买异常", error);
    return {
      error
    };
  }
};

// 确认接单
const startDeliver = async ({
  order_number,
  supplierCode,
  plat_name,
  bid,
  quote_id,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params;
    if (plat_name === "sheng") {
      params = {
        orderCode: order_number,
        supplierCode
      };
    } else if (plat_name === "haha") {
      params = {
        bid
      };
    } else if (plat_name === "yinghuasuan") {
      params = {
        quote_id
      };
    }
    console.log(conPrefix + "确认接单参数", params);
    const res = await PLAT_API_OBJ[plat_name].confirmOrder(params);
    console.log(conPrefix + "确认接单返回", res);
    return res;
  } catch (error) {
    console.warn("确认接单异常", error);
  }
};

// 添加订单处理记录
const addOrderHandleRecored = async ({
  ticketRes: res,
  order,
  appFlag,
  errMsg,
  errInfo,
  mobile
}) => {
  try {
    // res：{ profit, submitRes, qrcode, quan_code, card_id, offerRule }
    let order_status = res?.submitRes ? "1" : "2";
    if (res?.offerRule?.rule_status === "3") {
      order_status = "4";
    }
    const serOrderInfo = {
      plat_name: order.plat_name,
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
      // cinema_code: order.cinema_code,
      // offer_amount: res?.offerRule?.offer_amount || "",
      // member_offer_amount: res?.offerRule?.member_offer_amount || "",
      quan_value: res?.offerRule?.quan_value || "",
      order_status: order_status,
      // remark: '',
      processing_time: getCurrentFormattedDateTime(),
      profit: res?.profit || "",
      qrcode: res?.qrcode || "",
      quan_code: res?.quan_code || "",
      card_id: res?.card_id || "",
      err_msg: res?.submitRes ? "" : errMsg || "",
      err_info: res?.submitRes ? "" : errInfo || "",
      rewards: res?.offerRule?.rewards || 0, // 奖励百分比
      transfer_fee: res?.transferParams?.transfer_fee || "", // 转单手续费
      mobile: mobile || "", // 出票手机号
      rule: tokens.userInfo.rule || 2
    };

    await svApi.addTicketRecord(serOrderInfo);
    if (serOrderInfo.card_id && serOrderInfo.order_status === "1") {
      updateCardDayUse({
        app_name: serOrderInfo.app_name,
        card_id: serOrderInfo.card_id,
        plat_name: serOrderInfo.plat_name,
        order_number: serOrderInfo.order_number
      });
    }
  } catch (error) {
    console.error("添加订单处理记录异常", error);
  }
};

// 更新卡当天使用量
const updateCardDayUse = ({ app_name, card_id, plat_name, order_number }) => {
  let error;
  try {
    svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id
    });
  } catch (err) {
    error = err;
  }

  let log_list = [
    {
      opera_time: getCurrentFormattedDateTime(),
      des: `订单用卡出票成功后更新当天使用量`,
      level: "info",
      info: {
        app_name,
        card_id,
        error
      }
    }
  ];
  logUpload(
    {
      plat_name: plat_name,
      app_name: app_name,
      order_number: order_number,
      type: 3
    },
    log_list
  );
};
export default createTicketQueue;
