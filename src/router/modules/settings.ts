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
      component: () => import("@/views/error/404.vue"),
      meta: {
        title: "报价规则"
      }
    },
  ]
} satisfies RouteConfigsTable;
