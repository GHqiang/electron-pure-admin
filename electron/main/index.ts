import { release } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { appendFile, writeFile, mkdir, stat } from "node:fs/promises";
import {
  type MenuItem,
  type MenuItemConstructorOptions,
  app,
  Menu,
  shell,
  ipcMain,
  BrowserWindow,
  dialog
} from "electron";
// import axios from 'axios';
// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.env.DIST_ELECTRON = join(__dirname, "..");
process.env.DIST = join(process.env.DIST_ELECTRON, "../dist");
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, "../public")
  : process.env.DIST;
// 是否为开发环境
// 说明：vite-plugin-electron 编译主进程时，process.env.NODE_ENV 在主进程 Node 环境下并不可靠
// （取决于 electron 启动时 shell 的 NODE_ENV，yarn dev 不一定设置）。
// VITE_DEV_SERVER_URL 仅 dev 模式由 vite 注入，生产构建必无，与 loadURL 同源，最可靠。
const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null;
// Here, you can also use other preload
const preload = join(__dirname, "../preload/index.mjs");
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, "index.html");

// 创建菜单
function createMenu(label = "进入全屏幕") {
  const menu = Menu.buildFromTemplate(
    appMenu(label) as (MenuItemConstructorOptions | MenuItem)[]
  );
  Menu.setApplicationMenu(menu);
}

// 设置截止日期
const expirationDate = new Date("2024-09-01 22:15:00");
let expirationCheckIntervalId;

function isExpired() {
  const currentDate = new Date();
  return currentDate >= expirationDate;
}

function startExpirationCheck() {
  expirationCheckIntervalId = setInterval(() => {
    if (isExpired()) {
      clearInterval(expirationCheckIntervalId);
      showExpirationDialogAndQuit();
    }
  }, 10 * 1000); // 每分钟检查一次
}

function showExpirationDialogAndQuit() {
  let options: any = null;
  options = {
    type: "warning",
    title: "Application Expired",
    message: "This application has expired and will now close.",
    detail: "Please contact the application provider for further assistance.",
    buttons: ["OK"]
  };

  dialog.showMessageBox(options).then(() => {
    app.quit();
  });
}
async function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    title: "Main window",
    icon: join(process.env.PUBLIC, "favicon.ico"),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // electron-vite-vue#298
    win.loadURL(url);
    // Open devTool if the app is not packaged
    // win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  // 诊断：确认 preload 是否成功加载执行（window.ipcRenderer 是否挂载成功）
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[诊断] preload 加载失败:", preloadPath, error);
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents
      .executeJavaScript("typeof window.ipcRenderer")
      .then(type => {
        console.warn("[诊断] 页面加载完成，window.ipcRenderer 类型 =", type);
        return type;
      })
      .catch(e => console.error("[诊断] 检查 ipcRenderer 失败", e));
  });

  createMenu();

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  // 窗口进入全屏状态时触发
  win.on("enter-full-screen", () => {
    createMenu("退出全屏幕");
  });

  // 窗口离开全屏状态时触发
  win.on("leave-full-screen", () => {
    createMenu();
  });

  // 崩溃自愈：渲染进程崩溃/无响应时自动恢复，防循环，取证
  setupCrashRecovery(win);
}

// ==================== 崩溃自愈 ====================
// 配置：5 分钟窗口内最多允许崩溃 2 次，超过则停止自动恢复（防"崩溃→恢复→再崩"死循环）
const CRASH_GUARD = {
  WINDOW_MS: 5 * 60 * 1000,
  MAX_CRASH: 2,
  RECOVERY_QUERY: "crashRecovery", // 通知渲染层"本次为崩溃恢复"的 query 参数名
  CRASH_REASON_QUERY: "crashReason" // 崩溃原因（取证）
};

