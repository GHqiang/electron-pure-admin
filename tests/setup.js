// Jest测试环境设置文件
// 用于配置测试环境的全局设置

import { createPinia, setActivePinia } from "pinia";

// 初始化Pinia（必须在导入store之前）
const pinia = createPinia();
setActivePinia(pinia);

// Mock window对象
const mockLocalStorage = {
  getItem: jest.fn((key) => {
    return mockLocalStorage._storage[key] || null;
  }),
  setItem: jest.fn((key, value) => {
    mockLocalStorage._storage[key] = value;
  }),
  removeItem: jest.fn((key) => {
    delete mockLocalStorage._storage[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorage._storage = {};
  }),
  _storage: {}
};

global.window = {
  localStorage: mockLocalStorage,
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  },
  dispatchEvent: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// 确保localStorage在全局可用
global.localStorage = mockLocalStorage;

// Mock console方法（可选，用于减少测试输出）
// global.console = {
//   ...console,
//   log: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn()
// };
