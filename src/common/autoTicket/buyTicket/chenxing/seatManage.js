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
// 辅助锁座触发原因
const ASSIST_LOCK_ERRORS = ["座位旁边不要留空", "座位中间不要留空"];

// 统一座位管理
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO } from "@/common/constant";
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
    this.api_version = GET_APP_INFO(order.app_name)?.api_version;
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
      const {
        seatData: seatList = [],
        discountList = [],
        areaInfoList,
        cinemaPlanDto
      } = seatListRes || {};

      if (!seatList?.length) {
        this.logger.errorSave("座位列表为空");
        return;
      }

      const targetSeats = this.filterTargetSeats(seatList);
      if (targetSeats.length != this.order.ticket_num) {
        this.logger.errorSave("获取目标座位失败", {
          targetSeats,
          ticket_num: this.order.ticket_num
        });
        return;
      }

      return {
        seatCodes: targetSeats.map(item => item.seatCode),
        discountList,
        areaInfoList,
        cinemaPlanDto
      };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", formatErrInfo(error));
    }
  }

  /**
   * 获取座位参数
   * @private
   */
  getSeatParams(buyTicketInfo) {
    const {
      cinemaCode,
      cinemaId,
      filmId,
      featureAppNo,
      sessionId,
      targetShow
    } = buyTicketInfo;
    const { api_version } = this;
    let params = {
      cinemaCode,
      cinemaId,
      filmId
    };
    if (api_version === "3.0C") {
      params.featureAppNo = featureAppNo || targetShow?.featureAppNo;
    } else if (api_version === "C") {
      params.sessionId = sessionId || targetShow?.sessionId;
    }
    return params;
  }

  /**
   * 过滤目标座位
   * @private
   */
  filterTargetSeats(seatList) {
    const seatName = this.order.lockseat
      .replaceAll(" ", ",")
      .replaceAll("座", "号")
      .replaceAll("列", "号");
    const selectSeatList = seatName.split(",");
    const { api_version } = this;
    return seatList.filter(item => {
      let seatLabel;
      if (api_version == "3.0C") {
        seatLabel = `${item.rowNum}排${item.columnNum}号`;
      } else if (api_version == "C") {
        seatLabel = `${item.phyRowId}排${item.phyColId}号`;
      }
      return selectSeatList.includes(seatLabel);
      // 考虑延迟可能先不用状态判断
      // return selectSeatList.includes(seatLabel) && item.status === "N";
    });
  }

  /**
   * 获取座位布局
   * @param {Object} params 请求参数
   * @returns {Promise<{seatData: Array, areaInfoList: Array, discountList: Array}>}
   */
  async getSeatLayout(params) {
    try {
      const { api_version } = this;
      this.logger.info("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      // this.logger.info("获取座位布局返回", res);
      let seatData, discountList, areaInfoList, cinemaPlanDto;
      if (api_version === "3.0C") {
        seatData = res.data?.planSiteState || [];
        discountList = res.data?.disCountActivityResultList || [];
        cinemaPlanDto = res.data?.cinemaPlanDto || {};
      } else {
        seatData = res.data?.seats || [];
        areaInfoList = res.data?.areas || [];
      }

      if (!seatData.length) {
        this.logger.errorSave("获取座位布局为空");
      }

      return { seatData, discountList, areaInfoList, cinemaPlanDto };
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
      return res?.data;
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
    const { api_version } = this;
    const {
      cinemaId,
      cinemaCode,
      filmId,
      featureAppNo,
      sessionCode,
      seatInfos,
      seatCodes,
      session_id
    } = data;
    if (api_version === "3.0C") {
      return {
        cinemaId,
        cinemaCode,
        filmId,
        featureAppNo,
        seatInfos,
        session_id
      };
    } else {
      return {
        cinemaId,
        cinemaCode,
        filmId,
        sessionCode,
        seatCodes,
        session_id
      };
    }
  }
}
