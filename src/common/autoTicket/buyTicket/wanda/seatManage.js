/**
 * 万达座位管理模块
 *
 * 职责：
 * - 获取座位布局信息
 * - 解析目标座位
 * - 自动选座
 * - 锁定座位
 *
 * @module wanda/seatManage
 */
import { APP_API_OBJ } from "@/common/index";
import {
  formatErrInfo, // 格式化错误信息
  trial // 重试方法
} from "@/utils/utils";

// 锁座重试常量配置
const LOCK_RETRY_CONFIG = {
  lieren: [10, 5],
  mangguo: [10, 5],
  sheng: [10, 5],
  mayi: [10, 5],
  yangcong: [10, 5],
  haha: [6, 5],
  yinghuasuan: [6, 5],
  shangzhan: [6, 5],
  shoutu: [20, 12],
  mahua: [10, 5]
};

export default class SeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.isTestOrder = isTestOrder;
    this.appApi = APP_API_OBJ[order.app_name];
  }
  /**
   * 获取目标座位(出票用)
   * @param {Object} buyTicketInfo 购票信息
   * @returns {Promise<{seatCodes: Array, discountList: Array}>} 目标座位信息及优惠活动信息
   */
  async getTargetSeat(buyTicketInfo) {
    try {
      const params = this.getSeatParams(buyTicketInfo);
      const seatListRes = await this.getSeatLayout(params);
      this.logger.info("获取到座位信息", { seatListRes });
      const { seatData: seatList = [], areaInfoList } = seatListRes || {};

      if (!seatList?.length) {
        this.logger.errorSave("座位列表为空");
        return;
      }

      const targetSeats = this.filterTargetSeats(seatList);
      if (targetSeats.length != this.order.ticket_num) {
        this.logger.errorSave("获取目标座位失败");
        return { errorCode: "TARGET_SEAT_FAILED" };
      }

      return {
        seatCodes: targetSeats,
        areaInfoList
      };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", formatErrInfo(error));
    }
  }

  /**
   * 获取座位列表参数
   * @private
   */
  getSeatParams(buyTicketInfo) {
    const { show_id, session_id } = buyTicketInfo;
    let params = {
      dId: show_id,
      json: true,
      ...(session_id && { wanda_token: session_id })
    };
    return params;
  }

  /**
   * 过滤目标座位
   * @private
   */
  filterTargetSeats(seatList) {
    const seatName = this.order.lockseat
      .replaceAll(" ", ",")
      .replaceAll("列", "座");
    const selectSeatList = seatName.split(",");
    console.log("selectSeatList", selectSeatList);
    return seatList.filter(item => selectSeatList.includes(item.name));
  }

  /**
   * 获取座位布局(报价用)
   * @param {Object} params 请求参数
   * @returns {Promise<{seatData: Array, areaInfoList: Array}>}
   */
  async getSeatLayout(params) {
    try {
      this.logger.infoSave("获取座位布局参数", params);
      const res = await this.appApi.getRealTimeSeat(params);
      // this.logger.info("获取座位布局返回", res);
      const realtimeSeats = res?.data?.realtimeSeats || {};
      let areaInfoList = realtimeSeats?.area?.map(item => item.areaPrice);
      let seatData =
        realtimeSeats?.area
          ?.map(item =>
            item.seat.map(itemS => ({ ...itemS, ...item.areaPrice }))
          )
          ?.flat() || [];

      if (!seatData.length) {
        this.logger.errorSave("获取座位布局为空");
      }

      return { seatData, areaInfoList, area: realtimeSeats?.area };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", formatErrInfo(error));
    }
  }

  /**
   * 锁定座位(出票用)
   * @param {Object} params 锁定座位参数
   * @returns {Promise<Object>} 锁定结果
   */
  async lockseatByApp(params) {
    try {
      let lockRes = await this.lockSeatHandle(params);
      return lockRes;
    } catch (error) {
      this.logger.error("座位锁定失败", error);
      // 锁座重试
      return this.retryLockSeat(params);
    }
  }

  /**
   * 重试锁定座位
   * @private
   */
  async retryLockSeat(params) {
    const platName = this.order.plat_name;
    const [retryCount, delay] = LOCK_RETRY_CONFIG[platName] || [6, 5];

    this.logger.info("座位锁定失败准备重试");
    return trial(inx => this.lockSeatHandle(params, inx), retryCount, delay);
  }

  /**
   * 锁定座位（万达通过 createOrder 锁座）
   * @param {Object} data - 参数对象
   * @param {string|number} data.dId - 场次ID
   * @param {string} data.seat_ids - 座位ID字符串
   * @param {string} data.mobile - 手机号
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<Object>} 锁座结果
   */
  async lockSeatHandle(data, inx = 1) {
    const params = this.getLockSeatParams(data);

    try {
      if (inx % 2 === 0) {
        await mockDelay(1);
      }

      this.logger.info("锁定座位参数", params);
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      return Promise.reject(error);
    }
  }

  /**
   * 获取锁定座位参数
   * @private
   */
  getLockSeatParams(data) {
    let { dId, seatId, mobile, session_id, json = true } = data || {};
    return {
      dId,
      retailerCode: "MX",
      mobile,
      seatId,
      json,
      ...(session_id && { wanda_token: session_id })
    };
  }

  /**
   * 自动选座（暂时无用）
   * 返回: [{ seatId, salesPrice, ...seat }] 或空数组
   */
  async autoSelectSeat(seatData, ticketNum) {
    try {
      const areas = seatData.area || [];
      let targetSeats = [];

      for (const area of areas) {
        const seats = area.seat || [];
        const areaPrice = area.areaPrice?.salesPrice || 0;

        // Wanda API: status=1 可售, status=3 已售
        const available = seats.filter(s => s.status === 1);
        if (available.length >= ticketNum) {
          // 取连续座位（优先取同行相邻）
          targetSeats = this.findConsecutiveSeats(available, ticketNum);
          // 注入区域价格
          targetSeats = targetSeats.map(s => ({
            ...s,
            salesPrice: areaPrice
          }));
          break;
        }
      }
      return targetSeats.length >= ticketNum ? targetSeats : [];
    } catch (error) {
      this.logger.errorSave("万达自动选座异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 查找连续座位
   */
  findConsecutiveSeats(availableSeats, ticketNum) {
    // 按 row 分组，每组内按 column 排序
    const rowGroups = {};
    for (const seat of availableSeats) {
      const row = seat.row || seat.coordy;
      if (!rowGroups[row]) rowGroups[row] = [];
      rowGroups[row].push(seat);
    }
    // 每组内按坐标排序
    for (const row of Object.keys(rowGroups)) {
      rowGroups[row].sort((a, b) => (a.coordx || 0) - (b.coordx || 0));
    }

    // 优先找同排连续座位
    for (const row of Object.keys(rowGroups)) {
      const seats = rowGroups[row];
      for (let i = 0; i <= seats.length - ticketNum; i++) {
        const slice = seats.slice(i, i + ticketNum);
        let isConsecutive = true;
        for (let j = 1; j < slice.length; j++) {
          if (slice[j].coordx - slice[j - 1].coordx !== 1) {
            isConsecutive = false;
            break;
          }
        }
        if (isConsecutive) return slice;
      }
    }

    // 无连续座位时，直接取前 ticketNum 个
    return availableSeats.slice(0, ticketNum);
  }
}
