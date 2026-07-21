// 订单获取基类
// 提取所有平台订单获取的公共逻辑

import {
  mockDelay,
  sendWxPusherMessage,
  formatErrInfo
} from "@/utils/utils.js";
import Logger from "../logger.js";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

/**
 * 订单获取基类
 * 所有平台订单获取都应继承此类
 */
export default class BaseOrderFetcher {
  /**
   * 构造函数
   * @param {Object} platformAdapter - 平台适配器实例
   * @param {string} platName - 平台名称
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(platformAdapter, platName, isTestOrder = false) {
    this.platformAdapter = platformAdapter;
    this.platName = platName;
    this.isTestOrder = isTestOrder;
    this.isRunning = false;
    this.orderRecord = [];
    this.platOrderList = [];
    this.logger = new Logger({ logType: 2 });
  }

  /**
   * 启动队列
   */
  async start() {
    // 防止重复启动产生多个并发轮询循环，导致同一订单被重复派发
    if (this.isRunning) {
      console.warn("订单自动获取队列已在运行中，忽略重复启动", this.platName);
      return;
    }
    console.warn("启动订单自动获取队列", this.platName, this.isTestOrder);
    this.isRunning = true;
    this.orderRecord = [];
    this.platOrderList = [];

    while (this.isRunning) {
      await mockDelay(5);
      await this.fetchOrders();
    }
  }

