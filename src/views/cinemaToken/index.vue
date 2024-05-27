<template>
  <div class="about">
    <el-form label-position="left" class="settings-form">
      <el-row>
        <el-col :span="7">
          <el-form-item label="报价间隔">
            <el-input
              v-model="offerIntervalTime"
              type="number"
              placeholder="请输入自动报价间隔"
            >
              <template #append> 单位：秒 </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="7" :offset="1">
          <el-form-item label="出票间隔">
            <el-input
              v-model="ticketIntervalTime"
              type="number"
              placeholder="请输入自动出票间隔"
            >
              <template #append> 单位：秒 </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8" :offset="1">
          <el-form-item label="猎人Toekn">
            <el-input
              v-model="token"
              placeholder="请输入猎人票务平台Toekn"
              clearable
            >
              <template #append v-if="token">
                <el-button @click="setPlatToken" v-throttle
                  >设置猎人token</el-button
                >
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item>
        <el-button type="primary" @click="startAutoOffer" v-throttle
          >启动自动报价</el-button
        >
        <el-button type="primary" @click="stopAutoOffer" v-throttle
          >停止报价</el-button
        >

        <el-button type="primary" @click="startAutoTicket" v-throttle
          >启动自动出票</el-button
        >
        <el-button type="primary" @click="stopAutoTicket" v-throttle
          >停止出票</el-button
        >
        <el-button type="primary" @click="exportOrderRecord" v-throttle
          >导出出票记录</el-button
        >
        <el-button type="primary" @click="getStayTicketingList" v-throttle
          >获取待出票列表</el-button
        >
        <el-button type="primary" @click="logout">退出登录</el-button>
      </el-form-item>
    </el-form>
    <el-divider content-position="left">出票记录</el-divider>
    <!-- <RuleTable></RuleTable> -->
  </div>
</template>

<script setup>
import { ref, onMounted, computed, toRaw } from "vue";
import { ElMessage } from "element-plus";
import {
  getCurrentFormattedDateTime,
  exportExcel,
  getFormattedDateTime,
  findBestMatchByLevenshtein,
  findBestMatchByLevenshteinWithThreshold
} from "@/utils/utils";
// import RuleTable from '@/components/RuleTable.vue'
import sfcApi from "@/api/sfc-api";
import lierenApi from "@/api/lieren-api";
import idbApi from "@/api/idbApi";
import { userStore } from "@/store/counter";
import { useDataTableStore } from "@/store/offerRule";
import { decode, encode } from "@/utils/sfc-member-password";
const user = userStore();
import { useRouter } from "vue-router";
const router = useRouter();
const dataTableStore = useDataTableStore();
dataTableStore.fetchItemsFromLocalStorage();
// 使用computed确保items响应式
const tableData = computed(() => dataTableStore.items);

const cityList = ref([]); // 城市列表

const token = ref(""); // 猎人平台票务token
const isSetPlatToken = ref(false); // 是否设置token

// 特殊的名字匹配集合
let specialCinemaNameMatchList = [
  // 无锡
  {
    order_cinema_name: "SFC上影影城东港店原红豆影城",
    sfc_cinema_name: "SFC上影影城无锡东港店"
  },
  // 湛江
  {
    order_cinema_name: "SFC上影影城万象金沙湾广场店",
    sfc_cinema_name: "SFC上影影城湛江店"
  },
  // 北京
  {
    order_cinema_name: "SFC上影影城房山绿地缤纷店",
    sfc_cinema_name: "SFC上影影城北京房山店"
  }
];

// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};

// 特殊厅列表
let specialHallList = [
  "vip",
  "4D",
  "IMAX",
  "巨幕",
  "Onyx LED",
  "Atmos",
  "4DX",
  "LUXE",
  "Cinema",
  "LED",
  "杜比",
  "元宇宙"
];

let platToken = window.localStorage.getItem("platToken");
if (platToken) {
  platToken = JSON.parse(platToken);
  token.value = platToken;
  user.setPlatToken(token.value);
  isSetPlatToken.value = true;
}

const offerIntervalTime = ref(2); // 自动报价间隔，单位：秒
const ticketIntervalTime = ref(3); // 自动出票间隔，单位：秒

// 延时执行
function delayHandle(time) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

// 导出订单记录
const exportOrderRecord = async () => {
  try {
    // 1、获取订单记录
    const records = await idbApi.getAllOrderRecords();
    // 2、设置表头
    const columns = [
      { header: "订单号", key: "orderNumber", width: 20 },
      { header: "影院", key: "cinema_name", width: 20 },
      { header: "片名", key: "film_name", width: 20 },
      { header: "影厅", key: "hall_name", width: 20 },
      { header: "票数", key: "ticket_num", width: 10 },
      { header: "票价", key: "tpp_price", width: 10 },
      { header: "中标价格", key: "supplier_end_price", width: 10 },
      { header: "出票状态", key: "orderStatus", width: 10 },
      { header: "出票时间", key: "processingTime", width: 20 },
      { header: "出票码", key: "qrcode", width: 20 },
      { header: "出票利润", key: "profit", width: 20 },
      { header: "优惠券号", key: "quan_code", width: 20 },
      { header: "会员卡号", key: "card_id", width: 20 },
      { header: "报价类型", key: "offerType", width: 20 },
      { header: "用券面额", key: "quanValue", width: 20 },
      { header: "出票规则", key: "offerRuleName", width: 20 }
    ];
    // 3、设置内容
    const data = records.map(item => {
      return {
        orderNumber: item.orderNumber,
        cinema_name: item.cinema_name,
        film_name: item.film_name,
        hall_name: item.hall_name,
        ticket_num: item.ticket_num,
        tpp_price: item.tpp_price,
        supplier_end_price: item.supplier_end_price,
        orderStatus: item.orderStatus === "1" ? "成功" : "失败",
        processingTime: getFormattedDateTime(item.processingTime),
        qrcode: item.qrcode,
        profit: item.profit,
        quan_code: item.quan_code,
        card_id: item.card_id,
        offerType: offerTypeObj[item.offerType],
        quanValue: item.quanValue,
        offerRuleName: item.offerRuleName
      };
    });
    // 4、执行导出
    await exportExcel(columns, data);
  } catch (error) {
    console.error("导出订单记录异常", error);
  }
};

