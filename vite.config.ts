import { rmSync } from "node:fs";
import { getPluginsList } from "./build/plugins";
import { include, exclude } from "./build/optimize";
import { type UserConfigExport, type ConfigEnv, loadEnv } from "vite";
import {
  root,
  alias,
  wrapperEnv,
  pathResolve,
  __APP_INFO__
} from "./build/utils";

export default ({ command, mode }: ConfigEnv): UserConfigExport => {
  const lifecycle = process.env.npm_lifecycle_event;
  if (!lifecycle.includes("browser")) {
    rmSync("dist-electron", { recursive: true, force: true });
  }
  const { VITE_CDN, VITE_PORT, VITE_COMPRESSION, VITE_PUBLIC_PATH } =
    wrapperEnv(loadEnv(mode, root));
  return {
    base: VITE_PUBLIC_PATH,
    root,
    resolve: {
      alias
    },
    // 服务端渲染
    server: {
      // 端口号
      port: VITE_PORT,
      // 只绑定回环地址：0.0.0.0 会同时监听局域网 IP，dev 服务可被同网段扫描访问
      host: "127.0.0.1",
      // 本地跨域代理 https://cn.vitejs.dev/config/server-options.html#server-proxy
      proxy: {
        // 机器（通用后端代理）
        "/svpi": {
          target: "http://47.113.191.173:3000", // 后端API的真实地址
          // target: "http://localhost:3000", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/svpi/, "") // 重写路径，去除/api前缀
        },
        // 金逸
        "/ticket/": {
          target: "https://ct.womovie.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/ticket/, "/ticket/") // 重写路径，去除/api前缀
        },
        // 猎人
        "/sp": {
          target: "https://api.s.zjlrmovie.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/sp/, "/sp") // 重写路径，去除/api前缀
        },
        // 守兔
        "/seller-api": {
          target: "http://moviepc.taototo.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/seller-api/, "/seller-api") // 重写路径，去除/api前缀
        },
        "/yp-api": {
          target: "https://seller.taototo.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/yp-api/, "/yp-api") // 重写路径，去除/api前缀
        },
        // 省
        "/supplier": {
          target: "https://api.shenga.co", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/supplier/, "/supplier") // 重写路径，去除/api前缀
        },
        // 芒果
        "/v2": {
          target: "https://supplier.mgmovie.net", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/v2/, "/v2") // 重写路径，去除/api前缀
        },
        // 麻花
        "/mhapi": {
          target: "https://mhdyp.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/mhapi/, "/api") // 重写路径，去除/api前缀
        },
        // 麻花新版 Open API（测试环境）
        "/nmhapi": {
          target: "https://openapi.quanma51.com",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/nmhapi/, "")
        },
        // 票圣 Open API
        "/psapi": {
          target: "https://openapi.piaosheng.top",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/psapi/, "")
        },
       "/newwww": {
          target: "https://piao.mayiufu.com",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/newwww/, "") // 关键修改：移除前缀
        },
        // 影划算新
        "/open": {
          target: "https://merchant-api.yinghuasuan.com",
          changeOrigin: true,
          rewrite: path => path.replace(/^\/open/, "open")
        },
        // 洋葱
        "/prod-api": {
          target: "https://ticket.secretonion.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/prod-api/, "/prod-api") // 重写路径，去除/api前缀
        },
        // 影划算旧
        "/broker": {
          target: "https://merchant-api.yinghuasuan.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/broker/, "broker") // 重写路径，去除/api前缀
        },
        // 商展
        "/openapi": {
          target: "https://www.huobanos.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/openapi/, "openapi") // 重写路径，去除/api前缀
        },
        // 哈哈
        "/api": {
          target: "https://hahapiao.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/api/, "api") // 重写路径，去除/api前缀
        },

        // 辰星3.0C
        "/selfSupport": {
          target: "https://capi.oristarcloud.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/selfSupport/, "selfSupport") // 重写路径，去除/api前缀
        },
        // sfc乐影
        "/sfc": {
          target: "https://group.leying.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/sfc/, "") // 重写路径，去除/api前缀
        },
        // ume
        "/ume/": {
          target: "https://oc.yuekeyun.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/ume/, "") // 重写路径，去除/api前缀
        },
        // 耀莱
        "/yaolai": {
          target: "https://jccinema.yuekeyun.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/yaolai/, "") // 重写路径，去除/api前缀
        }
        // 卢米埃
        // "/lma": {
        //   target: "https://app.lumiai.com", // 后端API的真实地址
        //   changeOrigin: true, // 是否允许跨域
        //   rewrite: path => path.replace(/^\/lma/, "") // 重写路径，去除/api前缀
        // }
      },
      // 预热文件以提前转换和缓存结果，降低启动期间的初始页面加载时长并防止转换瀑布
      warmup: {
        clientFiles: ["./index.html", "./src/{views,components}/*"]
      },
      // 文件监听忽略（EBUSY 崩溃根治）：vite 默认监听根目录下全部文件（仅排除 node_modules/.git），
      // electron-builder 并发写 release/*/win-unpacked/*.tmp 时 Windows 文件锁会击穿 watcher
      // （Error: EBUSY ... watch ... .tmp → 未捕获 error 事件 → dev 进程崩溃）。
      // 以下均为构建产物或非前端源码目录，与 HMR 无关，忽略后同时大幅降低 watcher 负载：
      //   release=electron-builder 输出 | dist/dist-electron=构建产物 |
      //   auto-ticket-service=后端服务（独立进程）| applet-source-code=小程序源码 | test-6slot=测试产物
      // ⚠️ 追加（2026-08-20）：编辑器/工具原子写入 src 下的临时目录
      //   （.HistoryOfferRecord.vue.XXXX.tmpdir/HistoryOfferRecord.vue.tmp）会被 vite 递归扫到并开始
      //   watch，随即被 rename/删除 → Node fs.watch 抛 EBUSY（node:internal/fs/watchers）→ 未捕获崩溃。
      //   忽略 *.tmpdir 目录与 *.tmp 文件从源头规避（HMR 只关心真实源码文件）。
      // ⚠️ 根治（2026-08-20）：EBUSY 是 fs.watch 同步 throw（chokidar 不认 EBUSY 直接 rethrow），
      //   vite 的 on('error') 接不到，任何"容错监听"配置都拦不住 → 改为 usePolling 轮询检测
      //   （vite 官方对 Windows watcher 异常的建议方案）：不再使用 OS 文件事件，EBUSY 从机制上消失，
      //   监听能力完整保留（interval=300ms 检测延迟对 HMR 无感；配合上方 ignored 减负，CPU 开销可控）。
      watch: {
        ignored: [
          "**/release/**",
          "**/dist/**",
          "**/dist-electron/**",
          "**/auto-ticket-service/**",
          "**/applet-source-code/**",
          "**/test-6slot/**",
          "**/.workbuddy/**",
          "**/doc/**",
          "**/*.tmpdir/**",
          "**/*.tmp"
        ],
        usePolling: true,
        interval: 300
      }
    },
    plugins: getPluginsList(command, VITE_CDN, VITE_COMPRESSION),
    // https://cn.vitejs.dev/config/dep-optimization-options.html#dep-optimization-options
    optimizeDeps: {
      include,
      exclude
    },
    build: {
      // https://cn.vitejs.dev/guide/build.html#browser-compatibility
      target: "es2015",
      sourcemap: false,
      // 消除打包大小超过500kb警告
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        input: {
          index: pathResolve("./index.html", import.meta.url)
        },
        // 静态资源分类打包
        output: {
          chunkFileNames: "static/js/[name]-[hash].js",
          entryFileNames: "static/js/[name]-[hash].js",
          assetFileNames: "static/[ext]/[name]-[hash].[ext]"
        }
      }
    },
    define: {
      __INTLIFY_PROD_DEVTOOLS__: false,
      __APP_INFO__: JSON.stringify(__APP_INFO__)
    }
  };
};
