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

  // 获取目标座位(主要暴漏方法)
  async getTargetSeat(buyTicketInfo) {
    const { lockseat, ticket_num } = this.order;
    try {
      let params = {
        cinemaCode: buyTicketInfo.cinemaCode,
        cinemaId: buyTicketInfo.cinemaId,
        filmId: buyTicketInfo.filmId,
        featureAppNo: buyTicketInfo.targetShow.featureAppNo
      };

      const seatListRes = await this.getSeatLayout(params);
      const seatList = seatListRes?.seatData || [];
      const discountList = seatListRes?.discountList || [];
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
      return { seatCodes, discountList };
    } catch (error) {
      this.logger.errorSave("获取目标座位异常", formatErrInfo(error));
    }
  }

  // 影院释放座位
  async releaseSeatByApp() {
    // sfc-先获取座位布局，然后锁定一个其它座位来进行释放；其它直接跳座位释放方法
  }

  // 获取座位布局
  async getSeatLayout(params) {
    try {
      this.logger.info("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      this.logger.info("获取座位布局返回", res);
      let seatData = res.data?.planSiteState || []; // 座位列表
      let discountList = res.data?.disCountActivityResultList || []; // 优惠活动列表
      let areaInfoList = []; // 座位分区列表
      if (!seatData?.length) {
        this.logger.errorSave("获取座位布局为空");
      }
      return {
        seatData,
        areaInfoList,
        discountList
      };
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", formatErrInfo(error));
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
      const res = await this.appApi.lockSeat(params);
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