// 创建一个订单自动报价队列类
class OrderAutoOfferQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start(fetchDelay, processDelay) {
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    console.warn(
      `【自动报价】队列启动, ${fetchDelay / 1000} 秒获取一次待报价订单, ${processDelay / 1000} 秒处理一次订单}`
    );
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      let orders = await this.fetchOrders(fetchDelay);
      const { handleSuccessOrderList, handleFailOrderList } = this;
      const orderOfferRecord = [
        ...handleSuccessOrderList,
        ...handleFailOrderList
      ];
      // console.warn('本次报价记录', orderOfferRecord)
      let newOrders = orders.filter(item => {
        // 过滤出来新订单（未进行过报价的）
        return !orderOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      console.warn("【自动报价】新的待报价订单列表", newOrders);
      // 将订单加入队列
      this.enqueue(newOrders);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        const order = this.dequeue(); // 取出队列首部订单并从队列里去掉
        if (order) {
          // 处理订单
          const offerResult = await this.orderHandle(order, processDelay);
          // 添加订单处理记录
          await this.addOrderHandleRecored(order, offerResult);
          console.warn(
            `【自动报价】单个订单自动报价${offerResult?.res ? "成功" : "失败"}`,
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
      }, delayTime);
    });
  }

  // 获取订单
  async fetchOrders(fetchDelay) {
    try {
      await this.delay(fetchDelay);
      const stayList = await getStayOfferList();
      let sfcStayOfferlist = stayList.filter(item =>
        ["上影上海", "上影二线"].includes(item.cinema_group)
      );
      return sfcStayOfferlist;
    } catch (error) {
      console.error("【自动报价】获取待报价订单列表异常", error);
      return [];
    }
  }

  // 将订单添加至队列
  enqueue(orders) {
    if (orders.length) {
      console.log("【自动报价】添加新订单到队列");
      this.queue.push(...orders);
    } else {
      console.log("【自动报价】从报价记录过滤后，无新订单添加到队列");
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
      console.log(`【自动报价】订单处理 ${order.id}`);
      if (this.isRunning) {
        const offerResult = await singleOffer(order);
        // { res, offerRule }
        return offerResult;
      } else {
        console.warn("【自动报价】订单报价队列已停止");
      }
    } catch (error) {
      console.error("【自动报价】订单执行报价异常", error);
    }
  }

  // 添加订单处理记录
  async addOrderHandleRecored(order, offerResult) {
    try {
      // 数据库存储
      const orderInfo = {
        ...order,
        orderNumber: order.order_number,
        processingTime: +new Date(),
        orderStatus: offerResult?.res ? "1" : "2",
        offerRuleId: offerResult?.offerRule?.id,
        offerRuleName: offerResult?.offerRule?.ruleName,
        offerType: offerResult?.offerRule?.offerType,
        offerAmount: offerResult?.offerRule?.offerAmount,
        memberOfferAmount: offerResult?.offerRule?.memberOfferAmount,
        quanValue: offerResult?.offerRule?.quanValue
      };
      if (offerResult?.res) {
        this.handleSuccessOrderList.push(orderInfo);
        idbApi
          .insertOrUpdateData(orderInfo, 1)
          .then(res => {
            console.log("【自动报价】【报价成功】保存订单处理记录成功", res);
          })
          .catch(error => {
            console.error(
              "【自动报价】【报价成功】保存订单处理记录失败",
              error
            );
          });
      } else {
        this.handleFailOrderList.push(orderInfo);
        idbApi
          .insertOrUpdateData(orderInfo, 1)
          .then(res => {
            console.log("【自动报价】【报价失败】保存订单处理记录成功", res);
          })
          .catch(error => {
            console.error(
              "【自动报价】【报价失败】保存订单处理记录失败",
              error
            );
          });
      }
    } catch (error) {
      console.error("【自动报价】添加订单处理记录异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    console.warn("【自动报价】主动停止订单自动报价队列");
    // 打印处理结果
    const { handleSuccessOrderList, handleFailOrderList } = this;
    console.warn(
      `【自动报价】订单处理记录：成功 ${handleSuccessOrderList.length} 个，失败 ${handleFailOrderList.length} 个`
    );
    console.warn(
      "【自动报价】订单处理记录：成功-",
      handleSuccessOrderList,
      " 失败-",
      handleFailOrderList
    );
  }
}
// 报价队列实例
const offerQueue = new OrderAutoOfferQueue();

// 创建一个订单自动出票队列类
class OrderAutoTicketQueue {
  constructor() {
    this.queue = []; // 初始化空队列
    this.isRunning = false; // 初始化时队列未运行
    this.handleSuccessOrderList = []; // 订单处理成功列表
    this.handleFailOrderList = []; // 订单处理失败列表
  }

  // 启动队列（fetchDelay获取订单列表间隔，processDelay处理订单间隔）
  async start(fetchDelay, processDelay) {
    // 设置队列为运行状态
    this.isRunning = true;
    this.handleSuccessOrderList = [];
    this.handleFailOrderList = [];
    // 由于及时队列停了 this.enqueue方法仍可能运行一次，故在每次启动重置队列
    this.queue = [];
    console.warn(
      `【自动出票】队列启动, ${fetchDelay / 1000} 秒获取一次待出票订单, ${processDelay / 1000} 秒处理一次订单}`
    );
    // 循环直到队列停止
    while (this.isRunning) {
      // 获取订单列表(支持时间间隔)
      let orders = await this.fetchOrders(fetchDelay);
      const { handleSuccessOrderList, handleFailOrderList } = this;
      const orderOfferRecord = [
        ...handleSuccessOrderList,
        ...handleFailOrderList
      ];
      // console.warn('本次出票记录', orderOfferRecord)
      let newOrders = orders.filter(item => {
        // 过滤出来新订单（未进行过出票的）
        return !orderOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      console.warn("新的待出票订单列表", newOrders);
      let allOfferRecord = await idbApi.getAllOrderRecords(1);
      allOfferRecord = allOfferRecord || [];
      allOfferRecord = allOfferRecord.filter(item => item.orderStatus === "1");
      console.warn("机器历史报价记录", allOfferRecord);
      let orderList = newOrders.filter(item => {
        // 过滤出来机器自己报价过的订单
        return allOfferRecord.some(
          itemA => itemA.order_number === item.order_number
        );
      });
      console.warn("从历史报价记录过滤后的待出票订单", orderList);
      // 将订单加入队列
      this.enqueue(orderList);

      // 处理队列中的订单，直到队列为空或停止
      while (this.queue.length > 0 && this.isRunning) {
        // 取出队列首部订单并从队列里去掉
        const order = this.dequeue();
        if (order) {
          // 处理订单
          const res = await this.orderHandle(order, processDelay);
          // res: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
          console.warn(
            `【自动出票】单个订单自动出票${res ? "成功" : "失败"}`,
            order
          );
          // 添加订单处理记录
          await this.addOrderHandleRecored(order, res);
        }
      }
    }
  }

  // 模拟延时
  delay(delayTime) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, delayTime);
    });
  }

  // 获取订单
  async fetchOrders(fetchDelay) {
    try {
      await this.delay(fetchDelay);
      const stayList = await getStayTicketingList();
      let sfcStayOfferlist = stayList.filter(item =>
        ["上影上海", "上影二线"].includes(item.cinema_group)
      );
      return sfcStayOfferlist;
    } catch (error) {
      console.error("【自动出票】获取待出票订单列表异常", error);
      return [];
    }
  }

  // 将订单添加至队列
  enqueue(orders) {
    if (orders.length) {
      console.log("【自动出票】添加新订单到队列");
      this.queue.push(...orders);
    } else {
      console.log("【自动出票】从出票记录过滤后，无新订单添加到队列");
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
      console.log(`【自动出票】订单处理 ${order.id}`);
      if (this.isRunning) {
        const res = await singleTicket(order);
        // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule }
        return res;
      } else {
        console.warn("【自动出票】订单出票队列已停止");
      }
    } catch (error) {
      console.error("【自动出票】订单执行出票异常", error);
    }
  }

  // 添加订单处理记录
  async addOrderHandleRecored(order, res) {
    try {
      // res：{ profit, submitRes, qrcode, quan_code, card_id, offerRule }
      // 数据库存储
      const orderInfo = {
        ...order,
        orderNumber: order.order_number,
        processingTime: +new Date(),
        orderStatus: res ? "1" : "2",
        profit: res?.profit || undefined,
        qrcode: res?.qrcode || "",
        quan_code: res?.quan_code || "",
        card_id: res?.card_id || "",
        offerRule: res?.offerRule || "",
        offerRuleName: res?.offerRule?.ruleName || "",
        offerType: res?.offerRule?.offerType || "",
        quanValue: res?.offerRule?.quanValue || ""
      };
      if (res) {
        this.handleSuccessOrderList.push(order);
        idbApi
          .insertOrUpdateData(orderInfo)
          .then(res => {
            console.log("【自动出票】【出票成功】保存订单处理记录成功", res);
          })
          .catch(error => {
            console.error(
              "【自动出票】【出票成功】保存订单处理记录失败",
              error
            );
          });
      } else {
        this.handleFailOrderList.push(order);
        idbApi
          .insertOrUpdateData(orderInfo)
          .then(res => {
            console.log("【自动出票】【出票失败】保存订单处理记录成功", res);
          })
          .catch(error => {
            console.error(
              "【自动出票】【出票失败】保存订单处理记录失败",
              error
            );
          });
      }
    } catch (error) {
      console.error("【自动出票】添加订单处理记录异常", error);
    }
  }

  // 停止队列运行
  stop() {
    this.isRunning = false;
    console.warn("【自动出票】主动停止订单自动出票队列");
    // 打印处理结果
    const { handleSuccessOrderList, handleFailOrderList } = this;
    console.warn(
      `【自动出票】订单处理记录：成功 ${handleSuccessOrderList.length} 个，失败 ${handleFailOrderList.length} 个`
    );
    console.warn(
      "【自动出票】订单处理记录：成功-",
      handleSuccessOrderList,
      " 失败-",
      handleFailOrderList
    );
  }
}
// 出票队列实例
const ticketQueue = new OrderAutoTicketQueue();

