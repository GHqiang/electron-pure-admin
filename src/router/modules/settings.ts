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
      path: "/set/offerRule",
      name: "offerRule",
      component: () => import("@/views/offerRule/index.vue"),
      meta: {
        title: "报价规则"
      }
    },
    {
      path: "/set/appLogin",
      name: "appLogin",
      component: () => import("@/views/appLogin/index.vue"),
      meta: {
        title: "影院登录"
      }
    },
    {
      path: "/set/loginList",
      name: "loginList",
      component: () => import("@/views/appLogin/appLoginSet.vue"),
      meta: {
        title: "影院登录列表"
      }
    },
    {
      path: "/set/offerRecord",
      name: "offerRecord",
      component: () => import("@/views/offerRecord/index.vue"),
      meta: {
        title: "报价记录"
      }
    },
    {
      path: "/set/ticketRecord",
      name: "ticketRecord",
      component: () => import("@/views/ticketRecord/index.vue"),
      meta: {
        title: "出票记录"
      }
    },
    {
      path: "/set/queueManage",
      name: "queueManage",
      component: () => import("@/views/queueManage/index.vue"),
      meta: {
        title: "队列管理"
      }
    },
    {
      path: "/set/balanceQuery",
      name: "balanceQuery",
      component: () => import("@/views/appBalanceQuery/index.vue"),
      meta: {
        title: "影院券查询"
      }
    },
    {
      path: "/set/cardList",
      name: "cardList",
      component: () => import("@/views/appBalanceQuery/cardList.vue"),
      meta: {
        title: "会员卡列表"
      }
    },
    // {
    //   path: "/set/memberPwdSet",
    //   name: "memberPwdSet",
    //   component: () => import("@/views/memberPwdSet/index.vue"),
    //   meta: {
    //     title: "会员卡密码设置"
    //   }
    // },
    {
      path: "/set/test",
      name: "test",
      component: () => import("@/views/testFlow/index.vue"),
      meta: {
        title: "测试流程"
      }
    }
  ]
} satisfies RouteConfigsTable;
