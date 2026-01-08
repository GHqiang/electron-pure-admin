// 公共券库存更新逻辑
import {
  getCurrentTime,
  couponInfoSpecial,
  getCinemaLoginInfoList,
  logUpload
} from "@/utils/utils";
import svApi from "@/api/sv-api";

/**
 * 异步更新券库存
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单信息
 * @param {Array} params.quanTypeList - 券类型列表
 * @param {Function} params.getQuanListByPhone - 获取优惠券列表的函数
 * @param {Object} [params.extraParams] - 额外参数，如 city_id, cinema_id 等
 * @param {Object} [params.logger] - 日志管理类实例
 */
export async function syncUpdateQuanStock({
  order,
  quanTypeList,
  getQuanListByPhone,
  extraParams = {},
  logger
}) {
  const { app_name, plat_name, order_number } = order;
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  console.log("targetLoginList", targetLoginList);
  try {
    let needUpdateQuanTypeList = [];
    // 拿着处理过的最大券库存（几个号之间）+对应的更新时间去判断是否要更新（只判断自己号上的）
    let isNeedUpdate = quanTypeList.some(item => {
      let inx = item.quanStockListByPhone.findIndex(
        itemA => itemA.quan_stock === item.quan_stock
      );
      // console.log("inx", inx);
      if (inx != -1) {
        let update_time = item.quanStockListByPhone[inx].update_time;
        // console.log("update_time", update_time);

        return !update_time
          ? true
          : +new Date() - +new Date(update_time) > 1000 * 60 * 60; // 超过1小时未更新
      } else {
        return true;
      }
    });
    if (!isNeedUpdate) {
      logger.infoSave("不满足更新条件");
    } else {
      // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
      needUpdateQuanTypeList = quanTypeList;
      console.log("needUpdateQuanTypeList", needUpdateQuanTypeList);

      let quanTypeListParams = needUpdateQuanTypeList.map(item => {
        return {
          id: item.id,
          quan_flag: item.quan_flag,
          black_quans: item.black_quans,
          quanStockList: item.quanStockList.map(itemA => ({
            phone: itemA.phone,
            quan_stock: itemA.quan_stock || 0,
            real_quan_stock: itemA.real_quan_stock || 0,
            update_time: itemA.update_time
          }))
        };
      });
      // 获取关联用户每个号的优惠券列表
      for (let i = 0; i < targetLoginList.length; i++) {
        const { session_id, mobile } = targetLoginList[i];
        const quanListAll = await getQuanListByPhone({
          session_id,
          ...extraParams,
          logger
        });

        quanTypeListParams.forEach(item => {
          let targetQuanList = quanListAll.filter(
            itemA =>
              couponInfoSpecial(item.quan_flag) ===
                couponInfoSpecial(itemA.coupon_info) &&
              !item.black_quans?.includes(itemA.coupon_num)
          );
          console.log(item.quan_flag, "targetQuanList", targetQuanList);

          // SFC 特有的分组券库存逻辑
          let quanStock = targetQuanList.length;
          if (extraParams.city_id && extraParams.cinema_id) {
            // SFC 逻辑：处理分组券
            const { card_num } = targetQuanList?.[0] || {};
            if (card_num) {
              const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
                const key = coupon.card_num;
                if (!groups[key]) {
                  groups[key] = [];
                }
                groups[key].push(coupon);
                return groups;
              }, {});
              let groupList = Object.values(groupedCoupons);
              // 获取分组后最多出票量当做库存
              let maxLength = groupList[0]?.length || 0;
              for (let i = 1; i < groupList.length; i++) {
                if (groupList[i]?.length > maxLength) {
                  maxLength = groupList[i].length;
                }
              }
              quanStock = maxLength;
            }
          }

          let quanStockList = item.quanStockList;
          console.log("quanStockList", quanStockList);
          let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
          let endDateTime = targetQuanList.sort(
            (a, b) => new Date(a.endDateTime) - new Date(b.endDateTime)
          )?.[0]?.endDateTime;
          if (inx != -1) {
            quanStockList[inx].quan_stock = quanStock;
            quanStockList[inx].real_quan_stock = targetQuanList.length;
            quanStockList[inx].update_time = getCurrentTime();
            quanStockList[inx].endDateTime = endDateTime;
          } else {
            quanStockList.push({
              phone: mobile,
              quan_stock: quanStock,
              real_quan_stock: targetQuanList.length,
              update_time: getCurrentTime(),
              endDateTime
            });
          }
        });
      }
      console.log("quanTypeListParams", quanTypeListParams);
      let updateTypeList = quanTypeListParams.map(item => ({
        id: item.id,
        quanStockList: item.quanStockList,
        update_time: getCurrentTime()
      }));
      logger.infoSave("最终要更新的券类型列表", { updateTypeList });
      for (let index = 0; index < updateTypeList.length; index++) {
        const item = updateTypeList[index];
        // 单个更新
        await singleUpdateQuanStock({
          id: item.id,
          quanStockList: JSON.stringify(item.quanStockList),
          update_time: item.update_time,
          logger
        });
      }
    }
  } catch (error) {
    logger.infoSave("异步更新券库存异常", { error: formattedError(error) });
  } finally {
    logger.logUpload();
  }
}

// 单个更新券库存
async function singleUpdateQuanStock(obj) {
  const { logger, ...params } = obj;
  try {
    const res = await svApi.updateQuanType(params);
    logger.infoSave("单个更新券库存返回", { res, params });
  } catch (error) {
    logger.infoSave("单个更新券库存异常", { error: formattedError(error) });
  }
}

/**
 * 获取券类型列表并异步更新券库存
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单信息
 * @param {Function} params.getQuanListByPhone - 获取优惠券列表的函数
 * @param {Object} [params.extraParams] - 额外参数，如 city_id, cinema_id 等
 * @param {Object} [params.logger] - 日志管理类实例
 * @returns {Array} quanTypeList - 处理后的券类型列表
 */
export async function getQuanTypeListByApp({
  order,
  getQuanListByPhone,
  extraParams = {},
  logger
}) {
  const { app_name } = order;
  let useMobileList = getCinemaLoginInfoList()
    .filter(
      item => item.app_name === app_name && item.mobile && item.session_id
    )
    .map(item => item.mobile);
  const params = {
    app_name,
    isNeedTotalNum: 0,
    queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
  };
  try {
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      // 只拿关联账号的券库存信息进行判断
      const quanStockListByPhone = item.quanStockList.filter(itemA =>
        useMobileList.includes(itemA.phone)
      );
      item.quan_stock = item.quan_stock || 0;
      if (quanStockListByPhone?.length) {
        // 最大数当做券库存
        let maxNum = 0;
        quanStockListByPhone.forEach(itemA => {
          if (+itemA.quan_stock > maxNum) {
            maxNum = +itemA.quan_stock;
          }
        });
        item.quan_stock = maxNum;
      }
      item.quanStockListByPhone = quanStockListByPhone.slice();
    });
    console.log("quanTypeList", quanTypeList);
    // 异步更新券库存
    syncUpdateQuanStock({
      order,
      quanTypeList,
      getQuanListByPhone,
      extraParams,
      logger
    });
    return quanTypeList;
  } catch (error) {
    logger.errorSave("根据影院获取券类型列表返回异常", {
      error: formattedError(error)
    });
  }
}
