import {
  getCurrentTime,
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon,
  mockDelay, // 模拟延时
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById,
  formatTimeOfTime,
  getCurrentDay,
  isDateInCurrentMonth,
  findMostRepeatedChars,
  couponInfoSpecial,
  generateTicketImage,
  uploadBlobImage,
  subDecimal
} from "@/utils/utils";
import md5 from "@/utils/md5.js";
// 帮助锁定座位实例对象
import assistLockSeatObj from "./lockSeatQueue";
import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
// 平台管理类
import PlatManage from "@/common/autoTicket/buyTicket/platManage";
// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id, phone }
} = platTokens();
// 影院特殊匹配列表及api
import {
  TEST_NEW_PLAT_LIST,
  GET_APP_TYPE_LIST,
  NO_FEE_PLAT_LIST
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
    this.umeApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isStart = false; // 是否启动
    this.usableCardList = []; // 会员可用卡列表（库里维护的）
    this.loggerQ = new Logger({ logType: 3 }); // 队列日志类
    // 监听新订单
    window.addEventListener(this.eventName, this.handleNewOrder.bind(this));
  }

  // 启动队列
  async start() {
    this.prevOrderNumber = "";
    this.queue = [];
    this.handledOrders = new Map();
    this.isStart = true; // 是否启动
    this.loggerQ.warn("队列启动，开始监听是否有新订单");
  }

  // 测试新订单
  testSendNewOrder(order) {
    const { appFlag } = this;
    isTestOrder = true;
    this.start();
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
    this.loggerQ.info(`发送测试订单——${appFlag}:`, newOrder);
  }

  // 处理新订单
  handleNewOrder(event) {
    const { appFlag, isStart } = this;
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
              errMsg,
              errInfo,
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
        `订单开始出票，订单号-${order.order_number}，上个订单号-${this.prevOrderNumber}`
      );
      // await mockDelay(delayTime);
      this.logger.info(`订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
        // result: { profit, submitRes, transferParams, qrcode, quan_code, card_id, cardNum, offerRule }
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

  // 释放座位
  async releaseSeat({ cinemaLinkId, lockOrderId, session_id }) {
    // const session_id = this.currentParamsList[this.currentParamsInx].session_id;
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      lockOrderId,
      umeToken: session_id
    };
    try {
      const res = await this.umeApi.unlockSeat(params);
      this.logger.infoSave("释放座位入参及返回", {
        params,
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
  // 转单
  async transferOrder(order, unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { cinemaLinkId, lockOrderId, orderId } = unlockSeatInfo || {};
      const session_id =
        this.currentParamsList[this.currentParamsInx].session_id;
      // 1、释放座位(仅锁座id存在时)
      if (!orderId) {
        await this.releaseSeat({ cinemaLinkId, lockOrderId, session_id });
      }
      // 2、取消订单(创建订单id存在时)
      if (orderId) {
        await this.cancelOrder({
          cinemaLinkId,
          orderId,
          session_id
        });
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
    const { id, plat_name, supplierCode, order_number, bid } = item;
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
      offerRule = { offer_type: "2", member_price: "30" };
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
      // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
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
    const { appFlag } = this;
    this.logger.info("一键买票待下单信息", item);
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
          this.logger.errorSave("获取城市影院列表失败");
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let cinemaList =
          cityCinemaList?.map(item => item.cinemaList)?.flat() || [];
        if (!cinemaList?.length) {
          this.logger.errorSave("获取全部影院列表失败", {
            cityCinemaList
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 3、获取目标影院
        let targetCinema = cinemaList.find(
          item => cinema_code && item.cinemaCode === cinema_code
        );
        if (!targetCinema) {
          targetCinema = getTargetCinemaCommon({
            app_name: appFlag,
            plat_cinema_code: cinema_code,
            cinema_list: cinemaList
          });
        }
        if (!targetCinema) {
          this.logger.errorSave("获取目标影院失败", {
            cinema_name,
            cinemaList,
            appFlag,
            city_name
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
        this.logger.infoSave(`首次出票手机号-${phone}`);
        this.curPhone = phone;
        // 4、获取目标影院放映列表
        const movie_data = await this.getMoviePlayInfo({
          cinemaLinkId
        });

        if (!movie_data?.length) {
          this.logger.errorSave("获取目标影院放映列表失败");
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logger.infoSave("获取影院放映信息成功");
        // 5、获取目标影片信息
        let movieInfo = movie_data.find(item => item.filmName === film_name);
        if (!movieInfo) {
          movieInfo = movie_data.find(
            item =>
              convertFullwidthToHalfwidth(item.filmName) ===
              convertFullwidthToHalfwidth(film_name)
          );
          if (!movieInfo) {
            this.logger.warn("获取目标影片信息失败", { movie_data, film_name });
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
              this.logger.errorSave("获取目标影片信息失败", {
                film_name,
                movie_data
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
          this.logger.infoSave("同一时间多场次", { targetShowList });
        }
        if (!targetShow) {
          this.logger.errorSave("匹配影片放映日期失败", {
            showList,
            start_time
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        this.logger.infoSave("出票时获取电影放映信息", { targetShow });
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
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 9、匹配作为ids
        let seatName = lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号");
        this.logger.info("seatName", seatName);
        let selectSeatList = seatName.split(",");
        this.logger.info("selectSeatList", selectSeatList);
        let targeSeatList = seatList.filter(item => {
          const { rowName, columnName } = item;
          // let seat1 = yCoord + "排" + columnName + "号";
          let seat2 = rowName + "排" + columnName + "号";
          return selectSeatList.includes(seat2);
        });
        this.logger.info("targeSeatList", targeSeatList);
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
        this.logger.infoSave("目标座位相关信息", {
          targeSeatList,
          areaInfoList,
          areaTotalPrice
        });
        if (seatIds?.length != ticket_num) {
          this.logger.errorSave("获取目标座位失败", {
            seatList,
            seatName
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
      } else {
        // 取消订单释放座位参数
        let unlockSeatInfo = {
          cinemaLinkId,
          orderId,
          lockOrderId,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        };
        let isCancel;
        if (orderId) {
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
        this.logger.error("锁定座位失败准备试错2次，间隔5秒", error);
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
            shangzhan: [6, 5],
            shoutu: [20, 12]
          };
          lockRes = await trial(
            inx => this.lockSeatHandle(params, inx),
            delayConfig[plat_name][0],
            delayConfig[plat_name][1]
          );
        }
        if (!lockRes) {
          if (isTrial) {
            this.logger.infoSave("首次锁定座位失败轮询尝试后仍失败，走转单");
          }
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        if (isTrial) {
          this.logger.infoSave("首次锁定座位失败试错后锁定成功");
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
        this.logger.error("获取最优卡券组合失败");
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
      this.logger.infoSave("获取最优卡券组合返回", {
        "cardList(从可用卡列表过滤后的卡:)": cardList,
        oldCardList: orderInfoRes?.cards,
        quanList: quanList.slice(0, 10),
        activities,
        canUseCoupon,
        preferCoupons: preferCoupons?.slice(0, 10)
      });
      // 原总价
      total_price = activities.find(
        item => item.payMethod === ""
      )?.originalTicketTotalPrice;
      // 7、使用优惠券或者会员卡
      let member_discount_list = activities.filter(
        item => item.cardInfos?.length
      );
      if (member_discount_list.length) {
        this.logger.infoSave("会员卡支付-优惠活动列表", {
          member_discount_list: JSON.parse(JSON.stringify(member_discount_list))
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
        this.logger.infoSave("会员卡支付-优惠活动列表（根据卡余额过滤后）", {
          member_discount_list: JSON.parse(JSON.stringify(member_discount_list))
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
      this.logger.infoSave("会员总价计算相关信息", {
        total_price,
        member_total_price,
        ticket_num,
        real_member_price: offerRule.real_member_price,
        cardInfos
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
      this.logger.infoSave("使用会员卡或优惠券返回", {
        card_id,
        useQuan,
        profit
      });
      let failMsg;
      if (offerRule.offer_type === "1") {
        if (!useQuan?.length) {
          failMsg = "无可用优惠券";
        }
        if (offerRule.quan_fee > 0 && !card_id && useQuan?.length) {
          failMsg = "无可补券手续费的会员卡";
        }
      } else {
        if (!card_id) {
          failMsg = "无可用会员卡";
        }
      }
      // 使用优惠券及会员卡
      if (failMsg) {
        let { err_msg: errMsg, err_info: errInfo } =
          this.logger.getLastErrMsgAndInfo();
        if (errMsg) {
          failMsg = failMsg + "-" + errMsg;
        }
        this.logger.errorSave(failMsg, {
          cardList,
          quanList: quanList.slice(0, 10),
          supplier_end_price,
          ticket_num,
          total_price,
          activities
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.transferOrder(item, {
            cinemaLinkId,
            lockOrderId
          });
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
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
      // 个人中心用券时
      let quanDiscountAmount =
        quanList?.[0]?.discountValue || useQuan?.[0]?.discountAmount || 0;
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        // total_price = orderInfoRes?.preferCouponInfo?.totalTicketPrivilegePrice;
        if (offerRule.quan_fee > 0) {
          // 支付价格要乘以100
          payAmount = (+offerRule.quan_fee * 1000 * ticket_num) / 10 || 0;
          // 这里本身单位就乘过100了，故不用再乘100
          let realPayAmount = (quanDiscountAmount * 1000 * ticket_num) / 1000;
          // payAmount = realPayAmount;
          this.logger.infoSave("券补钱总价计算相关信息", {
            total_price,
            realPayAmount,
            quanInfo: quanList[0],
            quan_fee: offerRule.quan_fee,
            ticket_num
          });
        } else {
          payAmount = 0;
        }
        if (offerRule.is_store == "1" && quanList.length - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.getNewQuan({
            cinemaLinkId,
            quanValue: offerRule.quan_value,
            black_quans: offerRule.black_quans,
            quanNum: 10 - (quanList.length - Number(ticket_num)),
            session_id:
              this.currentParamsList[this.currentParamsInx].session_id,
            asyncFlag: 1,
            plat_name,
            order_number
          });
        }
      }
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
        payments,
        card_id
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
      if (!orderId) {
        // 从订单列表获取到目标订单
        await mockDelay(3);
        const orderInfo = await this.getOrderInfoByOrderList({
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        orderId = orderInfo?.orderId;
      }
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let cardNo = card_id;
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (!orderId) {
        this.logger.error("创建订单失败，单个订单直接出票结束,走转单逻辑");
        const transferParams = await this.transferOrder(item, {
          cinemaLinkId,
          lockOrderId
        });
        return { offerRule, transferParams };
        // if (!card_id && offerRule.offer_type == "1") {
        //   this.logger.infoSave(
        //     "纯用券场景由于不需要支付，创建订单失败当成功处理"
        //   );
        // } else {
        //   this.logger.error("创建订单失败，单个订单直接出票结束", "走转单逻辑");
        //   const transferParams = await this.transferOrder(item, {
        //     cinemaLinkId,
        //     lockOrderId
        //   });
        //   return { offerRule, transferParams };
        // }
      }
      this.logger.infoSave("创建订单成功");
      if (isTestOrder) {
        this.logger.infoSave("测试单暂不购买");
        return { offerRule };
      }
      payAmount = Number(payAmount) / 100;
      // 支付前校验用券价格
      if (
        offerRule.offer_type == "1" &&
        useQuan?.length &&
        payAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          payAmount,
          quan_fee_total,
          quan_fee,
          ticket_num
        });
        const transferParams = await this.transferOrder(item, {
          cinemaLinkId,
          orderId
        });
        return { offerRule, transferParams };
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        if (payAmount > real_member_price) {
          if (subDecimal(payAmount, real_member_price) < profit) {
            this.logger.infoSave(
              "用完卡发现支付金额大于会员价*票数，利润需减去差值",
              {
                payAmount,
                real_member_price,
                profit
              }
            );
            profit = subDecimal(
              profit,
              subDecimal(payAmount, real_member_price)
            );
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              payAmount,
              real_member_price,
              ticket_num
            });
            const transferParams = await this.transferOrder(item, {
              cinemaLinkId,
              orderId
            });
            return { offerRule, transferParams };
          }
        } else if (payAmount < real_member_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_price * 1000 - payAmount * 1000) * member_discount) /
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
          member_pwd: this.currentParamsList[this.currentParamsInx].member_pwd,
          orderInfo: this.order
        });
        this.logger.infoSave("订单购买返回", { buyTicketRes });
        const buyRes = buyTicketRes?.buyRes;
        if (!buyRes) {
          this.logger.error("订单购买失败，单个订单直接出票结束走转单逻辑");
          let errInfo = buyTicketRes?.error
            ? JSON.stringify(buyTicketRes?.error)
            : "";
          let errMsgList = ["timeout", "Request failed", "已下单成功"];
          if (errMsgList.some(item => errInfo?.includes(item))) {
            this.logger.infoSave("订单购买返回超时或异常当成功处理", {
              buyTicketRes
            });
          } else {
            this.logger.errorSave("订单购买异常", {
              error: buyTicketRes?.error
            });
            // 后续要记录失败列表（订单信息、失败原因、时间戳）
            const transferParams = await this.transferOrder(item, {
              cinemaLinkId,
              orderId
            });
            return { offerRule, transferParams };
          }
        }
        this.logger.infoSave("订单购买成功");
        if (card_id) {
          // 更新卡使用量
          updateCardDayUse({
            app_name: appFlag,
            card_id,
            plat_name,
            order_number
          });
        }
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
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      this.logger.info("一键买票完成");
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
        offerRule
      };
    } catch (error) {
      this.logger.errorSave("一键买票异常", { error });
      sendWxPusherMessage({
        orderInfo: item,
        transferTip: "一键买票异常，请及时联系技术",
        failReason: formatErrInfo(error)
      });
      return { offerRule };
    }
  }

  // 从个人中心获取购买订单信息
  async getOrderInfoByOrderList({ session_id, retryCount = 1 }) {
    const MAX_RETRY_COUNT = 3;
    try {
      const params = {
        umeToken: session_id
      };
      this.logger.infoSave("获取订单列表参数", params);
      const res = await this.umeApi.getOrderList(params);
      let orderList = res?.bizValue || [];
      this.logger.infoSave("获取订单列表返回", {
        orderList: orderList.slice(0, 5)
      });
      const { film_name, show_time, lockseat } = this.order;
      let targerOrder = orderList.find(item => {
        const { filmName, showDate, seatNames } = item.ticketInfo || {};
        return (
          filmName === film_name &&
          +new Date(show_time) == showDate &&
          seatNames.split("|").every(itemA => lockseat.includes(itemA))
        );
      });
      if (targerOrder) {
        this.logger.infoSave("从订单列表获取到目标订单", { targerOrder });
        return targerOrder;
      }
      // 重试2次获取订单列表
      if (!targerOrder && retryCount < MAX_RETRY_COUNT) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          retryCount: retryCount + 1
        });
      }
    } catch (error) {
      this.logger.errorSave("从订单列表获取到目标订单异常", { error });
      // 重试2次获取订单列表
      if (retryCount < MAX_RETRY_COUNT) {
        await mockDelay(1);
        return await this.getOrderInfoByOrderList({
          session_id,
          retryCount: retryCount + 1
        });
      }
    }
  }

  // 连续获取券
  async continuousGetQuan(data) {
    let { session_id, pageNo = 1, pageSize = 100, quanData = [] } = data;
    let params = {
      state: "USEFUL",
      pageNo,
      pageSize, // 支持修改
      umeToken: session_id
    };
    // {"channelCode":"BONA_H5_PROD_S_MPS","larkSid":"f7ccceebb0db410b8971dccb540178c0","version":"H5","appVersion":"H5_5.0","state":"USEFUL","pageNo":1,"pageSize":20}
    try {
      this.logger.infoSave("连续获取券参数", params);
      const res = await this.umeApi.getQuanList(params);
      let quanList = res.bizValue || [];

      this.logger.infoSave("连续获取券返回", {
        quanList: quanList.map(item => ({
          name: item.name,
          couponCode: item.couponCode
        }))
      });

      quanData.push(...quanList);
      if (pageSize > quanList.length) {
        return quanData;
      } else {
        // 继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          pageNo: pageNo + 1,
          quanData
        });
      }
    } catch (error) {
      this.logger.errorSave("连续获取券异常", { error });
      return [];
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
      this.logger.infoSave("获取最近用券记录入参及返回", {
        params,
        res
      });
      return usedQuanList;
    } catch (error) {
      this.logger.infoSave("获取最近用券记录异常", {
        params,
        error
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

      this.logger.info("锁定座位参数", params);
      const res = await this.umeApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res?.bizValue;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
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
      this.logger.infoSave("核销券参数", { params });
      const res = await this.umeApi.checkQuan(params);
      this.logger.infoSave("核销券返回", { res });
    } catch (error) {
      this.logger.errorSave("核销券异常", { error });
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
      card_id,
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
      this.logger.infoSave("创建订单参数", { params });
      const res = await this.umeApi.createOrder(params);
      this.logger.infoSave("创建订单返回", { res });
      let createOrderRes = res.bizValue;
      return createOrderRes;
    } catch (error) {
      this.logger.errorSave("创建订单异常", { error });
      // 用卡时才重试，用券该接口就直接支付了
      if (
        formatErrInfo(error).includes("超时") &&
        isTimeoutRetry === 1 &&
        card_id
      ) {
        this.logger.infoSave("创建订单接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const createOrderRes = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (createOrderRes) {
            this.logger.infoSave("创建订单请求接口超时，延迟2秒后重试成功");
            return createOrderRes;
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
  async getPayResult(data) {
    let {
      orderId,
      cinemaLinkId,
      session_id,
      logger,
      isUseQuan,
      inx = 1
    } = data || {};
    let qrcode;
    let targetLogger = logger || this.logger;
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
      if (inx == 1) {
        targetLogger.infoSave("获取支付结果参数", { params });
      }
      const res = await this.umeApi.getOrderInfo(params);
      targetLogger.infoSave(`第${inx}次获取支付结果返回`, { res });
      qrcode =
        res?.bizValue?.ticketInfo?.confirmationId?.split(",").join("|") || "";
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
      // 获取失败后从已完成订单里匹配获取
      try {
        const listRes = await this.umeApi.getOrderList({
          umeToken: session_id
        });
        targetLogger.infoSave(`第${inx}次获取已完成订单列表返回`, {
          listRes: listRes?.bizValue?.slice(0, 2)
        });
        let payList = listRes.bizValue || [];
        let targetObj = payList.find(item => item.orderId == orderId);
        qrcode = targetObj?.ticketInfo?.confirmationId?.split(",").join("|");
        targetLogger.infoSave(
          `第${inx}次从已完成订单里获取取票码${qrcode ? "成功" : "失败"}`,
          {
            qrcode
          }
        );
      } catch (error) {
        targetLogger.errorSave(`第${inx}次获取已完成订单列表异常`, { error });
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
    targetLogger
  }) {
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
      const blob = await generateTicketImage({
        ...orderInfo,
        qrcode,
        logger: targetLogger
      });
      let fileUrl = "";
      if (blob) {
        fileUrl = await uploadBlobImage({
          blob,
          url: "https://up-hub-img.yinghuasuan.com/api/upload_img",
          params: {
            event: "order",
            event_data: orderInfo.order_sn
          },
          plat_name,
          logger: targetLogger
        });
      }
      params = {
        order_sn: orderInfo.order_sn,
        ticket_code: qrcode,
        ticket_image: fileUrl || " ", // 需传图片url
        real_seat_no: lockseat.split(" ").join(","),
        entry_method: 0,
        ticket_original_info: [
          {
            file_url: fileUrl || " ", // 需传图片url
            codeList: [
              {
                code: qrcode.split("|")[0],
                pwd: qrcode.split("|")?.[1] || ""
              }
            ],
            seatList: lockseat.split(" "),
            // ocrInfo为图片校验接口返回数据
            ocrInfo: {
              film_name: true,
              cinema_name: true,
              hall_name: true,
              show_time_day: true,
              show_time_time: true,
              seat_no: {
                is_change: false,
                seat_no: lockseat.split(" ")
              },
              ticket_code: [
                [qrcode.split("|")[0], qrcode.split("|")?.[1] || ""]
              ],
              have_qrcode: true,
              seatMatch: true
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
      const { bid, cinema_name, hall_name, film_name, show_time } = orderInfo;
      const blob = await generateTicketImage({ ...orderInfo, qrcode });
      const fileUrl = await uploadBlobImage({
        blob,
        url: "https://hahapiao.cn/api/Synchro/upload",
        params: {
          orderId: order_id
        },
        plat_name,
        logger: targetLogger
      });
      if (!fileUrl) {
        targetLogger.infoSave("哈哈获取取票码图片失败,需手动上传");
        sendWxPusherMessage({
          orderInfo,
          transferTip: "哈哈获取取票码图片失败,需手动上传",
          failReason: "哈哈获取取票码图片失败,需手动上传"
        });
        return { code: 1, msg: "哈哈获取取票码图片失败,需手动上传" };
      }
      let imgIndex = md5.hex_md5(fileUrl); // 图片的md5值
      params = {
        oid: order_id,
        bid,
        seat: lockseat.split(" "),
        info: lockseat.split(" ").map((item, inx) => {
          if (inx === 0) {
            return {
              img: fileUrl || " ", // 传空格可以成功
              num: qrcode.split("|")[0],
              code: qrcode.split("|")[1],
              imgIndex, // 传空格可以成功
              // isChai: false,
              // blob: "",
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
        ticket_type: 1,
        // ocr_code: [qrcode],
        recogniseSeat: lockseat.split(" ").map(item => ({
          oldSeat: item,
          newSeat: item,
          imgIndex
        }))
      };
    }
    try {
      targetLogger.infoSave("提交出票码参数", { params });
      if (isTestOrder) {
        targetLogger.errorSave("测试单暂不上传", { params });
        return;
      }
      const res = await PLAT_API_OBJ[plat_name].submitTicketCode(params);
      targetLogger.infoSave("提交取票码返回", res);
      return res;
    } catch (error) {
      targetLogger.errorSave("提交出票码异常", { error });
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
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
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
      this.logger.infoSave("非异步获取订单支付结果成功");
      const submitRes = await this.submitQrcode({
        qrcode,
        orderInfo,
        flag: 1,
        logger: this.logger
      });
      return { submitRes, qrcode };
    } catch (error) {
      this.logger.errorSave("出票最后处理发现异常", { error });
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
    let logger = new Logger({ logType: 3 });
    logger.init({ plat_name, order_number, app_name });
    try {
      logger.errorSave("异步轮询获取取票码并提交方法开始执行");
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderId,
            cinemaLinkId,
            session_id,
            inx,
            logger,
            isUseQuan
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
            this.getPayResult({
              orderId,
              cinemaLinkId,
              session_id,
              inx,
              logger,
              isUseQuan
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
        logger.errorSave("订单提交取票码失败，单个订单直接出票结束");

        let errInfo = submitRes?.error;
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
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { mobile } = currentParams;
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
          return await this.useCardHandle(useCardParms);
        }
      }
      if (offerRule.offer_type == "1" || is_auto_use_quan) {
        let quanValueList = offerRule.quan_value.split(",");
        this.logger.infoSave("使用优惠券出票", {
          quanValueList
        });
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
        let { quan_value, quan_cost, quan_flag, quan_fee, black_quans } =
          offerRule;
        // 根据券标识获取目标券
        let targetQuanList = quanList.filter(
          item => couponInfoSpecial(item.name) === couponInfoSpecial(quan_flag)
        );
        if (!targetQuanList?.length) {
          this.logger.infoSave("未找到券标识对应的券，准备从个人中心获取", {
            session_id: currentParams.session_id,
            quan_flag,
            black_quans
          });
          const quanListByPerCenter = await this.continuousGetQuan({
            session_id: currentParams.session_id
          });
          targetQuanList = quanListByPerCenter?.filter(
            item =>
              couponInfoSpecial(item.name) === couponInfoSpecial(quan_flag)
          );
          this.logger.infoSave("从个人中心获取到的目标券", {
            targetQuanList: JSON.parse(
              JSON.stringify(targetQuanList.slice(0, 8))
            )
          });
        }
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
          this.logger.infoSave("目标券不足", {
            targetQuanList,
            ticket_num
          });
          this.logger.warn("优惠券不够用");
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
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
            couponCode: item.couponCode,
            discountAmount: item.discountValue
          };
        });
        // 手续费
        let shouxufei = (supplier_end_price * 100) / 10000;
        if (NO_FEE_PLAT_LIST.includes(plat_name)) {
          shouxufei = 0;
        }
        let profit = supplier_end_price - quan_cost - shouxufei;
        profit = Number(profit) * Number(ticket_num);
        if (rewards > 0) {
          // 特急奖励订单中标价格 * 张数 * 0.04;
          let rewardPrice =
            (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
            10000;
          profit += rewardPrice;
        }
        if (
          !isTestOrder &&
          profit < 0 &&
          !TEST_NEW_PLAT_LIST.includes(plat_name)
        ) {
          this.logger.errorSave(
            `使用优惠券后最终利润为负${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
            {
              profit
            }
          );
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
            this.logger.errorSave(
              `使用优惠券后发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
              {
                quan_fee,
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
      this.logger.errorSave("使用会员卡或优惠券报错", { error });
      // return {}
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
        const quanStockListByPhone = item.quanStockList.filter(
          itemA => itemA.phone === mobile
        );
        item.quan_stock = item.quan_stock || 0;
        if (quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
      });
      this.logger.infoSave("根据影院获取券类型列表", { quanTypeList });
      return quanTypeList;
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
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
        this.logger.errorSave("会员卡余额不足", {
          cardList,
          member_total_price: member_total_price
        });
        return {
          card_id: "",
          profit: 0 // 利润
        };
      }
      // 手续费
      let shouxufei = (supplier_end_price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }
      // 中标价-会员成本价
      let profit = supplier_end_price - member_price - shouxufei;
      profit = Number(profit) * Number(ticket_num);
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
          10000;
        profit += rewardPrice;
      }
      if (
        !isTestOrder &&
        profit < 0 &&
        !TEST_NEW_PLAT_LIST.includes(plat_name)
      ) {
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
          profit
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
      this.logger.errorSave("会员用卡处理异常", { error });
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
      this.logger.infoSave("获取该影院已维护会员卡列表返回", { list });
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
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
      });
      // 设置指定影院的卡优先
      useCanCardList = useCanCardList.sort((a, b) => {
        if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
        if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
        return 0;
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
    cinemaLinkId,
    quanValue: quan_value,
    black_quans,
    quanNum,
    session_id,
    asyncFlag,
    plat_name,
    order_number
  }) {
    const { appFlag } = this;
    let logger = new Logger({
      logType: 3
    });
    let targetLogger = asyncFlag === 1 ? logger : this.logger;
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
      targetLogger.infoSave(`${conPrev}从服务端获取券返回`, {
        quanRes,
        quanNum,
        quan_value,
        params
      });

      let quanList = quanRes.data?.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        this.logger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        this.logger.info(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          cinemaLinkId,
          coupon_num: quan.coupon_num,
          session_id,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogger.infoSave(`${conPrev}绑定券返回`, couponNumRes);
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
      targetLogger.errorSave("从服务端获取券异常", {
        error,
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

  // 取消订单
  async cancelOrder({ cinemaLinkId, orderId, session_id }) {
    let params = {
      empCode: "",
      leaseCode: "",
      orderType: "TICKET",
      cinemaLinkId,
      orderId,
      umeToken: session_id
    };
    try {
      const res = await this.umeApi.cannelOneOrder(params);
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

  // 获取城市影院列表
  async getCityCinemaList() {
    let params = {
      empCode: "",
      leaseCode: ""
    };
    try {
      this.logger.info("获取城市影院列表参数", params);
      const res = await this.umeApi.getCinemaList(params);
      this.logger.info("获取城市影院列表返回", res);
      let list = res.bizValue?.cities || [];
      // 通过排查以往ume系列订单，发现cinemaCode和cinemaLinkId值并不一样，故此处先不赋同值
      list = list.map(item => ({
        cityName: item.cityName,
        cinemaList: item.cinemas.map(itemA => ({
          ...itemA,
          cinemaId: itemA.cinemaLinkId
        }))
      }));
      // this.logger.infoSave("获取城市影院列表返回", { list });
      return list;
    } catch (error) {
      this.logger.errorSave("获取城市影院异常", {
        error,
        params
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
      this.logger.info("获取影院放映列表参数", params);
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
      // this.logger.infoSave("获取影院放映列表返回", {
      //   fimlList
      // });
      return fimlList;
    } catch (error) {
      this.logger.errorSave("获取电影放映列表异常", {
        error
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
      this.logger.info("获取电影放映日期参数", params);
      const res = await this.umeApi.getMoviePlayDate(params);
      this.logger.info("获取电影放映日期返回", res);
      let films = res?.bizValue?.films || [];
      let filmDates = films.find(item => item.filmId === filmId)?.dates || [];
      // this.logger.infoSave("获取电影放映日期返回", { filmDates });
      return filmDates;
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", { error });
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
      this.logger.info("获取座位布局参数", params);
      const res = await this.umeApi.getMoviePlaySeat(params);
      let sections = res.bizValue?.sections?.[0] || {};
      this.logger.info("获取座位布局返回", res);
      // this.logger.infoSave("获取座位布局返回", res);
      return sections;
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", error);
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
      this.logger.infoSave("获取最优卡券列表组合参数", params);
      const res = await this.umeApi.getCardQuanList(params);
      let orderInfo = res.bizValue;
      this.logger.info("获取最优卡券列表组合返回", {
        orderInfo,
        params
      });
      return orderInfo;
    } catch (error) {
      this.logger.errorSave("获取最优卡券列表组合返回异常", { error });
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
        this.logger.infoSave("获取排序手机列表返回", { sortMobileList });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", {
        error
      });
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
      this.logger.infoSave("更新券库存前获取同类目标券返回", {
        params,
        quanTypeParams,
        targetQuanList
      });
    } catch (error) {
      this.logger.errorSave("更新券库存前获取同类目标券异常", {
        params,
        error
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
      this.logger.infoSave("单个更新券库存返回", { res, params });
    } catch (error) {
      this.logger.errorSave("单个更新券库存异常", { error, params });
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
  member_pwd,
  orderInfo
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
    if (
      formatErrInfo(error)?.includes("密码") &&
      formatErrInfo(error)?.includes("错误")
    ) {
      this.logger.infoSave("发送密码配置错误提醒");
      sendWxPusherMessage({
        orderInfo,
        msgType: 5,
        cardNoByPwdError: cardNo,
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