// 转单
const transferOrder = async (order, unlockSeatInfo) => {
  try {
    // 先解锁座位再转单，负责转出去座位被占平台会处罚
    // 3、获取座位布局
    if (unlockSeatInfo) {
      const { city_id, cinema_id, show_id, start_day, start_time } =
        unlockSeatInfo;
      const seatList = await getSeatLayout({
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
      console.warn("转单时释放座位传参", lockParams);
      await lockSeat(lockParams); // 锁定座位
    }
    const params = {
      id: order.id,
      confirm: 1
    };
    console.warn("【转单】参数", params);
    const res = await lierenApi.transferOrder(params);
    console.warn("【转单】结果", res);
  } catch (error) {
    console.error("【转单】异常", error);
  }
};

// 设置猎人票务平台token
const setPlatToken = () => {
  if (token.value) {
    user.setPlatToken(token.value);
    isSetPlatToken.value = true;
  }
};

// 启动自动报价
const startAutoOffer = async () => {
  try {
    if (!token.value || !isSetPlatToken.value) {
      ElMessage.warning("请先设置猎人票务平台token");
      console.warn("【设置token】——请先设置猎人票务平台token");
      return;
    }
    if (offerQueue.isRunning) {
      ElMessage.warning("自动报价正在执行中");
      console.warn("【自动报价】——自动报价正在执行中");
      return;
    }
    offerQueue.start((offerIntervalTime.value || 2) * 1000, 1000);
  } catch (error) {
    console.error("启动自动报价异常", error);
  }
};

// 启动自动出票
const startAutoTicket = async () => {
  try {
    if (!token.value || !isSetPlatToken.value) {
      ElMessage.warning("请先设置猎人票务平台token");
      console.warn("【设置token】——请先设置猎人票务平台token");
      return;
    }
    if (ticketQueue.isRunning) {
      ElMessage.warning("自动出票正在执行中");
      console.warn("【自动出票】——自动报价正在执行中");
      return;
    }
    ticketQueue.start((ticketIntervalTime.value || 2) * 1000, 1000);
  } catch (error) {
    console.error("启动自动出票异常", error);
  }
};

// 停止自动报价
const stopAutoOffer = () => {
  console.warn("【手动停止】-自动报价");
  offerQueue.stop();
};

// 停止自动出票
const stopAutoTicket = () => {
  console.warn("【手动停止】-自动出票");
  ticketQueue.stop();
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
    console.log("【自动报价】获取待报价订单列表参数", params);
    const res = await lierenApi.stayTicketingList(params);
    // let mockRes = {
    //     "success": true,
    //     "code": 1,
    //     "message": "成功！",
    //     "total": 1,
    //     "data": [
    //         {
    //             id: 5477690,
    //             supplier_id: 714632,
    //             order_number: '2024030616314142092',
    //             tpp_price: '49.00',
    //             ticket_num: 2,
    //             city_name: '上海',
    //             film_img:
    //                 'https://gw.alicdn.com/tfscom/i3/O1CN01JfQQxY1xDNJakaXHZ_!!6000000006409-0-alipicbeacon.jpg',
    //             cinema_addr: '徐汇区漕宝路33号四层l4',
    //             cinema_name: '八佰伴',
    //             hall_name: '2号激光厅',
    //             film_name: '黄雀在后！',
    //             show_time: '2024-04-17 22:10:00',
    //             section_at: 1709713967,
    //             winning_at: 1709714014,
    //             lock_if: 0,
    //             lockseat: '3排8座 3排9座',
    //             seat_flat: 0,
    //             urgent: 0,
    //             is_multi: 0,
    //             seat_type: 0,
    //             cinema_code: '31074801',
    //             supplier_end_price: 39.5,
    //             rewards: 0,
    //             overdue: 0,
    //             cinema_group: '上影上海',
    //             type: 1,
    //             group_urgent: 0,
    //             sytime: 1709714704
    //         },
    //         {
    //             id: 5477691,
    //             supplier_id: 714632,
    //             order_number: '2024030616314142093',
    //             tpp_price: '49.00',
    //             ticket_num: 2,
    //             city_name: '上海',
    //             film_img:
    //                 'https://gw.alicdn.com/tfscom/i3/O1CN01JfQQxY1xDNJakaXHZ_!!6000000006409-0-alipicbeacon.jpg',
    //             cinema_addr: '徐汇区漕宝路33号四层l4',
    //             cinema_name: '八佰伴',
    //             hall_name: '2号激光厅',
    //             film_name: '黄雀在后！',
    //             show_time: '2024-04-15 22:30:00',
    //             section_at: 1709713967,
    //             winning_at: 1709714014,
    //             lock_if: 0,
    //             lockseat: '3排2座 3排3座',
    //             seat_flat: 0,
    //             urgent: 0,
    //             is_multi: 0,
    //             seat_type: 0,
    //             cinema_code: '31074801',
    //             supplier_end_price: 39.5,
    //             rewards: 0,
    //             overdue: 0,
    //             cinema_group: '上影上海',
    //             type: 1,
    //             group_urgent: 0,
    //             sytime: 1709714704
    //         }
    //     ],
    //     "time": 1710125670
    // }
    // let list = res?.data || mockRes?.data || []
    let list = res?.data || [];
    console.log("【自动报价】获取待报价列表返回", list);
    return list;
  } catch (error) {
    console.error("【自动报价】获取待报价列表异常", error);
    return [];
  }
}

// 单个订单报价
async function singleOffer(item) {
  try {
    console.log("【自动报价】待报价订单", item);
    let { id, supplier_max_price } = item || {};
    if (!id) return;
    // 报价逻辑
    console.log("【自动报价】准备匹配报价规则", item);
    const offerRule = await offerRuleMatch(item);
    if (!offerRule) {
      console.error("【自动报价】获取匹配报价规则失败");
      return;
    }
    const { offerAmount, memberOfferAmount } = offerRule;
    const price = offerAmount || memberOfferAmount;
    if (!price) return;
    if (Number(supplier_max_price) < price) {
      console.error("【自动报价】当前报价超过供应商最高报价，不再进行报价");
      return;
    }

    let params = {
      id: id,
      price
    };
    console.log("【自动报价】订单报价参数", params);
    const res = await lierenApi.submitOffer(params);
    console.log("【自动报价】订单报价返回", res);
    return { res, offerRule };
  } catch (error) {
    console.error("【自动报价】订单报价异常", error);
  }
}

// 获取待出票列表
async function getStayTicketingList() {
  try {
    let params = {
      page: 1,
      limit: 100,
      sort: "id",
      desc: "desc",
      type: 2
    };
    console.log("【自动出票】获取待出票列表参数", params);
    const res = await lierenApi.stayTicketingList(params);
    // let mockRes = {
    //     "success": true,
    //     "code": 1,
    //     "message": "成功！",
    //     "total": 1,
    //     "data": [
    //         {
    //             id: 5477690,
    //             supplier_id: 714632,
    //             order_number: '2024030616314142092',
    //             tpp_price: '49.00',
    //             ticket_num: 2,
    //             city_name: '上海',
    //             film_img:
    //                 'https://gw.alicdn.com/tfscom/i3/O1CN01JfQQxY1xDNJakaXHZ_!!6000000006409-0-alipicbeacon.jpg',
    //             cinema_addr: '徐汇区漕宝路33号四层l4',
    //             cinema_name: '八佰伴',
    //             hall_name: '2号激光厅',
    //             film_name: '黄雀在后！',
    //             show_time: '2024-04-17 22:10:00',
    //             section_at: 1709713967,
    //             winning_at: 1709714014,
    //             lock_if: 0,
    //             lockseat: '3排1座 3排2座',
    //             seat_flat: 0,
    //             urgent: 0,
    //             is_multi: 0,
    //             seat_type: 0,
    //             cinema_code: '31074801',
    //             supplier_end_price: 39.5,
    //             rewards: 0,
    //             overdue: 0,
    //             cinema_group: '上影上海',
    //             type: 1,
    //             group_urgent: 0,
    //             sytime: 1709714704
    //         },
    //     ],
    //     "time": 1710125670
    // }
    // let list = res?.data || mockRes?.data || []
    let list = res?.data || [];
    console.warn("【自动出票】待出票列表", list);
    return list;
  } catch (error) {
    console.error("【自动出票】获取待出票列表异常", error);
    return [];
  }
}

// 单个订单出票
const singleTicket = async item => {
  try {
    console.warn("【自动出票】单个待出票订单信息", item);
    // 1、解锁座位
    await unlockSeat(item.id);
  } catch (error) {
    console.error("【自动出票】解锁座位失败准备试错3次，间隔3秒");
    // 试错3次，间隔3秒
    const res = await trial(() => unlockSeat(item.id), 3, 3);
    if (!res) {
      console.error("【自动出票】单个订单试错后仍解锁失败", "需要走转单逻辑");
      // 转单逻辑待补充
      await transferOrder(item);
      return;
    }
  }
  try {
    // 解锁成功后延迟6秒再执行
    await delayHandle(6 * 1000);
    // 2、一键买票
    const result = await oneClickBuyTicket(item);
    // result: { profit, submitRes, qrcode, quan_code, card_id, offerRule } || undefined
    if (result) {
      console.warn("【自动出票】单个订单出票完成");
      return result;
    } else {
      console.warn("【自动出票】单个订单出票失败");
    }
  } catch (error) {
    console.error("【自动出票】单个订单出票异常", error);
  }
};

// 解锁座位
async function unlockSeat(order_id) {
  try {
    let params = {
      order_id
    };
    console.log("【自动出票】解锁参数", params);
    const res = await lierenApi.unlockSeat(params);
    console.log("【自动出票】解锁返回", res);
    return res;
  } catch (error) {
    console.error("【自动出票】解锁异常", error);
    return Promise.reject(error);
  }
}

// 一键买票逻辑
const oneClickBuyTicket = async item => {
  try {
    console.log("【自动出票】一键买票待下单信息", item);
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
    let city_id = cityList.value.find(
      item => item.name.indexOf(city_name) !== -1
    )?.id;
    // 1、获取城市影城列表
    const cinemaList = await getCityCinemaList(city_id);
    let cinema_id = getCinemaId(cinema_name, cinemaList);
    // 2、获取影院放映信息
    const moviePlayInfo = await getMoviePlayInfo({ city_id, cinema_id });
    let movieObj = moviePlayInfo.movie_data?.find(
      item => item.movie_name === film_name
    );
    // let movie_id = movieObj?.movie_id || ''
    let start_day = show_time.split(" ")[0];
    let start_time = show_time.split(" ")[1].slice(0, 5);
    console.log("【自动出票】movieObj===>", movieObj, start_day, start_time);
    let showList = movieObj?.shows[start_day] || [];
    console.log("【自动出票】showList===>", showList);
    let show_id =
      showList.find(item => item.start_time === start_time)?.show_id || "";
    // 3、获取座位布局
    const seatList = await getSeatLayout({ city_id, cinema_id, show_id });
    let seatName = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
    console.log("【自动出票】seatName", seatName);
    let selectSeatList = seatName.split(",");
    console.log("【自动出票】selectSeatList", selectSeatList);
    let targetList = seatList.filter(item => selectSeatList.includes(item[5]));
    console.log("【自动出票】targetList", targetList);
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
      await lockSeat(params); // 锁定座位
    } catch (error) {
      console.error("【自动出票】锁定座位失败准备试错3次，间隔5秒");
      // 试错3次，间隔5秒
      const res = await trial(() => lockSeat(params), 3, 5);
      if (!res) {
        console.error(
          "【自动出票】单个订单试错后仍锁定座位失败",
          "需要走转单逻辑"
        );
        await transferOrder(item);
        return;
      }
    }
    // 5、使用优惠券或者会员卡
    const { card_id, quan_code, profit, offerRule } = await useQuanOrCard({
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
      order: item
    });
    if (!card_id && !quan_code) {
      console.error(
        "【自动出票】优惠券和会员卡都无法使用，单个订单直接出票结束",
        "走转单逻辑"
      );
      await transferOrder(item, {
        city_id,
        cinema_id,
        show_id,
        start_day,
        start_time
      });
      return;
    }
    // 6计算订单价格
    const priceInfo = await priceCalculation({
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      card_id,
      quan_code
    });
    if (!priceInfo) {
      console.error(
        "【自动出票】使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item, {
        city_id,
        cinema_id,
        show_id,
        start_day,
        start_time
      });
      return;
    }
    let pay_money = Number(priceInfo.total_price) + ""; // 此处是为了将订单价格30.00转为30，将0.00转为0
    console.log("【自动出票】订单最后价格", pay_money, priceInfo);
    // 7、创建订单
    const order_num = await createOrder({
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
        "【自动出票】创建订单失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item, {
        city_id,
        cinema_id,
        show_id,
        start_day,
        start_time
      });
      return;
    }
    // 8、购买电影票
    const buyRes = await buyTicket({
      city_id,
      cinema_id,
      order_num,
      pay_money
    });
    if (!buyRes) {
      console.error(
        "【自动出票】订单购买失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item, {
        city_id,
        cinema_id,
        show_id,
        start_day,
        start_time
      });
      return;
    }
    // 9、支付订单
    const qrcode = await payOrder({ city_id, cinema_id, order_num });
    if (!qrcode) {
      console.error("【自动出票】获取订单结果失败，单个订单直接出票结束");
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      return;
    }
    // 10、提交取票码
    const submitRes = await submitTicketCode({
      order_id,
      qrcode
    });
    if (!submitRes) {
      console.error("【自动出票】订单提交取票码失败，单个订单直接出票结束");
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      return;
    }
    console.log("【自动出票】一键买票完成", qrcode);
    return { profit, submitRes, qrcode, quan_code, card_id, offerRule };
  } catch (error) {
    console.error("【自动出票】一键买票异常", error);
  }
};

