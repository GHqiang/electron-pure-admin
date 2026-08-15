/**
 * networkMonitor.js 单元测试
 * 重点：attachTracking 追加拦截器收到"原生拦截器返回的业务数据"（非 axios response）
 * 时不得抛错——8-15 生产事故回归防护
 * （事故：h5ume/lma/chenxing/fenghuang 原生成功拦截器 return data?.data，
 *  attachTracking 追加后裸访问 response.config.url → TypeError → 全部成功请求报错）
 */
import { attachTracking, trackFail } from "@/common/networkMonitor";

describe("attachTracking", () => {
  const createMockInstance = () => ({
    interceptors: {
      response: { use: jest.fn() }
    }
  });

  it("注册成功与失败两个拦截器", () => {
    const instance = createMockInstance();
    attachTracking(instance);
    expect(instance.interceptors.response.use).toHaveBeenCalledTimes(1);
    const [onFulfilled, onRejected] =
      instance.interceptors.response.use.mock.calls[0];
    expect(typeof onFulfilled).toBe("function");
    expect(typeof onRejected).toBe("function");
  });

  it("成功拦截器收到业务数据（非 axios response）时不抛错且原样返回", () => {
    const instance = createMockInstance();
    attachTracking(instance);
    const [onFulfilled] = instance.interceptors.response.use.mock.calls[0];

    // 模拟 h5ume 原生成功拦截器返回 data?.data（业务数据对象）
    const bizData = { ret: 1, data: { bizValue: {} } };
    expect(() => onFulfilled(bizData)).not.toThrow();
    expect(onFulfilled(bizData)).toBe(bizData);

    // 业务 data 为 undefined 的场景（h5ume return data?.data 可能为 undefined）
    expect(() => onFulfilled(undefined)).not.toThrow();
    expect(() => onFulfilled(null)).not.toThrow();
  });

  it("成功拦截器收到 axios response 时正常 resetFail", () => {
    const instance = createMockInstance();
    attachTracking(instance);
    const [onFulfilled] = instance.interceptors.response.use.mock.calls[0];

    trackFail("http://x/a");
    expect(trackFail("http://x/a")).toBe(2); // 连续失败累计
    // 收到真实 axios response → 清零
    onFulfilled({ config: { url: "http://x/a" } });
    expect(trackFail("http://x/a")).toBe(1); // 重置后重新计数
  });

  it("失败拦截器收到业务 reject 值（字符串/Error）时不抛错", async () => {
    const instance = createMockInstance();
    attachTracking(instance);
    const [, onRejected] = instance.interceptors.response.use.mock.calls[0];

    // h5ume 业务失败分支 reject 字符串（如 "xx登录失效"）
    await expect(onRejected("xx登录失效")).rejects.toBe("xx登录失效");
    // axios 网络错误对象
    const err = new Error("Network Error");
    await expect(onRejected(err)).rejects.toBe(err);
    const err2 = { message: "Network Error" };
    await expect(onRejected(err2)).rejects.toBe(err2);
    await expect(onRejected(undefined)).rejects.toBe(undefined);
  });

  it("失败拦截器收到 axios error 时正常 resetFail 并继续 reject", async () => {
    const instance = createMockInstance();
    attachTracking(instance);
    const [, onRejected] = instance.interceptors.response.use.mock.calls[0];

    trackFail("http://x/b");
    const error = { config: { url: "http://x/b" }, message: "Network Error" };
    await expect(onRejected(error)).rejects.toBe(error);
    expect(trackFail("http://x/b")).toBe(1); // 失败也清零（错误分支语义）
  });

  it("instance 无 interceptors 时不抛错", () => {
    expect(() => attachTracking(null)).not.toThrow();
    expect(() => attachTracking({})).not.toThrow();
    expect(() => attachTracking(undefined)).not.toThrow();
  });
});
