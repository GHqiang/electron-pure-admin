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
      host: "0.0.0.0",
      // 本地跨域代理 https://cn.vitejs.dev/config/server-options.html#server-proxy
      proxy: {
        // sfc乐影
        "/api": {
          target: "https://group.leying.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/api/, "") // 重写路径，去除/api前缀
        },
        // 猎人
        "/sp": {
          target: "https://api.s.zjlrmovie.cn", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/sp/, "/sp") // 重写路径，去除/api前缀
        },
        // 机器
        "/svpi": {
          target: "http://47.113.191.173:3000", // 后端API的真实地址
          // target: "http://localhost:3000", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/svpi/, "") // 重写路径，去除/api前缀
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
        // 蚂蚁
        "/newwww": {
          target: "https://piao.mayiufu.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/newwww/, "/newwww") // 重写路径，去除/api前缀
        },
        // 洋葱
        "/prod-api": {
          target: "https://ticket.secretonion.com", // 后端API的真实地址
          changeOrigin: true, // 是否允许跨域
          rewrite: path => path.replace(/^\/prod-api/, "/prod-api") // 重写路径，去除/api前缀
        }
      },
      // 预热文件以提前转换和缓存结果，降低启动期间的初始页面加载时长并防止转换瀑布
      warmup: {
        clientFiles: ["./index.html", "./src/{views,components}/*"]
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