function setupCrashRecovery(win: BrowserWindow) {
  const crashTimes: number[] = [];
  // 统一的本地留证写入：console + crashEvent-*.log 同步记录，确保现场无终端也能复盘
  // fire-and-forget，写盘失败仅 console.error，不阻塞自愈流程
  const logCrashEvent = (msg: string) => {
    const line = `[${new Date().toLocaleString()}] ${msg}\n`;
    console.warn(`[崩溃自愈] ${msg}`);
    appendLocalLog(`crashEvent-${todayStr()}.log`, line).catch(error =>
      console.error("崩溃事件本地留证写入失败", error)
    );
  };

  const reloadWithRecovery = (reason: string, exitCode?: number) => {
    const now = Date.now();
    crashTimes.push(now);
    // 只保留时间窗内的崩溃记录
    while (crashTimes.length && now - crashTimes[0] > CRASH_GUARD.WINDOW_MS) {
      crashTimes.shift();
    }
    const count = crashTimes.length;
    logCrashEvent(
      `渲染进程崩溃 reason=${reason} exitCode=${exitCode ?? "null"} count=${count}/${CRASH_GUARD.MAX_CRASH}`
    );

    // 连续崩溃：停止自动恢复，提示人工介入（防止恢复后处理同批数据再次崩溃的死循环）
    if (count >= CRASH_GUARD.MAX_CRASH) {
      logCrashEvent(
        `连续崩溃次数超限(${count}/${CRASH_GUARD.MAX_CRASH})，停止自动恢复，等待人工介入`
      );
      dialog
        .showMessageBox(win, {
          type: "error",
          title: "程序连续崩溃",
          message:
            `程序 ${CRASH_GUARD.WINDOW_MS / 60000} 分钟内连续崩溃 ${count} 次，已停止自动恢复。\n` +
            `崩溃原因：${reason}${exitCode ? ` (exitCode=${exitCode})` : ""}\n` +
            "请截图本提示并联系技术支持。",
          buttons: ["知道了"]
        })
        .catch(() => {});
      return;
    }

    // 单次崩溃：带恢复标记重载页面（登录信息在 localStorage，不丢失）
    try {
      if (process.env.VITE_DEV_SERVER_URL) {
        const url = `${process.env.VITE_DEV_SERVER_URL}?${CRASH_GUARD.RECOVERY_QUERY}=1&${CRASH_GUARD.CRASH_REASON_QUERY}=${encodeURIComponent(reason)}`;
        win.loadURL(url);
        logCrashEvent(`reload 成功(dev URL) reason=${reason}`);
      } else {
        win.loadFile(indexHtml, {
          query: {
            [CRASH_GUARD.RECOVERY_QUERY]: "1",
            [CRASH_GUARD.CRASH_REASON_QUERY]: reason
          }
        });
        logCrashEvent(`reload 成功(loadFile) reason=${reason}`);
      }
    } catch (error) {
      logCrashEvent(`reload 失败 reason=${reason} error=${String(error)}`);
    }
  };

  // 渲染进程崩溃（crash/oom/killed 等）
  win.webContents.on("render-process-gone", (_event, details) => {
    // 崩溃已由 reloadWithRecovery 处理恢复，取消未决的无响应恢复定时器：
    // 否则 15 秒后定时器会对 reload 后的新 webContents（isDestroyed=false）再次强制恢复，
    // 误计一次崩溃并可能触发"连续崩溃"弹窗、误停自愈
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
      logCrashEvent("render-process-gone 触发，取消未决的 unresponsive 定时器");
    }
    reloadWithRecovery(details.reason, details.exitCode);
  });

  // 渲染进程无响应（如主线程死循环）：等待 15 秒后强制 reload；
  // 若期间自行恢复（responsive 事件）则取消强制恢复
  let unresponsiveTimer: NodeJS.Timeout | null = null;
  win.webContents.on("unresponsive", () => {
    logCrashEvent("渲染进程无响应，15 秒后强制恢复（若期间 responsive 则取消）");
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
    unresponsiveTimer = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        // 走统一的恢复路径：计入 crashTimes，超限停止恢复，防"死循环→reload→再死循环"无限循环
        unresponsiveTimer = null;
        reloadWithRecovery("unresponsive");
      }
    }, 15 * 1000);
  });
  win.webContents.on("responsive", () => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
      logCrashEvent("渲染进程已自行恢复，取消强制 reload");
    }
  });
}

// 崩溃自愈测试通道（开发与生产环境均注册，便于现场验证）：
// 渲染层 DevTools 执行 window.ipcRenderer.invoke("crash-test") 即可模拟渲染进程崩溃，
// 验证自愈逻辑。说明：渲染层 index.html 覆盖了 window.process={}，process.crash() 不可用，
// 故用主进程 forcefullyCrashRenderer() 触发（Electron 官方崩溃模拟 API）。
// 注意：该通道会强制崩溃渲染进程，仅供测试验证使用，请勿暴露给普通用户操作。
// 崩溃前先在本地落一条测试记录（crashEvent-*.log），生产现场执行一次即可同时验证"本地日志写入"功能。
ipcMain.handle("crash-test", async event => {
  const targetWin = BrowserWindow.fromWebContents(event.sender) || win;
  const ok = await appendLocalLog(
    `crashEvent-${todayStr()}.log`,
    `[${new Date().toLocaleString()}] 崩溃测试：收到 crash-test 指令，即将模拟渲染进程崩溃（本地日志写入功能验证）\n`
  );
  console.warn(`[崩溃自愈] 收到崩溃测试指令，本地日志写入${ok ? "成功" : "失败"}，强制崩溃渲染进程`);
  targetWin?.webContents.forcefullyCrashRenderer();
  return true;
});

