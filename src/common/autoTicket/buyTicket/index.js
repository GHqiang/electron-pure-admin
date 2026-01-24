// buyTicket/index.js
import ChenxingBuyTicket from "./chenxing/buyTicket";
import FenghuangBuyTicket from "./fenghuang/buyTicket";
import JINYIBuyTicket from "./jinyi/buyTicket";
import LmaBuyTicket from "./lma/buyTicket"; // LMA新实现
import SfcBuyTicket from "./sfc/buyTicket"; // SFC模块化实现
import { GET_APP_INFO } from "@/common/constant";

// 支持的影院策略映射
const STRATEGY_MAP = {
  chenxing_applet: ChenxingBuyTicket,
  fenghuang_applet: FenghuangBuyTicket,
  jinyi_applet: JINYIBuyTicket,
  lma: LmaBuyTicket,
  sfc_applet: SfcBuyTicket
};

// 策略工厂
export default class StrategyFactory {
  static createSeatStrategy(order, logger, isTestOrder) {
    const { app_name } = order;
    const appInfo = GET_APP_INFO(app_name);

    // 优先通过app_type_code匹配
    const StrategyClass = STRATEGY_MAP[appInfo?.app_type_code];

    if (!StrategyClass) {
      throw new Error(`不支持的影院类型: ${app_name}`);
    }
    return new StrategyClass(order, logger, isTestOrder);
  }
}
