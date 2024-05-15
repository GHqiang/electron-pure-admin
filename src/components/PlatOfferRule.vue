<!-- 平台自动报价规则设置 -->
<template>
  <el-table :data="displayItems">
    <el-table-column prop="platformName" label="平台名称">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.name }}</span>
        <el-input v-else v-model="editingRow.name" @blur="saveEdit(row.id)" />
      </template>
    </el-table-column>
    <el-table-column prop="quoteInterval" label="自动报价间隔">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.interval }}</span>
        <el-input-number
          v-else
          v-model.number="editingRow.interval"
          controls-position="right"
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column prop="token" label="平台Token">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.token }}</span>
        <el-input
          v-else
          v-model="editingRow.token"
          show-password
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column label="状态">
      <template #default="{ row }">
        <el-switch v-model="row.isEnabled" @change="toggleEnable(row.id)" />
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="{ row, $index }">
        <el-button
          type="primary"
          v-if="$index === 0"
          @click="addNewItem"
          size="small"
          >新增</el-button
        >
        <el-button
          v-if="row.id !== editingRowId"
          size="small"
          @click="startEdit(row)"
          >编辑</el-button
        >
        <el-button
          v-if="row.id === editingRowId"
          size="small"
          @click="cancelEdit"
          >取消</el-button
        >
        <el-button
          v-if="row.id === editingRowId"
          size="small"
          type="success"
          @click="saveEdit(row.id)"
          >保存</el-button
        >
        <el-popconfirm title="确定删除吗？" @confirm="deleteItem(row.id)">
          <template #reference>
            <el-button v-if="displayItems.length > 1" size="small" type="danger"
              >删除</el-button
            >
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ref, computed } from "vue";
import { useTableDataStore } from "@/store/platOfferRuleTable";

const tableDataStore = useTableDataStore();
console.log("tableDataStore", tableDataStore);
const editingRowId = ref(null);
const editingRow = ref({});

// 添加新增按钮的处理函数
const addNewItem = () => {
  tableDataStore.addNewItem();
};

// 将toggleEnable函数添加到setup中以便在模板中使用
const toggleEnable = id => {
  console.log("id", id);
  tableDataStore.toggleEnable(id);
};

const startEdit = row => {
  editingRowId.value = row.id;
  editingRow.value = { ...row };
  tableDataStore.startEdit(row.id);
};

const saveEdit = id => {
  if (id === editingRowId.value) {
    tableDataStore.saveEdit(editingRow.value);
    editingRowId.value = null;
  }
};
const deleteItem = id => {
  tableDataStore.deleteItem(id);
};
const cancelEdit = () => {
  editingRowId.value = null;
  tableDataStore.cancelEdit();
};

const displayItems = computed(() => tableDataStore.items);
</script>
