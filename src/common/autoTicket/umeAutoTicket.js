import {
  getCurrentTime,
  formatTimeOfTime,
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon,
  mockDelay, // 模拟延时
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  getOfferRuleById,
  getCurrentDay,
  isDateInCurrentMonth,
  getPreviousDay,
  findMostRepeatedChars,
  couponInfoSpecial,
  subDecimal
} from "@/utils/utils";
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
      id: 7177,
      plat_name: "lieren",
      app_name: "ume",
      ticket_num: 1,
      rewards: "0",
      order_number: "2024081810003958318",
      supplier_end_price: 32.5,
      order_id: "7195870",
      tpp_price: "49.90",
      city_name: "杭州",
      cinema_addr:
        "西湖区古墩路1009号龙湖紫荆天街5楼（晚10点后观影请从紫荆花北路停车场入口对面商场3号门进入）",
      cinema_name: "UME影城(紫荆天街店)",
      hall_name: "5号激光厅--部分按摩椅",
      film_name: "名侦探柯南：百万美元的五棱星",
      lockseat: "7排1座",
      show_time: "2024-08-18 15:10:00",
      cinema_group: "ume二线"
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
    let logger;
    const { appFlag } = this;
    this.isRunning = true;
    try {
      while (this.queue.length > 0 && this.isRunning) {
        // 取出队列首部订单并从队列里去掉
        const order = this.queue.shift();
        if (order) {
          logger = new Logger({
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
                order: JSON.parse(JSON.stringify(this.order)),
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
    } catch (error) {
      logger.errorSave("订单出票异常", { error: formatErrInfo(error) });
      // 上送该订单执行过程日志
      logger.logUpload();
    }
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

  // 转单
  async transferOrder(order, unlockSeatInfo) {
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { cinemaCode, cinemaLinkId, orderHeaderId } = unlockSeatInfo;
      const session_id =
        this.currentParamsList[this.currentParamsInx].session_id;
      await this.cancelOrder({
        cinemaCode,
        cinemaLinkId,
        orderHeaderId,
        session_id
      });
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

  // 取消订单
  async cancelOrder({ cinemaCode, cinemaLinkId, orderHeaderId, session_id }) {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        orderHeaderId,
        cinemaCode,
        cinemaLinkId
      },
      ...(session_id && { session_id })
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
  // 单个订单出票
  async singleTicket(item) {
    // 放到这里即使修改token也不用重启队列了
    const { appFlag } = this;
    const { plat_name, order_number, offer_order_number } = item;
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
        order_number: plat_name != "mahua" ? order_number : offer_order_number,
        plat_name
      });
      offerRule = offerRes?.data?.offerInfo;
    } catch (error) {
      this.logger.errorSave("获取该订单报价记录异常", { error });
    }
    // 测试专用
    if (isTestOrder) {
      offerRule = { offer_type: "1", quan_value: "35" };
      // offerRule = { offer_type: "2", member_price: "29.9" };
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
    offerRule.lockseat = this.order.lockseat;
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
      cinemaCode,
      filmUniqueId,
      scheduleId,
      scheduleKey,
      seatList,
      areaInfoList,
      targeSeatList,
      showDate,
      showDateTime,
      orderCode,
      orderDate,
      orderHeaderId,
      lockOrderId,
      total_price,
      ticketDetail,
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
        let cityCinemaListRes = await getCityCinemaList({ appFlag });
        const cityCinemaList = cityCinemaListRes?.cityCinemaList || [];
        if (!cityCinemaList.length) {
          this.logger.errorSave("获取城市影院列表异常", {
            error: cityCinemaListRes?.error
          });
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
        cinemaCode = targetCinema.cinemaCode;
        if (cinemaCode) {
          if (offerRule.offer_type != 1) {
            const usableCards = await this.getUsableCardList(
              cinemaCode,
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
        const movieDataRes = await getMoviePlayInfo({
          cinemaCode,
          cinemaLinkId,
          appFlag
        });
        const movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取目标影院放映列表失败", {
            error: movieDataRes?.error
          });
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
                convertFullwidthToHalfwidth(film_name) ||
              convertFullwidthToHalfwidth(film_name).includes(
                convertFullwidthToHalfwidth(item.filmName)
              )
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
        filmUniqueId = movieInfo.filmUniqueId;
        let start_day = show_time.split(" ")[0];
        showDate = start_day;
        // 7、获取某个放映日期的场次列表
        const showListRes = await getMoviePlayTime({
          cinemaCode,
          cinemaLinkId,
          filmUniqueId,
          showDate: start_day,
          appFlag
        });
        const showList = showListRes?.moviePlayTime || [];
        // 解决同一时间多场次问题
        let targetShowList = showList.filter(
          item => +new Date(item.showDateTime) == +new Date(show_time)
        );
        targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hallName,
              hall_name,
              "hall_name"
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
          this.logger.infoSave("同一时间多场次0", {
            targetShowList
          });
        }
        if (!targetShow) {
          this.logger.warn("匹配影片放映场次失败", { showList, show_time });
          this.logger.infoSave(
            "准备根据放映日期上一天来获取放映场次列表(次日)",
            {
              showListRes,
              show_time
            }
          );
          const showListRes1 = await getMoviePlayTime({
            cinemaCode,
            cinemaLinkId,
            filmUniqueId,
            showDate: getPreviousDay(start_day),
            appFlag
          });
          const showList1 = showListRes1?.moviePlayTime || [];
          // 解决同一时间多场次问题
          let targetShowList = showList1.filter(
            item => +new Date(item.showDateTime) == +new Date(show_time)
          );
          targetShow = targetShowList[0];
          if (targetShowList.length > 1) {
            targetShowList = targetShowList.map(item => {
              const repeatedCharsResult = findMostRepeatedChars(
                item.hallName,
                hall_name,
                "hall_name"
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
            this.logger.infoSave("同一时间多场次1", { targetShowList });
          }
          if (!targetShow) {
            this.logger.warn("匹配影片放映日期失败", { showList1, show_time });
            this.logger.errorSave("匹配影片放映场次失败", {
              showListRes1,
              show_time
            });
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          }
        }
        this.logger.infoSave("出票时获取电影放映信息", {
          targetShow
        });
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
        seatList = seatListRes?.seatData || [];
        areaInfoList = seatListRes?.areaInfoList || [];
        if (!seatList?.length) {
          this.logger.errorSave("获取座位布局异常", {
            error: seatListRes?.error
          });
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
        targeSeatList = seatList.filter(item => {
          const { yCoord, rowName, columnName } = item;
          // let seat1 = yCoord + "排" + columnName + "号";
          let seat2 = rowName + "排" + columnName + "号";
          return selectSeatList.includes(seat2);
        });
        this.logger.infoSave("目标座位相关信息", {
          targeSeatList
        });
        let seat_ids = targeSeatList.map(item => item.seatCode);
        if (seat_ids?.length != ticket_num) {
          this.logger.errorSave("获取目标座位失败", {
            seatList,
            seatName
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        ticketDetail = seat_ids.map(item => ({
          seatCode: item,
          buyerRemark: ""
        }));
      } else {
        // 先用上个号的token取消订单，然后再重新出票
        const isCancel = await this.cancelOrder({
          cinemaCode,
          cinemaLinkId,
          orderHeaderId,
          session_id:
            this.currentParamsList[this.currentParamsInx - 1].session_id
        });
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
      // 锁定座位前延迟一秒
      // await mockDelay(1);
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
        appFlag,
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
            shoutu: [20, 12],
            mahua: [10, 5]
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
      orderDate = orderInfo.creationDate;
      // 这个时间戳需要和创建订单提交接口传参一致
      let timestamp = +new Date();
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
        appFlag,
        session_id: this.currentParamsList[this.currentParamsInx].session_id
      });
      if (cardQuanListRes?.error) {
        this.logger.errorSave("获取最优卡券组合失败", {
          error: cardQuanListRes?.error
        });
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      let cardList = cardQuanListRes?.cards || [];
      cardList = JSON.parse(JSON.stringify(cardList));
      if (cardList?.length && offerRule.offer_type != "1") {
        // 过滤出来维护在可用卡里面里面的卡
        if (this.usableCardList?.length) {
          cardList = cardList.filter(item =>
            this.usableCardList.some(itemA => itemA.card_num === item.cardNo)
          );
        }
      }
      let quanList = cardQuanListRes?.coupons || [];
      let activities = cardQuanListRes?.activities || [];
      this.logger.infoSave("获取最优卡券组合返回", {
        "cardList(从可用卡列表过滤后的卡:)": cardList,
        oldCardList: cardQuanListRes?.cards,
        quanList: quanList.slice(0, 10),
        activities,
        usableCardList: this.usableCardList
      });
      // [{
      //    "activityId": 23,
      //    "activityCode": "YPHD000000023",
      //    "filmActivityType": "10",
      //    "promotionMethod": "UNITY",
      //    "activityName": "【华中区】周一会员日",
      //    "amountOrSale": 610.00, // 优惠金额
      //    "partCardType": "CHOOSE"
      //  }]
      let discountAmount = activities[0]?.discountAmount || 0; // 活动日优惠金额
      // 7、使用优惠券或者会员卡
      const {
        ticketMemberPrice,
        handlingFee,
        ticketMemberServiceFeeMin,
        areaSettlePriceMin // 区域最小结算价格
      } = targetShow;
      this.logger.warn("ticketMemberPrice", {
        ticketMemberPrice,
        handlingFee,
        ticketMemberServiceFeeMin,
        discountAmount
      });
      // 原价格（座位价格）
      let originalAmount = targeSeatList.map(item => {
        let areaSettlePrice = areaInfoList.find(
          itemA => itemA.areaId === item.areaId
        )?.areaSettlePrice;
        return areaSettlePrice ? +areaSettlePrice + Number(handlingFee) : 0;
      });
      originalAmount =
        originalAmount.reduce((acc, curr) => acc + curr, 0) / 100;
      this.logger.infoSave("会员总价计算相关信息", {
        "originalAmount(座位价格)": originalAmount,
        ticket_num,
        handlingFee,
        ticketMemberPrice,
        areaInfoList,
        targeSeatList
      });
      let activityId = activities[0]?.activityId || null; // 活动id
      let {
        card_id = "",
        cardNum,
        useQuan = [],
        profit = 0,
        quanStock
      } = await this.useQuanOrCard({
        cardList,
        quanList,
        supplier_end_price,
        ticket_num,
        offerRule,
        handlingFee, // 手续费
        rewards,
        appFlag,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        cinemaCode,
        cinemaLinkId,
        plat_name
      });
      let quan_code = useQuan.map(item => item.couponCode)?.join();
      // 券抵扣金额
      let quanDiscountAmount = useQuan?.[0]?.discountAmount || 0;
      // 使用优惠券及会员卡
      if (!card_id && !useQuan?.length) {
        let { err_msg: errMsg, err_info: errInfo } =
          this.logger.getLastErrMsgAndInfo();
        let str = "无可用会员卡";
        if (offerRule.offer_type === "1") {
          str = "无可用优惠券";
        }
        if (errMsg) {
          str = str + "-" + errMsg;
        }
        this.logger.errorSave(str, {
          cardList,
          quanList: quanList.slice(0, 10),
          supplier_end_price,
          ticket_num,
          activities
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        } else {
          this.logger.infoSave("非最后一次用卡用券失败，走换号");
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams: {
              orderHeaderId,
              cinemaLinkId,
              cinemaCode,
              filmUniqueId,
              scheduleId,
              scheduleKey,
              showDate,
              showDateTime,
              ticketDetail,
              offerRule,
              targetShow,
              areaInfoList,
              targeSeatList
            }
          });
        }
      }
      // 用券时总价为0
      if (offerRule.offer_type === "1") {
        if (offerRule.quan_fee > 0) {
          total_price =
            (+areaSettlePriceMin + handlingFee - quanDiscountAmount) / 100 || 0;
          total_price = (total_price * 1000 * ticket_num) / 1000;
          this.logger.infoSave("券补钱总价计算相关信息", {
            total_price,
            quan_fee: offerRule.quan_fee,
            areaSettlePriceMin,
            handlingFee,
            quanDiscountAmount,
            ticket_num
          });
        } else {
          total_price = 0;
        }
        // yaolai绑券逻辑不一样，暂不处理
        if (offerRule.is_store == "1" && quanList.length - ticket_num < 10) {
          this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
          this.getNewQuan({
            cinemaCode,
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
      } else {
        // 座位价格-卡优惠价格
        let card_discount_price =
          cardList.find(item => item.cardNo == card_id)?.discountAmount || 0;
        card_discount_price = card_discount_price / 100;
        total_price = originalAmount - card_discount_price;
      }

      // 7、耀莱需要获取观影人列表添加观影人
      if (appFlag === "yaolai") {
        const moviegoersListRes = await findStoreMemberMoviegoersByMemberId({
          cinemaCode,
          cinemaLinkId,
          appFlag,
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        if (moviegoersListRes?.error) {
          this.logger.errorSave("获取观影人列表失败", {
            error: moviegoersListRes?.error
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
          appFlag,
          session_id: this.currentParamsList[this.currentParamsInx].session_id
        });
        if (addMoviegoersRes?.error) {
          this.logger.errorSave("添加观影人失败", {
            error: addMoviegoersRes?.error
          });
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      // 7、创建订单
      const createOrderRes = await this.createOrder({
        cinemaCode,
        cinemaLinkId,
        orderHeaderId,
        coupon: useQuan,
        quan_flag: offerRule?.quan_flag,
        card_id,
        activityId,
        total_price,
        cardList,
        timestamp
      });
      let order_num = createOrderRes?.payOrderCode;
      if (!order_num) {
        this.logger.error("创建订单失败，单个订单直接出票结束走转单逻辑");
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }

      this.logger.infoSave("创建订单成功", {
        order_num,
        profit,
        card_id,
        offerRule
      });
      if (isTestOrder) {
        this.logger.infoSave("测试单暂不购买");
        return { offerRule };
      }

      let paymentAmount = createOrderRes?.paymentAmount;
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let cardNo, paymentWay;
      // 纯用券不补钱是优惠券，只要补钱或者纯用卡就是会员卡
      if (!quan_fee && offerRule.offer_type == 1) {
        paymentWay =
          createOrderRes?.paymentList?.find(item => item.paymentWayId == 3)
            ?.paymentMethodCode || "Z0010";
      } else {
        paymentWay =
          createOrderRes?.paymentList?.find(item => item.paymentWayId == 2)
            ?.paymentMethodCode || "Z0006";
      }
      if (paymentAmount > 0 && quan_fee > 0 && offerRule.offer_type == 1) {
        // 支付方式里返回的有会员卡方式和可用列表
        let memberCardList =
          createOrderRes?.paymentList?.find(item => item.memberCardList)
            ?.memberCardList || [];
        memberCardList = memberCardList.filter(
          item => item.cardAmount >= quan_fee * 100 * ticket_num
        );
        // 取最大余额
        memberCardList = memberCardList.sort(
          (a, b) => b.cardAmount - a.cardAmount
        );
        cardNo = memberCardList[0]?.cardNo;
        if (!cardNo) {
          this.logger.errorSave(
            "创建订单时发现没有可以补券手续费的卡，走转单",
            {
              paymentList: createOrderRes?.paymentList,
              quan_fee
            }
          );
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      // 支付前校验用券价格
      if (
        offerRule.offer_type === "1" &&
        useQuan?.length &&
        paymentAmount > quan_fee_total
      ) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee,
          ticket_num
        });
        const transferParams = await this.transferOrder(item, {
          cinemaCode,
          cinemaLinkId,
          orderHeaderId
        });
        return { offerRule, transferParams };
      }
      // 支付前校验用卡价格
      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (paymentAmount > real_member_price) {
          if (subDecimal(paymentAmount, real_member_price) < profit) {
            this.logger.infoSave(
              "用完卡发现支付金额大于会员价*票数，利润需减去差值",
              {
                paymentAmount,
                real_member_price,
                profit
              }
            );
            profit = subDecimal(
              profit,
              subDecimal(paymentAmount, real_member_price)
            );
          } else {
            this.logger.errorSave("用完卡发现无利润，走转单", {
              paymentAmount,
              real_member_price,
              ticket_num
            });
            const transferParams = await this.transferOrder(item, {
              cinemaCode,
              cinemaLinkId,
              orderHeaderId
            });
            return { offerRule, transferParams };
          }
        } else if (paymentAmount < real_member_price) {
          let member_discount = offerRule?.member_discount || 100;
          profit =
            Number(profit) +
            ((real_member_price * 1000 - paymentAmount * 1000) *
              member_discount) /
              (1000 * 100);
          profit = Number(profit).toFixed(2);
        }
      }
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        cinemaCode,
        cinemaLinkId,
        card_id,
        useQuan,
        paymentWay,
        cardNo,
        orderHeaderId,
        orderCode,
        orderDate,
        appFlag,
        session_id: this.currentParamsList[this.currentParamsInx].session_id,
        orderInfo: this.order
      });
      this.logger.infoSave("订单购买返回", { buyTicketRes });
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        this.logger.error("订单购买失败，单个订单直接出票结束走转单逻辑");
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", { buyTicketRes });
        } else {
          this.logger.errorSave("订单购买异常", { error: buyTicketRes?.error });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            cinemaCode,
            cinemaLinkId,
            orderHeaderId
          });
          return { offerRule, transferParams };
        }
      }
      this.logger.infoSave("订单购买成功");
      // 此处是为了解决创建订单时card_id是cardNo，更新卡使用量是用的card_id是cardInstanceId，要和后台会员卡列表维护那的id保持一致
      if (card_id) {
        card_id =
          cardList.find(item => item.cardNo === card_id)?.cardInstanceId || "";
        // 更新卡使用量
        await updateCardDayUse({
          app_name: appFlag,
          card_id,
          plat_name,
          order_number,
          add_count: ticket_num
        });
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
        orderHeaderId,
        order_id,
        app_name: appFlag,
        card_id,
        order_number,
        supplierCode,
        plat_name,
        orderInfo: item,
        lockseat
      });
      if (lastRes?.qrcode && lastRes?.submitRes) {
        this.logger.info("订单最后处理成功:获取取票码并上传");
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
      this.logger.infoSave("获取最近用券记录入参及返回", { params, res });
      return usedQuanList;
    } catch (error) {
      this.logger.errorSave("获取最近用券记录失败", { params, error });
      return [];
    }
  }

  // 锁定座位
  async lockSeatHandle(data, inx = 1) {
    const {
      scheduleId,
      scheduleKey,
      filmUniqueId,
      showDate,
      ticketDetail,
      showDateTime,
      cinemaCode,
      cinemaLinkId,
      appFlag,
      lockseat,
      plat_name,
      order_number,
      assistFlag // 帮助锁座后重试标识
    } = data;
    const session_id = this.currentParamsList[this.currentParamsInx].session_id;
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
      },
      session_id
    };
    try {
      // 不需要每个都调下，解决锁定座位时没座位返回重进就有座位的问题
      if (inx % 2 === 1) {
        await getSeatLayout({
          cinemaCode,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          appFlag,
          session_id
        });
        await mockDelay(1);
      }

      const res = await APP_API_OBJ[appFlag].lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, {
        res,
        params
      });
      return res?.data;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      // 仅帮助锁座1次，帮助锁座后再锁定座位失败的话就不走帮助锁座逻辑了
      if (
        ["座位旁边不要留空", "座位中间不要留空"].includes(error?.msg) &&
        assistFlag != 1
      ) {
        const seatListRes = await getSeatLayout({
          cinemaCode,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          appFlag,
          session_id
        });
        let newSeatList = seatListRes?.seatData || [];
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

  // 创建订单
  async createOrder(data) {
    const { appFlag } = this;
    let {
      cinemaCode,
      cinemaLinkId,
      orderHeaderId,
      coupon,
      quan_flag,
      card_id,
      activityId,
      total_price,
      timestamp,
      isTimeoutRetry = 1 // 默认超时重试
    } = data;
    const session_id = this.currentParamsList[this.currentParamsInx].session_id;
    const mobile = this.currentParamsList[this.currentParamsInx].mobile;
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
            activityId: activityId || null,
            coupon: coupon || [],
            totalPrice: total_price
          },
          product: null,
          mainPushCard: null,
          cardId: card_id || "",
          ticketMobile: mobile,
          inviteCode: "",
          channelCode: "QD0000001",
          ...(["ume", "renhengmeng", "tpyyc"].includes(appFlag) && {
            fulfillPlace: "影院柜台",
            fulfillTime: "",
            fulfillType: ""
          }),
          ...(appFlag === "yaolai" && {
            digitalCode: "",
            isManual: "N"
          })
        },
        session_id
      };
      this.logger.infoSave("创建订单参数", { params });
      const res = await this.umeApi.createOrder(params);
      this.logger.infoSave("创建订单返回", res);
      let createOrderRes = res.data;
      return createOrderRes;
    } catch (error) {
      this.logger.errorSave("创建订单异常", {
        error
      });
      if (error?.msg?.includes("超时") && isTimeoutRetry === 1) {
        this.logger.infoSave("创建订单接口超时，延迟1秒后重试");
        await mockDelay(1);
        try {
          const createOrderRes = await this.createOrder({
            ...data,
            isTimeoutRetry: 0
          });
          if (createOrderRes) {
            this.logger.infoSave("创建订单请求接口超时，延迟2秒后重试成功", {
              createOrderRes
            });
            return createOrderRes;
          }
        } catch (error) {
          this.logger.errorSave("创建订单请求接口超时，延迟2秒后重试失败", {
            error
          });
        }
      }
      // {"error":"{\"msg\":\"券 3GUZVUJBGG 不可用\",\"count\":0,\"status\":\"E\"}"}
      // {"error":{"msg":"券 3GUZVUJBGG 不可用","count":0,"status":"E"}}
      // {"msg":"券 3D7Y3X4K,3DWY38TK 不可用","count":0,"status":"E"}
      // 券不可用，更新黑名单信息
      if (error?.msg?.includes("券") && error?.msg?.includes("不可用")) {
        let coupon = error?.msg?.split(" ")?.[1];
        const { plat_name, order_number } = this.order;
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
    }
  }

  // 获取购票信息
  async getPayResult(data) {
    let { orderHeaderId, session_id, inx = 1, logger } = data || {};
    let qrcode;
    let targetLogger = logger || this.logger;
    try {
      let params = {
        params: {
          orderType: "ticket_order",
          isDetail: "Y",
          orderHeaderId,
          keepLoading: true,
          channelCode: "QD0000001"
        },
        session_id
      };
      if (inx == 1) {
        targetLogger.infoSave("获取支付结果参数", { params });
      }
      const res = await this.umeApi.getPayResult(params);
      targetLogger.infoSave(`第${inx}次获取支付结果返回`, { res });
      let list = res.data || [];
      qrcode = list[0]?.ticketCode?.split(",").join("|") || "";
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
    }
    // 获取失败后从已完成订单里匹配获取
    try {
      const listRes = await this.umeApi.findStoreTkOrderInfoApp({
        params: {
          orderType: "ticket_order",
          isDetail: "Y",
          channelCode: "QD0000001"
        },
        pageIndex: 1,
        pageRow: 5,
        session_id
      });
      targetLogger.infoSave(`第${inx}次获取已完成订单列表返回`, {
        listRes: listRes?.data?.slice(0, 2)
      });
      let payList = listRes.data || [];
      let targetObj = payList.find(item => item.orderHeaderId == orderHeaderId);
      qrcode = targetObj?.ticketCode?.split(",").join("|");
      targetLogger.errorSave(
        `第${inx}次从已完成订单里获取取票码${qrcode ? "成功" : "失败"}`,
        {
          qrcode
        }
      );
    } catch (error) {
      targetLogger.errorSave(`第${inx}次获取已完成订单列表异常`, {
        error
      });
    }
    if (qrcode) {
      return qrcode;
    }
    return Promise.reject("获取支付结果不存在");
  }

  async lastHandle({
    orderHeaderId,
    order_id,
    app_name,
    card_id,
    order_number,
    supplierCode,
    plat_name,
    orderInfo,
    lockseat
  }) {
    try {
      let qrcode;
      const session_id =
        this.currentParamsList[this.currentParamsInx].session_id;
      try {
        // 9、获取订单结果
        qrcode = await this.getPayResult({
          orderHeaderId,
          session_id
        });
      } catch (error) {}
      if (!qrcode) {
        this.logger.errorSave(
          "获取订单支付结果，取票码不存在，暂时返回异步获取"
        );
        // 考虑耀莱延迟多暂时去掉
        // sendWxPusherMessage({
        //   plat_name,
        //   order_number,
        //   city_name: orderInfo.city_name,
        //   cinema_name: orderInfo.cinema_name,
        //   film_name: orderInfo.film_name,
        //   show_time: orderInfo?.show_time,
        //   lockseat,
        //   hall_name: orderInfo.hall_name,
        //   supplier_end_price: orderInfo.supplier_end_price,
        //   transferTip: "此处不转单，需关注该订单，适时手动上传取票码",
        //   failReason: "获取订单支付结果，取票码不存在，准备开始异步轮询获取"
        // });
        this.asyncFetchQrcodeSubmit({
          orderHeaderId,
          order_id,
          app_name,
          card_id,
          plat_name,
          order_number,
          supplierCode,
          orderInfo,
          lockseat,
          session_id
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
      this.logger.errorSave("出票最后处理发现异常", {
        error
      });
    }
  }

  // 异步轮询获取取票码并提交
  async asyncFetchQrcodeSubmit({
    orderHeaderId,
    app_name,
    plat_name,
    order_number,
    orderInfo,
    session_id
  }) {
    let logger = new Logger({ logType: 3 });
    logger.init({ plat_name, order_number, app_name });
    try {
      logger.errorSave("异步轮询获取取票码并提交方法开始执行");
      // 每搁20秒查一次，查9次，3分钟
      let qrcode = await trial(
        inx =>
          this.getPayResult({
            orderHeaderId,
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
            this.getPayResult({
              orderHeaderId,
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
    handlingFee,
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
      let useCardParms = {
        cardList,
        member_price, // 成本价
        handlingFee,
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
            this.logger.infoSave("跟据券类型和券库存进行筛选", {
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
        // 特殊处理此种券在个人中心和出票时名称不一致，出票时特殊处理下
        if (quan_value == "yaolaiguowaiquanxin") {
          quan_flag = "观影兑换券";
        }
        // 根据券标识获取目标券
        let targetQuanList = quanList.filter(
          item =>
            couponInfoSpecial(item.couponName) === couponInfoSpecial(quan_flag)
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
          (a, b) => +new Date(a.endDateTime) - new Date(b.endDateTime)
        );
        // 更新券库存
        this.updateQuanStock({
          quan_stock: targetQuanList.length,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
        if (targetQuanList.length < ticket_num) {
          this.logger.warn("优惠券不够用");
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuans: []
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map((item, index) => {
          let seatCode = Object.keys(item.discountAmountMap);
          let discountAmount = 0;
          if (seatCode) {
            discountAmount = item.discountAmountMap?.[seatCode[index]];
            if (
              discountAmount &&
              Object.prototype.toString.call(discountAmount) ===
                "[object Object]" &&
              discountAmount[1]
            ) {
              discountAmount = discountAmount[1];
            }
          }
          return {
            couponInstanceId: item.couponInstanceId,
            couponType: item.templateType,
            // 以下两个值一样
            seatCode: seatCode[index],
            salesKeySku: seatCode[index],
            couponCode: item.couponCode,
            couponName: item.couponName,
            templateCode: item.templateCode,
            discountAmount
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
            (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
            10000;
          profit += rewardPrice;
        }
        profit = Number(profit).toFixed(2);
        if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
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
            useQuans: []
          };
        }
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.cardAmount >= quan_fee * 100 * ticket_num
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
              useQuan: [],
              card_id: "",
              profit: 0 // 利润
            };
          }
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          useQuan,
          quanStock: targetQuanList.length,
          profit
        };
      }
    } catch (error) {
      this.logger.errorSave("使用会员卡或优惠券报错", {
        error
      });
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
      this.logger.infoSave("根据影院获取券类型列表返回", { quanTypeList });
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
      handlingFee,
      rewards,
      supplier_end_price,
      ticket_num,
      plat_name
    } = data;
    try {
      let str;
      if (!cardList.length) {
        str = "无可用会员卡（疑似出满）";
      }
      let cardData = cardList.filter(
        item =>
          item.cardAmount >= item.resultAmount + (handlingFee || 0) * ticket_num
        // 需大于实际价格+手续费*ticket
      );
      if (!cardList.length || !cardData?.length) {
        this.logger.errorSave(str || "会员卡余额不足", {
          cardList,
          handlingFee
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
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
          profit
        });
        return {
          profit: 0,
          card_id: ""
        };
      }
      profit = Number(profit).toFixed(2);
      // 取最大余额
      cardData = cardData.sort((a, b) => b.cardAmount - a.cardAmount);
      return {
        card_id: cardData?.[0]?.cardNo,
        cardNum: cardData?.[0]?.cardNo,
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
  async getUsableCardList(cinemaCode, ticket_num) {
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
        cardListByMobile: cardListByMobile.map(item => item.card_num)
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
        cardListLimit: cardListLimit.map(item => item.card_num)
      });
      let useCanCardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaCode);
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        useCanCardList: useCanCardList.map(item => item.card_num)
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
    cinemaCode,
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
        logger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        logger.info(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          cinemaCode,
          cinemaLinkId,
          coupon_num: quan.coupon_num,
          session_id,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogger.errorSave(`${conPrev}绑定券返回`, couponNumRes);
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
      targetLogger.errorSave("获取新券异常", {
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
      this.logger.error("根据影院获取券类型列表返回异常", error);
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
        quanTypeParams,
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
      this.logger.infoSave("单个更新券库存返回", {
        res,
        params
      });
    } catch (error) {
      this.logger.errorSave("单个更新券库存异常", { error, params });
    }
  }
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);

// 获取城市影院列表
const getCityCinemaList = async ({ appFlag }) => {
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode: "32012801",
        cinemaLinkId: "15946"
      }
    };
    console.log("获取城市影院列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCinemaList(params);
    console.log("获取城市影院列表返回", res);
    let cityCinemaList = res.data || [];
    cityCinemaList = cityCinemaList.map(item => ({
      ...item,
      cinemaCode: item.cinemaCode
    }));
    return {
      cityCinemaList
    };
  } catch (error) {
    console.error("获取城市影院异常", error);
    return {
      error
    };
  }
};

// 获取电影放映列表
const getMoviePlayInfo = async ({ cinemaCode, cinemaLinkId, appFlag }) => {
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      }
    };
    console.log("获取影院放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log("获取影院放映列表返回", res);
    // 只获取出售中的列表，即将上映暂不返回
    let movieData =
      res.data
        ?.map(item => item.fimlList)
        .flat()
        .filter(item =>
          ["SHOWING", "SOON_SHOW_TICKET"].includes(item.showStatus)
        ) || [];
    return {
      movieData
    };
  } catch (error) {
    console.error("获取电影放映列表异常", error);
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
    console.log("获取电影放映场次参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayTime(params);
    console.log("获取电影放映场次返回", res);
    return {
      moviePlayTime: res.data || []
    };
  } catch (error) {
    console.error("获取电影放映信息异常", error);
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
  appFlag,
  session_id
}) => {
  try {
    let params = {
      params: {
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001"
      },
      ...(session_id && { session_id })
    };
    console.log("获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log("获取座位布局返回", res);
    let seatData = res.data?.seatList || [];
    let areaInfoList = res.data?.areaInfoList || [];
    return {
      seatData,
      areaInfoList
    };
  } catch (error) {
    console.error("获取座位布局异常", error);
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
  appFlag,
  session_id
}) => {
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
      },
      session_id
    };
    console.log("获取最优卡券列表组合参数", params);
    const res = await APP_API_OBJ[appFlag].getCardQuanList(params);
    console.log("获取最优卡券列表组合返回", res);
    let ticketOptimalComb = res.data?.ticketOptimalComb || {};
    return {
      cards: ticketOptimalComb.cards || [],
      coupons: ticketOptimalComb.coupons || []
    };
  } catch (error) {
    console.error("获取最优卡券列表组合返回异常", error);
    return {
      error
    };
  }
};

// 获取观影人列表
const findStoreMemberMoviegoersByMemberId = async ({
  cinemaCode,
  cinemaLinkId,
  appFlag,
  session_id
}) => {
  try {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      },
      session_id
    };
    console.log("获取观影人列表参数", params);
    const res =
      await APP_API_OBJ[appFlag].findStoreMemberMoviegoersByMemberId(params);
    console.log("获取观影人列表返回", res);
    let moviegoersList = res.data || [];
    return {
      moviegoersList
    };
  } catch (error) {
    console.error("获取观影人列表异常", error);
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
  appFlag,
  session_id
}) => {
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
      },
      session_id
    };
    console.log("添加观影人参数", params);
    const res = await APP_API_OBJ[appFlag].updateStoreOrderMoviegoers(params);
    console.log("添加观影人返回", res);
  } catch (error) {
    console.error("添加观影人异常", error);
    return {
      error
    };
  }
};

// 订单购买
const buyTicket = async ({
  cinemaCode,
  cinemaLinkId,
  orderCode,
  orderDate,
  card_id,
  useQuan,
  paymentWay,
  cardNo,
  orderHeaderId,
  appFlag,
  session_id,
  orderInfo
}) => {
  let params = {
    params: {
      paymentWay,
      orderHeaderId: "" + orderHeaderId,
      cardNo: card_id || cardNo || "",
      isMultiplePay: "",
      channelCode: "QD0000001",
      sysSourceCode: "YZ001",
      cinemaCode,
      cinemaLinkId
    },
    session_id
  };
  try {
    console.log("订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log("订单购买返回", buyRes);
    let zoneRes, tsgRes;
    if (useQuan?.length) {
      zoneRes = await APP_API_OBJ[appFlag].findZoneByChannel({
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          zoneSource: "20",
          cinemaCode,
          cinemaLinkId
        },
        session_id
      });
      console.warn("获取优惠活动返回结果", zoneRes);
      tsgRes = await APP_API_OBJ[appFlag].findTsgGift({
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId,
          orderHeaderId,
          orderDate,
          orderCode
        },
        session_id
        // {
        //   "orderHeaderId": 47560,
        //   "orderCode":"LD24082200002000063",
        //   "sysSourceCode":"YZ001",
        //   "cinemaCode":"44010031",
        //   "cinemaLinkId":"16226",
        //   "orderDate":"2024-08-22 12:25:14",
        //   "channelCode":"QD0000001",
        // }
      });
      console.warn("获取其它活动返回结果", tsgRes);
    }
    return {
      params,
      buyRes,
      zoneRes,
      tsgRes
    };
  } catch (error) {
    console.error("订单购买异常", error);
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
const bandQuan = async ({
  cinemaCode,
  cinemaLinkId,
  coupon_num,
  session_id,
  appFlag
}) => {
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    params: {
      couponCode: coupon_num,
      cinemaCode,
      cinemaLinkId,
      sysSourceCode: "YZ001",
      channelCode: "QD0000001"
    },
    session_id
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
      plat_order_sn: order.plat_order_sn,
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
      lockseat: order.lockseat || res?.offerRule?.lockseat,
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
  order_number,
  add_count
}) => {
  let logger = new Logger({ logType: 3 });
  try {
    const res = await svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id,
      add_count,
      plat_name
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
