// 统一座位管理
import { APP_API_OBJ, PLAT_API_OBJ } from "@/common/index";
// 订单管理模块
import {
  formatErrInfo, // 格式化错误信息
  trial, // 重试方法
  sendWxPusherMessage
} from "@/utils/utils";
export default class SeatManage {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger; // 日志模块
  }

  // 平台解锁座位
  async unlockSeatByPlat() {
    const { plat_name, id, bid, order_number, supplierCode } = order;
    let unlockRes;
    try {
      // 1、解锁座位
      if (plat_name === "lieren") {
        unlockRes = await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
      } else if (plat_name === "sheng") {
        const deliverRes = await startDeliver({
          plat_name,
          order_number,
          supplierCode
        });
        this.logger.infoSave("确认接单返回", { deliverRes });
        await mockDelay(2);
        unlockRes = await this.unlockSeat({
          plat_name,
          order_number,
          supplierCode,
          inx: 1
        });
      } else if (plat_name === "mangguo") {
        unlockRes = await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
      } else if (plat_name === "mayi") {
        unlockRes = await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
      } else if (plat_name === "yangcong") {
        unlockRes = await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
      } else if (plat_name === "haha") {
        const deliverRes = await startDeliver({ plat_name, bid });
        this.logger.infoSave("确认接单返回", { deliverRes });
        await mockDelay(2);
        unlockRes = await this.unlockSeat({
          plat_name,
          order_id: id,
          inx: 1
        });
      } else if (plat_name === "yinghuasuan") {
        unlockRes = await this.unlockSeat({
          plat_name,
          order_number,
          inx: 1
        });
      }
      this.logger.infoSave("订单首次解锁座位完成");
      return unlockRes;
    } catch (error) {
      this.logger.error("解锁座位失败准备试错", error);
      // 试错3次，间隔3秒
      let params = {
        order_id: id,
        order_number,
        supplierCode,
        plat_name
      };
      let delayConfig = {
        lieren: [3, 3],
        mangguo: [3, 3],
        sheng: [3, 3],
        mayi: [60, 1],
        yangcong: [3, 3],
        haha: [3, 3],
        yinghuasuan: [3, 3]
      };
      unlockRes = await trial(
        inx => this.unlockSeat({ ...params, inx }),
        delayConfig[plat_name][0],
        delayConfig[plat_name][1]
      );
      if (unlockRes) {
        this.logger.infoSave("订单首次解锁失败,试错后解锁成功");
      }
      return unlockRes;
    }
  }

  // 平台确认接单
  async startDeliver({ order_number, supplierCode, plat_name, bid, quote_id }) {
    try {
      let params;
      if (plat_name === "sheng") {
        params = {
          orderCode: order_number,
          supplierCode
        };
      } else if (plat_name === "haha") {
        params = {
          bid
        };
      } else if (plat_name === "yinghuasuan") {
        params = {
          quote_id
        };
      }
      this.logger.info("确认接单参数", params);
      const res = await PLAT_API_OBJ[plat_name].confirmOrder(params);
      this.logger.info("确认接单返回", res);
      return res;
    } catch (error) {
      this.logger.warn("确认接单异常", error);
    }
  }

  // 解锁座位-平台
  async unlockSeat({
    plat_name,
    order_id,
    inx = 1,
    order_number: orderCode,
    supplierCode
  }) {
    try {
      let params;
      if (plat_name === "lieren") {
        params = {
          order_id
        };
      } else if (plat_name === "sheng") {
        params = {
          orderCode,
          supplierCode
        };
      } else if (plat_name === "mangguo") {
        params = {
          order_id
        };
      } else if (plat_name === "mayi") {
        params = {
          tradeno: order_id
        };
      } else if (plat_name === "yangcong") {
        params = {
          tradeno: order_id
        };
      } else if (plat_name === "haha") {
        params = {
          id: order_id
        };
      } else if (plat_name === "yinghuasuan") {
        params = {
          order_sn: orderCode
        };
      }
      this.logger.info("解锁座位入参", params);
      const res = await PLAT_API_OBJ[plat_name].unlockSeat(params);
      this.logger.infoSave(`第${inx}次解锁座位成功`, res);
      return res;
    } catch (error) {
      // 芒果偶尔会这样
      if ((error?.msg || error?.message || "").includes("已经解锁")) {
        this.logger.infoSave(`第${inx}次解锁座位发现已解锁`, error);
        return;
      }
      // 芒果座位会未锁从而无需解锁
      if (
        (error?.msg || error?.message || "").includes(
          "该座位未锁座成功，故无法解锁"
        )
      ) {
        this.logger.infoSave(`第${inx}次解锁座位发现座位无需解锁`, error);
        return;
      }
      // 哈哈偶尔会这样
      if (error?.msg === "当前订单座位没有被锁") {
        this.logger.infoSave(`第${inx}次解锁座位发现座位没有被锁`, error);
        return;
      }
      this.logger.errorSave(`第${inx}次解锁座位失败`, error);
      return Promise.reject(error);
    }
  }

  // 影院释放座位
  async releaseSeatByApp() {
    // sfc-先获取座位布局，然后锁定一个其它座位来进行释放；其它直接跳座位释放方法
  }

  // 获取座位布局
  async getSeatLayout(params) {
    const { appFlag } = this;
    try {
      this.logger.info("获取座位布局参数", params);
      const res = await APP_API_OBJ[appFlag].getMoviePlaySeat(params);
      this.logger.info("获取座位布局返回", res);
      let seatData = res.data?.planSiteState || []; // 座位列表
      let areaInfoList = []; // 座位分区列表
      if (!seatData?.length) {
        this.logger.errorSave("获取座位布局为空");
      }
      return {
        seatData,
        areaInfoList
      };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", formatErrInfo(error));
    }
  }

  // 获取目标座位
  async getTargetSeat(buyTicketInfo) {
    const { lockseat, ticket_num } = this.order;
    const { appFlag } = this;
    try {
      let params;
      // 辰星入参
      params = {
        cinemaCode: buyTicketInfo.cinemaCode,
        cinemaId: buyTicketInfo.cinemaId,
        filmId: buyTicketInfo.filmId,
        featureAppNo: buyTicketInfo.targetShow.featureAppNo
      };

      const seatListRes = await this.getSeatLayout(params);
      const seatList = seatListRes?.seatData || [];
      const areaInfoList = seatListRes?.areaInfoList || [];
      if (!seatList?.length) {
        return;
      }
      // 匹配目标座位
      const seatName = lockseat.replaceAll(" ", ",").replaceAll("座", "号");
      this.logger.info("目标座位seatName", seatName);
      const selectSeatList = seatName.split(",");
      this.logger.info("目标座位selectSeatList", selectSeatList);
      const targeSeatList = seatList.filter(item => {
        const { rowNum, columnNum } = item;
        let seat2 = rowNum + "排" + columnNum + "号";
        return selectSeatList.includes(seat2) && item.status == "N";
      });
      this.logger.infoSave("目标座位相关信息", { targeSeatList });
      const seatCodes = targeSeatList.map(item => item.seatCode);
      if (seatCodes?.length != ticket_num) {
        return this.logger.errorSave("获取目标座位失败");
      }
      return seatCodes;
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", formatErrInfo(error));
    }
  }

  // 影院座位锁定
  async lockseatByApp(params) {
    let lockRes;
    try {
      lockRes = await this.lockSeatHandle(params); // 锁定座位
      return lockRes;
    } catch (error) {
      this.logger.error("座位锁定失败");
      // 非这两种情况才需要走重试，这两种情况已经走帮助锁座逻辑了
      let isTrial = !["座位旁边不要留空", "座位中间不要留空"].includes(
        error?.msg
      );
      if (isTrial) {
        // 锁定座位尝试配置
        let delayConfig = {
          lieren: [10, 5],
          mangguo: [10, 5],
          sheng: [10, 5],
          mayi: [10, 5],
          yangcong: [10, 5],
          haha: [6, 5],
          yinghuasuan: [6, 5],
          shangzhan: [6, 5]
        };
        this.logger.info("座位锁定失败准备重试");
        lockRes = await trial(
          inx => this.lockSeatHandle(params, inx),
          delayConfig[plat_name][0],
          delayConfig[plat_name][1]
        );
      }
      if (!lockRes && isTrial) {
        return this.logger.infoSave("重试锁定座位失败");
      }
      if (isTrial) {
        this.logger.infoSave("重试锁定座位成功");
        return lockRes;
      }
    }
  }

  // 锁定座位-影院
  async lockSeatHandle(data, inx = 1) {
    const {
      cinemaCode,
      cinemaId,
      filmId,
      featureAppNo,
      seatInfos,
      seatList,
      lockseat,
      plat_name,
      order_number,
      session_id,
      assistFlag // 帮助锁座后重试标识
    } = data;
    const { appFlag } = this;
    let params = {
      cinemaId,
      cinemaCode,
      unifiedCode: cinemaCode,
      filmId,
      featureAppNo,
      seatInfos,
      session_id
    };
    try {
      // 不需要每个都调下，解决锁定座位时没座位返回重进就有座位的问题
      if (inx % 2 === 0) {
        await this.getSeatLayout({
          cinemaCode,
          cinemaId,
          filmId,
          featureAppNo,
          session_id
        });
        await mockDelay(1);
      }

      this.logger.info("锁定座位参数", params);
      const res = await APP_API_OBJ[appFlag].lockSeat(params);
      this.logger.infoSave(`第${inx}次锁定座位成功`, { res, params });
      return res?.data;
    } catch (error) {
      this.logger.errorSave(`第${inx}次锁定座位异常`, { error, params });
      // 仅帮助锁座1次，帮助锁座后再锁定座位失败的话就不走帮助锁座逻辑了
      if (
        ["座位旁边不要留空", "座位中间不要留空"].includes(error?.msg) &&
        assistFlag != 1
      ) {
        const seatListRes = await this.getSeatLayout({
          cinemaCode,
          cinemaId,
          filmId,
          featureAppNo,
          appFlag,
          session_id
        });
        let newSeatList = seatListRes?.seatData || [];
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
}
