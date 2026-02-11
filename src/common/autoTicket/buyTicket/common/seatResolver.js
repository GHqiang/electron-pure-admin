/**
 * 座位解析工具
 * 统一封装各影院系列的座位匹配逻辑
 *
 * 说明：通过 extractor 函数适配不同系列的数据结构差异
 */

/**
 * 解析 lockseat 字符串为座位名称列表
 * @param {string} lockseat - 座位字符串，如 "7排1座" 或 "7排1座,7排2座" 或 "7排1座 7排2座"
 * @returns {Array<string>} 座位名称列表，如 ["7排1座", "7排2座"]
 */
export function parseLockseatToNames(lockseat) {
  if (!lockseat) return [];
  // 支持逗号和空格分隔
  return lockseat
    .split(/[,，\s]+/)
    .map(s => s.trim())
    .filter(s => s);
}

/**
 * 按座位名称匹配座位列表
 * @param {Object} params
 * @param {Array} params.seatList - 座位列表
 * @param {Array<string>} params.seatNames - 目标座位名称列表
 * @param {Function} [params.seatNameExtractor] - 座位名称提取器，从座位对象中提取名称字段
 * @returns {Array} 匹配到的座位对象列表
 */
export function matchSeatsByNames({ seatList, seatNames, seatNameExtractor }) {
  if (!seatList?.length || !seatNames?.length) return [];

  const extractName =
    seatNameExtractor ||
    (seat => {
      // 默认尝试常见字段
      return seat.seatName || seat[5] || seat.name || "";
    });

  return seatList.filter(seat => {
    const seatName = extractName(seat);
    return seatNames.some(name => {
      // 支持模糊匹配（去除空格、座/号等后缀）
      const normalizedSeatName = seatName.replace(/[\s座号]/g, "");
      const normalizedTargetName = name.replace(/[\s座号]/g, "");
      return normalizedSeatName === normalizedTargetName || seatName === name;
    });
  });
}

/**
 * 按行号和列号匹配座位（通用版本）
 * @param {Object} params
 * @param {Array} params.seatList - 座位列表
 * @param {string} params.lockseat - 座位字符串，如 "7排1座"
 * @param {number} params.ticket_num - 票数
 * @param {Function} [params.rowExtractor] - 行号提取器
 * @param {Function} [params.colExtractor] - 列号提取器
 * @returns {Array} 匹配到的座位对象列表
 */
export function matchSeatsByRowCol({
  seatList,
  lockseat,
  ticket_num,
  rowExtractor,
  colExtractor
}) {
  if (!seatList?.length || !lockseat) return [];

  const seatNames = parseLockseatToNames(lockseat);
  const targetSeats = seatNames
    .map(name => {
      // 解析 "7排1座" 格式
      const match = name.match(/(\d+)排(\d+)座/);
      if (match) {
        return { row: match[1], col: match[2] };
      }
      return null;
    })
    .filter(Boolean);

  if (targetSeats.length !== ticket_num) return [];

  const getRow = rowExtractor || (seat => seat.rowName || seat.row || seat[1]);
  const getCol =
    colExtractor || (seat => seat.columnName || seat.col || seat[2]);

  return seatList.filter(seat => {
    const seatRow = String(getRow(seat));
    const seatCol = String(getCol(seat));
    return targetSeats.some(target => {
      return seatRow === target.row && seatCol === target.col;
    });
  });
}
