import { computed } from "vue";
import {
  getCurrentFormattedDateTime,
  convertFullwidthToHalfwidth,
  cinemNameSpecial,
  getOrginValue, // 深拷贝获取原值
  mockDelay, // 模拟延时
  logUpload, // 日志上传
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage
} from "@/utils/utils";

import lierenApi from "@/api/lieren-api";
import shengApi from "@/api/sheng-api";
import mangguoApi from "@/api/mangguo-api";
import mayiApi from "@/api/mayi-api";
import yangcongApi from "@/api/yangcong-api";
import hahaApi from "@/api/haha-api";
import svApi from "@/api/sv-api";

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
import { TICKET_CONPREFIX_OBJ, APP_LIST } from "@/common/constant";
import { APP_API_OBJ } from "@/common/index";

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
    this.umeApi = APP_API_OBJ[appFlag];
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
    console.warn(conPrefix + `队列启动`);
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
      if (orders?.length) {
        console.warn(conPrefix + "新的待出票订单列表", orders);
      }
      // 将订单加入队列
      this.enqueue(orders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        // 取出队列首部订单并从队列里去掉
        const order = this.dequeue();
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
                plat_name: order.platName,
                app_name: appFlag,
                order_number: order.order_number,
                type: 3
              },
              log_list
            );
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
              opera_time: getCurrentFormattedDateTime(),
              des: `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}，赋值上个订单号为当前订单号-${this.prevOrderNumber}`,
              level: "error",
              info: {
                res
              }
            });
            if (!isTestOrder) {
              // 添加订单处理记录
              if (res?.submitRes) {
                this.handleSuccessOrderList.push(order);
              } else {
                this.handleFailOrderList.push(order);
              }
              let params = {
                order,
                ticketRes: res,
                appFlag,
                errMsg: this.errMsg,
                errInfo: this.errInfo,
                mobile: JSON.parse(localStorage.getItem("userInfo")).phone
              };
              await addOrderHandleRecored(params);
              // 从缓存里面删除记录
              deleteOrder(order.order_number, appFlag);
              this.logList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `订单出票结束，远端已添加出票记录，本地缓存删除该订单数据`,
                level: "info"
              });
              logUpload(
                {
                  plat_name: order.platName,
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
    }
  }

  // 获取订单
  async fetchOrders(fetchDelay) {
    const { conPrefix, appFlag } = this;
    try {
      await mockDelay(fetchDelay);
      let sfcStayOfferlist = getOrginValue(stayTicketList.items).filter(
        item => item.appName === appFlag
      );
      if (isTestOrder) {
        sfcStayOfferlist = [
          {
            id: 72939,
            platName: "lieren",
            app_name: "yaolai",
            ticket_num: 1,
            rewards: "0",
            order_number: "2024080619281519354",
            supplier_end_price: 40,
            order_id: "7013650",
            tpp_price: "43.89",
            city_name: "南阳",
            cinema_addr: "镇海区庄市大道1088号万科1902广场4楼",
            cinema_code: "41134401",
            cinema_name: "南阳耀莱成龙影城（孔明南路店）",
            hall_name: "5号厅",
            film_name: "抓娃娃",
            show_time: "2024-08-11 23:50:00",
            lockseat: "1排1座",
            cinema_group: "耀莱二线"
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
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`,
        level: "info"
      });
      await mockDelay(delayTime);
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
    console.warn(conPrefix + "自动出票队列停止");
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
    const { platName } = order;
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");
    const { order_number, city_name, cinema_name, film_name, lockseat } = order;
    // 关闭自动转单只针对座位异常生效
    // if (isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    if (isTestOrder || isAutoTransfer !== "1") {
      console.warn("自动转单处于关闭状态");
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `自动转单处于关闭状态`,
        level: "info"
      });
      sendWxPusherMessage({
        platName,
        order_number,
        city_name,
        cinema_name,
        film_name,
        lockseat,
        transferTip: "自动转单处于关闭状态,需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
      return;
    }
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      // 3、获取座位布局
      if (unlockSeatInfo) {
        const { cinemaCode, cinemaLinkId, orderHeaderId } = unlockSeatInfo;
        const isPass = await cannelOneOrder(
          { cinemaCode, cinemaLinkId, orderHeaderId, appFlag },
          1
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `转单前释放座位${isPass ? "成功" : "失败"}`,
          level: "info"
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
      } else if (platName === "yangcong") {
        params = {
          tradeno: order.id
        };
      } else if (platName === "haha") {
        params = {
          id: order.id,
          reasonId: 9,
          text: "其他-"
        };
      }
      console.log(conPrefix + "转单参数", params);
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi,
        yangcong: yangcongApi,
        haha: hahaApi
      };
      console.warn(conPrefix + "【转单】参数", params);
      const res = await requestApi[platName].transferOrder(params);
      console.warn(conPrefix + "【转单】结果", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `转单成功-${JSON.stringify(res)}`,
        level: "info"
      });
      sendWxPusherMessage({
        platName,
        order_number,
        city_name,
        cinema_name,
        film_name,
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
        des: `转单异常-${JSON.stringify(error)}`,
        level: "error"
      });
      sendWxPusherMessage({
        platName,
        order_number,
        city_name,
        cinema_name,
        film_name,
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
    const { id, platName, supplierCode, order_number, bid } = item;
    try {
      console.warn(conPrefix + "单个待出票订单信息", item);
      // 1、解锁座位
      if (!isTestOrder) {
        if (platName === "lieren") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        } else if (platName === "sheng") {
          await startDeliver({
            platName,
            order_number,
            supplierCode,
            appFlag
          });
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "确认接单成功，2秒后解锁",
            level: "info"
          });
          logUpload(
            {
              plat_name: platName,
              app_name: appFlag,
              order_number: order_number,
              type: 3
            },
            this.logList
          );
          await mockDelay(2);
          await this.unlockSeat({
            platName,
            order_number,
            supplierCode,
            inx: 1
          });
        } else if (platName === "mangguo") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        } else if (platName === "mayi") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        } else if (platName === "yangcong") {
          await this.unlockSeat({ platName, order_id: id, inx: 1 });
        } else if (platName === "haha") {
          await startDeliver({ platName, bid, appFlag });
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "确认接单成功，2秒后解锁"
          });
          await mockDelay(2);
          await this.unlockSeat({
            platName,
            order_id: id,
            inx: 1
          });
        }
        // this.logList.push({
        //   opera_time: getCurrentFormattedDateTime(),
        //   des: `订单首次解锁座位完成`
        // });
      }
    } catch (error) {
      console.error(conPrefix + "解锁座位失败准备试错3次，间隔3秒", error);
      // 试错3次，间隔3秒
      let params = {
        order_id: id,
        order_number,
        supplierCode,
        platName
      };
      let delayConfig = {
        lieren: [3, 3],
        mangguo: [3, 3],
        sheng: [3, 3],
        haha: [3, 3],
        mayi: [60, 1],
        yangcong: [3, 3]
      };
      const res = await trial(
        inx => this.unlockSeat({ ...params, inx }),
        delayConfig[platName][0],
        delayConfig[platName][1],
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
    logUpload(
      {
        plat_name: platName,
        app_name: appFlag,
        order_number: order_number,
        type: 3
      },
      this.logList
    );
    try {
      // 解锁成功后延迟6秒再执行
      await mockDelay(6);
      // 2、一键买票
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
    }
  }

  // 解锁座位
  async unlockSeat({
    platName,
    order_id,
    inx = 1,
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
      } else if (platName === "yangcong") {
        params = {
          tradeno: order_id
        };
      } else if (platName === "haha") {
        params = {
          id: order_id
        };
      }
      console.log(conPrefix + "解锁参数", params);
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi,
        yangcong: yangcongApi,
        haha: hahaApi
      };
      const res = await requestApi[platName].unlockSeat(params);
      console.log(conPrefix + "解锁返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次解锁座位成功-${JSON.stringify(res)}`
      });
      return res;
    } catch (error) {
      // 芒果偶尔会这样
      if ((error?.msg || error?.message || "").includes("已经解锁")) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次解锁座位发现已解锁-${JSON.stringify(error)}`
        });
        return;
      }
      // 哈哈偶尔会这样
      if (error?.msg === "当前订单座位没有被锁") {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次解锁座位发现座位没有被锁-${JSON.stringify(error)}`
        });
        return;
      }
      console.error(conPrefix + "解锁异常", error);
      this.setErrInfo(`第${inx}次解锁座位失败`, error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次解锁座位失败-${JSON.stringify(error)}`
      });
      return Promise.reject(error);
    }
  }

  // 一键买票逻辑
  async oneClickBuyTicket(item) {
    const { conPrefix, appFlag } = this;
    console.log(conPrefix + "一键买票待下单信息", item);
    let {
      id: order_id,
      order_number,
      city_name,
      cinema_name,
      cinema_code,
      film_name,
      show_time,
      lockseat,
      ticket_num,
      supplier_end_price,
      member_price,
      supplierCode,
      platName,
      otherParams
    } = item;
    // otherParams主要是为了换号出票时不用再走之前流程
    let {
      cinemaLinkId,
      cinemaCode,
      filmUniqueId,
      scheduleId,
      scheduleKey,
      showDate,
      showDateTime,
      orderCode,
      orderHeaderId,
      lockOrderId,
      total_price,
      seat_ids,
      ticketDetail,
      offerRule,
      start_day,
      start_time
    } = otherParams || {};
    try {
      const phone = JSON.parse(localStorage.getItem("userInfo")).phone;
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `首次出票手机号-${phone}`,
        level: "info"
      });
      // 1、获取该订单的报价记录，按对应报价规则出票
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
        // offerRule = { offer_type: "1", quan_value: "35" };
        offerRule = {
          offer_type: "2",
          member_price: "32",
          real_member_price: "36"
        };
      }
      member_price = offerRule.member_price;
      console.warn(conPrefix + "从该订单的报价记录获取到的报价规则", offerRule);
      if (!offerRule) {
        console.error(
          conPrefix +
            "获取该订单的报价记录失败，不进行出票，此处不转单，直接跳过",
          offerRecord
        );
        this.setErrInfo("获取该订单报价记录失败，微信通知手动出票");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取该订单报价记录失败，微信通知手动出票`,
          level: "error"
        });
        sendWxPusherMessage({
          platName,
          order_number,
          city_name,
          cinema_name,
          film_name,
          lockseat,
          transferTip: "此处不转单，直接跳过，需手动出票",
          failReason: `获取该订单报价记录失败`
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `获取该订单报价记录成功`,
        level: "info"
      });
      // 2、获取目标城市影院列表
      let cityCinemaListRes = await getCityCinemaList({ appFlag });
      const cityCinemaList = cityCinemaListRes?.cityCinemaList || [];
      if (!cityCinemaList.length) {
        this.setErrInfo("获取城市影院列表异常", cityCinemaListRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取城市影院列表异常`,
          level: "error",
          info: {
            error: cityCinemaListRes?.error
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      let cinemaList =
        cityCinemaList?.find(item => item.cityName.includes(city_name))
          ?.cinemaList || [];
      if (!cinemaList?.length) {
        console.error(
          conPrefix + "获取目标城市影院列表失败",
          cityCinemaList,
          city_name
        );
        this.setErrInfo("获取目标城市影院列表失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取目标城市影院列表失败`,
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
        item =>
          item.cinemaCode === cinema_code ||
          cinemNameSpecial(item.cinemaName) === cinemNameSpecial(cinema_name)
      );
      if (!targetCinema) {
        console.error(
          conPrefix + "根据订单中的影院名称获取目标影院失败",
          cinemaList,
          cinema_name
        );
        this.setErrInfo("根据订单中的影院名称获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `根据订单中的影院名称获取目标影院失败`,
          info: {
            cinemaList,
            cinema_name
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      // 4、获取目标影院放映列表
      cinemaLinkId = targetCinema.cinemaLinkId;
      cinemaCode = targetCinema.cinemaCode;
      const movieDataRes = await getMoviePlayInfo({
        cinemaCode,
        cinemaLinkId,
        appFlag
      });
      const movie_data = movieDataRes?.movieData || [];
      if (!movie_data?.length) {
        console.error(conPrefix + "获取目标影院放映列表失败");
        this.setErrInfo("获取目标影院放映列表失败", movieDataRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取目标影院放映列表失败`,
          info: {
            error: movieDataRes?.error
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      // this.logList.push({
      //   opera_time: getCurrentFormattedDateTime(),
      //   des: `获取影院放映信息成功`
      // });
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
          this.setErrInfo("获取目标影片信息失败");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取目标影片信息失败`,
            info: {
              movie_data,
              film_name
            }
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
      }
      // 6、获取目标影片的放映日期
      filmUniqueId = movieInfo.filmUniqueId;
      const moviePlayDataRes = await getMoviePlayDate({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        appFlag
      });
      const playDateList = moviePlayDataRes?.moviePlayData || [];
      if (!playDateList?.length) {
        this.setErrInfo("获取目标影片放映日期异常", moviePlayDataRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取目标影片放映日期异常",
          info: {
            error: moviePlayDataRes?.error
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      start_day = show_time.split(" ")[0];
      let targetDate = playDateList.find(item => item.showDate === start_day);
      if (!targetDate) {
        console.warn("匹配影片放映日期失败", playDateList, start_day);
        this.setErrInfo("匹配影片放映日期失败");
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
      showDate = targetDate.showDate;
      // 7、获取某个放映日期的场次列表
      const showListRes = await getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate,
        appFlag
      });
      const showList = showListRes?.moviePlayTime || [];
      if (!showList?.length) {
        this.setErrInfo("获取某个放映日期的场次列表异常", showListRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取某个放映日期的场次列表异常",
          info: {
            error: showListRes?.error
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      start_time = show_time.split(" ")[1].slice(0, 5);
      let targetShow = showList.find(
        item => item.showDateTime.split(" ")[1].slice(0, 5) === start_time
      );
      if (!targetShow) {
        console.warn("匹配影片放映日期失败", showList, start_time);
        this.setErrInfo("匹配影片放映场次失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "匹配影片放映场次失败",
          info: {
            showList,
            start_time
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      console.log(
        conPrefix + "targetShow===>",
        targetShow,
        start_day,
        start_time
      );
      showDateTime = targetShow.showDateTime;
      // 8、获取座位布局
      scheduleId = targetShow.scheduleId;
      scheduleKey = targetShow.scheduleKey;
      const seatListRes = await getSeatLayout({
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        appFlag
      });
      const seatList = seatListRes?.seatData || [];
      if (!seatList?.length) {
        console.error(conPrefix + "获取座位布局异常");
        this.setErrInfo("获取座位布局异常", seatListRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取座位布局异常`,
          info: {
            error: seatListRes?.error
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      // 9、匹配作为ids
      let seatName = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
      console.log(conPrefix + "seatName", seatName);
      let selectSeatList = seatName.split(",");
      console.log(conPrefix + "selectSeatList", selectSeatList);
      let targeSeatList = seatList.filter(item => {
        const { yCoord, rowName, columnName } = item;
        // let seat1 = yCoord + "排" + columnName + "号";
        let seat2 = rowName + "排" + columnName + "号";
        return selectSeatList.includes(seat2);
      });
      console.log(conPrefix + "targeSeatList", targeSeatList);
      seat_ids = targeSeatList.map(item => item.seatCode);
      if (!seat_ids?.length) {
        console.error(conPrefix + "获取目标座位失败");
        this.setErrInfo("获取目标座位失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取目标座位失败`,
          info: {
            seatList,
            seatName
          }
        });
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      ticketDetail = seat_ids.map(item => ({
        seatCode: item,
        buyerRemark: ""
      }));
      // 4、锁定座位
      let params = {
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        scheduleId,
        scheduleKey,
        showDate,
        ticketDetail,
        showDateTime,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        appFlag
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
          lieren: [3, 5],
          mangguo: [3, 5],
          sheng: [3, 5],
          mayi: [6, 20],
          yangcong: [6, 20]
        };
        lockRes = await trial(
          inx => this.lockSeatHandle(params, inx),
          delayConfig[platName][0],
          delayConfig[platName][1]
        );
        if (!lockRes) {
          console.error(
            conPrefix + "单个订单试错后仍锁定座位失败",
            "需要走转单逻辑"
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `首次锁定座位失败轮询尝试后仍失败，走转单`
          });
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `首次锁定座位失败试错后锁定成功`
        });
      }
      // 锁定座位时取消订单无需传订单号（）取消完需要重新锁定座位，只用传当前影院信息如：
      // {"channelCode":"QD0000001","sysSourceCode":"YZ001","cinemaCode":"33047701","cinemaLinkId":"15950"}
      // await this.umeApi.getOrderTime({
      //   params: {
      //     keepLoading: true,
      //     channelCode: "QD0000001",
      //     sysSourceCode: "YZ001",
      //     cinemaCode,
      //     cinemaLinkId
      //   }
      // });
      // 获取最优卡券组合
      const { orderInfo, orderPriceInfo } = lockRes;
      orderCode = orderInfo.orderCode;
      orderHeaderId = orderInfo.orderHeaderId;
      lockOrderId = orderInfo.lockOrderId;
      // 这个时间戳需要和创建订单提交接口传参一致
      let timestamp = +new Date();
      // total_price =
      //   (orderPriceInfo?.scheduleInfo?.areaSettlePriceMin + 100) / 100;
      const cardQuanListRes = await getOptimalCardQuanCompose({
        orderCode,
        orderHeaderId,
        lockOrderId,
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        filmUniqueId,
        showDate,
        ticketDetail,
        showDateTime,
        timestamp,
        appFlag
      });
      if (cardQuanListRes?.error) {
        console.error(
          conPrefix + "获取最优卡券组合失败",
          cardQuanListRes?.error
        );
        this.setErrInfo("获取最优卡券组合失败", cardQuanListRes?.error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `获取最优卡券组合失败`,
          info: {
            error: cardQuanListRes?.error
          }
        });
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      let cardList = cardQuanListRes?.cards || [];
      let quanList = cardQuanListRes?.coupons || [];
      console.warn("获取最优卡券组合列表返回", cardList, quanList);
      // 7、耀莱需要获取观影人列表添加观影人
      if (appFlag === "yaolai") {
        const moviegoersListRes = await findStoreMemberMoviegoersByMemberId({
          cinemaCode,
          cinemaLinkId,
          appFlag
        });
        if (moviegoersListRes?.error) {
          console.error(
            conPrefix + "获取观影人列表失败",
            moviegoersListRes?.error
          );
          this.setErrInfo("获取观影人列表失败", moviegoersListRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取观影人列表失败`,
            info: {
              error: moviegoersListRes?.error
            }
          });
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
        const moviegoersList = moviegoersListRes.moviegoersList;
        const orderMoviegoers = [moviegoersList[0]];
        const addMoviegoersRes = await updateStoreOrderMoviegoers({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId,
          orderMoviegoers,
          appFlag
        });
        if (addMoviegoersRes?.error) {
          console.error(conPrefix + "添加观影人失败", addMoviegoersRes?.error);
          this.setErrInfo("添加观影人失败", addMoviegoersRes?.error);
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `添加观影人失败`,
            info: {
              error: addMoviegoersRes?.error
            }
          });
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }

      // 7、使用优惠券或者会员卡
      const { ticketLowestPrice, ticketStandardPrice } =
        orderPriceInfo?.scheduleInfo || {};
      let mbmberPrice =
        (Number(ticketLowestPrice) + Number(ticketStandardPrice)) / 100;
      total_price = mbmberPrice * ticket_num;
      let {
        card_id = "",
        useQuan = [],
        profit = 0
      } = useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        mbmberPrice,
        total_price,
        appFlag
      });
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      // 使用优惠券及会员卡
      if (!card_id && !useQuan?.length) {
        console.error(conPrefix + "无可用会员卡及优惠券");
        this.setErrInfo("无可用会员卡及优惠券");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `无可用会员卡及优惠券`
        });
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        total_price = 0;
      }
      // 7、创建订单
      const order_num = await this.createOrder({
        cinemaCode,
        cinemaLinkId,
        orderHeaderId,
        coupon: useQuan,
        card_id,
        total_price,
        timestamp
      });
      if (!order_num) {
        console.error(
          conPrefix + "创建订单失败，单个订单直接出票结束",
          "走转单逻辑"
        );
        this.setErrInfo("创建订单失败，单个订单直接出票结束");
        // this.logList.push({
        //   opera_time: getCurrentFormattedDateTime(),
        //   des: `创建订单失败，单个订单直接出票结束`
        // });
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      console.warn("创建订单成功", order_num, profit, card_id, offerRule);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `创建订单成功`
      });
      if (isTestOrder) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `测试单暂不购买`,
          level: "error"
        });
        return { offerRule };
      }
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        cinemaCode,
        cinemaLinkId,
        card_id,
        orderHeaderId,
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
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `订单购买成功`
      });
      // 此处是为了解决创建订单时card_id是cardNo，更新卡使用量是用的card_id是cardInstanceId，要和后台会员卡列表维护那的id保持一致
      if (card_id) {
        card_id =
          cardList.find(item => item.cardNo === card_id)?.cardInstanceId || "";
      }
      // 最后处理：获取支付结果上传取票码
      const lastRes = await this.lastHandle({
        orderHeaderId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        platName,
        orderInfo: item,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
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

  // 锁定座位
  async lockSeatHandle(
    {
      scheduleId,
      scheduleKey,
      filmUniqueId,
      showDate,
      ticketDetail,
      showDateTime,
      cinemaCode,
      cinemaLinkId,
      appFlag
    },
    inx = 1
  ) {
    const { conPrefix } = this;
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          scheduleId,
          scheduleKey,
          filmUniqueId,
          showDate,
          ticketDetail,
          showDateTime,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        }
      };
      console.log(conPrefix + "锁定座位参数", params);
      const res = await APP_API_OBJ[appFlag].lockSeat(params);
      console.log(conPrefix + "锁定座位返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次锁定座位成功-${JSON.stringify(res)}`
      });
      return res?.data;
    } catch (error) {
      console.error(conPrefix + "锁定座位异常", error);
      this.setErrInfo("", "");
      this.setErrInfo(`第${inx}次锁定座位异常`, error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `第${inx}次锁定座位失败-${JSON.stringify(error)}`
      });
      return Promise.reject(error);
    }
  }

  // 创建订单
  async createOrder(data) {
    const { conPrefix } = this;
    const {
      cinemaCode,
      cinemaLinkId,
      orderHeaderId,
      coupon,
      card_id,
      total_price,
      timestamp,
      isTimeoutRetry = 1 // 默认超时重试
    } = data;
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          cinemaCode,
          cinemaLinkId,
          sysSourceCode: "YZ001",
          timestamp,
          ticket: {
            orderHeaderId: "" + orderHeaderId,
            activityId: null,
            coupon: coupon || [],
            totalPrice: total_price
          },
          product: null,
          mainPushCard: null,
          cardId: card_id || "",
          ticketMobile: JSON.parse(localStorage.getItem("userInfo")).phone, // 登录手机号
          // ticketMobile: "13073792313", // 登录手机号
          inviteCode: "",
          fulfillPlace: "影院柜台",
          fulfillTime: "",
          fulfillType: "",
          channelCode: "QD0000001"
        }
      };
      let order_num;
      console.log(conPrefix + "创建订单参数", params);
      const res = await this.umeApi.createOrder(params);
      console.log(conPrefix + "创建订单返回", res);
      order_num = res.data?.payOrderCode || "";
      return order_num;
    } catch (error) {
      console.error(conPrefix + "创建订单异常", error);
      this.setErrInfo("创建订单异常", error);
      if (error?.msg?.includes("超时") && isTimeoutRetry === 1) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `创建订单接口超时，延迟2秒后重试`
        });
        await mockDelay(2);
        try {
          const order_num = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (order_num) {
            this.logList.push({
              opera_time: getCurrentFormattedDateTime(),
              des: `创建订单请求接口超时，延迟2秒后重试成功`
            });
            return order_num;
          }
        } catch (err) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `创建订单请求接口超时，延迟2秒后重试失败：${JSON.stringify(err)}`
          });
        }
      }
    }
  }

  // 获取购票信息
  async getPayResult(data) {
    const { conPrefix } = this;
    let { orderHeaderId, inx = 1 } = data || {};
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          isDetail: "Y",
          orderHeaderId,
          keepLoading: true,
          channelCode: "QD0000001"
        }
      };
      console.log(conPrefix + "支付订单参数", params);
      const res = await this.umeApi.getPayResult(params);
      console.log(conPrefix + "支付订单返回", res);
      let list = res.data || [];
      let qrcode = list[0]?.ticketCode?.split(",").join("|") || "";
      if (qrcode) {
        if (inx) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `第${inx}次异步轮询获取支付结果成功`
          });
        }
        return qrcode;
      }
      if (inx) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次异步轮询获取支付结果失败`
        });
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      console.error(conPrefix + "支付订单异常", error);
      this.setErrInfo("获取订单支付结果异常", error);
      try {
        const res = await this.umeApi.findStoreTkOrderInfoApp({
          params: {
            orderType: "ticket_order",
            isDetail: "Y",
            channelCode: "QD0000001"
          },
          pageIndex: 1,
          pageRow: 5
        });
        let list = res.data || [];
        if (list.length) {
          let targetObj = list.find(
            item => item.orderHeaderId == orderHeaderId
          );
          if (targetObj) {
            let qrcode = targetObj.ticketCode?.split(",").join("|");
            if (qrcode) {
              this.logList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `第${inx}次从已完成订单里获取取票码成功：${qrcode}`
              });
              return qrcode;
            } else {
              this.logList.push({
                opera_time: getCurrentFormattedDateTime(),
                des: `第${inx}次从已完成订单里获取取票码失败`
              });
            }
          }
        }
      } catch (err) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次从已完成订单里获取取票码失败，${JSON.stringify(err)}`
        });
      }
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
    orderInfo,
    flag
  }) {
    const { conPrefix } = this;
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
        ticketCodeList: [
          {
            picUrl: "",
            ticketCode: qrcode
          }
        ]
      };
    } else if (platName === "yangcong") {
      params = {
        tradeno: order_id, // 蚂蚁APP的订单编号
        ticketCodeUrls: "",
        ticketCodes: qrcode
      };
    } else if (platName === "haha") {
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
      const requestApi = {
        lieren: lierenApi,
        sheng: shengApi,
        mangguo: mangguoApi,
        mayi: mayiApi,
        yangcong: yangcongApi,
        haha: hahaApi
      };
      console.log(conPrefix + "提交出票码参数", params);
      const res = await requestApi[platName].submitTicketCode(params);
      console.log(conPrefix + "提交出票码返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `提交取票码返回-${JSON.stringify(res)}`
      });
      return res;
    } catch (error) {
      console.error(conPrefix + "提交出票码异常", error);
      if (flag !== 2) {
        this.setErrInfo("提交出票码异常", error);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `提交出票码异常，响应-${JSON.stringify(error)}，参数-${JSON.stringify(params)}`
        });
      } else {
        let err_info = formatErrInfo(error);
        svApi.updateTicketRecord({
          order_number,
          err_msg: "系统延迟后提交出票码异常",
          err_info
        });
      }
    }
  }

  async lastHandle({
    orderHeaderId,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    platName,
    orderInfo,
    lockseat
  }) {
    const { conPrefix, appFlag } = this;
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderHeaderId
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
          level: 'error'
        });
        logUpload(
          {
            plat_name: platName,
            app_name: appFlag,
            order_number: order_number,
            type: 3
          },
          this.logList
        );
        this.asyncFetchQrcodeSubmit({
          orderHeaderId,
          order_id,
          app_name,
          card_id,
          platName,
          order_number,
          supplierCode,
          orderInfo,
          lockseat
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
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
        orderInfo,
        flag: 1
      });
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: `非异步提交取票码成功`
      });
      return { submitRes, qrcode };
    } catch (error) {
      console.warn("出票最后处理异常", error);
      this.setErrInfo("", "");
      this.setErrInfo("出票最后处理异常", error);
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    orderHeaderId,
    order_id,
    app_name,
    card_id,
    platName,
    order_number,
    supplierCode,
    orderInfo,
    lockseat
  }) {
    const { conPrefix } = this;
    try {
      // 每搁30秒查一次，查10次，5分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderHeaderId,
            inx
          }),
        10,
        30,
        conPrefix
      );
      if (!qrcode) {
        // 5分钟后还失败消息推送
        sendWxPusherMessage({
          platName,
          order_number,
          city_name: orderInfo.city_name,
          cinema_name: orderInfo.cinema_name,
          film_name: orderInfo.film_name,
          lockseat,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: `系统延迟轮询5分钟后获取取票码仍失败`
        });
        // 每搁30秒查一次，查10次，5分钟
        qrcode = await trial(
          inx =>
            this.getPayResult({
              orderHeaderId,
              inx
            }),
          10,
          30,
          conPrefix
        );
      }
      if (!qrcode) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `系统延迟轮询10分钟后获取取票码仍失败`,
          level: 'error'
        });
        logUpload(
          {
            plat_name: platName,
            app_name: app_name,
            order_number: order_number,
            type: 3
          },
          this.logList
        );
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
        orderInfo,
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
    orderInfo,
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
        orderInfo,
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
          opera_time: getCurrentFormattedDateTime(),
          des: `系统延迟后轮询获取提交取票码成功`,
          level: 'info'
        });
        logUpload(
          {
            plat_name: platName,
            app_name: app_name,
            order_number: order_number,
            type: 3
          },
          this.logList
        );
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
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);

