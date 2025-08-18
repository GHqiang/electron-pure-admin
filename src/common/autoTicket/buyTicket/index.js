// buyTicket/index.js
import ChenxingBuyTicket from "./chenxing/buyTicket";
import FenghuangBuyTicket from "./fenghuang/buyTicket";
import { GET_APP_INFO } from "@/common/constant";

// 支持的影院策略映射
const STRATEGY_MAP = {
  chenxing_applet: ChenxingBuyTicket,
  fenghuang_applet: FenghuangBuyTicket
};

// 策略工厂
export default class StrategyFactory {
  static createSeatStrategy(order, logger, isTestOrder) {
    const { app_name } = order;
    const StrategyClass = STRATEGY_MAP[GET_APP_INFO(app_name).app_type_code];
    if (!StrategyClass) {
      throw new Error(`不支持的影院类型: ${appFlag}`);
    }
    return new StrategyClass(order, logger, isTestOrder);
  }
}
