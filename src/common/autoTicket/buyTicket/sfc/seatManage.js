/**
 * SFC座位管理模块
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
 * @module sfc/seatManage
 */
import { formatErrInfo } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";

export default class SfcSeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.isTestOrder = isTestOrder;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 获取座位布局
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string|number} data.show_id - 场次ID
   * @param {string} data.session_id - 会话ID
   * @returns {Promise<Object>} { seatData, area_price, promo_num, error? }
   */
  async getSeatLayout(data) {
    let { city_id, cinema_id, show_id, session_id } = data || {};
    let params = {
      city_id: city_id,
      cinema_id: cinema_id,
      show_id: show_id,
      session_id,
      width: "240"
    };
    try {
      console.log("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log("获取座位布局返回", res);
      let play_data = res.data?.play_data || {};
      return {
        seatData: play_data.seat_data || [],
        area_price: play_data.area_price || [],
        promo_num: play_data.promo_num || 0
      };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", {
        error: formatErrInfo(error),
        params
      });
      return {
        error: formatErrInfo(error),
        seatData: [],
        area_price: [],
        promo_num: 0
      };
    }
  }

  /**
   * 获取目标座位
   * @param {Object} params - 参数对象
   * @param {string} params.lockseat - 座位信息，格式：如 "7排1座" 或 "7排1座,7排2座"
   * @param {Array} params.seatList - 座位列表（从getSeatLayout获取）
   * @param {number} params.ticket_num - 票数
   * @returns {Promise<Object>} { seat_ids, seat_info, error? }
   */
  async getTargetSeat({ lockseat, seatList, ticket_num }) {
    try {
      // 处理座位名称格式（座/号/列统一）
      let seatName = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");
      this.logger.info("seatName", seatName);
      let selectSeatList = seatName.split(",");
      this.logger.info("selectSeatList", selectSeatList);

      // 过滤出目标座位（seatList格式：[seat_id, x, status, y, price, seat_name, ...]）
      let targetList = seatList.filter(
        item => selectSeatList.includes(item[5]) // item[5]是座位名称
      );
      this.logger.infoSave("目标座位相关信息", { targetList });

      if (targetList?.length != ticket_num) {
        this.logger.errorSave("获取目标座位失败", {
          targetList,
          ticket_num,
          selectSeatList
        });
        return {
          error: "获取目标座位失败",
          seat_ids: "",
          seat_info: ""
        };
      }

      // 构建座位ID和座位信息
      let seat_ids = targetList.map(item => item[0]).join(","); // item[0]是座位ID
      let seat_info = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");

      return {
        seat_ids,
        seat_info
      };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", { error });
      return {
        error: formatErrInfo(error),
        seat_ids: "",
        seat_info: ""
      };
    }
  }

  /**
   * 锁定座位
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string|number} data.show_id - 场次ID
   * @param {string} data.seat_ids - 座位ID，逗号分隔
   * @param {string} data.start_day - 开始日期
   * @param {string} data.start_time - 开始时间
   * @param {string} data.session_id - 会话ID
   * @param {number} [data.inx=1] - 重试次数
   * @returns {Promise<Object>} 锁座结果
   */
  async lockSeatHandle(data, inx = 1) {
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      start_day,
      start_time,
      session_id
    } = data || {};
    try {
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        force_lock: "-1",
        seat_ids: seat_ids,
        start_day: start_day,
        start_time: start_time,
        session_id
      };
      if (inx == 1) {
        this.logger.infoSave(`第${inx}次锁定座位参数`, {
          params
        });
      }

      const res = await this.appApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位返回`, {
        res
      });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, {
        error
      });
      return Promise.reject(error);
    }
  }
}
