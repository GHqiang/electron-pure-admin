<!-- 券类型列表 -->
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
      <el-main style="margin-left: 15px; padding: 0">
        <!-- 查询表单 -->
        <el-form :inline="true" class="demo-form-inline" label-width="80px">
          <el-form-item label="券类型">
            <el-select
              v-model="formData.quan_value"
              clearable
              filterable
              placeholder="券类型"
              style="width: 194px"
            >
              <el-option
                v-for="item in quanType"
                :key="item.id"
                :label="item.quan_name"
                :value="item.quan_value"
              />
            </el-select>
          </el-form-item>
          <!-- <el-form-item label="券名称">
            <el-input
              v-model="formData.quan_name"
              placeholder="请输入券名称"
              clearable
              style="width: 194px"
            />
          </el-form-item> -->
          <!-- <el-form-item label="券成本">
            <el-input
              v-model="formData.quan_cost"
              placeholder="请输入券成本"
              clearable
              style="width: 194px"
            />
          </el-form-item> -->
          <el-form-item label="券标识">
            <el-input
              v-model="formData.quan_flag"
              placeholder="请输入券标识"
              clearable
              style="width: 194px"
            />
          </el-form-item>
          <!-- <el-form-item label="券手续费">
            <el-input
              v-model="formData.quan_fee"
              placeholder="请输入券手续费"
              clearable
              style="width: 194px"
            />
          </el-form-item> -->
          <el-form-item label="是否入库">
            <el-select
              v-model="formData.is_store"
              placeholder="是否入库"
              style="width: 194px"
              clearable
            >
              <el-option label="是" value="1" />
              <el-option label="否" value="2" />
            </el-select>
          </el-form-item>
          <el-form-item class="demo-form-inline__submit">
            <el-button type="primary" @click="searchData">搜索</el-button>
            <el-button @click="resetForm">重置</el-button>
            <el-button
              type="primary"
              style="margin-left: 10px"
              @click="expireQuery"
              >临期查询</el-button
            >
            <el-button
              type="primary"
              style="margin-left: 10px"
              @click="getQuanInventory"
              >查询券库存</el-button
            >
            <el-button
              style="margin-left: 10px"
              type="primary"
              @click="queryQuanBalanceTotal"
              >查看券余额</el-button
            >
          </el-form-item>
          <el-form-item style="margin-left: 10px">
            <el-button
              type="danger"
              style="margin-left: 10px"
              :disabled="!hasSelected"
              @click="batchDelete"
              >批量删除</el-button
            >
            <el-button
              type="warning"
              style="margin-left: 10px"
              @click="getUnUseQuanHandle"
              >导出不可用券</el-button
            >

            <!-- 同步券库存 -->
            <!-- <el-button type="primary" style="padding-left: 0px; margin-left: 15px">
          <template #default>
            <el-input
              v-model="mobile"
              placeholder="所属账号(手机号)"
              clearable
              style="width: 350px; margin-left: -1px"
            >
              <template #prepend>
                <el-select
                  v-model="syncType"
                  placeholder="Select"
                  style="width: 150px"
                >
                  <el-option label="凤凰云智除外" value="1" />
                  <el-option label="仅同步凤凰云智" value="2" />
                </el-select>
              </template>
            </el-input>
            <span @click="syncQuanInfo">同步券库存</span>
          </template>
        </el-button> -->
          </el-form-item>
          <el-form-item>
            <el-button type="primary" style="padding-left: 0px">
              <template #default>
                <el-cascader
                  v-model="shadowLine"
                  :options="appCascaderOptions"
                  :props="appCascaderProps"
                  filterable
                  clearable
                  placeholder="影线名称"
                  style="width: 210px; margin-left: -1px"
                />
                <span @click="addQuan">新增</span>
              </template>
            </el-button>
          </el-form-item>
          <el-form-item>
            <el-upload
              ref="uploadRef"
              style="margin-left: 15px"
              class="upload-demo"
              :limit="1"
              :on-change="importQuan"
              action="#"
              accept=".xlsx, .xls"
              :auto-upload="false"
            >
              <template #trigger>
                <el-select
                  v-model="quan_value"
                  placeholder="券类型"
                  filterable
                  style="width: 150px; vertical-align: middle"
                >
                  <el-option
                    v-for="item in quanType"
                    :key="item.id"
                    :label="item.quan_name"
                    :value="item.quan_value"
                  />
                </el-select>
                <el-button type="primary">导入券</el-button>
              </template>
            </el-upload>
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="exportQuanNum"
              style="width: 320px; margin-left: 15px"
              placeholder="导出数量"
            >
              <template #prepend>
                <el-select
                  v-model="exportQuanValue"
                  style="width: 150px"
                  placeholder="券类型"
                  filterable
                >
                  <el-option
                    v-for="item in quanType"
                    :key="item.id"
                    :label="item.quan_name"
                    :value="item.quan_value"
                  />
                </el-select>
              </template>
              <template #append>
                <el-button type="primary" @click="getQuanHandle"
                  >导出券</el-button
                >
              </template>
            </el-input>
          </el-form-item>
        </el-form>
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
          <el-table-column prop="quan_name" label="券名称" min-width="180" />
          <el-table-column prop="quan_value" label="券类型" min-width="100" />
          <el-table-column
            prop="quan_cost"
            label="券成本"
            min-width="70"
            align="center"
          />
          <el-table-column prop="quan_flag" label="券标识" min-width="180" />
          <el-table-column prop="quan_fee" label="券手续费" min-width="100" />
          <el-table-column
            prop="is_store"
            label="是否入库"
            min-width="90"
            align="center"
          >
            <template #default="{ row: { is_store } }">
              <el-tag v-if="is_store == '1'" type="success" size="small"
                >是</el-tag
              >
              <el-tag v-else type="info" size="small">否</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="券库存" min-width="100">
            <template #default="{ row: { quan_stock, quanStockList } }">
              <span
                v-if="quanStockFormat({ quan_stock, quanStockList }) == 0"
                >{{ quanStockFormat({ quan_stock, quanStockList }) }}</span
              >
              <el-tag
                v-else
                type="success"
                size="small"
                effect="dark"
                class="transfer-label"
                style="padding: 0 8px; font-weight: 600"
              >
                {{ quanStockFormat({ quan_stock, quanStockList }) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="end_use_time"
            label="最后使用时间"
            min-width="160"
          >
            <template #default="{ row }">
              <span
                :class="getLastUseTimeClass(row)"
                title="红色为:最后使用时间距离今天超过10天且库存超过20,用户是否需要调整报价? 黄色为:最后使用时间超过四个月,该规则是否需要删除?"
              >
                {{ row.end_use_time }}
              </span>
            </template>
          </el-table-column>
          <el-table-column
            prop="update_time"
            label="更新时间"
            min-width="160"
          />
          <el-table-column
            prop="black_quans"
            label="黑名单券"
            min-width="100"
          />
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
                @click="editQuan(scope.row, '1')"
                >编辑</el-button
              >
              <el-button
                size="small"
                type="success"
                @click="editQuan(scope.row, '2')"
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
          style="margin-top: 10px; display: flex; justify-content: flex-end"
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="totalNum"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </el-main>
    </el-container>

    <QuanDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveQuan"
    />

    <el-dialog
      v-model="dialogQuanVisible"
      :title="`您确定要导出以下${exportQuanFlag == 1 ? '' : '不可用'}券数据吗`"
      max-width="500"
    >
      <el-table :data="exportQuanList" border max-height="400">
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="coupon_num" label="券号" min-width="180" />
        <el-table-column prop="quan_value" min-width="100" label="券类型" />
        <el-table-column
          v-if="exportQuanFlag == 2"
          prop="app_name"
          min-width="100"
          label="用券影院"
        />
        <el-table-column
          v-if="exportQuanFlag == 2"
          prop="use_time"
          min-width="120"
          label="绑券异常时间"
        />
        <el-table-column prop="create_time" min-width="100" label="入库时间" />
      </el-table>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogQuanVisible = false">取消</el-button>
          <el-button type="primary" @click="exportQuanHandle"> 确定 </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="dialogQueryQuanVisible"
      title="服务器券库存"
      width="800"
    >
      <el-table :data="quanData" border max-height="800">
        <el-table-column type="index" label="序号" width="80" />
        <el-table-column property="quan_name" sortable label="券名称" />
        <!-- <el-table-column property="quan_flag" sortable label="券标识" />
        <el-table-column property="quan_desc" sortable label="券描述" />
        <el-table-column property="quan_value" sortable label="券类型" /> -->
        <el-table-column property="quan_stock" sortable label="数量" />
        <el-table-column
          property="real_total_price"
          sortable
          label="实际价值"
        />
      </el-table>
    </el-dialog>

    <el-dialog v-model="quanBalanceVisible" width="50%" title="券余额汇总结果">
      <el-table :data="summaryData" border style="width: 100%" max-height="800">
        <el-table-column prop="appName" label="应用名称" width="180" />
        <el-table-column prop="totalBalance" sortable label="总余额" />
        <el-table-column
          prop="discountTotalBalance"
          sortable
          label="实际总余额"
        />
      </el-table>
    </el-dialog>

    <el-dialog v-model="quanExpireVisible" width="70%" title="临近过期券明细">
      <el-table :data="expireQuanList" border style="width: 100%">
        <el-table-column prop="app_name" label="应用名称" />
        <el-table-column prop="quan_flag" sortable label="券标识" />
        <el-table-column prop="quan_value" sortable label="券类型" />
        <el-table-column prop="real_quan_stock" sortable label="券库存" />
        <el-table-column prop="phone" sortable label="手机号" />
        <el-table-column prop="expire_time" sortable label="最快过期时间" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
defineOptions({
  // name 作为一种规范最好必须写上并且和路由的name保持一致
  name: "QuanTypeManage"
});
import {
  ref,
  reactive,
  toRaw,
  computed,
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
import QuanDialog from "@/components/QuanDialog.vue";
import { GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

import {
  getCurrentTime,
  parseExcel,
  createExcelDown,
  getCurrentDay,
  formatTimeOfTime
} from "@/utils/utils";
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

// 影线二级级联配置（系列 -> 影线）
const appCascaderOptions = treeData;
const appCascaderProps = {
  value: "value",
  label: "label",
  children: "children",
  emitPath: false
};
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
const uploadRef = ref(null);
// 表单查询数据
const formData = reactive({
  app_type: "",
  app_name: "",
  // quan_name: "",
  quan_value: "",
  quan_cost: "",
  quan_flag: "",
  quan_fee: "",
  is_store: ""
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
    let res = await svApi.queryQuanTypeList({
      ...queryParams,
      page_num,
      page_size
    });
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      item.end_use_time = item.end_use_time
        ? formatTimeOfTime(+new Date(item.end_use_time))
        : "";
    });
    // console.log("券类型列表===>", quanTypeList);
    tableData.value = quanTypeList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取卡列表失败", error);
  }
};

const quanExpireVisible = ref(false);
const expireQuanList = ref([]);
// 过期查询
const expireQuery = async () => {
  const params = {
    isNeedTotalNum: 0,
    queryFields: "id,app_name,quan_value,quan_flag,quanStockList"
  };
  try {
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
    });
    quanTypeList = quanTypeList
      .map(item =>
        item.quanStockList.map(itemA => ({
          ...itemA,
          app_name: item.app_name,
          quan_value: item.quan_value,
          quan_flag: item.quan_flag
        }))
      )
      .flat()
      .filter(
        item =>
          item.real_quan_stock > 0 &&
          item.endDateTime &&
          +new Date(item.endDateTime) - +new Date() < 15 * 24 * 60 * 60 * 1000
      );
    console.log("quanTypeList", quanTypeList);
    quanExpireVisible.value = true;
    expireQuanList.value = quanTypeList.map(item => ({
      ...item,
      expire_time: formatTimeOfTime(+new Date(item.endDateTime))
    }));
  } catch (error) {
    console.error("根据影院获取券类型列表返回异常", error);
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

// 同步券信息
const mobile = ref("");
const syncType = ref("1");

// 同步券信息
const syncQuanInfo = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      queryFields:
        "id,app_name,quan_value,quan_flag,quan_cost,quan_fee,quanStockList"
    };
    let res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList = quanTypeList.map(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      return item;
    });
  } catch (error) {
    console.error("同步券信息异常", error);
  }
};