app.whenReady().then(() => {
  createWindow();
  // 开启定期过期检查
  // startExpirationCheck();
  // V3 L3：本地 trace 回收——启动即清一次 + 每日定时（24h 轮询）
  void cleanLocalTraceFiles();
  setInterval(() => {
    void cleanLocalTraceFiles();
  }, 24 * 3600 * 1000);
});

// V3 L3：退出时再清一次（覆盖长时间运行后直接关窗的场景）
app.on("before-quit", () => {
  void cleanLocalTraceFiles();
});

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// 菜单栏 https://www.electronjs.org/zh/docs/latest/api/menu-item#%E8%8F%9C%E5%8D%95%E9%A1%B9
const appMenu = (fullscreenLabel: string) => {
  const menuItems = [
    { label: "关于", role: "about" },
    { label: "开发者工具", role: "toggleDevTools" },
    { label: "强制刷新", role: "forcereload" },
    { label: "退出", role: "quit" }
  ];
  // 生产环境删除开发者工具菜单
  // if (!isDev) menuItems.splice(1, 1);
  const template = [
    {
      label: app.name,
      submenu: menuItems
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        {
          label: "重做",
          role: "redo"
        },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "删除", role: "delete" },
        { label: "全选", role: "selectAll" }
      ]
    },
    {
      label: "显示",
      submenu: [
        { label: "加大", role: "zoomin" },
        {
          label: "默认大小",
          role: "resetzoom"
        },
        { label: "缩小", role: "zoomout" },
        { type: "separator" },
        {
          label: fullscreenLabel,
          role: "togglefullscreen"
        }
      ]
    }
  ];
  return template;
};

// New window example arg: new windows url
ipcMain.handle("open-win", (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${url}#${arg}`);
  } else {
    childWindow.loadFile(indexHtml, { hash: arg });
  }
});

// ==================== 本地兜底日志 ====================
// 用途：
//   1. 渲染进程 logUpload 上传失败时，把被丢弃的日志落盘到本地（logUploadFail-*.log）
//   2. 崩溃自愈事件本地留证（crashEvent-*.log）：crash-test 模拟崩溃、真实崩溃自动恢复时各写一条
// 路径：userData/logs/（userData = %APPDATA%/electron-pure-admin）
// 大小控制：单文件超过 20MB 时截断（只保留最新一批），避免无限增长
const FAIL_LOG_DIR = "logs";
const FAIL_LOG_MAX_BYTES = 20 * 1024 * 1024; // 20MB

// 当天日期 YYYYMMDD（与渲染层 save-fail-log 的 fileDate 格式一致）
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// 公共写盘：目录不存在则创建；单文件超限截断（保留最新批次 + 截断提示）；写失败仅记错误不影响调用方
async function appendLocalLog(
  fileName: string,
  content: string,
  maxBytes: number = FAIL_LOG_MAX_BYTES
): Promise<boolean> {
  try {
    const logDir = join(app.getPath("userData"), FAIL_LOG_DIR);
    await mkdir(logDir, { recursive: true });
    const filePath = join(logDir, fileName);

    // 单文件大小控制：超过上限则截断（写一行提示 + 最新一批）
    let fileSize = 0;
    try {
      const st = await stat(filePath);
      fileSize = st.size;
    } catch {
      // 文件不存在，忽略
    }
    if (fileSize > maxBytes) {
      await writeFile(
        filePath,
        `[${new Date().toLocaleString()}] 本地兜底日志超过 ${maxBytes} 字节，已截断，仅保留最新批次\n`
      );
    }

    await appendFile(filePath, content, "utf8");
    return true;
  } catch (error) {
    console.error("本地兜底日志写入失败", error);
    return false;
  }
}

