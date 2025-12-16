<template>
  <div class="auto-ticket">
    <div style="margin-top: 30px">
      <el-divider content-position="left">按钮类规则</el-divider>
      <el-button type="primary" @click="isOverrunOffer = !isOverrunOffer">{{
        !isOverrunOffer ? "开启超限报价" : "关闭超限报价"
      }}</el-button>

      <el-button type="primary" @click="isNightMaxPrice = !isNightMaxPrice">{{
        !isNightMaxPrice ? "开启夜间顶价" : "关闭夜间顶价"
      }}</el-button>

      <el-button type="primary" @click="isAutoTransfer = !isAutoTransfer">{{
        !isAutoTransfer ? "开启自动转单" : "关闭自动转单"
      }}</el-button>

      <el-button type="primary" @click="isAnomaly = !isAnomaly">{{
        !isAnomaly ? "开启sfc故障检测" : "关闭sfc故障检测"
      }}</el-button>

      <el-button
        type="primary"
        v-if="IN_RULE_LIST.includes(rule)"
        @click="isAdjustPrice = !isAdjustPrice"
        >{{ !isAdjustPrice ? "开启动态调价" : "关闭动态调价" }}</el-button
      >

      <el-button type="primary" @click="setDictTableList">刷新字典表</el-button>
    </div>

    <div style="margin-top: 50px">
      <el-divider content-position="left">设置类规则</el-divider>
      <div class="flex-yc" v-if="IN_RULE_LIST.includes(rule)">
        <el-input
          v-model="minAdjustPriceProfit"
          type="number"
          style="max-width: 360px; margin-right: 15px"
          placeholder="请输入动态调价最低利润"
        >
          <template #prepend>动态调价最小利润</template>
          <template #append>
            <el-button text @click="setAdjustPriceMinProfit">保存</el-button>
          </template>
        </el-input>
      </div>
      <div class="flex-yc m-t-10">
        <el-input
          v-model="minGrabProfit"
          type="number"
          style="max-width: 360px; margin-right: 15px"
          placeholder="请输入允许秒单最低利润"
        >
          <template #prepend>允许秒单最低利润</template>
          <template #append>
            <el-button text @click="setGrabMinProfit">保存</el-button>
          </template>
        </el-input>
      </div>
      <div class="flex-yc m-t-10">
        <el-input
          v-model="profitAddPrice"
          type="number"
          style="max-width: 360px; margin-right: 15px"
          placeholder="请输入单店利润加价金额"
        >
          <template #prepend>单店会员报价利润加价</template>
          <template #append>
            <el-button text @click="setProfitAddPrice">保存</el-button>
          </template>
        </el-input>
        <span class="red"
          >注意：真实加价金额=该值+会员报价规则里的加价金额</span
        >
      </div>
      <div class="flex-yc m-t-10">
        <span>卢米埃是否用券：</span>
        <el-radio-group v-model="lmaIsUseQuan" @change="lmaIsUseQuanChange">
          <el-radio value="1">是</el-radio>
          <el-radio value="2">否</el-radio>
        </el-radio-group>
      </div>
      <div class="flex-yc m-t-10">
        <span>是否禁用凤凰云智h5系列影院报价：</span>
        <el-radio-group v-model="h5umeIsClose" @change="h5umeIsCloseChange">
          <el-radio value="1">是</el-radio>
          <el-radio value="2">否</el-radio>
        </el-radio-group>
      </div>
    </div>

    <div style="margin-top: 80px">
      <el-divider class="tips">提示：</el-divider>
      <ul>
        <li>
          1、超限报价：
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;
          该功能启用后，如果规则计算报价超过平台限价，开启后会按照平台限价进行报价，关闭则不进行报价;
        </li>
        <li>
          2、夜间顶价：
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;
          该功能启用后，凌晨1点到6点时间范围内，无论是用卡还是用券规则，都会按照平台限价进行报价;
        </li>
        <li>
          3、卢米埃是否用券：
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;
          该功能主要用于市场上没有-5券时，可选择否来实现只用会员卡进行出票；
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import svApi from "@/api/sv-api";
// keepAlive生效前提：对应页面 name 必须与路由的 name 保持一致
defineOptions({
  name: "ruleConfig"
});
import { ref, computed, onBeforeMount, watch, onBeforeUnmount } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

