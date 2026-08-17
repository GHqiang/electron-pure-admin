// 服务器地址分片模块（整改 8-17 弹窗根治·端口分片）
// 背景：Chromium 对同一 (host, port) 的 HTTP/1.1 连接数上限为 6（已实测证明），
//       代理池故障时慢请求占满 6 槽 → 短预算接口排队超时弹窗。
// 方案：服务器同一 koa app 多监听 3000/3001/3002（app.js），
//       客户端按 URL hash 分片到不同端口 → 连接容量 6 → 18 槽。
// 设计要点：
//   - djb2 hash 按完整 URL 计算：同一接口永远同一端口（keep-alive 连接复用）
//   - 端口 3000 为主端口（原直连地址，零依赖）：即使分片端口异常也只影响部分请求
//   - 本模块仅服务端生产地址拼接；dev 环境（IS_DEV）不走分片

const HOSTS = [
  "http://47.113.191.173:3000",
  "http://47.113.191.173:3001",
  "http://47.113.191.173:3002"
];

/**
 * djb2 字符串 hash（稳定、无随机性）
 * @param {string} str
 * @returns {number} 无符号 32 位整数
 */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 按 URL 选择分片服务器地址（同一 URL 恒返回同一地址）
 * @param {string} url - 完整或相对 URL（拼接前调用）
 * @returns {string} 服务器 base 地址（不含尾部斜杠）
 */
export const getServerBaseUrl = url => {
  return HOSTS[djb2(url || "") % HOSTS.length];
};

/**
 * 获取分片配置（调试/单测用）
 */
export const getServerHosts = () => [...HOSTS];
