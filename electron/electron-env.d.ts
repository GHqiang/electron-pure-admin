/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: "true";
    DIST_ELECTRON: string;
    DIST: string;
    /** /dist/ or /public/ */
    PUBLIC: string;
  }
}

// preload 暴露给渲染层的 ipcRenderer 桥（contextIsolation:false 下直接挂载 window，业务代码统一走 window.ipcRenderer）
interface IpcRendererBridge {
  on: (
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ) => void;
  off: (
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ) => void;
  send: (channel: string, ...args: unknown[]) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

interface Window {
  ipcRenderer?: IpcRendererBridge;
  // 兼容旧用法（utils.requestViaMain 曾引用 window.electron）
  electron?: {
    ipcRenderer?: IpcRendererBridge;
  };
}
