// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  sendWxPusherMessage
} from "@/utils/utils";
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";
export default class OrderManage {
  constructor(order, logger, platManage, isTestOrder) {
    this.logger = logger; // 日志模块
    this.platManage = platManage; // 平台管理模块
    this.order = order;
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
    // 获取转单原因
    const errInfoObj = this.logger.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    let errMsg = errInfoObj?.des || "";
    let errInfo = formatErrInfo(errInfoObj?.info?.error) || "";
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
    return await this.platManage.orderTransferByPlat(errMsg, errInfo);
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
}
