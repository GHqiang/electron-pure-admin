// 平台配置测试文件
// 测试平台配置的完整性和有效性

import {
  PLATFORM_CONFIGS,
  getPlatformConfig,
  getAllPlatformNames,
  validatePlatformConfig
} from "../../../platform/configs/platform-config.js";

describe("PlatformConfig", () => {
  test("应该包含所有必需的平台配置", () => {
    const expectedPlatforms = [
      "lieren",
      "haha",
      "mangguo",
      "mayi",
      "yangcong",
      "yinghuasuan",
      "shoutu",
      "mahua",
      "sheng",
      "shangzhan"
    ];

    expectedPlatforms.forEach(platName => {
      expect(PLATFORM_CONFIGS[platName]).toBeDefined();
    });
  });

  test("每个平台配置应该包含必需字段", () => {
    Object.keys(PLATFORM_CONFIGS).forEach(platName => {
      const config = PLATFORM_CONFIGS[platName];

      expect(config.name).toBe(platName);
      expect(config.displayName).toBeDefined();
      expect(config.features).toBeDefined();
      expect(config.api).toBeDefined();
      expect(config.params).toBeDefined();
    });
  });

  test("每个平台配置的features应该包含必需字段", () => {
    Object.keys(PLATFORM_CONFIGS).forEach(platName => {
      const config = PLATFORM_CONFIGS[platName];
      const features = config.features;

      expect(features.hasTransferFee).toBeDefined();
      expect(features.priceStep).toBeDefined();
      expect(features.unlockBeforeTicket).toBeDefined();
      expect(features.needConfirmOrder).toBeDefined();

      expect(typeof features.hasTransferFee).toBe("boolean");
      expect(typeof features.priceStep).toBe("number");
      expect(typeof features.unlockBeforeTicket).toBe("boolean");
      expect(typeof features.needConfirmOrder).toBe("boolean");
    });
  });

  test("每个平台配置的api应该包含必需字段", () => {
    Object.keys(PLATFORM_CONFIGS).forEach(platName => {
      const config = PLATFORM_CONFIGS[platName];
      const api = config.api;

      expect(api.getOrderList).toBeDefined();
      expect(api.submitOffer).toBeDefined();
      expect(api.unlockSeat).toBeDefined();
      expect(api.submitTicket).toBeDefined();
      expect(api.transferOrder).toBeDefined();
    });
  });

  test("每个平台配置的params应该包含必需字段和函数", () => {
    Object.keys(PLATFORM_CONFIGS).forEach(platName => {
      const config = PLATFORM_CONFIGS[platName];
      const params = config.params;

      expect(params.orderIdKey).toBeDefined();
      expect(params.orderNumberKey).toBeDefined();
      expect(typeof params.unlockParams).toBe("function");
      expect(typeof params.submitParams).toBe("function");
      expect(typeof params.transferParams).toBe("function");
    });
  });

  test("getPlatformConfig应该返回正确的配置", () => {
    const config = getPlatformConfig("lieren");
    expect(config).toBeDefined();
    expect(config.name).toBe("lieren");

    const invalidConfig = getPlatformConfig("invalid");
    expect(invalidConfig).toBeNull();
  });

  test("getAllPlatformNames应该返回所有平台名称", () => {
    const names = getAllPlatformNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(names.includes("lieren")).toBe(true);
  });

  test("validatePlatformConfig应该正确验证配置", () => {
    const validConfig = getPlatformConfig("lieren");
    expect(validatePlatformConfig(validConfig)).toBe(true);

    expect(validatePlatformConfig(null)).toBe(false);
    expect(validatePlatformConfig({})).toBe(false);
  });

  test("参数转换函数应该正确工作", () => {
    const config = getPlatformConfig("lieren");
    const order = { order_number: "test001", id: 123 };

    // 测试unlockParams
    const unlockParams = config.params.unlockParams(order);
    expect(unlockParams.order_number).toBe("test001");

    // 测试submitParams
    const submitParams = config.params.submitParams(order, "123456|789");
    expect(submitParams.order_number).toBe("test001");
    expect(submitParams.result).toBeDefined();

    // 测试transferParams
    const transferParams = config.params.transferParams(order, "测试原因");
    expect(transferParams.order_number).toBe("test001");
  });
});
