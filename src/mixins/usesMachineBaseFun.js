import svApi from "@/api/sv-api";
import { getCurrentTime } from "@/utils/utils";
import {
  GET_APP_LIST,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GE_APP_INFO
} from "@/common/constant";
import { platTokens } from "@/store/platTokens";

export default function useCinemaBaseFun() {
  const APP_LIST = computed(() => GET_APP_LIST());
  const UME_LIST = computed(() => GET_UME_LIST());
  const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
  const CHENXING_LIST = computed(() => GET_CHENXING_LIST());

  const {
    userInfo: { rule }
  } = platTokens();
  // 获取券类型列表
  const getQuanTypeList = async app_name => {
    try {
      // 这里不传rule是因为接口处理那从token解析里拿到并传了
      const params = {
        app_name,
        page_num: 1,
        page_size: 500
      };
      const res = await svApi.queryQuanTypeList(params);
      let quanTypeList = res.data.quanTypeList || [];
      console.log("券类型列表===>", quanTypeList);
      // quanType.value = quanTypeList;
      return quanTypeList;
    } catch (error) {
      console.error("获取券类型列表异常", error);
    }
  };
  // 同步卡信息时新增卡
  const addCardListHandle = async cardList => {
    try {
      let params = {
        addCardList: cardList.map(item => {
          let card_discount = "100";
          let use_limit_day = "";
          let use_limit_month;
          if (UME_LIST.value.includes(item.app_name)) {
            // card_discount = "78";
            use_limit_day = "12";
          } else if (item.app_name === "lma") {
            // card_discount = "78";
            use_limit_day = "8";
            use_limit_month = "20";
          }
          let app_type = GE_APP_INFO(item.app_name)?.app_type_code;
          return {
            ...item,
            app_type,
            card_discount,
            use_limit_day,
            use_limit_month,
            status: "1",
            rule: rule,
            update_time: getCurrentTime()
          };
        })
      };
      console.warn("新增卡列表参数", params);
      const res = await svApi.batchAddCardRecord(params);
      console.warn("新增卡列表返回", res);
    } catch (error) {
      console.warn("新增卡列表异常", error);
    }
  };

  // 同步卡信息时更新余额
  const updateCardListHandle = async cardList => {
    try {
      let params = {
        updateList: cardList
      };
      console.warn("更新卡列表参数", params);
      const res = await svApi.batchUpdateCardRecord(params);
      console.warn("更新卡列表返回", res);
      // 返回是否更新成功标识
      return true;
    } catch (error) {
      console.warn("更新卡列表异常", error);
    }
  };

  // 查看卡余额
  const queryCardBalance = async () => {
    try {
      // 假设这里是您之前定义的获取数据的方法
      const cardRes = await svApi.queryCardList({
        rule: rule,
        isNeedTotalNum: 0,
        queryFields: "app_name,status,mobile,card_num,card_discount,balance"
      });
      let list = cardRes.data.cardList || [];

      const uniqueMap = new Map();
      list.forEach(item => {
        const key = `${item.mobile}-${item.card_num}`;
        if (!uniqueMap.has(key) && APP_LIST.value[item.app_name]) {
          uniqueMap.set(key, item);
        }
      });

      list = Array.from(uniqueMap.values());

      const summary = {};
      let useBalance = 0,
        noUseBalance = 0,
        totalBalance = 0,
        discountTotalBalance = 0;
      list.forEach(item => {
        const appName = APP_LIST.value[item.app_name];
        const balance = parseFloat(item.balance) || 0;
        const discountBalance =
          (balance * 1000 * (item.card_discount || 100)) / 1000 / 100 || 0;

        if (!summary[appName]) {
          summary[appName] = {
            appName,
            status1Balance: 0,
            notStatus1Balance: 0,
            totalBalance: 0,
            discountTotalBalance: 0
          };
        }

        if (item.status == "1") {
          summary[appName].status1Balance += balance;
          useBalance += balance;
        } else {
          summary[appName].notStatus1Balance += balance;
          noUseBalance += balance;
        }

        summary[appName].totalBalance += balance;
        summary[appName].discountTotalBalance += discountBalance;
        totalBalance += balance;
        discountTotalBalance += discountBalance || 0;
      });
      let balance_list = Object.values(summary);
      console.log("discountTotalBalance", discountTotalBalance);
      balance_list.unshift({
        appName: "总余额",
        status1Balance: useBalance,
        notStatus1Balance: noUseBalance,
        totalBalance: totalBalance,
        discountTotalBalance
      });
      balance_list = balance_list.map(item => ({
        ...item,
        status1Balance: +item.status1Balance.toFixed(),
        notStatus1Balance: +item.notStatus1Balance.toFixed(),
        totalBalance: +item.totalBalance.toFixed(),
        discountTotalBalance: +item.discountTotalBalance.toFixed()
      }));
      console.log("查看卡余额", balance_list);
      return balance_list;
    } catch (err) {
      console.warn("查看卡余额异常", err);
    }
  };

  return {
    getQuanTypeList,
    addCardListHandle,
    updateCardListHandle,
    queryCardBalance
  };
}