// 获取城市影院列表
const getCityCinemaList = async ({ appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode: "32012801",
        cinemaLinkId: "15946"
      }
    };
    console.log(conPrefix + "获取城市影院列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCinemaList(params);
    console.log(conPrefix + "获取城市影院列表返回", res);
    let cityCinemaList = res.data || [];
    return {
      cityCinemaList
    };
  } catch (error) {
    console.error(conPrefix + "获取城市影院异常", error);
    return {
      error
    };
  }
};

// 获取电影放映列表
const getMoviePlayInfo = async ({ cinemaCode, cinemaLinkId, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      }
    };
    console.log(conPrefix + "获取影院放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log(conPrefix + "获取影院放映列表返回", res);
    // 只获取出售中的列表，即将上映暂不返回
    let movieData =
      res.data?.find(item => item.showStatus === "SHOWING")?.fimlList || [];
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
const getMoviePlayDate = async ({
  cinemaCode,
  cinemaLinkId,
  filmUniqueId,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        keepLoading: true,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
      }
    };
    console.log(conPrefix + "获取电影放映日期参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayDate(params);
    console.log(conPrefix + "获取电影放映日期返回", res);
    return {
      moviePlayData: res.data || []
    };
  } catch (error) {
    console.error(conPrefix + "获取电影放映日期异常", error);
    return {
      error
    };
  }
};

