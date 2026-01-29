/**
 * 座位价格统计工具
 *
 * 目标：抽取各渠道中「按剩余座位占比选出最多座位所在分区的价格」的公共逻辑，
 *      以支持 SFC / UME 等不同数据结构的复用。
 *
 * 约定：
 * - 不做接口请求，只做本地数组计算。
 * - 具体字段差异通过 extractors 适配。
 */

/**
 * 计算「剩余座位最多的分区」对应的价格
 *
 * @param {Object} params
 * @param {Array} params.seatList - 座位列表
 * @param {Array} params.areaList - 分区列表
 * @param {Object} params.extractors - 适配器集合
 * @param {function} params.extractors.isSeatAvailable - (seat) => boolean，是否为未售座位
 * @param {function} params.extractors.getSeatAreaId - (seat) => string|number，座位所属分区ID
 * @param {function} params.extractors.getAreaId - (area) => string|number，分区ID
 * @param {function} params.extractors.getAreaPrice - (area) => number，分区价格（已包含服务费等）
 * @param {Object} [params.logger] - 日志对象，可选，需支持 infoSave
 *
 * @returns {number|null} 最多座位所在分区的价格，失败返回 null
 */
export function calculateMostSeatPrice({
  seatList,
  areaList,
  extractors,
  logger
}) {
  try {
    if (!Array.isArray(seatList) || !Array.isArray(areaList)) {
      logger?.infoSave?.("calculateMostSeatPrice: 参数无效", {
        seatListType: typeof seatList,
        areaListType: typeof areaList
      });
      return null;
    }
    if (!seatList.length || !areaList.length) {
      logger?.infoSave?.("calculateMostSeatPrice: 座位或分区列表为空", {
        seat_len: seatList.length,
        area_len: areaList.length
      });
      return null;
    }

    const { isSeatAvailable, getSeatAreaId, getAreaId, getAreaPrice } =
      extractors || {};
    if (
      typeof isSeatAvailable !== "function" ||
      typeof getSeatAreaId !== "function" ||
      typeof getAreaId !== "function" ||
      typeof getAreaPrice !== "function"
    ) {
      logger?.infoSave?.("calculateMostSeatPrice: 提取器未完整提供", {
        hasIsSeatAvailable: !!isSeatAvailable,
        hasGetSeatAreaId: !!getSeatAreaId,
        hasGetAreaId: !!getAreaId,
        hasGetAreaPrice: !!getAreaPrice
      });
      return null;
    }

    // 1. 过滤未售座位
    const availableSeats = seatList.filter(s => isSeatAvailable(s));
    if (!availableSeats.length) {
      logger?.infoSave?.("calculateMostSeatPrice: 无未售座位", {
        seat_len: seatList.length
      });
      return null;
    }

    // 2. 统计每个分区剩余座位数量
    const total = availableSeats.length;
    const ratioList = areaList.map(area => {
      const areaId = getAreaId(area);
      const count = availableSeats.filter(
        s => getSeatAreaId(s) === areaId
      ).length;
      const numRatio = total ? Math.floor((count * 100) / total) : 0;
      return {
        ...area,
        __areaId: areaId,
        numRatio
      };
    });

    // 3. 按占比从高到低排序
    ratioList.sort((a, b) => (b.numRatio || 0) - (a.numRatio || 0));
    logger?.infoSave?.("座位分区剩余座位占比情况", {
      areaRatioList: ratioList.map(a => ({
        areaId: a.__areaId,
        numRatio: a.numRatio,
        price: getAreaPrice(a)
      }))
    });

    if (!ratioList.length) return null;

    const topArea = ratioList[0];
    const price = getAreaPrice(topArea);
    return typeof price === "number" ? price : Number(price || 0);
  } catch (error) {
    logger?.infoSave?.("calculateMostSeatPrice: 计算失败", { error });
    return null;
  }
}
