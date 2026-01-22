// 平台适配器工厂
// 根据平台名称创建对应的适配器实例，管理实例缓存

import LierenAdapter from "../platform/adapters/LierenAdapter.js";
import Logger from "../logger.js";
import { getPlatformConfig, getAllPlatformNames } from "../platform/configs/platform-config.js";

/**
 * 平台适配器工厂
 * 单例模式，管理所有平台适配器实例
 */
class PlatformFactory {
  constructor() {
    // 适配器实例缓存
    this.adapters = new Map();
    // 适配器类映射
    this.adapterClasses = new Map();
    
    // 注册已知的适配器类
    this.registerAdapter("lieren", LierenAdapter);
    
    // 其他平台适配器将在后续阶段注册
    // this.registerAdapter("haha", HahaAdapter);
    // this.registerAdapter("mangguo", MangguoAdapter);
    // ...
  }

  /**
   * 注册适配器类
   * @param {string} platName - 平台名称
   * @param {Class} AdapterClass - 适配器类
   */
  registerAdapter(platName, AdapterClass) {
    if (!AdapterClass) {
      throw new Error(`适配器类不能为空: ${platName}`);
    }
    
    // 验证适配器类是否继承自BasePlatformAdapter
    if (!AdapterClass.prototype || !AdapterClass.prototype.constructor) {
      throw new Error(`无效的适配器类: ${platName}`);
    }
    
    this.adapterClasses.set(platName, AdapterClass);
  }

  /**
   * 创建适配器实例
   * @param {string} platName - 平台名称
   * @param {Logger} logger - 日志实例（可选）
   * @returns {BasePlatformAdapter} 适配器实例
   */
  create(platName, logger = null) {
    // 检查缓存
    if (this.adapters.has(platName)) {
      return this.adapters.get(platName);
    }

    // 检查平台配置是否存在
    const config = getPlatformConfig(platName);
    if (!config) {
      throw new Error(`不支持的平台: ${platName}`);
    }

    // 获取适配器类
    const AdapterClass = this.adapterClasses.get(platName);
    if (!AdapterClass) {
      throw new Error(`平台 ${platName} 的适配器类未注册`);
    }

    // 创建实例
    const loggerInstance = logger || new Logger({ logType: 1 });
    const adapter = new AdapterClass(loggerInstance);

    // 缓存实例
    this.adapters.set(platName, adapter);

    return adapter;
  }

  /**
   * 获取适配器实例（如果不存在则创建）
   * @param {string} platName - 平台名称
   * @param {Logger} logger - 日志实例（可选）
   * @returns {BasePlatformAdapter|null} 适配器实例
   */
  get(platName, logger = null) {
    try {
      return this.create(platName, logger);
    } catch (error) {
      console.error(`获取平台适配器失败: ${platName}`, error);
      return null;
    }
  }

  /**
   * 检查平台是否支持
   * @param {string} platName - 平台名称
   * @returns {boolean} 是否支持
   */
  isSupported(platName) {
    return getPlatformConfig(platName) !== null;
  }

  /**
   * 获取所有支持的平台名称
   * @returns {string[]} 平台名称数组
   */
  getSupportedPlatforms() {
    return getAllPlatformNames();
  }

  /**
   * 清除缓存
   * @param {string} [platName] - 平台名称，如果提供则只清除该平台，否则清除所有
   */
  clearCache(platName = null) {
    if (platName) {
      this.adapters.delete(platName);
    } else {
      this.adapters.clear();
    }
  }
}

// 导出单例实例
const platformFactory = new PlatformFactory();
export default platformFactory;
