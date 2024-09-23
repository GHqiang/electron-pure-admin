<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.orderForm"
          placeholder="订单来源"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in orderFormObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="规则名称">
        <el-input
          v-model="formData.ruleName"
          placeholder="请输入规则名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.shadowLineName"
          placeholder="影线名称"
          style="width: 194px"
          clearable
          filterable
        >
          <el-option
            v-for="(keyValue, keyName) in shadowLineObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`">
        <el-select
          v-model="formData.status"
          placeholder="状态"
          style="width: 194px"
          clearable
        >
          <el-option label="正常" value="1" />
          <el-option label="禁用" value="2" />
        </el-select>
      </el-form-item>
      <el-form-item label="报价类型">
        <el-select
          v-model="formData.offerType"
          placeholder="报价类型"
          style="width: 194px"
          clearable
        >
          <el-option label="固定价" value="1" />
          <el-option label="会员价加价" value="2" />
          <el-option label="会员日报价" value="3" />
        </el-select>
      </el-form-item>
      <el-form-item label="用券类型">
        <el-select
          v-model="formData.quanValue"
          placeholder="用券类型"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in QUAN_TYPE"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" style="padding-left: 0px" @click="addRule">
          <template #default>
            <el-select
              v-model="shadowLine"
              filterable
              placeholder="请选择影线名称"
              style="width: 120px; margin-left: -1px"
            >
              <el-option
                v-for="(keyValue, keyName) in shadowLineObj"
                :key="keyName"
                :label="keyValue"
                :value="keyName"
              />
            </el-select>
            &nbsp;&nbsp;新增
          </template>
        </el-button>
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
        >
      </el-form-item>
    </el-form>

    <!-- 操作按钮 -->
    <div style="margin-bottom: 15px" />

    <!-- 表格 -->
    <el-table
      ref="multipleTable"
      style="width: 100%"
      :data="tableData"
      border
      stripe
      show-overflow-tooltip
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" fixed width="55" />
      <el-table-column prop="ruleName" fixed label="规则名称" width="110" />
      <el-table-column prop="orderForm" fixed label="订单来源" width="85">
        <template #default="scope">
          <span>{{ formatPlatName(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="shadowLineName" fixed label="影线名称" width="85">
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.shadowLineName] }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" fixed width="100">
        <template #default="scope">
          <span v-if="scope.row.status === '3'" style="color: red">{{
            statusObj[scope.row.status]
          }}</span>
          <el-switch
            v-else
            v-model="scope.row.status"
            active-value="1"
            inactive-value="2"
            @change="handleStatusChange(scope.row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="报价类型" fixed width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offerType] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用券类型" prop="quanValue" width="85" />
      <el-table-column label="报价金额" prop="offerAmount" width="85">
        <template #default="scope">
          <span>{{ formatOfferAmount(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="加价金额" prop="addAmount" width="85">
        <template #default="scope">
          <span>{{ formatAddAmount(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="会员日" prop="memberDay" width="85" />
      <el-table-column label="开场时间限制" prop="timeLimit" width="110" />
      <el-table-column label="包含城市" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeCityNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="排除城市" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeCityNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="星期几" width="90">
        <template #default="scope">
          <span>{{ scope.row.weekDay.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="座位数" prop="seatNum" width="90" />
      <el-table-column prop="includeCinemaNames" label="包含影院" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeCinemaNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeCinemaNames" label="排除影院" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeCinemaNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="includeHallNames" label="包含影厅" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeHallNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeHallNames" label="排除影厅" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeHallNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="includeFilmNames" label="包含影片" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeFilmNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeFilmNames" label="排除影片" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeFilmNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ruleStartTime" label="开始放映时间" width="110" />
      <el-table-column prop="ruleEndTime" label="结束放映时间" width="110" />
      <el-table-column label="操作" fixed="right" align="left" width="350">
        <template #default="scope">
          <el-button
            size="small"
            type="primary"
            @click="editRule(scope.row, '1')"
            >编辑</el-button
          >
          <el-button
            size="small"
            type="success"
            @click="editRule(scope.row, '2')"
            >复制</el-button
          >
          <el-button
            size="small"
            type="danger"
            @click="deleteRow(scope.$index, scope.row)"
            >删除</el-button
          >
          <el-button
            v-if="scope.row.status === '1' && rule == 2"
            size="small"
            type="primary"
            @click="switchOnlyOffer(scope.row, '3')"
            >开启仅报价</el-button
          >
          <el-button
            v-if="scope.row.status === '3' && rule == 2"
            size="small"
            type="primary"
            @click="switchOnlyOffer(scope.row, '1')"
            >关闭仅报价</el-button
          >
          <!-- <el-button size="small" @click="viewDetails(scope.row)">详情</el-button> -->
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 20, 30, 50]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <RuleDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveRule"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, toRaw } from "vue";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import RuleDialog from "@/components/RuleDialog.vue";
import { ORDER_FORM, APP_LIST, QUAN_TYPE, UME_LIST } from "@/common/constant";
import {
  getCurrentFormattedDateTime,
  getCinemaLoginInfoList
} from "@/utils/utils";
import { useDataTableStore } from "@/store/offerRule";
const rules = useDataTableStore();
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
// 订单来源枚举
// 订单来源
const orderFormObj = ref(ORDER_FORM);
const shadowLineObj = APP_LIST;
// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};
// 规则状态枚举
const statusObj = {
  1: "正常",
  2: "禁用",
  3: "仅报价"
};

// 表单查询数据
const formData = reactive({
  orderForm: "", // 订单来源
  ruleName: "", // 规则名称
  shadowLineName: "", // 影线名称
  status: "", // 状态
  offerType: "", // 报价类型
  quanValue: "" // 用券类型
});

formData.rule = rule;

const getAllCinemaList = async () => {
  let appList = [];
  let loginInfoList = getCinemaLoginInfoList();
  Object.keys(APP_LIST).forEach(item => {
    let obj = loginInfoList.find(
      itemA => itemA.app_name === item && itemA.session_id
    );
    if (obj) {
      appList.push(item);
    }
  });
  console.log("appList", appList);
  return;
  let allCinemaList = [];
  for (const appName of appList) {
    const list = await getCinemaList(appName);
    allCinemaList.push(...list);
  }
  console.log("allCinemaList", allCinemaList);
};
window.getAllCinemaList = getAllCinemaList;
// 获取影院列表
const getCinemaList = async appName => {
  try {
    let list = [];
    if (UME_LIST.includes(appName)) {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode: "32012801",
          cinemaLinkId: "15946"
        }
      };
      const res = await APP_API_OBJ[appName].getCinemaList(params);
      const cityCinemaList = res.data || [];
      // console.log(appName+ "根据城市获取影院列表返回", cityCinemaList);
      list = cityCinemaList
        .map(item => item.cinemaList)
        .flat()
        .map(itemA => ({
          app_name: appName,
          cinema_code: itemA.cinemaCode,
          cinema_name: itemA.cinemaName
        }));
    } else {
      const res = await APP_API_OBJ[appName].getCityList({});
      let cityList = res?.data?.all_city || [];

      for (const item of cityList) {
        const res = await APP_API_OBJ[appName].getCinemaList({
          city_id: item.id
        });
        // console.log("根据城市获取影院列表返回", res);
        let cinemaList = res.data?.cinema_data || [];
        // console.log(appName+ "根据城市获取影院列表返回", cinemaList);
        cinemaList = cinemaList.map(item => ({
          app_name: appName,
          cinema_code: item.id,
          cinema_name: item.name
        }));
        list.push(...cinemaList);
      }
    }
    console.log(appName + "获取全部影院列表返回", list);
    return list;
  } catch (error) {
    console.warn(appName + "获取全部影院列表异常", error);
  }
};

const judgeHandle = (arr, str) => {
  let tempArr = str.split(",");
  return tempArr.every(item => arr.join().indexOf(item) !== -1);
};
// 设置本地的规则列表
const setLocalRuleList = async () => {
  try {
    const ruleRes = await svApi.queryRuleList({ rule });
    // console.log("ruleRes", ruleRes);
    let ruleRecords = ruleRes.data.ruleList || [];
    ruleRecords = ruleRecords.filter(item => ["1", "3"].includes(item.status));
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
    });
    rules.setRuleList(ruleRecords);
  } catch (error) {
    console.warn("查询规则列表时设置本地规则数据异常", error);
  }
};

// 格式化订单来源
const formatPlatName = ({ orderForm, platOfferList }) => {
  return platOfferList?.length
    ? platOfferList.map(item => ORDER_FORM[item.platName]).join()
    : orderForm
        .split(",")
        .map(item => ORDER_FORM[item])
        .join();
};

// 格式化报价金额
const formatOfferAmount = ({ offerAmount, offerType, platOfferList }) => {
  return platOfferList?.length
    ? offerType === "1"
      ? platOfferList
          .map(item => ORDER_FORM[item.platName] + ":" + item.value)
          .join(";")
      : ""
    : offerAmount;
};

// 格式化加价金额
const formatAddAmount = ({ addAmount, offerType, platOfferList }) => {
  return platOfferList?.length
    ? offerType === "2"
      ? platOfferList
          .map(item => ORDER_FORM[item.platName] + ":" + item.value)
          .join(";")
      : ""
    : addAmount;
};

// 搜索数据
const searchData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    // console.log("queryParams", queryParams);
    let res;
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    if (JSON.stringify(queryParams) === "{}") {
      res = await svApi.getRuleList({ page_num, page_size });
    } else {
      res = await svApi.queryRuleList({
        ...queryParams,
        page_num,
        page_size
      });
    }
    let ruleRecords = res.data.ruleList || [];
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
    });
    // console.log("规则列表===>", ruleRecords);
    tableData.value = ruleRecords;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
    setLocalRuleList();
  } catch (error) {
    loading.close();
    console.warn("获取规则列表失败", error);
  }
};
searchData();
const handleSizeChange = val => {
  console.log(`${val} items per page`);
  currentPage.value = 1;
  searchData();
};
const handleCurrentChange = val => {
  console.log(`current page: ${val}`);
  searchData();
};
// sfc弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLine = ref("sfc");

