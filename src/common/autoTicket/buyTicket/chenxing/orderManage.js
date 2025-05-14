// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage
} from "@/utils/utils";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";
export default class OrderManage {
  constructor(order, logger, isTestOrder) {
    this.logger = logger; // 日志模块
    this.order = order; // 订单信息
    this.appFlag = order.app_name;
    this.isTestOrder = isTestOrder; // 是否是测试订单
  }

  // 转单
  async transferOrder(unlockSeatInfo) {
    // 1、释放座位(仅锁座id存在时)
    if (!unlockSeatInfo.createOrderId) await this.releaseSeat(unlockSeatInfo);

    // 2、取消订单(创建订单id存在时)
    if (unlockSeatInfo.createOrderId) await this.cancelOrder(unlockSeatInfo);

    // 3、平台转单
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer"); // 自动转单是否开启
    // 关闭自动转单只针对座位异常生效
    // if (this.isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    if (this.isTestOrder || isAutoTransfer !== "1") {
      this.logger.infoSave("自动转单处于关闭状态");
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip:
          "自动转单处于关闭状态,仅取消订单释放座位,需适时手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
      return;
    }
    return await this.orderTransferByPlat();
  }

  // 释放座位
  async releaseSeat(unlockSeatInfo) {
    const { cinemaCode, cinemaId, lockOrderId, session_id } = unlockSeatInfo;
    const { appFlag } = this;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        lockOrderId,
        ...(session_id && { session_id })
      };
      this.logger.info("释放座位参数", params);
      const res = await APP_API_OBJ[appFlag].releaseSeat(params);
      this.logger.infoSave("释放座位成功", { res });
    } catch (error) {
      this.logger.infoSave("释放座位异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "释放座位失败，建议手动释放座位，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }
  // 取消订单
  async cancelOrder(unlockSeatInfo) {
    const { cinemaCode, cinemaId, lockOrderId, orderHeaderId, session_id } =
      unlockSeatInfo;
    const { appFlag } = this;
    try {
      let params = {
        cinemaCode,
        cinemaId,
        lockOrderId,
        orderHeaderId,
        ...(session_id && { session_id })
      };
      this.logger.info("取消订单参数", params);
      const res = await APP_API_OBJ[appFlag].cancelOrder(params);
      this.logger.infoSave("取消订单成功", { res });
    } catch (error) {
      this.logger.infoSave("取消订单异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "取消订单失败，建议手动取消订单，以便后续订单正常出票",
        failReason: formatErrInfo(error)
      });
    }
  }
  // 平台转单
  async orderTransferByPlat() {
    const { plat_name, id, order_number, supplierCode } = this.order;
    // 1、获取转单原因
    const errInfoObj = this.logger.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";

    // 自动转单是否开启
    let isAutoTransfer = window.localStorage.getItem("isAutoTransfer");

    // 关闭自动转单只针对座位异常生效
    // if (isTestOrder || (isAutoTransfer !== "1" && errMsg === "锁定座位异常")) {
    let isTransferOrder = true;
    if (isTestOrder || isAutoTransfer !== "1") {
      console.warn("自动转单处于关闭状态");
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "自动转单处于关闭状态，只取消订单释放座位",
        level: "info"
      });
      isTransferOrder = false;
    }
    // 2、开始转单
    try {
      let params;
      if (plat_name === "lieren") {
        params = {
          id,
          confirm: 1
        };
      } else if (plat_name === "sheng") {
        params = {
          orderCode: order_number,
          supplierCode: supplierCode,
          reason: "价格过低无法出票"
        };
      } else if (plat_name === "mangguo") {
        params = {
          order_id: id,
          remark: "渠道无法出票"
        };
      } else if (plat_name === "mayi") {
        params = {
          tradeno: id,
          certificateImgUrl: "",
          reason: "",
          type: "bj_error"
        };
      } else if (plat_name === "yangcong") {
        params = {
          tradeno: id
        };
      } else if (plat_name === "haha") {
        params = {
          id: id,
          reasonId: 9,
          text: "其他-"
        };
      } else if (plat_name === "yinghuasuan") {
        params = {
          order_sn: order_number,
          close_cause: "价格过低无法出票"
        };
      } else if (plat_name === "shangzhan") {
        params = {
          order_sn: order_number,
          order_status: "3", // 出票状态（3：出票失败 9：出票成功）
          cancel_reason: "价格过低无法出票" // 出票失败原因（出票失败必传）
        };
      }
      this.logger.warn("转单参数", params);
      const res = await PLAT_API_OBJ[plat_name].transferOrder(params);
      this.logger.infoSave("转单成功", { res });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "自动转单处于开启状态,已转单无需处理",
        failReason: `${errMsg}——${errInfo}`
      });
      let { supplier_end_price, tpp_price, ticket_num } = this.order;
      // 洋葱转单是原价的百分之三
      if (["yangcong"].includes(plat_name) && tpp_price) {
        supplier_end_price = tpp_price;
      }
      let transfer_fee = 0; // 蚂蚁转单扣积分
      if (plat_name != "mayi") {
        transfer_fee = (
          (Number(supplier_end_price) * 100 * Number(ticket_num) * 3) /
          10000
        ).toFixed(2);
      }
      this.logger.warn("转单手续费", transfer_fee);
      return { transfer_fee };
    } catch (error) {
      this.logger.infoSave("转单原因", {
        errMsg,
        errInfo
      });
      this.logger.errorSave("转单异常", { error });
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "自动转单开启，转单失败，需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
    }
  }
}
