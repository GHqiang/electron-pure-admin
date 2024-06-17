import { ref, computed } from "vue";
import {
  isTimeAfter,
  getCinemaFlag,
  convertFullwidthToHalfwidth
} from "@/utils/utils";
import { SPECIAL_CINEMA_OBJ } from "@/common/constant";
import svApi from "@/api/sv-api";
import { SFC_API_OBJ } from "@/common/index.js";

import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
const platTableDataStore = usePlatTableDataStore();
// 平台自动报价规则列表
const platOfferRuleList = computed(() =>
  platTableDataStore.items.filter(item => item.platName === "lieren")
);

// app报价规则列表
import { useDataTableStore } from "@/store/offerRule";
const dataTableStore = useDataTableStore();

// 使用computed确保items响应式
const appOfferRuleList = computed(() =>
  dataTableStore.items.filter(item => item.orderForm === "lieren")
);

let conPrefix = "【猎人自动报价】——"; // console打印前缀
const getOrginValue = value => JSON.parse(JSON.stringify(value));

console.log(conPrefix + "队列执行规则", getOrginValue(platOfferRuleList.value));
console.log(conPrefix + "自动报价规则", getOrginValue(appOfferRuleList.value));

const cityList = ref([]); // 城市列表

// 创建一个订单自动报价队列类
class OrderAutoOfferQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start(platToken) {
    tokens.setLierenPlatToken(platToken);
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
      let orders = await this.fetchOrders(fetchDelay);
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
          await this.addOrderHandleRecored(order, offerResult);
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
      if (!stayList?.length) return [];
      let sfcStayOfferlist = stayList
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
        const offerResult = await singleOffer(order);
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
        plat_name: "lieren",
        app_name: offerResult?.offerRule?.shadowLineName || "",
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
        quan_value: offerResult?.offerRule?.quanValue,
        order_status: offerResult?.res ? "1" : "2",
        // remark: '',
        processing_time: +new Date() + "",
        urgent: order.urgent // 是否是特急订单 1是 0否（特急有奖励）
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
      svApi
        .addOfferRecord(serOrderInfo)
        .then(res => {
          console.log(conPrefix + "【报价成功】保存订单处理记录成功", res);
        })
        .catch(error => {
          console.error("conPrefix + 【报价成功】保存订单处理记录失败", error);
        });
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

// 获取报价记录
const getOfferList = async () => {
  try {
    const res = await svApi.queryOfferList({
      user_id: tokens.userInfo.user_id,
      plat_name: "lieren"
    });
    return res.data.offerList || [];
  } catch (error) {
    console.error(conPrefix + "获取猎人历史报价记录异常", error);
    return [];
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
  }
};
// 获取待报价订单列表
async function getStayOfferList() {
  try {
    let params = {
      page: 1,
      limit: 100,
      sort: "id",
      desc: "desc",
      type: 0
    };
    console.log(conPrefix + "获取待报价订单列表参数", params);
    const res = await lierenApi.stayTicketingList(params);
    // let mockRes = {
    //   success: true,
    //   code: 1,
    //   message: "成功！",
    //   total: 1,
    //   data: [
    //     {
    //       id: 6129818,
    //       tpp_price: "73.00",
    //       supplier_max_price: 68,
    //       city_name: "上海",
    //       cinema_addr: "浦东新区张杨路501号10楼",
    //       ticket_num: 1,
    //       cinema_name: "SFC上影百联影城（八佰伴IMAX店）",
    //       hall_name: "3号厅",
    //       film_name: "哈尔的移动城堡",
    //       film_img:
    //         "https://gw.alicdn.com/tfscom/i2/O1CN01fKrbRb1dWnpE5V54I_!!6000000003744-0-alipicbeacon.jpg",
    //       show_time: "2024-06-06 21:50:00",
    //       section_at: 1717075740,
    //       seat_flat: 0,
    //       urgent: 0,
    //       is_multi: 0,
    //       seat_type: 0,
    //       offer: null,
    //       rewards: 1,
    //       overdue: 0,
    //       cinema_group: "上影上海",
    //       cinema_code: "31124201",
    //       group_urgent: 1,
    //       order_number: "2024053021282879718",
    //       sytime: 1717075788
    //     }
    //   ],
    //   time: 1710125678
    // };
    // let list = mockRes?.data || [];
    let list = res?.data || [];
    console.log(conPrefix + "获取待报价列表返回", list);
    return list;
  } catch (error) {
    console.error(conPrefix + "获取待报价列表异常", error);
    return [];
  }
}

// 单个订单报价
async function singleOffer(item) {
  let offerRule;
  try {
    console.log(conPrefix + "待报价订单", item);
    let { id, supplier_max_price } = item || {};
    if (!id) return;
    // 报价逻辑
    console.log(conPrefix + "准备匹配报价规则", item);
    offerRule = await offerRuleMatch(item);
    if (!offerRule) {
      console.error(conPrefix + "获取匹配报价规则失败");
      return;
    }
    const { offerAmount, memberOfferAmount } = offerRule;
    const price = offerAmount || memberOfferAmount;
    if (!price) return { offerRule };
    if (Number(supplier_max_price) < price) {
      console.error(conPrefix + "当前报价超过供应商最高报价，不再进行报价");
      return { offerRule };
    }

    let params = {
      id: id,
      price
    };
    console.log(conPrefix + "订单报价参数", params);
    const res = await lierenApi.submitOffer(params);
    console.log(conPrefix + "订单报价返回", res);
    return { res, offerRule };
  } catch (error) {
    console.error(conPrefix + "订单报价异常", error);
    return { offerRule };
  }
}

// 获取电影放映信息
async function getMoviePlayInfo(data) {
  try {
    let { city_id, cinema_id, cinema_group, cinema_name, city_name } =
      data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log(conPrefix + "获取电影放映信息参数", params);
    const appName = getCinemaFlag({ cinema_group, cinema_name, city_name });
    console.log(conPrefix + "影线名称", appName);
    let res = await SFC_API_OBJ[appName].getMoviePlayInfo(params);
    console.log(conPrefix + "获取电影放映信息返回", res);
    return res.data;
  } catch (error) {
    console.error(conPrefix + "获取电影放映信息异常", error);
  }
}

// 报价规则匹配
const offerRuleMatch = async order => {
  try {
    console.warn(conPrefix + "匹配报价规则开始");
    const {
      cinema_group,
      city_name,
      cinema_name,
      hall_name,
      film_name,
      show_time,
      ticket_num
    } = order;
    let shadowLineName = getCinemaFlag({
      cinema_group,
      cinema_name,
      city_name
    });

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
    if (!endRule) {
      console.error(conPrefix + "最终匹配到的报价规则不存在");
    }
    return endRule;
  } catch (error) {
    console.error(conPrefix + "报价规则匹配出现异常", error);
  }
};

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
      let memberPrice = await getMemberPrice(order);
      if (!memberPrice) {
        console.warn(
          conPrefix + "最小加价规则获取会员价失败,返回最小固定报价规则",
          mixFixedAmountRule
        );
        return mixFixedAmountRule;
      }
      // 会员最终报价
      memberPrice = Number(memberPrice) + Number(mixAddAmountRule.addAmount);
      // 会员报价要求四舍五入取整
      mixAddAmountRule.memberOfferAmount = Math.round(memberPrice);
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
  }
};