// 新增规则
const addRule = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ shadowLineName: shadowLine.value });
};

// 处理状态更改
const handleStatusChange = async row => {
  // 显示二次确认对话框
  const confirmResult = await ElMessageBox.confirm(
    `确定要${row.status === "1" ? "启用" : "禁用"}该报价规则吗?`,
    "提示",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      showClose: false,
      closeOnClickModal: false,
      closeOnPressEscape: false
    }
  ).catch(err => err);

  if (confirmResult !== "confirm") {
    // 用户取消了操作，恢复原状态
    row.status = row.status === "1" ? "2" : "1";
    return;
  }

  // 更新状态
  try {
    await editStatus(row);
  } catch (err) {
    console.warn("状态更新失败, 还原原状态", err);
    row.status = row.status === "1" ? "2" : "1";
  }
};

// 启用禁用状态
const editStatus = async row => {
  try {
    await svApi.updateRuleRecord({
      id: row.id,
      status: row.status
    });
    searchData();
    ElMessage.success("状态更新成功");
  } catch (err) {
    throw new Error("状态更新失败");
  }
};

// 开启关闭仅报价
const switchOnlyOffer = async (row, type) => {
  try {
    await svApi.updateRuleRecord({
      id: row.id,
      status: type === "3" ? "3" : "1"
    });
    searchData();
    ElMessage({
      type: "success",
      message: "操作完成"
    });
    return;
    ElMessageBox.confirm(
      `确定要${type === "3" ? "开启" : "关闭"}仅报价吗?`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        showClose: false,
        closeOnClickModal: false,
        closeOnPressEscape: false
      }
    )
      .then(async () => {
        await svApi.updateRuleRecord({
          id: row.id,
          status: type === "3" ? "3" : "1"
        });
        searchData();
        ElMessage({
          type: "success",
          message: "操作完成"
        });
      })
      .catch(() => {
        ElMessage({
          type: "info",
          message: "操作取消"
        });
      });
  } catch (err) {
    //TODO handle the exception
  }
};

