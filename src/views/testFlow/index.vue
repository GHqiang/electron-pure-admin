<template>
  <div class="about">
    <el-form label-width="100px">
      <el-divider>单个出票流程测试</el-divider>
      <el-form-item label="城市">
        <el-row>
          <el-col :span="16">
            <el-input
              v-model="cityName"
              placeholder="请输入所在城市"
            ></el-input>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="cityName" @click="getCityCinemaList()"
              >获取城市影院列表</el-button
            >
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="影院">
        <el-row>
          <el-col :span="16">
            <el-input
              v-model="cinemaName"
              placeholder="请输入所在影院"
            ></el-input>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="cinemaName" @click="getMoviePlayInfo()"
              >获取电影放映信息</el-button
            >
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="场次">
        <el-col :span="11">
          <el-date-picker
            v-model="startDay"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            type="date"
            placeholder="请选择日期"
            style="width: 100%"
          />
        </el-col>
        <el-col :span="2" class="text-center"> —— </el-col>
        <el-col :span="11">
          <el-time-picker
            v-model="startTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="请选择时间"
            style="width: 100%"
          />
        </el-col>
      </el-form-item>
      <el-form-item label="片名">
        <el-row>
          <el-col :span="16">
            <el-input
              v-model="movieName"
              placeholder="请输入电影片名"
            ></el-input>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="movieName" @click="getSeatLayout()"
              >查看座位布局</el-button
            >
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="座位">
        <el-row>
          <el-col :span="16">
            <el-input v-model="seatName" placeholder="请输入座位"></el-input>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="seatName" @click="lockSeat()">锁定座位</el-button>
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="数量">
        <el-row style="width: 100%">
          <el-col :span="7"> {{ seatName.split(",").length }} 张 </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="seatName" @click="getQuanList()"
              >获取优惠券</el-button
            >
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button v-if="seatName" @click="getCardList()"
              >获取会员卡</el-button
            >
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="使用优惠券">
        <el-row>
          <el-col :span="16">
            <el-select
              v-model="quanCodes"
              clearable
              multiple
              placeholder="请选择优惠券"
              style="width: 240px"
            >
              <el-option
                v-for="item in quanList"
                :key="item.coupon_num"
                :label="item.coupon_info"
                :value="item.coupon_num"
              />
            </el-select>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button @click="priceCalculation()">计算订单价格</el-button>
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item label="使用会员卡">
        <el-row>
          <el-col :span="16">
            <el-select
              v-model="cardId"
              clearable
              placeholder="请选择会员卡"
              style="width: 240px"
            >
              <el-option
                v-for="item in cinemaCardList"
                :key="item.card_num"
                :label="item.level"
                :value="item.id"
              />
            </el-select>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-button @click="priceCalculation()">计算订单价格</el-button>
          </el-col>
        </el-row>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="createOrder()">创建订单</el-button>
        <el-button type="primary" @click="buyTicket()">购买</el-button>
        <el-button type="primary" @click="payOrder()">支付订单</el-button>
        <el-button type="primary" @click="logout">退出登录</el-button>
      </el-form-item>
      <!-- <el-form-item>
        <el-button type="primary" @click="getLierenOrderList(0)"
          >获取待报价列表</el-button
        >
        <el-button type="primary" @click="getLierenOrderList(1)"
          >获取已报价列表</el-button
        >
        <el-button type="primary" @click="getLierenOrderList(2)"
          >获取待出票记录</el-button
        >
        <el-button type="primary" @click="getLierenOrderList(3)"
          >获取已出票记录</el-button
        >
      </el-form-item> -->
    </el-form>
    <el-dialog
      v-model="dialogVisible"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      title="提示"
      width="500"
      draggable
    >
      <el-form label-width="100px">
        <el-form-item label="使用优惠券">
          <el-row>
            <el-col :span="16">
              <el-select
                v-model="quanCodes"
                clearable
                multiple
                placeholder="请选择优惠券"
                style="width: 240px"
              >
                <el-option
                  v-for="item in quanList"
                  :key="item.coupon_num"
                  :label="item.coupon_info"
                  :value="item.coupon_num"
                />
              </el-select>
            </el-col>
            <el-col :span="7" :offset="1">
              <el-button @click="priceCalculation()">计算订单价格</el-button>
            </el-col>
          </el-row>
        </el-form-item>
      </el-form>
      <div class="dialog-footer">
        <el-button @click="useQuanHandle(0)">暂不使用</el-button>
        <el-button type="primary" @click="useQuanHandle(1)">
          确定使用
        </el-button>
      </div>
    </el-dialog>
    <el-dialog
      v-model="dialogVisibleByCard"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      title="提示"
      width="500"
      draggable
    >
      <el-form label-width="100px">
        <el-form-item label="使用会员卡">
          <el-row>
            <el-col :span="16">
              <el-select
                v-model="cardId"
                clearable
                placeholder="请选择会员卡"
                style="width: 240px"
              >
                <el-option
                  v-for="item in cinemaCardList"
                  :key="item.card_num"
                  :label="item.level"
                  :value="item.id"
                />
              </el-select>
            </el-col>
            <el-col :span="7" :offset="1">
              <el-button @click="priceCalculation()">计算订单价格</el-button>
            </el-col>
          </el-row>
        </el-form-item>
      </el-form>
      <div class="dialog-footer">
        <el-button @click="useCardHandle(0)">暂不使用</el-button>
        <el-button type="primary" @click="useCardHandle(1)">
          确定使用
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { storeToRefs } from "pinia";
import {
  getCurrentFormattedDateTime,
  convertFullwidthToHalfwidth,
  cinemNameSpecial
} from "@/utils/utils";
import { SPECIAL_CINEMA_OBJ } from "@/common/constant";
import { SFC_API_OBJ } from "@/common/index.js";
import lierenApi from "@/api/lieren-api";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { allUserInfo, removeSfcUserInfo } = userInfoAndTokens;
const appName = "hongshi";
let sfcApi = SFC_API_OBJ[appName];
// console.log("sfcApi", sfcApi);
import { useRouter } from "vue-router";
const router = useRouter();

