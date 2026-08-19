// 本地兜底日志模块
// 用途：logUpload 上传失败被丢弃的日志落盘到本地（userData/logs/logUploadFail-日期.log），
// 便于后续排查问题；经 preload 暴露的 window.ipcRenderer 调主进程写文件，
// 渲染进程不直接操作文件系统。写盘失败静默，不影响主流程。

/**
 * 格式化当前时间 YYYY-MM-DD HH:mm:ss
 * @returns {string}
 */
const getNowStr = () => {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

/**
 * 上传失败的日志批次落盘（fire-and-forget，异步不阻塞）
 * @param {Array} batch - 本次上传失败的日志批次（与 logUpload 的 logList 条目结构一致）
 * @param {Object} [order] - 上传参数 { plat_name, app_name, order_number, type }
 * @param {string} [customName] - 自定义文件名前缀（如 "network-error" → network-error-YYYYMMDD.log），
 *                                不传保持默认 logUploadFail-YYYYMMDD.log（整改 D3 复用）
 */
export const saveFailLogToLocal = (batch = [], order = {}, customName = "", ipcName = "save-fail-log") => {
  if (!batch.length) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const fileDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}`;
  // 逐条 JSON 行写入，便于按行检索；
  // 单条序列化失败（如 info 含循环引用/函数/BigInt）降级为字符串记录，不影响其余日志落盘
  const lines = batch.map(item => {
    try {
      return JSON.stringify({
        ...item,
        local_save_time: getNowStr(),
        upload_plat: order.plat_name || "",
        upload_app: order.app_name || "",
        upload_order: order.order_number || "",
        upload_type: order.type ?? 3
      });
    } catch {
      return JSON.stringify({
        des: "日志序列化失败（原对象不可 JSON 序列化）",
        level: "error",
        local_save_time: getNowStr(),
        upload_plat: order.plat_name || "",
        upload_app: order.app_name || "",
        upload_order: order.order_number || "",
        upload_type: order.type ?? 3,
        raw: String(item)
      });
    }
  });
  const content = lines.join("\n") + "\n";
  // 经 preload 挂载的 window.ipcRenderer 调主进程写盘（contextIsolation:false 下直接挂载，可靠）
  const ipcRenderer = window.ipcRenderer;
  if (ipcRenderer?.invoke) {
    // 异步写盘，不阻塞（fire-and-forget，失败已在主进程侧兜底记录）
    const fileName = customName
      ? `${customName}-${fileDate}.log`
      : `logUploadFail-${fileDate}.log`;
    ipcRenderer
      .invoke(ipcName, { fileDate, content, fileName })
      .catch(() => {});
  } else {
    console.warn("本地兜底日志：ipcRenderer 不可用，跳过落盘");
  }
};