// 编辑规则
const editRule = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存规则
const saveRule = async ruleInfo => {
  try {
    ruleInfo = JSON.parse(JSON.stringify(ruleInfo));
    ruleInfo.includeCityNames = JSON.stringify(ruleInfo.includeCityNames);
    ruleInfo.excludeCityNames = JSON.stringify(ruleInfo.excludeCityNames);
    ruleInfo.includeCinemaNames = JSON.stringify(ruleInfo.includeCinemaNames);
    ruleInfo.excludeCinemaNames = JSON.stringify(ruleInfo.excludeCinemaNames);
    ruleInfo.includeHallNames = JSON.stringify(ruleInfo.includeHallNames);
    ruleInfo.excludeHallNames = JSON.stringify(ruleInfo.excludeHallNames);
    ruleInfo.includeFilmNames = JSON.stringify(ruleInfo.includeFilmNames);
    ruleInfo.excludeFilmNames = JSON.stringify(ruleInfo.excludeFilmNames);
    ruleInfo.orderForm = (ruleInfo.platOfferList || [])
      .map(item => item.platName)
      .join();
    ruleInfo.platOfferList = JSON.stringify(ruleInfo.platOfferList || []);
    ruleInfo.weekDay = JSON.stringify(ruleInfo.weekDay);
    ruleInfo.update_time = getCurrentFormattedDateTime();
    ruleInfo.rule = rule;
    if (ruleInfo.id) {
      console.log("编辑保存规则", ruleInfo);
      await svApi.updateRuleRecord(ruleInfo);
      sfcDialogRef.value.closeTck();
      searchData();
    } else {
      console.log("新增保存规则", ruleInfo);
      await svApi.addRuleRecord({ ...ruleInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存规则异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.id = "";
  formData.orderForm = ""; // 规则名称
  formData.ruleName = ""; // 规则名称
  formData.shadowLineName = ""; // 影线名称
  formData.quanValue = ""; // 是否报价
  formData.status = ""; // 状态
  formData.offerType = ""; // 报价类型
  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行规则
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该规则吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteRule({ id: row.id });
      searchData();
      ElMessage({
        type: "success",
        message: "删除完成"
      });
    })
    .catch(() => {
      ElMessage({
        type: "info",
        message: "删除取消"
      });
    });
};

// 批量删除
const batchDelete = () => {
  if (multipleSelection.value.length) {
    ElMessageBox.confirm(
      `批量删除 ${multipleSelection.value.length} 条规则?`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        showClose: false,
        closeOnClickModal: false,
        closeOnPressEscape: false
      }
    )
      .then(async () => {
        let ids = multipleSelection.value.map(item => item.id);
        console.log("ids===>", ids);
        await svApi.batchDeleteRule({ delIds: ids });
        searchData();
        multipleSelection.value = [];
        ElMessage({
          type: "success",
          message: "删除完成"
        });
      })
      .catch(() => {
        ElMessage({
          type: "info",
          message: "删除取消"
        });
      });
  }
};
</script>
