# 万达影院系列接入规则新建与影院映射维护

## 修改文件清单

| 文件                             | 操作 | 说明                                                                                   |
| -------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| `src/api/wanda-film-api.js`      | 修改 | 新增 `getMoviePlayInfo()` 方法，合并 hot_coming_show + on_demand_show，按 movieId 去重 |
| `src/mixins/useCinemaBaseFun.js` | 修改 | `getCityList`、`getCinemaListByCityId`、`getFilmList` 三个函数各新增 wanda 分支        |

## 核心变更说明

### 1. 新增 `wanda-film-api.js` 的 `getMoviePlayInfo`

- 同时调用 `hot_coming_show.api`（热映+即将上映）和 `on_demand_show.api`（点播）
- 合并三个数组（hotMovie + incomingMovie + onDemandMovie），按 `movieId` 去重
- 映射为 `{ film_id, film_name }` 格式，与 SFC 系列 `getMoviePlayInfo` 返回结构一致

### 2. `useCinemaBaseFun.js` 新增 wanda 分支

三个函数各新增 `else if (app_name === "wanda")` 分支：

| 函数                    | 调用方法                                       | 字段映射                                              |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `getCityList`           | `wanda.getCityList()`                          | `id` → `city_id`, `name` → `city_name`                |
| `getCinemaListByCityId` | `wanda.getCinemaList({ locationId: city_id })` | `storeId` → `cinema_id`, `cinemaName` → `cinema_name` |
| `getFilmList`           | `wanda.getMoviePlayInfo({ cityId })`           | `movieId` → `film_id`, `nameCN` → `film_name`         |

## 测试结果

- 影院列表：北京 20 家影院，字段映射正确
- 影片列表：52 部（热映+即将上映+点播），去重正常
- 代码零错误

## 回归风险评估

无。仅在 `useCinemaBaseFun.js` 的 else-if 链中新增 wanda 分支，不影响 SFC、UME、辰星、凤凰、金逸、卢米埃等既有系列。
