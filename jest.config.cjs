// Jest配置文件
// 支持ES模块和Vue项目
// 注意：必须使用CommonJS格式

module.exports = {
  // 测试环境（需要安装 jest-environment-jsdom）
  // 如果测试不需要DOM，可以改为 "node"
  testEnvironment: "jsdom",
  
  // 模块文件扩展名
  moduleFileExtensions: ["js", "json", "vue"],
  
  // 模块名称映射（支持@别名）
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  
  // 转换配置
  transform: {
    "^.+\\.js$": "babel-jest",
    "^.+\\.vue$": "@vue/vue3-jest"
  },
  
  // 测试文件匹配模式
  testMatch: [
    "**/tests/**/*.test.js",
    "**/__tests__/**/*.js"
  ],
  
  // 忽略的目录
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/release/"
  ],
  
  // 覆盖率配置
  collectCoverageFrom: [
    "src/common/**/*.js",
    "!src/common/**/*.test.js",
    "!src/common/tests/**"
  ],
  
  // 覆盖率报告目录
  coverageDirectory: "coverage",
  
  // 覆盖率阈值（可选）
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // 设置文件（注意：setupFiles会在每个测试文件运行前执行，setupFilesAfterEnv会在测试框架安装后执行）
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  
  // 全局变量
  globals: {
    "vue-jest": {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith("el-")
      }
    }
  }
};
