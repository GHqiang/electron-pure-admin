// PlatformFactory 测试文件
// 测试平台适配器工厂的功能

import platformFactory from "../../factories/PlatformFactory.js";
import LierenAdapter from "../../platform/adapters/LierenAdapter.js";
import Logger from "../../logger.js";

describe("PlatformFactory", () => {
  beforeEach(() => {
    // 清除缓存
    platformFactory.clearCache();
  });

  test("应该能够创建适配器实例", () => {
    const adapter = platformFactory.create("lieren");
    
    expect(adapter).toBeDefined();
    expect(adapter instanceof LierenAdapter).toBe(true);
    expect(adapter.platName).toBe("lieren");
  });

  test("应该缓存适配器实例", () => {
    const adapter1 = platformFactory.create("lieren");
    const adapter2 = platformFactory.create("lieren");
    
    expect(adapter1).toBe(adapter2);
  });

  test("get方法应该返回适配器实例", () => {
    const adapter = platformFactory.get("lieren");
    
    expect(adapter).toBeDefined();
    expect(adapter.platName).toBe("lieren");
  });

  test("get方法对于不支持的平台应该返回null", () => {
    const adapter = platformFactory.get("invalid_platform");
    
    expect(adapter).toBeNull();
  });

  test("isSupported应该正确判断平台是否支持", () => {
    expect(platformFactory.isSupported("lieren")).toBe(true);
    expect(platformFactory.isSupported("invalid_platform")).toBe(false);
  });

  test("getSupportedPlatforms应该返回所有支持的平台", () => {
    const platforms = platformFactory.getSupportedPlatforms();
    
    expect(Array.isArray(platforms)).toBe(true);
    expect(platforms.includes("lieren")).toBe(true);
  });

  test("clearCache应该清除指定平台的缓存", () => {
    const adapter1 = platformFactory.create("lieren");
    platformFactory.clearCache("lieren");
    const adapter2 = platformFactory.create("lieren");
    
    expect(adapter1).not.toBe(adapter2);
  });

  test("clearCache应该清除所有平台的缓存", () => {
    const adapter1 = platformFactory.create("lieren");
    platformFactory.clearCache();
    const adapter2 = platformFactory.create("lieren");
    
    expect(adapter1).not.toBe(adapter2);
  });

  test("registerAdapter应该能够注册新的适配器", () => {
    // 注意：注册新适配器需要先在platform-config.js中添加配置
    // 这里我们使用一个已存在的平台来测试注册功能
    class TestAdapter extends LierenAdapter {}
    
    // 使用已存在的平台名称进行测试
    platformFactory.registerAdapter("lieren", TestAdapter);
    platformFactory.clearCache("lieren"); // 清除缓存以便使用新注册的适配器
    const adapter = platformFactory.create("lieren");
    
    expect(adapter).toBeDefined();
    expect(adapter instanceof TestAdapter).toBe(true);
    
    // 恢复原来的适配器
    platformFactory.registerAdapter("lieren", LierenAdapter);
    platformFactory.clearCache("lieren");
  });

  test("registerAdapter应该抛出错误当适配器类为空", () => {
    expect(() => {
      platformFactory.registerAdapter("test", null);
    }).toThrow();
  });
});
