import svApi from "@/api/sv-api";
export default function useCinemaBaseFun() {
  // 获取券类型列表
  const getQuanTypeList = async app_name => {
    try {
      const params = {
        app_name,
        page_num: 1,
        page_size: 100
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
  return { getQuanTypeList };
}