// 获取城市影院列表
const getCityCinemaList = async city_id => {
  try {
    let params = {
      city_id
    };
    console.log("【自动出票】获取城市影院参数", params);
    const res = await sfcApi.getCinemaList(params);
    console.log("【自动出票】获取城市影院返回", res);
    let list = res.data.cinema_data || [];
    return list;
  } catch (error) {
    console.error("【自动出票】获取城市影院异常", error);
  }
};

// 获取电影放映信息
async function getMoviePlayInfo(data) {
  try {
    let { city_id, cinema_id } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log("【自动出票】获取电影放映信息参数", params);
    const res = await sfcApi.getMoviePlayInfo(params);
    console.log("【自动出票】获取电影放映信息返回", res);
    return res.data;
  } catch (error) {
    console.error("【自动出票】获取电影放映信息异常", error);
  }
}

// 获取座位布局
async function getSeatLayout(data) {
  try {
    let { city_id, cinema_id, show_id } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      width: "240"
    };
    console.log("【自动出票】获取座位布局参数", params);
    const res = await sfcApi.getMoviePlaySeat(params);
    console.log("【自动出票】获取座位布局返回", res);
    return res.data?.play_data?.seat_data || [];
  } catch (error) {
    console.error("【自动出票】获取座位布局异常", error);
  }
}

