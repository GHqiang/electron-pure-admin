// getOfferFailType 测试文件
// 测试报价失败原因分类推断函数

import { getOfferFailType, OFFER_FAIL_TYPE } from "../constant.js";

describe("OFFER_FAIL_TYPE", () => {
  it("应包含12种失败类型", () => {
    expect(Object.keys(OFFER_FAIL_TYPE)).toHaveLength(12);
  });

  it("每种类型都有对应的中文名称", () => {
    for (let i = 1; i <= 12; i++) {
      expect(OFFER_FAIL_TYPE[i]).toBeTruthy();
      expect(typeof OFFER_FAIL_TYPE[i]).toBe("string");
    }
  });
});

describe("getOfferFailType", () => {
  it("null/空字符串应返回 null", () => {
    expect(getOfferFailType(null)).toBeNull();
    expect(getOfferFailType("")).toBeNull();
    expect(getOfferFailType(undefined)).toBeNull();
  });

  // 1. 超限价
  it("超过平台限价 → 1", () => {
    expect(getOfferFailType("超过平台限价")).toBe(1);
    expect(getOfferFailType("最终报价35超过平台限价30，超限报价处于关闭状态不进行报价")).toBe(1);
    expect(getOfferFailType("最终报价35超过平台限价30，超限报价处于关闭状态不进行报价")).toBe(1);
  });

  // 2. 该影院无规则
  it("按影院筛选后，报价规则为空 → 2", () => {
    expect(getOfferFailType("按影院筛选后，报价规则为空")).toBe(2);
  });

  // 3. 有规则但未开启
  it("按启用状态筛选后，报价规则为空 → 3", () => {
    expect(getOfferFailType("按启用状态筛选后，报价规则为空")).toBe(3);
  });

  // 4. 券无库存
  it("按券库存筛选后，报价规则为空 → 4", () => {
    expect(getOfferFailType("按券库存筛选后，报价规则为空")).toBe(4);
  });

  // 5. 无可用卡
  it("该影院没有可用会员卡 → 5", () => {
    expect(getOfferFailType("该影院没有可用会员卡")).toBe(5);
  });

  // 6. 该影厅未包含规则
  it("按影厅筛选后，报价规则为空 → 6", () => {
    expect(getOfferFailType("按影厅筛选后，报价规则为空")).toBe(6);
  });

  // 7. 官网拉取数据失败
  it("获取目标影片信息失败 → 7", () => {
    expect(getOfferFailType("获取目标影片信息失败")).toBe(7);
  });

  it("获取目标影院失败 → 7", () => {
    expect(getOfferFailType("获取目标影院失败")).toBe(7);
  });

  it("获取目标城市影院列表失败 → 7", () => {
    expect(getOfferFailType("获取目标城市影院列表失败")).toBe(7);
  });

  it("匹配影片放映场次失败 → 7", () => {
    expect(getOfferFailType("匹配影片放映场次失败")).toBe(7);
  });

  it("获取电影放映信息返回空 → 7", () => {
    expect(getOfferFailType("获取电影放映信息返回空")).toBe(7);
  });

  it("获取电影放映信息异常 → 7", () => {
    expect(getOfferFailType("获取电影放映信息异常")).toBe(7);
  });

  // 8. 平台已报价
  it("猎人已自动报价 → 8", () => {
    expect(getOfferFailType("猎人已自动报价")).toBe(8);
  });

  it("该规则由平台进行报价 → 8", () => {
    expect(getOfferFailType("该规则由平台进行报价")).toBe(8);
  });

  // 9. 座位数不符
  it("按座位数筛选后，报价规则为空 → 9", () => {
    expect(getOfferFailType("按座位数筛选后，报价规则为空")).toBe(9);
  });

  // 10. 低于成本价
  it("最终报价XX低于真实成本XX → 10", () => {
    expect(getOfferFailType("最终报价25.5低于真实成本28.3")).toBe(10);
  });

  // 11. 订单张数超出促销数
  it("促销票数低于订单票数 → 11", () => {
    expect(getOfferFailType("促销票数低于订单票数")).toBe(11);
  });

  // 12. 提交异常
  it("提交报价异常 → 12", () => {
    expect(getOfferFailType("提交报价异常")).toBe(12);
  });

  // 无法匹配的情况
  it("无法匹配的错误信息应返回 null", () => {
    expect(getOfferFailType("订单报价截止时间小于等于毫秒，跳过报价")).toBeNull();
    expect(getOfferFailType("系统故障，暂不报价")).toBeNull();
    expect(getOfferFailType("获取会员价为0")).toBeNull();
  });
});
