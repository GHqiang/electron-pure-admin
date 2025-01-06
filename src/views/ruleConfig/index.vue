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
    </div>

    <div style="margin-top: 50px">
      <el-divider content-position="left">设置类规则</el-divider>
      <div class="flex-yc">
        <el-input
          v-model="profitAddPrice"
          type="number"
          clearable
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
    </div>
  </div>
</template>

<script setup>
// keepAlive生效前提：对应页面 name 必须与路由的 name 保持一致
defineOptions({
  name: "ruleConfig"
});
import { ref, computed, onBeforeMount, watch, onBeforeUnmount } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";

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

// 是否自动转单
let isOpen = localStorage.getItem("isAutoTransfer") == 1;
const isAutoTransfer = ref(isOpen ? true : false);
watch(isAutoTransfer, (newVal, oldVal) => {
  console.log(`isAutoTransfer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAutoTransfer", newVal ? "1" : "0");
});

// 单店会员报价加价金额
let profitAddPriceValue = window.localStorage.getItem("profitAddPrice");
const profitAddPrice = ref(profitAddPriceValue || "");
const setProfitAddPrice = () => {
  console.log("val", profitAddPrice.value);
  window.localStorage.setItem("profitAddPrice", profitAddPrice.value);
};

// 单店会员报价加价金额
let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
const lmaIsUseQuan = ref(lmaIsUseQuanValue || "1");
const lmaIsUseQuanChange = val => {
  console.log("val", val);
  window.localStorage.setItem("lmaIsUseQuan", val);
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
</style>
