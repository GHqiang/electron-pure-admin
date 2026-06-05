# 万达影院系列接入规则新建与影院映射维护 — 设计文档

## 概述

将万达电影直连 API（wandafilm.com）的城市列表、影院列表、影片列表功能接入现有的报价规则新建弹框和影院映射维护页面，使其能像 SFC、UME 等系列一样支持下拉选择城市/影院/影片。

## 涉及文件

| 文件                                             | 操作 | 说明                                      |
| ------------------------------------------------ | ---- | ----------------------------------------- |
| `src/api/wanda-film-api.js`                      | 修改 | 新增 `getMoviePlayInfo()` 方法            |
| `src/mixins/useCinemaBaseFun.js`                 | 修改 | 新增 wanda 系列分支处理城市/影院/影片加载 |
| `src/views/permission/cinemaCodeMatch/index.vue` | 修改 | 手动新增弹窗直接加载全部影院              |

## 数据映射

### API 方法名统一

为与 SFC 系列方法的命名保持一致，万达 API 方法对照如下：

| SFC 方法名                   | 万达对应方法                             | 已有/新增 |
| ---------------------------- | ---------------------------------------- | --------- |
| `getCityList({})`            | `getCityList()`                          | 已有      |
| `getCinemaList({ city_id })` | `getCinemaList({ locationId: city_id })` | 已有      |
| `getMoviePlayInfo(params)`   | `getMoviePlayInfo({ cityId })`           | **新增**  |

### 字段映射

| 数据     | 源字段                  | 目标字段      |
| -------- | ----------------------- | ------------- |
| 城市 ID  | `city.id`               | `city_id`     |
| 城市名称 | `city.name`             | `city_name`   |
| 影院 ID  | `cinemaInfo.storeId`    | `cinema_id`   |
| 影院名称 | `cinemaInfo.cinemaName` | `cinema_name` |
| 影片 ID  | `movie.movieId`         | `film_id`     |
| 影片名称 | `movie.nameCN`          | `film_name`   |

## 影片列表合并策略

### 数据来源

1. `GET /movie/hot_coming_show.api` → `data.hotMovie[]`（正在热映）
2. `GET /movie/hot_coming_show.api` → `data.incomingMovie[]`（即将上映）
3. `GET /movie/on_demand_show.api` → `data.onDemandMovie[]`（点播电影）

### 合并逻辑

1. 同时调用 hot_coming_show 和 on_demand_show
2. 将 hotMovie + incomingMovie + onDemandMovie 合并为一个数组
3. 按 `movieId` 去重（保留先出现的）
4. 过滤掉 `ticket=false` 或 `ticketStatus` 不支持购票的影片
5. 返回格式：`[{ film_id, film_name, ...其他字段 }]`

## useCinemaBaseFun.js 新增 wanda 分支

### getCityList

```js
} else if (app_name === "wanda") {
  const res = await cinemaApi.getCityList();
  list = res?.data?.city || [];
  list = list.map(item => ({
    city_name: item.name,
    city_id: item.id
  }));
}
```

### getCinemaListByCityId

```js
} else if (app_name === "wanda") {
  const res = await cinemaApi.getCinemaList({ locationId: city_id });
  cinemaList = res?.data?.cinemaInfoList || [];
  cinemaList = cinemaList.map(item => ({
    ...item,
    cinema_id: item.storeId,
    cinema_name: item.cinemaName,
    cinema_code: ""
  }));
}
```

### getFilmList

```js
} else if (app_name === "wanda") {
  const { data: hcData } = await cinemaApi.getMoviePlayInfo({ cityId: oneCity.city_id });
  const { data: odData } = await cinemaApi.getMoviePlayInfo({ cityId: oneCity.city_id });
  // 合并 hot + incoming + onDemand
  const movieMap = new Map();
  [...(hcData?.hotMovie || []), ...(hcData?.incomingMovie || []), ...(odData?.onDemandMovie || [])].forEach(m => {
    if (m.movieId && !movieMap.has(m.movieId)) {
      movieMap.set(m.movieId, { film_id: m.movieId, film_name: m.nameCN });
    }
  });
  list = Array.from(movieMap.values());
}
```

## 影院映射手动新增

无需特殊处理。`getCinemaList(app_name)` 在 cinemaCodeMatch 页面中已通过 `getCityList` + `getAllCinemaList` 加载影院列表，`useCinemaBaseFun.js` 新增 wanda 分支后会自动生效。

## 影响范围

- **规则新建弹框**：选择 wanda 影线后，城市/影院/影片下拉可正常加载选项
- **影院映射维护**：手动新增时选择 wanda 影线后，影院下拉可正常加载所有影院
- **不存在回归风险**：仅在 `useCinemaBaseFun.js` 的 else-if 链中新增 wanda 分支，不影响其他系列
