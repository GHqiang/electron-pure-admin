/**
 * serverHost.js 单元测试（整改 8-17 端口分片）
 * 验证：hash 稳定性（同一 URL 恒同一端口）、3 端口覆盖、空值安全
 */
import { getServerBaseUrl, getServerHosts } from "@/common/serverHost";

describe("serverHost 端口分片", () => {
  it("同一 URL 恒返回同一端口（hash 稳定）", () => {
    const url = "/svpi/offerRecord/cached-ids?cinema=1";
    const r1 = getServerBaseUrl(url);
    const r2 = getServerBaseUrl(url);
    expect(r1).toBe(r2);
  });

  it("不同 URL 分布到 3 个端口（覆盖验证）", () => {
    const urls = [];
    for (let i = 0; i < 100; i++) {
      urls.push(`/svpi/test/api${i}?x=${i}`);
    }
    const used = new Set(urls.map(u => getServerBaseUrl(u)));
    expect(used.size).toBe(3); // 3 个端口都被用到
  });

  it("返回的地址均为合法端口列表成员", () => {
    const hosts = getServerHosts();
    for (let i = 0; i < 50; i++) {
      const base = getServerBaseUrl(`/svpi/offerRecord/cached-ids?i=${i}`);
      expect(hosts).toContain(base);
    }
  });

  it("空值/undefined 不抛错", () => {
    expect(() => getServerBaseUrl("")).not.toThrow();
    expect(() => getServerBaseUrl(undefined)).not.toThrow();
  });

  it("端口列表包含 3000/3001/3002", () => {
    const hosts = getServerHosts();
    expect(hosts.some(h => h.endsWith(":3000"))).toBe(true);
    expect(hosts.some(h => h.endsWith(":3001"))).toBe(true);
    expect(hosts.some(h => h.endsWith(":3002"))).toBe(true);
  });
});
