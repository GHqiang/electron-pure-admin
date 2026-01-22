// Babel配置文件
// 用于Jest转换ES模块
// 注意：必须使用CommonJS格式，不能使用ES模块

module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          node: "current"
        },
        modules: "auto"
      }
    ]
  ]
};
