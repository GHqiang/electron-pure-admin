// 平台公共处理模块
import { PLAT_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";
// 订单管理模块
import {
  mockDelay,
  formatErrInfo, // 格式化错误信息
  trial, // 重试方法
  sendWxPusherMessage,
  generateTicketImage,
  uploadBlobImage
} from "@/utils/utils";
export default class PlatCommon {
  constructor(order, logger, isTestOrder) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger; // 日志模块
    this.isTestOrder = isTestOrder; // 是否测试订单
  }

  // 解锁座位(接单&解锁)
  async unlockSeatByPlat() {
    const { plat_name, id, bid, order_number, supplierCode } = this.order;
    let unlockRes;
    try {
      // 1、解锁座位
      if (plat_name === "lieren") {
        unlockRes = await this.unlockSeat({ plat_name, order_id: id, inx: 1 });
      } else if (plat_name === "sheng") {
        const deliverRes = await this.startDeliver({
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
        const deliverRes = await this.startDeliver({ plat_name, bid });
        this.logger.infoSave("确认接单返回", { deliverRes });
        await mockDelay(2);
        unlockRes = await this.unlockSeat({
          plat_name,
          order_id: id,
          inx: 1
        });
      } else if (plat_name === "yinghuasuan" && this.order.is_lock_seat == 1) {
        unlockRes = await this.unlockSeat({
          plat_name,
          order_number: this.order.order_sn, // 取order_sn
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

  // 确认接单
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

  // 座位解锁
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

  // 上传取票码
  async submitTicketCode({
    qrcode,
    flag, // 2-异步上传
    logger //日志记录实例
  }) {
    const {
      plat_name,
      id: order_id,
      order_number,
      supplierCode,
      lockseat,
      order_sn
    } = this.order;
    // 不同平台参数处理
    let params;
    if (plat_name === "lieren") {
      params = {
        // order_id: id || 5548629,
        // qupiao2: "[{\"result\":\"2024031154980669\",\"yzm\":\"\"}]"
        order_id,
        qupiao2: JSON.stringify([
          {
            result: qrcode.split("|")[0],
            yzm: qrcode.split("|")?.[1] || ""
          }
        ]),
        ticket_type: 2 // 取票方式
        // 1，猫眼淘票票取票机取票。
        // 2，影院专用取票机或前台取票。
        // 3，直接在入闸处扫码入闸进场观影。
      };
    } else if (plat_name === "sheng") {
      params = {
        orderCode: order_number, // 省APP的订单编号
        supplierCode: supplierCode,
        deliverInfos: JSON.stringify([{ code: qrcode }]), // 提交的时候转成文本，格式是JSON数组，可以多个取票码
        success: true // 是否成功 ，true，false需小写
        // message: "", // 出票失败原因，不能发货才有（失败的情况下一定要传）
        // desc: "" // 描述，允许空，换座信息也填在这里，如更换1排4座，1排5座
      };
    } else if (plat_name === "mangguo") {
      params = {
        order_id, // 省APP的订单编号
        tickets: JSON.stringify([
          {
            num: lockseat.split(" ").length,
            old_imgs: "",
            old_text_ycode: qrcode.split("|")?.[1] || "",
            text_info: qrcode.split("|")[0]
          }
        ]),
        seats: JSON.stringify(lockseat.split(" "))
      };
    } else if (plat_name === "mayi") {
      params = {
        tradeno: order_id, // 蚂蚁APP的订单编号
        ticketCodeList: [
          {
            picUrl: "",
            ticketCode: qrcode
          }
        ]
      };
    } else if (plat_name === "yangcong") {
      params = {
        tradeno: order_id, // 蚂蚁APP的订单编号
        ticketCodeUrls: "",
        ticketCodes: qrcode
      };
    } else if (plat_name === "yinghuasuan") {
      const blob = await generateTicketImage({ ...this.order, qrcode });
      let fileUrl = "";
      if (blob) {
        fileUrl = await uploadBlobImage({
          blob,
          url: "https://up-hub-img.yinghuasuan.com/api/upload_img",
          params: {
            event: "order",
            event_data: order_sn
          },
          plat_name,
          logger
        });
      }
      params = {
        order_sn,
        ticket_code: qrcode,
        ticket_image: fileUrl || " ", // 需传图片url
        real_seat_no: lockseat.split(" ").join(","),
        entry_method: 0,
        ticket_original_info: [
          {
            file_url: fileUrl || " ", // 需传图片url
            codeList: [
              {
                code: qrcode.split("|")[0],
                pwd: qrcode.split("|")?.[1] || ""
              }
            ],
            seatList: lockseat.split(" "),
            // ocrInfo为图片校验接口返回数据
            ocrInfo: {
              film_name: true,
              cinema_name: true,
              hall_name: true,
              show_time_day: true,
              show_time_time: true,
              seat_no: {
                is_change: false,
                seat_no: lockseat.split(" ")
              },
              ticket_code: [
                [qrcode.split("|")[0], qrcode.split("|")?.[1] || ""]
              ],
              have_qrcode: true,
              seatMatch: true
            }
          }
        ]
      };
    } else if (plat_name === "shangzhan") {
      params = {
        order_sn: order_number,
        order_status: "9", // 出票状态（3：出票失败 9：出票成功）
        // cancel_reason: "", // 出票失败原因（出票失败必传）
        ticket_list: [
          {
            ticket_code: qrcode.split("|")[0],
            ticket_msg_code: qrcode.split("|")?.[1] || ""
          }
        ]
      };
    } else if (plat_name === "haha") {
      const { bid, cinema_name, hall_name, film_name, show_time } = this.order;
      const blob = await generateTicketImage({ ...this.order, qrcode });
      const fileUrl = await uploadBlobImage({
        blob,
        url: "https://hahapiao.cn/api/Synchro/upload",
        params: {
          orderId: order_id
        },
        plat_name,
        logger
      });
      if (!fileUrl) {
        logger.infoSave("哈哈获取取票码图片失败,需手动上传");
        sendWxPusherMessage({
          orderInfo: this.order,
          transferTip: "哈哈获取取票码图片失败,需手动上传",
          failReason: "哈哈获取取票码图片失败,需手动上传"
        });
        return { code: 1, msg: "哈哈获取取票码图片失败,需手动上传" };
      }
      params = {
        oid: order_id,
        bid,
        seat: lockseat.split(" "),
        info: lockseat.split(" ").map((item, inx) => {
          if (inx === 0) {
            return {
              img: fileUrl || " ", // 传空格可以成功
              num: qrcode.split("|")[0],
              code: qrcode.split("|")[1],
              imgIndex: " ", // 传空格可以成功
              // isChai: false,
              // blob: "",
              seat: lockseat.split(" "),
              comparison: {
                movie: film_name,
                movieStatus: 1,
                showTime: show_time,
                showTimeStatus: 1,
                seat: lockseat.split(" "),
                seatStatus: 1,
                cinema: cinema_name,
                cinemaStatus: 1,
                hall: hall_name,
                hallStatus: 1
              }
            };
          } else {
            return {
              img: "",
              num: "",
              code: "",
              imgIndex: null
            };
          }
        }),
        seat_type: 0,
        ticket_type: 1,
        // ocr_code: [qrcode],
        recogniseSeat: lockseat.split(" ").map(item => ({
          oldSeat: item,
          newSeat: item,
          imgIndex: ""
        }))
      };
    }
    try {
      logger.infoSave("提交出票码参数", params);
      // if (this.isTestOrder) {
      //   logger.warn("测试单暂不上传");
      //   return;
      // }
      const res = await PLAT_API_OBJ[plat_name].submitTicketCode(params);
      logger.infoSave("提交出票码返回", res);
      return res;
    } catch (error) {
      let err_info = formatErrInfo(error);
      logger.errorSave("提交出票码异常", err_info);
      // 异步提交需更新出票记录信息
      if (flag === 2) {
        svApi.updateTicketRecord({
          whereObj: {
            order_number,
            plat_name
          },
          updateObj: {
            err_msg: "系统延迟后提交出票码异常",
            err_info
          }
        });
      }
    }
  }

  // 平台转单
  async orderTransferByPlat(errMsg, errInfo) {
    const { plat_name, id, order_number, supplierCode, order_sn } = this.order;
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
          order_sn,
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
      this.logger.errorSave("转单异常", formatErrInfo(error));
      sendWxPusherMessage({
        orderInfo: this.order,
        transferTip: "自动转单开启，转单失败，需手动出票或者转单",
        failReason: `${errMsg}——${errInfo}`
      });
    }
  }
}
