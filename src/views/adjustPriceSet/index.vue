<template>
  <div class="adjust-price">
    <el-divider content-position="center">动态调价设置</el-divider>
    <el-form inline>
      <el-form-item label="连续&nbsp;&nbsp;&nbsp;&nbsp;中标">
        <el-input v-model="inCount" placeholder="请输入连续中标次数">
          <template #append>次</template>
        </el-input>
      </el-form-item>
      <el-form-item label="价格提高">
        <el-input-number v-model="inPrice" :min="0" :step="0.5" />
      </el-form-item>

      <el-form-item label="连续不中标">
        <el-input v-model="outCount" placeholder="请输入连续不中标次数">
          <template #append>次</template>
        </el-input>
      </el-form-item>
      <el-form-item label="价格降低">
        <el-input-number v-model="outPrice" :min="0" :step="0.5" />
      </el-form-item>
    </el-form>
    <div>
      <el-checkbox v-model="isOpen" size="large" @change="switchChange"
        >开启自动调价</el-checkbox
      >
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";

const inCount = ref("3");
const inPrice = ref(0.5);
const outCount = ref("3");
const outPrice = ref(0.5);
const isOpen = ref(false);

let adjustPrice = window.localStorage.getItem("adjustPrice");
if (adjustPrice) {
  adjustPrice = JSON.parse(adjustPrice);
  inCount.value = adjustPrice.inCount;
  inPrice.value = adjustPrice.inPrice;
  outCount.value = adjustPrice.outCount;
  outPrice.value = adjustPrice.outPrice;
  isOpen.value = true;
  ElMessage.warning("自动调价处于开启中");
} else {
  isOpen.value = false;
  ElMessage.warning("自动调价未开启");
}
const switchChange = val => {
  if (val) {
    if (inCount.value && inPrice.value && outCount.value && outPrice.value) {
      console.log("连续中标次数:", inCount.value);
      console.log("价格提高:", inPrice.value);
      console.log("连续不中标次数:", outCount.value);
      console.log("价格降低:", outPrice.value);
      window.localStorage.setItem(
        "adjustPrice",
        JSON.stringify({
          inCount: inCount.value,
          inPrice: inPrice.value,
          outCount: outCount.value,
          outPrice: outPrice.value
        })
      );
    } else {
      ElMessage.warning("请先设置自动调价规则再开启");
      isOpen.value = false;
    }
  } else {
    window.localStorage.removeItem("adjustPrice");
  }
};
</script>
<style scoped>
.adjust-price {
  width: 60%;
  margin: 0 auto;
}
</style>
