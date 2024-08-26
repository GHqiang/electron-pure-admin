<!-- 会员卡列表 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.app_name"
          placeholder="影线名称"
          style="width: 194px"
          clearable
          filterable
        >
          <el-option
            v-for="(keyValue, keyName) in APP_LIST"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="卡&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ID">
        <el-input
          v-model="formData.card_id"
          placeholder="请输入卡ID"
          clearable
        />
      </el-form-item>
      <el-form-item
        label="卡&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;号"
      >
        <el-input
          v-model="formData.card_num"
          placeholder="请输入卡号"
          clearable
        />
      </el-form-item>
      <el-form-item label="目标余额">
        <el-input
          v-model="formData.balance"
          placeholder="请输入目标余额"
          clearable
        />
      </el-form-item>
      <el-form-item label="所属账号">
        <el-input
          v-model="formData.mobile"
          placeholder="请输入所属账号(手机号)"
          clearable
        />
      </el-form-item>
      <el-form-item label="出票限制">
        <el-select
          v-model="formData.use_limit_day"
          placeholder="出票限制（当天）"
          clearable
          style="width: 194px"
        >
          <el-option
            v-for="(item, index) in 10"
            :key="index"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button type="primary" style="padding-left: 0px">
          <template #default>
            <el-select
              v-model="shadowLine"
              filterable
              placeholder="影线名称"
              style="width: 120px; margin-left: -1px"
            >
              <el-option
                v-for="(keyValue, keyName) in APP_LIST"
                :key="keyName"
                :label="keyValue"
                :value="keyName"
              />
            </el-select>
            <span @click="addCard">新增</span>
          </template>
        </el-button>
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
        >
        <el-button type="primary" style="padding-left: 0px">
          <template #default>
            <el-input
              v-model="mobile"
              placeholder="所属账号(手机号)"
              clearable
              style="width: 150px; margin-left: -1px"
            />
            <span @click="syncBalance">同步余额</span>
          </template>
        </el-button>
      </el-form-item>
    </el-form>

    <!-- 表格 -->
    <el-table
      ref="multipleTable"
      style="width: 100%"
      :data="tableData"
      border
      stripe
      show-summary
      max-height="450"
      :summary-method="getSummaries"
      show-overflow-tooltip
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" min-width="55" />
      <el-table-column
        prop="app_name"
        label="影线名称"
        sortable
        min-width="110"
      >
        <template #default="{ row }">
          <span>{{ APP_LIST[row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="cinema_name" label="影院名称" min-width="150" />
      <el-table-column prop="mobile" label="所属账号" min-width="120" />
      <el-table-column prop="balance" label="卡 余额" min-width="80">
        <template #default="{ row }">
          <span :class="{ red: row.balance <= 200 }">{{ row.balance }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="card_discount" label="卡 折扣" min-width="80" />
      <el-table-column prop="card_id" label="卡 ID" min-width="80" />
      <el-table-column prop="card_num" label="卡 号" min-width="120" />
      <!-- <el-table-column prop="card_pwd" label="卡 密码" min-width="110" /> -->
      <el-table-column prop="use_limit_day" label="出票限制" min-width="90" />
      <el-table-column prop="use_limit_day" label="是否默认卡" min-width="100">
        <template #default="{ row }">
          <span>{{ row.default_card === "1" ? "是" : "否" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="integral" label="卡 积分" min-width="100" />
      <el-table-column prop="remark" label="备注" min-width="100" />

      <el-table-column
        label="操作"
        fixed="right"
        align="center"
        min-width="200"
      >
        <template #default="scope">
          <el-button
            size="small"
            type="primary"
            @click="editCard(scope.row, '1')"
            >编辑</el-button
          >
          <el-button
            size="small"
            type="success"
            @click="editCard(scope.row, '2')"
            >复制</el-button
          >
          <el-button
            size="small"
            type="danger"
            @click="deleteRow(scope.$index, scope.row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 20, 50, 100]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <CardDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveCard"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import CardDialog from "@/components/CardDialog.vue";
import { APP_LIST, UME_LIST } from "@/common/constant";
import { APP_API_OBJ } from "@/common/index.js";
import {
  getCurrentFormattedDateTime,
  getCinemaLoginInfoList
} from "@/utils/utils";
const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_name: "",
  card_id: "",
  card_num: "",
  balance: "",
  use_limit_day: "",
  mobile: ""
});
// window.testUpdateCardUse = () =>
//   svApi.updateDayUsage({
//     app_name: "sfc",
//     card_id: "241071"
//   });

// window.testCardLimit = async () => {
//   const member_price = "36.78",
//     ticket_num = 2;
//   const cardRes = await svApi.queryCardList({
//     app_name: "sfc"
//   });
//   // 后续这块还要加上出票量限制判断
//   let list = cardRes.data.cardList || [];
//   // console.log("list", list);
//   let cardList = list.filter(item =>
//     !item.use_limit_day
//       ? true
//       : ticket_num <= item.use_limit_day - item.daily_usage
//   );
//   cardList = cardList.map(item => ({
//     ...item,
//     card_discount: !item.card_discount ? 100 : Number(item.card_discount)
//   }));
//   // console.log("cardList", cardList);
//   cardList.sort((a, b) => a.card_discount - b.card_discount);
//   // 按最低折扣取值报价
//   let discount = cardList[0]?.card_discount;
//   // console.log("discount", discount);
//   return discount
//     ? (Number(member_price) * discount) / 100
//     : Number(member_price);
// };
// 搜索数据
const searchData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "获取列表数据中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    console.log("queryParams", queryParams);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryCardList({
      ...queryParams,
      page_num,
      page_size,
      rule
    });
    let cardList = res.data.cardList || [];
    // console.log("卡列表===>", cardList);
    tableData.value = cardList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取卡列表失败", error);
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
const getSummaries = param => {
  const { columns, data } = param;
  // console.log(columns, data);
  const sums = [];
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
    } else {
      const values = data.map(item => Number(item.balance));
      if (index === 4) {
        sums[4] = `${values.reduce((prev, curr) => {
          const value = Number(curr);
          if (!Number.isNaN(value)) {
            return prev + curr;
          } else {
            return prev;
          }
        }, 0)}`;
        sums[4] = Math.floor(sums[4]);
      } else {
        sums[index] = "N/A";
      }
    }
  });
  return sums;
};
const delay = delayTime => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delayTime);
  });
};
// 同步余额
const syncBalance = async () => {
  let phone = mobile.value;
  if (!phone) {
    ElMessage.warning("请先输入要同步的账号（手机号）");
    return;
  } else {
    ElMessage.info("本次同步只同步登录过的影院会员卡余额");
  }
  const loading = ElLoading.service({
    lock: true,
    text: "同步中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let loginInfoList = getCinemaLoginInfoList().filter(
      item => !UME_LIST.includes(item.app_name)
    );
    // 过滤一下已登录的
    let apiList = Object.entries(APP_API_OBJ).filter(
      // 如果有值证明就是登录过的
      item => {
        let obj = loginInfoList.find(
          itemA => itemA.app_name === item[0] && itemA.mobile == phone
        );
        return !!obj;
      }
    );
    console.log("过滤后的apiList", apiList);
    let cardRes = await svApi.queryCardList({
      page_num: 1,
      page_size: 500,
      rule
    });
    let serCardList = cardRes.data.cardList || [];
    let memberCardList = [];
    for (let index = 0; index < apiList.length; index++) {
      const [appName, api] = apiList[index];
      await delay(200);
      let session_id = loginInfoList.find(
        item => item.app_name === appName && item.mobile === phone
      )?.session_id;
      const res = await api.getCardList({
        city_id: "500",
        cinema_id: "1",
        session_id
      });
      let cardList = res.data.card_data || [];
      cardList = cardList.map(item => {
        return {
          card_id: item.id,
          card_num: item.card_num,
          cinema_id: item.cinema_id,
          cinema_name: item.cinema_name,
          card_status: item.card_status,
          valid_time: item.valid_time,
          integral: item.integral,
          balance: item.balance,
          default_card: item.default_card,
          level: item.level,
          mobile: phone,
          // card_discount: "",
          // card_pwd: "",
          // use_limit_day: "",
          app_name: appName
        };
      });
      memberCardList.push(...cardList);
    }
    console.log("本次同步会员卡余额拿到的数据信息", memberCardList);
    if (memberCardList.length) {
      let updateList = memberCardList
        .map(item => {
          return {
            id: serCardList.find(
              itemA =>
                itemA.card_id === item.card_id &&
                itemA.card_num === item.card_num &&
                itemA.app_name === item.app_name
            )?.id,
            balance: item.balance,
            default_card: item.default_card,
            card_status: item.card_status,
            update_time: getCurrentFormattedDateTime()
          };
        })
        .filter(item => item.id);
      // 过滤掉未在会员卡列表维护的数据
      let params = {
        updateList
      };
      console.log("同步余额入参", updateList);
      // for (let index = 0; index < updateList.length; index++) {
      //   const item = updateList[index];
      //   await svApi.updateCardRecord(item);
      // }
      await svApi.batchUpdateCardRecord(params);
      loading.close();
      ElMessage.success("同步成功！");
      searchData();
    }
  } catch (error) {
    console.warn("同步余额异常", error);
    loading.close();
  }
};

// 弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLine = ref("");
const mobile = ref("");

// 新增卡
const addCard = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: shadowLine.value });
};

// 编辑卡
const editCard = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存卡
const saveCard = async cardInfo => {
  try {
    cardInfo.update_time = getCurrentFormattedDateTime();
    cardInfo.rule = rule;
    if (cardInfo.id) {
      console.log("编辑保存卡", cardInfo);
      await svApi.updateCardRecord(cardInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      console.log("新增保存卡", cardInfo);
      await svApi.addCardRecord({ ...cardInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      ElMessage.success("保存成功！");
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存卡异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  formData.card_id = "";
  formData.card_num = "";
  formData.balance = "";
  formData.use_limit_day = "";
  formData.mobile = "";

  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行卡
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该卡吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteCard({ id: row.id });
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
      `批量删除 ${multipleSelection.value.length} 张卡?`,
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
        await svApi.batchDeleteCard({ delIds: ids });
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
<style scoped>
.red {
  color: red;
  font-weight: bold;
}
</style>