// 获取电影放映场次
const getMoviePlayTime = async ({
  cinemaCode,
  cinemaLinkId,
  filmUniqueId,
  showDate,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        showDate: showDate,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
      }
    };
    console.log(conPrefix + "获取电影放映场次参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayTime(params);
    console.log(conPrefix + "获取电影放映场次返回", res);
    return {
      moviePlayTime: res.data || []
    };
  } catch (error) {
    console.error(conPrefix + "获取电影放映信息异常", error);
    return {
      error
    };
  }
};

// 获取座位布局
const getSeatLayout = async ({
  cinemaCode,
  cinemaLinkId,
  scheduleId,
  scheduleKey,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001"
      }
    };
    console.log(conPrefix + "获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log(conPrefix + "获取座位布局返回", res);
    let seatData = res.data?.seatList || [];
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

// 获取最优卡券列表组合
const getOptimalCardQuanCompose = async ({
  orderCode,
  cinemaCode,
  cinemaLinkId,
  orderHeaderId,
  scheduleId,
  scheduleKey,
  filmUniqueId,
  showDate,
  ticketDetail,
  showDateTime,
  lockOrderId,
  timestamp,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        orderCode,
        cinemaCode,
        cinemaLinkId,
        sysSourceCode: "YZ001",
        orderHeaderId,
        timestamp,
        productInfo: null,
        orderType: "ticket_order",
        scheduleId,
        scheduleKey,
        filmUniqueId,
        showDate,
        ticketDetail,
        showDateTime,
        channelCode: "QD0000001",
        lockFlag: lockOrderId
      }
    };
    console.log(conPrefix + "获取最优卡券列表组合参数", params);
    const res = await APP_API_OBJ[appFlag].getCardQuanList(params);
    console.log(conPrefix + "获取最优卡券列表组合返回", res);
    let ticketOptimalComb = res.data?.ticketOptimalComb || {};
    return {
      cards: ticketOptimalComb.cards || [],
      coupons: ticketOptimalComb.coupons || []
    };
  } catch (error) {
    console.error(conPrefix + "获取最优卡券列表组合返回异常", error);
    return {
      error
    };
  }
};