import { IN_RULE_LIST } from "@/common/constant.js";
// 是否超限报价
let isOpenOverrunOffer = localStorage.getItem("isOverrunOffer") == 1;
const isOverrunOffer = ref(isOpenOverrunOffer ? true : false);
watch(isOverrunOffer, (newVal, oldVal) => {
  console.log(`isOverrunOffer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isOverrunOffer", newVal ? "1" : "0");
});

// 是否开启夜间顶价
let isOpenisNightMaxPrice = localStorage.getItem("isOpenisNightMaxPrice") == 1;
const isNightMaxPrice = ref(isOpenisNightMaxPrice ? true : false);
watch(isNightMaxPrice, (newVal, oldVal) => {
  console.log(`isOpenisNightMaxPrice 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isOpenisNightMaxPrice", newVal ? "1" : "0");
});

// 是否sfc故障检测
let isOpenAnomaly = localStorage.getItem("isAnomaly") == 1;
const isAnomaly = ref(isOpenAnomaly ? true : false);
watch(isAnomaly, (newVal, oldVal) => {
  console.log(`isAnomaly 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAnomaly", newVal ? "1" : "0");
});

// 是否动态调价
let isOpenAdjustPrice = localStorage.getItem("isAdjustPrice") == 1;
const isAdjustPrice = ref(isOpenAdjustPrice ? true : false);
watch(isAdjustPrice, (newVal, oldVal) => {
  console.log(`isAdjustPrice 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAdjustPrice", newVal ? "1" : "0");
});

// 是否自动转单
let isOpen = localStorage.getItem("isAutoTransfer") == 1;
const isAutoTransfer = ref(isOpen ? true : false);
watch(isAutoTransfer, (newVal, oldVal) => {
  console.log(`isAutoTransfer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAutoTransfer", newVal ? "1" : "0");
});

// 动态调价最小利润
let minAdjustPriceProfitValue = window.localStorage.getItem(
  "minAdjustPriceProfit"
);
const minAdjustPriceProfit = ref(minAdjustPriceProfitValue || "");
const setAdjustPriceMinProfit = () => {
  console.log("val", minAdjustPriceProfit.value);
  window.localStorage.setItem(
    "minAdjustPriceProfit",
    minAdjustPriceProfit.value
  );
};

// 允许抢单最小利润
let minGrabProfitValue = window.localStorage.getItem("minGrabProfit");
const minGrabProfit = ref(minGrabProfitValue || "");
const setGrabMinProfit = () => {
  console.log("val", minGrabProfit.value);
  window.localStorage.setItem("minGrabProfit", minGrabProfit.value);
};

// 单店会员报价加价金额
let profitAddPriceValue = window.localStorage.getItem("profitAddPrice");
const profitAddPrice = ref(profitAddPriceValue || "");
const setProfitAddPrice = () => {
  console.log("val", profitAddPrice.value);
  window.localStorage.setItem("profitAddPrice", profitAddPrice.value);
};

// 卢米埃是否用券
let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
const lmaIsUseQuan = ref(lmaIsUseQuanValue || "1");
const lmaIsUseQuanChange = val => {
  console.log("val", val);
  window.localStorage.setItem("lmaIsUseQuan", val);
};

// 是否禁用凤凰云智h5系列影院报价：1-是 2-否，默认否
let h5umeIsCloseValue = window.localStorage.getItem("h5umeIsClose");
const h5umeIsClose = ref(h5umeIsCloseValue || "2");
const h5umeIsCloseChange = val => {
  console.log("val", val);
  window.localStorage.setItem("h5umeIsClose", val);
};

// 设置字典表信息
const setDictTableList = async () => {
  try {
    const res = await svApi.queryDictList();
    let dictList = res?.data?.dictList || [];
    console.log("字典表返回", dictList);
    dictStore.setDictTableList(dictList);
  } catch (error) {
    console.warn("字典表返回异常", error);
  }
};
</script>

<style scope lang="scss">
.flex-yc {
  display: flex;
  align-items: center;
}
.red {
  color: red;
}
.m-t-10 {
  margin-top: 10px;
}
.tips .el-divider__text {
  background: transparent;
  color: red;
  font-size: 24px;
}
</style>
