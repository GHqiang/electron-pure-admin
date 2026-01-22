// BasePlatformAdapter 测试文件
// 测试平台适配器基类的功能

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import { getPlatformConfig } from "../../platform/configs/platform-config.js";

/**
 * 测试用的适配器类
 */
class TestAdapter extends BasePlatformAdapter {
  constructor(platName, apiInstance, logger) {
    super(platName, apiInstance, logger);
  }

  async fetchOrderList(params = {}) {
    return [{ id: 1, order_number: "test001" }];
  }

  async submitOffer(params) {
    return { code: 1, msg: "success" };
  }
}

describe("BasePlatformAdapter", () => {
  let adapter;
  let mockApi;
  let mockLogger;

  beforeEach(() => {
    mockApi = {
      unlockSeat: jest.fn().mockResolvedValue({ msg: "success" }),
      submitTicketCode: jest.fn().mockResolvedValue({ code: 1 }),
      transferOrder: jest.fn().mockResolvedValue({ code: 1 })
    };

    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn()
    };

    adapter = new TestAdapter("lieren", mockApi, mockLogger);
  });

  test("应该正确初始化", () => {
    expect(adapter.platName).toBe("lieren");
    expect(adapter.api).toBe(mockApi);
    expect(adapter.config).toBeDefined();
  });

  test("应该正确获取平台配置", () => {
    const config = getPlatformConfig("lieren");
    expect(config).toBeDefined();
    expect(config.name).toBe("lieren");
    expect(config.displayName).toBe("猎人");
  });

  test("解锁座位应该使用配置的参数转换函数", async () => {
    const order = { order_number: "test001" };
    const result = await adapter.unlockSeat(order);

    expect(mockApi.unlockSeat).toHaveBeenCalledWith({
      order_number: "test001"
    });
    expect(result.msg).toBe("success");
  });

  test("提交取票码应该使用配置的参数转换函数", async () => {
    const order = { order_number: "test001" };
    const qrcode = "123456|789";
    const result = await adapter.submitTicketCode(order, qrcode);

    expect(mockApi.submitTicketCode).toHaveBeenCalled();
    expect(result.code).toBe(1);
  });

  test("转单应该使用配置的参数转换函数", async () => {
    const order = { order_number: "test001" };
    const reason = "测试转单";
    const result = await adapter.transferOrder(order, reason);

    expect(mockApi.transferOrder).toHaveBeenCalled();
    expect(result.code).toBe(1);
  });

  test("应该正确处理解锁错误", async () => {
    mockApi.unlockSeat.mockRejectedValueOnce({
      msg: "已经解锁"
    });

    const order = { order_number: "test001" };
    const result = await adapter.unlockSeat(order, 0);

    expect(result.msg).toBe("已解锁");
  });

  test("应该正确转换订单格式", () => {
    const order = { id: 1, order_number: "test001" };
    const transformed = adapter.transformOrder(order);

    expect(transformed.plat_name).toBe("lieren");
    expect(transformed.id).toBe(1);
  });
});

// 导出测试套件
export default {
  TestAdapter
};
