/**
 * @description: 网络请求重试工具函数
 * 用于统一处理各平台请求的网络错误重试逻辑
 */

import axios from "axios";

/**
 * 判断是否是网络错误
 * @param {Error} error - Axios 错误对象
 * @returns {boolean}
 */
export const isNetworkError = error => {
  return axios.isAxiosError(error) && !error.response;
};

/**
 * 判断是否是超时错误
 * @param {Error} error - Axios 错误对象
 * @returns {boolean}
 */
export const isTimeoutError = error => {
  return (
    axios.isAxiosError(error) &&
    (error.code === "ECONNABORTED" ||
      error.message?.toLowerCase().includes("timeout"))
  );
};

/**
 * 判断是否是需要重试的网络类错误
 * @param {Error} error - Axios 错误对象
 * @returns {boolean}
 */
export const isRetryableError = error => {
  if (!axios.isAxiosError(error)) return false;
  const message = error.message?.toLowerCase() || "";
  return (
    message.includes("timeout") ||
    message.includes("network error") ||
    message.includes("request failed with status code 408") ||
    error.code === "ECONNABORTED"
  );
};

/**
 * 检查接口是否在重试白名单中
 * @param {string} url - 请求 URL
 * @param {string[]} whitelist - 白名单关键词数组
 * @returns {boolean}
 */
export const checkUrlCanRetry = (url, whitelist) => {
  if (!url || !whitelist?.length) return false;
  const lowerUrl = url.toLowerCase();
  return whitelist.some(item => lowerUrl.includes(item.toLowerCase()));
};

/**
 * 延迟函数
 * @param {number} seconds - 延迟秒数
 * @returns {Promise}
 */
export const mockDelay = seconds => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

/**
 * 处理网络错误重试
 * @param {Error} error - Axios 错误对象
 * @param {Object} config - 请求配置
 * @param {Object} instance - Axios 实例
 * @param {Object} options - 重试选项
 * @param {number} options.maxRetries - 最大重试次数，默认 3
 * @param {string[]} options.whitelist - 允许重试的接口白名单（URL 关键词）
 * @param {Function} options.onRetry - 重试回调函数（可选）
 * @returns {Promise|null} - 返回重试 Promise 或 null（不重试）
 */
export const handleNetworkRetry = async (
  error,
  config,
  instance,
  options = {}
) => {
  const { maxRetries = 2, whitelist = [], onRetry = null } = options;

  // 确保 config 存在
  if (!config) return null;

  // 初始化重试计数
  if (config.retryCount === undefined) {
    config.retryCount = 0;
  }

  // 检查是否满足重试条件
  const isRetryable = isRetryableError(error);
  const canRetry =
    whitelist.length === 0 ||
    checkUrlCanRetry(config.url || config.originalUrl, whitelist);

  if (isRetryable && canRetry && config.retryCount < maxRetries) {
    config.retryCount += 1;
    // 指数退避延迟：1s, 3s（给服务端更多恢复时间，避免密集重试加剧限流）
    const delay = Math.pow(3, config.retryCount - 1);

    console.warn(
      `网络请求失败，正在重试 (${config.retryCount}/${maxRetries}):`,
      config.url
    );

    // 调用重试回调（用于日志记录等）
    if (typeof onRetry === "function") {
      onRetry(config, error);
    }

    // 延迟后重试
    await mockDelay(delay);
    return instance(config);
  }

  return null;
};

/**
 * 通用的响应错误拦截器处理函数
 * @param {Error} error - Axios 错误对象
 * @param {Object} instance - Axios 实例
 * @param {Object} options - 重试选项
 * @returns {Promise}
 */
export const createErrorResponseHandler = (instance, options = {}) => {
  return async error => {
    const config = error.config;

    // 尝试重试
    const retryResult = await handleNetworkRetry(
      error,
      config,
      instance,
      options
    );
    if (retryResult) {
      return retryResult;
    }

    // 不重试，抛出错误
    console.error("请求失败:", error);
    return Promise.reject(error);
  };
};
