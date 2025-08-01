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
  shoutu: [6, 5]
};
// 辅助锁座触发原因
const ASSIST_LOCK_ERRORS = ["座位旁边不要留空", "座位中间不要留空"];

// 统一座位管理
import { APP_API_OBJ } from "@/common/index";
// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  trial // 重试方法
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
   * 获取目标座位
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
        return;
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
    const { cinemaLinkId, scheduleId, scheduleKey } = buyTicketInfo;
    let params = {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      pageInit: false
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
    const targetRow = seatList.filter(item =>
      selectSeatList.some(itemA =>
        item.seatName.includes(itemA.split("排")[0] + "排")
      )
    );
    this.logger.infoSave("目标列座位信息", {
      targetRow,
      lockseat: this.order.lockseat
    });
    return targetRow.filter(item => {
      return selectSeatList.includes(item.seatName);
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
      this.logger.info("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      // this.logger.info("获取座位布局返回", res);
      let areaInfoList = res?.schedule?.areaSalePrices || [];
      let seatData = res.sectionSeats?.map(item => item.seats)?.flat() || [];

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
        await this.getSeatLayout(params);
        await mockDelay(1);
      }

      this.logger.info("锁定座位参数", params);
      const res = await this.appApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      // 辅助锁定座位
      if (ASSIST_LOCK_ERRORS.includes(error?.msg) && data.assistFlag != 1) {
        return this.assistLockSeat(params);
      }

      return Promise.reject(error);
    }
  }

  /**
   * 获取锁定座位参数
   * @private
   */
  getLockSeatParams(data) {
    const { cinemaLinkId, scheduleId, scheduleKey, seatCodes, session_id } =
      data;
    return {
      cinemaLinkId,
      scheduleId,
      scheduleKey,
      // seatCodes: '["00000047887-4-20"]',
      seatCodes,
      fenghuangToken: session_id
    };
  }
}