const quanBalanceVisible = ref(false);
const summaryData = ref([]);
// 查看券余额
const queryQuanBalanceTotal = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      queryFields:
        "id,app_name,quan_value,quan_flag,quan_cost,quan_fee,quanStockList"
    };
    let res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList = quanTypeList
      .map(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        return item;
      })
      .filter(item => item.quanStockList.length);
    // 做去重处理
    let filterQuanList = [];
    quanTypeList.forEach(item => {
      let quanInfo = filterQuanList.find(
        itemA => itemA.quan_flag == item.quan_flag
      );
      if (!quanInfo) {
        // 找出最大价值的同名券计算券余额价值
        let targetQuanList = quanTypeList.filter(
          itemA =>
            itemA.quan_flag == item.quan_flag && itemA.app_name == item.app_name
        );
        targetQuanList = targetQuanList.sort((a, b) => a.quan_fee - b.quan_fee);
        let quanInfo = targetQuanList[0];
        filterQuanList.push(quanInfo);
      }
    });
    console.log("filterQuanList", filterQuanList);
    const summary = {};
    let totalBalance = 0,
      discountTotalBalance = 0;
    filterQuanList.forEach(item => {
      const appName = APP_LIST.value[item.app_name];
      const quan_cost_real = parseFloat(item.quan_cost) - (item.quan_fee || 0);
      const quan_num = item.quanStockList
        .map(item => +(item.real_quan_stock || item.quan_stock || 0))
        .reduce((prev, item) => prev + item, 0);
      const quan_balance = (+item.quan_cost * 1000 * quan_num) / 1000;
      const quan_balance_real = (quan_cost_real * 1000 * quan_num) / 1000;
      if (!summary[appName]) {
        summary[appName] = {
          appName,
          totalBalance: 0,
          discountTotalBalance: 0
        };
      }
      summary[appName].totalBalance += quan_balance;
      summary[appName].discountTotalBalance += quan_balance_real;
      totalBalance += quan_balance;
      discountTotalBalance += quan_balance_real || 0;
    });
    let balance_list = Object.values(summary);
    balance_list.unshift({
      appName: "总余额",
      totalBalance: totalBalance,
      discountTotalBalance
    });
    summaryData.value = balance_list.map(item => ({
      ...item,
      totalBalance: +item.totalBalance.toFixed(),
      discountTotalBalance: +item.discountTotalBalance.toFixed()
    }));
    quanBalanceVisible.value = true;
  } catch (error) {
    console.error("同步券信息异常", error);
  }
};

