# 安装测试依赖

## 快速安装

运行以下命令安装所有测试所需的依赖：

```bash
yarn add -D jest @vue/vue3-jest babel-jest @babel/core @babel/preset-env jest-environment-jsdom
```

## 依赖说明

- `jest` - Jest测试框架
- `@vue/vue3-jest` - Vue3组件测试支持
- `babel-jest` - Babel转换器
- `@babel/core` - Babel核心
- `@babel/preset-env` - Babel环境预设
- `jest-environment-jsdom` - Jest的DOM环境（用于测试需要window、document等的代码）

## 验证安装

安装完成后，运行以下命令验证：

```bash
yarn test --listTests
```

如果成功列出测试文件，说明配置正确。

## 如果遇到问题

### 问题1: 找不到模块

确保所有依赖都已安装：

```bash
yarn install
```

### 问题2: 版本冲突

清除缓存并重新安装：

```bash
yarn cache clean
rm -rf node_modules
yarn install
```
