import { computed } from "vue";
import {
  getCurrentFormattedDateTime,
  convertFullwidthToHalfwidth,
  cinemNameSpecial
} from "@/utils/utils";

import lierenApi from "@/api/lieren-api";
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
const {
  userInfo: { user_id }
} = tokens;
// console.log("user_id", user_id);

// 影院登录用户信息
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { allUserInfo } = userInfoAndTokens;
// console.log("allUserInfo.sfc.mobile", allUserInfo["sfc"].mobile);

// 影院特殊匹配列表及api
import {
  SPECIAL_CINEMA_OBJ,
  TICKET_CONPREFIX_OBJ,
  APP_OPENID_OBJ
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
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    const { conPrefix, appFlag } = this;
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      // 1、获取当前影院的队列规则状态，如果禁用直接停止
      let appQueueRule = getOrginValue(appTicketRuleList.value).filter(
        item => item.isEnabled && item.appName === appFlag
      );
      console.log(conPrefix + "队列启动的执行规则", appQueueRule);
      if (!appQueueRule?.length) {
        console.warn(conPrefix + "队列执行规则不存在或者未启用，直接停止");
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
      console.warn(conPrefix + "新的待出票订单列表", orders);
      // 将订单加入队列
      this.enqueue(orders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        // 取出队列首部订单并从队列里去掉
        const order = this.dequeue();
        if (order) {
          // 处理订单
          const res = await this.orderHandle(order, processDelay);
          // res: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
          console.warn(
            conPrefix + `单个订单自动出票${res?.submitRes ? "成功" : "失败"}`,
            order,
            res
          );
          if (!isTestOrder) {
            // 从缓存里面删除记录
            deleteOrder(order.order_number, appFlag);
            // 添加订单处理记录
            await this.addOrderHandleRecored(order, res);
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
            id: 144,
            plat_name: "lieren",
            app_name: "sfc",
            ticket_num: 2,
            order_number: "2024062013010376202",
            supplier_end_price: 32,
            order_id: "6243881",
            tpp_price: "36.00",
            city_name: "天津",
            cinema_addr:
              "和平区天津市和平区小白楼街和平路263号天津天河城第八层809商铺",
            cinema_name: "SFC上影影城（天津天河城IMAX店）",
            hall_name: "5号激光厅",
            film_name: "加菲猫家族",
            lockseat: "6排1座 6排2座",
            show_time: "2024-06-21 15:25:00",
            cinema_group: "上影二线"
          }
        ];
      }
      console.warn(
        conPrefix + "匹配已上架影院后的的待出票订单",
        sfcStayOfferlist
      );
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
      console.log(conPrefix + "从出票记录过滤后，无新订单添加到队列");
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
      await this.delay(delayTime);
      console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await this.singleTicket(order);
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
    const { conPrefix, appFlag, errMsg, errInfo } = this;
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
        transfer_fee: res?.transferParams?.transfer_fee || "" // 转单手续费
      };
      if (res?.submitRes) {
        this.handleSuccessOrderList.push(order);
      } else {
        this.handleFailOrderList.push(order);
      }
      svApi
        .addTicketRecord(serOrderInfo)
        .then(res => {
          console.log(conPrefix + "保存订单处理记录成功", res);
        })
        .catch(error => {
          console.error(conPrefix + "保存订单处理记录失败", error);
        });
    } catch (error) {
      console.error(conPrefix + "添加订单处理记录异常", error);
    }
  }

  // 停止队列运行
  stop() {
    const { conPrefix } = this;
    this.isRunning = false;
    console.warn(conPrefix + "主动停止订单自动出票队列");
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
  // 设置错误信息
  setErrInfo(errMsg, errInfo) {
    try {
      if (errMsg === "") {
        // 清空重置
        this.errMsg = "";
      } else {
        this.errMsg = errMsg;
      }
      if (errInfo === "") {
        // 清空重置
        this.errInfo = "";
      } else {
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

  // 转单
  async transferOrder(order, unlockSeatInfo) {
    const { conPrefix } = this;
    if (isTestOrder) return;
    try {
      // 先解锁座位再转单，负责转出去座位被占平台会处罚
      // 3、获取座位布局
      if (unlockSeatInfo) {
        const { city_id, cinema_id, show_id, start_day, start_time } =
          unlockSeatInfo;
        const seatList = await this.getSeatLayout({
          city_id,
          cinema_id,
          show_id
        });
        let availableSeatList = seatList.filter(item => item[2] === "0"); // 1表示已售
        let seat_ids = availableSeatList.map(item => item[0])?.[0]; // 第0个代表座位id
        // // 4、锁定座位
        let lockParams = {
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          start_day,
          start_time
        };
        console.warn(conPrefix + "转单时释放座位传参", lockParams);
        await this.lockSeat(lockParams); // 锁定座位
      }
      const params = {
        id: order.id,
        confirm: 1
      };
      console.warn(conPrefix + "【转单】参数", params);
      const res = await lierenApi.transferOrder(params);
      console.warn(conPrefix + "【转单】结果", res);
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
      this.setErrInfo("订单转单异常", error);
    }
  }

  // 单个订单出票
  async singleTicket(item) {
    const { conPrefix } = this;
    try {
      this.errMsg = "";
      this.errInfo = "";
      console.warn(conPrefix + "单个待出票订单信息", item);
      // if (!window.isFistUnlock) {
      //   console.timeEnd("第一次获取数据到解锁耗时");
      //   window.isFistUnlock = true;
      // }
      // 1、解锁座位
      if (!isTestOrder) {
        await this.unlockSeat(item.id);
      }
    } catch (error) {
      console.error(conPrefix + "解锁座位失败准备试错3次，间隔3秒", error);
      // 试错3次，间隔3秒
      const res = await this.trial(() => this.unlockSeat(item.id), 3, 3);
      if (!res) {
        console.error(conPrefix + "单个订单试错后仍解锁失败", "需要走转单逻辑");
        // 转单逻辑待补充
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
    }
    try {
      // 解锁成功后延迟6秒再执行
      await this.delay(6);
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
  async unlockSeat(order_id) {
    const { conPrefix } = this;
    try {
      let params = {
        order_id
      };
      console.log(conPrefix + "解锁参数", params);
      const res = await lierenApi.unlockSeat(params);
      console.log(conPrefix + "解锁返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "解锁异常", error);
      this.setErrInfo("订单解锁失败", error);
      return Promise.reject(error);
    }
  }

  // 一键买票逻辑
  async oneClickBuyTicket(item) {
    const { conPrefix, appFlag } = this;
    let offerRule;
    try {
      console.log(conPrefix + "一键买票待下单信息", item);
      const {
        id: order_id,
        order_number,
        city_name,
        cinema_name,
        hall_name,
        film_name,
        show_time,
        lockseat,
        ticket_num,
        supplier_end_price
      } = item;
      // 获取该订单的报价记录，按对应报价规则出票
      const offerRes = await svApi.queryOfferList({
        user_id: user_id,
        order_status: "1",
        app_name: appFlag,
        order_number,
        page_num: 1,
        page_size: 50
      });
      let offerRecord = offerRes.data.offerList || [];
      offerRule = offerRecord?.[0];
      // 测试专用
      // offerRule = { offer_type: "1", quan_value: "40" };
      console.warn(conPrefix + "从该订单的报价记录获取到的报价规则", offerRule);
      if (!offerRule) {
        console.error(
          conPrefix +
            "获取该订单的报价记录失败，不进行出票，此处不转单，直接跳过",
          offerRecord
        );
        this.setErrInfo("获取该订单报价记录失败，不转单跳过");
        return;
      }
      await this.getCityList();

      let city_id = this.cityList.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      // 1、获取城市影城列表
      const cinemaList = await this.getCityCinemaList(city_id);
      let cinema_id = this.getCinemaId(cinema_name, cinemaList);
      if (!cinema_id) {
        console.error(conPrefix + "根据订单中的影院名称获取影院id失败");
        this.setErrInfo("根据订单中的影院名称获取影院id失败");
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      // 2、获取影院放映信息
      const moviePlayInfo = await this.getMoviePlayInfo({ city_id, cinema_id });
      let movie_data = moviePlayInfo?.movie_data || [];
      if (!movie_data?.length) {
        const transferParams = await this.transferOrder(item);
        return { transferParams };
      }
      let movieObj = movie_data.find(item => item.movie_name === film_name);
      if (!movieObj) {
        console.warn("影院放映信息匹配订单影片名称失败", movie_data, film_name);
        this.setErrInfo("影院放映信息匹配订单影片名称失败");
        movieObj = movie_data.find(
          item =>
            convertFullwidthToHalfwidth(item.movie_name) ===
            convertFullwidthToHalfwidth(film_name)
        );
        if (!movieObj) {
          this.setErrInfo(
            "影院放映信息匹配订单影片名称失败-全角字符转换成半角后"
          );
          const transferParams = await this.transferOrder(item);
          return { transferParams };
        }
      }
      // let movie_id = movieObj?.movie_id || ''
      let start_day = show_time.split(" ")[0];
      let start_time = show_time.split(" ")[1].slice(0, 5);
      console.log(conPrefix + "movieObj===>", movieObj, start_day, start_time);
      let showList = movieObj?.shows[start_day] || [];
      console.log(conPrefix + "showList===>", showList);
      let show_id =
        showList.find(item => item.start_time === start_time)?.show_id || "";
      if (!show_id) {
        this.setErrInfo("影院放映信息匹配订单放映时间失败");
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
      console.log(conPrefix + "targetList", targetList);
      let seat_ids = targetList.map(item => item[0]).join();
      // 4、锁定座位
      let params = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        start_day,
        start_time
      };
      try {
        await this.lockSeat(params); // 锁定座位
      } catch (error) {
        console.error(conPrefix + "锁定座位失败准备试错3次，间隔5秒", error);
        // 试错3次，间隔5秒
        const res = await this.trial(() => this.lockSeat(params), 3, 5);
        if (!res) {
          console.error(
            conPrefix + "单个订单试错后仍锁定座位失败",
            "需要走转单逻辑"
          );
          const transferParams = await this.transferOrder(item);
          return { offerRule, transferParams };
        }
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
        order: item,
        offerRule
      });
      if (!card_id && !quan_code) {
        console.error(
          conPrefix + "优惠券和会员卡都无法使用，单个订单直接出票结束",
          "走转单逻辑"
        );
        const transferParams = await this.transferOrder(item, {
          city_id,
          cinema_id,
          show_id,
          start_day,
          start_time
        });
        return { offerRule, transferParams };
      }
      // 6计算订单价格
      const priceInfo = await this.priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id,
        quan_code
      });
      if (!priceInfo) {
        console.error(
          conPrefix +
            "使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
          "走转单逻辑"
        );
        this.setErrInfo("使用优惠券或会员卡后计算订单价格失败");
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
      let pay_money = Number(priceInfo.total_price) + ""; // 此处是为了将订单价格30.00转为30，将0.00转为0
      console.log(conPrefix + "订单最后价格", pay_money, priceInfo);
      if (isTestOrder) {
        return { offerRule };
      }
      // 7、创建订单
      const order_num = await this.createOrder({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id,
        coupon: quan_code,
        seat_info: seatName,
        pay_money
      });
      if (!order_num) {
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
      }
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
      // 9、支付订单
      const qrcode = await this.payOrder({ city_id, cinema_id, order_num });
      if (!qrcode) {
        console.error(conPrefix + "获取订单结果失败，单个订单直接出票结束");
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return { offerRule };
      }
      // 10、提交取票码
      const submitRes = await this.submitTicketCode({
        order_id,
        qrcode
      });
      if (!submitRes) {
        console.error(conPrefix + "订单提交取票码失败，单个订单直接出票结束");
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return { offerRule };
      }
      console.log(conPrefix + "一键买票完成", qrcode);
      return { profit, submitRes, qrcode, quan_code, card_id, offerRule };
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

  // 获取座位布局
  async getSeatLayout(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, show_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        width: "240"
      };
      console.log(conPrefix + "获取座位布局参数", params);
      const res = await this.sfcApi.getMoviePlaySeat(params);
      console.log(conPrefix + "获取座位布局返回", res);
      return res.data?.play_data?.seat_data || [];
    } catch (error) {
      console.error(conPrefix + "获取座位布局异常", error);
      this.setErrInfo("获取座位布局异常", error);
    }
  }

  // 锁定座位
  async lockSeat(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, show_id, seat_ids, start_day, start_time } =
        data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        force_lock: "-1",
        seat_ids: seat_ids,
        start_day: start_day,
        start_time: start_time
      };
      console.log(conPrefix + "锁定座位参数", params);
      const res = await this.sfcApi.lockSeat(params);
      console.log(conPrefix + "锁定座位返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "锁定座位异常", error);
      this.setErrInfo("锁定座位异常", error);
      return Promise.reject(error);
    }
  }

  // 使用优惠券或者会员卡
  async useQuanOrCard({
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
    order
  }) {
    const { conPrefix } = this;
    try {
      const priceInfo = await this.priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_ids
      });
      let pay_money = priceInfo.total_price;
      console.warn(
        conPrefix + "使用优惠券或者会员卡前计算的订单总价",
        pay_money
      );
      console.log(
        conPrefix +
          `待出票订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
      );
      const { offer_type: offerType, quan_value: quanValue } = offerRule;
      // 拿订单号去匹配报价记录
      if (offerType !== "1") {
        console.log(conPrefix + "使用会员卡出票");
        const memberPrice = await this.getMemberPrice(order);
        console.log(conPrefix + "获取会员价", memberPrice);
        if (!memberPrice) {
          console.warn(
            conPrefix + "使用优惠券或者会员卡前获取会员价异常",
            memberPrice
          );
          this.setErrInfo("使用优惠券或者会员卡前获取会员价异常");
          return {
            card_id: "",
            profit: 0 // 利润
          };
        }
        // 1、获取会员卡列表
        const cardList = await this.getCardList({ city_id, cinema_id });
        // 2、使用会员卡
        let member_total_price = memberPrice * ticket_num;
        const { card_id, profit } = await this.useCard({
          member_total_price,
          cardList,
          supplier_end_price,
          ticket_num,
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          memberPrice,
          rewards: order.rewards
        });
        return {
          card_id,
          profit // 利润
        };
      } else {
        console.log(conPrefix + "使用优惠券出票");
        // 1、获取优惠券列表
        const quanList = await this.getQuanList({ city_id, cinema_id });
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
          rewards: order.rewards
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
    try {
      // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
      await this.delay(1);
      let { city_id, cinema_id, show_id, seat_ids, card_id, quan_code } =
        data || {};
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
        update_time: getCurrentFormattedDateTime()
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
      this.setErrInfo("计算订单价格异常", error);
    }
  }

  // 创建订单
  async createOrder(data) {
    const { conPrefix, appFlag } = this;
    try {
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
      let params = {
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        seat_info, // 座位描述，如：7排11号,7排10号
        phone: allUserInfo[appFlag]?.mobile || "", // 用户手机号
        additional_goods_info: "", // 附加商品信息
        companion_info: "", // 携伴信息
        goods_info: "", // 商品信息
        option_goods_info: "", // 可选的额外商品信息
        pay_money, // 支付金额
        promo_id: "0", // 促销活动ID，这里为0，表示没有参与特定的促销活动
        update_time: getCurrentFormattedDateTime()
      };
      if (card_id) {
        params.card_id = card_id; // 会员卡id
        params.card_password = encode(""); // 会员卡密码
        try {
          console.log(conPrefix + "创建订单参数", params);
          const res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          return res.data?.order_num || "";
        } catch (error) {
          console.warn(conPrefix + "会员卡第一次创建订单失败", error);
          this.setErrInfo("会员卡第一次创建订单失败", error);
          console.warn(
            conPrefix + "调整会员卡密码参数再次发起创建订单请求",
            params
          );
          let pwd = allUserInfo[appFlag]?.member_pwd || "";
          if (!pwd) {
            console.error(conPrefix + "会员卡密码未设置");
            this.setErrInfo("会员卡密码未设置");
            return;
          }
          params.card_password = encode(pwd); // 会员卡密码
          const res = await this.sfcApi.createOrder(params);
          console.log(conPrefix + "创建订单返回", res);
          this.setErrInfo("", "");
          return res.data?.order_num || "";
        }
      } else if (coupon) {
        params.coupon = coupon; // 优惠券券码
        console.log(conPrefix + "创建订单参数", params);
        const res = await this.sfcApi.createOrder(params);
        console.log(conPrefix + "创建订单返回", res);
        this.setErrInfo("", "");
        return res.data?.order_num || "";
      }
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
      let params = {
        city_id,
        cinema_id,
        open_id: APP_OPENID_OBJ[appFlag], // 微信openId
        order_num, // 订单号
        pay_money, // 支付金额
        pay_type: "" // 购买方式 传空意味着用优惠券或者会员卡
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

  // 支付订单并返回购票信息
  async payOrder(data) {
    const { conPrefix } = this;
    try {
      let { city_id, cinema_id, order_num } = data || {};
      let params = {
        city_id,
        cinema_id,
        order_num, // 订单号
        order_type: "ticket", // 订单类型
        order_type_num: 1 // 订单子类型数量，可能是指购买的该类型票的数量
      };
      console.log(conPrefix + "支付订单参数", params);
      const res = await this.sfcApi.payOrder(params);
      console.log(conPrefix + "支付订单返回", res);
      return res.data.qrcode || "";
    } catch (error) {
      console.error(conPrefix + "支付订单异常", error);
      this.setErrInfo("获取订单结果异常", error);
    }
  }

  // 提交出票码
  async submitTicketCode({ order_id, qrcode }) {
    const { conPrefix } = this;
    try {
      let params = {
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
      console.log(conPrefix + "提交出票码参数", params);
      const res = await lierenApi.submitTicketCode(params);
      console.log(conPrefix + "提交出票码返回", res);
      return res;
    } catch (error) {
      console.error(conPrefix + "提交出票码异常", error);
      this.setErrInfo("提交出票码异常", error);
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
            await callback();
            console.log(conPrefix + `第${inx}次试错成功`);
            clearInterval(trialTimer);
            resolve();
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

  // 获取会员价
  async getMemberPrice(order) {
    const { conPrefix } = this;
    try {
      console.log(conPrefix + "准备获取会员价", order);
      const { city_name, cinema_name, hall_name } = order;
      console.log(
        conPrefix +
          `待报价订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
      );
      // 获取当前场次电影信息
      const movieInfo = await this.getMovieInfo(order);
      console.log(conPrefix + `待报价订单当前场次电影相关信息`, movieInfo);
      if (!movieInfo) {
        console.error(conPrefix + "获取当前场次电影信息失败", "不再进行出票");
        this.setErrInfo("获取当前场次电影信息失败");
        return;
      }
      let { member_price } = movieInfo;
      console.log(conPrefix + "获取会员价", member_price);
      if (member_price) {
        return Number(member_price);
      }
    } catch (error) {
      console.error(conPrefix + "获取会员价异常", error);
      this.setErrInfo("获取会员价异常", error);
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
        item => item.movie_name.indexOf(film_name) !== -1
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
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        request_from: "1"
      };
      console.log(conPrefix + "获取优惠券列表参数", params);
      const res = await this.sfcApi.getQuanList(params);
      console.log(conPrefix + "获取优惠券列表返回", res);
      let list = res.data.list || [];
      // let noUseLIst = ['1598162363509715', '1055968062906716', '1284460567801315', '1116166666409614']
      // 过滤掉不可用券
      // list = list.filter(item => item.coupon_info.indexOf('员工券') !== -1)
      return list;
    } catch (error) {
      console.error(conPrefix + "获取优惠券列表异常", error);
      this.setErrInfo("获取优惠券列表异常", error);
    }
  }

  // 绑定券
  async bandQuan({ coupon_num, cinema_id, city_id }) {
    try {
      await this.sfcApi.bandQuan({
        city_id,
        cinema_id,
        coupon_code: coupon_num,
        from_goods: "2"
      });
      return coupon_num;
    } catch (error) {
      console.error(conPrefix + "绑定新券异常", error);
      this.setErrInfo("绑定新券异常", error);
    }
  }

  // 获取新券
  async getNewQuan({ quanValue, quanNum, city_id, cinema_id }) {
    try {
      const { appFlag } = this;
      let quanRes = await svApi.queryQuanList({
        quan_value: quanValue,
        app_name: appFlag,
        quan_status: "1",
        page_num: 1,
        page_size: quanNum
      });
      let quanList = quanRes.data.quanList || [];
      if (!quanList?.length) {
        console.error(conPrefix + `数据库${quanValue}面额券不足`);
        this.setErrInfo(`数据库${quanValue}面额券不足`);
        return;
      }
      let bandQuanList = [];
      for (const quan of quanList) {
        console.log(conPrefix + `正在尝试绑定券 ${quan.coupon_num}...`);
        const coupon_num = await this.bandQuan({
          city_id,
          cinema_id,
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
    rewards
  }) {
    const { conPrefix } = this;
    try {
      // 规则如下:
      // 1、成本不能高于中标价，即40券不能出中标价39.3的单
      // 2、1张票一个券，不能出现2张票用3个券的情况
      // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
      let quans = quanList || []; // 优惠券列表
      let targetQuanList = quans
        .filter(item => item.coupon_info.indexOf(quanValue) !== -1)
        .map(item => {
          return {
            coupon_num: item.coupon_num,
            quan_cost: quanValue == 40 ? 39.3 : Number(quanValue)
          };
        });
      if (targetQuanList?.length < ticket_num) {
        console.error(
          conPrefix + `${quanValue} 面额券不足，从服务端获取并绑定`,
          targetQuanList
        );
        this.setErrInfo(`${quanValue} 面额券不足`);
        const newQuanList = await this.getNewQuan({
          city_id,
          cinema_id,
          quanValue,
          quanNum: Number(ticket_num) - targetQuanList.length
        });
        if (newQuanList?.length) {
          targetQuanList = [...targetQuanList, ...newQuanList];
        }
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
      // 用券列表
      let useQuans = targetQuanList
        .map(item => item.coupon_num)
        .filter((item, index) => index < ticket_num);
      let profit = 0; // 利润
      useQuans.forEach(item => {
        profit =
          profit +
          Number(supplier_end_price) -
          item.quan_cost -
          (Number(supplier_end_price) * 100) / 10000;
      });
      if (rewards == 1) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 400) / 10000;
        profit += rewardPrice;
      }
      // 四舍五入保留两位小数后再转为数值类型
      profit = profit.toFixed(2);

      const priceInfo = await this.priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        quan_code: useQuans.join()
      });
      if (!priceInfo) {
        console.error(conPrefix + "计算订单价格失败，单个订单直接出票结束");
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return {
          profit: 0,
          useQuans: []
        };
      }
      // 实际支付金额
      let pay_money = priceInfo.total_price;
      if (pay_money === "0.00") {
        return {
          profit,
          useQuans
        };
      }
      return {
        profit: 0,
        useQuans: []
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
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id,
        cinema_id
      };
      console.log(conPrefix + "获取会员卡列表参数", params);
      const res = await this.sfcApi.getCardList(params);
      console.log(conPrefix + "获取会员卡列表返回", res);
      let list = res.data.card_data || [];
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
    memberPrice,
    rewards
  }) {
    const { conPrefix, appFlag } = this;
    try {
      let cards = cardList || [];
      let cardFilter = cards.filter(
        item => Number(item.balance) >= Number(member_total_price)
      );
      if (!cardFilter?.length) {
        console.error(conPrefix + "使用会员卡失败，会员卡余额不足");
        this.setErrInfo(appFlag + "会员卡余额不足");
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
          const result = await this.priceCalculation({
            city_id,
            cinema_id,
            show_id,
            seat_ids,
            card_id: card.id
          });
          if (result) {
            card_id = card.id;
            console.log(conPrefix + "卡使用成功，返回结果并停止尝试。");
            return result; // 卡使用成功，返回结果并结束函数
          }
        }
        console.error(conPrefix + "所有卡尝试均失败。");
        return null; // 所有卡尝试失败后返回null
      };
      // 3、计算价格要求最终价格小于中标价
      const priceInfo = await attemptCardsSequentially();
      console.warn(
        conPrefix + "会员卡出票最终价格",
        priceInfo?.total_price,
        "中标价格*座位数：",
        Number(supplier_end_price) * ticket_num
      );
      if (
        !priceInfo ||
        Number(priceInfo.total_price) >= Number(supplier_end_price) * ticket_num
      ) {
        console.error(
          conPrefix +
            "计算订单价格失败或者最终计算大于等于中标价，单个订单直接出票结束"
        );
        this.setErrInfo(
          appFlag + (priceInfo ? "最终价格大于等于中标价" : "计算订单价格失败")
        );
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return {
          profit: 0,
          card_id: ""
        };
      }
      // 卡的话 1块钱成本就是一块钱，利润 =  中标价格-会员出票价格 -手续费（中标价格1%）
      let profit =
        supplier_end_price -
        memberPrice -
        (Number(supplier_end_price) * 100) / 10000;
      profit = Number(profit) * Number(ticket_num);
      if (rewards == 1) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * Number(ticket_num) * 400) / 10000;
        profit += rewardPrice;
      }
      profit = Number(profit).toFixed(2);
      return {
        card_id,
        profit
      };
    } catch (error) {
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
