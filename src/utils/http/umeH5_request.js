// 初始化全局的 fetch 相关对象
import "./mock_fetch.js";

// 设置常量对象a和i
// a-原模块：9d8X
let a = {
  APP: {
    domain: {
      "30.102.208.109": "http://h5lark-be.taobao.net/",
      "h5.waptest.taobao.com": "http://h5lark-be.taobao.net/",
      "h5.m.taobao.com": "https://h5lark-be.yuekeyun.com/"
    }[window.location.hostname],
    static: "https://cdn.yuekeyun.com"
  },
  DEV: {
    domain:
      {
        "h5lark-dev.alibaba.com": "http://h5lark-be.taobao.net/",
        "h5lark-test.alibaba.com": "http://h5lark-be.taobao.net/",
        "h5lark-pre.alibaba.com": "https://h5lark-be-pre.yuekeyun.com/",
        "h5lark-prod.alibaba.com": "https://h5lark-be.yuekeyun.com/",
        "h5lark.yuekeyun.com": "https://h5lark-be.yuekeyun.com/",
        "h5lark.taobao.net": "http://h5lark-be.taobao.net/",
        "0.0.0.0": "/",
        "127.0.0.1": "/",
        "h5lark-pre.yuekeyun.com": "https://h5lark-be-pre.yuekeyun.com/"
      }[window.location.hostname] || "http://h5lark-be.taobao.net/",
    static: "https://cdn.yuekeyun.com"
  },
  TEST: {
    domain:
      {
        "127.0.0.1": "http://h5lark-be.taobao.net/",
        "h5lark2.taobao.net": "http://h5lark-be.taobao.net/",
        "h5lark.taobao.net": "http://h5lark-be.taobao.net/",
        "h5lark-link.taobao.net": "http://h5lark-be.taobao.net/",
        "h5lark-daily2.yuekeyun.cn": "http://h5lark-be.taobao.net/",
        "h5lark-app.taobao.net": "http://h5lark-be.taobao.net/",
        "h5lark-pre.yuekeyun.com": "https://h5lark-be-pre.yuekeyun.com/",
        "h5lark.yuekeyun.com": "https://h5lark-be.yuekeyun.com/"
      }[window.location.hostname] || "http://h5lark-be.taobao.net/",
    static: "https://cdn.yuekeyun.com"
  },
  PROD: {
    domain: {
      "h5lark-pre.yuekeyun.com": "https://h5lark-be-pre.yuekeyun.com/",
      "h5lark-pre2.yuekeyun.com": "https://h5lark-be-pre.yuekeyun.com/",
      "h5lark-app-pre.yuekeyun.com": "https://h5lark-be-pre.yuekeyun.com/",
      "h5lark.yuekeyun.com": "https://h5lark-be.yuekeyun.com/",
      "h5lark-link.yuekeyun.com": "https://h5lark-be.yuekeyun.com/",
      "h5lark-app.yuekeyun.com": "https://h5lark-be.yuekeyun.com/"
    }[window.location.host],
    static: "https://cdn.yuekeyun.com"
  }
}.PROD;
a = {
  domain: a.domain || "https://h5lark-be.yuekeyun.com/",
  static: a.static,
  v: "1.0",
  appVersion: "H5_5.0",
  empty: {
    filmPoster: a.static + "/common/static/img/h5lark/missPoster2.png",
    posPoster: a.static + "/common/static/img/h5lark/missPos2.png",
    bannerPoster: a.static + "/common/static/img/h5lark/missBanner2.png",
    userLogo: a.static + "/common/static/img/h5lark/userLogo.png",
    cinemaLogo: a.static + "/common/static/img/h5lark/cinemaLogo2.png"
  },
  cardType: {
    V: "储值卡",
    A: "权益卡",
    G: "礼品卡",
    T: "次数卡",
    P: "点数卡"
  },
  vocationOjb: {
    STUDENT: "学生",
    CONSTRUCTION: "建筑",
    MEDICINE: "医药",
    CHEMICAL: "化工",
    FINANCIAL: "金融",
    MACHINE: "机械",
    CLOTHING: "服装",
    EDUCATION: "教育",
    ELECTRON: "电子",
    MEDIA: "传媒",
    FOODSERVICE: "餐饮",
    TRANSPORT: "运输",
    IT: "IT",
    TELECOM: "通信",
    POWER: "电力",
    TOURING: "旅游",
    OTHER: "其他"
  },
  lifeStateOjb: {
    SINGLE: "单身",
    INLOVE: "恋爱中",
    MARRIED: "已婚",
    PARENTHOOD: "为人父母"
  },
  genderOjb: {
    0: "男",
    1: "女"
  },
  cardRequireObj: {
    MOBILE: "mobile",
    USERNAME: "realName",
    CERTIFICATE: "idCardNo",
    BIRTHDAY: "birthday"
  },
  orderStatusText: {
    PAY_WAIT: "待支付",
    PAY_ING: "付款中",
    PAY_SUCCESS: "支付成功",
    PAY_REFUNDING: "退款中",
    PAY_REFUND_FAIL: "退款失败",
    PAY_REFUND_SUCCESS: "已退款",
    PAY_REFUNDING_PARTLY: "部分退款中",
    PAY_REFUND_FAIL_PARTLY: "部分退款失败",
    PAY_REFUND_SUCCESS_PARTLY: "部分退款成功",
    TICKET_WAIT: "出票中",
    TICKET_SUCCESS: "已出票",
    TICKET_FAIL: "出票失败",
    TICKET_HAS_PICKUP: "已取票",
    TICKET_REFUNDING: "退票中",
    TICKET_REFUND_SUCCESS: "退票成功",
    TICKET_REFUND_FAIL: "退票失败",
    GOODS_WAIT: "待取货",
    GOODS_SUCCESS: "待取货",
    GOODS_FAIL: "出货失败",
    GOODS_HAS_PICKUP: "已完成",
    GOODS_REFUNDING: "退款中",
    GOODS_REFUND_SUCCESS: "退款成功",
    GOODS_REFUND_FAIL: "退款失败",
    CREATE_CARD_WAIT: "购卡中",
    CREATE_CARD_SUCCESS: "购卡成功",
    CREATE_CARD_FAIL: "购卡失败"
  },
  payMethod: {
    ALIPAY: "支付宝",
    UNIONPAY: "银联支付",
    WEIXIN: "微支付",
    CARD: "会员卡支付"
  },
  IMG: {
    alipayRedirect: {
      one: a.static + "/common/static/img/h5lark/alipayRedirect01.png",
      two: a.static + "/common/static/img/h5lark/alipayRedirect02.png"
    },
    empty1: a.static + "/common/static/img/h5ecticket/empty_1.png",
    empty2: a.static + "/common/static/img/h5ecticket/empty_2.png",
    empty3: a.static + "/common/static/img/h5ecticket/empty_3.png",
    empty4: a.static + "/common/static/img/h5ecticket/empty_4.png",
    emptyOrders:
      a.static + "/common/static/img/h5ecticket/empty_personal_orders.png",
    emptyComment:
      a.static + "/common/static/img/h5ecticket/empty_personal_comment.png",
    emptyFind:
      a.static + "/common/static/img/h5ecticket/empty_personal_find.png",
    emptyGift:
      a.static + "/common/static/img/h5ecticket/empty_personal_gift.png",
    emptyGift2:
      a.static + "/common/static/img/h5ecticket/empty_personal_gift2.png",
    emptyVipcard:
      a.static + "/common/static/img/h5ecticket/empty_personal_vipcard.png",
    emptySale:
      a.static + "/common/static/img/h5ecticket/empty_personal_sale.png",
    empty404: a.static + "/common/static/img/h5ecticket/empty_presonal_404.png",
    myRadius: a.static + "/common/static/img/h5lark/myRadius.png",
    noRights: a.static + "/common/static/img/h5lark/level/norights.png"
  }
};
// i-原模块：Bv8U
let i = {
  base: {
    wapid: "",
    setting: "",
    location: {
      id: "",
      name: ""
    },
    cinema: {
      id: "",
      linkid: "",
      name: "",
      shortName: "",
      address: "",
      permission: ""
    },
    user: {
      sid: "",
      tid: "",
      account: ""
    },
    phone: "",
    template: {
      buyTicketSuccess: "yKDCVyyKyQnh3vEoZnGRwoYvaH6stYpqBY4wMNHhGQg"
    }
  },
  session: {
    map: {
      city: "",
      change: !0
    },
    film: {
      id: "",
      name: "",
      filmLang: "",
      filmVersion: ""
    },
    picture: {
      title: "",
      picList: [],
      showIndex: 0
    },
    schedule: {
      scheduleId: "",
      scheduleKey: "",
      hallId: "",
      hallName: "",
      dateText: "",
      showTime: "",
      startTime: "",
      endTime: ""
    },
    shop: {
      goods: {},
      cards: {}
    },
    pos: {
      goodsParamsJson: [],
      packageGoodsInfo: !1,
      standardPrice: 0,
      totalNumber: 0,
      totalPrice: 0
    },
    order: {
      id: "",
      type: "",
      orderStatus: "",
      cinemaAddress: "",
      cinemaLinkId: 0,
      cinemaPhoneNumber: "",
      cinemaName: "",
      ticketInfo: {
        ticketList: [
          {
            serviceFee: 0,
            ticketPrice: 0,
            columnId: 0,
            printFlag: "",
            sectionCode: 0,
            rowId: 0,
            sectionName: "",
            ticketNo: 0,
            ticketStatus: "",
            seatCode: "",
            ticketFee: 0
          }
        ],
        orderId: "",
        orderStatus: "",
        showDate: 0,
        filmCd: 0,
        duration: 0,
        hallCode: 0,
        confirmationId: 0,
        filmLanguage: "",
        scheduleId: 0,
        filmVersion: "",
        channelCode: "",
        ticketCount: 0,
        ticketPrice: 0,
        createDateTime: 0,
        paymentList: [
          {
            paymentMethodCode: "",
            genericMethodName: "",
            resultCode: "",
            genericPayType: "",
            sort: 0,
            resultMsg: "",
            payAmount: 0,
            payStatusEnum: "",
            success: !0,
            returnUrl: "",
            payCode: "",
            key: ""
          }
        ],
        filmUniqueId: 0,
        lockOrderId: 0,
        filmName: "",
        hallName: "",
        seatNames: ""
      },
      notice: "",
      channelCode: "",
      servicePhone: "",
      mobile: 0,
      paymentList: [
        {
          paymentMethodCode: "",
          genericMethodName: "",
          resultCode: "",
          genericPayType: "",
          sort: 0,
          resultMsg: "",
          payAmount: 0,
          payStatusEnum: "",
          success: !0,
          returnUrl: "",
          payCode: "",
          key: ""
        }
      ],
      originAmount: 0,
      totalAmount: 0,
      createTime: 0,
      cinemaLogo: "",
      refundFlag: ""
    },
    captche: {
      quickLogin: !1,
      register: !1,
      reset: !1,
      unbind: !1,
      resetCardPwd: !1,
      setCardPwd: !1
    },
    seat: {
      seatIds: "",
      seatIdList: [],
      seatNameList: [],
      lockOrderId: "",
      expireIn: 0,
      sectionIndex: 0,
      scheduleId: ""
    },
    card: {
      privileges: [],
      cards: []
    },
    getPayInfo: {},
    payInfo: {
      privilegeIndex: 0,
      toolIndex: "",
      tool: "",
      toolType: "",
      privilege: "",
      totalPrice: 0,
      cost: 0,
      totalTicketServiceFee: 0,
      originalTicketTotalPrice: 0,
      originalGoodsTotalPrice: 0,
      originalTotalPrice: 0,
      selectedCoupons: [],
      couponsDiscount: 0,
      privilegeDiscount: 0,
      originalPricePrivilegeIndex: 0
    },
    openid: "",
    authOpenid: "",
    templateId: null,
    stamp: null,
    store: {
      myPoint: 0,
      goods: {
        id: "",
        name: ""
      },
      order: {
        orderId: "",
        orderType: "",
        orderStatus: "",
        merchandiseName: "",
        consumePoint: ""
      }
    },
    supportCinemas: [],
    channelSetting: null,
    riskParams: {
      csessionid: "",
      sig: "",
      nc_token: "",
      nc_scene: ""
    },
    riskControlSwitch: !0,
    newAddCoupon: {
      couponCode: "",
      comeFrom: ""
    },
    activity: {
      activityViewCode: "",
      activityViewType: "",
      activityViewName: "",
      finalTitleImgUrl: "",
      finalBgImgUrl: ""
    },
    nowLevel: {
      levelId: 0,
      levelCode: "",
      levelName: "",
      growthDisplayName: ""
    },
    loginReturnUrl: "",
    systemRouter: {
      his: "",
      now: ""
    },
    referee: {
      empCode: "",
      leaseCode: ""
    }
  }
};

let getData = (e, t, n) => {
  t.channelCode = i.base.wapid;
  t.larkSid = i.base.user.sid ? i.base.user.sid : "";
  t.version = "H5";
  t.appVersion = a.appVersion;

  const o = {
    api: e,
    data: JSON.stringify(t),
    v: a.v,
    appVersion: a.appVersion,
    wapid: i.base.wapid,
    lang: "zh_CN",
    appFrom: "lark",
    timestamp: new Date().getTime(),
    sid: i.base.user.sid ? i.base.user.sid : ""
  };

  const s = {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST",
    mode: "cors",
    cache: "default",
    credentials: "include",
    body: JSON.stringify(o)
  };

  fetch("https://mocks.alibaba-inc.com/mock/h5lark/" + e, s)
    .then(function () {
      let e =
        arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
      return e.json && e.json();
    })
    .then(function () {
      let e =
        arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
      n(e);
    });
};

export default getData;
