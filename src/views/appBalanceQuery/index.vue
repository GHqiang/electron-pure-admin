<!-- app余额查询 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.appName"
          placeholder="影线名称"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in shadowLineObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 表格 -->
    <el-table
      style="width: 100%"
      :data="tableDataFilter"
      border
      stripe
      show-overflow-tooltip
    >
      <el-table-column type="expand">
        <template #default="props">
          <div
            style="padding: 5px 15px"
            v-if="props.row.cardList && props.row.cardList.length"
          >
            <h3>会员卡余额详细信息</h3>
            <div
              v-for="(item, inx) in props.row.cardList"
              :key="inx"
              style="margin-top: 10px"
            >
              {{ inx }}、<span>卡名：{{ item.level }} </span
              ><span style="margin-left: 20px"> 卡号：{{ item.card_num }}</span>
              <span style="margin-left: 20px"> 卡余额：{{ item.balance }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="appName" label="影线名称">
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.appName] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quan_40_num" label="40券数量" />
      <el-table-column prop="quan_35_num" label="35券数量" />
      <el-table-column prop="quan_30_num" label="30券数量" />
      <el-table-column prop="card_total_price" label="会员卡总额" />

      <!-- <el-table-column label="报价类型" width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offerType] || "" }}</span>
        </template>
      </el-table-column> -->
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { APP_LIST } from "@/common/constant.js";
import sfcApi from "@/api/sfc-api";
import jiujinApi from "@/api/jiujin-api";
import jinjiApi from "@/api/jinji-api";
import lainaApi from "@/api/laina-api";

// api集合
let apiObj = {
  sfc: sfcApi,
  jiujin: jiujinApi,
  jinji: jinjiApi,
  laina: lainaApi
};

// 影线列表
const shadowLineObj = APP_LIST;

// 表单查询数据
const formData = reactive({
  appName: "" // 影线名称
});

// 搜索过滤后的数据
const tableDataFilter = ref([]);

// 搜索数据
const searchData = async () => {
  try {
    // 1、获取城市
    // 2、获取影院
    let apiList = Object.entries(apiObj);
    let paramsObj = {
      sfc: { city_id: "", cinema_id: "" },
      jiujin: { city_id: "", cinema_id: "" },
      jinji: { city_id: "", cinema_id: "" },
      laina: { city_id: "", cinema_id: "" }
    };
    let requestList = [];
    for (let index = 0; index < apiList.length; index++) {
      const [appName, api] = apiList[index];
      // console.log(appName, api);
      let { city_id, cinema_id } = paramsObj[appName];
      if (!city_id && !cinema_id) {
        const cityRes = await api.getCityList({});
        // console.log("获取城市列表返回", cityRes);
        let cityList = cityRes.data.all_city || [];
        paramsObj[appName].city_id = cityList[0]?.id;
        city_id = cityList[0]?.id;
        const cinemaRes = await api.getCinemaList({ city_id });
        // console.log("【自动出票】获取城市影院返回", cinemaRes);
        let cinemaList = cinemaRes.data.cinema_data || [];
        paramsObj[appName].cinema_id = cinemaList[0]?.id;
        cinema_id = cinemaList[0]?.id;
      }
      let { city_id: cityId, cinema_id: cinemaId } = paramsObj[appName];
      requestList.push(
        api.getCardList({ city_id: cityId, cinema_id: cinemaId })
      );
      requestList.push(
        api.getQuanList({ city_id: cityId, cinema_id: cinemaId })
      );
    }
    const resList = await Promise.all(requestList);
    // console.log("resList", resList);
    let tableList = [];
    resList.forEach((res, inx) => {
      let cardList = res.data.card_data || [];
      let quanList = res.data.list || [];
      // console.log("cardList", cardList, quanList);
      let obj = {
        appName: ""
      };
      if (quanList.length) {
        obj.quan_40_num = quanList.filter(
          item => item.coupon_info.indexOf("40") !== -1
        ).length;
        obj.quan_35_num = quanList.filter(
          item => item.coupon_info.indexOf("35") !== -1
        ).length;
        obj.quan_30_num = quanList.filter(
          item => item.coupon_info.indexOf("30") !== -1
        ).length;
      }
      if (cardList.length) {
        obj.cardList = cardList;
        obj.card_total_price = cardList.reduce((prev, item) => {
          return Number(item.balance) + prev;
        }, 0);
      }
      let appNameList = [];
      // 创建一个新数组来存储结果，避免直接修改原数组
      Object.keys(apiObj).forEach((item, index) => {
        // 先将当前元素插入新数组
        appNameList.push(item);
        // 在当前元素的下一个位置插入相同的元素
        appNameList.splice(index + 1, 0, item);
      });
      obj.appName = appNameList[inx];
      let index = tableList.findIndex(item => item.appName === obj.appName);
      // console.log("obj", obj);
      if (index !== -1) {
        tableList[index] = {
          ...tableList[index],
          ...obj
        };
      } else {
        tableList.push(obj);
      }
    });
    const { appName } = formData;
    tableDataFilter.value = tableList.filter(item => {
      if (appName) {
        return item.appName === appName;
      }
      return true;
    });
  } catch (error) {
    console.error("查看影院余额失败===>", error);
  }
};
searchData();

// 重置表单
const resetForm = () => {
  formData.appName = ""; // 影线名称
};
</script>
