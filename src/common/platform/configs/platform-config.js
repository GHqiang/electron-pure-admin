// 平台配置中心 - 统一管理所有平台的配置信息
// 支持平台扩展，新增平台只需在此添加配置即可

/**
 * 平台配置结构
 * @typedef {Object} PlatformConfig
 * @property {string} name - 平台代码
 * @property {string} displayName - 平台显示名称
 * @property {Object} features - 平台特性配置
 * @property {boolean} features.hasTransferFee - 是否有转单手续费
 * @property {number} features.priceStep - 价格步进（0.1 或 1）
 * @property {boolean} features.isNeedRuleId - 是否需要规则ID
 * @property {boolean} features.supportAsyncSubmit - 是否支持异步提交
 * @property {boolean} features.unlockBeforeTicket - 出票前是否需要解锁
 * @property {boolean} features.needConfirmOrder - 是否需要确认接单
 * @property {Object} api - API接口配置
 * @property {string} api.getOrderList - 获取订单列表接口方法名
 * @property {string} api.submitOffer - 提交报价接口方法名
 * @property {string} api.unlockSeat - 解锁座位接口方法名
 * @property {string} api.submitTicket - 提交取票码接口方法名
 * @property {string} api.transferOrder - 转单接口方法名
 * @property {Object} params - 参数转换配置
 * @property {string} params.orderIdKey - 订单ID字段名
 * @property {string} params.orderNumberKey - 订单号字段名
 * @property {Function} params.unlockParams - 解锁参数转换函数
 * @property {Function} params.submitParams - 提交参数转换函数
 * @property {Function} params.transferParams - 转单参数转换函数
 * @property {Object} [rewards] - 奖励配置（可选）
 */

import { LIERENR_REWARDS } from "@/common/constant.js";

/**
 * 平台配置映射表
 * 新增平台时，只需在此添加配置即可
 */
