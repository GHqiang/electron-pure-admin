<!-- 会员卡列表 -->
<template>
  <div>
    <el-container>
      <el-aside width="200px">
        <el-input
          v-model="filterText"
          class="w-60 mb-2"
          placeholder="可输入影院过滤"
        />
        <!-- 左侧树 -->
        <el-tree
          ref="treeRef"
          class="tree-list"
          :data="treeData"
          node-key="id"
          highlight-current
          style="max-height: 650px; overflow-y: auto"
          :default-expanded-keys="[1]"
          :props="defaultProps"
          :filter-node-method="filterNode"
          @node-click="nodeClick"
        />
      </el-aside>
      <el-main style="padding: 0; margin-left: 15px">
        <!-- 查询表单 -->
        <el-form :inline="true" class="demo-form-inline">
          <el-form-item
            :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`"
          >
            <el-select
              v-model="formData.status"
              placeholder="卡状态"
              style="width: 194px"
              clearable
            >
              <el-option label="正常" value="1" />
              <el-option label="无效" value="2" />
            </el-select>
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
          <!-- <el-form-item label="目标余额">
            <el-input
              v-model="formData.balance"
              placeholder="请输入目标余额"
              clearable
            />
          </el-form-item> -->
          <el-form-item label="所属账号">
            <el-input
              v-model="formData.mobile"
              placeholder="请输入所属账号(手机号)"
              clearable
            />
          </el-form-item>
          <el-form-item label="日出票限制">
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
          </el-form-item>
          <el-form-item>
            <el-button
              type="danger"
              :disabled="!hasSelected"
              @click="batchDelete"
              >批量删除</el-button
            >
            <el-button
              type="warning"
              :disabled="!hasSelected"
              @click="batchUpdateDiscount"
              >批量改折扣</el-button
            >
            <el-button
              style="margin-left: 10px"
              type="primary"
              @click="queryCardBalanceTotal"
              >查看卡余额</el-button
            >
            <el-button type="primary" style="padding-left: 0">
              <template #default>
                <el-input
                  v-model="mobile"
                  placeholder="手机号(可不输入同步所有账号)"
                  clearable
                  style="width: 370px; margin-left: -1px"
                >
                  <template #prepend>
                    <el-select
                      v-model="syncType"
                      placeholder="Select"
                      style="width: 150px"
                    >
                      <el-option label="凤凰云智、卢米埃除外" value="1" />
                      <el-option label="仅同步凤凰云智" value="2" />
                      <el-option label="仅同步卢米埃" value="3" />
                    </el-select>
                  </template>
                </el-input>
                <span @click="syncCardInfo">同步卡信息</span>
              </template>
            </el-button>
            <el-button
              style="margin-left: 10px"
              type="primary"
              @click="queryCardBalanceTotal"
              >查看卡余额</el-button
            >
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
          <el-table-column
            prop="cinema_name"
            label="影院名称"
            min-width="150"
          />
          <el-table-column prop="mobile" label="所属账号" min-width="120" />
          <el-table-column prop="status" label="卡 状态" min-width="80">
            <template #default="{ row }">
              <span :class="{ red: row.status != 1 }">{{
                row.status == "1" ? "正常" : "无效"
              }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="balance" label="卡 余额" min-width="80">
            <template #default="{ row }">
              <span :class="{ red: row.balance <= 200 }">{{
                row.balance
              }}</span>
            </template>
          </el-table-column>

          <el-table-column
            prop="card_discount"
            label="卡 折扣"
            min-width="80"
          />
          <!-- <el-table-column prop="card_id" label="卡 ID" min-width="80" /> -->
          <el-table-column prop="card_num" label="卡 号" min-width="120" />
          <!-- <el-table-column prop="card_pwd" label="卡 密码" min-width="110" /> -->
          <el-table-column
            prop="use_limit_day"
            label="日出票限制"
            min-width="100"
          />
          <el-table-column prop="use_limit_day" label="日出票量" min-width="90">
            <template #default="{ row: { daily_usage, usage_date } }">
              <span>{{
                usage_date !== getCurrentDay() ? 0 : daily_usage || 0
              }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="use_limit_month"
            label="月出票限制"
            min-width="100"
          />
          <el-table-column prop="monthly_usage" label="月出票量" min-width="90">
            <template #default="{ row: { monthly_usage, usage_date } }">
              <span>{{
                !isDateInCurrentMonth(usage_date) ? 0 : monthly_usage || 0
              }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="update_time"
            label="更新时间"
            min-width="160"
          />

          <el-table-column label="是否默认卡" min-width="100">
            <template #default="{ row }">
              <span>{{ row.default_card === "1" ? "是" : "否" }}</span>
            </template>
          </el-table-column>
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
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          style="display: flex; justify-content: flex-end; margin-top: 10px"
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="totalNum"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </el-main>
    </el-container>

    <CardDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveCard"
    />

    <el-dialog
      v-model="batchDiscountVisible"
      width="40%"
      title="批量修改卡折扣"
    >
      <el-form
        ref="batchDiscountFormRef"
        :model="batchDiscountForm"
        :rules="batchDiscountRules"
      >
        <el-form-item label="卡折扣" prop="card_discount">
          <el-input
            v-model="batchDiscountForm.card_discount"
            placeholder="请输入卡折扣（成本/卡金额）"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="batchDiscountVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmBatchUpdate">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="cardBalanceVisible" width="60%" title="卡余额汇总结果">
      <el-table :data="summaryData" border style="width: 100%" max-height="800">
        <el-table-column prop="appName" label="应用名称" width="180" />
        <el-table-column prop="totalBalance" sortable label="总余额" />
        <el-table-column
          prop="discountTotalBalance"
          sortable
          label="实际总余额"
        />
        <el-table-column
          prop="status1Balance"
          label="有效卡总余额"
          sortable
          width="180"
        />
        <el-table-column
          prop="notStatus1Balance"
          label="无效卡总余额"
          sortable
          width="180"
        />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
defineOptions({
  name: "cardList"
});
import {
  ref,
  reactive,
  computed,
  h,
  onBeforeMount,
  nextTick,
  watch
} from "vue";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import CardDialog from "@/components/CardDialog.vue";
import {
  GET_APP_LIST,
  GET_H5_UME_LIST,
  GET_APP_TYPE_LIST,
  GET_USABLE_APP_LIST
} from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

import {
  getCurrentTime,
  getCinemaLoginInfoList,
  getCurrentDay,
  isDateInCurrentMonth,
  mockDelay
} from "@/utils/utils";

// 影院基础方法
import useCinemaBaseFun from "@/mixins/useCinemaBaseFun";
const { getCardListByApp } = useCinemaBaseFun();
// 机器基础方法
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
const { addCardListHandle, updateCardListHandle, queryCardBalance } =
  usesMachineBaseFun();

// 树节点属性映射
const defaultProps = {
  children: "children",
  label: "label"
};
// 定义树形结构数据
const treeData = APP_TYPE_LIST.value.map((item, inx) => {
  return {
    id: inx + 1,
    label: item.app_type_name,
    value: item.app_type_code,
    children: item.app_name_list.map((itemA, index) => ({
      id: index + 1 + (inx + 1) * 100,
      label: APP_LIST.value[itemA],
      value: itemA
    }))
  };
});
// 树过滤
const filterText = ref("");
const filterNode = (value, data) => {
  if (!value) return true;
  return data.label.includes(value);
};

// 树组件的引用
const treeRef = ref(null);
watch(filterText, val => {
  treeRef.value.filter(val);
});

const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_type: "",
  app_name: "",
  card_id: "",
  card_num: "",
  balance: "",
  use_limit_day: "",
  mobile: ""
});

// 树节点点击
const nodeClick = nodeData => {
  console.log("nodeData", nodeData);
  if (nodeData.id < 100) {
    formData.app_type = nodeData.value;
    formData.app_name = "";
  } else {
    formData.app_name = nodeData.value;
    formData.app_type = "";
  }
  searchData();
};

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
      if (index === 5) {
        sums[5] = `${values.reduce((prev, curr) => {
          const value = Number(curr);
          if (!Number.isNaN(value)) {
            return prev + curr;
          } else {
            return prev;
          }
        }, 0)}`;
        sums[5] = Math.floor(sums[5]);
      } else {
        sums[index] = "N/A";
      }
    }
  });
  return sums;
};

const cardBalanceVisible = ref(false);
const summaryData = ref([]);
// 查看卡余额
const queryCardBalanceTotal = async () => {
  try {
    // 假设这里是您之前定义的获取数据的方法
    const balance_list = await queryCardBalance();
    summaryData.value = balance_list;
    cardBalanceVisible.value = true;
  } catch (err) {
    console.warn("查看卡余额异常", err);
  }
};

// 同步卡信息
const syncCardInfo = async () => {
  let phone = mobile.value;
  let syncFlag = syncType.value;
  let appName = formData.app_name;
  console.warn("appName", appName, "phone", phone, "syncFlag", syncFlag);
  let pro1;

  let tips = "本次同步只同步登录过的影院会员卡信息，";
  if (appName) {
    tips = "本次同步只同步" + APP_LIST.value[appName];
  } else {
    tips +=
      syncFlag == 1
        ? "不包含凤凰云智h5、卢米埃系列"
        : syncFlag == 2
          ? "仅同步凤凰云智h5系列"
          : "仅同步卢米埃系列";
  }
  if (appName === "lma" || syncFlag == 3) {
    tips =
      tips +
      "，卢米埃同步时请先暂停队列或者关闭卢米埃报价规则，否则会造成卢米埃出票异常";
  }
  let confirmResolve;
  pro1 = () =>
    new Promise(resolve => {
      confirmResolve = resolve;
    });
  ElMessageBox.confirm(tips, "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      confirmResolve();
    })
    .catch(() => {
      ElMessage({
        type: "info",
        message: "取消同步"
      });
    });
  await pro1();
  console.warn("开始同步");
  const loading = ElLoading.service({
    lock: true,
    text: "同步中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    // 1、拿到该手机号已维护登录信息的影院列表
    let loginInfoList = getCinemaLoginInfoList().filter(itemA => {
      let checkPhone = phone ? itemA.mobile == phone : true;
      let checkAppName = appName ? itemA.app_name == appName : true;
      let checkSyncFlag = appName
        ? true
        : syncFlag == 1
          ? ![...H5_UME_LIST.value, "lma"].includes(itemA.app_name)
          : syncFlag == 2
            ? H5_UME_LIST.value.includes(itemA.app_name)
            : itemA.app_name == "lma";
      let checkUsable = GET_USABLE_APP_LIST()?.["" + itemA.app_name];
      return checkPhone && checkAppName && checkSyncFlag && checkUsable;
    });
    console.warn("该手机号的loginInfoListt", loginInfoList);
    console.warn("该系列的手机号列表", [
      ...new Set(loginInfoList.map(itemA => itemA.mobile))
    ]);
    if (!loginInfoList?.length) {
      ElMessage.warning("该系列没有维护登录信息，无法同步");
      loading.close();
      return;
    }
    let app_ame = formData.app_name || (syncFlag == 3 ? "lma" : undefined);
    // 2、获取服务端已维护的卡列表
    let cardRes = await svApi.queryCardList({
      page_num: 1,
      page_size: app_ame ? 50 : 1500,
      rule: rule,
      mobile: phone || undefined,
      app_name: app_ame
    });
    let serCardList = cardRes.data?.cardList || [];
    serCardList = serCardList.filter(itemA => {
      let checkSyncFlag = appName
        ? true
        : syncFlag == 1
          ? ![...H5_UME_LIST.value, "lma"].includes(itemA.app_name)
          : syncFlag == 2
            ? H5_UME_LIST.value.includes(itemA.app_name)
            : itemA.app_name == "lma";
      let checkUsable = GET_USABLE_APP_LIST()?.["" + itemA.app_name];
      return checkSyncFlag && checkUsable;
    });
    console.warn("该系列的serCardList", serCardList);
    let memberCardList = [],
      abnormalLoginInfoList = [];
    for (let index = 0; index < loginInfoList.length; index++) {
      const { app_name, session_id, mobile } = loginInfoList[index];
      let cardList = await getCardListByApp(
        app_name,
        mobile,
        session_id,
        index,
        abnormalLoginInfoList
      );
      memberCardList.push(...cardList);
    }
    console.log("本次同步会员卡余额拿到的数据信息", memberCardList);
    console.warn("该系列失效的登录信息列表", abnormalLoginInfoList);
    if (memberCardList.length) {
      memberCardList = memberCardList.map(item => {
        return {
          id: serCardList.find(
            itemA =>
              itemA.card_id === item.card_id &&
              itemA.card_num === item.card_num &&
              itemA.app_name === item.app_name
          )?.id,
          ...item
        };
      });
      console.warn("memberCardList", memberCardList);
      let addCardList = memberCardList.filter(item => !item.id);
      console.warn("准备新增的卡列表", addCardList);

      let updateCardList = memberCardList
        .filter(item => {
          return item.id && item.balance !== undefined;
        })
        .map(item => ({
          id: item.id,
          balance: item.balance,
          linkCinemaIds: item.linkCinemaIds,
          update_time: getCurrentTime()
        }));
      console.warn("准备更新的卡列表", updateCardList);
      let unUseCardList = serCardList.filter(item => {
        return (
          !memberCardList.some(
            itemA =>
              itemA.app_name === item.app_name &&
              itemA.card_num === item.card_num
          ) && item.status === "1"
        );
      });
      console.warn("无效卡列表", unUseCardList);
      if (addCardList.length) {
        await addCardListHandle(addCardList);
      }
      if (updateCardList?.length) {
        await updateCardListHandle(updateCardList);
      }
      if (unUseCardList.length) {
        const messageContent = h("div", null, [
          h("p", null, "以下是查出来的服务端的无效卡"),
          h(
            "ul",
            null,
            unUseCardList.map(card =>
              h("li", null, [
                h("span", { style: "margin-right: 10px;" }, `ID: ${card.id}`),
                h(
                  "span",
                  { style: "margin-right: 10px;" },
                  `卡号: ${card.card_num}`
                ),
                h(
                  "span",
                  { style: "margin-right: 10px;" },
                  `影线: ${card.app_name}`
                ),
                h(
                  "span",
                  { style: "margin-right: 10px;" },
                  `影院: ${card.cinema_name}`
                )
              ])
            )
          )
        ]);
        ElMessageBox({
          title: "确定要将以下无效卡置为无效吗？",
          message: messageContent,
          showCancelButton: true,
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        })
          .then(async () => {
            // 用户点击确认按钮后的操作
            console.log("User confirmed the update.");
            let updateList = unUseCardList.map(item => ({
              id: item.id,
              status: "2",
              update_time: getCurrentTime()
            }));
            const isUpdatePass = await updateCardListHandle(updateList);
            if (!isUpdatePass) {
              ElMessage.success("置为无效失败，可考虑手动逐个编辑为无效");
            }
            loading.close();
            searchData();
          })
          .catch(() => {
            loading.close();
            ElMessage.success("同步余额及新增卡成功！");
            searchData();
          });
      } else {
        loading.close();
        ElMessage.success("同步卡信息成功！");
        searchData();
      }
    } else {
      loading.close();
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
const syncType = ref("1");

// 批量修改折扣相关
const batchDiscountVisible = ref(false);
const batchDiscountForm = reactive({
  card_discount: ""
});
const batchDiscountFormRef = ref(null);
const batchDiscountRules = {
  card_discount: [
    { required: true, message: "卡折扣不能为空", trigger: "blur" }
  ]
};

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
    cardInfo.update_time = getCurrentTime();
    cardInfo.rule = rule;
    cardInfo.linkCinemaIds = cardInfo.linkCinemaIds?.join();
    let targetInfo = APP_TYPE_LIST.value.find(item =>
      item.app_name_list.includes(cardInfo.app_name)
    );
    if (targetInfo) {
      cardInfo.app_type = targetInfo.app_type_code;
    }
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

// 批量修改折扣
const batchUpdateDiscount = () => {
  if (multipleSelection.value.length) {
    // 重置表单
    batchDiscountForm.card_discount = "";
    // 打开对话框
    batchDiscountVisible.value = true;
  }
};

// 确认批量修改折扣
const confirmBatchUpdate = async () => {
  batchDiscountFormRef.value.validate(async valid => {
    if (valid) {
      const loading = ElLoading.service({
        lock: true,
        text: "批量修改中",
        background: "rgba(0, 0, 0, 0.7)"
      });
      try {
        // 逐个修改选中的卡
        const updatePromises = multipleSelection.value.map(async item => {
          const cardInfo = {
            id: item.id,
            card_discount: batchDiscountForm.card_discount,
            update_time: getCurrentTime(),
            rule: rule
          };
          await svApi.updateCardRecord(cardInfo);
        });

        // 等待所有修改完成
        await Promise.all(updatePromises);

        loading.close();
        batchDiscountVisible.value = false;
        ElMessage({
          type: "success",
          message: `批量修改 ${multipleSelection.value.length} 张卡折扣成功！`
        });
        searchData();
      } catch (error) {
        loading.close();
        console.warn("批量修改折扣异常", error);
        ElMessage({
          type: "error",
          message: "批量修改折扣失败"
        });
      }
    }
  });
};
onBeforeMount(async () => {
  await mockDelay(0.1);
  nextTick(() => {
    if (treeRef.value) {
      treeRef.value.setCurrentKey(1);
      formData.app_type = "ume_applet";
      searchData();
    }
  });
});
</script>
<style scoped>
.red {
  font-weight: bold;
  color: red;
}

.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}
</style>
