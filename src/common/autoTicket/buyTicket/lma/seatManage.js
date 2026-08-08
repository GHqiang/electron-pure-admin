/**
 * LMA座位管理模块
 *
 * 职责：
 * - 获取座位布局信息
 * - 解析目标座位
 * - 锁定座位（创建订单）
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module lma/seatManage
 */
import { formatErrInfo, trial, mockDelay } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO } from "@/common/constant";

export default class LmaSeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.isTestOrder = isTestOrder;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  // 获取座位布局
  async getSeatLayout({ cinema_id, show_id, lmaToken }) {
    let params = {
      cinema_id,
      session_id: show_id,
      ...(lmaToken && { lmaToken })
    };
    try {
      this.logger.infoSave("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      // 记录上游原始响应关键字段，便于排查 LMA 限流降级返回无价格分区等问题
      this.logger.infoSave("获取座位布局原始响应", {
        code: res?.code,
        status: res?.status,
        msg: res?.msg,
        message: res?.message,
        label_arr_len: res?.data?.label_arr?.length || 0,
        seat_arr_len: res?.data?.seat_arr?.length || 0,
        short_code: res?.data?.short_code
      });
      if (res.code !== "0") {
        this.logger.errorSave("获取座位布局失败(code非0)", {
          code: res?.code,
          msg: res?.msg,
          message: res?.message,
          params
        });
        return { error: "获取座位布局失败", seatData: [], label_arr: [] };
      }

      let seatData = res.data?.seat_arr || [];
      // 转换数据保持和上面取值一致，过滤出来可选座位
      seatData = seatData
        .map(item => item.column)
        .flat()
        .map(item => {
          return {
            ...item,
            seat_info: item.px + "排" + item.py + "号"
          };
        });
      console.log("seatData", seatData);

      return {
        seatData,
        label_arr: res.data?.label_arr || [],
        short_code: res.data?.short_code
      };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", {
        error: formatErrInfo(error),
        params
      });
      return { error: formatErrInfo(error), seatData: [], label_arr: [] };
    }
  }

  // 获取目标座位
  async getTargetSeat({ lockseat, seatList, label_arr, ticket_num }) {
    try {
      // 处理座位名称格式
      let seatName = lockseat
        .replaceAll(" ", ",")
        .replaceAll("座", "号")
        .replaceAll("列", "号");
      let selectSeatList = seatName.split(",");

      // 过滤出目标座位
      let targetSeatList = seatList.filter(item =>
        selectSeatList.includes(item.seat_info)
      );

      this.logger.infoSave("目标座位相关信息", {
        targetSeatList,
        label_arr
      });

      // 构建座位数组
      let seat_arr = targetSeatList.map(item => {
        // 去除自填充值
        const { seat_info, ...otherInfo } = item;
        return {
          ...otherInfo,
          price: label_arr.find(
            item => item.price_type === otherInfo.price_type
          )?.price,
          fixIcon: "/images/weixiu.png"
        };
      });

      if (seat_arr?.length != ticket_num) {
        this.logger.errorSave("获取目标座位失败", {
          seatList,
          seatName,
          seat_arr,
          ticket_num
        });
        return {
          errorCode: "TARGET_SEAT_FAILED",
          error: "获取目标座位失败",
          seat_arr: []
        };
      }

      return { seat_arr };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", { error });
      return { error: formatErrInfo(error), seat_arr: [] };
    }
  }

  // 锁座
  async lockseatByApp({
    cinema_id,
    show_id,
    short_code,
    seat_arr,
    lmaToken,
    quan_code,
    inx = 1
  }) {
    const MAX_LOCK_RETRY = 3; // 座位已被锁定时最多重试3次
    const LOCK_RETRY_DELAY = 1; // 重试间隔（秒）
    try {
      let params = {
        cinema_id: cinema_id,
        session_id: show_id,
        short_code,
        voucher_arr: quan_code || JSON.stringify([]),
        seat_arr: JSON.stringify(seat_arr),
        lmaToken
      };
      this.logger.infoSave(`第${inx}次锁定座位参数`, { params });
      const res = await this.appApi.lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res });
      return res;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位失败`, { error });
      // 座位已被锁定时重试3次，仍失败再抛出异常交由上层走申请换座/转单逻辑
      const errInfo = formatErrInfo(error);
      if (errInfo.includes("座位已被锁定") && inx <= MAX_LOCK_RETRY) {
        this.logger.infoSave(
          `座位已被锁定，${LOCK_RETRY_DELAY}秒后进行第${inx + 1}次重试`,
          { inx }
        );
        await mockDelay(LOCK_RETRY_DELAY);
        return this.lockseatByApp({
          cinema_id,
          show_id,
          short_code,
          seat_arr,
          lmaToken,
          quan_code,
          inx: inx + 1
        });
      }
      return Promise.reject(error);
    }
  }
}
