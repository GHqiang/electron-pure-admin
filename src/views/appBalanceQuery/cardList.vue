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
      <el-form-item :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`">
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
        <!-- <el-button type="primary" style="padding-left: 0px">
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
        </el-button> -->
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
        >
        <el-button type="primary" style="padding-left: 0px">
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
                  <el-option label="凤凰云智、卢米埃除外" value="1" />
                  <el-option label="仅同步凤凰云智" value="2" />
                  <el-option label="仅同步卢米埃" value="3" />
                </el-select>
              </template>
            </el-input>
            <span @click="syncCardInfo">同步卡信息</span>
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
      <el-table-column prop="status" label="卡 状态" min-width="80">
        <template #default="{ row }">
          <span :class="{ red: row.status != 1 }">{{
            row.status == "1" ? "正常" : "无效"
          }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="balance" label="卡 余额" min-width="80">
        <template #default="{ row }">
          <span :class="{ red: row.balance <= 200 }">{{ row.balance }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="card_discount" label="卡 折扣" min-width="80" />
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
      <el-table-column prop="update_time" label="更新时间" min-width="160" />

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
import { ref, reactive, computed, h } from "vue";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import CardDialog from "@/components/CardDialog.vue";
import {
  APP_LIST,
  UME_LIST,
  H5_UME_LIST,
  H5_UME_CINEMA_OBJ
} from "@/common/constant";
import { APP_API_OBJ } from "@/common/index.js";
import {
  getCurrentTime,
  formatTimeOfTime,
  getCinemaLoginInfoList,
  getCurrentDay,
  isDateInCurrentMonth,
  mockDelay
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

// 获取会员卡
const getCardListByApp = async (app_name, phone, session_id, index) => {
  let params = {};
  let cardList = [];
  if (!session_id) {
    // console.log("getCinemaLoginInfoList()", getCinemaLoginInfoList());
    let loginInfoList = getCinemaLoginInfoList().filter(
      itemA => itemA.app_name == app_name && itemA.mobile == phone
    );
    session_id = loginInfoList[0]?.session_id;
  }
  try {
    if (UME_LIST.includes(app_name)) {
      params.params = {
        status: "CAN_USED",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001"
        // cinemaCode: "11015502",
        // cinemaLinkId: "15953"
      };
      params.session_id = session_id;
    } else if (H5_UME_LIST.includes(app_name)) {
      params = {
        cinemaLinkId: H5_UME_CINEMA_OBJ[app_name][0],
        pageNo: 1,
        pageSize: 30,
        umeToken: session_id
      };
    } else if (app_name === "lma") {
      params.lmaToken = session_id;
    } else {
      // params.city_id = "500";
      // params.cinema_id = "1";
      params.session_id = session_id;
    }
    await mockDelay(H5_UME_LIST.includes(app_name) ? 0.5 : 0.1);
    if (index % 5) {
      await mockDelay(1);
    }
    const res = await APP_API_OBJ[app_name].getCardList(params);
    console.warn("获取会员卡列表返回", res);
    // 只获取有效卡，无效卡要过滤掉
    if (UME_LIST.includes(app_name)) {
      cardList = res.data || [];
      cardList = cardList.filter(item => item.cardStatus === "ENABLED");
      cardList = cardList.map(item => ({
        card_id: item.cardInstanceId + "",
        card_num: item.cardNo,
        balance: item.cardAmount / 100 + ""
      }));
    } else if (H5_UME_LIST.includes(app_name)) {
      cardList = res.bizValue || [];
      cardList = cardList.map(item => ({
        card_id: item.cardNumber,
        card_num: item.cardNumber,
        balance: (item.balance || 0) / 100 + ""
      }));
    } else if (app_name === "lma") {
      // 卢米埃只获取主卡，其它的出票后更新卡余额
      cardList = res.data?.sleep || [];
      cardList.unshift({
        card_number: res.data.card_number,
        balance: res.data.money_str,
        is_main_card: 1
      });
      cardList = cardList.map(item => ({
        card_id: item.card_number + "",
        card_num: item.card_number,
        balance: item.balance,
        is_main_card: item.is_main_card
      }));
      const card_list = await getLmaOtherCardBalance(cardList, session_id);
      cardList = card_list;
    } else {
      // sfc系列
      cardList = res.data?.card_data || [];
      cardList = cardList
        .filter(item => item.card_status === "1")
        .map(item => {
          return {
            card_id: item.id + "", // 卡id
            card_num: item.card_num, // 卡号
            balance: item.balance + "", // 卡余额
            cinema_name: item.cinema_name // 卡关联影院
          };
        });
    }
    console.warn("获取会员卡列表返回的cardList", cardList);
    cardList = cardList.map(item => ({
      ...item,
      app_name,
      mobile: phone
    }));
    return cardList;
  } catch (err) {
    console.warn("获取会员卡列表异常", err, params, app_name);
    return [];
  }
};

// 卢米埃获取其它卡余额
const getLmaOtherCardBalance = async (cardList, session_id) => {
  let card_list = JSON.parse(JSON.stringify(cardList));
  for (let index = 1; index < card_list.length; index++) {
    const item = card_list[index];
    const changeCardRes = await changeCardHandle({
      card_number: item.card_num,
      lmaToken: session_id
    });
    if (!changeCardRes?.error) {
      item.balance = changeCardRes?.data?.money_str || "0";
    }
  }
  // 再切换为主卡
  await changeCardHandle({
    card_number: card_list[0].card_num,
    lmaToken: session_id
  });
  return card_list;
};
// 卢米埃切换卡
const changeCardHandle = async ({ card_number, lmaToken }) => {
  try {
    let params = {
      card_number,
      lmaToken
    };
    console.log("切换卡参数", params);
    const res = await APP_API_OBJ["lma"].changeCard(params);
    console.log("切换卡返回", res);
    return res;
  } catch (error) {
    console.error("切换卡异常", error);
    return {
      error
    };
  }
};
window.getCardListByApp = getCardListByApp;
// window.getCardListByApp("hsmzyc", "13073792313")
// 同步卡信息时新增卡
const addCardListHandle = async cardList => {
  try {
    let params = {
      addCardList: cardList.map(item => {
        let card_discount = "100";
        let use_limit_day = "";
        let use_limit_month;
        if (UME_LIST.includes(item.app_name)) {
          // card_discount = "78";
          use_limit_day = "12";
        } else if (item.app_name === "lma") {
          // card_discount = "78";
          use_limit_day = "8";
          use_limit_month = "20";
        }
        return {
          ...item,
          card_discount,
          use_limit_day,
          use_limit_month,
          status: "1",
          rule: rule,
          update_time: getCurrentTime()
        };
      })
    };
    console.warn("新增卡列表参数", params);
    const res = await svApi.batchAddCardRecord(params);
    console.warn("新增卡列表返回", res);
  } catch (error) {
    console.warn("新增卡列表异常", error);
  }
};

// 同步卡信息时更新余额
const updateCardListHandle = async cardList => {
  try {
    let params = {
      updateList: cardList
    };
    console.warn("更新卡列表参数", params);
    const res = await svApi.batchUpdateCardRecord(params);
    console.warn("更新卡列表返回", res);
    return true;
  } catch (error) {
    console.warn("更新卡列表异常", error);
  }
};

// 同步卡信息
const syncCardInfo = async () => {
  let phone = mobile.value;
  let syncFlag = syncType.value;
  let appName = formData.app_name;
  console.log("appName", appName);
  let pro1;
  if (!phone) {
    ElMessage.warning("请先输入要同步的账号（手机号）");
    return;
  } else {
    ElMessage.info("本次同步只同步登录过的影院会员卡信息");
    let tips = "本次同步只同步登录过的影院会员卡信息，";
    if (appName) {
      tips = "本次同步只同步" + APP_LIST[appName];
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
  }
  await pro1();
  console.warn("开始同步");
  const loading = ElLoading.service({
    lock: true,
    text: "同步中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    // 1、拿到该手机号已维护登录信息的影院列表
    let loginInfoList = getCinemaLoginInfoList().filter(
      itemA =>
        itemA.mobile == phone &&
        (formData.app_name
          ? itemA.app_name == formData.app_name
          : syncFlag == 1
            ? ![...H5_UME_LIST, "lma"].includes(itemA.app_name)
            : syncFlag == 2
              ? H5_UME_LIST.includes(itemA.app_name)
              : itemA.app_name == "lma")
    );
    console.log("该手机号的loginInfoListt", loginInfoList);
    if (!loginInfoList?.length) {
      ElMessage.warning(
        `该手机号：${formData.app_name ? APP_LIST[formData.app_name] : "该系列"} 未维护登录信息`
      );
      loading.close();
      return;
    }
    // 2、获取服务端已维护的卡列表
    let cardRes = await svApi.queryCardList({
      page_num: 1,
      page_size: 1000,
      mobile: phone,
      app_name: formData.app_name || (syncFlag == 3 ? "lma" : undefined)
    });
    let serCardList = cardRes.data?.cardList || [];
    serCardList = serCardList.filter(item => {
      if (!formData.app_name) {
        return syncFlag == 1
          ? ![...H5_UME_LIST, "lma"].includes(item.app_name)
          : syncFlag == 2
            ? H5_UME_LIST.includes(item.app_name)
            : item.app_name == "lma";
      }
      return true;
    });
    console.log("该手机号的serCardList", serCardList);
    let memberCardList = [];
    for (let index = 0; index < loginInfoList.length; index++) {
      const { app_name, session_id } = loginInfoList[index];
      let cardList = await getCardListByApp(app_name, phone, session_id, index);
      memberCardList.push(...cardList);
    }
    console.log("本次同步会员卡余额拿到的数据信息", memberCardList);
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
      console.warn("addCardList", addCardList);
      if (addCardList.length) {
        addCardListHandle(addCardList);
      }
      let updateCardList = memberCardList
        .filter(item => {
          return item.id && item.balance !== undefined;
        })
        .map(item => ({
          id: item.id,
          balance: item.balance,
          update_time: getCurrentTime()
        }));
      if (updateCardList?.length) {
        console.log("updateCardList", updateCardList);
        updateCardListHandle(updateCardList);
      }
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
