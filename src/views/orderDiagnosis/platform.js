const toInfo = info => {
  if (!info) return {};
  if (typeof info === "object") return info;
  try {
    return JSON.parse(info);
  } catch {
    return {};
  }
};

/**
 * 从同角色记录或 C1 拉单返回里取订单平台
 * @param {Array} records - fail/success 记录
 * @param {Array} trace - L2 明细
 * @returns {string}
 */
export const pickOrderPlatform = (records = [], trace = []) => {
  const fromRecords = records.map(row => row.plat_name).filter(Boolean);
  if (fromRecords.length) return fromRecords[0];
  for (const row of trace) {
    if (row.des !== "报价队列-拉单返回") continue;
    const info = toInfo(row.info);
    if (info.plat_name) return info.plat_name;
  }
  return "";
};

/**
 * 只保留目标平台的 5 分钟拉单摘要；平台为空时不过滤
 * @param {Array} rows - opera_record 行
 * @param {string} platform
 * @returns {Array}
 */
export const filterSummaryByPlatform = (rows = [], platform = "") =>
  platform
    ? rows.filter(row => (toInfo(row.info).plat_name || "") === platform)
    : rows;
