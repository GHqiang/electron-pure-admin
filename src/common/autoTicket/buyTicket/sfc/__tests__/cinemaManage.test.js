/**
 * SFC影院管理模块单元测试
 */
import SfcCinemaManage from "../cinemaManage.js";
import { APP_API_OBJ } from "@/common/index";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    sfc: {
      getCityList: jest.fn(),
      getCinemaList: jest.fn(),
      getMoviePlayInfo: jest.fn()
    }
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getTargetCinemaCommon: jest.fn(({ cinemaList, cinema_name }) => {
    return cinemaList?.find(c => c.name?.includes(cinema_name)) || null;
  }),
  findMostRepeatedChars: jest.fn(str => str),
  getMovieInfoFromFilmName: jest.fn(({ movieData, film_name }) => {
    const movie = movieData?.find(m => m.film_name === film_name);
    return movie || null;
  }),
  isNextDay: jest.fn((dateStr) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateStr === tomorrow.toISOString().split("T")[0];
  }),
  getPreviousDay: jest.fn((dateStr) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  })
}));

describe("SfcCinemaManage", () => {
  let cinemaManage;
  let mockLogger;
  let mockOrder;

  beforeEach(() => {
    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn()
    };

    mockOrder = {
      app_name: "sfc",
      plat_name: "lieren",
      order_number: "test001"
    };

    cinemaManage = new SfcCinemaManage(mockOrder, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getCityList", () => {
    test("应该成功获取城市列表", async () => {
      const mockData = {
        data: {
          all_city: [
            { id: "500", name: "上海" },
            { id: "501", name: "北京" }
          ]
        }
      };
      APP_API_OBJ.sfc.getCityList.mockResolvedValue(mockData);

      const result = await cinemaManage.getCityList();

      expect(result).toEqual(mockData.data.all_city);
      expect(APP_API_OBJ.sfc.getCityList).toHaveBeenCalledWith({});
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.getCityList.mockRejectedValue(error);

      const result = await cinemaManage.getCityList();

      expect(result).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalledWith(
        "获取城市列表异常",
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe("getCityCinemaList", () => {
    test("应该成功获取城市影院列表", async () => {
      const mockData = {
        data: {
          cinema_data: [
            { id: "13", name: "SFC上影影城", cinemaId: "13" },
            { id: "14", name: "SFC影院2", cinemaId: "14" }
          ]
        }
      };
      APP_API_OBJ.sfc.getCinemaList.mockResolvedValue(mockData);

      const result = await cinemaManage.getCityCinemaList({ city_id: "500" });

      expect(result.cinemaList).toHaveLength(2);
      expect(result.cinemaList[0]).toHaveProperty("cinemaId");
      expect(APP_API_OBJ.sfc.getCinemaList).toHaveBeenCalledWith({
        city_id: "500"
      });
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.getCinemaList.mockRejectedValue(error);

      const result = await cinemaManage.getCityCinemaList({ city_id: "500" });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getMoviePlayInfo", () => {
    test("应该成功获取电影放映信息", async () => {
      const mockData = {
        data: {
          movie_data: [
            {
              film_name: "测试电影",
              shows: {
                "2026-01-25": [
                  {
                    show_id: "7255871",
                    start_time: "10:25",
                    hall_name: "6号厅"
                  }
                ]
              }
            }
          ]
        }
      };
      APP_API_OBJ.sfc.getMoviePlayInfo.mockResolvedValue(mockData);

      const result = await cinemaManage.getMoviePlayInfo({
        city_id: "500",
        cinema_id: "13",
        session_id: "test_session"
      });

      expect(result.movieData).toEqual(mockData.data.movie_data);
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.getMoviePlayInfo.mockRejectedValue(error);

      const result = await cinemaManage.getMoviePlayInfo({
        city_id: "500",
        cinema_id: "13",
        session_id: "test_session"
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