// 锁定座位
const lockSeat = async data => {
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
    console.log("【自动出票】锁定座位参数", params);
    const res = await sfcApi.lockSeat(params);
    console.log("【自动出票】锁定座位返回", res);
    return res;
  } catch (error) {
    console.error("【自动出票】锁定座位异常", error);
    return Promise.reject(error);
  }
};

// 使用优惠券或者会员卡
const useQuanOrCard = async ({
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
  order
}) => {
  try {
    const priceInfo = await priceCalculation({
      city_id,
      cinema_id,
      show_id,
      seat_ids
    });
    let pay_money = priceInfo.total_price;
    console.warn("【自动出票】使用优惠券或者会员卡前计算的订单总价", pay_money);
    console.log(
      `【自动出票】待出票订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
    );
    // 获取该订单的报价记录，按对应报价规则出票
    const offerRecord = await idbApi.queryOrderRecords(
      { orderNumber: order_number },
      1
    );
    if (!offerRecord?.length) {
      console.error("获取该订单的报价记录失败，不进行出票", offerRecord);
    }
    const offerRule = offerRecord[0];
    const { offerType, quanValue } = offerRule;
    // 拿订单号去匹配报价记录
    if (offerType !== "1") {
      console.log("【自动出票】使用会员卡出票");
      // 1、获取会员卡列表
      const cardList = await getCardList({ city_id, cinema_id });
      // 2、使用会员卡
      const card_id = await useCard(pay_money, cardList);
      // 3、计算价格要求最终价格小于中标价
      const priceInfo = await priceCalculation({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        card_id
      });
      if (
        !priceInfo ||
        Number(priceInfo.total_price) >= Number(supplier_end_price)
      ) {
        console.error(
          "计算订单价格失败或者中标价小于等于计算最后价，单个订单直接出票结束"
        );
        // 后续要记录失败列表（订单信息、失败原因、时间戳）
        return {
          offerRule,
          profit: 0,
          card_id: ""
        };
      }
      // 卡的话 1块钱成本就是一块钱，利润 =  中标价格-会员出票价格 -手续费（中标价格1%）
      const memberPrice = await getMemberPrice(order);
      let profit =
        supplier_end_price -
        memberPrice -
        (Number(supplier_end_price) * 100) / 10000;
      profit = Number(profit).toFixed(2);
      profit = Number(profit) * Number(ticket_num);
      return {
        offerRule,
        card_id,
        profit // 利润
      };
    } else {
      console.log("【自动出票】使用优惠券出票");
      // 1、获取优惠券列表
      const quanList = await getQuanList({ city_id, cinema_id });
      // 2、使用优惠券
      const { useQuans, profit } = await useQuan({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        quanList,
        quanValue
      });
      return {
        offerRule,
        quan_code: useQuans.join(),
        profit: profit // 利润
      };
    }
  } catch (error) {
    console.error("【自动出票】使用优惠券或者会员卡异常", error);
    return {
      card_id: "",
      quan_code: "",
      profit: 0 // 利润
    };
  }
};

// 计算订单价格
async function priceCalculation(data) {
  try {
    // 模拟延迟调用，因为该接口出现过连续请求报超时的情况，增加请求间隔
    await delayHandle(1 * 1000);
    let { city_id, cinema_id, show_id, seat_ids, card_id, quan_code } =
      data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      seat_ids: seat_ids,
      additional_goods_info: "", // 附加商品信息
      goods_info: "", // 商品信息
      is_first: "0", // 是否是首次购买 0-不是 1-是
      option_goods_info: "", // 可选的额外商品信息
      update_time: getCurrentFormattedDateTime()
    };
    if (quan_code) {
      params.quan_code = quan_code; // 优惠券编码
      params.member_coupon_id = ""; // 会员优惠券ID，为空表示没有使用特定的会员优惠券
    } else if (card_id) {
      params.card_id = card_id; // 会员卡id
    }
    console.log("【自动出票】计算订单价格参数", params);
    const res = await sfcApi.priceCalculation(params);
    console.log("【自动出票】计算订单价格返回", res);
    return res.data?.price;
  } catch (error) {
    console.error("【自动出票】计算订单价格异常", error);
  }
}

// 创建订单
async function createOrder(data) {
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
      phone: user?.userInfo?.mobile || "", // 用户手机号
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
        console.log("【自动出票】创建订单参数", params);
        const res = await sfcApi.createOrder(params);
        console.log("【自动出票】创建订单返回", res);
        return res.data?.order_num || "";
      } catch (error) {
        console.warn("【自动出票】会员卡第一次创建订单失败", error);
        console.warn(
          "【自动出票】调整会员卡密码参数再次发起创建订单请求",
          params
        );
        params.card_password = encode("338629"); // 会员卡密码
        const res = await sfcApi.createOrder(params);
        console.log("【自动出票】创建订单返回", res);
        return res.data?.order_num || "";
      }
    } else if (coupon) {
      params.coupon = coupon; // 优惠券券码
      console.log("【自动出票】创建订单参数", params);
      const res = await sfcApi.createOrder(params);
      console.log("【自动出票】创建订单返回", res);
      return res.data?.order_num || "";
    }
  } catch (error) {
    console.error("【自动出票】创建订单异常", error);
  }
}

// 订单购买
async function buyTicket(data) {
  try {
    let { city_id, cinema_id, order_num, pay_money } = data || {};
    let params = {
      city_id,
      cinema_id,
      open_id: "otEMo42FC38PgJiYDvu6HrGjrwQY", // 微信openId
      order_num, // 订单号
      pay_money, // 支付金额
      pay_type: "" // 购买方式 传空意味着用优惠券或者会员卡
    };
    console.log("【自动出票】订单购买参数", params);
    const res = await sfcApi.buyTicket(params);
    console.log("【自动出票】订单购买返回", res);
    return res;
  } catch (error) {
    console.error("【自动出票】订单购买异常", error);
  }
}

// 支付订单并返回购票信息
async function payOrder(data) {
  try {
    let { city_id, cinema_id, order_num } = data || {};
    let params = {
      city_id,
      cinema_id,
      order_num, // 订单号
      order_type: "ticket", // 订单类型
      order_type_num: 1 // 订单子类型数量，可能是指购买的该类型票的数量
    };
    console.log("【自动出票】支付订单参数", params);
    const res = await sfcApi.payOrder(params);
    console.log("【自动出票】支付订单返回", res);
    return res.data.qrcode || "";
  } catch (error) {
    console.error("【自动出票】支付订单异常", error);
  }
}

// 提交出票码
async function submitTicketCode({ order_id, qrcode }) {
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
    console.log("【自动出票】提交出票码参数", params);
    const res = await lierenApi.submitTicketCode(params);
    console.log("【自动出票】提交出票码返回", res);
    return res;
  } catch (error) {
    console.error("【自动出票】提交出票码异常", error);
  }
}

/**
 * 试错方法
 * @param { Function } 	callback	要试错的方法，携带参数的话可以在传参时嵌套一层
 * @param { Number } 	number	    试错次数
 * @param { Number } 	delayTime	试错间隔时间
 */
const trial = (callback, number = 1, delayTime = 0) => {
  let inx = 0,
    trialTimer = null;
  return new Promise(resolve => {
    trialTimer = setInterval(async () => {
      console.log("inx", inx, "number", number, "trialTimer", trialTimer);
      if (inx < number && trialTimer) {
        ++inx;
        console.log(`第${inx}次试错开始`);
        try {
          await callback();
          console.log(`第${inx}次试错成功`);
          clearInterval(trialTimer);
          resolve();
        } catch (error) {
          console.error(`第${inx}次试错失败`, error);
        }
      } else {
        console.log(`第${inx}次试错结束`);
        clearInterval(trialTimer);
        resolve();
      }
    }, delayTime * 1000);
  });
};

// 报价规则匹配
const offerRuleMatch = async order => {
  try {
    console.warn("匹配报价规则开始");
    let shadowLineObj = {
      sfc: "上影上海,上影二线"
    };
    const {
      cinema_group,
      city_name,
      cinema_name,
      hall_name,
      film_name,
      show_time,
      ticket_num
    } = order;
    // 0、获取订单影线
    let shadowLineName =
      Object.entries(shadowLineObj).find(
        item => item[1].indexOf(cinema_group) !== -1
      )?.[0] || "";
    console.log("报价订单影线", shadowLineName);
    // 1、获取启用的规则列表（只有满足规则才报价）
    let useRuleList = toRaw(tableData.value).filter(
      item => item.status === "1"
    );
    console.log("启用的规则列表", useRuleList);
    // 2、获取某个影线的规则列表
    let shadowLineRuleList = useRuleList.filter(item =>
      item.shadowLineName.includes(shadowLineName)
    );
    console.log("影线的规则列表", shadowLineRuleList);
    // 3、匹配城市
    let cityRuleList = shadowLineRuleList.filter(item => {
      console.log(
        "匹配城市",
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
    console.log("匹配城市后的规则列表", cityRuleList);
    // 4、匹配影院
    let cinemaRuleList = cityRuleList.filter(item => {
      if (!item.includeCinemaNames.length && !item.excludeCinemaNames.length) {
        return true;
      }
      if (item.includeCinemaNames.length) {
        return cinemaMatchHandle(cinema_name, item.includeCinemaNames);
      }
      if (item.excludeCinemaNames.length) {
        return !cinemaMatchHandle(cinema_name, item.excludeCinemaNames);
      }
    });
    console.log("匹配影院后的规则列表", cinemaRuleList);
    // 5、匹配影厅
    let hallRuleList = cinemaRuleList.filter(item => {
      console.log(
        "匹配影厅",
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
        console.log("isMatch1-1", isMatch);
        return isMatch;
      }
      if (item.excludeHallNames.length) {
        let isMatch = item.excludeHallNames.every(hallName => {
          return hall_name.toUpperCase().indexOf(hallName.toUpperCase()) === -1;
        });
        console.log("isMatch1-2", isMatch);
        return isMatch;
      }
    });
    console.log("匹配影厅后的规则列表", hallRuleList);
    // 6、匹配影片
    let filmRuleList = hallRuleList.filter(item => {
      console.log(
        "匹配影片",
        item.includeFilmNames,
        item.excludeFilmNames,
        film_name.toUpperCase()
      );
      if (!item.includeFilmNames.length && !item.excludeFilmNames.length) {
        return true;
      }
      if (item.includeFilmNames.length) {
        let isMatch = item.includeFilmNames.some(filmName => {
          return film_name.toUpperCase().indexOf(filmName.toUpperCase()) > -1;
        });
        console.log("isMatch2-1", isMatch);
        return isMatch;
      }
      if (item.excludeFilmNames.length) {
        let isMatch = item.excludeFilmNames.every(filmName => {
          return film_name.toUpperCase().indexOf(filmName.toUpperCase()) === -1;
        });
        console.log("isMatch2-2", isMatch);
        return isMatch;
      }
    });
    console.log("匹配影片后的规则列表", filmRuleList);
    // 7、匹配座位数限制
    let seatRuleList = filmRuleList.filter(item => {
      if (!item.seatNum) {
        return true;
      }
      return Number(item.seatNum) >= Number(ticket_num);
    });
    console.log("匹配座位数后的规则列表", seatRuleList);
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
    console.log("匹配开场时间后的规则列表", timeRuleList);
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
    console.log("匹配星期几后的规则列表", weekRuleList);
    // 10、匹配会员日
    let memberDayRuleList = weekRuleList.filter(item => {
      const day = show_time.split(" ")[0].split("-")[2];
      if (item.memberDay) {
        return Number(item.memberDay) === Number(day);
      }
      return true;
    });
    console.log("匹配会员日后的规则列表", memberDayRuleList);
    // 获取报价最低的报价规则
    const endRule = await getMinAmountOfferRule(memberDayRuleList, order);
    console.warn("最终匹配到的报价规则", endRule);
    if (!endRule) {
      console.error("最终匹配到的报价规则不存在");
    }
    return endRule;
  } catch (error) {
    console.error("报价规则匹配出现异常", error);
  }
};

// 获取报价最低的报价规则
const getMinAmountOfferRule = async (ruleList, order) => {
  try {
    // 1、有会员日报价规则命中优先使用会员日报价规则
    let onlyMemberDayRuleList = ruleList
      .filter(item => item.memberDay && item.offerType === "3")
      .filter(item => itemB.offerAmount);
    // 报价从低到高排序
    onlyMemberDayRuleList.sort(
      (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
    );
    console.log("命中会员日报价规则从小往大排序", onlyMemberDayRuleList);
    if (onlyMemberDayRuleList.length) {
      return onlyMemberDayRuleList[0];
    }
    // 2、比对那个利润更高，就用那个规则出
    let otherRuleList = ruleList.filter(
      item => !item.memberDay && item.offerType !== "3"
    );
    console.warn("排除会员日后的其它规则", otherRuleList);
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
          "最小加价规则获取会员价失败,返回最小固定报价规则",
          mixFixedAmountRule
        );
        return mixFixedAmountRule;
      }
      // 会员最终报价
      memberPrice = Number(memberPrice) + Number(mixAddAmountRule.addAmount);
      mixAddAmountRule.memberOfferAmount = memberPrice;
    } else {
      console.warn(
        "最小加价规则不存在,返回最小固定报价规则",
        mixFixedAmountRule
      );
      return mixFixedAmountRule;
    }
    if (!mixFixedAmountRule) {
      console.warn(
        "最小固定报价规则不存在,返回最小加价报价规则",
        mixAddAmountRule
      );
      return mixAddAmountRule;
    }
    return mixAddAmountRule.memberOfferAmount >=
      Number(mixFixedAmountRule.offerAmount)
      ? mixFixedAmountRule
      : mixAddAmountRule;
  } catch (error) {
    console.error("获取最低报价规则异常", error);
  }
};

// 获取会员价
const getMemberPrice = async order => {
  try {
    console.log("【自动报价】准备获取会员价", order);
    const { city_name, cinema_name, hall_name } = order;
    console.log(
      `【自动报价】待报价订单：城市${city_name}, 影院${cinema_name}, 影厅${hall_name}`
    );
    // 获取当前场次电影信息
    const movieInfo = await getMovieInfo(order);
    console.log(`【自动报价】待报价订单当前场次电影相关信息`, movieInfo);
    if (!movieInfo) {
      console.error("【自动报价】获取当前场次电影信息失败", "不再进行报价");
      return;
    }
    let { member_price } = movieInfo;
    console.log("【自动报价】获取会员价", member_price);
    if (member_price) {
      return Number(member_price);
    }
  } catch (error) {
    console.error("获取会员价异常", error);
  }
};

// 影院名称匹配（匹配报价规则时使用）
const cinemaMatchHandle = (cinema_name, list) => {
  try {
    // 1、全字匹配
    const isHasMatch = list.some(item => item === cinema_name);
    if (isHasMatch) {
      return true;
    }
    console.warn("【自动报价规则匹配】全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinema_name
      .replace(/[\(\)\（\）]/g, "")
      .replace(/\s*/g, "");
    // 2、特殊匹配
    if (
      specialCinemaNameMatchList.some(
        item => item.order_cinema_name === cinemaName
      )
    ) {
      return true;
    }
    console.warn(
      "【自动报价规则匹配】特殊匹配影院名称失败",
      cinemaName,
      specialCinemaNameMatchList
    );
    // 3、模糊匹配
    let targetCinemaName = findBestMatchByLevenshteinWithThreshold(
      list,
      cinema_name,
      8
    );
    console.log("targetCinemaName", targetCinemaName);
    if (targetCinemaName) {
      return true;
    }
    console.error(
      "【自动报价规则匹配】模糊匹配影院名称失败",
      list,
      cinema_name,
      8
    );
  } catch (error) {
    console.error("【自动报价规则匹配】影院名称匹配异常", error);
  }
};

// 根据订单name获取影院id
const getCinemaId = (cinema_name, list) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let cinema_id = list.find(item => item.name === cinema_name)?.id;
    if (cinema_id) {
      return cinema_id;
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn("【自动报价】全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinema_name
      .replace(/[\(\)\（\）]/g, "")
      .replace(/\s*/g, "");
    let obj = specialCinemaNameMatchList.find(
      item => item.order_cinema_name === cinemaName
    );
    if (obj) {
      cinemaName = obj.sfc_cinema_name;
      let cinemaList = list.map(item => {
        return {
          ...item,
          name: item.name.replace(/[\(\)\（\）]/g, "").replace(/\s*/g, "")
        };
      });
      cinema_id = cinemaList.find(item => item.name === cinemaName)?.id;
      if (cinema_id) {
        return cinema_id;
      }
    }
    console.warn(
      "【自动报价】特殊匹配影院名称失败",
      cinemaName,
      specialCinemaNameMatchList
    );
    // 3、不满足条件就走模糊匹配（模糊匹配不正确的就放到特殊匹配里面）
    let cinemaNameList = list.map(item => item.name);
    console.warn("【自动报价】模糊匹配影院名称", cinema_name, cinemaNameList);
    let targetCinemaName = findBestMatchByLevenshteinWithThreshold(
      cinemaNameList,
      cinema_name,
      8
    );
    if (!targetCinemaName) {
      console.error("模糊匹配影院名称失败", cinemaNameList, cinema_name, 8);
      return;
    }
    cinema_id = list.find(item => item.name === targetCinemaName)?.id;
    if (!cinema_id) {
      console.error("【自动报价】模糊匹配影院名称失败", cinema_name, list);
    }
    return cinema_id;
  } catch (error) {
    console.error("根据订单name获取影院id失败", error);
  }
};

// 获取电影信息
const getMovieInfo = async item => {
  try {
    // 1、获取影院列表拿到影院id
    const { city_name, cinema_name, film_name, show_time } = item;
    let city_id = cityList.value.find(
      item => item.name.indexOf(city_name) !== -1
    )?.id;
    let params = {
      city_id: city_id
    };
    console.log("【自动报价】获取城市影院参数", params);
    const res = await sfcApi.getCinemaList(params);
    console.log("【自动报价】获取城市影院返回", res);
    let cinemaList = res.data?.cinema_data || [];
    let cinema_id = getCinemaId(cinema_name, cinemaList);
    if (!cinema_id) {
      console.error("【自动报价】获取目标影院失败");
      return;
    }
    // 2、获取影院放映信息拿到会员价
    const moviePlayInfo = await getMoviePlayInfo({ city_id, cinema_id });
    // 3、匹配订单拿到会员价
    const { movie_data } = moviePlayInfo;
    let movieInfo = movie_data.find(
      item => item.movie_name.indexOf(film_name) !== -1
    );
    if (movieInfo) {
      let { shows } = movieInfo;
      let showDay = show_time.split(" ")[0];
      let showList = shows[showDay] || [];
      let showTime = show_time.split(" ")[1].slice(0, 5);
      let ticketInfo = showList.find(item => item.start_time === showTime);
      return ticketInfo;
    }
  } catch (error) {
    console.error("【自动报价】获取当前场次电影信息异常", error);
  }
};

// 获取优惠券列表
async function getQuanList(data) {
  try {
    let { city_id, cinema_id } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      request_from: "1"
    };
    console.log("获取优惠券列表参数", params);
    const res = await sfcApi.getQuanList(params);
    console.log("获取优惠券列表返回", res);
    let list = res.data.list || [];
    // let noUseLIst = ['1598162363509715', '1055968062906716', '1284460567801315', '1116166666409614']
    // 过滤掉不可用券
    // list = list.filter(item => item.coupon_info.indexOf('员工券') !== -1)
    return list;
  } catch (error) {
    console.error("获取优惠券列表异常", error);
  }
}

// 使用优惠券
async function useQuan({
  city_id,
  cinema_id,
  show_id,
  seat_ids,
  ticket_num,
  supplier_end_price,
  quanList,
  quanValue
}) {
  try {
    // 规则如下:
    // 1、成本不能高于中标价，即40券不能出中标价39.5的单
    // 2、1张票一个券，不能出现2张票用3个券的情况
    // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
    let useQuans = []; // 用券列表
    let quans = quanList || []; // 优惠券列表
    let pay_money; // 实际支付金额
    let quanlist40 = quans
      .filter(item => item.coupon_info.indexOf("40") !== -1)
      .map(item => item.coupon_num);
    let quanlist35 = quans
      .filter(item => item.coupon_info.indexOf("35") !== -1)
      .map(item => item.coupon_num);
    let quanlist30 = quans
      .filter(item => item.coupon_info.indexOf("30") !== -1)
      .map(item => item.coupon_num);
    let profit = 0; // 利润
    // 券的话 30和35券没花头，成本就是券面价格。40的在39-30.5区间。 利润 =  中标价格-券价格 -手续费（中标价格1%）
    for (let index = 0; index < ticket_num; index++) {
      if (quanValue === "40") {
        useQuans.push(quanlist40.shift());
        profit =
          profit +
          Number(supplier_end_price) -
          40 -
          (Number(supplier_end_price) * 100) / 10000;
      } else if (quanValue === "35") {
        useQuans.push(quanlist35.shift());
        profit =
          profit +
          Number(supplier_end_price) -
          35 -
          (Number(supplier_end_price) * 100) / 10000;
      } else if (quanValue === "30") {
        useQuans.push(quanlist30.shift());
        profit =
          profit +
          Number(supplier_end_price) -
          30 -
          (Number(supplier_end_price) * 100) / 10000;
      }
      // 四舍五入保留两位小数后再转为数值类型
      profit = Number(profit).toFixed(2);
      profit = Number(profit);
    }
    if (useQuans.length !== useQuans.filter(item => !!item).length) {
      console.error(`${quanValue} 面额券不足，无法使用券`, quanList);
      return {
        profit: 0,
        useQuans: []
      };
    }
    const priceInfo = await priceCalculation({
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      quan_code: useQuans.join()
    });
    if (!priceInfo) {
      console.error("计算订单价格失败，单个订单直接出票结束");
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      return {
        profit: 0,
        useQuans: []
      };
    }
    pay_money = priceInfo.total_price;
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
    console.error("使用优惠券异常", error);
    return {
      profit: 0,
      useQuans: []
    };
  }
}

// 获取会员卡列表
async function getCardList(data) {
  try {
    let { city_id, cinema_id } = data || {};
    let params = {
      city_id,
      cinema_id
    };
    console.log("获取会员卡列表参数", params);
    const res = await sfcApi.getCardList(params);
    console.log("获取会员卡列表返回", res);
    let list = res.data.card_data || [];
    return list;
  } catch (error) {
    console.error("获取会员卡列表异常", error);
  }
}

// 使用会员卡
async function useCard(total_price, cardList) {
  try {
    let cards = cardList || [];
    let cardInfo = cards.find(
      item => Number(item.balance) >= Number(total_price)
    );
    return cardInfo?.card_id || "";
  } catch (error) {
    console.error("使用会员卡异常", error);
  }
}

// 退出登录
async function logout() {
  try {
    let params = {};
    console.log("退出登录参数", params);
    const res = await sfcApi.logout(params);
    console.log("退出登录返回", res);
    router.push("/login");
    window.localStorage.removeItem("userInfo");
    window.localStorage.removeItem("platToken");
  } catch (error) {
    console.warn("退出登录异常", error);
    router.push("/login");
    window.localStorage.removeItem("userInfo");
    window.localStorage.removeItem("platToken");
  } finally {
    user.setUserInfo({});
  }
}

// 获取城市列表
async function getCityList() {
  try {
    let params = {};
    console.log("获取城市列表参数", params);
    const res = await sfcApi.getCityList(params);
    console.log("获取城市列表返回", res);
    cityList.value = res.data.all_city || [];
  } catch (error) {
    console.error("获取城市列表异常", error);
  }
}

onMounted(() => {
  console.log(`the component is now mounted.`);
  getCityList();
});
</script>

<style>
@media (min-width: 1024px) {
  .about {
    width: 100%;
  }

  .settings-form {
    border: 1px dashed;
    padding: 30px 30px 15px;
    border-radius: 15px;
  }

  .text-center {
    text-align: center;
  }

  .dialog-footer {
    text-align: right;
  }

  .el-form-item__content {
    width: 100%;
    display: block;
  }
}
</style>
