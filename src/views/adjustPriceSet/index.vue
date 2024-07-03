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
    <el-button type="primary" class="save-btn" @click="submitForm"
      >保存</el-button
    >
  </div>
</template>

<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";

const inCount = ref("3");
const inPrice = ref(0.5);
const outCount = ref("3");
const outPrice = ref(0.5);

let adjustPrice = window.localStorage.getItem("adjustPrice");
if (adjustPrice) {
  adjustPrice = JSON.parse(adjustPrice);
  inCount.value = adjustPrice.inCount;
  inPrice.value = adjustPrice.inPrice;
  outCount.value = adjustPrice.outCount;
  outPrice.value = adjustPrice.outPrice;
}
const submitForm = () => {
  // 在这里处理表单提交逻辑
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
  ElMessage.success("保存成功");
};
</script>
<style scoped>
.adjust-price {
  width: 60%;
  margin: 0 auto;
}
.save-btn {
  margin-left: 80px;
  margin-top: 10px;
}
</style>