// 获取观影人列表
const findStoreMemberMoviegoersByMemberId = async ({
  cinemaCode,
  cinemaLinkId,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      }
    };
    console.log(conPrefix + "获取观影人列表参数", params);
    const res =
      await APP_API_OBJ[appFlag].findStoreMemberMoviegoersByMemberId(params);
    console.log(conPrefix + "获取观影人列表返回", res);
    let moviegoersList = res.data || [];
    return {
      moviegoersList
    };
  } catch (error) {
    console.error(conPrefix + "获取观影人列表异常", error);
    return {
      error
    };
  }
};

// 添加观影人
const updateStoreOrderMoviegoers = async ({
  cinemaCode,
  cinemaLinkId,
  orderHeaderId,
  orderMoviegoers,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        orderHeaderId,
        orderMoviegoers,
        keepLoading: true,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      }
    };
    console.log(conPrefix + "添加观影人参数", params);
    const res = await APP_API_OBJ[appFlag].updateStoreOrderMoviegoers(params);
    console.log(conPrefix + "添加观影人返回", res);
  } catch (error) {
    console.error(conPrefix + "添加观影人异常", error);
    return {
      error
    };
  }
};

// 取消订单
const cannelOneOrder = async ({
  cinemaCode,
  cinemaLinkId,
  orderHeaderId,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        orderHeaderId,
        cinemaCode,
        cinemaLinkId
      }
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

// 绑定券
const bandQuan = async ({ coupon_num, appFlag }) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    city_id: "304",
    cinema_id: "33",
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
        error,
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

// 订单购买
const buyTicket = async ({
  cinemaCode,
  cinemaLinkId,
  card_id,
  orderHeaderId,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params = {
      params: {
        paymentWay: "Z0006",
        orderHeaderId,
        cardNo: card_id || "",
        isMultiplePay: "",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      }
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
  platName,
  bid,
  appFlag
}) => {
  let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
  try {
    let params;
    if (platName === "sheng") {
      params = {
        orderCode: order_number,
        supplierCode
      };
    } else if (platName === "haha") {
      params = {
        bid
      };
    }
    const requestApi = {
      sheng: shengApi,
      haha: hahaApi
    };
    console.log(conPrefix + "确认接单参数", params);
    const res = await requestApi[platName].confirmOrder(params);
    console.log(conPrefix + "确认接单返回", res);
    return res;
  } catch (error) {
    console.warn("确认接单异常", error);
  }
};

// 使用优惠券或会员卡
const useQuanOrCard = ({
  cardList,
  quanList,
  supplier_end_price,
  ticket_num,
  offerRule,
  total_price,
  appFlag
}) => {
  try {
    const { offer_type: offerType, member_price } = offerRule;
    let conPrefix = TICKET_CONPREFIX_OBJ[appFlag];
    if (offerType !== "1") {
      console.log(conPrefix + "使用会员卡出票");
      let cardData = cardList.filter(
        item => item.cardAmount >= total_price * 100
      );
      if (!cardData?.length) {
        console.warn(conPrefix + "无可用会员卡", member_price);
        // this.setErrInfo("无可用会员卡", { cardList, total_price });
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
      profit = Number(profit).toFixed(2);
      return {
        card_id: cardData?.[0]?.cardNo,
        profit // 利润
      };
    } else {
      console.log(conPrefix + "使用优惠券出票");
      if (!quanList?.length) {
        console.warn(conPrefix + "无可用优惠券");
        // this.setErrInfo("无可用优惠券", { quanList });
        return {
          useQuan: [],
          profit: 0 // 利润
        };
      }
      if (quanList.length < ticket_num) {
        console.warn(conPrefix + "优惠券不够用");
        // this.setErrInfo("优惠券不够用", { quanList, ticket_num });
        return {
          useQuan: [],
          profit: 0 // 利润
        };
      }
      let useQuan = quanList.slice(0, ticket_num).map(item => {
        let seatCode = Object.keys(item.discountAmountMap)?.[0];
        return {
          couponInstanceId: item.couponInstanceId,
          couponType: item.couponType,
          // 以下两个值一样
          seatCode: seatCode,
          salesKeySku: seatCode,
          couponCode: item.couponCode,
          couponName: item.couponName,
          templateCode: item.templateCode,
          discountAmount: seatCode ? item.discountAmountMap?.[seatCode] : 0
        };
      });
      let profit =
        supplier_end_price - 32 - (Number(supplier_end_price) * 100) / 10000;
      profit = Number(profit) * Number(ticket_num);
      profit = Number(profit).toFixed(2);
      return {
        useQuan,
        profit
      };
    }
  } catch (error) {
    console.error("使用会员卡或优惠券报错", error);
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
      err_msg: res?.submitRes ? "" : errMsg || "",
      err_info: res?.submitRes ? "" : errInfo || "",
      rewards: order.rewards, // 是否是奖励订单 1是 0否
      transfer_fee: res?.transferParams?.transfer_fee || "", // 转单手续费
      mobile: mobile || "" // 出票手机号
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
  svApi.updateDayUsage({
    app_name: app_name,
    card_id: card_id
  });
  let log_list = [
    {
      opera_time: getCurrentFormattedDateTime(),
      des: `订单用卡出票成功后更新当天使用量`,
      level: "info"
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
