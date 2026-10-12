/**
 * 金逸系列券列表双接口适配
 *
 * 金逸系列取券需同时请求两个接口：
 *  1. 旧接口 vistax/voucher/list：data 为券数组，字段 show_name/show_desc/coupon_code，
 *     expire_time 为日期字符串；
 *  2. 新接口 user/voucher/list（用户券包，含团购券）：data 为 { unused, used, disabled }，
 *     字段 voucher_name/voucher_desc/voucher_code，expire_time 为秒级时间戳，
 *     且中文字段可能以 \uXXXX 字面量下发，需解成明文。
 *
 * 本模块只做纯数据适配（无网络、无 store 依赖），把两种结构拍平成同一份券对象，
 * 供 cardQuanManage 选券、库存统计等下游逻辑无差别使用。
 */

// 接口中文可能以 \uXXXX 字面量下发，解成明文；已是明文时原样返回（幂等）
const decodeUnicodeStr = value => {
  if (typeof value !== "string" || !value.includes("\\u")) return value;
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
};

// 过期时间统一为毫秒时间戳：新接口为秒级时间戳（直接 new Date 会解成 1970 年），旧接口为日期字符串
const parseQuanExpireTime = value => {
  if (value == null || value === "") return 0;
  const num = Number(value);
  if (!Number.isNaN(num)) {
    // 秒级时间戳补齐为毫秒，毫秒级时间戳原样保留
    return num < 100000000000 ? num * 1000 : num;
  }
  return +new Date(value);
};

// 单条券统一映射：券名/券描述解中文，券码取真实可核销券码（非掩码）
const formatQuanItem = (item, isVoucherPack) => ({
  ...item,
  couponName:
    decodeUnicodeStr(isVoucherPack ? item.voucher_name : item.show_name) || "",
  couponDesc:
    decodeUnicodeStr(isVoucherPack ? item.voucher_desc : item.show_desc) || "",
  couponCode: isVoucherPack ? item.voucher_code : item.coupon_code,
  endDateTime: parseQuanExpireTime(item.expire_time)
});

// 券列表结构适配：旧接口数组 或 新接口 { unused } 均拍平为统一结构，新接口只取未使用券
export const normalizeQuanList = data => {
  if (Array.isArray(data)) {
    return data.map(item => formatQuanItem(item, false));
  }
  if (Array.isArray(data?.unused)) {
    return data.unused.map(item => formatQuanItem(item, true));
  }
  return [];
};

// 双接口结果合并：按券码去重取并集，保留先出现的记录（旧接口优先）
export const mergeQuanList = (...lists) => {
  const codeSet = new Set();
  const mergedList = [];
  lists.forEach(list => {
    (list || []).forEach(item => {
      if (!item?.couponCode || codeSet.has(item.couponCode)) return;
      codeSet.add(item.couponCode);
      mergedList.push(item);
    });
  });
  return mergedList;
};

export { decodeUnicodeStr, parseQuanExpireTime, formatQuanItem };