  /**
   * 获取订单（子类实现）
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    throw new Error(`平台 ${this.platName} 未实现 fetchOrders 方法`);
  }

  /**
   * 发送新订单消息
   * @param {Object} order - 订单信息
   */
  async sendNewOrderMsg(order) {
    let logger;
    try {
      logger = new Logger({ logType: 2 });
      logger.init(order);

      // 动态生成事件名称
      const eventName = `newOrder_${order.appName}`;
      const newOrderEvent = new CustomEvent(eventName, {
        detail: order
      });
      if (
        order.plat_name === "lieren" &&
        dictStore.dictInfo.lierenIsSupportConfirmOrder == 1 &&
        order.is_confirm == 2
      ) {
        // 猎人平台且需要确认订单的，先确认订单，再发送事件
        // 确认失败时重试3次，仍失败则微信推送提醒
        let confirmSuccess = false;
        const maxConfirmRetries = 3;
        let attempt;
        for (attempt = 1; attempt <= maxConfirmRetries; attempt++) {
          try {
            await this.platformAdapter.confirmOrder(
              {
                order_number: order.order_number
              },
              { logger }
            );
            confirmSuccess = true;
            break;
          } catch (confirmError) {
            logger.warnSave(`确认接单第${attempt}次失败`, {
              error: formatErrInfo(confirmError)
            });
            if (attempt < maxConfirmRetries) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
        if (!confirmSuccess) {
          sendWxPusherMessage({
            app_name: order.appName,
            orderInfo: order,
            msgType: 5,
            failReason: `猎人平台确认接单失败，已重试${maxConfirmRetries}次，请手动处理`,
            transferTip: "请检查猎人平台该订单是否需要手动确认接单"
          }).catch(() => {});
          // 确认失败不阻断出票，订单继续走后续流程
        } else {
          logger.infoSave(
            `猎人平台订单${attempt > 1 ? "重试后" : ""}确认接单成功`
          );
        }
      }
      // 测试模式下，不发送事件，不启动ACK机制
      if (!this.isTestOrder) {
        // 已确认送达的订单不再重复发送（避免Fetcher轮询时同一订单反复dispatch/ACK刷屏）
        if (!window.__ackConfirmedOrders) {
          window.__ackConfirmedOrders = new Map();
        }
        const ackConfirmedKey = `${order.appName}_${order.order_number}`;
        // 重新出票(isAgain)不拦截，必须允许再次发送
        if (
          !order.isAgain &&
          window.__ackConfirmedOrders.has(ackConfirmedKey)
        ) {
          logger.infoSave("订单已确认送达，跳过重复发送", { order });
        } else {
          // ACK确认机制：监听出票队列的确认回复，5秒超时则告警
          const ackEventName = `newOrderAck_${order.appName}_${order.order_number}`;
          let ackReceived = false;

          const handleAck = ackEvent => {
            ackReceived = true;
            window.__ackConfirmedOrders.set(ackConfirmedKey, Date.now());
            // 定期清理过期记录（超过30分钟的清除）
            if (!window.__ackCleanupTimer) {
              window.__ackCleanupTimer = setInterval(
                () => {
                  const now = Date.now();
                  for (const [key, ts] of window.__ackConfirmedOrders) {
                    if (now - ts > 30 * 60 * 1000) {
                      window.__ackConfirmedOrders.delete(key);
                    }
                  }
                },
                10 * 60 * 1000
              );
            }
            logger.infoSave("出票队列消息确认已收到", {
              ackDetail: ackEvent.detail
            });
            window.removeEventListener(ackEventName, handleAck);
          };
          window.addEventListener(ackEventName, handleAck);

          setTimeout(() => {
            if (!ackReceived) {
              window.removeEventListener(ackEventName, handleAck);
              logger.warnSave("出票队列消息未收到确认（超时5秒）", { order });

              // 排查分析：诊断队列状态和登录信息
              const queueState = window.appTicketQueueObj?.[order.appName];
              const loginInfoList =
                window.getCinemaLoginInfoList?.(false) || [];
              const hasLogin = loginInfoList.some(
                item => item.app_name === order.appName
              );

              let analysis = "";
              if (!queueState) {
                analysis =
                  "【排查结论】该影院出票队列实例不存在，可能未在队列管理页面启动出票队列，请前往启动。";
              } else if (!queueState.isStart) {
                analysis =
                  "【排查结论】该影院出票队列未启动（isStart=false），请在队列管理页面重启该影院出票队列。";
              } else if (!hasLogin) {
                analysis =
                  "【排查结论】该影院登录信息缺失（无session_id），请检查登录状态并重新登录。";
              } else {
                analysis =
                  "【排查结论】出票队列实例存在且已启动、登录信息正常，但未在5秒内收到ACK确认，可能window事件监听器异常，建议重启该影院出票队列。";
              }

              sendWxPusherMessage({
                app_name: order.appName,
                orderInfo: order,
                msgType: 11,
                transferTip: analysis
              }).catch(() => {});
            }
          }, 5000);

          window.dispatchEvent(newOrderEvent);
        }
      }

      logger.infoSave("发送新订单消息", { order, eventName });
    } catch (error) {
      logger?.errorSave("发送新订单消息异常", { error, order });
    } finally {
      try {
        await logger?.logUpload();
      } catch (e) {
        // logUpload 失败不影响调用方
      }
    }
  }

  /**
   * 过滤新订单
   * @param {Array} orderList - 订单列表
   * @returns {Array} 过滤后的新订单列表
   */
  filterNewOrders(orderList) {
    return orderList.filter(item => {
      return !this.orderRecord.some(
        itemA =>
          itemA.plat_name === item.plat_name &&
          itemA.order_number === item.order_number
      );
    });
  }

  /**
   * 记录订单
   * @param {Object} order - 订单信息
   */
  recordOrder(order) {
    this.orderRecord.push(order);

    // 限制记录数量，防止内存溢出
    if (this.orderRecord.length > 50) {
      this.orderRecord.shift();
    }
  }

  /**
   * 记录平台订单
   * @param {Array} orderList - 订单列表
   */
  recordPlatformOrders(orderList) {
    if (orderList.length) {
      this.platOrderList.push(...orderList);
      const length = this.platOrderList.length;

      if (length > 100) {
        this.platOrderList = this.platOrderList.slice(-100);
      }
    }
  }

  /**
   * 停止队列运行
   */
  stop() {
    this.isRunning = false;
    console.warn("主动停止订单自动获取队列");
  }

  /**
   * 获取待出票订单列表（子类实现）
   * @returns {Promise<Array>} 订单列表
   */
  async getStayTicketList() {
    throw new Error(`平台 ${this.platName} 未实现 getStayTicketList 方法`);
  }
}