const cityList = ref([]); // 城市列表
const cityName = ref("上海"); // 城市名称
const cityId = ref(""); // 城市id

const cinemaList = ref([]); // 影院列表
const cinemaName = ref("八佰伴"); // 影院名称
const cinemaId = ref(""); // 影院id
const moviePlayInfo = ref({}); // 放映信息
const movieName = ref("末路狂花钱"); // 线上电影名称

const startDay = ref("2024-05-27"); // 开始日期
const startTime = ref("22:30"); // 开始时间
const showId = ref(""); // 观看电影场次id

const seatList = ref([]); // 观看电影座位布局信息
const seatName = ref("3排6号"); // 座位名称
const seatId = ref(""); // 座位id

const cardList = ref([]); // 全部会员卡列表
const cardId = ref(""); // 要使用的会员卡id
const qrcode = ref(""); // 取票码

const offerPrice2 = ref("37"); // 二线普通厅国内报价
const offerPrice3 = ref("34"); // 二线普通厅国外报价
const cardPrice = ref("2"); // 会员报价+值

// 一线城市列表
let oneCityList = ["北京", "上海", "广州", "深圳"];
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

// 目标影院会员卡列表
const cinemaCardList = computed(() => {
  // 暂不过滤，全国通用
  return cardList.value;
  // return cardList.value.filter((item) => item.cinema_id === cinemaId.value)
});

const quanList = ref([]); //全部优惠券列表
const quanCodes = ref([]); // 要使用的优惠券列表
const priceInfo = ref({}); // 计算订单价格信息
const orderNum = ref(""); // 订单号

const dialogVisible = ref(false); // 优惠券选择弹框显示
const dialogVisibleByCard = ref(false); // 会员卡选择弹框显示

// 转单
const transferOrder = async order => {
  try {
    const params = {
      id: order.id,
      confirm: 1
    };
    console.warn("【转单】参数", params);
    const res = await lierenApi.transferOrder(params);
    console.warn("【转单】结果", res);
  } catch (error) {
    console.warn("【转单】异常", error);
  }
};

// 获取待出票列表
async function getLierenOrderList(type) {
  try {
    let params = {
      page: 1,
      limit: 100,
      sort: "id",
      desc: "desc",
      type
    };
    const typeObj = {
      0: "待报价",
      1: "已报价",
      2: "待出票",
      3: "已出票"
    };
    console.log(`获取${typeObj[type]}列表参数`, params);
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
    console.warn(`获取${typeObj[type]}列表`, list);
    return list;
  } catch (error) {
    console.warn(`获取订单列表异常`, error);
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
    console.warn("【自动出票】解锁座位失败准备试错3次，间隔3秒");
    // 试错3次，间隔3秒
    const res = await trial(() => unlockSeat(item.id), 3, 3);
    if (!res) {
      console.warn("【自动出票】单个订单试错后仍解锁失败", "需要走转单逻辑");
      // 转单逻辑待补充
      await transferOrder(item);
      return;
    }
  }
  try {
    // 解锁成功后延迟6秒再执行
    await delay(6);
    // 2、一键买票
    const result = await oneClickBuyTicket(item);
    // result: {profit, submitRes, qrcode} || undefined
    if (result) {
      console.warn("【自动出票】单个订单出票完成");
      return result;
    } else {
      console.warn("【自动出票】单个订单出票失败");
    }
  } catch (error) {
    console.warn("【自动出票】单个订单出票异常", error);
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
    console.warn("【自动出票】解锁异常", error);
    return Promise.reject(error);
  }
}

