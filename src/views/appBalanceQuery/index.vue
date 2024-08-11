<!-- app余额查询 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.appName"
          placeholder="影线名称"
          clearable
          style="width: 194px"
        >
          <el-option
            v-for="(keyValue, keyName) in shadowLineObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="所属账号">
        <el-input
          v-model="formData.mobile"
          placeholder="请输入所属账号(手机号)"
          clearable
        />
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
      show-summary
      border
      stripe
      show-overflow-tooltip
    >
      <el-table-column type="expand" width="70">
        <template #default="props">
          <div
            v-if="props.row.quan_other_list && props.row.quan_other_list.length"
            style="padding: 5px 15px"
          >
            <h3>优惠券-其它券详细信息</h3>
            <div
              v-for="(item, inx) in props.row.quan_other_list"
              :key="inx"
              style="margin-top: 10px"
            >
              {{ inx }}、
              <span style="margin-left: 5px">
                说明：{{ item.coupon_info }}</span
              >
              <span style="margin-left: 20px">
                开始：{{ item.validate_date_start }}</span
              >
              <span style="margin-left: 20px">
                截止：{{ item.validate_date_end }}</span
              >
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
      <el-table-column prop="quan_other_num" label="其它券数量" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { APP_LIST, UME_LIST } from "@/common/constant.js";
import { APP_API_OBJ } from "@/common/index.js";
import { ElLoading } from "element-plus";
import { getCinemaLoginInfoList } from "@/utils/utils";
// 影线列表
const shadowLineObj = APP_LIST;

// 表单查询数据
const formData = reactive({
  appName: "", // 影线名称
  mobile: ""
});

// 搜索过滤后的数据
const tableDataFilter = ref([]);
const delay = delayTime => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delayTime);
  });
};
// 搜索数据
const searchData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let loginInfoList = getCinemaLoginInfoList().filter(
      item => !UME_LIST.includes(item.app_name)
    );
    // 过滤一下已登录的
    let tableList = [];
    for (let index = 0; index < loginInfoList.length; index++) {
      const { app_name, session_id } = loginInfoList[index];
      await delay(200);
      const res = await APP_API_OBJ[app_name].getQuanList({
        city_id: "500",
        cinema_id: "1",
        session_id
      });
      let quanList = res.data.list || [];
      if (quanList.length) {
        let obj = {
          appName: app_name
        };
        obj.quan_40_num = quanList.filter(
          item => item.coupon_info.indexOf("40") !== -1
        ).length;
        obj.quan_35_num = quanList.filter(
          item => item.coupon_info.indexOf("35") !== -1
        ).length;
        obj.quan_30_num = quanList.filter(
          item => item.coupon_info.indexOf("30") !== -1
        ).length;
        obj.quan_other_list = quanList.filter(
          item =>
            !["30", "35", "40"].some(
              itemA => item.coupon_info.indexOf(itemA) !== -1
            )
        );
        obj.quan_other_num = obj.quan_other_list.length;
        tableList.push(obj);
      }
    }
    console.warn("影院余额数据", tableList);
    tableDataFilter.value = tableList;
    loading.close();
  } catch (error) {
    console.error("查看影院余额失败===>", error);
    loading.close();
  }
};
// searchData();

// 重置表单
const resetForm = () => {
  formData.appName = ""; // 影线名称
  formData.mobile = ""; // 影线名称
};
</script>
