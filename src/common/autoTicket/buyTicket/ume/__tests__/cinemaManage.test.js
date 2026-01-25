/**
 * UME影院管理模块单元测试
 */
import UmeCinemaManage from "../cinemaManage.js";
import { APP_API_OBJ } from "@/common/index";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    hsmzyc: {
      getCinemaList: jest.fn(),
      getMoviePlayInfo: jest.fn(),
      getMoviePlayDate: jest.fn(),
      getMoviePlayTime: jest.fn()
    }
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getTargetCinemaCommon: jest.fn(({ cinemaList, cinema_name }) => {
    return cinemaList?.find(c => c.name?.includes(cinema_name)) || null;
  }),
  findMostRepeatedChars: jest.fn((str1, str2, type) => ({
    similarity: 0.8,
    [type]: str2
  })),
  getMovieInfoFromFilmName: jest.fn(({ movieData, film_name }) => {
    const movie = movieData?.find(m => m.film_name === film_name);
    return movie || null;
  }),
  getPreviousDay: jest.fn((dateStr) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  })
}));

describe("UmeCinemaManage", () => {
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
      app_name: "hsmzyc",
      plat_name: "mayi",
      order_number: "test001"
    };

    cinemaManage = new UmeCinemaManage(mockOrder, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getCityCinemaList", () => {
    test("应该成功获取城市影院列表", async () => {
      const mockData = {
        data: [
          {
            cinemaCode: "32012801",
            cinemaLinkId: "15946",
            name: "测试影院"
          }
        ]
      };
      APP_API_OBJ.hsmzyc.getCinemaList.mockResolvedValue(mockData);

      const result = await cinemaManage.getCityCinemaList();

      expect(result.cityCinemaList).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getCinemaList.mockRejectedValue(error);

      const result = await cinemaManage.getCityCinemaList();

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getMoviePlayInfo", () => {
    test("应该成功获取电影放映信息", async () => {
      const mockData = {
        data: [
          {
            filmUniqueId: "film123",
            film_name: "测试电影",
            filmType: "2D"
          }
        ]
      };
      APP_API_OBJ.hsmzyc.getMoviePlayInfo.mockResolvedValue(mockData);

      const result = await cinemaManage.getMoviePlayInfo({
        cinemaCode: "32012801",
        cinemaLinkId: "15946"
      });

      expect(result.movieData).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getMoviePlayInfo.mockRejectedValue(error);

      const result = await cinemaManage.getMoviePlayInfo({
        cinemaCode: "32012801",
        cinemaLinkId: "15946"
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getMoviePlayTime", () => {
    test("应该成功获取电影放映场次", async () => {
      const mockData = {
        data: [
          {
            scheduleId: "123456",
            scheduleKey: "abc123",
            showDateTime: "2026-01-25 10:00:00",
            hallName: "1号厅"
          }
        ]
      };
      APP_API_OBJ.hsmzyc.getMoviePlayTime.mockResolvedValue(mockData);

      const result = await cinemaManage.getMoviePlayTime({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        filmUniqueId: "film123",
        showDate: "2026-01-25"
      });

      expect(result.moviePlayTime).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getMoviePlayTime.mockRejectedValue(error);

      const result = await cinemaManage.getMoviePlayTime({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        filmUniqueId: "film123",
        showDate: "2026-01-25"
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