// 一键买票逻辑
const oneClickBuyTicket = async item => {
  try {
    console.log("【自动出票】一键买票待下单信息", item);
    const {
      id: order_id,
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
    let movie_data = moviePlayInfo?.movie_data || [];
    let movieObj = movie_data.find(item => item.movie_name === film_name);
    if (!movieObj) {
      movieObj = movie_data.find(
        item =>
          convertFullwidthToHalfwidth(item.movie_name) ===
          convertFullwidthToHalfwidth(film_name)
      );
    }
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
      console.warn("【自动出票】锁定座位失败准备试错3次，间隔5秒");
      // 试错3次，间隔5秒
      const res = await trial(() => lockSeat(params), 3, 5);
      if (!res) {
        console.warn(
          "【自动出票】单个订单试错后仍锁定座位失败",
          "需要走转单逻辑"
        );
        await transferOrder(item);
        return;
      }
    }
    // 5、使用优惠券或者会员卡
    const { member_coupon_id, quan_code, profit } = await useQuanOrCard({
      city_name,
      cinema_name,
      hall_name,
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      ticket_num,
      supplier_end_price
    });
    if (!member_coupon_id && !quan_code) {
      console.warn(
        "【自动出票】优惠券和会员卡都无法使用，单个订单直接出票结束",
        "走转单逻辑"
      );
      await transferOrder(item);
      return;
    }
    // 6计算订单价格
    const priceInfo = await priceCalculation({
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      member_coupon_id,
      quan_code
    });
    if (!priceInfo) {
      console.warn(
        "【自动出票】使用优惠券或会员卡后计算订单价格失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item);
      return;
    }
    let pay_money = priceInfo.total_price;
    console.log("【自动出票】订单最后价格", pay_money, priceInfo);
    // 7、创建订单
    const order_num = await createOrder({
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      member_coupon_id,
      coupon: quan_code,
      seat_info: seatName,
      pay_money
    });
    if (!order_num) {
      console.warn(
        "【自动出票】创建订单失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item);
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
      console.warn(
        "【自动出票】订单购买失败，单个订单直接出票结束",
        "走转单逻辑"
      );
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      await transferOrder(item);
      return;
    }
    // 9、支付订单
    const qrcode = await payOrder({ city_id, cinema_id, order_num });
    if (!qrcode) {
      console.warn("【自动出票】获取订单结果失败，单个订单直接出票结束");
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      return;
    }
    // 10、提交取票码
    const submitRes = await submitTicketCode({
      order_id,
      qrcode
    });
    if (!submitRes) {
      console.warn("【自动出票】订单提交取票码失败，单个订单直接出票结束");
      // 后续要记录失败列表（订单信息、失败原因、时间戳）
      return;
    }
    console.log("【自动出票】一键买票完成", qrcode);
    return { profit, submitRes, qrcode };
  } catch (error) {
    console.warn("【自动出票】一键买票异常", error);
  }
};

// 获取城市影院列表
const getCityCinemaList = async city_id => {
  try {
    let flag;
    if (!city_id) {
      flag = true;
      let city_name = cityName.value;
      city_id = cityList.value.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
    }
    let params = {
      city_id
    };
    console.log("【自动出票】获取城市影院参数", params);
    const res = await sfcApi.getCinemaList(params);
    console.log("【自动出票】获取城市影院返回", res);
    let list = res.data.cinema_data || [];
    // 测试使用
    if (flag) {
      cityId.value = city_id;
      cinemaList.value = list;
    }
    return list;
  } catch (error) {
    console.warn("【自动出票】获取城市影院异常", error);
  }
};

// 根据订单name获取影院id
const getCinemaId = async (cinema_name, list) => {
  try {
    // 1、先全字匹配，匹配到就直接返回
    let cinema_id = list.find(item => item.name === cinema_name)?.id;
    if (cinema_id) {
      return cinema_id;
    }
    // 2、匹配不到的如果满足条件就走特殊匹配
    console.warn("全字匹配影院名称失败", cinema_name, list);
    let cinemaName = cinemNameSpecial(cinema_name);
    if (SPECIAL_CINEMA_OBJ[appName].length) {
      let specialCinemaInfo = SPECIAL_CINEMA_OBJ[appName].find(
        item => item.order_cinema_name === cinemaName
      );
      if (specialCinemaInfo) {
        cinemaName = specialCinemaInfo.sfc_cinema_name;
      } else {
        console.warn(
          "特殊匹配影院名称失败",
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
      "去掉空格及换行符后全字匹配失败",
      cinemaName,
      noSpaceCinemaList
    );
  } catch (error) {
    console.error("根据订单name获取影院id失败", error);
  }
};

// 获取电影放映信息
async function getMoviePlayInfo(data) {
  try {
    let flag;
    let { city_id, cinema_id } = data || {};
    if (!data) {
      flag = true;
      city_id = cityId.value;
      cinemaId.value = await getCinemaId(cinemaName.value, cinemaList.value);
      // cinemaId.value = cinemaList.value.find(
      //   item => item.name.indexOf(cinemaName.value) !== -1
      // )?.id;
      cinema_id = cinemaId.value;
    }
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "500"
    };
    console.log("【自动出票】获取电影放映信息参数", params);
    const res = await sfcApi.getMoviePlayInfo(params);
    console.log("【自动出票】获取电影放映信息返回", res);
    // 测试使用
    if (flag) {
      moviePlayInfo.value = res.data;
    }
    try {
      // 3、匹配订单拿到会员价
      const { movie_data } = res.data;
      let movieInfo = movie_data.find(
        item => item.movie_name.indexOf(movieName.value) !== -1
      );
      if (!movieInfo) {
        console.warn(
          "影院放映信息匹配订单影片名称全字匹配失败",
          movie_data,
          movieName.value
        );
        movieInfo = movie_data.find(
          item =>
            convertFullwidthToHalfwidth(item.movie_name) ===
            convertFullwidthToHalfwidth(movieName.value)
        );
      }
      console.log("获取会员价-movieInfo", movieInfo);
      let member_price;
      if (movieInfo) {
        let { shows } = movieInfo;
        let showDay = startDay.value;
        let showList = shows[showDay] || [];
        let showTime = startTime.value;
        console.log("showDay", showDay, "showTime", showTime);
        let ticketInfo = showList.find(item => item.start_time === showTime);
        member_price = ticketInfo?.member_price;
      }
      console.warn("获取会员价-最终价格", member_price);
    } catch (error) {
      console.error("获取会员价失败", error);
    }
    return res.data;
  } catch (error) {
    console.warn("【自动出票】获取电影放映信息异常", error);
  }
}

// 获取座位布局
async function getSeatLayout(data) {
  try {
    let flag;
    let { city_id, cinema_id, show_id } = data || {};
    if (!data) {
      flag = true;
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      let movieObj = moviePlayInfo.value.movie_data?.find(
        item =>
          convertFullwidthToHalfwidth(item.movie_name) ===
          convertFullwidthToHalfwidth(movieName.value)
      );
      let start_day = startDay.value;
      let start_time = startTime.value;
      console.log("【自动出票】movieObj===>", movieObj, start_day, start_time);
      let showList = movieObj?.shows[start_day] || [];
      console.log("【自动出票】showList===>", showList);
      show_id =
        showList.find(item => item.start_time === start_time)?.show_id || "";
      showId.value = show_id;
    }
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      width: "240"
    };
    console.log("【自动出票】获取座位布局参数", params);
    const res = await sfcApi.getMoviePlaySeat(params);
    console.log("【自动出票】获取座位布局返回", res);
    // 测试使用
    if (flag) {
      seatList.value = res.data?.play_data?.seat_data || [];
    }
    return res.data?.play_data?.seat_data || [];
  } catch (error) {
    console.warn("【自动出票】获取座位布局异常", error);
  }
}

// 锁定座位
const lockSeat = async data => {
  try {
    let { city_id, cinema_id, show_id, seat_ids, start_day, start_time } =
      data || {};
    if (!data) {
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      show_id = showId.value;
      start_day = startDay.value;
      start_time = startTime.value;
      let lockseat = seatName.value;
      let seatName1 = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
      console.log("【自动出票】seatName1", seatName1);
      let selectSeatList = seatName1.split(",");
      console.log("【自动出票】selectSeatList", selectSeatList);
      let targetList = seatList.value.filter(item =>
        selectSeatList.includes(item[5])
      );
      console.log("【自动出票】targetList", targetList);
      seat_ids = targetList.map(item => item[0]).join();
      seatId.value = seat_ids;
    }
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
    console.warn("【自动出票】锁定座位异常", error);
    return Promise.reject(error);
  }
};

// 使用优惠券或者会员卡
const useQuanOrCard = async ({
  city_name,
  cinema_name,
  hall_name,
  city_id,
  cinema_id,
  show_id,
  seat_ids,
  ticket_num,
  supplier_end_price
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
    let isOneLine = oneCityList.includes(city_name);
    let isSpecialHall = specialHallList.some(item => hall_name.includes(item));
    if (isSpecialHall) {
      console.log("【自动出票】特殊厅使用会员卡出票");
      // 1、获取会员卡列表
      await getCardList({ city_id, cinema_id });
      // 2、使用会员卡
      const card_num = await useCard(pay_money);
      return {
        member_coupon_id: card_num,
        profit: Number(cardPrice.value) || 2 // 利润
      };
    } else {
      console.log("【自动出票】非特殊厅使用优惠券出票");
      // 1、获取优惠券列表
      await getQuanList({ city_id, cinema_id });
      // 2、使用优惠券
      const { useQuans, profit } = await useQuan({
        city_id,
        cinema_id,
        show_id,
        seat_ids,
        ticket_num,
        supplier_end_price,
        isOneLine
      });
      return {
        quan_code: useQuans.join(),
        profit: profit // 利润
      };
    }
  } catch (error) {
    console.warn("【自动出票】使用优惠券或者会员卡异常", error);
  }
};

// 计算订单价格
async function priceCalculation(data) {
  try {
    let flag;
    let { city_id, cinema_id, show_id, seat_ids, member_coupon_id, quan_code } =
      data || {};
    if (!data) {
      flag = true;
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      show_id = showId.value;
      seat_ids = seatId.value;
      member_coupon_id = cardId.value;
      quan_code = quanCodes.value.join();
    }
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      seat_ids: seat_ids,
      additional_goods_info: "", // 附加商品信息
      goods_info: "", // 商品信息
      is_first: "0", // 是否是首次购买 0-不是 1-是
      member_coupon_id: member_coupon_id || "", // 会员卡id
      option_goods_info: "", // 可选的额外商品信息
      quan_code: quan_code || "", // 优惠券券码
      update_time: getCurrentFormattedDateTime()
    };
    console.log("【自动出票】计算订单价格参数", params);
    const res = await sfcApi.priceCalculation(params);
    console.log("【自动出票】计算订单价格返回", res);
    if (flag) {
      priceInfo.value = res.data?.price || {};
    }
    return res.data?.price;
  } catch (error) {
    console.warn("【自动出票】计算订单价格异常", error);
  }
}

// 创建订单
async function createOrder(data) {
  try {
    let flag;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      seat_info,
      pay_money,
      member_coupon_id,
      coupon
    } = data || {};
    if (!data) {
      flag = true;
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      show_id = showId.value;
      seat_ids = seatId.value;
      seat_info = seatName.value.replaceAll(" ", ",").replaceAll("座", "号");
      pay_money = priceInfo.value.total_price || "";
      member_coupon_id = cardId.value;
      coupon = quanCodes.value.join();
    }
    let params = {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      seat_info, // 座位描述，如：7排11号,7排10号
      phone: allUserInfo[appName]?.mobile || "", // 用户手机号
      additional_goods_info: "", // 附加商品信息
      companion_info: "", // 携伴信息
      goods_info: "", // 商品信息
      option_goods_info: "", // 可选的额外商品信息
      pay_money, // 支付金额
      promo_id: "0", // 促销活动ID，这里为0，表示没有参与特定的促销活动
      member_coupon_id: member_coupon_id || "", // 会员卡id
      coupon, // 优惠券券码
      update_time: getCurrentFormattedDateTime()
    };
    console.log("【自动出票】创建订单参数", params);
    const res = await sfcApi.createOrder(params);
    console.log("【自动出票】创建订单返回", res);
    // 测试使用
    if (flag) {
      orderNum.value = res.data?.order_num || "";
    }
    return res.data?.order_num || "";
  } catch (error) {
    console.warn("【自动出票】创建订单异常", error);
  }
}