// 弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLine = ref("");

// 新增券类型
const addQuan = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: shadowLine.value });
};

// 编辑券类型
const editQuan = (row, type) => {
  console.log("row", row);
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 格式化券库存
const quanStockFormat = ({ quan_stock, quanStockList }) => {
  if (quanStockList?.length) {
    // 所有数相加当做券库存
    let totalNum = 0;
    quanStockList.forEach(item => {
      totalNum += +item.quan_stock || 0;
    });
    return totalNum;
  } else {
    return quan_stock;
  }
};

// 判断最后使用时间是否超过10天且库存超过20
const getLastUseTimeClass = row => {
  if (!row.end_use_time) return "";

  // 计算最后使用时间距离今天的天数
  const lastUseTime = new Date(row.end_use_time);
  const today = new Date();
  const diffTime = today - lastUseTime;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 计算券库存
  const stock = quanStockFormat({
    quan_stock: row.quan_stock,
    quanStockList: row.quanStockList
  });

  // 最后使用时间超过四个月（120天），不管有没有库存，都用黄色
  if (diffDays > 120) {
    return "yellow";
  }
  // 最后使用时间超过10天且库存超过20，用红色
  if (diffDays > 10 && stock > 20) {
    return "red";
  }
  return "";
};
// 保存券类型
const saveQuan = async cardInfo => {
  try {
    cardInfo.update_time = getCurrentTime();
    cardInfo.quanStockList = JSON.stringify(cardInfo.quanStockList);
    cardInfo.linkCinemaIds = cardInfo.linkCinemaIds?.join();
    let targetInfo = APP_TYPE_LIST.value.find(item =>
      item.app_name_list.includes(cardInfo.app_name)
    );
    if (targetInfo) {
      cardInfo.app_type = targetInfo.app_type_code;
    }
    console.log("新增/编辑保存券类型", JSON.parse(JSON.stringify(cardInfo)));
    if (cardInfo.id) {
      await svApi.updateQuanType(cardInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      await svApi.addQuanType({ ...cardInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      ElMessage.success("保存成功！");
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存券类型异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  // formData.quan_name = "";
  formData.quan_value = "";
  formData.quan_cost = "";
  formData.quan_flag = "";
  formData.quan_fee = "";
  formData.is_store = "";

  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 检查券是否在报价规则中被使用
const checkQuanInRules = async (app_name, quan_value) => {
  try {
    const res = await svApi.queryRuleList({
      shadowLineName: app_name
    });
    let ruleRecords = res.data.ruleList || [];
    ruleRecords = ruleRecords.filter(item => {
      const quanValueArray = item.quanValue ? item.quanValue.split(",") : [];
      return (
        item.shadowLineName === app_name && quanValueArray.includes(quan_value)
      );
    });
    return ruleRecords;
  } catch (error) {
    console.error("检查券在规则中使用情况异常", error);
    return [];
  }
};

// 删除单行券
const deleteRow = async (index, row) => {
  // 检查券是否在报价规则中被使用
  const usedRules = await checkQuanInRules(row.app_name, row.quan_value);
  console.log("usedRules", usedRules);
  if (usedRules.length > 0) {
    // 检查是否有规则包含多个券
    const multiQuanRules = usedRules.filter(rule => {
      const quanValueArray = rule.quanValue ? rule.quanValue.split(",") : [];
      return quanValueArray.length > 1;
    });

    let message = `该券在 ${usedRules.length} 个报价规则中被使用，是否同时删除这些规则？`;
    if (multiQuanRules.length > 0) {
      message += `\n注意：其中 ${multiQuanRules.length} 个规则包含多个券，删除后这些规则将被完全删除。`;
    }

    ElMessageBox.confirm(message, "提示", {
      confirmButtonText: "删除券和规则",
      cancelButtonText: "仅删除券",
      type: "warning",
      showClose: true,
      closeOnClickModal: true,
      closeOnPressEscape: true,
      distinguishCancelAndClose: true // 添加这个选项
    })
      .then(async () => {
        // 用户点击了"删除券和规则"按钮
        for (const rule of usedRules) {
          await svApi.deleteRule({ id: rule.id });
        }
        // 删除券
        await svApi.deleteQuanType({ id: row.id });
        searchData();
        ElMessage({
          type: "success",
          message: `删除完成，同时删除了 ${usedRules.length} 个相关规则`
        });
      })
      .catch(action => {
        // 当distinguishCancelAndClose为true时，action是一个对象
        const actionName = typeof action === "object" ? action.name : action;
        if (actionName === "cancel") {
          // 用户点击了"仅删除券"按钮
          svApi.deleteQuanType({ id: row.id }).then(() => {
            searchData();
            ElMessage({
              type: "success",
              message: "删除完成，相关规则未删除"
            });
          });
        } else {
          // 用户点击了关闭按钮、遮罩层或按ESC
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        }
      });
  } else {
    // 券未在规则中使用，直接删除
    ElMessageBox.confirm("确定要删除该券吗?", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      distinguishCancelAndClose: true // 这里也需要
    })
      .then(async () => {
        // 点击"确定"按钮
        await svApi.deleteQuanType({ id: row.id });
        searchData();
        ElMessage({
          type: "success",
          message: "删除完成"
        });
      })
      .catch(action => {
        if (action === "cancel") {
          // 用户点击了"取消"按钮
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        } else {
          // 用户点击了关闭按钮
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        }
      });
  }
};
// 批量删除券
const batchDelete = () => {
  if (multipleSelection.value.length) {
    ElMessageBox.confirm(
      `批量删除 ${multipleSelection.value.length} 张券?`,
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
        await svApi.batchDeleteQuanType({ delIds: ids });
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

// 券库存弹框
const dialogQueryQuanVisible = ref(false);
const quanData = ref([]); // 券库存列表

// 格式化券类型展示
const formatQuanType = quan_value => {
  return (
    quanType.value?.find(item => item.quan_value === quan_value)?.quan_name ||
    quan_value
  );
};

// 查询券库存
const getQuanInventory = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      is_store: 1,
      queryFields:
        "id,app_name,quan_name,quan_value,quan_flag,quan_desc,quan_cost,quan_fee,is_base_quan"
    };
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes.data.quanTypeList || [];
    console.warn("quanTypeList", quanTypeList);
    const res = await svApi.queryQuanInventory();
    console.warn("查询券库存返回", res);
    let quanList = res.data?.quanList;
    let total_num = 0,
      total_price = 0;
    let quanDataList = [];
    quanTypeList.forEach(item => {
      const {
        app_name,
        quan_name,
        is_base_quan,
        quan_flag,
        quan_desc,
        quan_value
      } = item;
      let index = quanDataList.findIndex(
        itemA => itemA.quan_flag == quan_flag && itemA.quan_desc == quan_desc
      );
      let quan_stock =
        quanList.find(item => item.quan_value == quan_value)?.remaining_count ||
        0;
      if (index == -1) {
        quanDataList.push({
          app_name,
          quan_name,
          quan_value,
          quan_flag,
          quan_desc,
          quan_stock
        });
      } else {
        quanDataList[index].quan_stock += quan_stock;
        // 同名券合并后按照基础券的券名称显示
        if (is_base_quan == 1) {
          quanDataList[index].quan_value = quan_value;
          quanDataList[index].quan_name = quan_name;
        }
      }
    });
    quanDataList = quanDataList.map(item => {
      let targetQuanList = quanTypeList.filter(
        itemA =>
          itemA.quan_flag == item.quan_flag &&
          itemA.app_name == item.app_name &&
          itemA.quan_desc == item.quan_desc
      );
      // 找出最大价值的同名券计算券库存
      targetQuanList = targetQuanList.sort((a, b) => a.quan_fee - b.quan_fee);
      let quanInfo = targetQuanList[0];
      let real_total_price = 0;
      if (quanInfo) {
        const quan_cost_real =
          parseFloat(quanInfo.quan_cost) - (quanInfo.quan_fee || 0);
        real_total_price = (quan_cost_real * 1000 * item.quan_stock) / 1000;
      }
      total_num += item.quan_stock;
      total_price += real_total_price;
      return {
        ...item,
        real_total_price
      };
    });
    console.warn("quanDataList", quanDataList);
    quanDataList.unshift({
      quan_flag: "总余额",
      quan_stock: total_num,
      real_total_price: total_price
    });
    dialogQueryQuanVisible.value = true;
    quanData.value = quanDataList;
  } catch (error) {
    console.warn("查询券库存返回异常", error);
  }
};

// 券类型列表
const quanType = ref([]);
// 券类型（下载模版使用）
const quan_value = ref("");

// 导入券
const importQuan = async (uploadFile, uploadFiles) => {
  if (!quan_value.value) {
    ElMessage({
      type: "warning",
      message: "请先选择要导入的券类型"
    });
    return;
  }
  const loading = ElLoading.service({
    lock: true,
    text: "上传中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    console.log("uploadFile", uploadFile, uploadFiles);
    const res = await parseExcel(uploadFile.raw);
    console.warn("解析表格文件返回", res);
    if (res) {
      let tableDate = [...(res.header ?? []), ...res.content];
      console.warn("表格内容数据", tableDate);
      let quanTypeInfo = quanType.value.find(
        item => item.quan_value == quan_value.value
      );
      console.warn("要导入的券类型信息", quanTypeInfo);
      tableDate = tableDate
        .map(item => {
          return {
            app_name: quanTypeInfo.app_name,
            coupon_num: item[0] ? String(item[0]).trim() : "",
            quan_value: quanTypeInfo.quan_value,
            quan_status: "1",
            create_time: getCurrentDay()
          };
        })
        .filter(item => item.coupon_num);
      console.warn("最终组装好要上传的数据", tableDate);
      // 先查一下库里面的券过滤一下，如果存在该券已使用就不执行导入了
      let params = {
        quan_value: quanTypeInfo.quan_value,
        app_name: quanTypeInfo.app_name,
        haveQuans: tableDate.map(item => item.coupon_num).join(",")
      };
      let quanRes = await svApi.queryQuanRecordList(params);
      let quanList = quanRes?.data?.quanList || [];
      // 1-未使用 2-已绑定 3-绑定异常 4-正常券导出 5-不可用券导出
      quanList = quanList
        .filter(item => ["1", "2", "3"].includes(item.quan_status))
        .map(item => item.coupon_num);
      console.log("quanList", quanList);
      tableDate = tableDate.filter(item => !quanList.includes(item.coupon_num));
      console.log("tableDate", tableDate);
      if (!tableDate.length) {
        ElMessage({
          type: "warning",
          message: "导入失败，根据库里去重后没有可以导入的券"
        });
      } else {
        await svApi.batchAddQuan({
          addList: tableDate
        });
        ElMessage({
          type: "success",
          message: "导入成功，请查询券库存检查"
        });
      }
      uploadRef.value?.clearFiles();
      loading.close();
    }
  } catch (error) {
    console.error("导入券异常", error);
    ElMessage({
      type: "warning",
      message: "导入失败，请联系技术解决"
    });
    loading.close();
    uploadRef.value?.clearFiles();
  }
};
// 导出券标识
const exportQuanFlag = ref("1"); // 1-可用券 2不可用券

// 导出券类型
const exportQuanNum = ref("");
// 导出券数量
const exportQuanValue = ref("");
// 导出券弹框
const dialogQuanVisible = ref(false);
// 导出券弹框展示列表
const exportQuanList = ref([]);
// 导出券
const getQuanHandle = async () => {
  try {
    if (!exportQuanNum.value || !exportQuanValue.value) {
      return ElMessage({
        type: "warning",
        message: "请先选择要导出的券类型和券数量"
      });
    }
    let quanTypeInfo = quanType.value.find(
      item => item.quan_value == exportQuanValue.value
    );
    let params = {
      quan_value: quanTypeInfo.quan_value,
      app_name: quanTypeInfo.app_name,
      black_quans: quanTypeInfo.black_quans,
      quan_status: "1",
      page_num: 1,
      page_size: +exportQuanNum.value
    };
    let quanRes = await svApi.queryQuanList(params);
    let quanList = quanRes?.data?.quanList || [];
    exportQuanFlag.value = 1;
    dialogQuanVisible.value = true;
    exportQuanList.value = quanList;
  } catch (error) {
    console.warn("获取券异常", error);
  }
};

// 导出券
const exportQuanHandle = async () => {
  try {
    // 1-可用券 2不可用券
    let exportQuanFlagValue = exportQuanFlag.value;
    let tableData = toRaw(exportQuanList.value);

    let params = {
      coupon_num_list: tableData.map(item => item.coupon_num)
    };
    let quanValueStr = exportQuanValue.value;
    if (exportQuanFlagValue == 1) {
      let quanTypeInfo = quanType.value.find(
        item => item.quan_value == quanValueStr
      );
      params.quan_value = quanTypeInfo.quan_value;
      params.app_name = quanTypeInfo.app_name;
      params.quan_status = 4;
    } else if (exportQuanFlagValue == 2) {
      params.quan_status = 5;
    }
    console.warn("导出文件传参", params);
    // 先调接口更新状态，并更新导出人及使用时间
    const res = await svApi.exportQuanList(params);
    tableData = tableData.map(item => [
      item.coupon_num,
      item.quan_value,
      item.create_time,
      item.use_time
    ]);
    tableData.unshift(["券号", "券类型", "入库时间", "绑定异常时间"]);
    const today = getCurrentDay();
    let fileName = `${quanValueStr || "不可用券"}_${tableData.length - 1}张_${today}.xlsx`;
    console.warn("tableData", tableData, "fileName", fileName);
    createExcelDown(tableData, fileName);
    dialogQuanVisible.value = false;
    exportQuanList.value = [];
    exportQuanValue.value = "";
    exportQuanNum.value = "";
  } catch (error) {
    console.warn("获取券异常", error);
  }
};

// 导出不可用券
const getUnUseQuanHandle = async () => {
  try {
    let params = {
      quan_status: "3",
      queryFields: "id,app_name,coupon_num,quan_value,create_time,use_time"
    };
    let quanRes = await svApi.queryQuanList(params);
    let quanList = quanRes?.data?.quanList || [];
    exportQuanFlag.value = 2;
    dialogQuanVisible.value = true;
    exportQuanList.value = quanList;
  } catch (error) {
    console.warn("获取不可用券异常", error);
  }
};

// 获取券类型列表
const getQuanTypeList = async () => {
  try {
    const params = {
      page_num: 1,
      page_size: 1000
    };
    const res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    // console.log("券类型列表===>", quanTypeList);
    quanType.value = quanTypeList;
  } catch (error) {
    console.error("获取券类型列表异常", error);
  }
};
onBeforeMount(async () => {
  await getQuanTypeList();
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
.special-item :deep(.el-form-item__content) {
  align-items: baseline;
}
.red {
  color: red;
  font-weight: bold;
}
.yellow {
  color: orange;
  font-weight: bold;
}
.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}
.special-tree :deep(.el-form-item__content) {
  align-items: baseline;
}
.upload-demo {
  margin-top: 10px;
}

.demo-form-inline .el-form-item__content {
  flex: 1;
  min-width: 0;
}
</style>
