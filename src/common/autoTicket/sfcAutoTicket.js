import {
  getCurrentTime,
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon, // 根据影院名称获取影院id
  mockDelay, // 模拟延时
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById, // 根据报价规则id获取详细内容
  couponInfoSpecial,
  getCurrentDay,
  isDateInCurrentMonth,
  findMostRepeatedChars,
  isNextDayBySfc,
  getPreviousDay
} from "@/utils/utils";
import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
// 平台管理类
import PlatManage from "@/common/autoTicket/buyTicket/platManage";

import { encode } from "@/utils/sfc-member-password";
window.encode = encode;
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
// 影院特殊匹配列表及api
import {
  GE_APP_INFO,
  TEST_NEW_PLAT_LIST,
  sfcV3AppList,
  GET_APP_TYPE_LIST
} from "@/common/constant";
import { APP_API_OBJ } from "@/common/index";
// 机器基础方法
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
const { updateQuanBlackInfo } = usesMachineBaseFun();

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.cityList = []; // 城市列表
    this.appFlag = appFlag; // 影线标识
    this.sfcApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isV3App = sfcV3AppList.includes(appFlag);
    this.isStart = false; // 是否启动
    this.usableCardList = []; // 会员可用卡列表（库里维护的）

    this.loggerQ = new Logger({ logType: 3 }); // 队列日志类
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
    this.loggerQ.warn("队列启动，开始监听是否有新订单");
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
    this.loggerQ.info(`发送测试订单——${appFlag}:`, newOrder);
  }

  // 处理新订单
  handleNewOrder(event) {
    const { isStart } = this;
    if (!isStart) return;
    const isAgain = event.detail?.isAgain; // 是否重新出票
    let order = event.detail;
    if (isAgain) {
      order = event.detail?.order;
    }
    // 检查是否已经处理过此订单
    if (
      !isAgain &&
      this.handledOrders.has(order.plat_name + "_" + order.order_number)
    ) {
      this.loggerQ.warn("订单已被处理过，忽略重复消息", order);
      return;
    }
    let des = "自动出票队列获取到新的待出票订单";
    if (!isAgain) {
      // 标记此订单为已处理
      this.handledOrders.set(order.plat_name + "_" + order.order_number, 1);
    } else {
      des = "自动出票队列获取到重新出票的订单";
      order.isAgain = true;
    }
    this.loggerQ.warn("新的待出票订单", order);
    this.loggerQ.init(order); // 设置日志的订单标识信息
    this.loggerQ.infoSave(des, {
      newOrders: order,
      sjc: +new Date()
    });
    if (!isTestOrder) {
      // 上送接收到新订单消息日志
      this.loggerQ.logUpload();
    }
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
        let logger = new Logger({
          logType: 3
        });
        if (!order.isAgain && this.prevOrderNumber === order.order_number) {
          logger.warn("当前订单重复执行,直接执行下个");
        } else {
          // 处理订单
          logger.init(order);
          const res = await this.orderHandle(order, logger);
          this.prevOrderNumber = order.order_number;
          // res: { profit, submitRes, qrcode, quan_code, card_id, cardNum, offerRule } || undefined
          logger.infoSave(
            `单个订单自动出票结束，状态-${res?.submitRes ? "成功" : "失败"}`,
            { res }
          );
          if (!isTestOrder) {
            let { err_msg: errMsg, err_info: errInfo } =
              logger.getLastErrMsgAndInfo();
            if (res?.submitRes) {
              errMsg = "";
              errInfo = "";
            }

            let params = {
              order,
              ticketRes: res,
              appFlag,
              errMsg: errMsg,
              errInfo: errInfo,
              mobile: this.currentParamsList[this.currentParamsInx].mobile
            };
            if (order.isAgain) {
              let order_status = res?.submitRes ? 1 : 2;
              // 出成功后修改出票记录
              if (order_status === 1) {
                svApi.updateTicketRecord({
                  whereObj: {
                    order_number: order.order_number,
                    plat_name: order.plat_name,
                    user_id: user_id
                  },
                  updateObj: {
                    order_status: 1,
                    profit: res?.profit || "",
                    qrcode: res?.qrcode || "",
                    quan_type: res?.quanType || "",
                    quan_value: res?.offerRule?.quan_value || "",
                    quan_code: res?.quan_code || "",
                    card_id: res?.card_id || "",
                    card_num: res?.cardNum || "",
                    mobile:
                      this.currentParamsList[this.currentParamsInx].mobile,
                    err_msg: "重新出票成功"
                  }
                });
              } else {
                svApi.updateTicketRecord({
                  whereObj: {
                    order_number: order.order_number,
                    plat_name: order.plat_name,
                    user_id: user_id
                  },
                  updateObj: {
                    order_status: 2,
                    err_msg: "重新出票失败"
                  }
                });
              }
            } else {
              await addOrderHandleRecored(params);
            }
            logger.infoSave(
              `订单出票结束，远端已${order.isAgain ? "修改" : "添加"}出票记录`
            );
            // 上送该订单执行过程日志
            logger.logUpload();
          }
        }
      }
    }
    this.isRunning = false;
  }

  // 处理订单
  async orderHandle(order, logger, delayTime) {
    // 放在这里最合适，方便后续方法直接用(该订单执行完了下次重新赋值也没问题)
    this.logger = logger;
    this.order = order;
    this.platManage = new PlatManage(order, logger, isTestOrder); // 平台管理模块
    try {
      this.logger.infoSave(
        `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`,
        {
          order,
          delayTime
        }
      );
      // await mockDelay(delayTime);
      this.logger.info(`订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, cardNum, quanType, offerRule }
        return res;
      } else {
        this.logger.warn("订单出票队列已停止");
      }
    } catch (error) {
      this.logger.errorSave("订单执行出票异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    this.isStart = false;
    this.loggerQ.warn("自动出票队列停止");
  }

  // 释放座位 flag: 1-转单，2换号
  async releaseSeat(unlockSeatInfo, flag) {
    const { appFlag } = this;
    const { city_id, cinema_id, show_id, start_day, start_time, session_id } =
      unlockSeatInfo;
    try {
      const seatDataRes = await getSeatLayout({
        city_id,
        cinema_id,
        show_id,
        session_id,
        appFlag
      });
      let errFlag = ["", "转单释放座位时", "换号出票释放座位时"][flag];
      let seatList = seatDataRes?.seatData || [];
      if (!seatList?.length) {
        this.logger.errorSave(`${errFlag}-获取座位布局异常`, {
          error: seatDataRes?.error
        });
        return;
      }
      let availableSeatList = seatList.filter(item => item[2] === "0"); // 1表示已售
      let seat_ids = availableSeatList.map(item => item[0])?.[0]; // 第0个代表座位id
      if (!seat_ids) {
        this.logger.errorSave(`${errFlag}-获取未售座位为空`, {
          seatList
        });
        return;
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
      this.logger.warn("转单时释放座位传参", lockParams);
      const res = await this.lockSeatHandle(lockParams); // 锁定座位
      this.logger.infoSave("释放座位入参及返回", {
        lockParams,
        res
      });
      return res;
    } catch (error) {
      this.logger.infoSave("释放座位异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "释放座位失败，建议手动释放座位，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
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
      const res = await this.sfcApi.lockSeat(params);
      this.logger.infoSave("取消订单返回", {
        res,
        params
      });
      return res;
    } catch (error) {
      this.logger.errorSave("取消订单异常", {
        error,
        params
      });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }

  async transferOrder(order, unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { order_num } = unlockSeatInfo;
      const session_id =
        this.currentParamsList[this.currentParamsInx].session_id;
      if (order_num) {
        await this.cancelOrder({ ...unlockSeatInfo, session_id });
      } else {
        await this.releaseSeat({ ...unlockSeatInfo, session_id }, 1);
      }
    }
    // 3、平台转单
    // 获取转单原因
    const errInfoObj = this.logger.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
    // 关闭自动转单只针对座位异常生效
    // if (isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    let des = "自动转单处于关闭状态，只取消订单释放座位，需手动出票或转单";
    if (this.order.isAgain) {
      des = "重新出票失败，不转单只取消订单释放座位，需手动出票或转单";
    }
    if (isTestOrder || isAutoTransfer !== "1" || this.order.isAgain) {
      this.logger.infoSave("自动转单处于关闭状态");
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: des,
        failReason: `${errMsg}——${errInfo}`
      });
      return;
    }
    return await this.platManage.orderTransferByPlat(errMsg, errInfo);
  }
  // 单个订单出票
  async singleTicket(item) {
    // 放到这里即使修改token也不用重启队列了
    const { appFlag } = this;
    const { plat_name, order_number } = item;
    this.logger.warn("单个待出票订单信息", item);
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
    this.logger.infoSave("获取该影院登录信息返回", {
      targetLoginList,
      currentParamsList: this.currentParamsList
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
      this.logger.errorSave("获取该订单报价记录异常", { error });
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
    this.logger.warn("从该订单的报价记录获取到的报价规则", offerRule);
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
      this.logger.errorSave(str, { offerRule });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "此处不转单，直接跳过，需手动出票",
        failReason: str
      });
      return {
        offerRule
      };
    }
    this.logger.infoSave("获取该订单报价记录成功", {
      offerRule: JSON.parse(JSON.stringify(offerRule))
    });
    // 平台解锁座位(重新出票不需要解锁座位)
    if (!isTestOrder && !item.isAgain) {
      this.logger.infoSave("开始准备解锁座位");
      const unlockRes = await this.platManage.unlockSeatByPlat();
      if (!unlockRes) {
        this.logger.errorSave("平台解锁失败准备走转单逻辑");
        // 转单逻辑
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
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
        this.logger.warn("单个订单出票完成");
        return result;
      } else {
        this.logger.warn("单个订单出票失败");
      }
    } catch (error) {
      this.logger.errorSave("单个订单出票异常", { error });
    }
  }

  // 一键买票逻辑
  async oneClickBuyTicket(item) {
    const { appFlag, isV3App } = this;
    try {
      this.logger.info("一键买票待下单信息", item);
      let {
        id: order_id,
        order_number,
        city_name,
        cinema_name,
        cinema_code,
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
        start_time,
        order_num
      } = otherParams || {};
      // 如果待出票订单里没有就去报价记录里拿
      if (!rewards || Number(rewards) == 0) {
        rewards = offerRule?.rewards || 0;
      }
      if (this.currentParamsInx === 0) {
        // 2、获取城市列表
        const cityListRes = await getCityList({ appFlag });
        this.cityList = cityListRes?.cityList || [];
        if (!this.cityList?.length) {
          this.logger.errorSave("获取城市列表异常", {
            error: cityListRes?.error
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
          this.logger.errorSave("获取城市影院列表异常", {
            error: cinemaListRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 4、根据影院名称获取目标影院id
        let cinemaIdRes = getTargetCinemaCommon({
          app_name: appFlag,
          plat_cinema_code: cinema_code,
          cinema_list: cinemaList
        });
        cinema_id = cinemaIdRes?.id;
        if (!cinema_id) {
          this.logger.errorSave("获取目标影院失败", {
            error: cinemaIdRes?.error,
            cinema_name,
            cinemaList,
            appFlag,
            city_name
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        if (cinema_id) {
          if (offerRule.offer_type != 1) {
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
            this.logger.infoSave("登录信息按照可用卡列表排序后", {
              currentParamsList: this.currentParamsList
            });
          } else {
            const sortMobileList = await this.getSortPhoneByQuanTypeList(
              appFlag,
              offerRule?.quan_flag,
              offerRule?.quan_value,
              ticket_num
            );
            if (sortMobileList?.length) {
              this.currentParamsList = this.currentParamsList.sort((a, b) => {
                // 获取 a.mobile 在 sortMobileList 中的索引（不存在则返回 -1）
                const indexA = sortMobileList.indexOf(a.mobile);
                // 获取 b.mobile 在 sortMobileList 中的索引
                const indexB = sortMobileList.indexOf(b.mobile);

                // 规则1：a存在且b不存在 → a排前面
                if (indexA !== -1 && indexB === -1) return -1;

                // 规则2：a不存在且b存在 → b排前面
                if (indexA === -1 && indexB !== -1) return 1;

                // 其他情况：保持原顺序
                return 0;
              });
              this.logger.infoSave("登录信息按照可用券数量关联手机号排序后", {
                currentParamsList: this.currentParamsList,
                sortMobileList
              });
            }
          }
        }
        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`, {
          currentParamsList: this.currentParamsList
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
          this.logger.errorSave("获取影院放映列表失败", {
            error: movieDataRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logger.infoSave("获取影院放映信息成功");
        let movieInfo = movie_data.find(item => item.movie_name === film_name);
        if (!movieInfo) {
          this.logger.warn("获取目标影片信息失败", { movie_data, film_name });
          movieInfo = movie_data.find(
            item =>
              convertFullwidthToHalfwidth(item.movie_name) ===
              convertFullwidthToHalfwidth(film_name)
          );
          if (!movieInfo) {
            let targetFilmList = movie_data.map(item => {
              const repeatedCharsResult = findMostRepeatedChars(
                item.movie_name,
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
              this.logger.errorSave("获取目标影片信息失败", {
                film_name,
                movie_data
              });
              const transferParams = await this.transferOrder(item);
              return { transferParams };
            }
          }
        }
        // let movie_id = movieInfo?.movie_id || ''
        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1].slice(0, 5);
        // 是否是次日，如果是，showDay需要向前进一
        if (isNextDayBySfc(start_day, start_time)) {
          start_day = getPreviousDay(start_day);
        }
        this.logger.info("movieInfo===>", { movieInfo, start_day, start_time });
        let showList = movieInfo?.shows[start_day] || [];
        this.logger.info("showList===>", { showList });
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
          this.logger.infoSave("同一时间多场次", { targetShowList });
        }
        if (!targetShow) {
          this.logger.errorSave("匹配影片放映场次失败", {
            showList,
            start_time
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logger.infoSave("出票时获取电影放映信息", { targetShow });
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
          this.logger.errorSave("获取座位布局异常", {
            error: seatDataRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let seatName = lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号");
        this.logger.info("seatName", seatName);
        let selectSeatList = seatName.split(",");
        this.logger.info("selectSeatList", selectSeatList);
        let targetList = seatList.filter(item =>
          selectSeatList.includes(item[5])
        );
        this.logger.infoSave("目标座位相关信息", { targetList });
        if (targetList?.length != ticket_num) {
          this.logger.errorSave("获取目标座位失败", {
            targetList,
            ticket_num
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        seat_ids = targetList.map(item => item[0]).join();
      } else {
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time,
          order_num,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (order_num) {
          isCancel = await this.cancelOrder(unlockSeatInfo);
        } else {
          isCancel = await this.releaseSeat(unlockSeatInfo);
        }
        if (!isCancel) {
          this.logger.infoSave(
            "上个号取消订单释放座位失败，发送消息通知并直接走转单"
          );
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        // 换号时恢复原先券类型
        if (offerRule.old_quan_value) {
          offerRule.quan_value = offerRule.old_quan_value;
        }
        this.curPhone = phone;
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
        this.logger.error("锁定座位失败准备试错2次，间隔5秒", error);
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
          ""
        );
        if (!res) {
          this.logger.infoSave("首次锁定座位失败轮询尝试后仍失败，走转单");
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logger.infoSave("首次锁定座位失败试错后锁定成功");
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
        const errInfoObj = this.logger.logList
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
          this.logger.errorSave(str);
          const transferParams = await this.transferOrder(item, {
            city_id,
            cinema_id,
            show_id,
            start_day,
            start_time
          });
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
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
      this.logger.infoSave("使用优惠券或者会员卡成功", {
        card_id,
        quanType,
        quan_code,
        coupon_id,
        member_coupon_id,
        profit
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
        this.logger.infoSave("使用优惠券或会员卡后计算订单价格返回", priceRes);
        priceInfo = priceRes?.price;
        if (priceRes?.error) {
          this.logger.errorSave("使用优惠券或会员卡后计算订单价格异常", {
            error: priceRes?.error
          });
        }
      }
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          this.logger.error(
            "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束,走转单"
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
          this.logger.infoSave("非最后一次创建订单前计算价格失败，走换号");
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
      this.logger.info("订单最后价格", { pay_money, priceInfo });
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (offerRule.offer_type === "1" && pay_money > quan_fee_total) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          pay_money,
          quan_fee_total,
          ticket_num,
          quan_fee
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
          this.logger.errorSave("用完卡发现支付金额大于会员价*票数，走转单", {
            pay_money,
            real_member_price,
            ticket_num
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
      this.logger.infoSave("创建订单前计算订单价格成功");
      // 7、创建订单
      order_num = await this.createOrder({
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
        seat_info: lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号"),
        pay_money,
        payType
      });
      if (!order_num) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          this.logger.error("创建订单失败，单个订单直接出票结束走转单逻辑");
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
          this.logger.infoSave("非最后一次创建订单失败，走换号");
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
      this.logger.infoSave("创建订单成功");
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
        pay_password,
        orderInfo: this.order
      });
      this.logger.infoSave("订单购买返回", buyTicketRes);
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", buyTicketRes);
        } else {
          this.logger.errorSave("订单购买异常", buyTicketRes);
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
      }
      this.logger.infoSave("订单购买成功");
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
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      this.logger.info("一键买票完成");
      if (!quan_code && quanType) {
        quan_code = coupon_id || member_coupon_id;
      }
      if (profit) {
        profit = Number(profit).toFixed(2);
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
      this.logger.errorSave("一键买票异常", { error });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: JSON.stringify(error)
      });
      return { offerRule };
    }
  }

  // 锁定座位
  async lockSeatHandle(data, inx = 1) {
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
      if (inx == 1) {
        this.logger.infoSave(`第${inx}次锁定座位参数`, {
          params
        });
      }

      const res = await this.sfcApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位返回`, {
        res
      });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, {
        error
      });
      return Promise.reject(error);
    }
  }

  // 使用优惠券或者会员卡
  async useQuanOrCard(params) {
    const { appFlag, isV3App } = this;
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
            this.logger.infoSave(
              "灵活用券条件生效，重置报价规则里的券类型为灵活用券类型",
              {
                autoUseQuanStatus,
                supplier_end_price,
                autoUseQuanPrice,
                auto_quan_value
              }
            );
          }
        }
        if (!is_auto_use_quan) {
          this.logger.info("使用会员卡出票");
          if (!real_member_price) {
            this.logger.errorSave(
              "使用会员卡前从该订单报价记录里获取会员价异常"
            );
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
        let quanValueList = offerRule.quan_value.split(",");
        this.logger.infoSave("使用优惠券出票", { quanValueList });
        // 读取券库存进行过滤重新设置quan_value为单个券类型
        if (quanValueList.length > 1) {
          const appQuanTypeList = await this.getQuanTypeListByApp({
            appFlag,
            mobile
          });
          if (appQuanTypeList?.length) {
            let canUseQuanTypeList = appQuanTypeList.filter(
              itemA =>
                quanValueList.includes(itemA.quan_value) &&
                itemA.quan_stock >= ticket_num
            );
            this.logger.infoSave("根据券类型和券库存进行筛选", {
              canUseQuanTypeList
            });
            if (canUseQuanTypeList.length) {
              offerRule.quan_value = canUseQuanTypeList[0].quan_value;
            }
          }
          if (offerRule.quan_value.split(",").length > 1) {
            offerRule.old_quan_value = offerRule.quan_value;
            offerRule.quan_value = offerRule.quan_value.split(",")[0];
            this.logger.infoSave("券类型容错处理：强制取第一个", {
              quan_value: offerRule.quan_value
            });
          }
        }
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
        const quanListRes = await getQuanList({
          city_id,
          cinema_id,
          session_id,
          quan_value,
          ticket_num,
          appFlag,
          quan_flag,
          black_quans,
          logger: this.logger
        });
        this.logger.infoSave("获取优惠券列表返回", quanListRes);
        // 这里拿到的券列表会比票数多10张
        let quanList = quanListRes?.quanList || [];
        let quanType = quanListRes?.quanType;
        quanStock = quanList.length || 0; // 默认用查出来的券库存（可能会比实际的少）
        if (!quanList?.length) {
          this.logger.errorSave("个人中心获取目标券列表返回为空");
        }
        if (is_store == "1") {
          if (quanList?.length < ticket_num) {
            this.logger.infoSave("用券前个人中心目标券不够，从服务端获取");
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
            this.logger.infoSave("从服务端获取券绑定完成", {
              newQuanList,
              quanStock,
              ticket_num
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
          this.logger.errorSave(
            `目标券${is_store == "1" ? "从服务端获取后" : ""}数量不足`
          );
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
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
              this.logger.errorSave(
                `使用优惠券前发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
                {
                  quan_fee,
                  ticket_num,
                  cardList
                }
              );
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
          this.logger.infoSave("灵活用券使用目标券后为空,转用卡处理");
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
      this.logger.errorSave("使用优惠券或者会员卡异常", { error });
      return {
        card_id: "",
        quan_code: "",
        profit: 0 // 利润
      };
    }
  }

  // 获取影院券类型列表
  async getQuanTypeListByApp({ appFlag: app_name, mobile }) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        // 只拿关联账号的券库存信息进行判断
        item.quanStockListByPhone = item.quanStockList.filter(
          itemA => itemA.phone === mobile
        );
        item.quan_stock = item.quan_stock || 0;
        if (item.quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          item.quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
      });
      this.logger.infoSave("根据影院获取券类型列表返回", { quanTypeList });
      return quanTypeList;
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
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
    try {
      // 1、获取会员卡列表
      const cardList = await this.getCardList({
        city_id,
        cinema_id,
        session_id
      });
      if (!cardList?.length) {
        this.logger.errorSave("获取会员卡列表为空");
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
      this.logger.errorSave("会员用卡处理异常", {
        error
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
      this.logger.infoSave("获取券类型信息返回", res);
      return res.data.quanInfo || null;
    } catch (error) {
      this.logger.errorSave("获取券类型信息异常", { error });
    }
  }

  // 获取排序手机号
  getSortedPhones(targetQuanList, quanValueList) {
    try {
      // 1. 按quanValue顺序排序arr
      const sortedByQuanValue = [...targetQuanList].sort((a, b) => {
        return (
          quanValueList.indexOf(a.quan_value) -
          quanValueList.indexOf(b.quan_value)
        );
      });
      // 2. 在每个分组内按库存降序排序
      const fullySorted = sortedByQuanValue.map(item => ({
        ...item,
        quanStockList: [...item.quanStockList].sort(
          (a, b) => b.quan_stock - a.quan_stock
        )
      }));
      // 3. 提取排序后的手机号
      const phoneSet = new Set();
      const uniqueSortedPhones = [];
      fullySorted.forEach(item => {
        item.quanStockList.forEach(stock => {
          if (!phoneSet.has(stock.phone)) {
            phoneSet.add(stock.phone);
            uniqueSortedPhones.push(stock.phone);
          }
        });
      });
      return uniqueSortedPhones;
    } catch (error) {
      this.logger.infoSave("获取按照券库存及顺序排序手机号异常", {
        error,
        targetQuanList,
        quanValueList
      });
    }
  }
  // 获取影院券类型列表
  async getSortPhoneByQuanTypeList(
    app_name,
    quan_flag,
    quan_value,
    ticket_num
  ) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let quanValueList = quan_value?.split(",");
      let targetQuanList = quanTypeList.filter(item =>
        quanValueList.includes(item.quan_value)
      );
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      this.logger.infoSave("获取影院目标券信息返回", {
        targetQuanList: JSON.parse(JSON.stringify(targetQuanList)),
        quan_flag,
        quan_value,
        useMobileList
      });

      targetQuanList.forEach(item => {
        let quanStockList = item?.quanStockList;
        if (quanStockList) {
          quanStockList = JSON.parse(quanStockList);
          quanStockList = quanStockList.map(itemA => ({
            ...itemA,
            quan_stock: itemA.quan_stock || 0
          }));
          quanStockList = quanStockList.filter(
            itemA =>
              useMobileList.includes(itemA.phone) &&
              itemA.quan_stock >= ticket_num
          );
          item.quanStockList = quanStockList;
        }
      });
      // 再根据券库存做下过滤
      targetQuanList = targetQuanList.filter(
        item => !!item.quanStockList.length
      );
      let sortMobileList = this.getSortedPhones(targetQuanList, quanValueList);
      if (sortMobileList) {
        this.logger.infoSave("获取排序手机列表返回", {
          sortMobileList
        });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
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
      this.logger.infoSave("更新券库存前获取同类目标券返回", {
        params,
        quanTypeParams,
        targetQuanList
      });
    } catch (error) {
      this.logger.errorSave("更新券库存前获取同类目标券异常", {
        error,
        quanTypeParams
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
      if (quan_value?.split(",")?.includes(item.quan_value)) {
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
      this.logger.infoSave("单个更新券库存返回", {
        res,
        params
      });
    } catch (error) {
      this.logger.errorSave("单个更新券库存异常", { error, params });
    }
  }

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
      coupon_id
    } = data;
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
      this.logger.infoSave("计算订单价格参数", {
        params
      });
      const res = await APP_API_OBJ[appFlag].priceCalculation(params);
      let price = res.data?.price;
      this.logger.infoSave("计算订单价格返回", res);
      return {
        price
      };
    } catch (error) {
      this.logger.errorSave("计算订单价格异常", { error });
      return { error };
    }
  }

  // 创建订单
  async createOrder(data) {
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
      this.logger.infoSave("创建订单参数", { params });
      let res = await this.sfcApi.createOrder(params);
      this.logger.infoSave("创建订单返回", { res });
      let order_num = res.data?.order_num || "";
      return order_num;
    } catch (error) {
      this.logger.errorSave("创建订单异常", { error });
      if (
        formatErrInfo(error)?.includes("密码") &&
        formatErrInfo(error)?.includes("错误")
      ) {
        sendWxPusherMessage({
          orderInfo: this.order,
          msgType: 5,
          cardNoByPwdError: card_id,
          failReason: "密码输入错误，请检查卡号密码是否正确"
        });
      }
      // 只有内部用户支持该功能，外部用户待券维护分开后再放开该功能
      if (
        error?.msg?.includes("请联系影院将使用该券的原订单后台退款后") &&
        isTimeoutRetry === 1
      ) {
        this.logger.infoSave("创建订单时发现券不可用，进行更新黑名单处理", {
          quan_flag,
          coupon
        });
        // 更新券黑名单
        updateQuanBlackInfo({
          coupon,
          quan_flag,
          plat_name,
          order_number,
          app_name: this.appFlag,
          logger: this.logger
        });
      }
      if (error?.msg === "请求接口超时,请重试" && isTimeoutRetry === 1) {
        this.logger.infoSave("创建订单请求接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const order_num = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (order_num) {
            this.logger.infoSave("创建订单请求接口超时，延迟1秒后重试成功", {
              order_num
            });
            return order_num;
          }
        } catch (error) {
          this.logger.errorSave("创建订单请求接口超时，延迟2秒后重试失败", {
            error
          });
        }
      }
    }
  }

  // 获取购票信息
  async payOrder(data) {
    const { isV3App } = this;
    let {
      city_id,
      cinema_id,
      order_num,
      session_id,
      logger,
      inx = 1
    } = data || {};
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
      if (inx === 1) {
        logger.infoSave("获取支付结果传参", {
          params
        });
      }
      const res = await this.sfcApi.payOrder(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, { res });
      let qrcode = res.data.qrcode || "";
      if (qrcode) {
        return qrcode;
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, {
        error
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
                logger.infoSave(`第${inx}次从已完成订单里获取取票码成功`, {
                  qrcode
                });
                return qrcode;
              } else {
                logger.errorSave(`第${inx}次从已完成订单里获取取票码失败`, {
                  list,
                  order_num
                });
              }
            }
          }
        } catch (error) {
          logger.errorSave(
            `第${inx}次从已完成订单里获取取票码异常`,
            formatErrInfo(error)
          );
        }
      }
      return Promise.reject(error);
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
    const { appFlag } = this;
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.payOrder({
          city_id,
          cinema_id,
          order_num,
          session_id,
          logger: this.logger
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        sendWxPusherMessage({
          orderInfo,
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
      this.logger.infoSave("非异步获取订单支付结果成功");
      const submitRes = await this.submitQrcode({
        qrcode,
        orderInfo,
        flag: 1,
        logger: this.logger
      });
      // submitRes: {} | undefined
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("出票最后处理发现异常", {
        error
      });
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    city_id,
    cinema_id,
    order_num,
    session_id,
    app_name,
    plat_name,
    order_number,
    orderInfo
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init({ plat_name, order_number, app_name });
    logger.errorSave("异步轮询获取取票码并提交方法开始执行");
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
            logger
          }),
        9,
        20,
        "",
        3 * 60
      );
      if (!qrcode) {
        // 3分钟后还失败消息推送
        sendWxPusherMessage({
          orderInfo,
          transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
          failReason: "系统延迟轮询3分钟后获取取票码仍失败"
        });
        logger.errorSave("系统延迟轮询3分钟后获取取票码仍失败");
        // 每搁20秒查一次，查21次，7分钟
        qrcode = await trial(
          inx =>
            this.payOrder({
              city_id,
              cinema_id,
              order_num,
              session_id,
              inx,
              logger
            }),
          21,
          20,
          "",
          7 * 60
        );
      }
      if (!qrcode) {
        logger.errorSave("系统延迟轮询10分钟后获取取票码仍失败");
        // 上送异步轮询获取取票码失败日志
        logger.logUpload();
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
        qrcode,
        orderInfo,
        flag: 2,
        logger
      });
      // 上送异步轮询获取取票码成功日志
      logger.logUpload();
    } catch (error) {
      logger.errorSave("异步轮询获取取票码上传提交异常", { error });
      // 上送异步轮询获取取票码异常日志
      logger.logUpload();
    }
  }

  async submitQrcode({ qrcode, flag, logger, orderInfo }) {
    const { plat_name, order_number } = orderInfo;
    try {
      // 10、提交取票码
      const submitRes = await this.platManage.submitTicketCode({
        qrcode,
        flag,
        logger,
        orderInfo: JSON.parse(JSON.stringify(orderInfo))
      });
      if (!submitRes || submitRes?.error) {
        logger.errorSave("订单提交取票码失败");

        let errInfo = formatErrInfo(submitRes?.error);
        sendWxPusherMessage({
          orderInfo,
          transferTip: "提交取票码失败,需手动上传",
          failReason: errInfo
        });
        return;
      }
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
      logger.errorSave("提交取票码异常", { error });
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
      this.logger.infoSave("获取会员卡列表参数", { params, isV3App });
      const res =
        await APP_API_OBJ[appFlag][
          isV3App ? "getCardAndQuanList" : "getCardList"
        ](params);

      let cardList = res.data?.card_data || [];
      if (isV3App) {
        let cardInfo = res.data?.member_info;
        if (cardInfo) {
          cardList = [cardInfo];
        }
      }
      this.logger.infoSave("获取会员卡列表返回", {
        res,
        cardList
      });
      // v3华谊走的是非会员svip+券的形式
      if (!isV3App) {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(itemA => itemA.card_num === item.card_num)
          );
          this.logger.infoSave("从可用卡（库里维护且出票量未达标）里面过滤后", {
            cardList
          });
        }
      }
      return cardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡列表异常", { error });
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
      this.logger.infoSave("获取该影院已维护会员卡列表返回", {
        list
      });
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item => item.app_name === appFlag && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      let cardListByMobile = list.filter(item =>
        useMobileList.includes(item.mobile)
      );
      this.logger.infoSave("根据该用户关联手机号对卡列表进行过滤", {
        useMobileList,
        cardListByMobile
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
      this.logger.infoSave("根据当天及当月出票量限制过滤后", {
        cardListLimit
      });

      let useCanCardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        useCanCardList
      });
      return useCanCardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", {
        error
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
    plat_name,
    order_number,
    quanStock,
    ticket_num
  }) {
    const { appFlag } = this;
    let logger = new Logger({
      logType: 3
    });
    let targetLogger = asyncFlag === 1 ? logger : this.logger;
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
      targetLogger.infoSave(`${conPrev}根据券标识获取券类型返回`, {
        quanTypeList
      });
    } catch (error) {
      targetLogger.errorSave(`${conPrev}根据券标识获取券类型返回异常`, {
        error
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
      targetLogger.infoSave(`${conPrev}从服务端获取券返回`, {
        quanRes,
        quanNum,
        quan_value,
        params
      });

      let quanList = quanRes?.data?.quanList || [];
      if (asyncFlag != 1 && (!quanList?.length || quanList?.length < diffNum)) {
        targetLogger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(`正在尝试绑定券 ${quan.coupon_num}...`);
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
          targetLogger.errorSave(`${conPrev}绑定券异常`, couponNumRes);
        } else {
          targetLogger.infoSave(`${conPrev}绑定券返回`, couponNumRes);
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
      targetLogger.errorSave(`${conPrev}获取新券异常`, {
        error,
        quanNum,
        quan_value,
        params
      });
    } finally {
      if (asyncFlag) {
        targetLogger.init({ plat_name, order_number, app_name: appFlag });
        // 上送异步绑券日志
        targetLogger.logUpload();
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
    try {
      // 规则如下:
      // 1、成本不能高于中标价，即40券不能出中标价38.8的单
      // 2、1张票一个券，不能出现2张票用3个券的情况
      // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
      let targetQuanList = quanList || []; // 优惠券列表

      if (targetQuanList?.length - ticket_num < 10 && is_store == "1") {
        this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
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
        this.logger.errorSave("使用优惠券计算价格后最终利润为负");
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
      this.logger.errorSave("使用优惠券异常", { error });
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
    const { appFlag, isV3App } = this;
    try {
      let cards = cardList || [];
      let cardFilter = cards.filter(
        item => Number(item.balance) >= Number(member_total_price)
      );
      if (!cardFilter?.length) {
        this.logger.errorSave("会员卡余额不足", {
          cards,
          member_total_price,
          real_member_price,
          ticket_num
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
            this.logger.infoSave(`正在尝试使用卡 ${card.card_num}`);
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
              this.logger.errorSave("尝试使用卡时计算价格异常", {
                error: priceRes?.error
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
                this.logger.infoSave(
                  str + `,${isChangeCard ? "准备换卡" : ""};`,
                  {
                    price
                  }
                );
                errReason = str || "计算价格高于真实会员价*座位数";
              } else {
                card_id = card.id;
                cardNum = card.card_num;
                console.log("卡使用成功，返回结果并停止尝试。");
                return price; // 卡使用成功，返回结果并结束函数
              }
            }
          }
          this.logger.errorSave("所有会员卡尝试均失败：" + errReason);
          return null; // 所有卡尝试失败后返回null
        };
        // 3、计算价格要求最终价格小于中标价
        priceInfo = await attemptCardsSequentially();
        if (!priceInfo) {
          this.logger.error("计算订单价格失败，单个订单直接出票结束");
          return {
            profit: 0,
            card_id: ""
          };
        }
        console.warn(
          "会员卡出票最终价格",
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
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
          profit
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
      this.logger.errorSave("使用会员卡异常", { error });
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
  try {
    let params = {};
    console.log("获取城市列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCityList(params);
    console.log("获取城市列表返回", res);
    let cityList = res.data?.all_city || [];
    return {
      cityList
    };
  } catch (error) {
    console.error("获取城市列表异常", error);
    return {
      error
    };
  }
};

// 获取城市影院列表
const getCityCinemaList = async ({ city_id, appFlag }) => {
  try {
    let params = {
      city_id
    };
    console.log("获取城市影院参数", params);
    const res = await APP_API_OBJ[appFlag].getCinemaList(params);
    console.log("获取城市影院返回", res);
    let cinemaList = res.data?.cinema_data || [];
    cinemaList = cinemaList.map(itemA => ({
      ...itemA,
      cinemaId: itemA.id
    }));
    return {
      cinemaList
    };
  } catch (error) {
    console.error("获取城市影院异常", error);
    return {
      error
    };
  }
};

// 获取电影放映列表
const getMoviePlayInfo = async ({ city_id, cinema_id, appFlag }) => {
  try {
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log("获取电影放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log("获取电影放映列表返回", res);
    return {
      movieData: res.data?.movie_data || []
    };
  } catch (error) {
    console.error("获取电影放映列表异常", error);
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
  try {
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      session_id,
      width: "240"
    };
    console.log("获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log("获取座位布局返回", res);
    let seatData = res.data?.play_data?.seat_data || [];
    return {
      seatData
    };
  } catch (error) {
    console.error("获取座位布局异常", error);
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
    logger
  } = data;
  const params = {
    city_id,
    cinema_id,
    session_id,
    page,
    status: 4
  };
  try {
    const res = await APP_API_OBJ[appFlag].getQuanList(params);
    logger.infoSave("连续获取目标券返回", { res, params });
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
    logger.infoSave("按照券类型或者券标识匹配目标券列表", {
      quan_value,
      quan_flag,
      quanFlagList,
      targetQuanList
    });
    quanData.push(...targetQuanList);
    if (total_page > page && quanData.length < targetNum) {
      let currentQuanNum = quanData?.length;
      logger.infoSave("目标券列表数量不够，递归连续获取目标券", {
        ticket_num,
        targetNum,
        currentQuanNum
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
    logger.errorSave("连续获取目标券异常", { error });
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
    logger
  } = data;
  try {
    let params = {
      city_id,
      cinema_id,
      session_id,
      page,
      status: 4 // 未使用
    };
    logger.infoSave("获取优惠券列表参数", { params });
    const res = await APP_API_OBJ[appFlag].getQuanList(params);
    logger.infoSave("获取优惠券列表返回", { res });
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
    logger.infoSave("按照券类型或者券标识匹配目标券列表", {
      quan_value,
      quan_flag,
      quanFlagList,
      targetQuanList
    });
    // 证明还有下一页，且第一页目标券不够
    if (total_page > page && targetQuanList?.length < targetNum) {
      let currentQuanNum = targetQuanList?.length;
      logger.infoSave("目标券列表数量不够，开始连续获取目标券", {
        ticket_num,
        targetNum,
        currentQuanNum
      });
      const quanDataRes = await continuousGetQuan({
        ...data,
        page: 2,
        targetNum: targetNum - targetQuanList.length
      });
      logger.infoSave("连续获取目标券返回结果", quanDataRes);
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
      logger.infoSave("会员赠券按照card_num分组", {
        groupedCoupons,
        targetQuanGroup
      });
      targetQuanList = targetQuanGroup?.slice(0, ticket_num) || [];
      if (!targetQuanList?.length) {
        logger.infoSave("会员赠券数量不够出票");
      }
    }
    return {
      quanList: targetQuanList,
      quanType
    };
  } catch (error) {
    logger.errorSave("获取优惠券列表异常", { error });
  }
};

// 绑定券
const bandQuan = async ({
  city_id,
  cinema_id,
  coupon_num,
  session_id,
  appFlag
}) => {
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    city_id,
    cinema_id,
    session_id,
    coupon_code: coupon_num,
    from_goods: "2"
  };
  // if (appFlag === "sfc") {
  //   params.city_id = "499";
  //   params.cinema_id = "3";
  //   if (quan_value == "sfctianjin") {
  //     params.city_id = "501";
  //     params.cinema_id = "50";
  //   }
  // }
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
      console.error("绑定新券异常", res);
      return {
        errMsg: "绑定新券异常:" + JSON.stringify(res),
        params
      };
    }
  } catch (error) {
    console.error("绑定新券异常", error);
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
  isV3App,
  card_id,
  pay_password,
  orderInfo
}) => {
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
    console.log("订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log("订单购买返回", buyRes);
    return {
      buyRes,
      params
    };
  } catch (error) {
    console.error("订单购买异常", error);
    if (
      formatErrInfo(error)?.includes("密码") &&
      formatErrInfo(error)?.includes("错误")
    ) {
      sendWxPusherMessage({
        orderInfo,
        msgType: 5,
        cardNoByPwdError: card_id,
        failReason: "密码输入错误，请检查卡号密码是否正确"
      });
    }
    if (
      formatErrInfo(error).includes("超时") ||
      formatErrInfo(error).includes("timeout of")
    ) {
      sendWxPusherMessage({
        orderInfo,
        transferTip: "订单支付接口超时，请关注该订单购买出票情况",
        failReason: formatErrInfo(error)
      });
    }
    return {
      error,
      params
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
      cinema_code: order.cinema_code,
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
const updateCardDayUse = async ({
  app_name,
  card_id,
  plat_name,
  order_number
}) => {
  let logger = new Logger({ logType: 3 });
  try {
    const res = await svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id
    });
    logger.infoSave("订单用卡购买后更新当天使用量成功", {
      app_name,
      card_id,
      res
    });
  } catch (error) {
    logger.errorSave("订单用卡购买后更新当天使用量失败", {
      app_name,
      card_id,
      error
    });
  }
  logger.init({
    plat_name,
    app_name,
    order_number
  });
  // 上送更新卡当天使用量日志
  logger.logUpload();
};
export default createTicketQueue;