export const PLATFORM_CONFIGS = {
  // 猎人平台配置
  lieren: {
    name: "lieren",
    displayName: "猎人",
    features: {
      hasTransferFee: false,
      priceStep: 1,
      isNeedRuleId: true, // 是否需要规则ID
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      // 解锁参数转换
      unlockParams: order => ({
        order_number: order.order_number
      }),
      // 提交取票码参数转换
      submitParams: (order, qrcode) => ({
        order_number: order.order_number,
        result: [
          {
            qpm: qrcode.split("|")[0],
            yzm: qrcode.split("|")?.[1] || ""
          }
        ],
        ticket_type: 2
      }),
      // 转单参数转换
      transferParams: (order, reason) => ({
        order_number: order.order_number,
        confirm: 1
      }),
      // 提交报价参数转换
      offerParams: ({ order, price, ruleId, memberPrice }) => ({
        order_number: order.order_number,
        price,
        rule_id: ruleId,
        member_price: memberPrice
      })
    },
    rewards: LIERENR_REWARDS,
    // 订单转换函数：将平台原始订单转换为统一格式
    transformOrder: order => ({
      ...order,
      plat_name: "lieren",
      offer_end_time: order.sytime * 1000, // 转为时间戳
      rewards: LIERENR_REWARDS[order.order_urgent] || 0
    })
  },

  // 哈哈平台配置
  haha: {
    name: "haha",
    displayName: "哈哈",
    features: {
      hasTransferFee: false,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        id: order.id
      }),
      submitParams: (order, qrcode) => {
        // 哈哈平台需要特殊处理，这里先返回基础结构
        // 具体实现在适配器中
        return {
          oid: order.id,
          bid: order.bid,
          seat: order.lockseat?.split(" ") || []
        };
      },
      transferParams: (order, reason) => ({
        id: order.id,
        reasonId: 9,
        text: "其他-"
      }),
      // 与旧版 useHahaOffer 一致：接口字段为 id、price
      offerParams: ({ order, price }) => ({
        id: order.id,
        price
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "haha"
    })
  },

  // 芒果平台配置
  mangguo: {
    name: "mangguo",
    displayName: "芒果",
    features: {
      hasTransferFee: true,
      priceStep: 1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        order_id: order.id
      }),
      submitParams: (order, qrcode) => ({
        order_id: order.id,
        tickets: JSON.stringify([
          {
            num: order.lockseat?.split(" ").length || 1,
            old_imgs: "",
            old_text_ycode: qrcode.split("|")?.[1] || "",
            text_info: qrcode.split("|")[0]
          }
        ]),
        seats: JSON.stringify(order.lockseat?.split(" ") || [])
      }),
      transferParams: (order, reason) => ({
        order_id: order.id,
        remark: reason || "渠道无法出票"
      }),
      offerParams: ({ order, price }) => ({
        order_id: order.id,
        price: price * 100 // 芒果平台价格需要乘以100
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "mangguo"
    })
  },

  // 蚂蚁平台配置
  mayi: {
    name: "mayi",
    displayName: "蚂蚁",
    features: {
      hasTransferFee: true,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false,
      // 与旧版 useMayiOffer 一致：旧版注释掉了报价截止时间判断，不做「小于等于1秒则不处理」
      skipOfferEndTimeCheck: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        tradeno: order.id
      }),
      submitParams: (order, qrcode) => ({
        tradeno: order.order_number,
        ticketCode: JSON.stringify([
          {
            picUrl: "",
            ticketCode: qrcode
          }
        ])
      }),
      transferParams: (order, reason) => ({
        tradeno: order.id,
        picUrl: "",
        reason: "",
        type: "no_match_seat"
      }),
      // 与旧版 useMayiOffer 一致：接口字段为 tradeno(order.id)、price
      offerParams: ({ order, price }) => ({
        tradeno: order.id,
        price
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "mayi"
    })
  },

  // 洋葱平台配置
  yangcong: {
    name: "yangcong",
    displayName: "洋葱",
    features: {
      hasTransferFee: true,
      priceStep: 1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        tradeno: order.id
      }),
      submitParams: (order, qrcode) => ({
        tradeno: order.id,
        ticketCodeUrls: "",
        ticketCodes: qrcode
      }),
      transferParams: (order, reason) => ({
        tradeno: order.id
      }),
      // 与旧版 useYangcongOffer 一致：接口字段为 tradeno(order.order_number)、price
      offerParams: ({ order, price }) => ({
        tradeno: order.order_number,
        price
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "yangcong"
    })
  },

  // 影划算平台配置
  yinghuasuan: {
    name: "yinghuasuan",
    displayName: "影划算",
    features: {
      hasTransferFee: false,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_sn",
      // 与旧版 platManage.unlockSeat 一致：仅传 order_sn（旧版不向接口传 inx）
      unlockParams: order => ({
        order_sn: order.order_sn
      }),
      submitParams: (order, qrcode) => ({
        order_sn: order.order_sn,
        ticket_code: qrcode,
        ticket_image: " ",
        real_seat_no: order.lockseat?.split(" ").join(",") || "",
        entry_method: 0
      }),
      transferParams: (order, reason) => ({
        order_sn: order.order_sn,
        close_cause: reason || "座位被占",
        is_appeal: 2,
        extra_close_cause: "无最优座位"
      }),
      // 与旧版 useYinghuasuanOffer 一致：接口字段为 invitation_id(order.id)、quote_price
      offerParams: ({ order, price }) => ({
        invitation_id: String(order.id),
        quote_price: String(price)
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "yinghuasuan"
    })
  },

  // 守兔平台配置
  shoutu: {
    name: "shoutu",
    displayName: "守兔",
    features: {
      hasTransferFee: false,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        orderUUID: order.id
      }),
      submitParams: (order, qrcode) => ({
        json: JSON.stringify({
          orderUUID: order.id,
          orderTicketCodeList: [
            {
              code: qrcode,
              realSeat: order.lockseat
                ?.split(" ")
                .map(item => item + "(列)")
                .join(","),
              splitType: 0,
              realSeatIndexList: order.lockseat?.split(" ").map(item => ({
                column: item.split("排")[1].split("座")[0],
                row: item.split("排")[0]
              })),
              id: 0
            }
          ]
        })
      }),
      transferParams: (order, reason) => ({
        orderUUID: order.id,
        operatorId: window.localStorage.getItem("shoutuPlatUserUUID") || "",
        userUUID: window.localStorage.getItem("shoutuPlatUserUUID") || "",
        clientType: 2,
        reason: reason || ""
      }),
      // 与旧版 useShoutuOffer 一致：接口字段为 orderUUID(order.id)、userUUID、price
      offerParams: ({ order, price }) => ({
        orderUUID: order.id,
        userUUID: window.localStorage?.getItem("shoutuPlatUserUUID") || "",
        price
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "shoutu"
    })
  },

  // 票圣平台配置
  piaosheng: {
    name: "piaosheng",
    displayName: "票圣",
    features: {
      hasTransferFee: false,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: false, // 票圣不需要解锁
      needConfirmOrder: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        // 票圣平台特殊处理，不需要解锁
        getOrderId: order.id
      }),
      submitParams: (order, qrcode) => ({
        getOrderId: order.id,
        imgInfo: [
          {
            url: "",
            info: qrcode,
            code: qrcode.split("|")?.[1] || "",
            ticketPassword: "",
            getTicketType: 0,
            maySeats: order.lockseat?.split(" ").map(item => ({
              show: true,
              maySeats: item
            })),
            realmaySeats: order.lockseat?.split(" ").map(item => ({
              show: true,
              maySeats: item
            })),
            seats: order.lockseat?.split(" ") || [],
            entryType: 0
          }
        ]
      }),
      transferParams: (order, reason) => ({
        getOrderId: order.id,
        note: reason || "优惠库存不足",
        reason: ""
      }),
      offerParams: ({ order, price, ruleId, memberPrice, offerRule }) => ({
        order_id: order.id,
        price: String(price),
        offerRule,
        order
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "piaosheng"
    })
  },

  // 麻花平台配置
  mahua: {
    name: "mahua",
    displayName: "麻花",
    features: {
      hasTransferFee: false,
      priceStep: 0.1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: false, // 麻花不需要解锁
      needConfirmOrder: true,
      offerHandleTimeout: 120 * 1000 // 报价超时阈值（ms），麻花部分订单锁座候选多，需更长超时
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        // 麻花平台特殊处理，不需要解锁
        getOrderId: order.id
      }),
      submitParams: (order, qrcode) => ({
        getOrderId: order.id,
        imgInfo: [
          {
            url: "",
            info: qrcode,
            code: qrcode.split("|")?.[1] || "",
            ticketPassword: "",
            getTicketType: 0,
            maySeats: order.lockseat?.split(" ").map(item => ({
              show: true,
              maySeats: item
            })),
            realmaySeats: order.lockseat?.split(" ").map(item => ({
              show: true,
              maySeats: item
            })),
            seats: order.lockseat?.split(" ") || [],
            entryType: 0
          }
        ]
      }),
      transferParams: (order, reason) => ({
        getOrderId: order.id,
        note: reason || "优惠库存不足",
        reason: ""
      }),
      // 与旧版 useMahuaOffer 一致：接口需要 putOrderId、biddingPrice、isDirectGetOrder（由适配器根据 offerRule 计算）
      offerParams: ({ order, price, ruleId, memberPrice, offerRule }) => ({
        order_id: order.id,
        price: String(price),
        offerRule,
        order
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "mahua"
    })
  },

  // 省APP平台配置
  sheng: {
    name: "sheng",
    displayName: "省APP",
    features: {
      hasTransferFee: true,
      priceStep: 1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: true
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        orderCode: order.order_number,
        supplierCode: order.supplierCode
      }),
      submitParams: (order, qrcode) => ({
        orderCode: order.order_number,
        supplierCode: order.supplierCode,
        deliverInfos: JSON.stringify([{ code: qrcode }]),
        success: true
      }),
      transferParams: (order, reason) => ({
        orderCode: order.order_number,
        supplierCode: order.supplierCode,
        reason: reason || "价格过低无法出票"
      }),
      // 与旧版 useShengOffer 一致：接口 /supplier/setGrabPrice 需要 supplierCode、orderCode、seatInfo
      offerParams: ({ order, price }) => ({
        supplierCode: window.localStorage.getItem("shengPlatToken") || "",
        orderCode: order.order_number,
        seatInfo: JSON.stringify(
          (order.seats || []).map(seat => ({
            seatId: seat.seatId,
            supplierPrice: price
          }))
        )
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "sheng"
    })
  },

  // 商展平台配置
  shangzhan: {
    name: "shangzhan",
    displayName: "商展",
    features: {
      hasTransferFee: true,
      priceStep: 1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        order_id: order.id
      }),
      submitParams: (order, qrcode) => ({
        order_sn: order.order_number,
        order_status: "9",
        ticket_list: [
          {
            ticket_code: qrcode.split("|")[0],
            ticket_msg_code: qrcode.split("|")?.[1] || ""
          }
        ]
      }),
      transferParams: (order, reason) => ({
        order_sn: order.order_number,
        order_status: "3",
        cancel_reason: reason || "价格过低无法出票"
      }),
      // 与旧版 useShangzhanOffer 一致：接口需要 order_sn、seat_data(area_id, quoted)、bidd_notify
      offerParams: ({ order, price }) => ({
        order_sn: order.order_number,
        seat_data: {
          area_id: order.order_detail?.[0]?.area_id,
          quoted: Number(price).toFixed()
        },
        bidd_notify: ""
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "shangzhan"
    })
  }
};

