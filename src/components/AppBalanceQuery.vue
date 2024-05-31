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
      <el-form-item label="券面额">
        <el-select
          v-model="formData.quanValue"
          placeholder="券面额"
          style="width: 194px"
          clearable
        >
          <el-option label="40" value="40" />
          <el-option label="35" value="35" />
          <el-option label="30" value="30" />
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
          <div m="4">
            <h2>会员卡余额详细信息</h2>
            <div v-for="(item, inx) in props.row.cardList" :key="inx">
              <span> </span>
              <span> </span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="appName" fixed label="影线名称" width="110">
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.appName] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="40_quan_num" label="40券数量" width="110" />
      <el-table-column prop="35_quan_num" label="35券数量" width="110" />
      <el-table-column prop="30_quan_num" label="30券数量" width="110" />
      <el-table-column prop="card_total_price" label="会员卡总额" width="110" />

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
  appName: "", // 影线名称
  quanValue: "" // 用券面额
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
    let cardApiList = [],
      quanApiList = [];
    for (let index = 0; index < apiList.length; index++) {
      const [appName, api] = apiList[index];
      let { city_id, cinema_id } = paramsObj[appName];
      if (!city_id && !cinema_id) {
        const cityRes = await api.getCityList({});
        console.log("获取城市列表返回", res);
        let cityList = cityRes.data.all_city || [];
        paramsObj[appName].city_id = cityList[0]?.id;
        city_id = cityList[0]?.id;
        const cinemaRes = await sfcApi.getCinemaList(params);
        console.log("【自动出票】获取城市影院返回", res);
        let cinemaList = cinemaRes.data.cinema_data || [];
        paramsObj[appName].cinema_id = cinemaList[0]?.id;
        cinema_id = cinemaList[0]?.id;
      }
      cardApiList.push(api.getCardList(city_id, cinema_id));
      // quanApiList.push(api.getQuanList(city_id, cinema_id));
    }
    const resList = await Promise.all([...cardApiList, ...quanApiList]);
    console.log(resList);
  } catch (error) {
    console.error("查看影院余额失败===>", error);
  }
};
searchData();

// 重置表单
const resetForm = () => {
  formData.appName = ""; // 影线名称
  formData.quanValue = ""; // 是否报价
};
</script>
