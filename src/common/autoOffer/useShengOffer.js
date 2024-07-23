import { ref, computed } from "vue";
import {
  isTimeAfter,
  getCinemaFlag,
  getCurrentFormattedDateTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  cinemNameSpecial
} from "@/utils/utils";
import { SPECIAL_CINEMA_OBJ, SFC_CINEMA_NAME } from "@/common/constant";
import svApi from "@/api/sv-api";
import { SFC_API_OBJ } from "@/common/index.js";

import shengApi from "@/api/sheng-api";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatTableDataStore();
// 平台自动报价规则列表
const platOfferRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "sheng")
);

// app报价规则列表
import { useDataTableStore } from "@/store/offerRule";
const dataTableStore = useDataTableStore();

// 使用computed确保items响应式
const appOfferRuleList = computed(() =>
  dataTableStore.items
    .filter(item =>
      item.platOfferList?.length
        ? item.platOfferList.map(item => item.platName).includes("sheng")
        : item.orderForm.split(",").includes("sheng")
    )
    .map(itemA => {
      let offerAmount = itemA.offerAmount || "";
      let addAmount = itemA.addAmount || "";
      return {
        ...itemA,
        offerAmount:
          itemA.offerType === "1"
            ? itemA.platOfferList?.find(item => item.platName === "sheng")
                ?.value || offerAmount
            : itemA.offerType === "3"
              ? offerAmount
              : "",
        addAmount:
          itemA.offerType === "2"
            ? itemA.platOfferList?.find(item => item.platName === "sheng")
                ?.value || addAmount
            : ""
      };
    })
);

let conPrefix = "【省APP自动报价】——"; // console打印前缀
const getOrginValue = value => JSON.parse(JSON.stringify(value));

console.log(conPrefix + "队列执行规则", getOrginValue(platOfferRuleList.value));
console.log(conPrefix + "自动报价规则", getOrginValue(appOfferRuleList.value));
// let socket = new WebSocket("ws://localhost:3000/ws"); // 与后端WebSocket服务地址对应
// let stayOfferList = []; // 待报价订单
// socket.addEventListener("open", () => {
//   console.log("WebSocket连接已建立");
// });
// socket.addEventListener("message", event => {
//   console.log("收到省平台推送待报价订单消息:", event.data);
//   try {
//     let data = JSON.parse(event.data);
//     if (stayOfferList.some(item => item.id !== data.id)) {
//       stayOfferList.push(data);
//     }
//   } catch (error) {}
// });

const cityList = ref([]); // 城市列表
let errMsg = "";
let errInfo = "";

