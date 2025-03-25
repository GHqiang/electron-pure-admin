import {
  getCurrentTime,
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
  getCurrentDay,
  isDateInCurrentMonth,
  findMostRepeatedChars
} from "@/utils/utils";

import svApi from "@/api/sv-api";
import { encode } from "@/utils/sfc-member-password";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
// 影院特殊匹配列表及api
import {
  TICKET_CONPREFIX_OBJ,
  GE_APP_INFO,
  TEST_NEW_PLAT_LIST,
  sfcV3AppList,
  GET_APP_TYPE_LIST
} from "@/common/constant";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.cityList = []; // 城市列表
    this.appFlag = appFlag; // 影线标识
    this.conPrefix = TICKET_CONPREFIX_OBJ[appFlag]; // 打印前缀
    this.sfcApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.logList = []; // 操作运行日志
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isV3App = sfcV3AppList.includes(appFlag);
    this.isStart = false; // 是否启动
    this.usableCardList = []; // 会员可用卡列表（库里维护的）

    // 监听新订单
    window.addEventListener(this.eventName, this.handleNewOrder.bind(this));
  }

  // 启动队列
  async start() {
    const { conPrefix } = this;
    this.prevOrderNumber = "";
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    this.handledOrders = new Map();
    this.isStart = true; // 是否启动
    console.warn(conPrefix + "队列启动，开始监听是否有新订单");
  }

  // 测试新订单
  testSendNewOrder(order) {
    const { appFlag } = this;
    isTestOrder = true;
    let newOrder = order || {
      id: 761,
      plat_name: "lieren",
      app_name: "hbchyxd",
      ticket_num: 1,
      rewards: "0",
      offer_type: "2",
      order_number: "2024071012402352191",
      // cinema_code: '', // 影院id
      // supplierCode: 'ccf7b11cdc944cf1940a149cff4243f9', // 商户号
      supplier_end_price: 35.5,
      // quan_value: "35",
      member_price: 34.2, // 成本价
      real_member_price: 38, // 真实会员价
      order_id: "6418878",
      tpp_price: "44.00",
      city_name: "厦门",
      cinema_addr: "鄞州区中山东路1083号世纪东方广场三楼",
      cinema_name: "厦门华谊兄弟电影中心",
      hall_name: "1号DTS:X临境音+激光厅",
      film_name: "志愿军：存亡之战",
      lockseat: "8排12座",
      show_time: "2024-10-21 19:00:00",
      cinema_group: "华谊兄弟"
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
    const { appFlag, conPrefix, isStart } = this;
    if (!isStart) return;
    const order = event.detail;
    // 检查是否已经处理过此订单
    if (this.handledOrders.has(order.plat_name + "_" + order.order_number)) {
      console.warn(conPrefix + "订单已被处理过，忽略重复消息", order);
      let logList = [
        {
          opera_time: getCurrentTime(),
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
        opera_time: getCurrentTime(),
        des: "自动出票队列获取到新的待出票订单",
        level: "info",
        info: {
          newOrders: order,
          sjc: +new Date()
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
              opera_time: getCurrentTime(),
              des: "当前订单重复执行,直接执行下个",
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
          // res: { profit, submitRes, qrcode, quan_code, card_id, cardNum, offerRule } || undefined
          console.warn(
            conPrefix + `单个订单自动出票${res?.submitRes ? "成功" : "失败"}`,
            order,
            res
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}`,
            level: "info",
            info: {
              res
            }
          });
          if (!isTestOrder) {
            let errMsg = "",
              errInfo = "";
            if (!res?.submitRes) {
              const errInfoObj = this.logList
                .filter(item => item.level === "error")
                .reverse()?.[0];
              errMsg = errInfoObj?.des || "";
              errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
            }

            let params = {
              order,
              ticketRes: res,
              appFlag,
              errMsg: errMsg,
              errInfo: errInfo,
              mobile: this.currentParamsList[this.currentParamsInx].mobile
            };
            await addOrderHandleRecored(params);
            this.logList.push({
              opera_time: getCurrentTime(),
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
      this.logList.push({
        opera_time: getCurrentTime(),
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
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, cardNum, quanType, offerRule }
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
    this.isStart = false;
    console.warn(conPrefix + "自动出票队列停止");
  }

  // 释放座位 flag: 1-转单，2换号
  async releaseSeat(unlockSeatInfo, flag) {
    const { conPrefix, appFlag } = this;
    const {
      city_id,
      cinema_id,
      show_id,
      start_day,
      start_time,
      session_id,
      order_num
    } = unlockSeatInfo;
    try {
      if (!order_num) {
        const seatDataRes = await getSeatLayout({
          city_id,
          cinema_id,
          show_id,
          session_id,
          appFlag
        });
        let errFlag = ["正常出票", "转单释放座位时", "换号出票释放座位时"][
          flag
        ];
        let seatList = seatDataRes?.seatData || [];
        if (!seatList?.length) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `${errFlag}-获取座位布局异常`,
            level: "error",
            info: {
              error: seatDataRes?.error
            }
          });
          return {
            isSuccess: false,
            error: seatDataRes?.error
          };
        }
        let availableSeatList = seatList.filter(item => item[2] === "0"); // 1表示已售
        let seat_ids = availableSeatList.map(item => item[0])?.[0]; // 第0个代表座位id
        if (!seat_ids) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `${errFlag}-获取未售座位为空`,
            level: "error",
            info: {
              seatList
            }
          });
          return {
            isSuccess: false,
            error: "获取未售座位为空"
          };
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
        await this.lockSeatHandle(lockParams); // 锁定座位
        // this.currentParamsList[this.currentParamsInx].releaseStatus = 1;
        return {
          isSuccess: true
        };
      } else {
        // 取消订单
        await this.cancelOrder(unlockSeatInfo);
        return {
          isSuccess: true
        };
      }
    } catch (error) {
      console.warn("释放座位失败", error);
      let errFlag = ["正常出票", "转单", "换号出票"][flag];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `${errFlag}-取消订单释放座位异常`,
        level: "error",
        info: {
          error
        }
      });
      return {
        isSuccess: false,
        error
      };
    }
  }
  // 取消订单
  async cancelOrder(unlockSeatInfo) {
    let { city_id, cinema_id, order_num, session_id } = unlockSeatInfo || {};
    let params = {
      cinema_id,
      city_id,
      client_id: "",
      id: order_num,
      session_id
    };
    try {
      console.log("取消订单参数", params);
      const res = await this.sfcApi.lockSeat(params);
      console.log("取消订单返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "取消订单返回",
        level: "info",
        info: {
          res,
          params
        }
      });
      return res;
    } catch (error) {
      console.error("取消订单返回异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "取消订单返回异常",
        level: "error",
        info: {
          error,
          params
        }
      });
      return Promise.reject(error);
    }
  }
  // 转单
  async transferOrder(order, unlockSeatInfo) {
    const { conPrefix } = this;
    const errInfoObj = this.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
    const { plat_name } = order;
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");
    const {
      order_number,
      city_name,
      show_time,
      cinema_name,
      film_name,
      lockseat
    } = order;
    // 关闭自动转单只针对座位异常生效
    // if (isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    let isTransferOrder = true;
    if (isTestOrder || isAutoTransfer !== "1") {
      console.warn("自动转单处于关闭状态");
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "自动转单处于关闭状态，只取消订单释放座位",
        level: "info"
      });
      isTransferOrder = false;
    }
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      let session_id = this.currentParamsList[this.currentParamsInx].session_id;
      // 3、获取座位布局
      if (unlockSeatInfo) {
        const { isSuccess, error } = await this.releaseSeat(
          { ...unlockSeatInfo, session_id },
          1
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `转单前释放座位${isSuccess ? "成功" : "失败"}`,
          level: "info"
        });
        if (!isSuccess) {
          sendWxPusherMessage({
            plat_name,
            order_number,
            city_name,
            cinema_name,
            film_name,
            show_time,
            lockseat,
            hall_name: order.hall_name,
            supplier_end_price: order.supplier_end_price,
            transferTip:
              "取消订单释放座位失败，建议先手动取消订单，以便后续订单正常出票",
            failReason: `${JSON.stringify(error)}`
          });
        }
      }
      if (!isTransferOrder) {
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name,
          cinema_name,
          film_name,
          show_time,
          lockseat,
          hall_name: order.hall_name,
          supplier_end_price: order.supplier_end_price,
          transferTip:
            "自动转单处于关闭状态,仅取消订单释放座位,需适时手动出票或者转单",
          failReason: `${errMsg}——${errInfo}`
        });
        return;
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
          supplierCode: order.supplierCode,
          reason: "价格过低无法出票"
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
        opera_time: getCurrentTime(),
        des: "转单成功",
        level: "info",
        info: {
          res
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
        hall_name: order.hall_name,
        supplier_end_price: order.supplier_end_price,
        transferTip: "自动转单处于开启状态,已转单无需处理",
        failReason: `${errMsg}——${errInfo}`
      });
      let { supplier_end_price, tpp_price, ticket_num } = order;
      // 洋葱转单是原价的百分之三
      if (["yangcong"].includes(plat_name) && tpp_price) {
        supplier_end_price = tpp_price;
      }
      let transfer_fee = 0; // 蚂蚁转单扣积分
      if (plat_name != "mayi") {
        transfer_fee = (
          (Number(supplier_end_price) * 100 * Number(ticket_num) * 3) /
          10000
        ).toFixed(2);
      }
      let transferParams = {
        transfer_fee // 转单手续费
      };
      console.warn(conPrefix + "【转单】手续费", transfer_fee);
      return transferParams;
    } catch (error) {
      console.error(conPrefix + "【转单】异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `转单原因-${errMsg}——${errInfo}`,
        level: "info"
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "转单异常",
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
        hall_name: order.hall_name,
        supplier_end_price: order.supplier_end_price,
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
    let targetLoginList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );

    this.currentParamsList = targetLoginList.sort((a, b) => {
      // 优先按 first 字段排序
      if (a.first === "1" && b.first !== "1") return -1;
      if (a.first !== "1" && b.first === "1") return 1;

      // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
      if (a.first === "1" && b.first === "1") {
        // 如果 a.mobile 是当前用户的手机号，则 a 应该排在 b 之前
        if (a.mobile === phone) return -1;
        // 如果 b.mobile 是当前用户的手机号，则 b 应该排在 a 之前
        if (b.mobile === phone) return 1;
        // 如果两个对象的 mobile 都不是当前用户的手机号，则按默认顺序排列
        return 0;
      }

      // 如果 first 都不是 '1'，则按 mobile 字段排序
      if (a.mobile === phone) return -1;
      if (b.mobile === phone) return 1;

      // 如果两个对象的 first 和 mobile 都相同，则按默认顺序排列
      return 0;
    });
    this.logList.push({
      opera_time: getCurrentTime(),
      des: "获取该影院登录信息返回",
      level: "info",
      info: {
        targetLoginList,
        currentParamsList: this.currentParamsList
      }
    });
    this.currentParamsInx = 0;
    let offerRule;
    try {
      // 1、获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: user_id,
        order_status: "1",
        app_name: appFlag,
        order_number,
        plat_name
      });
      offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
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
      offerRule = {
        offer_type: "2",
        member_price: "34.2",
        real_member_price: 38
      };
    }
    console.warn(conPrefix + "从该订单的报价记录获取到的报价规则", offerRule);
    if (
      !offerRule ||
      offerRule?.rule_status === "3" ||
      offerRule?.quan_value === "jinbaojia"
    ) {
      let str = "获取该订单报价记录失败，微信通知手动出票";
      if (offerRule?.rule_status === "3") {
        str = "该订单报价规则为仅报价，需手动出票";
      } else if (offerRule?.quan_value === "jinbaojia") {
        str = "该订单报价规则用券类型为仅报价券，需手动出票";
      }
      console.error(conPrefix + str, offerRule);
      this.logList.push({
        opera_time: getCurrentTime(),
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
        hall_name: item.hall_name,
        supplier_end_price: item.supplier_end_price,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return {
        offerRule
      };
    }
    this.logList.push({
      opera_time: getCurrentTime(),
      des: "获取该订单报价记录成功",
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
          if (deliverRes?.error) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "确认接单返回异常",
              level: "error",
              info: {
                error: deliverRes.error
              }
            });
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
          this.logList.push({
            opera_time: getCurrentTime(),
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
          if (deliverRes?.error) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "确认接单返回异常",
              level: "error",
              info: {
                error: deliverRes.error
              }
            });
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
          this.logList.push({
            opera_time: getCurrentTime(),
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
        //   opera_time: getCurrentTime(),
        //   des: "订单首次解锁座位完成",
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
        opera_time: getCurrentTime(),
        des: "订单首次解锁失败试错后解锁成功",
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
      // result: { profit, submitRes, qrcode, quan_code, card_id, quanType, offerRule } || undefined
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
    supplierCode
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
          opera_time: getCurrentTime(),
          des: "解锁座位参数",
          level: "info",
          info: {
            params
          }
        });
      }

      const res = await PLAT_API_OBJ[plat_name].unlockSeat(params);
      console.log(conPrefix + "解锁返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
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
          opera_time: getCurrentTime(),
          des: `第${inx}次解锁座位发现已解锁`,
          level: "info",
          info: {
            error
          }
        });
        return;
      }
      // 芒果座位会未锁从而无需解锁
      if (
        (error?.msg || error?.message || "").includes(
          "该座位未锁座成功，故无法解锁"
        )
      ) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次解锁座位发现座位无需解锁`,
          level: "info",
          info: {
            error
          }
        });
        return;
      }
      // 哈哈偶尔会这样
      if (error?.msg === "当前订单座位没有被锁") {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次解锁座位发现座位没有被锁`,
          level: "info",
          info: {
            error
          }
        });
        return;
      }
      console.error(conPrefix + "解锁异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次解锁座位失败`,
        level: "error",
        info: {
          error
        }
      });
      return Promise.reject(error);
    }
  }

  // 一键买票逻辑
  async oneClickBuyTicket(item) {
    const { conPrefix, appFlag, isV3App } = this;
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
        show_id,
        seat_ids,
        start_day,
        start_time
      } = otherParams || {};
      // 如果待出票订单里没有就去报价记录里拿
      if (!rewards || Number(rewards) == 0) {
        rewards = offerRule?.rewards || 0;
      }
      console.log("this.currentParamsInx开始", this.currentParamsInx);
      if (this.currentParamsInx === 0) {
        // 2、获取城市列表
        const cityListRes = await getCityList({ appFlag });
        this.cityList = cityListRes?.cityList || [];
        if (!this.cityList?.length) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取城市列表异常",
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
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取城市影院列表异常",
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
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取目标影院失败",
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
        if (cinema_id && offerRule.offer_type != 1) {
          const usableCards = await this.getUsableCardList(
            cinema_id,
            ticket_num
          );
          if (usableCards?.length) {
            this.usableCardList = usableCards;
            let cardLinkMobile = usableCards.map(item => item.mobile);
            this.currentParamsList = this.currentParamsList.sort((a, b) => {
              if (
                cardLinkMobile.includes(a.mobile) &&
                !cardLinkMobile.includes(b.mobile)
              ) {
                return -1; // a靠前
              }
              if (
                !cardLinkMobile.includes(a.mobile) &&
                cardLinkMobile.includes(b.mobile)
              ) {
                return 1;
              }
              return 0;
            });
          }
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "登录信息按照可用卡列表排序后",
            level: "info",
            info: {
              currentParamsList: this.currentParamsList
            }
          });
        }
        const phone = this.currentParamsList[0].mobile;
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `首次出票手机号-${phone}`,
          level: "info",
          info: {
            currentParamsList: this.currentParamsList
          }
        });
        this.curPhone = phone;
        // 5、获取目标影院放映列表
        const movieDataRes = await getMoviePlayInfo({
          city_id,
          cinema_id,
          appFlag
        });
        let movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logList.push({
            opera_time: getCurrentTime(),
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
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "影院放映信息匹配订单影片名称失败",
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
        // 解决同一时间多场次问题
        let targetShowList = showList.filter(
          item => item.start_time === start_time
        );
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hall_name,
              hall_name
            );
            return {
              ...item,
              ...repeatedCharsResult
            };
          });
          targetShowList = targetShowList.sort(
            (a, b) => b.similarity - a.similarity
          );
          targetShow = targetShowList[0];
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "同一时间多场次",
            level: "info",
            info: {
              targetShowList
            }
          });
        }
        if (!targetShow) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "匹配影片放映场次失败",
            level: "error",
            info: {
              showList,
              start_time
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "出票时获取电影放映信息",
          level: "info",
          info: {
            targetShow
          }
        });
        show_id = targetShow.show_id;
        let sessionId =
          this.currentParamsList[this.currentParamsInx].session_id;
        // 3、获取座位布局
        const seatDataRes = await getSeatLayout({
          city_id,
          cinema_id,
          show_id,
          session_id: sessionId,
          appFlag
        });
        let seatList = seatDataRes?.seatData || [];
        if (!seatList?.length) {
          console.error(conPrefix + "获取座位布局异常");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取座位布局异常",
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
        let targetList = seatList.filter(item =>
          selectSeatList.includes(item[5])
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "目标座位相关信息",
          level: "info",
          info: {
            targetList
          }
        });
        console.log(conPrefix + "targetList", targetList);
        if (targetList?.length != ticket_num) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取目标座位失败",
            level: "error",
            info: {
              targetList,
              ticket_num
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        seat_ids = targetList.map(item => item[0]).join();
      } else {
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logList.push({
          opera_time: getCurrentTime(),
          des: `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          level: "info",
          info: {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        });
        this.curPhone = phone;
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
          des: `上个号准备释放座位token-${currentParams.session_id}`,
          level: "info"
        });
        const { isSuccess, error } = await this.releaseSeat(unlockSeatInfo, 2);
        if (!isSuccess) {
          if (this.currentParamsInx === this.currentParamsList.length - 1) {
            console.error(conPrefix + "换号结束还是失败", "走转单逻辑");
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "换号结束还是失败，走转单",
              level: "info",
              info: {
                error
              }
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
          des: "上个号释放座位成功",
          level: "info"
        });
      }
      // 4、锁定座位
      let params = {
        order_id,
        plat_name,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      };
      try {
        await this.lockSeatHandle(params); // 锁定座位
      } catch (error) {
        console.error(conPrefix + "锁定座位失败准备试错2次，间隔5秒", error);
        // 试错3次，间隔5秒
        // 锁定座位尝试配置
        let delayConfig = {
          lieren: [6, 5],
          mangguo: [6, 5],
          sheng: [6, 5],
          mayi: [10, 5],
          yangcong: [10, 5],
          haha: [6, 5],
          yinghuasuan: [6, 5],
          shangzhan: [6, 5]
        };
        const res = await trial(
          inx => this.lockSeatHandle(params, inx),
          delayConfig[plat_name][0],
          delayConfig[plat_name][1],
          conPrefix
        );
        if (!res) {
          console.error(
            conPrefix + "单个订单试错后仍锁定座位失败",
            "需要走转单逻辑"
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "首次锁定座位失败轮询尝试后仍失败，走转单",
            level: "info"
          });
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "首次锁定座位失败试错后锁定成功",
          level: "info"
        });
      }
      // 5、使用优惠券或者会员卡
      // 会员卡出票：只传card_id（卡id字段）
      // 线上券出票：传card_id（卡id字段）和coupon_id（券id字段逗号拼接）
      // 线下券出票：赠送类(券card_num有值)传member_coupon_id（券id字段逗号拼接），非赠送类传quan_code（券coupon_num字段逗号拼接）
      let {
        card_id,
        cardNum,
        quanType,
        quan_code,
        coupon_id,
        member_coupon_id,
        profit,
        priceInfo
      } = await this.useQuanOrCard({
        order_number,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        rewards,
        offerRule,
        plat_name
      });
      if (!card_id && !quan_code && !member_coupon_id && !coupon_id) {
        console.log("this.currentParamsInx", this.currentParamsInx);
        console.log("this.currentParamsList", this.currentParamsList);
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        let str = "无可用会员卡";
        if (offerRule.offer_type === "1") {
          str = "无可用优惠券";
        }
        if (errMsg) {
          str = str + "-" + errMsg;
        }
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(conPrefix + str, "走转单逻辑");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: str,
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
            opera_time: getCurrentTime(),
            des: "非最后一次用卡用券失败，走换号",
            level: "info"
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
        des: "使用优惠券或者会员卡成功",
        level: "info",
        info: {
          card_id,
          quanType,
          quan_code,
          coupon_id,
          member_coupon_id,
          profit
        }
      });
      // 6计算订单价格
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { session_id } = currentParams;
      // 如果使用会员卡计算时已经拿到价格信息，就不再重复获取（解决间隔短调用频繁有时直接返回本卡不可用或者其它问题）
      if (!priceInfo) {
        const priceRes = await this.priceCalculation({
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          card_id,
          quan_code,
          member_coupon_id,
          coupon_id,
          session_id,
          appFlag
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "使用优惠券或会员卡后计算订单价格返回",
          level: "info",
          info: {
            ...priceRes
          }
        });
        priceInfo = priceRes?.price;
        if (priceRes?.error) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "使用优惠券或会员卡后计算订单价格异常",
            level: "error",
            info: {
              error: priceRes?.error
            }
          });
        }
      }
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix +
              "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
            "走转单逻辑"
          );
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
            des: "非最后一次创建订单前计算价格失败，走换号",
            level: "info"
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
      // 促销活动id
      let promo_id = priceInfo?.promo_id || "0";
      let payType = "online";
      // 参考源码逻辑，只有计算价格返回的有默认卡时才需要根据cardPay这个标识在创建订单接口传卡号和密码
      if (priceInfo?.default_card) {
        payType = "cardPay";
      }
      let pay_money = Number(priceInfo.total_price); // 此处是为了将订单价格30.00转为30，将0.00转为0
      console.log(conPrefix + "订单最后价格", pay_money, priceInfo);
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (offerRule.offer_type === "1" && pay_money > quan_fee_total) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "用完券发现支付金额大于券手续费*票数，走转单",
          level: "error",
          info: {
            pay_money,
            quan_fee_total,
            ticket_num,
            quan_fee
          }
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
      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (pay_money > real_member_price) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "用完卡发现支付金额大于会员价*票数，走转单",
            level: "error",
            info: {
              pay_money,
              real_member_price,
              ticket_num
            }
          });
          const transferParams = await this.transferOrder(item, {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time
          });
          return { offerRule, transferParams };
        } else if (pay_money < real_member_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_price * 1000 - pay_money * 1000) * member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单前计算订单价格成功",
        level: "info"
      });
      // 7、创建订单
      const order_num = await this.createOrder({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id,
        coupon: quan_code,
        quan_flag: offerRule.quan_flag,
        plat_name,
        order_number,
        member_coupon_id,
        coupon_id,
        promo_id,
        seat_info: lockseat.replaceAll(" ", ",").replaceAll("座", "号"),
        pay_money,
        payType
      });
      if (!order_num) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            conPrefix + "创建订单失败，单个订单直接出票结束",
            "走转单逻辑"
          );
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
            des: "非最后一次创建订单失败，走换号",
            level: "info"
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
        des: "创建订单成功",
        level: "info"
      });
      if (isTestOrder) {
        return { offerRule };
      }
      let currentParamsInfo = this.currentParamsList[this.currentParamsInx];
      // 不知道咋解密的，暂时抓包写死，每个手机号一个
      let passObj = {
        13073792313: "5e5d04e81d9394f5b446f4a80782b77f",
        13937705167: "b6737175e5b56420df0b5b22e3b72c63",
        13539815664: "562a03e43f82dfe0c9a7a951ea639005"
      };
      let pay_password = passObj[currentParamsInfo.mobile];
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        city_id,
        cinema_id,
        order_num,
        pay_money,
        session_id: currentParamsInfo.session_id,
        appFlag,
        offer_type: offerRule.offer_type,
        isV3App,
        card_id,
        pay_password
      });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        console.error(
          conPrefix + "订单购买失败，单个订单直接出票结束",
          "走转单逻辑"
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单购买失败，单个订单直接出票结束",
          level: "error",
          info: {
            ...buyTicketRes
          }
        });
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        const transferParams = await this.transferOrder(item, {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time,
          order_num
        });
        return { offerRule, transferParams };
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "订单购买返回",
        level: "info",
        info: {
          ...buyTicketRes
        }
      });
      // 只用卡
      let isOnlyUseCard = card_id && !quanType;
      if (offerRule.offer_type !== "1" && isOnlyUseCard) {
        // 更新卡使用量
        updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number
        });
      }
      // 更新非入库券的券库存
      if (offerRule.offer_type === "1" && offerRule.is_store != 1) {
        this.updateQuanStock({
          ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.curPhone,
          isPay: 1
        });
      }

      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.lastHandle({
        city_id,
        cinema_id,
        order_num,
        order_id,
        app_name: appFlag,
        card_id: isOnlyUseCard ? card_id : undefined,
        order_number,
        supplierCode,
        plat_name,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        orderInfo: item,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单最后处理成功:获取取票码并上传",
          level: "info"
        });
      }
      console.log(conPrefix + "一键买票完成");
      if (!quan_code && quanType) {
        quan_code = coupon_id || member_coupon_id;
      }
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code,
        card_id,
        cardNum,
        quanType,
        offerRule
      };
    } catch (error) {
      console.error(conPrefix + "一键买票异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "一键买票异常",
        level: "error",
        info: {
          error
        }
      });
      try {
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name,
          cinema_name,
          film_name,
          show_time,
          lockseat,
          hall_name: item.hall_name,
          supplier_end_price: item.supplier_end_price,
          transferTip: "一键买票异常，请及时联系技术",
          failReason: JSON.stringify(error)
        });
      } catch (error) {}

      return { offerRule };
    }
  }

  // 锁定座位
  async lockSeatHandle(data, inx = 1) {
    const { conPrefix } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      start_day,
      start_time,
      session_id
    } = data || {};
    try {
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
      if (inx == 1) {
        this.logList.push({
          opera_time: getCurrentTime(),
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
        opera_time: getCurrentTime(),
        des: `第${inx}次锁定座位成功`,
        level: "info",
        info: {
          res
        }
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "锁定座位异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
    const { conPrefix, appFlag, isV3App } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      ticket_num,
      supplier_end_price,
      offerRule,
      rewards,
      plat_name,
      order_number
    } = params;
    try {
      const {
        offer_type,
        member_price, // 成本价
        real_member_price,
        offer_rule_id
      } = offerRule;
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { session_id, mobile } = currentParams;
      // 用卡处理参数
      const useCardParams = {
        ...params,
        session_id,
        member_price, // 成本价
        real_member_price,
        mobile
      };
      let is_auto_use_quan = false; // 是否灵活用券
      let quanStock; // 券库存数
      // 拿订单号去匹配报价记录
      if (offer_type !== "1") {
        const ruleInfo = getOfferRuleById(offer_rule_id);
        if (ruleInfo) {
          const { autoUseQuanStatus, autoUseQuanPrice, auto_quan_value } =
            ruleInfo;
          if (
            autoUseQuanStatus === "1" &&
            supplier_end_price > autoUseQuanPrice &&
            auto_quan_value
          ) {
            // 先进行灵活用券处理，失败后仍用会员卡出票
            is_auto_use_quan = true;
            offerRule.quan_value = auto_quan_value;
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "灵活用券条件生效，重置报价规则里的券类型为灵活用券类型",
              level: "info",
              info: {
                autoUseQuanStatus,
                supplier_end_price,
                autoUseQuanPrice,
                auto_quan_value
              }
            });
          }
        }
        if (!is_auto_use_quan) {
          console.log(conPrefix + "使用会员卡出票");
          console.log(conPrefix + "报价记录里的会员价", real_member_price);
          if (!real_member_price) {
            console.warn(
              conPrefix + "使用优惠券或者会员卡前获取会员价异常",
              real_member_price
            );
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "使用会员卡前从该订单报价记录里获取会员价异常",
              level: "error"
            });
            return {
              card_id: "",
              profit: 0 // 利润
            };
          }
          // 返回用卡结果
          return await this.useCardHandle(useCardParams);
        }
      }

      if (offerRule.offer_type === "1" || is_auto_use_quan) {
        console.log(conPrefix + "使用优惠券出票");
        const quanInfo = await this.getQuanInfo(offerRule.quan_value, appFlag);
        offerRule.quan_id = quanInfo?.id;
        offerRule.quan_cost = quanInfo?.quan_cost;
        offerRule.quan_flag = quanInfo?.quan_flag;
        offerRule.quan_fee = quanInfo?.quan_fee;
        offerRule.is_store = quanInfo?.is_store;
        offerRule.black_quans = quanInfo?.black_quans;
        offerRule.quanStockList = quanInfo?.quanStockList;
        let {
          quan_value,
          quan_cost,
          quan_flag,
          quan_fee,
          is_store,
          black_quans
        } = offerRule;
        // 1、获取优惠券列表
        let getQuanLogList = [];
        const quanListRes = await getQuanList({
          city_id,
          cinema_id,
          session_id,
          quan_value,
          ticket_num,
          appFlag,
          quan_flag,
          black_quans,
          logList: getQuanLogList
        });
        // 拿到获取券列表方法内的日志记录
        this.logList.push(...getQuanLogList);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取优惠券列表返回",
          level: "info",
          info: {
            quanListRes
          }
        });
        // 这里拿到的券列表会比票数多10张
        let quanList = quanListRes?.quanList || [];
        let quanType = quanListRes?.quanType;
        quanStock = quanList.length || 0; // 默认用查出来的券库存（可能会比实际的少）
        if (!quanList?.length) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "个人中心获取目标券列表返回为空",
            level: "error"
          });
        }
        if (is_store == "1") {
          if (quanList?.length < ticket_num) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "用券前个人中心目标券不够，从服务端获取",
              level: "info"
            });
            let diffNum = Number(ticket_num) - quanList.length;
            const newQuanRes = await this.getNewQuan({
              city_id,
              cinema_id,
              quan_value: offerRule.quan_value,
              quan_flag: offerRule.quan_flag,
              session_id,
              black_quans,
              diffNum,
              quanNum: diffNum + 10,
              ticket_num
            });
            // 新绑定的权属：diffNum
            const newQuanList = newQuanRes?.bandQuanList || [];
            // 从服务端查出来的券数，<= diffNum + 10
            quanList = [...quanList, ...newQuanList];
            quanStock = quanList.length;
            // 多查询几张绑定防止有绑券异常导致出票失败情况
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "从服务端获取券绑定完成",
              level: "info",
              info: {
                newQuanList,
                quanStock,
                ticket_num
              }
            });
          } else {
            let quanStockList = offerRule.quanStockList
              ? JSON.parse(offerRule.quanStockList)
              : [];
            let targetInfo = quanStockList.find(
              itemA => itemA.phone === this.curPhone
            );
            // 由于上面一开始拿到的quanStock可能比实际的少，所以优先用库里面的值
            quanStock = targetInfo?.quan_stock || quanStock;
          }
          // 更新入库券的本地已绑定的券库存
          this.updateQuanStock({
            quan_stock:
              quanStock < ticket_num ? quanStock : quanStock - ticket_num, // 直接传过去券库存
            quan_value: offerRule.quan_value,
            quan_flag: offerRule.quan_flag,
            app_name: appFlag,
            phone: this.curPhone
          });
        }
        if (quanList?.length < ticket_num) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `目标券${is_store == "1" ? "从服务端获取后" : ""}数量不足`,
            level: "error"
          });
          if (is_auto_use_quan) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "灵活用券时获取目标券不足,转用卡处理",
              level: "info"
            });
            offerRule.quan_value = "";
            // 返回用卡结果
            return await this.useCardHandle(useCardParams);
          }
          return {};
        }
        const { coupon_type, card_num } = quanList?.[0] || {};
        if (coupon_type) {
          quanType = card_num ? "online_member_quan" : "online_quan";
        } else {
          quanType = card_num ? "offline_member_quan" : "offline_quan";
        }
        let card_id, quan_code, coupon_id, member_coupon_id;
        if (quanType === "online-quan" || quan_fee > 0) {
          const cardList = await this.getCardList({
            city_id,
            cinema_id,
            session_id
          });
          if (cardList?.length) {
            let cardData = cardList.filter(
              item => item.balance * 100 >= quan_fee * 100 * ticket_num
            );
            if (!cardData?.length) {
              this.logList.push({
                opera_time: getCurrentTime(),
                des: `使用优惠券前发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
                level: "error",
                info: {
                  quan_fee,
                  ticket_num,
                  cardList
                }
              });
              if (is_auto_use_quan) {
                offerRule.quan_value = "";
                return await this.useCardHandle(useCardParms);
              }
              return {
                card_id: "",
                profit: 0 // 利润
              };
            }
            // 按余额倒序取最大余额的卡id（用券时这个card_id需要再看看是否这样取）
            let cards = cardList.sort((a, b) => b.balance - a.balance);
            // if (appFlag === "nanugojgh") {
            //   cards = cards.filter(item => item.cinema_id === cinema_id);
            // }
            card_id = !isV3App ? cards[0]?.id : cards[0]?.member_id;
          }
        }
        // 2、使用优惠券
        const { useQuans, profit } = await this.useQuan({
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          ticket_num,
          supplier_end_price,
          quanList,
          quan_value,
          quan_flag,
          rewards,
          session_id,
          black_quans,
          plat_name,
          order_number,
          quan_cost,
          quanStock,
          is_store
        });
        if (!useQuans.length && is_auto_use_quan) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "灵活用券使用目标券后为空,转用卡处理",
            level: "info"
          });
          offerRule.quan_value = "";
          // 返回用卡结果
          return await this.useCardHandle(useCardParams);
        }
        // 单纯用券场景只支持这两种渠道券，赠券全部走优先用券逻辑
        if (quanType === "offline_quan") {
          quan_code = useQuans.map(item => item.coupon_num).join();
        } else if (["online_quan", "online_member_quan"].includes(quanType)) {
          coupon_id = useQuans.map(item => item.id).join();
        } else if (quanType === "offline_member_quan") {
          // 线下
          member_coupon_id = useQuans.map(item => item.id).join();
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          quan_code,
          card_id,
          coupon_id,
          member_coupon_id,
          quanType,
          profit // 利润
        };
      }
    } catch (error) {
      console.error(conPrefix + "使用优惠券或者会员卡异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用优惠券或者会员卡异常",
        level: "error",
        info: {
          error
        }
      });
      return {
        card_id: "",
        quan_code: "",
        profit: 0 // 利润
      };
    }
  }

  // 会员用卡处理
  async useCardHandle(data) {
    const {
      city_id,
      cinema_id,
      session_id,
      supplier_end_price,
      ticket_num,
      show_id,
      seat_ids,
      member_price, // 成本价
      real_member_price,
      rewards,
      mobile,
      plat_name
    } = data;
    const { appFlag } = this;
    try {
      // 1、获取会员卡列表
      const cardList = await this.getCardList({
        city_id,
        cinema_id,
        session_id
      });
      if (!cardList?.length) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员卡列表为空",
          level: "error"
        });
        return {
          card_id: "",
          profit: 0 // 利润
        };
      }
      // 2、使用会员卡
      let member_total_price = (real_member_price * 100 * ticket_num) / 100;
      const { card_id, cardNum, profit, priceInfo } = await this.useCard({
        member_total_price,
        cardList,
        supplier_end_price,
        ticket_num,
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        member_price, // 成本价
        real_member_price,
        rewards,
        session_id,
        mobile,
        plat_name
      });
      return {
        card_id,
        cardNum,
        profit, // 利润
        priceInfo
      };
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "会员用卡处理异常",
        level: "error",
        info: {
          error
        }
      });
      return {
        card_id: "",
        profit: 0 // 利润
      };
    }
  }

  // 获取券类型信息
  async getQuanInfo(quan_value, app_name) {
    try {
      const res = await svApi.queryQuanTypeInfo({
        quan_value,
        app_name
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取券类型信息返回",
        level: "info",
        info: {
          res
        }
      });
      return res.data.quanInfo || null;
    } catch (error) {
      console.error("获取券类型信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取券类型信息异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
  // 更新券黑名单信息
  async updateQuanBlackInfo(params) {
    const { appFlag } = this;
    const { quan_flag, coupon, plat_name, order_number } = params;
    if (!coupon || !quan_flag) return;
    let black_quan_list = coupon.split(",");
    const quanTypeParams = {
      app_name: appFlag,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,app_name,quan_value,black_quans"
    };
    let targetQuanList = [];
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      targetQuanList =
        quanTypeRes?.data?.quanTypeList?.filter(
          item => item.quan_flag == quan_flag
        ) || [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "更新券黑名单信息前获取同类目标券返回",
        level: "info",
        info: {
          params,
          quanTypeParams
        }
      });
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "更新券黑名单信息前获取同类目标券异常",
        level: "error",
        info: {
          error,
          quanTypeParams
        }
      });
      return;
    }

    let updateQuanList = []; // 收集需要更新的券
    let updatePromises = targetQuanList.map(async item => {
      try {
        let existingBlackQuans = item.black_quans
          ? item.black_quans.split(";")
          : [];
        let newBlackQuans = black_quan_list.filter(
          quan => !existingBlackQuans.includes(quan)
        );
        if (newBlackQuans.length === 0) return;

        // 收集需要更新的券
        updateQuanList = [...new Set([...updateQuanList, ...newBlackQuans])];

        let updateParams = {
          id: item.id,
          black_quans: item.black_quans + ";" + newBlackQuans.join(";"),
          update_time: getCurrentTime()
        };
        const res = await svApi.updateQuanType(updateParams);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "单个更新券黑名单信息返回",
          level: "info",
          info: {
            res,
            updateParams
          }
        });
      } catch (error) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "单个更新券黑名单信息异常",
          level: "error",
          info: {
            error
          }
        });
      }
    });

    // 等待所有更新任务完成
    await Promise.all(updatePromises);

    // 如果有需要更新的券，发送消息
    if (updateQuanList.length > 0) {
      sendWxPusherMessage({
        msgType: 3,
        quan_flag,
        plat_name,
        order_number,
        black_quans: updateQuanList.join(";"),
        transferTip:
          "创建订单时发现券不可用，请去券维护列表搜索以下券标识并检查以下黑名单券是否准确，不准确请手动修改维护（可能会有可用的券，需从黑名单券里移除）"
      });
    }
  }
  // 更新券库存
  async updateQuanStock(params) {
    const { ticket_num, quan_stock, quan_flag, phone, app_name, quan_value } =
      params;
    // quan_stock：入库券的本地库存
    let targetQuanList = [];
    const quanTypeParams = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,app_name,quan_value,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      targetQuanList = quanTypeList.filter(item => item.quan_flag == quan_flag);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "更新券库存前获取同类目标券返回",
        level: "info",
        info: {
          params,
          quanTypeParams,
          targetQuanList
        }
      });
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "更新券库存前获取同类目标券异常",
        level: "error",
        info: {
          error,
          quanTypeParams
        }
      });
    }

    // 同类目标券更新处理
    targetQuanList.forEach(item => {
      let quanStockList = item.quanStockList || [];
      if (quanStockList?.length) {
        quanStockList = JSON.parse(quanStockList);
        let inx = quanStockList.findIndex(itemA => itemA.phone === phone);
        if (inx != -1) {
          let info = quanStockList[inx];
          quanStockList[inx].quan_stock =
            quan_stock !== undefined
              ? quan_stock
              : info.quan_stock - ticket_num;
          quanStockList[inx].real_quan_stock =
            quan_stock !== undefined
              ? quan_stock
              : info.real_quan_stock - ticket_num;
          quanStockList[inx].update_time = getCurrentTime();
        } else {
          return;
        }
      } else {
        return;
      }
      let updateParams = {
        id: item.id,
        quanStockList: JSON.stringify(quanStockList),
        update_time: getCurrentTime()
      };
      // 增加最后使用时间更新（方便看是否压价）
      if (quan_value && quan_value === item.quan_value) {
        updateParams.end_use_time = getCurrentTime();
      }
      // 单个更新
      this.singleUpdateQuanStock(updateParams);
    });
  }

  // 单个更新券库存
  async singleUpdateQuanStock(params) {
    try {
      const res = await svApi.updateQuanType(params);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "单个更新券库存返回",
        level: "info",
        info: {
          res,
          params
        }
      });
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "单个更新券库存异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 优先用券处理
  // async firstUseQuanHandle(params) {
  //   const {
  //     city_id,
  //     cinema_id,
  //     show_id,
  //     seat_ids,
  //     session_id,
  //     appFlag,
  //     ticket_num,
  //     quanFlagList
  //   } = params;
  //   try {
  //     let getQuanLogList = [];
  //     const quanListRes = await getQuanList({
  //       city_id,
  //       cinema_id,
  //       session_id,
  //       appFlag,
  //       firstFlag: 1,
  //       quanFlagList,
  //       logList: getQuanLogList
  //     });
  //     // 拿到获取券列表方法内的日志记录
  //     this.logList.push(...getQuanLogList);
  //     this.logList.push({
  //       opera_time: getCurrentTime(),
  //       des: "优先用券时-获取优惠券列表返回",
  //       level: "info",
  //       info: {
  //         quanListRes
  //       }
  //     });
  //     // 这里拿到的券列表会比票数多10张
  //     let targetQuanList = quanListRes?.quanList || [];
  //     let quanType = quanListRes?.quanType;
  //     if (["offline_member_quan", "online_member_quan"].includes(quanType)) {
  //       // 会员赠券每次用必须用归属于同一个卡的
  //       // 按照card_num分组
  //       const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
  //         const key = coupon.card_num;
  //         if (!groups[key]) {
  //           groups[key] = [];
  //         }
  //         groups[key].push(coupon);
  //         return groups;
  //       }, {});
  //       let targetQuanGroup = Object.values(groupedCoupons).find(
  //         item => item.length >= ticket_num
  //       );
  //       this.logList.push({
  //         opera_time: getCurrentTime(),
  //         des: "用券时按照card_num分组",
  //         level: "info",
  //         info: {
  //           groupedCoupons,
  //           targetQuanGroup
  //         }
  //       });
  //       targetQuanList = targetQuanGroup?.slice(0, ticket_num) || [];
  //     }
  //     if (!targetQuanList?.length) {
  //       this.logList.push({
  //         opera_time: getCurrentTime(),
  //         des: "优先用券时按券标识过滤后为空",
  //         level: "info"
  //       });
  //       return;
  //     }

  //     let card_id = "",
  //       quan_code = "",
  //       coupon_id,
  //       member_coupon_id;
  //     if (quanType === "online_member_quan") {
  //       const cardListRes = await getCardList({
  //         city_id,
  //         cinema_id,
  //         session_id,
  //         appFlag
  //       });
  //       let cardList = cardListRes?.cardList || [];
  //       if (!cardList?.length) {
  //         this.logList.push({
  //           opera_time: getCurrentTime(),
  //           des: "线上券优先用券时获取会员卡列表异常",
  //           level: "error",
  //           info: {
  //             error: cardListRes?.error
  //           }
  //         });
  //         return;
  //       }
  //       // 按余额倒序取最大余额的卡id
  //       let cards = cardList.sort((a, b) => b.balance - a.balance);
  //       card_id = cards[0]?.id;
  //       coupon_id = targetQuanList.map(item => item.id).join();
  //     } else if (quanType === "offline_member_quan") {
  //       // 线下
  //       member_coupon_id = targetQuanList.map(item => item.id).join();
  //     } else {
  //       this.logList.push({
  //         opera_time: getCurrentTime(),
  //         des: "优先用券时发现不是会员赠券",
  //         level: "info"
  //       });
  //       return;
  //     }
  //     const priceRes = await priceCalculation({
  //       city_id,
  //       cinema_id,
  //       show_id,
  //       seat_ids,
  //       card_id,
  //       quan_code,
  //       coupon_id,
  //       session_id,
  //       appFlag,
  //       member_coupon_id
  //     });
  //     this.logList.push({
  //       opera_time: getCurrentTime(),
  //       des: "优先用券时计算价格返回",
  //       level: "info",
  //       info: {
  //         priceRes
  //       }
  //     });
  //     if (priceRes?.error) {
  //       this.logList.push({
  //         opera_time: getCurrentTime(),
  //         des: "优先用券时计算价格异常",
  //         level: "info",
  //         info: {
  //           error: priceRes?.error
  //         }
  //       });
  //       return;
  //     }
  //     let priceInfo = priceRes?.price?.total_price;
  //     let pay_money = Number(priceInfo); // 此处是为了将订单价格30.00转为30，将0.00转为0
  //     if (pay_money !== 0) {
  //       this.logList.push({
  //         opera_time: getCurrentTime(),
  //         des: "优先用券时计算价格后价格不为0",
  //         level: "info",
  //         info: {
  //           priceInfo
  //         }
  //       });
  //       return;
  //     }
  //     return {
  //       card_id,
  //       coupon_id,
  //       member_coupon_id,
  //       quanType
  //     };
  //   } catch (error) {
  //     this.logList.push({
  //       opera_time: getCurrentTime(),
  //       des: "优先用券时发现异常",
  //       level: "info",
  //       info: {
  //         error
  //       }
  //     });
  //   }
  // }
  // 计算订单价格
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
      retryTimes = 0 // 默认重试次数
    } = data;
    const MAX_RETRY_TIMES = 2; // 定义最大重试次数
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
      }
      console.log("计算订单价格参数", params);
      if (retryTimes == 0) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "计算订单价格参数",
          level: "info",
          info: {
            params
          }
        });
      }
      const res = await APP_API_OBJ[appFlag].priceCalculation(params);
      console.log("计算订单价格返回", res);
      let price = res.data?.price;
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "计算订单价格返回" + retryTimes,
        level: "info",
        info: {
          res
        }
      });
      return {
        price
      };
    } catch (error) {
      console.error("计算订单价格异常", error);
      // if (error.msg === "锁定座位失败" && retryTimes < MAX_RETRY_TIMES) {
      //   console.warn(
      //     `计算订单价格异常，将在3秒后重试(${retryTimes + 1}/${MAX_RETRY_TIMES})`,
      //     error
      //   );
      //   this.logList.push({
      //     opera_time: getCurrentTime(),
      //     des: "计算订单价格返回:锁定座位失败,准备隔3秒重试",
      //     level: "info",
      //     info: {
      //       error
      //     }
      //   });
      //   await mockDelay(3);
      //   return this.priceCalculation({
      //     ...data,
      //     retryTimes: retryTimes + 1
      //   });
      // }
      return { error };
    }
  }

  // 创建订单
  async createOrder(data) {
    const { conPrefix, isV3App } = this;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      seat_info,
      pay_money,
      card_id,
      coupon,
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
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单参数",
        level: "info",
        info: {
          params
        }
      });
      let res = await this.sfcApi.createOrder(params);
      console.log(conPrefix + "创建订单返回", res);
      let order_num = res.data?.order_num || "";
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单返回",
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
        opera_time: getCurrentTime(),
        des: "创建订单异常",
        level: "error",
        info: {
          error
        }
      });
      // 只有内部用户支持该功能，外部用户待券维护分开后再放开该功能
      if (
        error?.msg?.includes("请联系影院将使用该券的原订单后台退款后") &&
        isTimeoutRetry === 1
      ) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "创建订单时发现券不可用，进行更新黑名单处理",
          level: "info",
          info: {
            quan_flag,
            coupon
          }
        });
        this.updateQuanBlackInfo({
          coupon,
          quan_flag,
          plat_name,
          order_number
        });
      }
      if (error?.msg === "请求接口超时,请重试" && isTimeoutRetry === 1) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "创建订单请求接口超时，延迟1秒后重试",
          level: "info"
        });
        await mockDelay(1);
        try {
          const order_num = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (order_num) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "创建订单请求接口超时，延迟1秒后重试成功",
              level: "info",
              info: {
                order_num
              }
            });
            return order_num;
          }
        } catch (err) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "创建订单请求接口超时，延迟2秒后重试失败",
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
    const { conPrefix, isV3App } = this;
    let {
      city_id,
      cinema_id,
      order_num,
      session_id,
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
        session_id
      };
      if (isV3App) {
        params.business_type = "1";
      }
      console.log(conPrefix + "支付订单参数", params);
      if (inx === 1) {
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: "获取支付结果传参",
          level: "info",
          info: {
            params
          }
        });
      }
      const res = await this.sfcApi.payOrder(params);
      console.log(conPrefix + "支付订单返回", res);
      targetLogList.push({
        opera_time: getCurrentTime(),
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
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次获取订单支付结果异常`,
        level: "error",
        info: {
          error
        }
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
          const res = await this.sfcApi.getOrderList(params);
          let list = res.data?.order_data || [];
          if (list.length) {
            let targetObj = list.find(item => item.order_num === order_num);
            if (targetObj) {
              let qrcode = targetObj.ticket_code?.split(",").join("|");
              if (qrcode) {
                targetLogList.push({
                  opera_time: getCurrentTime(),
                  des: `第${inx}次从已完成订单里获取取票码成功`,
                  level: "info",
                  info: {
                    qrcode
                  }
                });
                return qrcode;
              } else {
                targetLogList.push({
                  opera_time: getCurrentTime(),
                  des: `第${inx}次从已完成订单里获取取票码失败`,
                  level: "error",
                  info: {
                    list,
                    order_num
                  }
                });
              }
            }
          }
        } catch (error) {
          targetLogList.push({
            opera_time: getCurrentTime(),
            des: `第${inx}次从已完成订单里获取取票码异常`,
            level: "error",
            info: {
              error
            }
          });
        }
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
        ]),
        ticket_type: 2 // 取票方式
        // 1，猫眼淘票票取票机取票。
        // 2，影院专用取票机或前台取票。
        // 3，直接在入闸处扫码入闸进场观影。
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
        opera_time: getCurrentTime(),
        des: "哈哈暂不上传取票码,需手动上传",
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
        hall_name: orderInfo.hall_name,
        supplier_end_price: orderInfo.supplier_end_price,
        transferTip: "哈哈暂不上传取票码,需手动上传",
        failReason: "哈哈暂不上传取票码,需手动上传"
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
        opera_time: getCurrentTime(),
        des: "提交出票码参数",
        level: "info",
        info: {
          params
        }
      });
      const res = await PLAT_API_OBJ[plat_name].submitTicketCode(params);
      console.log(conPrefix + "提交出票码返回", res);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "提交取票码返回",
        level: "info",
        info: {
          res
        }
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "提交出票码异常", error);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "提交出票码异常",
        level: "error",
        info: {
          error
        }
      });
      if (flag === 2) {
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
      return {
        error
      };
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
    session_id,
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
          session_id
        });
      } catch (error) {}
      if (!qrcode) {
        console.error(conPrefix + "获取订单结果失败，单个订单直接出票结束");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取订单支付结果，取票码不存在，暂时返回异步获取",
          level: "error"
        });
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name: orderInfo.city_name,
          cinema_name: orderInfo.cinema_name,
          film_name: orderInfo.film_name,
          show_time: orderInfo.show_time,
          lockseat,
          hall_name: orderInfo.hall_name,
          supplier_end_price: orderInfo.supplier_end_price,
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
          lockseat
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "非异步获取订单支付结果成功",
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
          opera_time: getCurrentTime(),
          des: "非异步提交取票码成功",
          level: "info"
        });
      }
      return { submitRes, qrcode };
    } catch (error) {
      console.warn("出票最后处理异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "出票最后处理发现异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
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
    lockseat
  }) {
    const { conPrefix } = this;
    let syncQueryLogList = []; // 异步运行日志
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
            syncQueryLogList
          }),
        9,
        20,
        conPrefix,
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name: orderInfo.city_name,
          cinema_name: orderInfo.cinema_name,
          film_name: orderInfo.film_name,
          show_time: orderInfo.show_time,
          lockseat,
          hall_name: orderInfo.hall_name,
          supplier_end_price: orderInfo.supplier_end_price,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.payOrder({
              city_id,
              cinema_id,
              order_num,
              session_id,
              inx,
              syncQueryLogList
            }),
          21,
          20,
          conPrefix,
          7 * 60
        );
      }
      if (!qrcode) {
        syncQueryLogList.push({
          opera_time: getCurrentTime(),
          des: "系统延迟轮询10分钟后获取取票码仍失败",
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
    let targetLogList = flag === 1 ? this.logList : syncQueryLogList;
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
      if (!submitRes || submitRes?.error) {
        console.error(conPrefix + "订单提交取票码失败，单个订单直接出票结束");
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: "提交取票码失败",
          level: "error"
        });
        let errInfo = formatErrInfo(submitRes?.error);
        sendWxPusherMessage({
          plat_name,
          order_number,
          city_name: orderInfo?.city_name,
          cinema_name: orderInfo?.cinema_name,
          film_name: orderInfo?.film_name,
          show_time: orderInfo?.show_time,
          lockseat,
          hall_name: orderInfo.hall_name,
          supplier_end_price: orderInfo.supplier_end_price,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return;
      }
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "提交取票码成功",
        level: "info"
      });
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
            err_msg: "系统延迟后轮询获取提交取票码成功"
          }
        });
      }
      return submitRes;
    } catch (error) {
      console.warn("提交取票码异常", error);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "提交取票码异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取会员卡列表
  async getCardList({ city_id, cinema_id, session_id }) {
    const { appFlag } = this;
    let params = {
      city_id,
      cinema_id,
      session_id
    };
    try {
      let isV3App = sfcV3AppList.includes(appFlag);
      console.log("获取会员卡列表参数", params);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员卡列表参数",
        level: "info",
        info: {
          params,
          appFlag
        }
      });
      const res =
        await APP_API_OBJ[appFlag][
          isV3App ? "getCardAndQuanList" : "getCardList"
        ](params);
      console.log("获取会员卡列表返回", res);
      let cardList = res.data?.card_data || [];
      if (isV3App) {
        let cardInfo = res.data?.member_info;
        if (cardInfo) {
          cardList = [cardInfo];
        }
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员卡列表返回",
        level: "info",
        info: {
          res,
          cardList
        }
      });
      // v3华谊走的是非会员svip+券的形式
      if (!isV3App) {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(itemA => itemA.card_num === item.card_num)
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "从可用卡（库里维护且出票量未达标）里面过滤后",
            level: "info",
            info: {
              cardList
            }
          });
        }
      }
      return cardList;
    } catch (error) {
      console.error("获取会员卡列表异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员卡列表异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 获取影院指定会员卡
  async getUsableCardList(cinema_id, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,balance,mobile,default_card,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
      });
      let list = res.data.cardList || [];

      list = list.map(item => ({
        ...item,
        // 使用日非当天的就是0
        daily_usage:
          item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
        // 使用日非当月的就是0
        month_usage: !isDateInCurrentMonth(item.usage_date)
          ? 0
          : item.monthly_usage || 0
      }));
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取该影院已维护会员卡列表返回",
        level: "info",
        info: {
          list
        }
      });
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item => item.app_name === appFlag && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      let cardListByMobile = list.filter(item =>
        useMobileList.includes(item.mobile)
      );
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据该用户关联手机号对卡列表进行过滤",
        level: "info",
        info: {
          useMobileList,
          cardListByMobile
        }
      });
      // console.log("list", list);
      // 根据当天及当月出票量限制进行过滤
      let cardListLimit = cardListByMobile.filter(item => {
        const { use_limit_day, use_limit_month, daily_usage, month_usage } =
          item;
        if (!use_limit_day && !use_limit_month) return true;
        return (
          (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
          (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
        );
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据当天及当月出票量限制过滤后",
        level: "info",
        info: {
          cardListLimit
        }
      });

      let useCanCardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据制定影院过滤后的卡列表",
        level: "info",
        info: {
          useCanCardList
        }
      });
      return useCanCardList;
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员卡维护列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取新券
  async getNewQuan({
    quan_value,
    quan_flag,
    quanNum, // 同步绑券diffNum+10或者是异步绑券券数
    diffNum = 0, // 距离出票差的券数
    city_id,
    cinema_id,
    session_id,
    black_quans,
    asyncFlag,
    asyncBandQuanList,
    plat_name,
    order_number,
    quanStock,
    ticket_num
  }) {
    const { conPrefix, appFlag } = this;
    let targetLogList = asyncFlag === 1 ? asyncBandQuanList : this.logList;
    let conPrev = asyncFlag === 1 ? "异步绑券_" : "";
    try {
      const quanTypeParams = {
        app_name: appFlag,
        quan_flag,
        isNeedTotalNum: 0,
        queryFields: "quan_value,app_name"
      };
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList = quanTypeList.map(item => item.quan_value);
      if (quanTypeList.length > 1) {
        quan_value = quanTypeList.join(";");
      }
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `${conPrev}根据券标识获取券类型返回`,
        level: "info",
        info: {
          quanTypeList
        }
      });
    } catch (err) {
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `${conPrev}根据券标识获取券类型返回异常`,
        level: "info",
        info: {
          err
        }
      });
    }
    let params = {
      quan_value: quan_value,
      app_name: appFlag,
      quan_status: "1",
      page_num: 1,
      page_size: quanNum
    };
    try {
      if (black_quans) {
        params.black_quans = black_quans;
      }
      let quanRes = await svApi.queryQuanList(params);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `${conPrev}从服务端获取券返回`,
        level: "info",
        info: {
          quanRes,
          quanNum,
          quan_value,
          params
        }
      });

      let quanList = quanRes?.data?.quanList || [];
      if (asyncFlag != 1 && (!quanList?.length || quanList?.length < diffNum)) {
        console.error(conPrefix + `数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(conPrefix + `正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          city_id,
          cinema_id,
          session_id,
          coupon_num: quan.coupon_num,
          quan_value,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        if (couponNumRes?.errMsg) {
          targetLogList.push({
            opera_time: getCurrentTime(),
            des: `${conPrev}绑定券异常`,
            level: "error",
            info: {
              ...couponNumRes
            }
          });
        } else {
          targetLogList.push({
            opera_time: getCurrentTime(),
            des: `${conPrev}绑定券返回`,
            level: "info",
            info: {
              ...couponNumRes
            }
          });
        }
        if (coupon_num) {
          bandQuanList.push({ coupon_num });
        }
        svApi.addUseQuanRecord({
          coupon_num: quan.coupon_num,
          app_name: appFlag,
          quan_status: !coupon_num ? "3" : "2",
          use_time: getCurrentTime(),
          remark: !coupon_num ? "绑券异常" : ""
        });
        // 绑券数量达标跳出循环
        if (diffNum && bandQuanList.length >= diffNum) {
          break;
        }
      }
      // 异步绑券更新券库存
      if (asyncFlag === 1 && ticket_num) {
        this.updateQuanStock({
          quan_stock: quanStock - ticket_num + bandQuanList.length, // 直接传过去券库存
          quan_value,
          quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
      }
      return {
        bandQuanList,
        newQuanNums: quanList.length
      };
    } catch (error) {
      console.error(conPrefix + "获取新券异常", error);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `${conPrev}获取新券异常`,
        level: "error",
        info: {
          error,
          quanNum,
          quan_value,
          params
        }
      });
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
    quan_flag,
    rewards,
    session_id,
    black_quans,
    plat_name,
    order_number,
    quan_cost,
    quanStock, // 入库券的本地库存
    is_store
  }) {
    const { conPrefix, appFlag } = this;
    try {
      // 规则如下:
      // 1、成本不能高于中标价，即40券不能出中标价38.8的单
      // 2、1张票一个券，不能出现2张票用3个券的情况
      // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
      let targetQuanList = quanList || []; // 优惠券列表

      if (targetQuanList?.length - ticket_num < 10 && is_store == "1") {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "本次出票后券小于10，开始异步绑定券",
          level: "info"
        });
        this.getNewQuan({
          city_id,
          cinema_id,
          quan_value,
          quan_flag,
          session_id,
          black_quans,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1,
          asyncBandQuanList: [],
          plat_name,
          order_number,
          quanStock,
          ticket_num
        });
      }
      // 用券列表
      let useQuans = targetQuanList.filter((item, index) => index < ticket_num);
      let profit = 0; // 利润
      profit =
        Number(supplier_end_price) -
        quan_cost -
        (Number(supplier_end_price) * 100) / 10000;
      profit = profit * (useQuans.length || 0);
      // useQuans = useQuans.map(item => item.coupon_num);
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
          10000;
        profit += rewardPrice;
      }
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "使用优惠券计算价格后最终利润为负",
          level: "error"
        });
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
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用优惠券异常",
        level: "error",
        info: {
          error
        }
      });
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
    seat_ids,
    member_price, // 成本价
    real_member_price,
    rewards,
    session_id,
    mobile,
    plat_name
  }) {
    const { conPrefix, appFlag, isV3App } = this;
    try {
      let cards = cardList || [];
      let cardFilter = cards.filter(
        item => Number(item.balance) >= Number(member_total_price)
      );
      if (!cardFilter?.length) {
        console.error(conPrefix + "使用会员卡失败，会员卡余额不足");
        this.logList.push({
          opera_time: getCurrentTime(),
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
        // 检查是否为默认卡，确保默认卡优先级最高
        if (a.default_card === "1" && b.default_card !== "1") return -1; // a 在前
        if (a.default_card !== "1" && b.default_card === "1") return 1; // b 在前

        // 如果两者都是默认卡或都不是，默认卡维持原有顺序，并按余额排序
        // 转换 balance 为数字类型以正确比较数值
        const balanceA = Number(a.balance);
        const balanceB = Number(b.balance);

        // 对非默认卡或当两个都是默认卡时，根据余额进行倒序排序
        return balanceB - balanceA;
      });
      let card_id, cardNum, priceInfo, errReason;
      if (!isV3App) {
        // 开始尝试使用卡并获取成功使用的卡的结果
        const attemptCardsSequentially = async () => {
          for (const card of cardData) {
            console.log(conPrefix + `正在尝试使用卡 ${card.card_num}...`);
            this.logList.push({
              opera_time: getCurrentTime(),
              des: `正在尝试使用卡 ${card.card_num}`,
              level: "info"
            });
            const priceRes = await this.priceCalculation({
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              card_id: card.id,
              session_id,
              appFlag
            });
            let price = priceRes?.price;
            if (priceRes?.error) {
              this.logList.push({
                opera_time: getCurrentTime(),
                des: "尝试使用卡时计算价格异常",
                level: "error",
                info: {
                  error: priceRes?.error
                }
              });
              errReason = priceRes?.error?.msg || "尝试使用卡时计算价格异常";
            }
            if (price) {
              let cardCalcFail =
                Number(price.total_price) >
                (Number(real_member_price) * 1000 * Number(ticket_num)) / 1000;
              if (cardCalcFail) {
                let isChangeCard = card.id !== cardData[cardData.length - 1].id;
                let str = `该会员卡计算后价格-${price.total_price}高于真实会员价-${real_member_price}*座位数-${ticket_num}`;
                this.logList.push({
                  opera_time: getCurrentTime(),
                  des: str + `,${isChangeCard ? "准备换卡" : ""};`,
                  level: "info",
                  info: {
                    price
                  }
                });
                errReason = str || "计算价格高于真实会员价*座位数";
              } else {
                card_id = card.id;
                cardNum = card.card_num;
                console.log(conPrefix + "卡使用成功，返回结果并停止尝试。");
                return price; // 卡使用成功，返回结果并结束函数
              }
            }
          }
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "所有会员卡尝试均失败：" + errReason,
            level: "error"
          });
          console.error(conPrefix + "所有卡尝试均失败。");
          return null; // 所有卡尝试失败后返回null
        };
        // 3、计算价格要求最终价格小于中标价
        priceInfo = await attemptCardsSequentially();
        if (!priceInfo) {
          console.error(conPrefix + "计算订单价格失败，单个订单直接出票结束");
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
      } else {
        card_id = cardData[0]?.member_id;
        cardNum = cardData[0]?.member_id;
      }

      // 卡的话 1块钱成本就是一块钱，利润 =  中标价格-会员出票价格 -手续费（中标价格1%）
      let profit =
        supplier_end_price -
        member_price -
        (Number(supplier_end_price) * 100) / 10000;
      profit = Number(profit) * Number(ticket_num);
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
          10000;
        profit += rewardPrice;
      }
      profit = Number(profit).toFixed(2);
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        console.error(conPrefix + "最终利润为负，单个订单直接出票结束");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "使用会员卡计算价格后最终利润为负",
          level: "error",
          info: {
            profit
          }
        });
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return {
          profit: 0,
          card_id: ""
        };
      }
      return {
        card_id,
        cardNum,
        profit,
        priceInfo
      };
    } catch (error) {
      // 此处异常一定是代码异常无需考虑重试
      console.error(conPrefix + "使用会员卡异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用会员卡异常",
        level: "error",
        info: {
          error
        }
      });
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
    let cityList = res.data?.all_city || [];
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
    const res = await APP_API_OBJ[appFlag].getCinemaList(params);
    console.log(conPrefix + "获取城市影院返回", res);
    let cinemaList = res.data?.cinema_data || [];
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
const getMoviePlayInfo = async ({ city_id, cinema_id, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log(conPrefix + "获取电影放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log(conPrefix + "获取电影放映列表返回", res);
    return {
      movieData: res.data?.movie_data || []
    };
  } catch (error) {
    console.error(conPrefix + "获取电影放映列表异常", error);
    return {
      error
    };
  }
};

// 获取座位布局
const getSeatLayout = async ({
  city_id,
  cinema_id,
  show_id,
  session_id,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      session_id,
      width: "240"
    };
    console.log(conPrefix + "获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log(conPrefix + "获取座位布局返回", res);
    let seatData = res.data?.play_data?.seat_data || [];
    return {
      seatData
    };
  } catch (error) {
    console.error(conPrefix + "获取座位布局异常", error);
    return {
      error
    };
  }
};

// 连续获取目标券
const continuousGetQuan = async data => {
  let {
    city_id,
    cinema_id,
    session_id,
    appFlag,
    quan_value,
    quan_flag,
    black_quans,
    quanFlagList,
    ticket_num,
    targetNum,
    page,
    quanData = [],
    logList = []
  } = data;
  const params = {
    city_id,
    cinema_id,
    session_id,
    page,
    status: 4
  };
  try {
    logList.push({
      opera_time: getCurrentTime(),
      des: "连续获取目标券参数",
      level: "info",
      info: {
        params
      }
    });
    const res = await APP_API_OBJ[appFlag].getQuanList(params);
    logList.push({
      opera_time: getCurrentTime(),
      des: "连续获取目标券本次查询返回",
      level: "info",
      info: {
        res
      }
    });
    let quanList = res.data?.unused?.lists || [];
    let total_page = res.data?.unused?.total_page || [];
    let targetQuanList = [];
    if (quan_value) {
      targetQuanList = quanList.filter(
        item =>
          couponInfoSpecial(item.coupon_info) ===
            couponInfoSpecial(quan_flag) &&
          !black_quans?.includes(item.coupon_num)
      );
    }
    // 由于增加券类型管理功能暂时不用优先用券功能
    // if (quanFlagList?.length) {
    //   targetQuanList = quanList.filter(item =>
    //     quanFlagList.some(itemA =>
    //       couponInfoSpecial(item.coupon_name).includes(couponInfoSpecial(itemA))
    //     )
    //   );
    // }
    logList.push({
      opera_time: getCurrentTime(),
      des: "按照券类型或者券标识匹配目标券列表",
      level: "info",
      info: {
        quan_value,
        quan_flag,
        quanFlagList,
        targetQuanList
      }
    });
    quanData.push(...targetQuanList);
    if (total_page > page && quanData.length < targetNum) {
      let currentQuanNum = quanData?.length;
      logList.push({
        opera_time: getCurrentTime(),
        des: "目标券列表数量不够，递归连续获取目标券",
        level: "info",
        info: {
          ticket_num,
          targetNum,
          currentQuanNum
        }
      });
      // 如果总数量仍小于所需数量，则继续获取下一页
      return await continuousGetQuan({
        ...data,
        page: page + 1,
        quanData
      });
    }
    // 先控制只返回目标券数量
    return {
      list: quanData?.slice(0, targetNum)
    };
  } catch (error) {
    console.warn("连续获取券失败", error);
    logList.push({
      opera_time: getCurrentTime(),
      des: "连续获取目标券异常",
      level: "error",
      info: {
        error
      }
    });
  }
};

// 获取优惠券列表
const getQuanList = async data => {
  let {
    city_id,
    cinema_id,
    session_id,
    appFlag,
    quan_value,
    quan_flag,
    black_quans,
    quanFlagList, // 优先用券的券标识
    ticket_num,
    page = 1,
    logList
  } = data;
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      city_id,
      cinema_id,
      session_id,
      page,
      status: 4 // 未使用
    };
    logList.push({
      opera_time: getCurrentTime(),
      des: "获取优惠券列表参数",
      level: "info",
      info: {
        params
      }
    });
    console.log(conPrefix + "获取优惠券列表参数", params);
    const res = await APP_API_OBJ[appFlag].getQuanList(params);
    console.log(conPrefix + "获取优惠券列表返回", res);
    logList.push({
      opera_time: getCurrentTime(),
      des: "获取优惠券列表返回",
      level: "info",
      info: {
        res
      }
    });
    let quanList = res.data?.unused?.lists || [];
    let total_page = res.data?.unused?.total_page || [];
    // 获取目标券
    let targetQuanList = [];
    let targetNum = +ticket_num + 10;
    // 多获取10张1是为了解决异步绑券那判断是否小于10不准确问题，2是为了解决充值赠券需要分组获取的少不是1组的问题
    if (quan_value) {
      targetQuanList = quanList.filter(
        item =>
          couponInfoSpecial(item.coupon_info) ===
            couponInfoSpecial(quan_flag) &&
          !black_quans?.includes(item.coupon_num)
      );
    }
    // 由于增加券类型管理功能暂时不用优先用券功能
    // if (quanFlagList?.length) {
    //   targetQuanList = quanList.filter(item =>
    //     quanFlagList.some(itemA =>
    //       couponInfoSpecial(item.coupon_name).includes(couponInfoSpecial(itemA))
    //     )
    //   );
    // }
    logList.push({
      opera_time: getCurrentTime(),
      des: "按照券类型或者券标识匹配目标券列表",
      level: "info",
      info: {
        quan_value,
        quan_flag,
        quanFlagList,
        targetQuanList
      }
    });
    // 证明还有下一页，且第一页目标券不够
    if (total_page > page && targetQuanList?.length < targetNum) {
      let currentQuanNum = targetQuanList?.length;
      logList.push({
        opera_time: getCurrentTime(),
        des: "目标券列表数量不够，开始连续获取目标券",
        level: "info",
        info: {
          ticket_num,
          targetNum,
          currentQuanNum
        }
      });
      const quanDataRes = await continuousGetQuan({
        ...data,
        page: 2,
        targetNum: targetNum - targetQuanList.length
      });
      logList.push({
        opera_time: getCurrentTime(),
        des: "连续获取目标券最终返回",
        level: "info",
        info: {
          quanDataRes
        }
      });
      let list = quanDataRes?.list || [];
      targetQuanList.push(...list);
    }
    // let noUseLIst = ['1598162363509715', '1055968062906716', '1284460567801315', '1116166666409614']
    // 过滤掉不可用券
    // list = list.filter(item => item.coupon_num.indexOf("t") === -1);
    const { coupon_type, card_num } = targetQuanList?.[0] || {};
    let quanType;
    if (coupon_type) {
      quanType = card_num ? "online_member_quan" : "online_quan";
    } else {
      quanType = card_num ? "offline_member_quan" : "offline_quan";
    }
    if (["offline_member_quan", "online_member_quan"].includes(quanType)) {
      // 会员赠券每次用必须用归属于同一个卡的
      // 按照card_num分组
      const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
        const key = coupon.card_num;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(coupon);
        return groups;
      }, {});
      let groupList = Object.values(groupedCoupons);
      let targetQuanGroup = groupList.find(item => item.length >= ticket_num);

      logList.push({
        opera_time: getCurrentTime(),
        des: "会员赠券按照card_num分组",
        level: "info",
        info: {
          groupedCoupons,
          targetQuanGroup
        }
      });
      targetQuanList = targetQuanGroup?.slice(0, ticket_num) || [];
      if (!targetQuanList?.length) {
        logList.push({
          opera_time: getCurrentTime(),
          des: "会员赠券数量不够出票",
          level: "info"
        });
      }
    }
    return {
      quanList: targetQuanList,
      quanType
    };
  } catch (error) {
    console.error(conPrefix + "获取优惠券列表异常", error);
    logList.push({
      opera_time: getCurrentTime(),
      des: "获取优惠券列表异常",
      level: "error",
      info: {
        error
      }
    });
  }
};

// 绑定券
const bandQuan = async ({
  city_id,
  cinema_id,
  coupon_num,
  session_id,
  quan_value,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    city_id,
    cinema_id,
    session_id,
    coupon_code: coupon_num,
    from_goods: "2"
  };
  if (appFlag === "sfc") {
    params.city_id = "499";
    params.cinema_id = "3";
    if (quan_value == "sfctianjin") {
      params.city_id = "501";
      params.cinema_id = "50";
    }
  }
  try {
    await mockDelay(1);
    const res = await APP_API_OBJ[appFlag].bandQuan(params);
    // console.log("res", res);
    if (res.data?.success === "1") {
      return {
        coupon_num,
        params
      };
    } else {
      console.error(conPrefix + "绑定新券异常", res);
      return {
        errMsg: "绑定新券异常:" + JSON.stringify(res),
        params
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

// 购买订单
const buyTicket = async ({
  city_id,
  cinema_id,
  order_num,
  pay_money,
  session_id,
  appFlag,
  offer_type,
  isV3App,
  card_id,
  pay_password
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  let params = {
    city_id,
    cinema_id,
    open_id: GE_APP_INFO(appFlag)?.sfc_open_id, // 微信openId
    order_num, // 订单号
    pay_money, // 支付金额
    pay_type: "", // 购买方式 传空意味着用优惠券或者会员卡
    session_id
  };
  try {
    if (isV3App && card_id) {
      params.pay_type = "wallet";
      params.pay_password = pay_password;
      // 5e5d04e81d9394f5b446f4a80782b77f
      // 5e5d04e81d9394f5b446f4a80782b77f
    }
    console.log(conPrefix + "订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log(conPrefix + "订单购买返回", buyRes);
    return {
      buyRes,
      params
    };
  } catch (error) {
    console.error(conPrefix + "订单购买异常", error);
    return {
      error,
      params
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
    return { error };
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
    if (
      res?.offerRule?.rule_status === "3" ||
      res?.offerRule?.quan_value === "jinbaojia"
    ) {
      order_status = "4";
    }
    const serOrderInfo = {
      plat_name: order.plat_name,
      app_name: res?.offerRule?.app_name || appFlag,
      order_id: order.id,
      order_number: order.order_number,
      tpp_price: order.tpp_price,
      supplier_end_price: order.supplier_end_price,
      supplier_max_price: res?.offerRule?.supplier_max_price || "",
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
      quan_value: res?.offerRule?.quan_value || "",
      order_status: order_status,
      // remark: '',
      processing_time: getCurrentTime(),
      profit: res?.profit || "",
      qrcode: res?.qrcode || "",
      quan_type: res?.quanType || "",
      quan_code: res?.quan_code || "",
      card_id: res?.card_id || "",
      card_num: res?.cardNum || "",
      err_msg: res?.submitRes ? "" : errMsg || "",
      err_info: res?.submitRes ? "" : errInfo || "",
      rewards: res?.offerRule?.rewards || 0, // 奖励百分比
      transfer_fee: res?.transferParams?.transfer_fee || "", // 转单手续费
      mobile: mobile || "", // 出票手机号
      rule: rule
    };
    let targetInfo = GET_APP_TYPE_LIST().find(item =>
      item.app_name_list.includes(serOrderInfo.app_name)
    );
    if (targetInfo) {
      serOrderInfo.app_type = targetInfo.app_type_code;
    }
    await svApi.addTicketRecord(serOrderInfo);
  } catch (error) {
    console.error("添加订单处理记录异常", error);
    if (error?.code === 0 && error?.msg === "订单重复") {
      // console.warn("疑似队列重复，请重新登录");
      sendWxPusherMessage({
        msgType: 2,
        transferTip: "疑似队列重复，请新登录机器"
      });
    }
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
      opera_time: getCurrentTime(),
      des: "订单用卡购买成功后更新当天使用量",
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
