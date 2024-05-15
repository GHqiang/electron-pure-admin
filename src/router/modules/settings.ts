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
      path: "/set/test",
      name: "test",
      component: () => import("@/views/testFlow/index.vue"),
      meta: {
        title: "测试流程"
      }
    },
    {
      path: "/set/offerRule",
      name: "offerRule",
      component: () => import("@/views/offerRule/index.vue"),
      meta: {
        title: "报价规则"
      }
    },
    // {
    //   path: "/set/platToken",
    //   name: "platToken",
    //   component: () => import("@/views/platToken/index.vue"),
    //   meta: {
    //     title: "平台token"
    //   }
    // },
    {
      path: "/set/cinemaToken",
      name: "cinemaToken",
      component: () => import("@/views/cinemaToken/index.vue"),
      meta: {
        title: "影院token"
      }
    },
    {
      path: "/set/offerRecord",
      name: "offerRecord",
      component: () => import("@/views/offerRecord/index.vue"),
      meta: {
        title: "平台自动报价"
      }
    },
    {
      path: "/set/ticketRecord",
      name: "ticketRecord",
      component: () => import("@/views/offerRule/index.vue"),
      meta: {
        title: "平台自动出票"
      }
    },
    {
      path: "/set/offerTicket",
      name: "offerTicket",
      component: () => import("@/views/offerTicket/index.vue"),
      meta: {
        title: "出票设置"
      }
    },
  ]
} satisfies RouteConfigsTable;