ipcMain.handle(
  "save-fail-log",
  async (
    _event,
    {
      fileDate,
      content,
      fileName
    }: { fileDate: string; content: string; fileName?: string }
  ) => {
    // fileName 仅允许字母数字/下划线/连字符 + .log 后缀（渲染层可控，防路径穿越）；
    // 不传时默认写 logUploadFail-{fileDate}.log（上传失败兜底），
    // 传时写独立文件（如 queueRestore-{fileDate}.log 恢复摘要兜底）
    const safeName =
      fileName && /^[\w-]+\.log$/.test(fileName)
        ? fileName
        : `logUploadFail-${fileDate}.log`;
    return appendLocalLog(safeName, content);
  }
);

// V3 L2/L3：明细日志（trace）本地写盘 — 单日文件可能达 60~100MB，上限放宽到 200MB（区别于 20MB 的兜底日志）
const TRACE_LOG_MAX_BYTES = 200 * 1024 * 1024; // 200MB
const TRACE_LOCAL_RETAIN_DAYS = 7; // 本地 trace 保留天数（启动/每日/退出三时机清理）
ipcMain.handle(
  "save-trace-log",
  async (
    _event,
    {
      fileDate,
      content,
      fileName
    }: { fileDate: string; content: string; fileName?: string }
  ) => {
    const safeName =
      fileName && /^[\w-]+\.log$/.test(fileName)
        ? fileName
        : `trace-${fileDate}.log`;
    return appendLocalLog(safeName, content, TRACE_LOG_MAX_BYTES);
  }
);

// V3 L3：本地 trace 文件回收（保留 TRACE_LOCAL_RETAIN_DAYS 天）。
// 时机三选一都不够：仅启动清理会因"长时间不重启"累积（日 60~100MB × N 天）；
// 仅每日定时覆盖不了"启动即清"；仅退出覆盖不了崩溃强杀。三时机组合：
//   ① 启动时（whenReady）② 每日定时（03:00 前后，24h 轮询）③ 退出时（before-quit）
async function cleanLocalTraceFiles(): Promise<void> {
  try {
    const logDir = join(app.getPath("userData"), FAIL_LOG_DIR);
    const files = await readdir(logDir).catch(() => []);
    const cutoff = Date.now() - TRACE_LOCAL_RETAIN_DAYS * 24 * 3600 * 1000;
    let removed = 0;
    for (const f of files) {
      const m = /^trace-(\d{8})\.log$/.exec(f);
      if (!m) continue;
      const fileDate = new Date(
        `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`
      );
      if (fileDate.getTime() < cutoff) {
        await unlink(join(logDir, f)).catch(() => {});
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[本地日志] trace 清理：移除 ${removed} 个过期文件（保留 ${TRACE_LOCAL_RETAIN_DAYS} 天）`);
    }
  } catch (error) {
    console.error("本地 trace 清理失败", error);
  }
}

// 新增：通用 HTTP 代理接口
// ipcMain.handle('proxy-http-request', async (event, requestOptions) => {
//   const {
//     url,
//     method = 'GET',
//     headers = {},
//     data = null,      // 用于 POST/PUT body
//     params = null,    // 新增：用于 GET 查询参数
//     timeout = 10000
//   } = requestOptions;

//   try {
//     // 【可选】安全校验域名
//     // const allowedHosts = ['capi.oristarcloud.com', ...];
//     // const host = new URL(url).hostname;
//     // if (!allowedHosts.includes(host)) throw new Error('Forbidden');

//     const config: any = {
//       url,
//       method: method.toUpperCase(),
//       headers,
//       timeout
//     };

//     // 根据方法类型决定参数位置
//     if (['GET', 'HEAD', 'DELETE'].includes(config.method)) {
//       config.params = params || data; // 兼容：如果前端只传了 data，也当作 params
//     } else {
//       config.data = data;
//     }

//     const response = await axios(config);
//     console.log('主进程请求接口返回:', response);
//     return {
//       success: true,
//       status: response.status,
//       data: response.data,
//       headers: response.headers
//     };
//   } catch (error: any) {
//     console.error('Proxy request failed:', error.message, url);
//     // ... 错误处理同上
//     if (error.response) {
//       return {
//         success: false,
//         status: error.response.status,
//         data: error.response.data,
//         message: error.message
//       };
//     } else if (error.request) {
//       return {
//         success: false,
//         status: null,
//         data: null,
//         message: 'Network error'
//       };
//     } else {
//       return {
//         success: false,
//         status: null,
//         data: null,
//         message: error.message || 'Unknown error'
//       };
//     }
//   }
// });
