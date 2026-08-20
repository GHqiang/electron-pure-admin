// 锁座重试常量配置
const LOCK_RETRY_CONFIG = {
  lieren: [6, 5],
  mangguo: [6, 5],
  sheng: [6, 5],
  mayi: [6, 5],
  yangcong: [6, 5],
  haha: [6, 5],
  yinghuasuan: [6, 5],
  shangzhan: [6, 5],
  shoutu: [6, 12],
  mahua: [6, 5]
};
// 辅助锁座触发原因
const ASSIST_LOCK_ERRORS = ["座位旁边不要留空", "座位中间不要留空"];

// 统一座位管理
import { APP_API_OBJ } from "@/common/index";
// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  trial, // 重试方法
  mockDelay // 模拟延时
} from "@/utils/utils";
// 帮助锁定座位实例对象
import assistLockSeatObj from "@/common/autoTicket/lockSeatQueue";

export default class SeatManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.appApi = APP_API_OBJ[order.app_name];
    this.logger = logger; // 日志模块
  }

  /**
   * 获取目标座位（含重试机制）
   * 金逸 API 偶发返回座位数据不完整（目标列缺失部分座位），
   * 通过重试查询应对服务端数据延迟加载。
   * @param {Object} buyTicketInfo 购票信息
   * @returns {Promise<{seatCodes: Array, discountList: Array}>} 目标座位信息及优惠活动信息
   */
  async getTargetSeat(buyTicketInfo) {
    // 目标座位获取重试配置（服务端偶发返回不完整，每 2 秒重试一次，最多 10 次）
    const RETRY_DELAY = 2;
    const RETRY_MAX = 10;

    try {
      const params = this.getSeatParams(buyTicketInfo);

      // 首次查询
      let seatListRes = await this.getSeatLayout(params);
      this.logger.info("获取到座位信息", { seatListRes });
      let { seatData: seatList = [], areaInfoList } = seatListRes || {};

      if (!seatList?.length) {
        this.logger.errorSave("座位列表为空");
        return;
      }

      let targetSeats = this.filterTargetSeats(seatList);

      // 目标座位不足时重试查询
      for (let i = 0; i < RETRY_MAX; i++) {
        if (targetSeats.length == this.order.ticket_num) {
          break;
        }
        this.logger.infoSave(
          `目标座位数量不足(期望${this.order.ticket_num}实际${targetSeats.length})，第${i + 1}次重试查询`
        );
        await mockDelay(RETRY_DELAY);
        seatListRes = await this.getSeatLayout(params);
        const retryData = seatListRes?.seatData || [];
        if (retryData.length) {
          targetSeats = this.filterTargetSeats(retryData);
          areaInfoList = seatListRes?.areaInfoList || areaInfoList;
        }
      }

      if (targetSeats.length != this.order.ticket_num) {
        this.logger.errorSave("获取目标座位失败（已重试）");
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
    const { cinema_id, hall_id, schedule_id } = buyTicketInfo;
    let params = {
      cinema_id,
      hall_id,
      schedule_id
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
    const targetRow = seatList.filter(item =>
      selectSeatList.some(itemA => itemA.includes(item.row + "排"))
    );
    this.logger.infoSave("目标列座位信息", {
      targetRow,
      lockseat: this.order.lockseat
    });
    return targetRow.filter(item => {
      return selectSeatList.includes(item.row + "排" + item.col + "座");
      // 考虑延迟可能先不用状态判断
      // return selectSeatList.includes(item.seatName) && item.status === "N";
    });
  }

  /**
   * 获取座位布局
   * @param {Object} params 请求参数
   * @returns {Promise<{seatData: Array, areaInfoList: Array}>}
   */
  async getSeatLayout(params) {
    try {
      this.logger.infoSave("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      // this.logger.info("获取座位布局返回", res);
      const res1 = await this.appApi.getMovieSeatPriceList(params);
      let areaInfoList = res1?.data?.room_seat;
      let seatObj = res?.data?.room_seat?.[0]?.seats || {};

      let seatData =
        Object.entries(seatObj)
          .map(item => item[1]?.detail)
          ?.flat() || [];

      if (!seatData.length) {
        this.logger.errorSave("获取座位布局为空");
      }

      return { seatData, areaInfoList };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", formatErrInfo(error));
    }
  }

  /**
   * 锁定座位
   * @param {Object} params 锁定座位参数
   * @param {boolean} [params.skipRetry] 为 true 时不重试（报价非最后候选座换座用）；最后候选座传 false 走重试
   * @returns {Promise<Object>} 锁定结果
   */
  async lockseatByApp(params) {
    const { skipRetry, ...lockParams } = params;
    try {
      let lockRes = await this.lockSeatHandle(lockParams);
      return lockRes;
    } catch (error) {
      this.logger.error("座位锁定失败", error);
      if (skipRetry) {
        return Promise.reject(error);
      }
      // 锁座重试
      return this.retryLockSeat(lockParams);
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
   * 辅助锁定座位
   * @private
   */
  async assistLockSeat(params) {
    const seatListRes = await this.getSeatLayout(params);

    const res = await assistLockSeatObj.assistLockSeatHandle({
      app_name: this.appFlag,
      plat_name: this.order.plat_name,
      order_number: this.order.order_number,
      seatList: seatListRes?.seatData || [],
      lockseat: this.order.lockseat,
      lockSeatParams: params
    });

    if (res) {
      return this.lockSeatHandle({ ...params, assistFlag: 1 });
    }
    // 辅助锁座失败现场必须落 L2——非 Save error 不写后端本地（2026-08-20 用户要求）
    this.logger.errorSave("辅助锁定座位失败", { params });
    return Promise.reject(new Error("辅助锁定座位失败"));
  }

  /**
   * 锁定座位处理
   * @private
   */
  async lockSeatHandle(data, inx = 1) {
    const params = this.getLockSeatParams(data);

    try {
      if (inx % 2 === 0) {
        const params = this.getSeatParams(data);
        await this.getSeatLayout(params);
        await mockDelay(1);
      }

      this.logger.info("锁定座位参数", params);
      const axiosConfig = data.silentError ? { silentError: true } : {};
      const res = await this.appApi.lockSeat(params, axiosConfig);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      // 辅助锁定座位
      // if (ASSIST_LOCK_ERRORS.includes(error?.msg) && data.assistFlag != 1) {
      //   return this.assistLockSeat(params);
      // }

      return Promise.reject(error);
    }
  }

  /**
   * 获取锁定座位参数
   * @private
   */
  getLockSeatParams(data) {
    const { cinema_id, schedule_id, seatCodes, session_id } = data;
    return {
      cinema_id,
      // seatlable	10084:2:12:35061501#08#04|10085:3:12:35061501#07#04,

      schedule_id,
      seatlable: seatCodes.join("|"),
      session_id
    };
  }
}
