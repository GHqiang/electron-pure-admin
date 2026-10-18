// 影院 code 归一化工具
//
// 背景（2026-10-17 华联万柳订单问题）：不同平台返回的影院 code 类型不一致——猎人平台
// 返回的是数字（11063401），影院映射表（cinema_code_match）与报价规则里存的是字符串
// （"11063401"）。用 === 严格比较会查不到映射，导致规则的「包含/排除影院」配置整段
// 失效（排除规则 fail-open，照常报价）。故所有影院 code 的比较统一走这里。

// 统一转字符串并去掉首尾空格；空值统一为空字符串
export const normalizeCinemaCode = code =>
  code === null || code === undefined ? "" : String(code).trim();

// 逗号分隔的 code 清单转数组（去空格、去空项）
export const splitCinemaCodes = codes =>
  normalizeCinemaCode(codes)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
