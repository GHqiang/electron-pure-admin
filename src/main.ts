// 为 window 对象添加类型声明
declare global {
  interface Window {
    setupExpireCouponNotification?: () => void;
  }
}

import App from "./App.vue";
import router from "./router";
import { setupStore } from "@/store";
import { getPlatformConfig } from "./config";
import { MotionPlugin } from "@vueuse/motion";
// import { useEcharts } from "@/plugins/echarts";
import { createApp, type Directive } from "vue";
import { useElementPlus } from "@/plugins/elementPlus";
import { injectResponsiveStorage } from "@/utils/responsive";

import Table from "@pureadmin/table";
// import PureDescriptions from "@pureadmin/descriptions";

// 引入重置样式
import "./style/reset.scss";
// 导入公共样式
import "./style/index.scss";
// 一定要在main.ts中导入tailwind.css，防止vite每次hmr都会请求src/style/index.scss整体css文件导致热更新慢的问题
import "./style/tailwind.css";
import "element-plus/dist/index.css";
// 导入字体图标
import "./assets/iconfont/iconfont.js";
import "./assets/iconfont/iconfont.css";

const app = createApp(App);
if (process.env.NODE_ENV !== "development") {
  const methods = ["log", "info", "warn", "error"];
  methods.forEach(method => {
    const originalMethod = console[method];
    window.console[method] = function (...params) {
      // 使用function关键字以正确捕获arguments
      if (window.isNeedLog) {
        originalMethod.apply(console, params); // 使用apply来传递参数并保持正确的上下文
      }
    };
  });
}
// 自定义指令
import throttleDirective from "@/directives/throttle.js"; // 导入自定义指令
app.directive("throttle", throttleDirective);
import * as directives from "@/directives";
Object.keys(directives).forEach(key => {
  app.directive(key, (directives as { [key: string]: Directive })[key]);
});

// 全局注册@iconify/vue图标库
import {
  IconifyIconOffline,
  IconifyIconOnline,
  FontIcon
} from "./components/ReIcon";
app.component("IconifyIconOffline", IconifyIconOffline);
app.component("IconifyIconOnline", IconifyIconOnline);
app.component("FontIcon", FontIcon);

// 全局注册按钮级别权限组件
import { Auth } from "@/components/ReAuth";
app.component("Auth", Auth);

// 全局注册vue-tippy
import "tippy.js/dist/tippy.css";
import "tippy.js/themes/light.css";
import VueTippy from "vue-tippy";
app.use(VueTippy);

getPlatformConfig(app).then(async config => {
  setupStore(app);
  app.use(router);
  await router.isReady();
  injectResponsiveStorage(app, config);
  app.use(MotionPlugin).use(useElementPlus).use(Table);
  // .use(PureDescriptions)
  // .use(useEcharts);
  app.mount("#app").$nextTick(() => {
    postMessage({ payload: "removeLoading" }, "*");
  });

  // 崩溃自愈：主进程 reload 后带 crashRecovery 标记，自动恢复崩溃前运行的队列并上报取证日志
  try {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("crashRecovery") === "1") {
      const crashReason = searchParams.get("crashReason") || "";
      console.warn("[崩溃自愈] 检测到崩溃恢复标记，开始自动恢复队列", {
        crashReason
      });
      const { autoRestoreQueues } = await import("@/common/queueRestore");
      // 延迟执行：等待登录信息、字典等初始化完成后再拉起队列
      setTimeout(async () => {
        console.warn("[崩溃自愈] 3 秒延迟结束，开始执行队列自动恢复", {
          crashReason
        });
        const result = await autoRestoreQueues(crashReason).catch(error => {
          console.error("[崩溃自愈] 队列自动恢复失败", error);
          return { restored: false };
        });
        // 恢复成功后跳转队列管理页，便于用户直观确认队列运行状态
        // （hash 路由 reload 后 hash 丢失回到首页，需主动跳回）
        if (result?.restored) {
          console.warn(
            "[崩溃自愈] 队列已自动恢复，跳转队列管理页确认状态",
            result
          );
          router.push("/set/queueManage").catch(() => {});
        } else {
          console.warn(
            "[崩溃自愈] 无队列快照（崩溃前未一键启动），跳过队列恢复",
            result
          );
        }
        // 恢复逻辑执行完毕，清除 URL 上的恢复标记，避免用户后续手动刷新重复触发恢复
        try {
          history.replaceState(null, "", location.pathname);
        } catch {}
      }, 3000);
    }
  } catch (error) {
    console.error("[崩溃自愈] 消费恢复标记异常", error);
  }
});
