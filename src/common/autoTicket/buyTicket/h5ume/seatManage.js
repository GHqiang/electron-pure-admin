/**
 * H5UME座位管理模块
 *
 * 职责：
 * - 获取座位布局信息
 * - 解析目标座位
 * - 锁定座位
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module h5ume/seatManage
 */
import { formatErrInfo, mockDelay } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import assistLockSeatObj from "../../lockSeatQueue";

export default class H5UmeSeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.isTestOrder = isTestOrder;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取座位布局
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string|number} params.hallId - 影厅ID
   * @param {string|number} params.scheduleId - 场次ID
   * @param {string} params.scheduleKey - 场次Key
   * @param {string} [params.session_id] - 会话ID（可选）
   * @returns {Promise<Object>} { seats, areaInfos, error? }
   */
  async getSeatLayout({
    cinemaLinkId,
    hallId,
    scheduleId,
    scheduleKey,
    session_id
  }) {
    try {
      let params = {
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        apiVersion: "1.0",
        empCode: "",
        leaseCode: "",
        ...(session_id && { umeToken: session_id })
      };
      this.logger.info("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      let sections = res.bizValue?.sections?.[0] || {};
      this.logger.info("获取座位布局返回", res);
      return {
        seats: sections.seats || [],
        areaInfos: sections.areaInfos || []
      };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", error);
      return {
        error: formatErrInfo(error),
        seats: [],
        areaInfos: []
      };
    }
  }

  /**
   * 获取目标座位
   * @param {Object} params - 参数对象
   * @param {string} params.lockseat - 座位信息，格式：如 "7排1座" 或 "7排1座,7排2座"
   * @param {Array} params.seatList - 座位列表（从getSeatLayout获取）
   * @param {number} params.ticket_num - 票数
   * @returns {Promise<Object>} { targeSeatList, seatIds, areaTotalPrice, error? }
   */
  async getTargetSeat({ lockseat, seatList, ticket_num, areaInfoList }) {
    try {
      let seatName = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");
      this.logger.info("seatName", seatName);
      let selectSeatList = seatName.split(",");
      this.logger.info("selectSeatList", selectSeatList);
      let targeSeatList = seatList.filter(item => {
        const { rowName, columnName } = item;
        let seat2 = rowName + "排" + columnName + "号";
        return selectSeatList.includes(seat2);
      });
      this.logger.info("targeSeatList", targeSeatList);
      let seatIds = targeSeatList.map(item => ({ seatId: item.seatId }));

      // 座位价格信息
      let areaTotalPrice = 0;
      targeSeatList.forEach(item => {
        let targetItem = areaInfoList.find(
          itemA => itemA.areaId === item.areaId
        );
        if (targetItem) {
          areaTotalPrice += targetItem.areaSettlePrice || 0;
        }
      });

      this.logger.infoSave("目标座位相关信息", {
        targeSeatList,
        areaInfoList,
        areaTotalPrice
      });

      if (seatIds?.length != ticket_num) {
        this.logger.errorSave("获取目标座位失败", {
          seatList,
          seatName
        });
        return {
          errorCode: "TARGET_SEAT_FAILED",
          error: "获取目标座位失败",
          targeSeatList: [],
          seatIds: [],
          areaTotalPrice: 0
        };
      }

      return { targeSeatList, seatIds, areaTotalPrice };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", { error });
      return {
        error: formatErrInfo(error),
        targeSeatList: [],
        seatIds: [],
        areaTotalPrice: 0
      };
    }
  }

  /**
   * 锁定座位
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string|number} data.hallId - 影厅ID
   * @param {string|number} data.scheduleId - 场次ID
   * @param {string} data.scheduleKey - 场次Key
   * @param {string} data.seatIds - 座位ID，格式：用|分隔
   * @param {Array} data.seatList - 座位列表
   * @param {string} data.lockseat - 锁定座位信息
   * @param {string} data.plat_name - 平台名称
   * @param {string} data.order_number - 订单号
   * @param {string} data.session_id - 会话ID
   * @param {number} [data.inx=1] - 重试次数
   * @param {number} [data.assistFlag] - 帮助锁座后重试标识
   * @returns {Promise<Object>} 锁座结果
   */
  async lockSeatHandle(data, inx = 1) {
    const {
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      seatList,
      lockseat,
      plat_name,
      order_number,
      assistFlag // 帮助锁座后重试标识
    } = data;
    const currentParams = this.getCurrentParams?.();
    const session_id = currentParams?.list?.[currentParams?.inx]?.session_id;
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      seatIds,
      scheduleId,
      scheduleKey,
      umeToken: session_id
    };
    const { appFlag } = this;
    try {
      // 不需要每个都调下，解决锁定座位时没座位返回重进就有座位的问题
      if (inx % 2 === 1) {
        await this.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey,
          session_id
        });
        await mockDelay(1);
      }

      this.logger.info("锁定座位参数", params);
      const res = await this.appApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res?.bizValue;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      // 仅帮助锁座1次，帮助锁座后再锁定座位失败的话就不走帮助锁座逻辑了
      if (
        ["座位旁边不要留空", "座位中间不要留空"].includes(error?.msg) &&
        assistFlag != 1
      ) {
        const areaRes = await this.getSeatLayout({
          cinemaLinkId,
          hallId,
          scheduleId,
          scheduleKey,
          session_id
        });
        let newSeatList = areaRes?.seats || [];
        // 帮助锁定座位方法
        const res = await assistLockSeatObj.assistLockSeatHandle({
          app_name: appFlag,
          plat_name,
          order_number,
          seatList: newSeatList,
          lockseat,
          lockSeatParams: params
        });
        if (!res) {
          return Promise.reject(error);
        } else {
          return this.lockSeatHandle({ ...data, assistFlag: 1 });
        }
      }
      return Promise.reject(error);
    }
  }

  /**
   * 设置获取当前参数的函数（由buyTicket模块调用时设置）
   * @param {Function} getCurrentParams - 获取当前参数的函数
   */
  setGetCurrentParams(getCurrentParams) {
    this.getCurrentParams = getCurrentParams;
  }
}
