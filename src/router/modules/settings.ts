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
    {
      path: "/set/appLogin",
      name: "appLogin",
      component: () => import("@/views/appLogin/index.vue"),
      meta: {
        title: "影院登录"
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
      component: () => import("@/views/offerTicket/index.vue"),
      meta: {
        title: "影院自动出票"
      }
    },
  ]
} satisfies RouteConfigsTable;