/**
 * 获取平台配置
 * @param {string} platName - 平台名称
 * @returns {PlatformConfig|null} 平台配置对象
 */
export function getPlatformConfig(platName) {
  return PLATFORM_CONFIGS[platName] || null;
}

/**
 * 获取所有平台名称列表
 * @returns {string[]} 平台名称数组
 */
export function getAllPlatformNames() {
  return Object.keys(PLATFORM_CONFIGS);
}

/**
 * 验证平台配置完整性
 * @param {PlatformConfig} config - 平台配置
 * @returns {boolean} 配置是否完整
 */
export function validatePlatformConfig(config) {
  if (!config) return false;

  const requiredFields = ["name", "displayName", "features", "api", "params"];

  for (const field of requiredFields) {
    if (!config[field]) {
      console.error(`平台配置缺少必需字段: ${field}`);
      return false;
    }
  }

  // 验证features
  const requiredFeatures = [
    "hasTransferFee",
    "priceStep",
    "unlockBeforeTicket",
    "needConfirmOrder"
  ];

  for (const feature of requiredFeatures) {
    if (config.features[feature] === undefined) {
      console.error(`平台配置features缺少必需字段: ${feature}`);
      return false;
    }
  }

  // 验证api
  const requiredApis = [
    "getOrderList",
    "submitOffer",
    "unlockSeat",
    "submitTicket",
    "transferOrder"
  ];

  for (const api of requiredApis) {
    if (!config.api[api]) {
      console.error(`平台配置api缺少必需字段: ${api}`);
      return false;
    }
  }

  return true;
}

// 导出默认配置
export default PLATFORM_CONFIGS;
