// 原价（tpp_price）不报条件：解析、判定、格式化、校验
//
// 背景：运营需要按订单原价过滤报价规则（原价超过 xx、或落在 xx 区间内则不报）。
// 条件存在 rule_record.noOfferTppRule（分号分隔多条，命中任一即不报）：
//   >50 / >=50 / <30 / <=30   原价高于/不低于/低于/不高于
//   30-80                     区间内（闭区间，30 ≤ 原价 ≤ 80）
//   !30-80                    区间外
//
// 说明：不复用 calculateMarkup（那是加价链路，且其 <> / !<> 区间操作符实现有误），
// 本模块为纯函数、无 store 依赖，便于单测。
const COMPARE_RE = /^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/;
const RANGE_RE = /^(!)?\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;
const COMPARE_OP_MAP = { ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };

/**
 * 解析不报条件
 * @param {string} ruleStr - 条件表达式，如 ">50;30-80"
 * @returns {{conditions: Array<Object>, invalid: string[]}} 条件列表与无法识别的原文片段
 */
export const parseNoOfferTppRule = ruleStr => {
  const conditions = [];
  const invalid = [];
  if (ruleStr === null || ruleStr === undefined) return { conditions, invalid };
  String(ruleStr)
    .split(";")
    .forEach(rawItem => {
      const item = rawItem.trim();
      if (!item) return;
      const compareMatch = item.match(COMPARE_RE);
      if (compareMatch) {
        conditions.push({
          op: COMPARE_OP_MAP[compareMatch[1]],
          value: Number(compareMatch[2])
        });
        return;
      }
      const rangeMatch = item.match(RANGE_RE);
      if (rangeMatch) {
        const min = Number(rangeMatch[2]);
        const max = Number(rangeMatch[3]);
        // 上下限颠倒的区间视为非法，避免"看起来配了其实不生效"
        if (min > max) {
          invalid.push(item);
          return;
        }
        conditions.push({
          op: rangeMatch[1] ? "notBetween" : "between",
          min,
          max
        });
        return;
      }
      invalid.push(item);
    });
  return { conditions, invalid };
};

/**
 * 判断原价是否命中不报条件
 * @param {number|string} tppPrice - 订单原价
 * @param {string} ruleStr - 条件表达式
 * @returns {boolean} true = 命中（该规则应被剔除）
 */
export const isTppPriceNoOffer = (tppPrice, ruleStr) => {
  const price = Number(tppPrice);
  // 原价缺失/非数值/非正数：一律放行，避免字段缺失导致大面积不报价
  if (!Number.isFinite(price) || price <= 0) return false;
  const { conditions } = parseNoOfferTppRule(ruleStr);
  return conditions.some(condition => {
    switch (condition.op) {
      case "gt":
        return price > condition.value;
      case "gte":
        return price >= condition.value;
      case "lt":
        return price < condition.value;
      case "lte":
        return price <= condition.value;
      case "between":
        return price >= condition.min && price <= condition.max;
      case "notBetween":
        return price < condition.min || price > condition.max;
      default:
        return false;
    }
  });
};

/**
 * 条件转人话（列表/详情回显）
 * @param {string} ruleStr - 条件表达式
 * @returns {string} 如 "原价>50；原价30~80"，未配置返回空串
 */
export const formatNoOfferTppRule = ruleStr => {
  const { conditions } = parseNoOfferTppRule(ruleStr);
  const opText = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
  return conditions
    .map(condition => {
      if (condition.op === "between") {
        return `原价${condition.min}~${condition.max}`;
      }
      if (condition.op === "notBetween") {
        return `原价${condition.min}~${condition.max}以外`;
      }
      return `原价${opText[condition.op]}${condition.value}`;
    })
    .join("；");
};

/**
 * 保存前校验
 * @param {string} ruleStr - 条件表达式
 * @returns {{ok: boolean, msg: string}}
 */
export const validateNoOfferTppRule = ruleStr => {
  const { invalid } = parseNoOfferTppRule(ruleStr);
  if (invalid.length) {
    return {
      ok: false,
      msg: `原价不报条件无法识别：${invalid.join("、")}；支持 >50 / >=50 / <30 / <=30 / 30-80（区间内）/ !30-80（区间外），多条用分号分隔`
    };
  }
  return { ok: true, msg: "" };
};
