/**
 * 辰星3.0C 特殊会员类活动判定与特价位解析（纯函数，无外部依赖）
 *
 * 提取自 src/utils/utils.js：因 utils 聚合了浏览器侧依赖无法被单测直接引入，
 * 故将纯逻辑下沉至此便于测试；utils 对外再导出这两个名字，既有调用方无需改动。
 */

/**
 * 辰星3.0C特殊规则名称解析，是数字则返回数字
 */
export function parseNumericRule(ruleName) {
  // 1. 参数类型检查
  if (typeof ruleName !== "string") {
    return undefined;
  }

  // 2. 检查字符串格式：数字_数字
  if (!/^\d+_\d+$/.test(ruleName)) {
    return undefined;
  }

  // 3. 替换下划线为点
  const replaced = ruleName.replace("_", ".");

  // 4. 转换为数字
  const number = parseFloat(replaced);

  // 5. 验证是否为有效数字
  if (isNaN(number) || !isFinite(number)) {
    return undefined;
  }

  return number;
}

/**
 * 判断优惠档位是否属于特殊会员类活动（不可作为自动采购的可兑现成本基准）
 * 背景：影院侧会员类活动绑定特定卡等级与指定储值卡扣款，支付端由服务端按真实持卡身份
 * 裁决，报价管道读到的名义价无法保证兑现。2026-08-27 多家"周四会员日"活动以
 * 「南京商厦会员日19_9元」「苏州凤凰2026年周四会员活动」等命名绕过原有
 * includes("会员日活动") 与纯价格 ruleName 双判定，引发批量无利润转单。
 * @param {Object} item 优惠档位 {ruleGroupName, ruleName, price, cinemaPayAmount}
 * @returns {boolean} true 表示该档位应从成本基准候选中排除
 */
export function isSpecialMemberActivity(item) {
  if (!item || typeof item !== "object") {
    return false;
  }
  const groupName = String(item.ruleGroupName ?? "");
  const name = String(item.ruleName ?? "");
  // 组名命中：会员日类直接命中；周期性会员活动按"周[一~日/末]会员活动"收敛匹配，
  // 避免裸"会员活动"误伤非周期的普通命名（如"周年庆会员活动""超级会员活动"）
  if (/会员日/.test(groupName) || /周[一二三四五六日天]会员活动/.test(groupName)) {
    return true;
  }
  // 特价位：规则名整体为 NN_N 价格且与档位有效价一致（保留原判定语义）
  const numericName = parseNumericRule(name);
  if (
    numericName !== undefined &&
    Math.abs(
      Number(item.price ?? NaN) -
        Number(item.cinemaPayAmount ?? 0) -
        numericName
    ) < 0.005
  ) {
    return true;
  }
  return false;
}
