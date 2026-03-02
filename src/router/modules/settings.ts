export default {
  path: "/set",
  redirect: "/set/test",
  meta: {
    icon: "ri:information-line",
    // showLink: false,
    title: "设置",
    rank: 9
  },
  children: [
    {
      path: "/set/todayStatistics",
      name: "todayStatistics",
      component: () => import("@/views/todayStatistics/index.vue"),
      meta: {
        title: "统计分析",
        keepAlive: true
      }
    },
    {
      path: "/set/loginList",
      name: "loginList",
      component: () => import("@/views/appLogin/appLoginSet.vue"),
      meta: {
        title: "影院登录",
        keepAlive: true
      }
    },
    {
      path: "/set/cardList",
      name: "cardList",
      component: () => import("@/views/appBalanceQuery/cardList.vue"),
      meta: {
        title: "会员卡列表",
        keepAlive: true
      }
    },
    {
      path: "/permission/quanTypeManage/index",
      name: "QuanTypeManage",
      component: () => import("@/views/permission/quanTypeManage/index.vue"),
      meta: {
        title: "券类型列表",
        keepAlive: true
      }
    },
    {
      path: "/set/offerRule",
      name: "offerRule",
      component: () => import("@/views/offerRule/index.vue"),
      meta: {
        title: "报价规则",
        keepAlive: true
      }
    },
    {
      path: "/set/queueManage",
      name: "queueManage",
      component: () => import("@/views/queueManage/index.vue"),
      meta: {
        title: "队列管理",
        fixedTag: true,
        keepAlive: true
      }
    },
    {
      path: "/permission/cinemaCodeMatch/index",
      name: "CinemaCodeMatch",
      component: () => import("@/views/permission/cinemaCodeMatch/index.vue"),
      meta: {
        title: "影院映射",
        keepAlive: true
      }
    },
    {
      path: "/set/ruleConfig",
      name: "ruleConfig",
      component: () => import("@/views/ruleConfig/index.vue"),
      meta: {
        title: "规则设置",
        fixedTag: true,
        keepAlive: true
      }
    },

    {
      path: "/set/offerRecord",
      name: "offerRecord",
      component: () => import("@/views/offerRecord/index.vue"),
      meta: {
        title: "报价记录",
        keepAlive: true
      }
    },
    {
      path: "/set/ticketRecord",
      name: "ticketRecord",
      component: () => import("@/views/ticketRecord/index.vue"),
      meta: {
        title: "出票记录",
        keepAlive: true
      }
    },
    {
      path: "/set/offerFailRecord",
      name: "offerFailRecord",
      component: () => import("@/views/offerFailRecord/index.vue"),
      meta: {
        title: "未报价记录",
        keepAlive: true
      }
    }
  ]
} satisfies RouteConfigsTable;
