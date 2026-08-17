/**
 * 端口分片方案验证脚本（整改 8-17 弹窗根治·端口分片）
 *
 * 用法：
 *   node scripts/verify-sharding.mjs            # 仅离线 hash 验证（不依赖部署）
 *   node scripts/verify-sharding.mjs --online   # 离线 + 在线 3 端口连通性/并发验证（需已部署 3001/3002）
 *
 * 验证内容：
 *   离线：djb2 hash 稳定性、真实接口 URL 分布覆盖 3 端口、空值安全、端口列表正确
 *   在线：3 端口 /debug/stats 可达、每端口并发 6 连接（模拟浏览器 per-host 限制）全部成功
 *
 * 对应文档：doc/changes/2026-08-17-弹窗根治整改方案-端口分片.md
 */
import { getServerBaseUrl, getServerHosts } from "../src/common/serverHost.js";

const HOST = "47.113.191.173";
const HEALTH_PATH = "/debug/stats"; // 无鉴权诊断端点（含 pool_ok 字段）

// 真实接口 URL 样本（对应 8 处替换文件的 hash 输入形态）
const URL_SAMPLES = [
  // sv（svpi 主体，分片受益最大：cached-ids/cardRecord/dictRecord 等）
  "/svpi/offerRecord/cached-ids",
  "/svpi/offerRecord/cardRecord",
  "/svpi/offerRecord/dictRecord",
  "/svpi/offerRecord/add",
  "/svpi/ticketRecord/query",
  "/svpi/stayOfferRecord/query",
  // lieren
  "/lieren/openapi/order/grab",
  "/lieren/openapi/order/bid",
  "/lieren/openapi/order/offer",
  "/lieren/openapi/order/record",
  // wanda
  "/wanda-film/api/v1/film/nowShowing",
  "/wanda-film/api/v1/cinema/list",
  // fenghuang（originalUrl 形态）
  "/fenghuang/1.0/cinema/list",
  "/fenghuang/1.0/film/detail",
  // chenxing（token 接口 + 主接口）
  "/svpi/chenxing-ser/api/auth/token",
  "/chenxing/cinema/list",
  // lma（originalUrl 形态）
  "/lma/api/v1/cinema/list",
  // h5ume（originalUrl 形态）
  "/h5ume/api/v1/cinema/list"
];

let passCount = 0;
let failCount = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failCount++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function offlineVerify() {
  console.log("【离线验证】serverHost.js djb2 hash 分片逻辑");
  const hosts = getServerHosts();
  check("端口列表为 3000/3001/3002", 
    hosts.length === 3 &&
    hosts.some(h => h.endsWith(":3000")) &&
    hosts.some(h => h.endsWith(":3001")) &&
    hosts.some(h => h.endsWith(":3002")),
    hosts.join(", ")
  );

  // 1. 稳定性：同一 URL 恒同端口（keep-alive 复用前提，也是"同接口不跨端口"保证）
  let stable = true;
  for (const url of URL_SAMPLES) {
    const first = getServerBaseUrl(url);
    for (let i = 0; i < 50; i++) {
      if (getServerBaseUrl(url) !== first) {
        stable = false;
        break;
      }
    }
  }
  check("同一 URL 恒返回同一端口（50 次重复 × 18 样本）", stable);

  // 2. 分布：真实接口 URL 必须覆盖 3 个端口（若挤在同一端口则分片无效）
  const dist = {};
  for (const url of URL_SAMPLES) {
    const base = getServerBaseUrl(url);
    dist[base] = (dist[base] || 0) + 1;
  }
  const distStr = Object.entries(dist)
    .map(([k, v]) => `${k}: ${v}个接口`)
    .join(" | ");
  check("真实接口分布覆盖全部 3 个端口", Object.keys(dist).length === 3, distStr);

  // 3. 端口均衡性提示（不判定失败，仅观察）
  const counts = Object.values(dist);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max / min <= 2) {
    console.log(`  ℹ️  分布均衡（最多/最少 = ${max}/${min}）`);
  } else {
    console.log(`  ⚠️  分布不均衡（最多/最少 = ${max}/${min}），极端不均时某端口仍可能排队`);
  }

  // 4. 空值/边界安全
  check("空字符串/undefined 不抛错",
    getServerBaseUrl("") !== undefined && getServerBaseUrl(undefined) !== undefined);

  // 5. 与文档 HOSTS 一致性（主端口 3000 保留原直连地址）
  check("主端口为 47.113.191.173:3000", hosts[0] === `http://${HOST}:3000`, hosts[0]);
}

async function httpGet(port, path, timeoutMs = 6000) {
  const res = await fetch(`http://${HOST}:${port}${path}`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  return res;
}

async function onlineVerify() {
  console.log("\n【在线验证】3 端口连通性（需部署新版 app.js 后通过）");
  const ports = [3000, 3001, 3002];

  // 1. 单请求连通性
  for (const port of ports) {
    try {
      const res = await httpGet(port, HEALTH_PATH);
      const body = await res.text();
      const poolOk = body.includes("pool_ok");
      check(`端口 ${port} /debug/stats 可达`, res.status === 200 && poolOk,
        `HTTP ${res.status}${poolOk ? "，含 pool_ok" : "，无 pool_ok 字段"}`);
    } catch (e) {
      const reason = e.name === "TimeoutError" ? "超时" : `${e.cause?.code || e.message}`;
      check(`端口 ${port} /debug/stats 可达`, false, reason);
    }
  }

  // 2. 每端口并发 6 连接（模拟浏览器 per-host 6 连接上限）→ 3 端口共 18 并发
  console.log("\n【在线验证】每端口并发 6 连接（模拟浏览器 6 连接/端口 → 总 18 槽）");
  const CONCURRENCY = 6;
  for (const port of ports) {
    const jobs = Array.from({ length: CONCURRENCY }, (_, i) =>
      httpGet(port, HEALTH_PATH).then(r => ({ ok: r.status === 200, i })).catch(e => ({ ok: false, i, err: e.cause?.code || e.message }))
    );
    const results = await Promise.all(jobs);
    const okCount = results.filter(r => r.ok).length;
    check(`端口 ${port} 并发 ${CONCURRENCY} 全成功`, okCount === CONCURRENCY, `${okCount}/${CONCURRENCY}`);
  }
}

// ============ main ============
const runOnline = process.argv.includes("--online");

offlineVerify();
if (runOnline) {
  await onlineVerify();
} else {
  console.log("\nℹ️  跳过在线验证（部署新版 app.js 后加 --online 重跑，验证 3 端口连通与 18 槽并发）");
}

console.log(`\n结果：${passCount} 通过 / ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
