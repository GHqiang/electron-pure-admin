import sfcApi from "@/api/sfc-api";
import jinjiApi from "@/api/jinji-api";
import jiujinApi from "@/api/jiujin-api";
import lainaApi from "@/api/laina-api";
import ningboApi from "@/api/ningbo-api";
import hemaApi from "@/api/hema-api";

const SFC_API_OBJ = {
  sfc: sfcApi,
  jinji: jinjiApi,
  jiujin: jiujinApi,
  laina: lainaApi,
  ningbo: ningboApi,
  hema: hemaApi
};
export { SFC_API_OBJ };
