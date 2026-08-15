// 网络观测模块（整改 D3 扩展：弹窗现场取证）
// 用途：弹"网络连接异常"时记录当前网络/运行环境快照，用于区分：
//   1. 网络问题（online=false 或 loopDelay 正常但 Connection 阶段异常）
//   2. 渲染进程事件循环卡顿（loopDelayMs 大——响应到了但 JS 没及时处理）
//   3. 持续失败判断（failStreak——长轮询退避的输入）
// 整改 v1.4（8-14）：移除 inFlight/inFlightUrls 占槽观测——
//   6 槽限制已由本机实测证明（test-6slot/），占槽构成已由服务器 proxy_record 定案
//   （代理池失效），客户端占槽快照无价值。trackRequestStart/End/attachTracking
//   保留为空实现以兼容各 request 文件调用（避免动 7 个文件）。

// 事件循环延迟采样（每 5s 测量 setTimeout 实际漂移）
let lastTick = Date.now();
let lastLoopDelay = 0;
setInterval(() => {
  const now = Date.now();
  lastLoopDelay = Math.max(0, now - lastTick - 5000);
  lastTick = now;
}, 5000);

let failStreaks = {}; // 各 URL 连续失败次数（区分偶发 vs 持续故障）

/**
 * 请求发起时调用（request 拦截器）——v1.4 起为空实现（占槽观测已移除）
 */
export const trackRequestStart = () => {};

/**
 * 请求完成/失败时调用（response/error 拦截器）——v1.4 起为空实现
 */
export const trackRequestEnd = () => {};

/**
 * 失败次数累计（按 URL），成功时清零
 */
export const trackFail = url => {
  failStreaks[url] = (failStreaks[url] || 0) + 1;
  return failStreaks[url];
};
export const resetFail = url => {
  delete failStreaks[url];
};

/**
 * 统一接入辅助函数：给任意 axios 实例追加观测拦截器
 * 注意：v1.4 起不再做占槽计数（trackRequestStart/End 为 no-op），
 * 但保留"成功时 resetFail"响应拦截器——chenxing/lma/h5ume/fenghuang
 * 依赖它做 failStreak 清零（失败连击统计仍需保持准确，供 D3 日志与轮询退避使用）
 * 修复（6.6.28）：追加拦截器可能收到【原生成功拦截器返回的业务数据】（如 data.data），
 * 非 axios response 对象 → 必须可选链防御，否则 response.config.url 抛
 * "Cannot read properties of undefined (reading 'url')" 导致全部成功请求报错（8-15 事故）
 */
export const attachTracking = instance => {
  if (!instance?.interceptors) return;
  instance.interceptors.response.use(
    response => {
      if (response?.config?.url) resetFail(response.config.url);
      return response;
    },
    error => {
      if (error?.config?.url) resetFail(error.config.url);
      return Promise.reject(error);
    }
  );
};

/**
 * 弹窗时刻的网络快照（写入 D3 日志）
 */
export const getNetworkSnapshot = () => {
  let memoryMB = -1;
  try {
    if (performance?.memory?.usedJSHeapSize) {
      memoryMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    }
  } catch (_) {
    /* 部分环境无 performance.memory */
  }
  return {
    loopDelayMs: lastLoopDelay, // 事件循环延迟（大 = 渲染进程卡顿）
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    memoryMB, // 渲染进程堆内存（大 = GC 压力）
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : ""
  };
};
