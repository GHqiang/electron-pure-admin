import {
  getCurrentFormattedDateTime,
  logUpload, // 日志上传
  trial, // 试错重试
  adjustSeats // 获取需要帮助锁定的座位
} from "@/utils/utils";

// 影院特殊匹配列表及api
import { APP_API_OBJ } from "@/common/index";
import { UME_LIST } from "@/common/constant";
// 创建一个订单自动锁座队列类
class OrderAutoLockSeatQueue {
  constructor() {}

  // 帮助锁座方法
  async assistLockSeatHandle(order) {
    let logList = [
      {
        opera_time: getCurrentFormattedDateTime(),
        des: "帮助锁座方法接收到的参数",
        level: "info",
        info: {
          order
        }
      }
    ];
    try {
      const res = await this.lockSeatCommonHandle(order, logList);
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "帮助锁座结果返回",
        level: "info",
        info: {
          res
        }
      });
      logUpload(
        {
          plat_name: order.plat_name,
          app_name: order.app_name,
          order_number: order.order_number,
          type: 5
        },
        logList
      );
      return res;
    } catch (error) {
      console.error("帮助锁座异常", error);
    }
  }

  // 帮助锁座统一处理
  async lockSeatCommonHandle(order, logList) {
    const { app_name, plat_name } = order;
    let isUme = UME_LIST.includes(app_name);
    let funName = isUme ? "lockSeatHandleByUme" : "lockSeatHandleBySfc";
    try {
      return await this[funName](order, logList); // 锁定座位
    } catch (error) {
      console.error("锁定座位失败准备试错2次，间隔5秒", error);
      // 试错3次，间隔5秒
      // 锁定座位尝试配置
      let delayConfig = {
        lieren: [3, 5],
        mangguo: [3, 5],
        sheng: [3, 5],
        mayi: [3, 10],
        yangcong: [3, 10],
        haha: [3, 5],
        yinghuasuan: [3, 5],
        shangzhan: [3, 5]
      };
      return await trial(
        inx => this[funName](order, logList, inx),
        delayConfig[plat_name][0],
        delayConfig[plat_name][1]
      );
    }
  }

  // 锁定座位ume
  async lockSeatHandleByUme(order, logList, inx = 1) {
    try {
      // 10排6座 10排8座
      let { app_name, seatList, lockseat, lockSeatParams } = order || {};
      let params1 = lockSeatParams;
      // 获取目标行行数
      let targetRowNum = lockseat.slice(0, 1); // 10
      // 获取目标行座位列表
      let targetRowList = seatList.filter(item => item.rowName == targetRowNum);
      // 获取目标行已锁定座位(0是未售)
      let lockedSeats = targetRowList
        .filter(item => item.status != 0)
        .map(item => item.columnName);
      // 获取目标行目标锁定座位
      let targetSeats = lockseat
        .split(" ")
        .map(item => item.split("排")[1].slice(0, 1))
        .sort((a, b) => +a - b); // ["6", "8"] | ["12"]
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "帮助锁定座位前判断相关信息",
        level: "info",
        info: {
          targetRowList,
          lockedSeats,
          targetSeats
        }
      });
      // 需要补全的座位
      const fillSeat = adjustSeats(
        lockedSeats,
        targetSeats,
        targetRowList.length
      );

      if (!fillSeat?.length) {
        logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取补全座位方法返回空，无法补全座位",
          level: "info"
        });
        return;
      }
      // 补全座位信息
      let fillSeatList = targetRowList.filter(item =>
        fillSeat.includes(item.columnName)
      );
      console.log("fillSeatList", fillSeatList);
      let seat_ids = fillSeatList.map(item => item.seatCode);
      ticketDetail = seat_ids.map(item => ({
        seatCode: item,
        buyerRemark: ""
      }));
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "补全座位相关信息",
        level: "info",
        info: {
          fillSeat,
          fillSeatList,
          seat_ids,
          ticketDetail
        }
      });
      params1.params.ticketDetail = ticketDetail;
      const session_id = await this.setLocalLoginList(
        { rule: "2", app_name },
        logList
      );
      if (!session_id) {
        logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取目标影院小号session返回空，无法补全座位",
          level: "info"
        });
        return;
      }
      // 差一个获取对应的session_id;
      params1.session_id = session_id;
      try {
        // 不需要每个都调下，解决锁定座位时没座位返回重进就有座位的问题
        // if (inx % 2 === 1) {
        //   const { cinemaCode, cinemaLinkId, scheduleId, scheduleKey } =
        //     params1.params;
        //   await this.getSeatLayoutByUme({
        //     cinemaCode,
        //     cinemaLinkId,
        //     scheduleId,
        //     scheduleKey,
        //     session_id: params1.session_id,
        //     app_name
        //   });
        //   await mockDelay(1);
        // }

        console.log("锁定座位参数", params1);
        const res = await APP_API_OBJ[app_name].lockSeat(params1);
        console.log("锁定座位返回", res);
        logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次锁定座位返回`,
          level: "info",
          info: {
            res,
            params1
          }
        });
        return res?.data;
      } catch (error) {
        console.error("锁定座位异常", error);
        logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: `第${inx}次锁定座位异常`,
          level: "error",
          info: {
            params1,
            error
          }
        });
        if (error?.msg === "存在有未支付的订单！") {
          logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `第${inx}次锁定座位时发现有未支付的订单，准备先取消订单，再进行锁座`,
            level: "info"
          });
          const { cinemaCode, cinemaLinkId } = params1.params;
          const cancelRes = await this.cannelOneOrderByUme({
            cinemaCode,
            cinemaLinkId,
            orderHeaderId, // 该字段不传就是取消最近一次的未支付订单
            app_name,
            session_id
          });
          if (cancelRes) {
            // 取消完再购买一次
            return await this.lockSeatHandleByUme(order, logList, inx);
          }
        }
        return Promise.reject(error);
      }
    } catch (error) {
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "ume帮助锁座方法执行异常",
        level: "error",
        info: {
          error
        }
      });
      return Promise.reject(error);
    }
  }

  // 取消订单ume
  async cannelOneOrderByUme({
    cinemaCode,
    cinemaLinkId,
    orderHeaderId, // 该字段不传就是取消最近一次的未支付订单
    app_name,
    session_id
  }) {
    let params = {
      params: {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        orderHeaderId,
        cinemaCode,
        cinemaLinkId
      },
      ...(session_id && { session_id })
    };
    try {
      console.log("取消订单参数", params);
      const res = await APP_API_OBJ[app_name].cannelOneOrder(params);
      console.log("取消订单返回", res);
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "取消订单返回",
        level: "info",
        info: {
          params,
          res
        }
      });
    } catch (error) {
      console.error("取消订单异常", error);
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "取消订单异常",
        level: "error",
        info: {
          params,
          error
        }
      });
    }
  }

  // 获取目标影院小号的登录信息
  async setLocalLoginList({ rule, app_name }, logList) {
    try {
      const loginRes = await svApi.queryLoginList({
        rule,
        app_name,
        is_xiaohao: "1"
      });
      // console.log("ruleRes", ruleRes);
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取目标影院小号的登录信息返回",
        level: "info",
        info: {
          loginRes
        }
      });
      let loginRecords = loginRes.data.loginList || [];
      return loginRecords[0]?.session_id;
    } catch (error) {
      logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取目标影院小号的登录信息返回异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 锁定座位sfc
  async lockSeatHandleBysfc(order, logList, inx = 1) {
    // let { app_name, seatList } = order || {};
    // let params = order.lockSeatParams;
    // try {
    //   console.log("锁定座位参数", params);
    //   const res = await APP_API_OBJ[app_name].lockSeat(params);
    //   console.log("锁定座位返回", res);
    //   logList.push({
    //     opera_time: getCurrentFormattedDateTime(),
    //     des: `第${inx}次锁定座位返回`,
    //     level: "info",
    //     info: {
    //       res,
    //       params
    //     }
    //   });
    //   return res;
    // } catch (error) {
    //   console.error("锁定座位异常", error);
    //   logList.push({
    //     opera_time: getCurrentFormattedDateTime(),
    //     des: `第${inx}次锁定座位失败`,
    //     level: "error",
    //     info: {
    //       error,
    //       params
    //     }
    //   });
    //   return Promise.reject(error);
    // }
  }

  // 获取座位布局
  async getSeatLayoutByUme({
    cinemaCode,
    cinemaLinkId,
    scheduleId,
    scheduleKey,
    session_id,
    app_name
  }) {
    try {
      let params = {
        params: {
          cinemaCode,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001"
        },
        ...(session_id && { session_id })
      };
      console.log("获取座位布局参数", params);
      const res = await APP_API_OBJ[app_name].getMoviePlaySeat(params);
      console.log("获取座位布局返回", res);
      let seatData = res.data?.seatList || [];
      return {
        seatData,
        params
      };
    } catch (error) {
      console.error("获取座位布局异常", error);
      return {
        error,
        params
      };
    }
  }

  // 停止队列运行
  stop() {
    this.isStart = false;
    console.warn("自动锁座队列停止");
  }
}
// 生成锁座队列实例
export default new OrderAutoLockSeatQueue();
