// 测试用 @/utils/auth 桩
// 真实文件是 src/utils/auth.ts，jest 仅配置了 .js 转换（见 jest.config.cjs），
// 被测逻辑不涉及鉴权，这里只提供同名导出避免模块解析失败。
module.exports = {
  getToken: () => "",
  setToken: () => {},
  removeToken: () => {}
};
