import {
  getCurrentTime,
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon,
  mockDelay, // 模拟延时
  logUpload, // 日志上传
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById,
  formatTimeOfDay,
  formatTimeOfTime,
  getCurrentDay,
  isDateInCurrentMonth,
  findMostRepeatedChars,
  couponInfoSpecial
} from "@/utils/utils";
// 帮助锁定座位实例对象
import assistLockSeatObj from "./lockSeatQueue";
import svApi from "@/api/sv-api";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
// 影院特殊匹配列表及api
import { TEST_NEW_PLAT_LIST, GET_APP_TYPE_LIST } from "@/common/constant";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.cityList = []; // 城市列表
    this.appFlag = appFlag; // 影线标识
    this.umeApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.logList = []; // 操作运行日志
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isStart = false; // 是否启动
    this.usableCardList = []; // 会员可用卡列表（库里维护的）

    // 监听新订单
    window.addEventListener(this.eventName, this.handleNewOrder.bind(this));
  }

  // 启动队列
  async start() {
    this.prevOrderNumber = "";
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    this.handledOrders = new Map();
    this.isStart = true; // 是否启动
    console.warn("队列启动，开始监听是否有新订单");
  }

  // 测试新订单
  testSendNewOrder(order) {
    const { appFlag } = this;
    isTestOrder = true;
    let newOrder = order || {
      id: 7177,
      plat_name: "lieren",
      app_name: "shjq",
      ticket_num: 2,
      rewards: "0",
      order_number: "2024081810003958918",
      supplier_end_price: 32.5,
      order_id: "7195870",
      tpp_price: "49.90",
      city_name: "上海",
      cinema_addr:
        "西湖区古墩路1009号龙湖紫荆天街5楼（晚10点后观影请从紫荆花北路停车场入口对面商场3号门进入）",
      cinema_name: "上海金球影城",
      hall_name: "5号激光厅--部分按摩椅",
      film_name: "好东西",
      lockseat: "4排1座 4排2座",
      show_time: "2024-12-04 21:35:00",
      cinema_group: ""
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
    const { appFlag, isStart } = this;
    if (!isStart) return;
    const order = event.detail;
    // 检查是否已经处理过此订单
    if (this.handledOrders.has(order.plat_name + "_" + order.order_number)) {
      console.warn("订单已被处理过，忽略重复消息", order);
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
    console.warn("新的待出票订单", order);
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
    const { appFlag } = this;
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
            `单个订单自动出票${res?.submitRes ? "成功" : "失败"}`,
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
              errMsg,
              errInfo,
              mobile: this.currentParamsList[this.currentParamsInx].mobile
            };
            await addOrderHandleRecored(params);
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "订单出票结束，远端已添加出票记录",
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
    if (order) {
      console.log("添加新订单到队列");
      this.queue.push(order);
    } else {
      // console.log("从出票记录过滤后，无新订单添加到队列");
    }
  }

  // 处理订单
  async orderHandle(order, delayTime) {
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
      console.log(`订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, cardNum, offerRule }
        return res;
      } else {
        console.warn("订单出票队列已停止");
      }
    } catch (error) {
      console.error("订单执行出票异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    this.isStart = false;
    console.warn("自动出票队列停止");
  }

  // 解锁座位
  async unlockSeatByApp({ cinemaLinkId, lockOrderId, session_id }) {
    // const session_id = this.currentParamsList[this.currentParamsInx].session_id;
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      lockOrderId,
      umeToken: session_id
    };
    try {
      console.log("解锁座位参数", params);
      const res = await this.umeApi.unlockSeat(params);
      console.log("解锁座位返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "解锁座位入参及返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return { isSuccess: true };
    } catch (error) {
      console.error("解锁座位异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "解锁座位异常",
        level: "error",
        info: {
          error,
          params
        }
      });
      return {
        error
      };
    }
  }
  // 转单
  async transferOrder(order, unlockSeatInfo) {
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
      cinema_name,
      film_name,
      show_time,
      lockseat
    } = order;
    const { cinemaLinkId, lockOrderId, orderId } = unlockSeatInfo || {};
    const session_id = this.currentParamsList[this.currentParamsInx].session_id;
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
    this.logList.push({
      opera_time: getCurrentTime(),
      des: "自动转单方法传参",
      level: "info",
      info: {
        unlockSeatInfo
      }
    });
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      // 3、获取座位布局
      if (unlockSeatInfo) {
        let operaDes = "释放座位",
          operaRes = 0,
          cancelError;
        // 有创建订单号就取消订单
        if (orderId) {
          operaDes = "取消订单";
          const cancelRes = await this.cannelOneOrder({
            cinemaLinkId,
            orderId,
            session_id
          });
          if (cancelRes.error) {
            cancelError = cancelRes.error;
          } else {
            operaRes = 1;
          }
        }
        // 有锁座订单号就解锁座位
        if (!orderId && lockOrderId) {
          const unlockRes = await this.unlockSeatByApp({
            cinemaLinkId,
            lockOrderId,
            session_id
          });
          if (!unlockRes.isSuccess) {
            cancelError = unlockRes.error;
          } else {
            operaRes = 1;
          }
        }

        this.logList.push({
          opera_time: getCurrentTime(),
          des: `转单前${operaDes}-${operaRes ? "成功" : "失败"}`,
          level: "info"
        });
        if (operaRes == 0) {
          sendWxPusherMessage({
            orderInfo: order,
            transferTip:
              "取消订单释放座位失败，建议先手动取消订单，以便后续订单正常出票",
            failReason: `${JSON.stringify(cancelError)}`
          });
        }
      }
      if (!isTransferOrder) {
        sendWxPusherMessage({
          orderInfo: order,
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
      console.log("转单参数", params);
      console.warn("【转单】参数", params);
      const res = await PLAT_API_OBJ[plat_name].transferOrder(params);
      console.warn("【转单】结果", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "转单成功",
        level: "info",
        info: {
          res
        }
      });
      sendWxPusherMessage({
        orderInfo: order,
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
      console.warn("【转单】手续费", transfer_fee);
      return transferParams;
    } catch (error) {
      console.error("【转单】异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `转单原因-${errMsg}——${errInfo}`,
        level: "info",
        info: {
          errMsg,
          errInfo
        }
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
        orderInfo: order,
        transferTip: "自动转单开启，转单失败，需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
    }
  }

  // 单个订单出票
  async singleTicket(item) {
    // 放到这里即使修改token也不用重启队列了
    const { appFlag } = this;
    const { id, plat_name, supplierCode, order_number, bid } = item;
    const { city_name, cinema_name, film_name, show_time, lockseat } = item;
    console.warn("单个待出票订单信息", item);
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
      offerRule = { offer_type: "2", member_price: "32" };
    }
    console.warn("从该订单的报价记录获取到的报价规则", offerRule);
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
      console.error(str, offerRule);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: str,
        level: "error",
        info: {
          offerRule
        }
      });
      sendWxPusherMessage({
        orderInfo: item,
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单首次解锁座位完成",
          level: "info"
        });
      }
    } catch (error) {
      console.error("解锁座位失败准备试错3次，间隔3秒", error);
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
        delayConfig[plat_name][1]
      );
      if (!res) {
        console.error("单个订单试错后仍解锁失败", "需要走转单逻辑");
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
      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
      if (result) {
        console.warn("单个订单出票完成");
        return result;
      } else {
        console.warn("单个订单出票失败");
      }
    } catch (error) {
      console.error("单个订单出票异常", error);
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
      console.log("解锁参数", params);
      const res = await PLAT_API_OBJ[plat_name].unlockSeat(params);
      console.log("解锁返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次解锁座位成功`,
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
      console.error("解锁异常", error);
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
    const { appFlag } = this;
    console.log("一键买票待下单信息", item);
    let {
      id: order_id,
      order_number,
      city_name,
      cinema_name,
      cinema_code,
      film_name,
      hall_name,
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
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds, // 锁定座位id
      areaTotalPrice = 0,
      seatList,
      lockOrderId, // 锁座返回订单id，用于创建订单
      orderId, // 创建订单返回订单id
      total_price,
      offerRule,
      targetShow
    } = otherParams || {};
    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = offerRule?.rewards || 0;
    }
    try {
      if (this.currentParamsInx === 0) {
        // 2、获取目标城市影院列表
        let cityCinemaList = await this.getCityCinemaList();
        if (!cityCinemaList?.length) {
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let cinemaList =
          cityCinemaList?.find(item => item.cityName.includes(city_name))
            ?.cinemaList || [];
        if (!cinemaList?.length) {
          console.error("获取目标城市影院列表失败", cityCinemaList, city_name);
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取目标城市影院列表失败",
            level: "error",
            info: {
              city_name,
              cityCinemaList
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 3、获取目标影院
        let targetCinema = cinemaList.find(
          item => item.cinemaCode === cinema_code
        );
        if (!targetCinema) {
          targetCinema = getTargetCinemaCommon({
            app_name: appFlag,
            plat_cinema_code: cinema_code,
            cinema_list: cinemaList
          });
        }
        if (!targetCinema) {
          console.error(
            "根据订单中的影院名称获取目标影院失败",
            cinemaList,
            cinema_name
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "根据订单中的影院名称获取目标影院失败",
            level: "error",
            info: {
              cinema_name,
              cinemaList,
              appFlag,
              city_name
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        cinemaLinkId = targetCinema.cinemaLinkId;
        if (cinemaLinkId) {
          if (offerRule.offer_type != 1) {
            const usableCards = await this.getUsableCardList(
              cinemaLinkId,
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
          } else {
            const sortMobileList = await this.getSortPhoneByQuanTypeList(
              appFlag,
              offerRule?.quan_flag
            );
            if (sortMobileList?.length) {
              this.currentParamsList = this.currentParamsList.sort((a, b) => {
                const indexA = sortMobileList.indexOf(a.mobile);
                const indexB = sortMobileList.indexOf(b.mobile);

                // 1. 先按 phoneOrder 排序
                if (indexA !== indexB) {
                  return indexA - indexB;
                }
                return 0;
              });
              this.logList.push({
                opera_time: getCurrentTime(),
                des: "登录信息按照可用券数量关联手机号排序后",
                level: "info",
                info: {
                  currentParamsList: this.currentParamsList,
                  sortMobileList
                }
              });
            }
          }
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
        // 4、获取目标影院放映列表
        const movie_data = await this.getMoviePlayInfo({
          cinemaLinkId
        });

        if (!movie_data?.length) {
          console.error("获取目标影院放映列表失败");
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取影院放映信息成功",
          level: "info"
        });
        // 5、获取目标影片信息
        let movieInfo = movie_data.find(item => item.filmName === film_name);
        if (!movieInfo) {
          movieInfo = movie_data.find(
            item =>
              convertFullwidthToHalfwidth(item.filmName) ===
              convertFullwidthToHalfwidth(film_name)
          );
          if (!movieInfo) {
            console.warn("获取目标影片信息失败", movie_data, film_name);
            let targetFilmList = movie_data.map(item => {
              const repeatedCharsResult = findMostRepeatedChars(
                item.filmName,
                film_name
              );
              return {
                ...item,
                ...repeatedCharsResult
              };
            });
            targetFilmList = targetFilmList.sort(
              (a, b) => b.similarity - a.similarity
            );
            // 必须有4个重复字符才采用模糊匹配结果
            if (targetFilmList[0]?.totalRepeated >= 4) {
              movieInfo = targetFilmList[0];
            } else {
              this.logList.push({
                opera_time: getCurrentTime(),
                des: "获取目标影片信息失败",
                level: "error",
                info: {
                  film_name,
                  movie_data
                }
              });
              const transferParams = await this.transferOrder(item);
              return { transferParams };
            }
          }
        }
        // 6、获取目标影片的放映日期
        const { filmId } = movieInfo;
        const playDateList = await this.getMoviePlayDate({
          cinemaLinkId,
          filmId
        });
        if (!playDateList?.length) {
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let targetShowInfo = playDateList?.find(item =>
          item.schedules?.some(
            itemA => +new Date(+itemA.showTime) === +new Date(show_time)
          )
        );
        // 获取某个放映日期的场次列表
        const showList = targetShowInfo?.schedules || [];
        let start_time = show_time.split(" ")[1].slice(0, 5);
        // 解决同一时间多场次问题
        let targetShowList = showList.filter(
          itemA => +new Date(+itemA.showTime) === +new Date(show_time)
        );
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hallName,
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
          console.warn("匹配影片放映日期失败", showList, start_time);
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
        console.log("targetShow===>", targetShow);
        // 8、获取座位布局
        hallId = targetShow.hallId;
        scheduleId = targetShow.scheduleId;
        scheduleKey = targetShow.scheduleKey;
        const areaRes = await this.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey
        });
        seatList = areaRes?.seats || [];
        let areaInfoList = areaRes?.areaInfos || [];
        areaInfoList = areaInfoList.map(item => {
          let settlePrice = item.areaPrice || 0 + (item.sareaServiceFee || 0);
          return {
            ...item,
            settlePrice
          };
        });
        if (!seatList?.length) {
          console.error("获取座位布局异常");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取座位布局异常",
            level: "error",
            info: {
              error: seatListRes?.error
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 9、匹配作为ids
        let seatName = lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号");
        console.log("seatName", seatName);
        let selectSeatList = seatName.split(",");
        console.log("selectSeatList", selectSeatList);
        let targeSeatList = seatList.filter(item => {
          const { rowName, columnName } = item;
          // let seat1 = yCoord + "排" + columnName + "号";
          let seat2 = rowName + "排" + columnName + "号";
          return selectSeatList.includes(seat2);
        });
        console.log("targeSeatList", targeSeatList);
        seatIds = targeSeatList.map(item => ({ seatId: item.seatId }));
        // 座位价格信息
        targeSeatList.forEach(item => {
          let targetItem = areaInfoList.find(
            itemA => itemA.areaId === item.areaId
          );
          if (targetItem) {
            areaTotalPrice += targetItem.areaSettlePrice;
          }
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "目标座位相关信息",
          level: "info",
          info: {
            targeSeatList,
            areaInfoList,
            areaTotalPrice
          }
        });
        if (seatIds?.length != ticket_num) {
          console.error("获取目标座位失败");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取目标座位失败",
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
        // 有创建订单号就取消订单
        if (orderId) {
          // 先用上个号的token取消订单，然后再重新出票
          const cancelRes = await this.cannelOneOrder({
            cinemaLinkId,
            orderId,
            session_id:
              this.currentParamsList[this.currentParamsInx - 1].session_id
          });
          if (cancelRes.error) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "上个号取消订单失败",
              level: "info",
              info: {
                error: cancelRes.error
              }
            });
            console.warn("上个号取消订单失败,微信发送消息通知并直接走转单");
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
        }
        // 有锁座订单号就解锁座位
        if (!orderId && lockOrderId) {
          const unlockRes = await this.unlockSeatByApp({
            cinemaLinkId,
            lockOrderId,
            session_id:
              this.currentParamsList[this.currentParamsInx - 1].session_id
          });
          if (!unlockRes.isSuccess) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "上个号释放座位失败",
              level: "info",
              info: {
                error: unlockRes.error
              }
            });
          }
        }
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
      }
      // 4、锁定座位
      let params = {
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.map(item => item.seatId).join("|"),
        seatList,
        lockseat,
        plat_name,
        order_number
      };
      let lockRes;
      try {
        lockRes = await this.lockSeatHandle(params); // 锁定座位
      } catch (error) {
        console.error("锁定座位失败准备试错2次，间隔5秒", error);
        // 非这两种情况才需要走重试，这两种情况已经走帮助锁座逻辑了
        let isTrial = !["座位旁边不要留空", "座位中间不要留空"].includes(
          error?.msg
        );
        if (isTrial) {
          // 试错3次，间隔5秒
          // 锁定座位尝试配置
          let delayConfig = {
            lieren: [10, 5],
            mangguo: [10, 5],
            sheng: [10, 5],
            mayi: [10, 5],
            yangcong: [10, 5],
            haha: [6, 5],
            yinghuasuan: [6, 5],
            shangzhan: [6, 5]
          };
          lockRes = await trial(
            inx => this.lockSeatHandle(params, inx),
            delayConfig[plat_name][0],
            delayConfig[plat_name][1]
          );
        }
        if (!lockRes) {
          if (isTrial) {
            console.error("单个订单试错后仍锁定座位失败", "需要走转单逻辑");
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "首次锁定座位失败轮询尝试后仍失败，走转单",
              level: "info"
            });
          }
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        if (isTrial) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "首次锁定座位失败试错后锁定成功",
            level: "info"
          });
        }
      }

      lockOrderId = lockRes?.lockOrderId;
      const orderInfoRes = await this.getOptimalCardQuanCompose({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.map(item => item.seatId).join("|"),
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      if (!orderInfoRes) {
        console.error("获取最优卡券组合失败");
        const transferParams = await this.transferOrder(item, {
          cinemaLinkId,
          lockOrderId
        });
        return { offerRule, transferParams };
      }
      let cardList = orderInfoRes?.cards || [];
      cardList = JSON.parse(JSON.stringify(cardList));
      if (cardList?.length && offerRule.offer_type != "1") {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(
              itemA => itemA.card_num === item.cardNumber
            )
          );
        }
      }
      const { canUseCoupon, preferCoupons } =
        orderInfoRes?.preferCouponInfo || {};
      let quanList = canUseCoupon ? preferCoupons || [] : [];
      // USEFUL 表示优惠券有效且可用，CANCEL 表示优惠券已被取消或不可用
      quanList = quanList.filter(item => item.state == "USEFUL");
      let activities = orderInfoRes?.privileges || [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最优卡券组合返回",
        level: "info",
        info: {
          "cardList(从可用卡列表过滤后的卡:)": cardList,
          oldCardList: orderInfoRes?.cards,
          quanList: quanList.slice(0, 10),
          activities
        }
      });
      // 原总价
      total_price = activities.find(
        item => item.payMethod === ""
      )?.originalTicketTotalPrice;
      console.warn("获取最优卡券组合列表返回", cardList, quanList, activities);
      // 7、使用优惠券或者会员卡
      let member_discount_list = activities.filter(
        item => item.cardInfos?.length
      );
      if (member_discount_list.length) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员卡支付-优惠活动列表",
          level: "info",
          info: {
            member_discount_list: JSON.parse(
              JSON.stringify(member_discount_list)
            )
          }
        });
        member_discount_list = member_discount_list.filter(item => {
          let privilegeTotalPrice = item.privilegeTotalPrice;
          // cardInfos里面可能有多个卡号，要保证有卡余额大于活动时的支付价格
          let cardInfos = item.cardInfos.map(itemC => ({
            ...itemC,
            balance: cardList.find(
              itemA => itemA.cardNumber == itemC.cardNumber
            )?.balance
          }));
          return cardInfos.some(item => item.balance >= privilegeTotalPrice);
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员卡支付-优惠活动列表（根据卡余额过滤后）",
          level: "info",
          info: {
            member_discount_list: JSON.parse(
              JSON.stringify(member_discount_list)
            )
          }
        });
        // 从小到大排序
        member_discount_list = member_discount_list.sort(
          (a, b) => a.privilegeTotalPrice - b.privilegeTotalPrice
        );
      }
      let target_card_info = member_discount_list[0];
      let member_total_price, cardInfos;
      if (target_card_info) {
        total_price = target_card_info.originalTicketTotalPrice;
        member_total_price = target_card_info.privilegeTotalPrice;
        cardInfos = target_card_info.cardInfos;
        cardInfos = cardInfos.map(itemC => ({
          ...itemC,
          balance: cardList.find(itemA => itemA.cardNumber == itemC.cardNumber)
            ?.balance
        }));
        // 从大到小排序
        cardInfos = cardInfos.sort((a, b) => b.balance - a.balance);
      }
      // 如果会员价为0时，取报价记录里的真实会员价
      if (member_total_price === undefined && offerRule.offer_type != "1") {
        member_total_price = (offerRule.real_member_price * 1000 * 100) / 1000;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "会员总价计算相关信息",
        level: "info",
        info: {
          total_price,
          member_total_price,
          ticket_num,
          real_member_total_price: offerRule.real_member_price,
          cardInfos
        }
      });
      let {
        card_id,
        cardNum,
        profit = 0,
        useQuan = [],
        quanStock
      } = await this.useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        total_price,
        member_total_price, // 会员总价
        rewards,
        appFlag,
        cinemaLinkId,
        plat_name
      });
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用会员卡或优惠券返回",
        level: "info",
        info: {
          card_id,
          useQuan,
          profit
        }
      });
      let failMsg;
      if (offerRule.offer_type === "1") {
        if (!useQuan?.length) {
          failMsg = "无可用优惠券";
        }
        if (offerRule.quan_fee > 0 && !card_id) {
          failMsg = "无可补券手续费的会员卡";
        }
      } else {
        if (!card_id) {
          failMsg = "无可用会员卡";
        }
      }
      // 使用优惠券及会员卡
      if (failMsg) {
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        const errMsg = errInfoObj?.des || "";
        if (errMsg) {
          failMsg = failMsg + "-" + errMsg;
        }
        console.error(failMsg);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: failMsg,
          level: "error",
          info: {
            cardList,
            quanList: quanList.slice(0, 10),
            supplier_end_price,
            ticket_num,
            total_price,
            activities
          }
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.transferOrder(item, {
            cinemaLinkId,
            lockOrderId
          });
          return { offerRule, transferParams };
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "非最后一次用卡用券失败，走换号",
            levle: "info"
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              cinemaLinkId,
              hallId,
              scheduleId,
              lockOrderId,
              scheduleKey,
              seatIds,
              areaTotalPrice,
              seatList,
              offerRule,
              targetShow
            }
          });
        }
      }
      let payAmount = member_total_price; // 会员支付价
      // 券抵扣金额（这种券比较少，且没法算成本，暂时不考虑）
      // let quanDiscountAmount = +(useQuan?.[0]?.discountAmount || 0);
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        // total_price = orderInfoRes?.preferCouponInfo?.totalTicketPrivilegePrice;
        if (offerRule.quan_fee > 0) {
          // 支付价格要乘以100
          payAmount = (+offerRule.quan_fee * 1000 * ticket_num) / 10 || 0;
          // 这里本身单位就乘过100了，故不用再乘100
          let realPayAmount =
            (quanList[0].discountValue * 1000 * ticket_num) / 1000;
          // payAmount = realPayAmount;
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "券补钱总价计算相关信息",
            level: "info",
            info: {
              total_price,
              realPayAmount,
              quanInfo: quanList[0],
              quan_fee: offerRule.quan_fee,
              ticket_num
            }
          });
        } else {
          payAmount = 0;
        }
        if (offerRule.is_store == "1" && quanList.length - ticket_num < 15) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "本次出票后券小于15，开始异步绑定券",
            level: "info"
          });
          this.getNewQuan({
            cinemaLinkId,
            quanValue: offerRule.quan_value,
            black_quans: offerRule.black_quans,
            quanNum: 15 - (quanList.length - Number(ticket_num)),
            session_id:
              this.currentParamsList[this.currentParamsInx].session_id,
            asyncFlag: 1,
            asyncBandQuanList: [],
            plat_name,
            order_number
          });
        }
      }

      console.warn("payAmount", payAmount, "card_id", card_id);
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      let tickets, payments;
      if (offerRule.offer_type !== "1" && card_id) {
        if (target_card_info) {
          card_id = cardInfos?.[0]?.cardNumber;
        }
        payments = [{ payMethod: "CARD", payCardNumber: card_id }];
        const minItem = activities.reduce((min, current) => {
          const currentPrivilegeTotalPrice = +current.privilegeTotalPrice;
          const minPrivilegeTotalPrice = +min.privilegeTotalPrice;
          return currentPrivilegeTotalPrice < minPrivilegeTotalPrice
            ? current
            : min;
        }, activities[0]); // 初始值为数组的第一个元素
        tickets = minItem?.ticketInfos?.map(item => ({
          seatId: item.seatId,
          activityId: item.activityId
        }));
      } else if (offerRule.offer_type == "1" && quan_code) {
        payments = useQuan.map(item => ({
          payMethod: "COUPON",
          couponCodeParams:
            item.couponCode +
            "-" +
            item.couponType +
            (item.concreteProductType == "COMMON" ? "-TICKET" : "")
        }));
        if (offerRule.quan_fee > 0 && card_id) {
          payments.push({ payMethod: "CARD", payCardNumber: card_id });
        }
        tickets = activities
          .find(
            item =>
              item.payMethod === "" &&
              item.privilegeTypes?.[0] == "ORIGINAL_PRICE"
          )
          ?.ticketInfos?.map(item => ({
            seatId: item.seatId,
            activityId: item.activityId
          }));
      }
      tickets = JSON.stringify(tickets);
      payments = JSON.stringify(payments);
      // 特殊券
      if (useQuan?.[0]?.concreteProductType == "COMMON") {
        // 支付前核销查询优惠券信息
        await this.checkQuan({
          couponCodes: useQuan.map(item => item.couponCode).join(),
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          seatIds: seatIds.map(item => item.seatId).join("|"),
          commonCouponJson: JSON.stringify(
            useQuan.map(item => ({
              couponCode: item.couponCode,
              concreteProductType: "TICKET"
            }))
          )
        });
      }
      // 7、创建订单
      const createOrderRes = await this.createOrder({
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        lockOrderId,
        tickets,
        totalPrice: total_price || areaTotalPrice,
        payAmount,
        payments
      });
      // 用券补钱场景接口返回
      // "bizValue": {
      //     "cardCinemaLinkId": "16015",
      //     "cardNumber": "20004515324X",
      //     "orderId": "250116003002X160191174",
      //     "orderType": "TICKET",
      //     "payMethod": "CARD"
      // },
      orderId = createOrderRes?.orderId;
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let cardNo = card_id;
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (!orderId) {
        console.error("创建订单失败，单个订单直接出票结束", "走转单逻辑");
        const transferParams = await this.transferOrder(item, {
          cinemaLinkId,
          lockOrderId
        });
        return { offerRule, transferParams };
      }
      console.warn("创建订单成功", orderId, profit, card_id, offerRule);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单成功",
        level: "info"
      });
      if (isTestOrder) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "测试单暂不购买",
          level: "info"
        });
        return { offerRule };
      }
      payAmount = Number(payAmount) / 100;
      // 支付前校验用券价格
      if (
        offerRule.offer_type == "1" &&
        useQuan?.length &&
        payAmount > quan_fee_total
      ) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "用完券发现支付金额大于券手续费*票数，走转单",
          level: "error",
          info: {
            payAmount,
            quan_fee_total,
            quan_fee,
            ticket_num
          }
        });
        const transferParams = await this.transferOrder(item, {
          cinemaLinkId,
          orderId
        });
        return { offerRule, transferParams };
      }
      // 支付前校验用卡价格
      let real_member_total_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        if (payAmount > real_member_total_price) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "用完卡发现支付金额大于真实会员总价，走转单",
            level: "error",
            info: {
              payAmount,
              real_member_total_price,
              ticket_num
            }
          });
          const transferParams = await this.transferOrder(item, {
            cinemaLinkId,
            orderId
          });
          return { offerRule, transferParams };
        } else if (payAmount < real_member_total_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_total_price * 1000 - payAmount * 1000) *
              member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
        cardNo = card_id;
      }
      // 8、购买电影票
      let buyTicketRes;
      if (card_id) {
        buyTicketRes = await buyTicket({
          cinemaLinkId,
          cardNo,
          orderId,
          appFlag,
          session_id: this.currentParamsList[this.currentParamsInx].session_id,
          member_pwd: this.currentParamsList[this.currentParamsInx].member_pwd
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单购买返回",
          level: "info",
          info: buyTicketRes
        });
        const buyRes = buyTicketRes?.buyRes;
        if (!buyRes) {
          console.error("订单购买失败，单个订单直接出票结束", "走转单逻辑");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "订单购买失败",
            level: "error",
            info: {
              error: buyTicketRes?.error
            }
          });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            cinemaLinkId,
            orderId
          });
          return { offerRule, transferParams };
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单购买成功",
          level: "info"
        });
        // 更新卡使用量
        updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number
        });
      } else {
        buyTicketRes = {
          code: 1,
          msg: "纯用券时不需要购买"
        };
      }
      if (offerRule.offer_type === "1" && useQuan?.length) {
        // 更新券库存
        this.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.curPhone,
          isPay: 1
        });
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.lastHandle({
        orderId,
        cinemaLinkId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        orderInfo: item,
        lockseat,
        isUseQuan: useQuan?.length
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "订单最后处理成功:获取取票码并上传",
          level: "info"
        });
      }
      console.log("一键买票完成");
      return {
        profit,
        qrcode: lastRes?.qrcode,
        submitRes: lastRes?.submitRes,
        quan_code,
        card_id,
        cardNum,
        offerRule
      };
    } catch (error) {
      console.error("一键买票异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "一键买票异常",
        level: "error",
        info: {
          error
        }
      });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: JSON.stringify(error)
      });
      return { offerRule };
    }
  }

  // 查询最近用券记录返回
  async queryUsedQuanList({ quan_value, app_name }) {
    const params = {
      order_status: "1",
      quan_value,
      app_name,
      rule: rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      const res = await svApi.queryUsedQuanList(params);
      const usedQuanList = res.data?.usedQuanList || [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最近用券记录入参及返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return usedQuanList;
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最近用券记录异常",
        level: "info",
        info: {
          params,
          error
        }
      });
      return [];
    }
  }

  // 锁定座位
  async lockSeatHandle(data, inx = 1) {
    const {
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      seatList,
      lockseat,
      plat_name,
      order_number,
      assistFlag // 帮助锁座后重试标识
    } = data;
    const session_id = this.currentParamsList[this.currentParamsInx].session_id;
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      seatIds,
      scheduleId,
      scheduleKey,
      seatIds,
      umeToken: session_id
    };
    const { appFlag } = this;
    try {
      // 不需要每个都调下，解决锁定座位时没座位返回重进就有座位的问题
      if (inx % 2 === 1) {
        await this.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey,
          session_id
        });
        await mockDelay(1);
      }

      console.log("锁定座位参数", params);
      const res = await this.umeApi.lockSeat(params);
      console.log("锁定座位返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次锁定座位成功`,
        level: "info",
        info: {
          res,
          params
        }
      });
      return res?.bizValue;
    } catch (error) {
      console.error("锁定座位异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次锁定座位异常`,
        level: "error",
        info: {
          params,
          error
        }
      });
      // 仅帮助锁座1次，帮助锁座后再锁定座位失败的话就不走帮助锁座逻辑了
      if (
        ["座位旁边不要留空", "座位中间不要留空"].includes(error?.msg) &&
        assistFlag != 1
      ) {
        const areaRes = await this.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey,
          session_id
        });
        let newSeatList = areaRes?.seats || [];
        // 帮助锁定座位方法
        const res = await assistLockSeatObj.assistLockSeatHandle({
          app_name: appFlag,
          plat_name,
          order_number,
          seatList: newSeatList,
          lockseat,
          lockSeatParams: params
        });
        if (!res) {
          return Promise.reject(error);
        } else {
          return this.lockSeatHandle({ ...data, assistFlag: 1 });
        }
      }
      return Promise.reject(error);
    }
  }

  // 核销券
  async checkQuan(data) {
    try {
      const { session_id } = this.currentParamsList[this.currentParamsInx];
      let params = {
        ...data,
        umeToken: session_id
      };
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "核销券参数",
        level: "info",
        info: { params }
      });
      const res = await this.umeApi.checkQuan(params);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "核销券返回",
        level: "info",
        info: {
          res
        }
      });
    } catch (error) {
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "核销券异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
  // 创建订单
  async createOrder(data) {
    let {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      lockOrderId,
      tickets,
      totalPrice,
      payAmount,
      payments,

      isTimeoutRetry = 1 // 默认超时重试
    } = data;
    const { session_id, mobile } =
      this.currentParamsList[this.currentParamsInx];
    try {
      let params = {
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        lockOrderId,
        tickets,
        totalPrice,
        payAmount,
        payments,
        mobile,
        umeToken: session_id
      };
      console.log("创建订单参数", params);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单参数",
        level: "info",
        info: { params }
      });
      const res = await this.umeApi.createOrder(params);
      console.log("创建订单返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单返回",
        level: "info",
        info: {
          res
        }
      });
      let createOrderRes = res.bizValue;
      return createOrderRes;
    } catch (error) {
      console.error("创建订单异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "创建订单异常",
        level: "error",
        info: {
          error
        }
      });
      if (error?.msg?.includes("超时") && isTimeoutRetry === 1) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "创建订单接口超时，延迟1秒后重试",
          level: "info"
        });
        await mockDelay(1);
        try {
          const createOrderRes = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (createOrderRes) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "创建订单请求接口超时，延迟2秒后重试成功",
              level: "info",
              info: {
                createOrderRes
              }
            });
            return createOrderRes;
          }
        } catch (error) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "创建订单请求接口超时，延迟2秒后重试失败",
            level: "error",
            info: { error }
          });
        }
      }
    }
  }

  // 获取购票信息
  async getPayResult(data) {
    let {
      orderId,
      cinemaLinkId,
      session_id,
      syncQueryLogList,
      isUseQuan,
      inx = 1
    } = data || {};
    let qrcode;
    let targetLogList = syncQueryLogList || this.logList;
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        orderId,
        orderType: "TICKET",
        cinemaLinkId,
        needMatchConsumeGift: !!isUseQuan,
        umeToken: session_id
      };
      console.log("获取支付结果参数", params);
      if (inx == 1) {
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: "获取支付结果参数",
          level: "info",
          info: {
            params
          }
        });
      }
      const res = await this.umeApi.getOrderInfo(params);
      console.log("获取支付结果返回", res);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次获取支付结果返回`,
        level: "info",
        info: {
          res
        }
      });
      qrcode =
        res?.bizValue?.ticketInfo?.confirmationId?.split(",").join("|") || "";
    } catch (error) {
      console.error("获取订单支付结果异常", error);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: `第${inx}次获取订单支付结果异常`,
        level: "error",
        info: {
          error
        }
      });
      // 获取失败后从已完成订单里匹配获取
      try {
        const listRes = await this.umeApi.getOrderList({
          umeToken: session_id
        });
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次获取已完成订单列表返回`,
          level: "error",
          info: {
            listRes: listRes?.bizValue?.slice(0, 2)
          }
        });
        let payList = listRes.bizValue || [];
        let targetObj = payList.find(item => item.orderId == orderId);
        qrcode = targetObj?.ticketInfo?.confirmationId?.split(",").join("|");
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次从已完成订单里获取取票码${qrcode ? "成功" : "失败"}`,
          level: "error",
          info: {
            qrcode
          }
        });
      } catch (error) {
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: `第${inx}次获取已完成订单列表异常`,
          level: "error",
          info: {
            error
          }
        });
      }
    }
    if (qrcode) {
      return qrcode;
    }
    return Promise.reject("获取支付结果不存在");
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
    let targetLogList = flag === 1 ? this.logList : syncQueryLogList;
    let params;
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
        orderInfo,
        transferTip: "哈哈暂不上传取票码,需手动上传",
        failReason: "哈哈暂不上传取票码,需手动上传"
      });
      return { code: 1, msg: "哈哈暂不上传取票码,需手动上传" };
      const { bid, cinema_name, hall_name, film_name, show_time } = orderInfo;
      params = {
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
      console.log("提交出票码参数", params);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "提交出票码参数",
        level: "info",
        info: {
          params
        }
      });
      if (isTestOrder) {
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: "测试单暂不上传",
          level: "error"
        });
        return;
      }
      const res = await PLAT_API_OBJ[plat_name].submitTicketCode(params);
      console.log("提交出票码返回", res);
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
      console.error("提交出票码异常", error);
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
    orderId,
    cinemaLinkId,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    plat_name,
    orderInfo,
    lockseat,
    isUseQuan
  }) {
    const { appFlag } = this;
    try {
      let qrcode;
      const session_id =
        this.currentParamsList[this.currentParamsInx].session_id;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderId,
          cinemaLinkId,
          session_id,
          isUseQuan
        });
      } catch (error) {}
      if (!qrcode) {
        console.error("获取订单结果失败，单个订单直接出票结束");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取订单支付结果，取票码不存在，暂时返回异步获取",
          level: "error"
        });
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "获取订单支付结果，取票码不存在，准备开始异步轮询获取"
        });
        this.asyncFetchQrcodeSubmit({
          orderId,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat,
          session_id,
          isUseQuan
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
    orderId,
    order_id,
    app_name,
    card_id,
    plat_name,
    order_number,
    supplierCode,
    orderInfo,
    lockseat,
    session_id,
    isUseQuan
  }) {
    let syncQueryLogList = []; // 异步运行日志
    try {
      syncQueryLogList.push({
        opera_time: getCurrentTime(),
        des: "异步轮询获取取票码并提交方法开始执行",
        level: "error"
      });
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderId,
            cinemaLinkId,
            session_id,
            inx,
            syncQueryLogList,
            isUseQuan
          }),
        9,
        20,
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        syncQueryLogList.push({
          opera_time: getCurrentTime(),
          des: "系统延迟轮询3分钟后获取取票码仍失败",
          level: "error"
        });
        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.getPayResult({
              orderId,
              cinemaLinkId,
              session_id,
              inx,
              syncQueryLogList,
              isUseQuan
            }),
          21,
          20,
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
        console.error("订单提交取票码失败，单个订单直接出票结束");
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: "提交取票码失败",
          level: "error"
        });
        let errInfo = formatErrInfo(submitRes?.error);
        sendWxPusherMessage({
          orderInfo,
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
        level: "info",
        info: {
          error
        }
      });
    }
  }

  // 使用优惠券或会员卡
  async useQuanOrCard({
    cardList,
    quanList,
    supplier_end_price,
    ticket_num,
    offerRule,
    total_price,
    member_total_price, // 会员总价
    rewards,
    appFlag,
    plat_name
  }) {
    try {
      const {
        offer_type,
        member_price, // 成本价
        offer_rule_id
      } = offerRule;
      let is_auto_use_quan = false; // 是否灵活用券
      let card_id = "";
      let useCardParms = {
        cardList,
        member_price, // 成本价
        member_total_price,
        rewards,
        supplier_end_price,
        ticket_num,
        plat_name
      };
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
          console.log("使用会员卡出票");
          return await this.useCardHandle(useCardParms);
        }
      }
      if (offerRule.offer_type == "1" || is_auto_use_quan) {
        console.log("使用优惠券出票");
        if (is_auto_use_quan) {
          const quanInfo = await this.getQuanInfo(
            offerRule.quan_value,
            appFlag
          );
          offerRule.quan_id = quanInfo?.id;
          offerRule.quan_cost = quanInfo?.quan_cost;
          offerRule.quan_flag = quanInfo?.quan_flag;
          offerRule.quan_fee = quanInfo?.quan_fee;
          offerRule.is_store = quanInfo?.is_store;
          offerRule.black_quans = quanInfo?.black_quans;
        }
        let { quan_value, quan_cost, quan_flag, quan_fee, black_quans } =
          offerRule;
        // 根据券标识获取目标券
        let targetQuanList = quanList.filter(
          item => couponInfoSpecial(item.name) === couponInfoSpecial(quan_flag)
        );
        // 增加已用完过滤，防止核销延迟导致用券失败
        const usedQuanList = await this.queryUsedQuanList({
          quan_value: offerRule.quan_value,
          app_name: appFlag
        });
        // 最近用券记录过滤
        if (usedQuanList?.length) {
          targetQuanList = targetQuanList.filter(
            item =>
              !usedQuanList.some(itemA =>
                itemA.quan_code?.includes(item.couponCode)
              )
          );
        }
        // 券黑名单过滤
        if (black_quans) {
          targetQuanList = targetQuanList.filter(
            item => !black_quans?.includes(item.couponCode)
          );
        }
        // 优先使用快过期的券
        targetQuanList = targetQuanList.sort(
          (a, b) => +new Date(a.expireTime) - new Date(b.expireTime)
        );
        // 更新券库存
        this.updateQuanStock({
          quan_stock: targetQuanList.length,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
        if (targetQuanList.length < ticket_num) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "目标券不足",
            level: "info",
            info: {
              targetQuanList,
              ticket_num
            }
          });
          console.warn("优惠券不够用");
          console.error(`${quan_value} 面额券不足，不支持从服务端同步获取`);
          if (is_auto_use_quan) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "灵活用券时获取目标券不足,转用卡处理",
              level: "info"
            });
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            card_id: ""
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map((item, index) => {
          return {
            couponType: item.couponType,
            concreteProductType: item.concreteProductType,
            compensatePrice: item.compensatePrice,
            couponCode: item.couponCode,
            couponName: item.couponName,
            discountAmount: item.discountValue
          };
        });
        let profit =
          supplier_end_price -
          quan_cost -
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
          console.error("最终利润为负，单个订单直接出票结束");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `使用优惠券后最终利润为负${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
            level: "error",
            info: {
              profit
            }
          });
          if (is_auto_use_quan) {
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            card_id: ""
          };
        }
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.balance >= quan_fee * 100 * ticket_num
          );
          if (!cardData?.length) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: `使用优惠券后发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
              level: "error",
              info: {
                quan_fee,
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
          // 取最大余额
          cardData = cardData.sort((a, b) => b.balance - a.balance);
          card_id = cardData?.[0]?.cardNumber;
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          profit,
          card_id,
          useQuan,
          quanStock: targetQuanList.length
        };
      }
    } catch (error) {
      console.error("使用会员卡或优惠券报错", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "使用会员卡或优惠券报错",
        level: "error",
        info: {
          error
        }
      });
      // return {}
    }
  }

  // 会员用卡处理
  async useCardHandle(data) {
    const {
      cardList,
      member_price, // 成本价
      member_total_price,
      rewards,
      supplier_end_price,
      ticket_num,
      plat_name
    } = data;
    try {
      let cardData = cardList.filter(
        item => item.balance >= member_total_price
      );
      if (!cardData?.length) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员卡余额不足",
          level: "error",
          info: {
            cardList,
            member_total_price: member_total_price
          }
        });
        console.warn("无可用会员卡", member_price);
        return {
          card_id: "",
          profit: 0 // 利润
        };
      }
      // 中标价-会员成本价
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
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        console.error("最终利润为负，单个订单直接出票结束");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "使用会员卡计算价格后最终利润为负",
          level: "error",
          info: {
            profit
          }
        });
        return {
          profit: 0,
          card_id: ""
        };
      }
      profit = Number(profit).toFixed(2);
      return {
        card_id: cardData?.[0]?.cardNumber,
        cardNum: cardData?.[0]?.cardNumber,
        profit // 利润
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

  // 获取影院指定会员卡
  async getUsableCardList(cinemaLinkId, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,balance,mobile,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
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
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
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
    cinemaLinkId,
    quanValue: quan_value,
    black_quans,
    quanNum,
    session_id,
    asyncFlag,
    asyncBandQuanList,
    plat_name,
    order_number
  }) {
    const { appFlag } = this;
    let targetLogList = asyncFlag === 1 ? asyncBandQuanList : this.logList;
    let conPrev = asyncFlag === 1 ? "异步绑券_" : "";
    let params = {
      quan_value,
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

      let quanList = quanRes.data?.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        console.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          cinemaLinkId,
          coupon_num: quan.coupon_num,
          session_id,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogList.push({
          opera_time: getCurrentTime(),
          des: `${conPrev}绑定券返回`,
          level: "error",
          info: {
            ...couponNumRes
          }
        });
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
      }
      return bandQuanList;
    } catch (error) {
      console.error("获取新券异常", error);
      targetLogList.push({
        opera_time: getCurrentTime(),
        des: "从服务端获取券异常",
        level: "error",
        info: {
          error,
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

  // 取消订单
  async cannelOneOrder({ cinemaLinkId, orderId, session_id }) {
    let params = {
      empCode: "",
      leaseCode: "",
      orderType: "TICKET",
      cinemaLinkId,
      orderId,
      umeToken: session_id
    };
    try {
      console.log("取消订单参数", params);
      const res = await this.umeApi.cannelOneOrder(params);
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
      console.error("取消订单异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "取消订单异常",
        level: "info",
        info: {
          error,
          params
        }
      });
      return {
        error
      };
    }
  }

  // 获取城市影院列表
  async getCityCinemaList() {
    let params = {
      empCode: "",
      leaseCode: ""
    };
    try {
      console.log("获取城市影院列表参数", params);
      const res = await this.umeApi.getCinemaList(params);
      console.log("获取城市影院列表返回", res);
      let list = res.bizValue?.cities || [];
      // 通过排查以往ume系列订单，发现cinemaCode和cinemaLinkId值并不一样，故此处先不赋同值
      list = list.map(item => ({
        cityName: item.cityName,
        cinemaList: item.cinemas.map(itemA => ({
          ...itemA,
          cinemaId: itemA.cinemaLinkId
        }))
      }));
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取城市影院列表返回",
        level: "info",
        info: {
          list
        }
      });
      return list;
    } catch (error) {
      console.error("获取城市影院异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取城市影院异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 获取电影放映列表
  async getMoviePlayInfo({ cinemaLinkId }) {
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      posterSize: "SMALL"
    };
    try {
      console.log("获取影院放映列表参数", params);
      const res = await this.umeApi.getMoviePlayInfo(params);
      let fimlList = res?.bizValue || [];
      // [

      //     {
      //         "actors": "宋佳,钟楚曦,章宇",
      //         "directors": "邵艺辉",
      //         "filmId": "001104702024",
      //         "filmName": "好东西",
      //         "filmVersion": "2D",
      //         "introduction": "爱逞强的单亲妈妈王铁梅（宋佳 饰）带小孩王茉莉（曾慕梅 饰）搬到新家，结识了所谓清醒恋爱脑的邻居小叶（钟楚曦 饰）。两位性格迥异的女性，一个坚强，一个柔软，一个擅长给人当妈，一个擅长随时撒谎。面对旧创伤和新挑战，她们彼此温暖互相慰藉。\r\n     而围绕王铁梅的两个男人，前夫（赵又廷 饰）不时“添乱”，女儿的鼓手老师（章宇 饰）似乎充满新的可能。作为已经觉醒的女人们和学习过性别议题的男人们，会遇到什么新问题？会如何看待自己和世界？",
      //         "poster": "https://gw.alicdn.com/bao/uploaded/i1/O1CN01c2Josl22fq5URZwAm_!!6000000007148-0-alipicbeacon.jpg_300x300.jpg",
      //         "privilegeTags": [
      //             {
      //                 "shortActivityTag": "惠"
      //             }
      //         ],
      //         "rating": "9.7",
      //         "showDate": "1732204800000",
      //         "showStatus": "SHOWING"
      //     },
      // ]
      console.log("获取影院放映列表返回", fimlList);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取影院放映列表返回",
        level: "info",
        info: {
          fimlList
        }
      });
      return fimlList;
    } catch (error) {
      console.error("获取电影放映列表异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取电影放映场次
  async getMoviePlayDate({ cinemaLinkId, filmId }) {
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        cinemaLinkId
      };
      console.log("获取电影放映日期参数", params);
      const res = await this.umeApi.getMoviePlayDate(params);
      console.log("获取电影放映日期返回", res);
      let films = res?.bizValue?.films || [];
      let filmDates = films.find(item => item.filmId === filmId)?.dates || [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映日期返回",
        level: "info",
        info: {
          filmDates
        }
      });
      return filmDates;
    } catch (error) {
      console.error("获取电影放映日期异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映日期异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取座位布局
  async getSeatLayout({
    cinemaLinkId,
    hallId,
    scheduleId,
    scheduleKey,
    session_id
  }) {
    try {
      let params = {
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        apiVersion: "1.0",
        empCode: "",
        leaseCode: "",
        session_id
      };
      console.log("获取座位布局参数", params);
      const res = await this.umeApi.getMoviePlaySeat(params);
      let sections = res.bizValue?.sections?.[0] || {};
      console.log("获取座位布局返回", res);
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取座位布局返回",
      //   level: "info",
      //   info: {
      //     res
      //   }
      // });
      return sections;
    } catch (error) {
      console.error("获取座位布局异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取座位布局异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
  // 获取最优卡券列表组合
  async getOptimalCardQuanCompose({
    cinemaLinkId,
    hallId,
    scheduleId,
    scheduleKey,
    seatIds,
    session_id
  }) {
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      umeToken: session_id
    };
    try {
      console.log("获取最优卡券列表组合参数", params);
      const res = await this.umeApi.getCardQuanList(params);
      console.log("获取最优卡券列表组合返回", res);
      let orderInfo = res.bizValue;
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最优卡券列表组合返回",
        level: "info",
        info: {
          orderInfo,
          params
        }
      });
      return orderInfo;
    } catch (error) {
      console.error("获取最优卡券列表组合返回异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最优卡券列表组合返回异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取影院券类型列表
  async getSortPhoneByQuanTypeList(app_name, quan_flag) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let targetQuanInfo = quanTypeList.find(
        item => item.quan_flag == quan_flag
      );
      let quanStockList = targetQuanInfo?.quanStockList;
      if (quanStockList) {
        quanStockList = JSON.parse(quanStockList);
        quanStockList = quanStockList.map(itemA => ({
          ...itemA,
          quan_stock: itemA.quan_stock || 0
        }));
        console.log("quanStockList", quanStockList);
        let useMobileList = getCinemaLoginInfoList()
          .filter(
            item => item.app_name === app_name && item.mobile && item.session_id
          )
          .map(item => item.mobile);
        console.log("useMobileList", useMobileList);
        quanStockList = quanStockList.filter(itemA =>
          useMobileList.includes(itemA.phone)
        );
        quanStockList.sort((a, b) => +b.quan_stock - +a.quan_stock);
        let sortMobileList = quanStockList.map(item => item.phone);
        console.log("sortMobileList", sortMobileList);
        return sortMobileList;
      }
    } catch (error) {
      console.error("根据影院获取券类型列表返回异常", error);
    }
  }
  // 更新券库存
  async updateQuanStock(params) {
    const { quan_stock, quan_flag, phone, app_name, quan_value } = params;
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
          quanStockList[inx].quan_stock = quan_stock;
          quanStockList[inx].real_quan_stock = quan_stock;
          quanStockList[inx].update_time = getCurrentTime();
        } else {
          quanStockList.push({
            phone,
            quan_stock,
            real_quan_stock: quan_stock,
            update_time: getCurrentTime()
          });
        }
      } else {
        quanStockList = [
          {
            phone,
            quan_stock,
            real_quan_stock: quan_stock,
            update_time: getCurrentTime()
          }
        ];
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
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);

// 订单购买
const buyTicket = async ({
  cinemaLinkId,
  cardNo,
  orderId,
  appFlag,
  session_id,
  member_pwd
}) => {
  let params = {
    cinemaLinkId,
    orderId,
    orderType: "TICKET",
    umeToken: session_id
  };
  if (cardNo) {
    params.cardNumber = cardNo;
  }
  params.cardCinemaLinkId = cinemaLinkId;
  params.cardPassword = member_pwd;

  try {
    console.log("订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log("订单购买返回", buyRes);
    return {
      params,
      buyRes
    };
  } catch (error) {
    console.error("订单购买异常", error);
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
    console.log("确认接单参数", params);
    const res = await PLAT_API_OBJ[plat_name].confirmOrder(params);
    console.log("确认接单返回", res);
    return res;
  } catch (error) {
    console.warn("确认接单异常", error);
  }
};

// 绑定券
const bandQuan = async ({ cinemaLinkId, coupon_num, session_id, appFlag }) => {
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    couponCode: coupon_num,
    pinCode: "",
    cinemaLinkId,
    umeToken: session_id
  };
  try {
    await mockDelay(1);
    await APP_API_OBJ[appFlag].bandQuan(params);
    return {
      coupon_num
    };
  } catch (error) {
    console.error("绑定新券异常", error);
    return {
      error,
      errMsg: "绑定新券异常:" + JSON.stringify(params)
    };
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
      cinema_code: order.cinema_code,
      quan_value: res?.offerRule?.quan_value || "",
      order_status: order_status,
      // remark: '',
      processing_time: getCurrentTime(),
      profit: res?.profit || "",
      qrcode: res?.qrcode || "",
      quan_code: res?.quan_code || "",
      card_num: res?.cardNum || "",
      card_id: res?.card_id || "",
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
        transferTip: "疑似队列重复，请重新登录机器"
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
      des: "订单用卡购买后更新当天使用量",
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
