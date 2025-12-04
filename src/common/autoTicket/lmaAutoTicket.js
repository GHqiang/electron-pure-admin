import {
  getCurrentTime,
  formatTimeOfTime,
  convertFullwidthToHalfwidth,
  getTargetCinemaCommon, // 根据影院名称获取影院id
  mockDelay, // 模拟延时
  trial, // 试错重试
  formatErrInfo, // 格式化错误信息
  getCinemaLoginInfoList,
  sendWxPusherMessage,
  formatTimeStrByLma,
  findMostRepeatedChars,
  couponInfoSpecial,
  subDecimal,
  getCurrentDay,
  isDateInCurrentMonth,
  isNextDay,
  getPreviousDay
} from "@/utils/utils";
import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
// 平台管理类
import PlatManage from "@/common/autoTicket/buyTicket/platManage";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
// 影院特殊匹配列表及api
import { GET_APP_TYPE_LIST, NO_FEE_PLAT_LIST } from "@/common/constant";
import { APP_API_OBJ } from "@/common/index";

let isTestOrder = false; //是否是测试订单
// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor(appFlag) {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.appFlag = appFlag; // 影线标识
    this.sfcApi = APP_API_OBJ[appFlag];
    this.currentParamsInx = 0;
    this.currentParamsList = [];
    this.prevOrderNumber = ""; // 上个订单号
    this.eventName = `newOrder_${appFlag}`;
    this.handledOrders = new Map(); // 用于存储已处理订单号及其相关信息
    this.isStart = false; // 是否启动
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
      app_name: "lma",
      ticket_num: 1,
      rewards: "0",
      offer_type: "1",
      order_number: "2024071012402352191",
      supplier_end_price: 36,
      // quan_value: "35",
      member_price: 34.2, // 成本价
      real_member_price: 100, // 真实会员价
      order_id: "6418878",
      tpp_price: "44.00",
      city_name: "南京",
      cinema_addr: "鄞州区中山东路1083号世纪东方广场三楼",
      cinema_name: "卢米埃南京龙蟠汇IMAX影城",
      hall_name: "7号厅（3小时停车券21点前扫码）",
      film_name: "浴火之路",
      lockseat: "7排1座",
      show_time: "2024-10-21 15:20:00",
      cinema_group: "卢米埃"
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
              order: JSON.parse(JSON.stringify(this.order)),
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
                    user_id: tokens.userInfo.user_id
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
                    user_id: tokens.userInfo.user_id
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

  // 转单
  async transferOrder(order, unlockSeatInfo) {
    const { appFlag } = this;
    this.logger.infoSave("开始准备转单", unlockSeatInfo);
    if (unlockSeatInfo) {
      const { order_str } = unlockSeatInfo;
      let lmaToken = this.currentParamsList[this.currentParamsInx].lmaToken;
      if (order_str) {
        await cancelOrder({
          order_str,
          appFlag,
          lmaToken,
          logger: this.logger,
          order: this.order
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
    const { plat_name, order_number, offer_order_number } = item;
    this.logger.warn("单个待出票订单信息", item);
    let targetLoginList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );

    this.currentParamsList = targetLoginList
      .sort((a, b) => {
        // 优先按 first 字段排序
        if (a.first === "1" && b.first !== "1") return -1;
        if (a.first !== "1" && b.first === "1") return 1;

        // 如果 first 都是 '1' 或者都不是 '1'，则按 mobile 字段排序
        if (a.first === "1" && b.first === "1") {
          // 如果 a.mobile 是当前用户的手机号，则 a 应该排在 b 之前
          if (a.mobile === tokens.userInfo.phone) return -1;
          // 如果 b.mobile 是当前用户的手机号，则 b 应该排在 a 之前
          if (b.mobile === tokens.userInfo.phone) return 1;
          // 如果两个对象的 mobile 都不是当前用户的手机号，则按默认顺序排列
          return 0;
        }

        // 如果 first 都不是 '1'，则按 mobile 字段排序
        if (a.mobile === tokens.userInfo.phone) return -1;
        if (b.mobile === tokens.userInfo.phone) return 1;

        // 如果两个对象的 first 和 mobile 都相同，则按默认顺序排列
        return 0;
      })
      .map(item => ({ ...item, lmaToken: item.session_id }));
    this.logger.infoSave("获取该影院登录信息返回", {
      targetLoginList,
      currentParamsList: this.currentParamsList
    });
    this.currentParamsInx = 0;
    let offerRule;
    try {
      // 1、获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferInfo({
        user_id: tokens.userInfo.user_id,
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
      // offerRule = { offer_type: "1", quan_value: "35" };
      offerRule = {
        offer_type: "2",
        member_price: "29.9", // 成本价
        real_member_price: 100 // 真实会员价
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
    this.logger.warn("单个待出票订单信息", item);
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
    // 如果待出票订单里没有就去报价记录里拿
    if (!rewards || Number(rewards) == 0) {
      rewards = offerRule?.rewards || 0;
    }
    try {
      this.logger.info("一键买票待下单信息", item);
      if (this.currentParamsInx === 0) {
        // 3、获取城市影城列表
        const cinemaListRes = await getCityCinemaList({ appFlag });
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
        cinema_id = cinemaIdRes?.cinema_id;
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
        city_id = cinemaIdRes?.city_id;
        // 5、获取目标影院放映列表
        const movieDataRes = await getMoviePlayInfo({
          cinema_id,
          appFlag
        });
        let movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取影院放映列表异常", {
            error: movieDataRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let movieInfo = movie_data.find(item => item.movie_name === film_name);
        if (!movieInfo) {
          this.logger.warn("影院放映信息匹配订单影片名称失败", {
            movie_data,
            film_name
          });
          movieInfo = movie_data.find(
            item =>
              convertFullwidthToHalfwidth(item.title) ===
                convertFullwidthToHalfwidth(film_name) ||
              convertFullwidthToHalfwidth(film_name).includes(
                convertFullwidthToHalfwidth(item.title)
              )
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
        short_code = movieInfo?.short_code;
        // 6、获取放映日期
        let playDateListRes = await getMoviePlayDate({
          cinema_id,
          short_code,
          appFlag
        });
        let playDateList = playDateListRes?.playDate || [];
        if (!playDateList?.length) {
          this.logger.errorSave("获取影院放映日期异常", {
            error: playDateListRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        start_day = show_time.split(" ")[0];
        start_time = show_time.split(" ")[1].slice(0, 5);
        // 是否是次日，如果是，showDay需要向前进一
        if (isNextDay(start_day, start_time, "lma")) {
          start_day = getPreviousDay(start_day);
        }
        console.log("movieInfo===>", movieInfo, start_day, start_time);
        let targetDate = playDateList?.find(
          item => formatTimeStrByLma(item.date) === start_day
        );
        if (!targetDate) {
          this.logger.errorSave("匹配影片放映日期失败", {
            playDateList,
            start_day
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        let showList = targetDate?.session || [];
        console.log("showList===>", showList);
        // 解决同一时间多场次问题
        let targetShowList = showList.filter(
          item => item.start_time === start_time
        );
        let targetShow = targetShowList[0];
        if (targetShowList.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.screen_name,
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
        // 按照券库存进行登录信息排序
        if (offerRule.offer_type == 1) {
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
        const phone = this.currentParamsList[0].mobile;
        this.logger.infoSave(`首次出票手机号-${phone}`, {
          currentParamsList: this.currentParamsList
        });
        this.curPhone = phone;
        this.logger.infoSave("出票时获取电影放映信息", { targetShow });
        show_id = targetShow.session_id;
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
          this.logger.errorSave("获取座位布局异常", {
            error: seatDataRes?.error
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
        // 创建订单时的影片编码要用获取座位布局接口返回的
        short_code = seatDataRes.short_code;
        let seatName = lockseat
          .replaceAll(" ", ",")
          .replaceAll("座", "号")
          .replaceAll("列", "号");
        console.log("seatName", seatName);
        let selectSeatList = seatName.split(",");
        console.log("selectSeatList", selectSeatList);
        let label_arr = seatDataRes?.label_arr || [];
        let targetSeatList = seatList.filter(item =>
          selectSeatList.includes(item.seat_info)
        );
        this.logger.infoSave("目标座位相关信息", {
          targetSeatList,
          label_arr
        });
        seat_arr = targetSeatList.map(item => {
          // 去除自填充值
          const { seat_info, ...otherInfo } = item;
          return {
            ...otherInfo,
            price: label_arr.find(
              item => item.price_type === otherInfo.price_type
            )?.price,
            fixIcon: "/images/weixiu.png"
          };
        });
        console.log("seat_arr", seat_arr);
        if (seat_arr?.length != ticket_num) {
          this.logger.errorSave("获取目标座位失败", {
            seatList,
            seatName,
            seat_arr,
            ticket_num
          });
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
      } else {
        const phone = this.currentParamsList[this.currentParamsInx].mobile;
        this.logger.infoSave(
          `第${this.currentParamsInx}次换号出票手机号-${phone}`,
          {
            currentParamsInx: this.currentParamsInx,
            currentParamsList: this.currentParamsList
          }
        );
        this.curPhone = phone;
      }
      let card_id, cardNum;
      let card_balance;
      // 如果需要用卡，锁座前就得准备好卡,计算好余额切换好卡
      if (
        offerRule.offer_type != "1" ||
        (offerRule.offer_type == "1" && offerRule.quan_fee)
      ) {
        const useCardRes = await this.useCardHandle({
          city_id,
          cinema_id,
          offerRule,
          ticket_num,
          supplier_end_price
        });
        if (!useCardRes?.card_id) {
          if (this.currentParamsInx === this.currentParamsList.length - 1) {
            console.error("锁定座位前用卡异常", "走转单逻辑");
            const transferParams = await this.transferOrder(item);
            return { transferParams };
          } else {
            let otherParams = {
              offerRule,
              city_id,
              cinema_id,
              show_id,
              seat_arr,
              start_day,
              start_time,
              short_code
            };
            this.logger.infoSave("锁定座位前用卡异常，走换号", {
              otherParams
            });
            this.currentParamsInx++;
            return await this.oneClickBuyTicket({
              ...item,
              otherParams
            });
          }
        }
        card_id = useCardRes.card_id;
        cardNum = useCardRes.card_id;
        card_balance = useCardRes.card_balance;
        console.log("card_balance", card_balance);
        this.logger.infoSave("锁座前用卡成功", useCardRes);
      }
      // 卢米埃需要锁座前用券，一旦锁座就相当于创建订单不可切换券了
      const useQuanRes = await this.useQuanHandle({
        city_id,
        cinema_id,
        ticket_num,
        offerRule,
        show_id,
        seat_arr,
        supplier_end_price,
        rewards,
        plat_name,
        order_number
      });
      if (useQuanRes?.error) {
        this.logger.errorSave("锁定座位前用券异常", {
          error: useQuanRes?.error
        });
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error("锁定座位前用券异常", "走转单逻辑");
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        } else {
          let otherParams = {
            offerRule,
            city_id,
            cinema_id,
            show_id,
            seat_arr,
            start_day,
            start_time,
            short_code
          };
          this.logger.infoSave("锁定座位前用券异常，走换号", {
            otherParams
          });
          this.currentParamsInx++;
          return await this.oneClickBuyTicket({
            ...item,
            otherParams
          });
        }
      }
      let { quan_code, quanStock } = useQuanRes || {};
      // 4、锁定座位/创建订单
      let params = {
        cinema_id,
        short_code,
        show_id,
        seat_arr,
        quan_code,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken
      };
      let lockRes;
      try {
        lockRes = await this.lockSeatHandle(params); // 锁定座位
      } catch (error) {
        console.error("锁定座位失败准备试错2次，间隔5秒", error);
        // 试错3次，间隔5秒
        // 锁定座位尝试配置
        // let delayConfig = {
        //   lieren: [6, 5],
        //   mangguo: [6, 5],
        //   sheng: [6, 5],
        //   mayi: [12, 10],
        //   yangcong: [12, 10],
        //   haha: [6, 5],
        //   yinghuasuan: [6, 5],
        //   shangzhan: [6, 5]
        // };
        // lockRes = await trial(
        //   inx => this.lockSeatHandle(params, inx),
        //   delayConfig[plat_name][0],
        //   delayConfig[plat_name][1],
        //   ''
        // );
        if (formatErrInfo(error)?.includes("超过会员购票限制")) {
          // 更新月使用量限制
          await this.updateMonthlyLimit(item, card_id);
          sendWxPusherMessage({
            orderInfo: this.order,
            msgType: 6,
            cardNoByPwdError: card_id,
            failReason:
              "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量"
          });
        }
        if (!lockRes) {
          this.logger.infoSave("锁定座位失败走转单");
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
        this.logger.infoSave("锁定座位即创建订单成功");
      }
      order_str = lockRes?.data?.order_str;
      console.warn("order_str", order_str);
      if (!card_id && !quan_code) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            "优惠券和会员卡都无法使用，单个订单直接出票结束",
            "走转单逻辑"
          );
          this.logger.errorSave("优惠券和会员卡都无法使用");
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
              seat_arr,
              start_day,
              start_time,
              short_code
            }
          });
        }
      }
      this.logger.infoSave("使用优惠券或者会员卡成功");
      // 6计算订单价格
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { lmaToken } = currentParams;
      const priceRes = await priceCalculation({
        lmaToken,
        appFlag,
        order_str
      });
      let priceInfo = priceRes?.price;
      if (priceRes?.error) {
        this.logger.errorSave(
          "使用优惠券或会员卡后计算订单价格异常：" + priceRes?.errMsg,
          {
            error: priceRes?.error
          }
        );
      }
      if (!priceInfo) {
        if (this.currentParamsInx === this.currentParamsList.length - 1) {
          console.error(
            "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
            "走转单逻辑"
          );
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            order_str
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
              seat_arr,
              start_day,
              start_time,
              short_code
            }
          });
        }
      }
      this.logger.infoSave("计算订单价格返回", {
        priceRes
      });
      let paymentAmount = Number(priceInfo.price_str?.replace("￥", "") || 0); // 此处是为了将订单价格30.00转为30，将0.00转为0
      console.log("订单最后价格", paymentAmount, priceInfo);
      let quan_fee = offerRule.quan_fee || 0;
      quan_fee = Number(quan_fee);
      let quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000;
      if (offerRule.offer_type === "1" && paymentAmount > quan_fee_total) {
        this.logger.errorSave("用完券发现支付金额大于券手续费*票数，走转单", {
          paymentAmount,
          quan_fee_total,
          ticket_num,
          quan_fee
        });
        const transferParams = await this.transferOrder(item, {
          order_str
        });
        return { offerRule, transferParams };
      }
      // 手续费
      let shouxufei = (supplier_end_price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }
      // 计算利润(奖励未加)
      let profit;
      // 中标价-会员成本价
      if (offerRule.offer_type !== "1") {
        profit = supplier_end_price - offerRule?.member_price - shouxufei;
        profit = Number(profit) * Number(ticket_num);
      } else {
        profit = Number(supplier_end_price) - offerRule.quan_cost - shouxufei;
        profit = (profit * 100 * ticket_num) / 100;
      }
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
          10000;
        profit += rewardPrice;
      }
      profit = profit.toFixed(2);

      let real_member_price = offerRule?.real_member_price || 0;
      if (offerRule.offer_type !== "1" && card_id) {
        real_member_price = (real_member_price * 10000 * ticket_num) / 10000;
        if (paymentAmount > real_member_price) {
          this.logger.infoSave(
            "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量",
            {
              paymentAmount,
              real_member_price,
              ticket_num
            }
          );
          sendWxPusherMessage({
            orderInfo: this.order,
            msgType: 6,
            cardNoByPwdError: card_id,
            failReason:
              "发现支付价格大于会员价*票数，疑似卡出满，请检查维护月使用量"
          });
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
              order_str
            });
            return { offerRule, transferParams };
          }
        } else if (paymentAmount < real_member_price) {
          // let member_discount = offerRule?.member_discount || 100;
          // profit =
          //   Number(profit) +
          //   ((real_member_price * 1000 - pay_money * 1000) * member_discount) /
          //     (1000 * 100);
          // profit = Number(profit).toFixed(2);
        }
      }
      this.logger.infoSave("订单支付前计算订单价格成功");

      let order_num = order_str;
      if (isTestOrder) {
        return { offerRule };
      }
      // 8、购买电影票
      const buyTicketRes = await buyTicket({
        order_num,
        lmaToken: this.currentParamsList[this.currentParamsInx].lmaToken,
        appFlag
      });
      this.logger.infoSave("订单购买返回", buyTicketRes);
      const buyRes = buyTicketRes?.buyRes;
      if (!buyRes) {
        console.error("订单购买失败，单个订单直接出票结束", "走转单逻辑");
        if (JSON.stringify(buyTicketRes?.error)?.indexOf("timeout") != -1) {
          this.logger.infoSave("订单购买返回超时当成功处理", buyTicketRes);
        } else {
          this.logger.errorSave("订单购买异常", {
            error: buyTicketRes?.error
          });
          // 后续要记录失败列表（订单信息、失败原因、时间戳）
          const transferParams = await this.transferOrder(item, {
            order_str
          });
          return { offerRule, transferParams };
        }
      }
      this.logger.infoSave("订单购买成功");
      await updateCardDayUse({
        app_name: appFlag,
        card_id,
        plat_name,
        order_number,
        add_count: ticket_num
      });
      // 更新非入库券的券库存
      if (offerRule.offer_type === "1" && quan_code) {
        this.updateQuanStock({
          quan_stock: quanStock - ticket_num,
          quan_flag: offerRule.quan_flag,
          quan_value: offerRule.quan_value,
          app_name: appFlag,
          phone: this.curPhone,
          isPay: 1
        });
      }
      // 更新卡余额
      this.updateCardBalance({
        card_id,
        card_balance: card_balance?.replace("￥", "") || 0,
        paymentAmount
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
        this.logger.infoSave("订单最后处理成功:获取取票码并上传");
      }
      console.log("一键买票完成");
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

  // 更新卡余额
  async updateCardBalance(data) {
    const { card_id, card_balance, paymentAmount } = data;
    const params = {
      card_id,
      app_name: "lma",
      balance: "" + (card_balance - paymentAmount)
    };
    try {
      if (card_id && card_balance && paymentAmount) {
        const res = await svApi.updateCardBalance(params);
        this.logger.infoSave("更新卡余额返回", {
          res,
          params
        });
      }
    } catch (error) {
      this.logger.infoSave("更新卡余额异常", {
        error,
        params
      });
    }
  }
  // 用卡处理，只能锁座前用卡
  async useCardHandle(params) {
    const { appFlag } = this;
    // 需要查询当前卡的月出票数和天出票数，单卡一月20，一天8张，
    try {
      let { city_id, cinema_id, ticket_num, supplier_end_price, offerRule } =
        params;
      const { real_member_price, quan_fee, offer_type } = offerRule;
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { lmaToken } = currentParams;
      // 拿订单号去匹配报价记录
      console.log("使用会员卡出票");
      console.log("报价记录里的会员价", real_member_price);
      if (!real_member_price && offer_type != "1") {
        this.logger.errorSave("使用优惠券或者会员卡前获取会员价异常");
        return {
          card_id: ""
        };
      }
      // 1、获取会员卡列表
      const cardListRes = await getCardList({
        city_id,
        cinema_id,
        lmaToken,
        appFlag
      });
      let cardList = cardListRes?.cardList || [];
      if (!cardList?.length) {
        this.logger.errorSave("获取会员卡列表异常", cardListRes);
        return {
          card_id: ""
        };
      }
      let activeCard = cardList[0]; //第一个为活跃卡
      // 获取影院维护的可用卡列表
      const usableCardList = await this.getUsableCardList(
        cinema_id,
        ticket_num
      );
      if (usableCardList?.length) {
        cardList = cardList.filter(item =>
          usableCardList.some(itemA => itemA.card_num === item.card_number)
        );
      } else {
        this.logger.errorSave("可用卡过滤后无可用卡");
        return {
          card_id: ""
        };
      }
      // 判断活跃卡出票量是否达标
      if (
        !cardList.find(item => item.card_number === activeCard?.card_number)
      ) {
        this.logger.infoSave("当前活跃卡出票量已达标", {
          activeCard
        });
        activeCard = null;
      }
      // 非活跃卡列表
      let otherCardList = cardList.filter(
        item => item.card_number !== activeCard?.card_number
      );
      // 2、使用会员卡
      let member_total_price = (real_member_price * 100 * ticket_num) / 100;
      if (quan_fee && offerRule.offer_type === "1") {
        member_total_price = (quan_fee || 0) * ticket_num;
      }
      const { card_id, card_balance } = await this.useCard({
        member_total_price,
        activeCard,
        otherCardList,
        supplier_end_price,
        ticket_num,
        lmaToken
      });
      return {
        card_id,
        card_balance
      };
    } catch (error) {
      this.logger.errorSave("用卡处理异常", { error: formatErrInfo(error) });
      return {
        card_id: ""
      };
    }
  }

  // 查询最近用券记录返回
  async queryUsedQuanList({ app_name }) {
    const params = {
      order_status: "1",
      app_name,
      rule: tokens.userInfo.rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      const res = await svApi.queryUsedQuanList(params);
      let usedQuanList = res.data?.usedQuanList || [];
      // 过滤出来确定用券的，因为卡也用券
      usedQuanList = usedQuanList.filter(item => item.quan_code);
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
    let { cinema_id, show_id, short_code, seat_arr, lmaToken, quan_code } =
      data || {};
    try {
      let params = {
        cinema_id: cinema_id,
        session_id: show_id,
        short_code,
        voucher_arr: quan_code || JSON.stringify([]),
        seat_arr: JSON.stringify(seat_arr),
        lmaToken
      };
      this.logger.infoSave(`第${inx}次锁定座位参数`, {
        params
      });
      const res = await this.sfcApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, {
        res
      });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位失败`, {
        error
      });
      return Promise.reject(error);
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

  // 使用优惠券
  async useQuanHandle(params) {
    const { appFlag } = this;
    let { ticket_num, offerRule, plat_name, order_number } = params;
    try {
      let { offer_type, quan_value, real_member_price } = offerRule;
      let currentParams = this.currentParamsList[this.currentParamsInx];
      const { lmaToken, mobile } = currentParams;
      // 拿订单号去匹配报价记录
      if (offer_type !== "1") {
        let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
        let lmaIsUseQuan = lmaIsUseQuanValue == 1 && real_member_price >= 33;
        if (!lmaIsUseQuan) return;
        // 只判断价格是否大于33，如果大于就用券
        quan_value = "lma-5";
      }

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
      const { quan_cost, quan_flag, quan_fee, is_store, black_quans } =
        quanInfo || {};
      offerRule.quan_cost = quan_cost;
      offerRule.quan_flag = quan_flag;
      offerRule.quan_fee = quan_fee;
      offerRule.is_store = is_store;
      offerRule.black_quans = black_quans;
      // 查询最近用券记录
      const usedQuanList = await this.queryUsedQuanList({
        app_name: appFlag
      });
      this.logger.infoSave("查询最近用券记录返回", {
        usedQuanList
      });
      // 连续获取目标券
      const quanListRes = await continuousGetQuan({
        lmaToken,
        appFlag,
        quan_flag,
        black_quans,
        usedQuanList,
        logger: this.logger
      });
      this.logger.infoSave("连续获取优惠券列表返回", quanListRes);
      let quanList = quanListRes?.quanList || [];
      let quanStock = quanList?.length || 0; // 券库存数
      if (quanListRes?.error) {
        this.logger.errorSave("获取优惠券列表异常", {
          error: quanListRes?.error
        });
        return { error: "获取优惠券列表异常" };
      }
      // 优先使用快过期的券
      let targetQuanList =
        quanList
          .sort((a, b) => +new Date(a.endDateTime) - new Date(b.endDateTime))
          .map(item => ({ code: item.code })) || [];
      let isGetNewQuan = false;
      if (is_store == "1") {
        if (targetQuanList.length < ticket_num) {
          let diffNum = Number(ticket_num) - targetQuanList.length;
          isGetNewQuan = true;
          this.logger.infoSave("用券前个人中心目标券不够，从服务端获取");
          let newQuanList = await this.getNewQuan({
            quan_value,
            lmaToken,
            black_quans,
            diffNum,
            quanNum: diffNum + 5
          });
          // 多查询几张绑定防止有绑券异常导致出票失败情况
          if (newQuanList?.length) {
            // 转换为相同格式
            newQuanList = newQuanList.map(item => ({
              code: item.coupon_num
            }));
            targetQuanList = [
              ...targetQuanList,
              ...newQuanList.slice(0, diffNum)
            ];
            quanStock = targetQuanList.length;
            this.logger.infoSave("从服务端获取券绑定完成", {
              newQuanList,
              targetQuanList,
              ticket_num
            });
          }
        }
        // 更新本地已绑定的券库存
        this.updateQuanStock({
          quan_stock: quanStock, // 直接传过去券库存
          quan_value: offerRule.quan_value,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
      }
      if (targetQuanList?.length < ticket_num) {
        let quanDiffMsg = isGetNewQuan
          ? "目标券从数据库获取后仍不足"
          : "目标券不足";
        this.logger.errorSave(quanDiffMsg, { targetQuanList });
        return { error: quanDiffMsg };
      }
      if (targetQuanList?.length - ticket_num < 10 && is_store == "1") {
        this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
        this.getNewQuan({
          quan_value,
          quan_flag,
          ticket_num,
          lmaToken,
          black_quans,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1,
          plat_name,
          order_number
        });
      }
      targetQuanList = targetQuanList.slice(0, ticket_num);
      return {
        quan_code: targetQuanList?.length ? JSON.stringify(targetQuanList) : "",
        quanStock
      };
    } catch (error) {
      this.logger.errorSave("使用优惠券或者会员卡异常", { error });
      return {
        card_id: "",
        quan_code: "",
        profit: 0 // 利润
      };
    }
  }

  // 获取购票信息
  async payOrder(data) {
    let { order_num, lmaToken, logger, inx = 1 } = data || {};
    try {
      let params = {
        order_str: order_num, // 订单号
        lmaToken
      };
      if (inx == 1) {
        logger.infoSave("获取支付结果传参", {
          params
        });
      }
      const res = await this.sfcApi.payOrder(params);
      logger.infoSave(`第${inx}次获取支付结果返回`, {
        res
      });
      let qrcode = res.data?.booking_id || "";
      if (qrcode) {
        return qrcode;
      }
      return Promise.reject("获取支付结果不存在");
    } catch (error) {
      logger.errorSave(`第${inx}次获取订单支付结果异常`, { error });
      return Promise.reject(error);
    }
  }

  // 超出更新月出票量限制
  async updateMonthlyLimit(order, card_id) {
    try {
      const { app_name, plat_name, order_number, ticket_num } = order;
      const res = await svApi.queryCardList({
        app_name: app_name,
        rule: tokens.userInfo.rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
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
      const teagerCard = list.find(item => item.card_id === card_id);
      if (teagerCard) {
        this.logger.infoSave("超出时更新卡使用量目标卡信息", teagerCard);
        const min_usage = (teagerCard.use_limit_month || 20) - ticket_num;
        const max_num = Math.max(min_usage, teagerCard.month_usage || 0);
        let add_count = max_num - (teagerCard.month_usage || 0) + 1;
        this.logger.infoSave("超出时更新卡使用量", { add_count });
        if (add_count > 0) {
          await updateCardDayUse({
            app_name,
            card_id,
            plat_name,
            order_number,
            add_count: ticket_num,
            month_usage_update: (teagerCard.month_usage || 0) + add_count // 月量更新值
          });
        }
      } else {
        this.logger.infoSave("超出更新卡使用量时未查到目标卡", { card_id });
      }
    } catch (error) {
      this.logger.errorSave("超出更新卡使用量异常", {
        error: formatErrInfo(error)
      });
    }
  }

  async lastHandle({
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
    try {
      let qrcode;
      try {
        // 9、获取订单结果
        qrcode = await this.payOrder({
          order_num,
          lmaToken,
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
    order_num,
    lmaToken,
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
            order_num,
            lmaToken,
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
              order_num,
              lmaToken,
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

  // 获取影院指定会员卡
  async getUsableCardList(cinema_id, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: tokens.userInfo.rule,
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
      this.logger.infoSave("获取会员卡维护列表返回", { list });

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
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
      });
      // 设置指定影院的卡优先
      useCanCardList = useCanCardList.sort((a, b) => {
        if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
        if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
        return 0;
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        useCanCardList: useCanCardList.map(item => item.card_num)
      });
      return useCanCardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", { error });
    }
  }

  // 获取新券
  async getNewQuan({
    quan_value,
    quan_flag,
    ticket_num,
    quanNum, // 同步绑券diffNum+5或者是异步绑券券数
    diffNum = 0, // 距离出票差的券数
    lmaToken,
    asyncFlag,
    black_quans,
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
        diffNum,
        quan_value,
        params
      });

      let quanList = quanRes?.data?.quanList || [];
      if (asyncFlag != 1 && (!quanList?.length || quanList?.length < diffNum)) {
        console.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await bandQuan({
          lmaToken,
          coupon_num: quan.coupon_num,
          appFlag
        });
        targetLogger.infoSave(`绑定券返回`, couponNumRes);
        const coupon_num = couponNumRes?.coupon_num;
        if (couponNumRes?.errMsg) {
          targetLogger.errorSave(`${conPrev}绑定券异常`, couponNumRes);
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
      return bandQuanList;
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
      this.logger.infoSave("单个更新券库存返回", {
        res,
        params
      });
    } catch (error) {
      this.logger.errorSave("单个更新券库存异常", { error, params });
    }
  }

  // 使用会员卡
  async useCard({ member_total_price, activeCard, otherCardList, lmaToken }) {
    const { appFlag } = this;
    try {
      if (activeCard) {
        if (activeCard.money_str < Number(member_total_price)) {
          this.logger.infoSave("当前活跃卡余额不足,准备换卡", {
            activeCard,
            otherCardList,
            member_total_price
          });
        } else {
          this.logger.infoSave("当前活跃卡余额足够", activeCard);
          return {
            card_id: activeCard.card_number,
            card_balance: activeCard.money_str
          };
        }
      }
      let card_id, card_balance;
      // 开始尝试使用卡并获取成功使用的卡的结果
      const attemptCardsSequentially = async () => {
        for (const card of otherCardList) {
          this.logger.infoSave(`正在尝试使用卡 ${card.card_number}`);
          const changeCardRes = await changeCardHandle({
            card_number: card.card_number,
            lmaToken,
            appFlag
          });
          if (changeCardRes?.error) {
            this.logger.errorSave("尝试换卡时异常", {
              error: changeCardRes?.error
            });
            continue;
          }
          const { money_str } = changeCardRes?.data || {};
          if (money_str < Number(member_total_price)) {
            let str = "换卡后卡余额不足,准备继续换卡";
            this.logger.infoSave(str, {
              changeCardRes
            });
            continue;
          } else {
            this.logger.infoSave("换卡成功", {
              card_number: card.card_number,
              money_str
            });
            card_id = card.card_number;
            card_balance = money_str;
            console.log("卡使用成功，返回结果并停止尝试。");
            break;
          }
        }
        if (!card_id) {
          this.logger.errorSave("所有会员卡尝试均失败");
        }
      };
      // 3、进行其它卡余额尝试
      await attemptCardsSequentially();
      if (!card_id) {
        console.error("所有卡均尝试失败");
        return {
          card_id: ""
        };
      }
      // 由于锁座前用卡不产生订单无法计算价格，故不计算利润，后面判断
      return {
        card_id,
        card_balance
      };
    } catch (error) {
      // 此处异常一定是代码异常无需考虑重试
      this.logger.errorSave("使用会员卡异常", { error });
      return {
        card_id: ""
      };
    }
  }
}
// 生成出票队列实例
const createTicketQueue = appFlag => new OrderAutoTicketQueue(appFlag);

// 获取城市影院列表
const getCityCinemaList = async ({ appFlag }) => {
  try {
    const res = await APP_API_OBJ[appFlag].getCinemaList();
    console.log("获取城市影院返回", res);
    let cinemaList = res.data?.list || [];
    // 转换数据保持和上面取值一致
    cinemaList = cinemaList.map(item => {
      return {
        ...item,
        name: item.cinema_name,
        cinemaId: item.cinema_id
      };
    });

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
const getMoviePlayInfo = async ({ cinema_id, appFlag }) => {
  try {
    let params = {
      cinema_id: cinema_id
    };
    console.log("获取电影放映列表参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayInfo(params);
    console.log("获取电影放映列表返回", res);
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
    console.error("获取电影放映列表异常", error);
    return {
      error
    };
  }
};

// 获取电影放映日期
const getMoviePlayDate = async ({ cinema_id, short_code, appFlag }) => {
  try {
    let params = {
      cinema_id,
      short_code
    };
    console.log("获取电影放映日期参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlayDate(params);
    console.log("获取电影放映日期返回", res);
    let playDate = res.data || [];
    return {
      playDate
    };
  } catch (error) {
    console.error("获取电影放映日期异常", error);
    return {
      error
    };
  }
};

// 获取座位布局
const getSeatLayout = async ({ cinema_id, show_id, lmaToken, appFlag }) => {
  try {
    let params = {
      cinema_id: cinema_id,
      session_id: show_id,
      lmaToken
    };
    console.log("获取座位布局参数", params);
    const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
    console.log("获取座位布局返回", res);
    let seatData = res.data?.seat_arr || [];
    // 转换数据保持和上面取值一致，过滤出来可选座位
    seatData = seatData
      .map(item => item.column)
      .flat()
      .map(item => {
        return {
          ...item,
          seat_info: item.px + "排" + item.py + "号"
        };
      });
    console.log("seatData", seatData);
    return {
      seatData,
      label_arr: res.data?.label_arr || [],
      short_code: res.data?.short_code
    };
  } catch (error) {
    console.error("获取座位布局异常", error);
    return {
      error
    };
  }
};

// 获取会员卡列表
const getCardList = async ({ lmaToken, appFlag }) => {
  try {
    let params = {
      lmaToken
    };
    console.log("获取会员卡列表参数", params);
    const res = await APP_API_OBJ[appFlag].getCardList(params);
    console.log("获取会员卡列表返回", res);
    let cardList = res.data?.sleep || [];
    // 头部插入，第一个为活跃卡
    cardList.unshift({
      card_number: res.data?.card_number,
      gold: res.data?.gold,
      money_str: res.data?.money_str
      // member_status: res.data?.member_status
    });
    return {
      cardList,
      cardRes: res.data,
      params
    };
  } catch (error) {
    console.error("获取会员卡列表异常", error);
    return {
      error
    };
  }
};

// 连续获取目标券
const continuousGetQuan = async data => {
  let {
    page = 1,
    lmaToken,
    appFlag,
    quan_flag,
    black_quans,
    usedQuanList,
    quanData = [],
    logger
  } = data;
  const params = {
    type: 1,
    page, // 固定1页10条
    lmaToken
  };
  try {
    const res = await APP_API_OBJ[appFlag].getQuanList(params);
    // logger.infoSave("连续获取目标券返回", { res, params });
    let quanList = res.data || [];
    let targetQuanList = quanList.filter(
      item =>
        couponInfoSpecial(item.voucher_name) === couponInfoSpecial(quan_flag) &&
        !black_quans?.includes(item.code) &&
        !usedQuanList.some(itemA => itemA.quan_code?.includes(item.code))
    );
    // logger.infoSave("券标识匹配、黑名单&最近用券记录过滤后", {
    //   quan_flag,
    //   black_quans,
    //   usedQuanList,
    //   targetQuanList
    // });
    quanData.push(...targetQuanList);
    // 1页10条
    if (quanList.length == 10) {
      // 如果总数量仍小于所需数量，则继续获取下一页
      return await continuousGetQuan({
        ...data,
        page: page + 1,
        quanData
      });
    }
    // 先控制只返回目标券数量
    return {
      quanList: quanData.map(item => ({
        // voucher_name: item.voucher_name,
        code: item.code,
        endDateTime: item.expire_time?.split(" ")?.[1] // "有效期至 2026-01-22"
      }))
    };
  } catch (error) {
    logger.errorSave("连续获取目标券异常", { error });
    return { error };
  }
};

// 计算订单价格
const priceCalculation = async ({ order_str, lmaToken, appFlag }) => {
  let params = {
    order_str,
    lmaToken
  };
  try {
    // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
    await mockDelay(1);
    console.log("计算订单价格参数", params);
    const res = await APP_API_OBJ[appFlag].priceCalculation(params);
    console.log("计算订单价格返回", res);
    let price = res.data;
    return {
      price
    };
  } catch (error) {
    console.error("计算订单价格异常", error);
    return {
      error,
      errMsg: "计算订单价格异常:" + JSON.stringify(params)
    };
  }
};

// 绑定券
const bandQuan = async ({ coupon_num, lmaToken, appFlag }) => {
  // 由于要用二线城市影院且40券通用，故写死
  let params = {
    lmaToken,
    code: coupon_num,
    channel_type: "2"
  };
  try {
    await mockDelay(1);
    const res = await APP_API_OBJ[appFlag].bandQuan(params);
    // console.log("res", res);
    // {
    //   "data":{
    //     "status": "0",
    //     "color":"6",
    //     "voucher_name":"5元影慕满减券",
    //     "code":"9999980193913910",
    //     "code_title": "NO. 9999 980l 9391 3910",
    //     "expire time": "有效期至 2024-10-31",
    //   },
    //   "status": true,
    //   "code":"0"
    //   "alert":{},
    //   "msg":"添加成功!",
    //   "time":"2024-10-24 19:04:44"
    // }
    if (res.data?.code && res.msg?.includes("添加成功")) {
      return {
        coupon_num
      };
    } else {
      console.error("绑定新券异常", res);
      return {
        errMsg: "绑定新券异常:" + JSON.stringify(res)
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

// 取消订单
const cancelOrder = async ({ order_str, appFlag, lmaToken, logger, order }) => {
  try {
    let params = {
      order_str,
      ...(lmaToken && { lmaToken })
    };
    const res = await APP_API_OBJ[appFlag].cannelOneOrder(params);
    logger.infoSave("取消订单返回", {
      res,
      params
    });
    return res;
  } catch (error) {
    logger.errorSave("取消订单异常", {
      error,
      params
    });
    sendWxPusherMessage({
      orderInfo: order,
      transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
      failReason: formatErrInfo(error)
    });
  }
};

// 订单购买
const buyTicket = async ({ order_num, lmaToken, appFlag }) => {
  try {
    let params = {
      order_str: order_num, // 订单号
      lmaToken
    };
    console.log("订单购买参数", params);
    const buyRes = await APP_API_OBJ[appFlag].buyTicket(params);
    console.log("订单购买返回", buyRes);
    return {
      buyRes
    };
  } catch (error) {
    console.error("订单购买异常", error);
    return {
      error
    };
  }
};

// 切换卡
const changeCardHandle = async ({ card_number, lmaToken, appFlag }) => {
  try {
    let params = {
      card_number,
      lmaToken
    };
    console.log("切换卡参数", params);
    const res = await APP_API_OBJ[appFlag].changeCard(params);
    console.log("切换卡返回", res);
    return res;
  } catch (error) {
    console.error("切换卡异常", error);
    return {
      error
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
      rule: tokens.userInfo.rule
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
  add_count,
  month_usage_update
}) => {
  let logger = new Logger({ logType: 3 });
  try {
    const res = await svApi.updateDayUsage({
      app_name: app_name,
      card_id: card_id,
      add_count,
      plat_name,
      month_usage_update
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