// 订单购买
async function buyTicket(data) {
  try {
    let { city_id, cinema_id, order_num, pay_money } = data || {};
    if (!data) {
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      order_num = orderNum.value;
      pay_money = priceInfo.value.total_price || "";
    }
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
    console.warn("【自动出票】订单购买异常", error);
  }
}

// 支付订单并返回购票信息
async function payOrder(data) {
  try {
    let flag;
    let { city_id, cinema_id, order_num } = data || {};
    if (!data) {
      flag = true;
      city_id = cityId.value;
      cinema_id = cinemaId.value;
      order_num = orderNum.value;
    }
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
    // 测试使用
    if (flag) {
      qrcode.value = res.data.qrcode;
      console.warn("【自动出票】出票码", qrcode.value);
    }
    return res.data.qrcode || "";
  } catch (error) {
    console.warn("【自动出票】支付订单异常", error);
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
    console.warn("【自动出票】提交出票码异常", error);
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
          console.log(`第${inx}次试错失败`, error);
        }
      } else {
        console.log(`第${inx}次试错结束`);
        clearInterval(trialTimer);
        resolve();
      }
    }, delayTime * 1000);
  });
};

// 获取优惠券列表
async function getQuanList(data) {
  try {
    let { city_id, cinema_id } = data || {};
    if (!data) {
      city_id = cityId.value;
      cinema_id = cinemaId.value;
    }
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
    quanList.value = list;
    return list;
  } catch (error) {
    console.warn("获取优惠券列表异常", error);
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
  isOneLine
}) {
  try {
    // 规则如下:
    // 1、成本不能高于中标价，即40券不能出中标价39.5的单
    // 2、1张票一个券，不能出现2张票用3个券的情况
    // 3、40出一线，35出二线国内，30出二线外国（暂时无法区分外国）
    let useQuans = []; // 用券列表
    let quans = quanList.value || []; // 优惠券列表
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
    for (let index = 0; index < ticket_num; index++) {
      if (isOneLine) {
        if (Number(supplier_end_price) > 40) {
          useQuans.push(quanlist40.shift());
          profit = profit + Number(supplier_end_price) - 40;
        } else {
          useQuans.push(quanlist35.shift());
          profit = profit + Number(supplier_end_price) - 35;
        }
      } else {
        if (Number(supplier_end_price) > 35) {
          useQuans.push(quanlist35.shift());
          profit = profit + Number(supplier_end_price) - 35;
        } else {
          useQuans.push(quanlist30.shift());
          profit = profit + Number(supplier_end_price) - 30;
        }
      }
    }
    const priceInfo = await priceCalculation({
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      quan_code: useQuans.join()
    });
    if (!priceInfo) {
      console.warn("计算订单价格失败，单个订单直接出票结束");
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
    console.warn("使用优惠券异常", error);
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
    if (!data) {
      city_id = cityId.value;
      cinema_id = cinemaId.value;
    }
    let params = {
      city_id,
      cinema_id
    };
    console.log("获取会员卡列表参数", params);
    const res = await sfcApi.getCardList(params);
    console.log("获取会员卡列表返回", res);
    let list = res.data.card_data || [];
    cardList.value = list;
    return list;
  } catch (error) {
    console.warn("获取会员卡列表异常", error);
  }
}

// 使用会员卡
async function useCard(total_price) {
  try {
    let cards = cardList.value || [];
    let cardInfo = cards.find(
      item => Number(item.balance) >= Number(total_price)
    );
    return cardInfo?.card_num || "";
    // if (!cardId.value) {
    //     dialogVisibleByCard.value = true
    //     let p = new Promise((resolve) => window.awaitUseCard = resolve)
    //     await p
    // } else {
    //     console.warn('已选择过会员卡', cardId.value)
    // }
  } catch (error) {
    console.warn("使用会员卡异常", error);
  }
}

// 退出登录
async function logout() {
  try {
    let params = {
      city_id: cityId.value,
      cinema_id: cinemaId.value
    };
    console.log("退出登录参数", params);
    const res = await sfcApi.logout(params);
    console.log("退出登录返回", res);
    router.push("/login");
  } catch (error) {
    console.warn("退出登录异常", error);
    router.push("/login");
  } finally {
    removeSfcUserInfo(appName);
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
    console.warn("获取城市列表异常", error);
  }
}

// 延时执行
function delay(time) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

onMounted(() => {
  console.log(`the component is now mounted.`);
  getCityList();
});
</script>

<style></style>