// 获取会员价
const getMemberPrice = async order => {
  try {
    console.log(conPrefix + "准备获取会员价", order);
    const { city_name, cinema_name, hall_name } = order;
    console.log(
      conPrefix +
        `待报价订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
    );
    // 获取当前场次电影信息
    let movieInfo = await getMovieInfo(order);
    console.log(conPrefix + `待报价订单当前场次电影相关信息`, movieInfo);
    if (!movieInfo) {
      console.error(conPrefix + "获取当前场次电影信息失败", "不再进行报价");
      return;
    }
    let { member_price } = movieInfo;
    console.log(conPrefix + "获取会员价", member_price);
    if (member_price) {
      return Number(member_price);
    }
  } catch (error) {
    console.error(conPrefix + "获取会员价异常", error);
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
    let cinemaName = cinema_name
      .replace(/[\(\)\（\）]/g, "")
      .replace(/\s*/g, "");
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
    const noSpaceList = list.map(item =>
      item.replace(/[\(\)\（\）]/g, "").replace(/\s*/g, "")
    );
    isHasMatch = noSpaceList.some(item => item === cinemaName);
    if (isHasMatch) {
      return true;
    }
    console.error(
      conPrefix + "去掉空格及换行符后全字匹配影院名称失败",
      noSpaceList,
      cinemaName
    );
    // 3、模糊匹配
    // let targetCinemaName = findBestMatchByLevenshteinWithThreshold(list, cinema_name, 8)
    // console.log('targetCinemaName', targetCinemaName)
    // if (targetCinemaName) {
    //     return true
    // }
    // console.error('【自动报价规则匹配】模糊匹配影院名称失败', list, cinema_name, 8)
  } catch (error) {
    console.error(conPrefix + "影院名称匹配异常", error);
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
    let cinemaName = cinema_name
      .replace(/[\(\)\（\）]/g, "")
      .replace(/\s*/g, "");
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
        name: item.name.replace(/[\(\)\（\）]/g, "").replace(/\s*/g, "")
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
  }
};

// 获取电影信息
const getMovieInfo = async item => {
  try {
    // 1、获取影院列表拿到影院id
    const { city_name, cinema_name, film_name, show_time, cinema_group } = item;
    await getCityList({ cinema_group, cinema_name, city_name });
    let city_id = cityList.value.find(
      item => item.name.indexOf(city_name) !== -1
    )?.id;
    let params = {
      city_id: city_id
    };
    console.log(conPrefix + "获取城市影院参数", params);
    const appName = getCinemaFlag({ cinema_group, cinema_name, city_name });
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
      city_name
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
      return ticketInfo;
    }
  } catch (error) {
    console.error(conPrefix + "获取当前场次电影信息异常", error);
  }
};

// 获取城市列表
async function getCityList({ cinema_group, cinema_name, city_name }) {
  try {
    let params = {};
    console.log(conPrefix + "获取城市列表参数", params);
    const appName = getCinemaFlag({ cinema_group, cinema_name, city_name });
    let res = await SFC_API_OBJ[appName].getCityList(params);
    console.log(conPrefix + "获取城市列表返回", res);
    cityList.value = res.data.all_city || [];
  } catch (error) {
    console.error(conPrefix + "获取城市列表异常", error);
  }
}

export default offerQueue;
