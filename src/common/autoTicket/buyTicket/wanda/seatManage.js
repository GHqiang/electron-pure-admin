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
import { formatErrInfo } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class WandaSeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.isTestOrder = isTestOrder;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取座位图
   * @param {Object} data - 参数对象
   * @param {string|number} data.dId - 场次ID
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<Object>} { area: [...], 或 null }
   */
  async getSeatLayout(data) {
    let { dId, session_id } = data || {};
    let params = {
      dId: dId,
      json: true,
      ...(session_id && { wanda_token: session_id })
    };
    try {
      this.logger.infoSave("获取座位布局参数", params);
      const res = await this.appApi.getRealTimeSeat(params);
      console.log("获取万达座位返回", res);
      return res?.data?.realtimeSeats;
    } catch (error) {
      this.logger.errorSave("获取万达座位图异常", {
        error: formatErrInfo(error),
        dId
      });
    }
  }

  /**
   * 获取目标座位（按 lockseat 字符串解析）
   * Wanda 的 lockseat 格式: "5排6座" 或 "5排6座,5排7座"
   * @param {Object} params - 参数对象
   * @param {string} params.lockseat - 座位信息
   * @param {Array} params.seatList - 座位列表（从 getSeatLayout 获取）
   * @param {number} params.ticket_num - 票数
   * @returns {Object} { seat_ids, error? }
   */
  async getTargetSeat({ lockseat, seatList, ticket_num }) {
    try {
      // Wanda 座位数据格式：{ seatId, name(如"5排6座"), coordy, coordx, row, column, ... }
      const targetSeats = seatList.filter(
        s => s.status == 1 && lockseat.indexOf(s.name) !== -1
      );
      if (targetSeats.length !== ticket_num) {
        this.logger.errorSave("获取目标座位失败", {
          targetSeats,
          ticket_num,
          lockseat
        });
        return { error: "获取目标座位失败", seat_ids: "" };
      }
      // 组装 seatId,price,undefined,0|...
      const seat_ids = targetSeats
        .map(s => `${s.seatId},${s.salesPrice || 0},undefined,0`)
        .join("|");
      this.logger.infoSave("解析目标座位成功", {
        seat_ids,
        lockseat
      });
      return { seat_ids };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", {
        error: formatErrInfo(error)
      });
      return { error: formatErrInfo(error), seat_ids: "" };
    }
  }

  /**
   * 锁定座位（万达通过 createOrder 锁座，本方法用于对接 SFC 统一接口）
   * @param {Object} data - 参数对象
   * @param {string|number} data.dId - 场次ID
   * @param {string} data.seat_ids - 座位ID字符串
   * @param {string} data.mobile - 手机号
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<Object>} 锁座结果
   */
  async lockSeatHandle(data, inx = 1) {
    let { dId, seat_ids, mobile, session_id, json = true } = data || {};
    try {
      let params = {
        dId,
        retailerCode: "MX",
        mobile,
        seatId: seat_ids,
        json,
        ...(session_id && { wanda_token: session_id })
      };
      if (inx === 1) {
        this.logger.infoSave(`第${inx}次锁定座位参数`, { params });
      }
      // 万达通过创建订单来实现锁座
      const res = await this.appApi.createOrder(params);
      this.logger.infoSave(`第${inx}次锁定座位返回`, { res });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, {
        error: formatErrInfo(error)
      });
      return Promise.reject(error);
    }
  }

  /**
   * 自动选座
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

  /**
   * 获取座位价格
   */
  getSeatPrice(seatInfo) {
    return seatInfo?.salesPrice || 0;
  }
}