//是否是测试订单
let isTestOrder = false;
// 创建一个订单自动报价队列类
class OrderAutoOfferQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
    this.offerList = [];
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start() {
    console.log(
      "开始执行时获取到的规则列表",
      getOrginValue(appOfferRuleList.value)
    );
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      // 1、获取当前平台的队列规则状态，如果禁用直接停止
      let platQueueRule = getOrginValue(platOfferRuleList.value).filter(
        item => item.isEnabled
      );
      // console.log(conPrefix + "队列启动的执行规则", platQueueRule);
      if (!platQueueRule?.length) {
        console.warn(conPrefix + "队列执行规则不存在或者未启用，直接停止");
        await this.stop();
        return;
      }
      // console.log(conPrefix + "队列每次执行时的规则", platQueueRule[0]);
      const { getInterval, handleInterval } = platQueueRule[0];
      let fetchDelay = getInterval;
      let processDelay = handleInterval;
      // console.warn(
      //   conPrefix +
      //     `队列启动, ${fetchDelay} 秒获取一次待报价订单, ${processDelay} 秒处理一次订单}`
      // );
      let orders = await this.fetchOrders(fetchDelay, []);
      console.warn(conPrefix + "新的待报价订单列表", orders);
      // 将订单加入队列
      this.enqueue(orders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        const order = this.dequeue(); // 取出队列首部订单并从队列里去掉
        if (order) {
          // 处理订单
          const offerResult = await this.orderHandle(order, processDelay);
          // { res, offerRule } || { offerRule } || undefined
          // 添加订单处理记录
          if (!isTestOrder) {
            await this.addOrderHandleRecored(order, offerResult);
          }
          console.warn(
            conPrefix + `单个订单自动报价${offerResult?.res ? "成功" : "失败"}`,
            order
          );
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
    try {
      await this.delay(fetchDelay);
      const stayList = await getStayOfferList();
      // console.log("stayList", stayList);
      if (!stayList?.length) return [];
      let sfcStayOfferlist = stayList.map(item => {
        const {
          orderId,
          id,
          showPrice,
          grabPrice,
          priceNew, // 当前报价
          detail,
          order,
          seatInfo,
          priceAuto, // 自动报价价格
          orderCode
        } = item;
        // orderId    订单id    integer
        // id         抢单id    integer
        // grabPrice  最高限价  string
        // showPrice  市场价    string
        // grabPrice  最高限价  string
        // orderCode  订单code  string
        const {
          quantity,
          sourceData: { show, film, cinema, label }
        } = detail;
        // quantity   座位数    integer

        return {
          plat_name: "sheng",
          id: orderId,
          tpp_price: showPrice,
          supplier_max_price: Number(
            Number(grabPrice) / Number(quantity).toFixed(2)
          ),
          city_name: film.cityName,
          cinema_addr: film.address,
          ticket_num: quantity,
          cinema_name: film.cinemaName,
          hall_name: show.hallName,
          film_name: film.filmName,
          film_img: film.imgUrl,
          show_time: show.startTime,
          rewards: 0, // 省无奖励，只有快捷
          quick: order.quick, // true表示为快捷订单（需12分钟内完成发货），false表示为特惠订单（需45分钟内完成发货）
          // 省暂定和猎人针对sfc影院名字一样
          cinema_group:
            film.cinemaName.includes("SFC") &&
            SFC_CINEMA_NAME.includes(film.cinemaName)
              ? "上影上海"
              : "其它自动",
          cinema_code: cinema.cinemaId, // 影院id
          order_number: orderCode,
          seats: seatInfo // 座位信息
        };
      });
      console.warn("转换后的订单列表", sfcStayOfferlist);
      sfcStayOfferlist = sfcStayOfferlist
        .filter(item => getCinemaFlag(item))
        .map(item => {
          return {
            ...item,
            appName: getCinemaFlag(item)
          };
        });
      console.warn(
        conPrefix + "匹配已上架影院后的的待报价订单",
        sfcStayOfferlist
      );
      if (!sfcStayOfferlist?.length) return [];
      const { handleSuccessOrderList, handleFailOrderList } = this;
      let orderOfferRecord = [
        ...handleSuccessOrderList,
        ...handleFailOrderList
      ];
      let newOrders = sfcStayOfferlist.filter(item => {
        // 过滤出来新订单（未进行过报价的）
        return !orderOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      console.warn(
        conPrefix + "从当前队列报价记录过滤后的的待报价订单",
        newOrders
      );
      if (!newOrders?.length) return [];
      // 如果过滤到这时候还有单子再调接口进行历史报价记录过滤
      const offerList = await getOfferList();
      this.offerList = offerList;
      newOrders = newOrders.filter(item =>
        judgeHandle(item, item.appName, offerList)
      );
      console.warn(
        conPrefix + "从服务端历史报价记录过滤后的的待报价订单",
        newOrders
      );
      return newOrders;
    } catch (error) {
      console.error(conPrefix + "获取待报价订单列表异常", error);
      return [];
    }
  }

  // 将订单添加至队列
  enqueue(orders) {
    if (orders.length) {
      console.log(conPrefix + "添加新订单到队列");
      this.queue.push(...orders);
    } else {
      console.log(conPrefix + "从报价记录过滤后，无新订单添加到队列");
    }
  }

  // 从队列中移除并返回首部订单
  dequeue() {
    return this.queue.shift();
  }

  // 处理订单
  async orderHandle(order, delayTime) {
    try {
      await this.delay(delayTime);
      console.log(conPrefix + `订单处理 ${order.id}`);
      if (this.isRunning) {
        const offerResult = await singleOffer(order, this.offerList);
        // { res, offerRule } || { offerRule } || undefined
        return offerResult;
      } else {
        console.warn(conPrefix + "订单报价队列已停止");
      }
    } catch (error) {
      console.error(conPrefix + "订单执行报价异常", error);
    }
  }

  // 添加订单处理记录
  async addOrderHandleRecored(order, offerResult) {
    try {
      // 数据库存储
      // offerResult: { res, offerRule } || { offerRule } || undefined
      console.warn(conPrefix + "数据库存储报价记录", order, offerResult);
      let serOrderInfo = {
        // user_id: order.user_id,
        plat_name: "sheng",
        app_name: order.appName || offerResult?.offerRule?.shadowLineName || "",
        order_id: order.id,
        order_number: order.order_number,
        tpp_price: order.tpp_price,
        supplier_max_price: order.supplier_max_price,
        city_name: order.city_name,
        cinema_addr: order.cinema_addr,
        ticket_num: order.ticket_num,
        cinema_name: order.cinema_name,
        hall_name: order.hall_name,
        film_name: order.film_name,
        show_time: order.show_time,
        cinema_group: order.cinema_group,
        offer_type: offerResult?.offerRule?.offerType,
        offer_amount: offerResult?.offerRule?.offerAmount,
        member_offer_amount: offerResult?.offerRule?.memberOfferAmount,
        member_price: offerResult?.offerRule?.memberPrice,
        real_member_price: offerResult?.offerRule?.real_member_price,
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        // remark: '',
        processing_time: getCurrentFormattedDateTime(),
        err_msg: errMsg || "",
        err_info: errInfo || "",
        rewards: order.rewards // 是否是奖励订单 1是 0否
      };
      if (offerResult?.res) {
        this.handleSuccessOrderList.push(order);
      } else {
        // 失败场景添加offer_rule用以排查问题
        serOrderInfo.offer_rule = offerResult?.offerRule
          ? JSON.stringify(getOrginValue(offerResult.offerRule))
          : "";
        this.handleFailOrderList.push(order);
      }
      await svApi.addOfferRecord(serOrderInfo);
    } catch (error) {
      console.error(conPrefix + "添加订单处理记录异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    console.warn(conPrefix + "主动停止订单自动报价队列");
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
}
// 报价队列实例
const offerQueue = new OrderAutoOfferQueue();

// 设置错误信息
const setErrInfo = (err_msg, err_info) => {
  try {
    if (err_msg === "") {
      // 清空重置
      errMsg = "";
    } else {
      errMsg = err_msg;
    }
    if (err_info === "") {
      // 清空重置
      errInfo = "";
    } else {
      if (err_info) {
        if (err_info instanceof Error) {
          const cleanedError = {
            message: err_info.message,
            stack: err_info.stack,
            name: err_info.name
          };
          errInfo = JSON.stringify(
            cleanedError,
            (key, value) =>
              typeof value === "function" || value instanceof Error
                ? undefined
                : value,
            2
          );
        } else {
          try {
            errInfo = JSON.stringify(err_info);
          } catch (error) {
            console.warn("错误信息转换异常", error);
            errInfo = err_info.toString();
          }
        }
      }
    }
  } catch (error) {
    console.warn("错误信息转换异常1", error);
  }
};

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      // user_id: "9",
      plat_name: "sheng",
      start_time: getCurrentFormattedDateTime(
        +new Date() - 0.5 * 60 * 60 * 1000
      ),
      end_time: getCurrentFormattedDateTime()
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取省历史报价记录异常", error);
    setErrInfo("获取省历史报价记录异常", error);
    return Promise.reject("获取历史报价异常");
  }
};
// 判断该订单是否是新订单
const judgeHandle = (item, app_name, offerList) => {
  try {
    let targetOfferList = offerList.filter(
      itemA => itemA.app_name === app_name
    );
    let isOffer = targetOfferList.some(
      itemA => itemA.order_number === item.order_number
    );
    // 报过价新订单
    return !isOffer;
  } catch (error) {
    console.error(conPrefix + "判断该订单是否是新订单异常", error);
    setErrInfo("判断该订单是否是新订单异常", error);
  }
};

// 计算连续中标数
const calcCount = data => {
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let isLastWin = null; // null, true (中标), false (不中标)

  for (const item of data) {
    const isWin = item.offer === item.supplier_end_price;

    if (isLastWin === null) {
      // 初始化中标或不中标的状态
      isLastWin = isWin;
    } else if (isWin === isLastWin) {
      // 如果当前项与上一项状态相同，累计连续次数
      isLastWin ? consecutiveWins++ : consecutiveLosses++;
    } else {
      // 中断连续计算
      break;
    }
  }

  // 第一个元素的中标或不中标状态需要单独计入
  if (isLastWin) {
    consecutiveWins++;
  } else {
    consecutiveLosses++;
  }
  console.log("连续中标次数:", consecutiveWins);
  console.log("连续未中标次数:", consecutiveLosses);
  return {
    inCount: consecutiveWins,
    outCount: consecutiveLosses
  };
};
// 获取最终报价
const getEndPrice = async params => {
  try {
    let { cost_price, supplier_max_price, price, rewards, offerList } =
      params || {};
    // console.log("获取最终报价相关字段", params);
    // 远端报价记录
    let serOfferRecord, lierenOfferRecord, lierenMachineOfferList;
    let adjustPrice = window.localStorage.getItem("adjustPrice");
    if (adjustPrice) {
      adjustPrice = JSON.parse(adjustPrice);
      serOfferRecord = offerList;
      // 测试用下面的
      // serOfferRecord = await getOfferList();
      // 省报价记录
      // lierenOfferRecord = await getLierenOrderList();
      lierenOfferRecord = [];
      lierenMachineOfferList = lierenOfferRecord.filter(item =>
        serOfferRecord.find(itemA => itemA.order_number === item.order_number)
      );
    }
    if (adjustPrice && lierenMachineOfferList?.length) {
      console.warn(
        "自动调价生效，开始进行相关处理",
        adjustPrice,
        lierenMachineOfferList
      );
      let countRes = calcCount(lierenMachineOfferList);
      const { inCount, outCount, inPrice, outPrice } = adjustPrice;
      // console.log("inCount", inCount, outCount, inPrice, outPrice);
      if (countRes.inCount && inPrice && countRes.inCount >= inCount) {
        price = price + Number(inPrice);
        console.warn("动态调价后的价格", price, "增加", inPrice);
      } else if (
        countRes.outCount &&
        outPrice &&
        countRes.outCount >= outCount
      ) {
        price = price - Number(outCount);
        console.warn("动态调价后的价格", price, "降低", outPrice);
      }
    }
    // 手续费
    const shouxufei = (Number(price) * 100) / 10000;
    // 奖励费用
    let rewardPrice = rewards == 1 ? (Number(price) * 400) / 10000 : 0;
    // 真实成本（加手续费）
    cost_price = cost_price + shouxufei;
    // 最终成本（减奖励费）
    const ensCostPrice = Number(cost_price - rewardPrice).toFixed();
    // 最终成本超过平台限价
    if (ensCostPrice >= Number(supplier_max_price)) {
      let str = `最终成本${ensCostPrice}超过平台限价${supplier_max_price}，不再进行报价`;
      console.error(conPrefix + str);
      setErrInfo(str);
      return;
    }
    // 最终报价超过平台限价
    if (Number(supplier_max_price) < price + shouxufei) {
      // 奖励单按真实成本（加手续费），非奖励单最高限价
      price = rewards == 1 ? cost_price : supplier_max_price;
      return Math.round(price);
    }
    // 如果报最终报价不小于最高限价返回报价
    return Math.round(price);
  } catch (error) {
    console.warn("获取最终报价异常", error);
    setErrInfo("获取最终报价异常", error);
  }
};
// window.getEndPrice = getEndPrice;
// 获取待报价订单列表
async function getStayOfferList(page, stayList = []) {
  try {
    // 获取一次清空一次
    // let list = stayOfferList.slice();
    // stayOfferList = [];

    const res = await shengApi.queryStayOfferList({
      supplierCode: "ccf7b11cdc944cf1940a149cff4243f9", // 供应商号
      status: "0", // 0待报价订单，1已报价订单
      page: page || 1 // 1页20条
    });
    let list = res.data.rows || [];
    // let count = res.data.count || 1;
    // stayList = [...stayList, ...list];
    // if (list.length < 20) {
    //   return stayList;
    // } else {
    //   return await getStayOfferList(count++, stayList);
    // }
    console.log(conPrefix + "获取待报价列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取待报价列表异常", error);
    setErrInfo("获取待报价列表异常", error);
    return [];
  }
}

// 单个订单报价
async function singleOffer(item, offerList) {
  let offerRule;
  try {
    errMsg = "";
    errInfo = "";
    console.log(conPrefix + "待报价订单", item);
    let { id, supplier_max_price, rewards, ticket_num } = item || {};
    if (!id) return;
    // 报价逻辑
    console.log(conPrefix + "准备匹配报价规则", item);
    offerRule = await offerRuleMatch(item);
    if (!offerRule) {
      console.error(conPrefix + "获取匹配报价规则失败");
      return;
    }
    const {
      offerAmount,
      memberOfferAmount,
      memberPrice,
      quanValue,
      offerType
    } = offerRule;
    let price = Number(offerAmount || memberOfferAmount);
    if (!price) return { offerRule };
    // 成本价
    let cost_price =
      offerType === "1"
        ? quanValue == "40"
          ? 38.8
          : Number(quanValue)
        : Number(memberPrice);
    const endPrice = await getEndPrice({
      cost_price,
      supplier_max_price,
      price,
      rewards,
      offerList
    });
    console.warn("最终报价返回", endPrice);
    if (!endPrice) {
      return { offerRule };
    }
    if (offerType === "1") {
      offerRule.offerAmount = endPrice;
    } else {
      offerRule.memberOfferAmount = endPrice;
    }

    let params = {
      supplierCode: "ccf7b11cdc944cf1940a149cff4243f9", // 供应商号
      orderCode: item.order_number,
      // 暂时先减1测试
      seatInfo: JSON.stringify(
        item.seats.map(item => ({
          seatId: item.seatId,
          supplierPrice: endPrice - 1
        }))
      )
    };
    console.log(conPrefix + "订单报价参数", params);
    if (isTestOrder) {
      return { offerRule };
    }
    const res = await shengApi.submitOffer(params);
    console.log(conPrefix + "订单报价返回", res);
    return { res, offerRule };
  } catch (error) {
    console.error(conPrefix + "订单报价异常", error);
    setErrInfo("订单报价异常", error);
    return { offerRule };
  }
}

// 获取电影放映信息
async function getMoviePlayInfo(data) {
  try {
    let { city_id, cinema_id, appName } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log(conPrefix + "获取电影放映信息参数", params);
    console.log(conPrefix + "影线名称", appName);
    let res = await SFC_API_OBJ[appName].getMoviePlayInfo(params);
    console.log(conPrefix + "获取电影放映信息返回", res);
    return res.data;
  } catch (error) {
    console.error(conPrefix + "获取电影放映信息异常", error);
    setErrInfo("获取电影放映信息异常", error);
  }
}

// 报价规则匹配
const offerRuleMatch = async order => {
  try {
    console.warn(conPrefix + "匹配报价规则开始");
    const {
      city_name,
      cinema_name,
      hall_name,
      film_name,
      show_time,
      ticket_num,
      appName,
      app_name //该字段主要是为了方便测试
    } = order;
    let shadowLineName = appName || app_name;

    console.log(conPrefix + "报价订单影线", shadowLineName);
    // 1、获取启用的规则列表（只有满足规则才报价）
    let useRuleList = getOrginValue(appOfferRuleList.value).filter(
      item => item.status === "1"
    );
    console.log(conPrefix + "启用的规则列表", useRuleList);
    // 2、获取某个影线的规则列表
    let shadowLineRuleList = useRuleList.filter(
      item => item.shadowLineName === shadowLineName
    );
    console.log(conPrefix + "影线的规则列表", shadowLineRuleList);
    // 3、匹配城市
    let cityRuleList = shadowLineRuleList.filter(item => {
      console.log(
        conPrefix + "匹配城市",
        item.includeCityNames,
        item.excludeCityNames,
        city_name
      );
      if (!item.includeCityNames.length && !item.excludeCityNames.length) {
        return true;
      }
      if (item.includeCityNames.length) {
        return item.includeCityNames.join().indexOf(city_name) > -1;
      }
      if (item.excludeCityNames.length) {
        return item.excludeCityNames.join().indexOf(city_name) === -1;
      }
    });
    console.log(conPrefix + "匹配城市后的规则列表", cityRuleList);
    // 4、匹配影院
    let cinemaRuleList = cityRuleList.filter(item => {
      if (!item.includeCinemaNames.length && !item.excludeCinemaNames.length) {
        return true;
      }
      if (item.includeCinemaNames.length) {
        return cinemaMatchHandle(
          cinema_name,
          item.includeCinemaNames,
          shadowLineName
        );
      }
      if (item.excludeCinemaNames.length) {
        return !cinemaMatchHandle(
          cinema_name,
          item.excludeCinemaNames,
          shadowLineName
        );
      }
    });
    console.log(conPrefix + "匹配影院后的规则列表", cinemaRuleList);
    // 5、匹配影厅
    let hallRuleList = cinemaRuleList.filter(item => {
      console.log(
        conPrefix + "匹配影厅",
        item.includeHallNames,
        item.excludeHallNames,
        hall_name.toUpperCase()
      );
      if (!item.includeHallNames.length && !item.excludeHallNames.length) {
        return true;
      }
      if (item.includeHallNames.length) {
        let isMatch = item.includeHallNames.some(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) > -1;
        });
        console.log(conPrefix + "isMatch1-1", isMatch);
        return isMatch;
      }
      if (item.excludeHallNames.length) {
        let isMatch = item.excludeHallNames.every(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) === -1;
        });
        console.log(conPrefix + "isMatch1-2", isMatch);
        return isMatch;
      }
    });
    console.log(conPrefix + "匹配影厅后的规则列表", hallRuleList);
    // 6、匹配影片
    let filmRuleList = hallRuleList.filter(item => {
      console.log(
        conPrefix + "匹配影片",
        item.includeFilmNames,
        item.excludeFilmNames,
        film_name.toUpperCase()
      );
      if (!item.includeFilmNames.length && !item.excludeFilmNames.length) {
        return true;
      }
      if (item.includeFilmNames.length) {
        let isMatch = item.includeFilmNames.some(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) ===
            convertFullwidthToHalfwidth(filmName)
          );
        });
        console.log(conPrefix + "isMatch2-1", isMatch);
        return isMatch;
      }
      if (item.excludeFilmNames.length) {
        let isMatch = item.excludeFilmNames.every(filmName => {
          return (
            convertFullwidthToHalfwidth(film_name) !==
            convertFullwidthToHalfwidth(filmName)
          );
        });
        console.log("isMatch2-2", isMatch);
        return isMatch;
      }
    });
    console.log(conPrefix + "匹配影片后的规则列表", filmRuleList);
    // 7、匹配座位数限制
    let seatRuleList = filmRuleList.filter(item => {
      if (!item.seatNum) {
        return true;
      }
      return Number(item.seatNum) >= Number(ticket_num);
    });
    console.log(conPrefix + "匹配座位数后的规则列表", seatRuleList);
    // 8、匹配开场时间限制
    let timeRuleList = seatRuleList.filter(item => {
      let startTime = show_time.split(" ")[1];
      if (!item.ruleStartTime && !item.ruleEndTime) {
        return true;
      }
      if (item.ruleStartTime && item.ruleEndTime) {
        return (
          isTimeAfter(startTime, item.ruleStartTime + ":00") &&
          isTimeAfter(item.ruleEndTime + ":00", startTime)
        );
      }
      if (item.ruleStartTime) {
        return isTimeAfter(startTime, item.ruleStartTime + ":00");
      }
      if (item.ruleEndTime) {
        return isTimeAfter(item.ruleEndTime + ":00", startTime);
      }
    });
    console.log(conPrefix + "匹配开场时间后的规则列表", timeRuleList);
    // 9、匹配星期几
    let weekRuleList = timeRuleList.filter(item => {
      const weekdays = [
        "星期日",
        "星期一",
        "星期二",
        "星期三",
        "星期四",
        "星期五",
        "星期六"
      ];
      const today = new Date(show_time).getDay();
      const dayOfWeek = weekdays[today];
      if (item.weekDay?.length) {
        return item.ruleWeek.includes(dayOfWeek);
      }
      return true;
    });
    console.log(conPrefix + "匹配星期几后的规则列表", weekRuleList);
    // 10、匹配会员日
    let memberDayRuleList = weekRuleList.filter(item => {
      const day = show_time.split(" ")[0].split("-")[2];
      if (item.memberDay) {
        return Number(item.memberDay) === Number(day);
      }
      return true;
    });
    console.log(conPrefix + "匹配会员日后的规则列表", memberDayRuleList);
    // 获取报价最低的报价规则
    const endRule = await getMinAmountOfferRule(memberDayRuleList, order);
    console.warn(conPrefix + "最终匹配到的报价规则", endRule);
    if ([0, -2, -3, -4].includes(endRule)) return;
    if (!endRule) {
      console.error(conPrefix + "最终匹配到的报价规则不存在");
      setErrInfo("最终匹配到的报价规则不存在");
    }
    return endRule;
  } catch (error) {
    console.error(conPrefix + "报价规则匹配出现异常", error);
    setErrInfo("报价规则匹配出现异常", error);
  }
};
window.offerRuleMatchBySheng = offerRuleMatch;
// 获取报价最低的报价规则
const getMinAmountOfferRule = async (ruleList, order) => {
  try {
    // 1、有会员日报价规则命中优先使用会员日报价规则
    let onlyMemberDayRuleList = ruleList.filter(
      item => item.memberDay && item.offerType === "3" && item.offerAmount
    );
    // 报价从低到高排序
    onlyMemberDayRuleList.sort(
      (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
    );
    console.log(
      conPrefix + "命中会员日报价规则从小往大排序",
      onlyMemberDayRuleList
    );
    if (onlyMemberDayRuleList.length) {
      return onlyMemberDayRuleList[0];
    }
    // 2、比对那个利润更高，就用那个规则出
    let otherRuleList = ruleList.filter(
      item => !item.memberDay && item.offerType !== "3"
    );
    console.warn(conPrefix + "排除会员日后的其它规则", otherRuleList);
    // 日常固定报价规则
    let fixedAmountRuleList = otherRuleList.filter(
      item => item.offerType === "1" && item.offerAmount
    );
    let mixFixedAmountRule = fixedAmountRuleList.sort(
      (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
    )?.[0];
    // 会员价加价报价规则
    let addAmountRuleList = otherRuleList.filter(
      item => item.offerType === "2" && item.addAmount
    );
    let mixAddAmountRule = addAmountRuleList.sort(
      (itemA, itemB) => itemA.addAmount - itemB.addAmount
    )?.[0];
    if (mixAddAmountRule) {
      // 计算会员报价
      let memberPriceRes = await getMemberPrice(order);
      if (memberPriceRes === 0) {
        setErrInfo("获取当前场次电影信息失败,不再进行报价");
        return 0;
      }
      if (memberPriceRes === -2) {
        setErrInfo("促销票数低于订单票数，不再进行报价");
        return -2;
      }
      if (memberPriceRes === -3) {
        console.error(conPrefix + "获取座位布局异常，不再进行报价");
        return -3;
      }
      if (memberPriceRes === -4) {
        console.error(conPrefix + "促销票数低于订单票数，不再进行报价");
        return -4;
      }
      if (!memberPriceRes) {
        console.warn(
          conPrefix + "最小加价规则获取会员价失败,返回最小固定报价规则",
          mixFixedAmountRule
        );
        return mixFixedAmountRule;
      }
      let memberPrice = memberPriceRes.member_price;
      // 会员价
      mixAddAmountRule.memberPrice = memberPrice;
      mixAddAmountRule.real_member_price = memberPriceRes.real_member_price;
      // 会员最终报价
      memberPrice = Number(memberPrice) + Number(mixAddAmountRule.addAmount);
      // 会员报价要求四舍五入取整
      mixAddAmountRule.memberOfferAmount = memberPrice;
    } else {
      console.warn(
        conPrefix + "最小加价规则不存在,返回最小固定报价规则",
        mixFixedAmountRule
      );
      return mixFixedAmountRule;
    }
    if (!mixFixedAmountRule) {
      console.warn(
        conPrefix + "最小固定报价规则不存在,返回最小加价报价规则",
        mixAddAmountRule
      );
      return mixAddAmountRule;
    }
    return mixAddAmountRule.memberOfferAmount >=
      Number(mixFixedAmountRule.offerAmount)
      ? mixFixedAmountRule
      : mixAddAmountRule;
  } catch (error) {
    console.error(conPrefix + "获取最低报价规则异常", error);
    setErrInfo("获取最低报价规则异常", error);
  }
};
// 获取座位布局
const getSeatLayout = async data => {
  try {
    let { city_id, cinema_id, show_id, appName } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      width: "240"
    };
    console.log(conPrefix + "获取座位布局参数", params);
    const res = await SFC_API_OBJ[appName].getMoviePlaySeat(params);
    console.log(conPrefix + "获取座位布局返回", res);
    return res.data?.play_data || {};
  } catch (error) {
    console.error(conPrefix + "获取座位布局异常", error);
    setErrInfo("获取座位布局异常", error);
  }
};
// 获取会员价
const getMemberPrice = async order => {
  try {
    console.log(conPrefix + "准备获取会员价", order);
    const { city_name, cinema_name, hall_name, ticket_num, appName } = order;
    console.log(
      conPrefix +
        `待报价订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
    );
    // 获取当前场次电影信息
    let movieInfo = await getMovieInfo(order);
    console.log(conPrefix + `待报价订单当前场次电影相关信息`, movieInfo);
    if (!movieInfo) {
      console.error(conPrefix + "获取当前场次电影信息失败", "不再进行报价");
      return 0;
    }
    let { member_price, nonmember_price, city_id, cinema_id, show_id } =
      movieInfo;
    if (show_id) {
      const seatInfo = await getSeatLayout({
        city_id,
        cinema_id,
        show_id,
        appName
      });
      if (!seatInfo) return -3;
      const { promo_num, area_price } = seatInfo;
      if (promo_num && promo_num < ticket_num) {
        console.error(conPrefix + "促销票数低于订单票数，不再进行报价");
        return -2;
      }
      if (area_price?.length > 1) {
        let bigPrice = area_price.sort((a, b) => b.price - a.price)[0].price;
        console.error(
          conPrefix + "座位类型区分，取最高的价格座位会员价格",
          bigPrice
        );
        return {
          member_price: Number(bigPrice),
          real_member_price: Number(bigPrice)
        };
      }
    }
    console.log(conPrefix + "获取会员价", member_price);
    if (member_price > 0) {
      const cardRes = await svApi.queryCardList({
        app_name: appName
      });
      let list = cardRes.data.cardList || [];
      list = list.map(item => ({
        ...item,
        daily_usage:
          item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0
      }));
      // console.log("list", list);
      let cardList = list.filter(item =>
        !item.use_limit_day
          ? true
          : ticket_num <= item.use_limit_day - item.daily_usage
      );
      if (!cardList.length) {
        console.error(conPrefix + "影院单卡出票限制,不再进行报价");
        setErrInfo("影院单卡出票限制，不再进行报价", {
          list,
          ticket_num
        });
        return -4;
      }
      cardList = cardList.map(item => ({
        ...item,
        card_discount: !item.card_discount ? 100 : Number(item.card_discount)
      }));
      // console.log("cardList", cardList);
      cardList.sort((a, b) => a.card_discount - b.card_discount);
      // 按最低折扣取值报价
      let discount = cardList[0]?.card_discount;
      let real_member_price = Number(member_price);
      member_price = discount
        ? (Number(member_price) * discount) / 100
        : Number(member_price);
      return {
        real_member_price,
        member_price
      };
    } else {
      console.warn(conPrefix + "会员价未负，非会员价", nonmember_price);
      if (nonmember_price) {
        return {
          member_price: Number(nonmember_price),
          real_member_price: Number(nonmember_price)
        };
      }
    }
  } catch (error) {
    console.error(conPrefix + "获取会员价异常", error);
    setErrInfo("获取会员价异常", error);
  }
};

// 影院名称匹配（匹配报价规则时使用）
const cinemaMatchHandle = (cinema_name, list, appName) => {
  try {
    // 1、全字匹配
    let isHasMatch = list.some(item => item === cinema_name);
    if (isHasMatch) {
      return true;
    }
    console.warn(conPrefix + "全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinemNameSpecial(cinema_name);
    // 2、特殊匹配
    let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appName].find(
      item => item.order_cinema_name === cinemaName
    );
    if (specialCinemaInfo) {
      cinemaName = specialCinemaInfo.sfc_cinema_name;
    } else {
      console.warn(
        conPrefix + "特殊匹配影院名称失败",
        cinemaName,
        SPECIAL_CINEMA_OBJ[appName]
      );
    }
    // 3、去掉空格及换行符后全字匹配
    const noSpaceList = list.map(item => cinemNameSpecial(item));
    isHasMatch = noSpaceList.some(item => item === cinemaName);
    if (isHasMatch) {
      return true;
    }
    console.error(
      conPrefix + "去掉空格及换行符后全字匹配影院名称失败",
      noSpaceList,
      cinemaName
    );
    // setErrInfo("影院名称匹配-去掉空格及换行符后全字匹配影院名称失败");
    // 3、模糊匹配
    // let targetCinemaName = findBestMatchByLevenshteinWithThreshold(list, cinema_name, 8)
    // console.log('targetCinemaName', targetCinemaName)
    // if (targetCinemaName) {
    //     return true
    // }
    // console.error('【自动报价规则匹配】模糊匹配影院名称失败', list, cinema_name, 8)
  } catch (error) {
    console.error(conPrefix + "影院名称匹配异常", error);
    setErrInfo("影院名称匹配异常", error);
  }
};

// 根据订单name获取影院id
const getCinemaId = (cinema_name, list, appName) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let cinema_id = list.find(item => item.name === cinema_name)?.id;
    if (cinema_id) {
      return cinema_id;
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn(conPrefix + "全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinemNameSpecial(cinema_name);
    let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appName].find(
      item => item.order_cinema_name === cinemaName
    );
    if (specialCinemaInfo) {
      cinemaName = specialCinemaInfo.sfc_cinema_name;
    } else {
      console.warn(
        conPrefix + "特殊匹配影院名称失败",
        cinemaName,
        SPECIAL_CINEMA_OBJ[appName]
      );
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
    setErrInfo("根据订单name获取影院id失败-去掉空格及换行符后全字匹配失败");

    // // 3、不满足条件就走模糊匹配（模糊匹配不正确的就放到特殊匹配里面）
    // let cinemaNameList = list.map(item => item.name)
    // console.warn('【自动报价】模糊匹配影院名称', cinema_name, cinemaNameList)
    // let targetCinemaName = findBestMatchByLevenshteinWithThreshold(cinemaNameList, cinema_name, 8)
    // if (!targetCinemaName) {
    //     console.error('模糊匹配影院名称失败', cinemaNameList, cinema_name, 8)
    //     return
    // }
    // cinema_id = list.find((item) => item.name === targetCinemaName)?.id
    // if (!cinema_id) {
    //     console.error('【自动报价】模糊匹配影院名称失败', cinema_name, list)
    // }
    // return cinema_id
  } catch (error) {
    console.error(conPrefix + "根据订单name获取影院id失败", error);
    setErrInfo("根据订单name获取影院id失败", error);
  }
};

// 获取电影信息
const getMovieInfo = async item => {
  try {
    // 1、获取影院列表拿到影院id
    const {
      city_name,
      cinema_name,
      film_name,
      show_time,
      cinema_group,
      appName
    } = item;
    await getCityList({ appName });
    let city_id = cityList.value.find(
      item => item.name.indexOf(city_name) !== -1
    )?.id;
    let params = {
      city_id: city_id
    };
    console.log(conPrefix + "获取城市影院参数", params);
    let res = await SFC_API_OBJ[appName].getCinemaList(params);
    console.log(conPrefix + "获取城市影院返回", res);
    let cinemaList = res.data?.cinema_data || [];
    let cinema_id = getCinemaId(cinema_name, cinemaList, appName);
    if (!cinema_id) {
      console.error(conPrefix + "获取目标影院失败");
      return;
    }
    // 2、获取影院放映信息拿到会员价
    const moviePlayInfo = await getMoviePlayInfo({
      city_id,
      cinema_id,
      cinema_group,
      cinema_name,
      city_name,
      appName
    });
    // 3、匹配订单拿到会员价
    const { movie_data } = moviePlayInfo;
    let movieInfo = movie_data.find(
      item =>
        convertFullwidthToHalfwidth(item.movie_name) ===
        convertFullwidthToHalfwidth(film_name)
    );
    console.log("movieInfo", movieInfo, film_name);
    if (movieInfo) {
      let { shows } = movieInfo;
      let showDay = show_time.split(" ")[0];
      let showList = shows[showDay] || [];
      let showTime = show_time.split(" ")[1].slice(0, 5);
      let ticketInfo = showList.find(item => item.start_time === showTime);
      return { ...ticketInfo, city_id, cinema_id };
    }
  } catch (error) {
    console.error(conPrefix + "获取当前场次电影信息异常", error);
    setErrInfo("获取当前场次电影信息异常", error);
  }
};

// 获取城市列表
async function getCityList({ appName }) {
  try {
    let params = {};
    console.log(conPrefix + "获取城市列表参数", params);
    let res = await SFC_API_OBJ[appName].getCityList(params);
    console.log(conPrefix + "获取城市列表返回", res);
    cityList.value = res.data.all_city || [];
  } catch (error) {
    console.error(conPrefix + "获取城市列表异常", error);
    setErrInfo("获取城市列表异常", error);
  }
}

export default offerQueue;
