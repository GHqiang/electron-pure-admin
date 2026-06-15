/**
 * 猎人平台规则一致性检查（控制台手动调用 / 按钮点击）
 *
 * 用法：
 *   await checkLierenRuleSync()
 *   await checkLierenRuleSync({ rule: 'user1' })
 *   await checkLierenRuleSync({ fix: true })
 *
 * 检查逻辑（双向对比）：
 *   1. 拉取本地 SV 中 is_sync_plat=1 且同步到猎人的固定报价规则
 *   2. 拉取猎人平台全部规则，只对比 sum_mode=2（固定价）的规则
 *   3. 双向对比：
 *      - 本地有、平台无（可能被手动删除）
 *      - 平台有、本地无（可能是手动创建或本地规则被删）
 *      - 两边都有但状态/座位数不一致
 */

import svApi from "@/api/sv-api";
import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";
import { dictTable } from "@/store/dictTable";

const dictStore = dictTable();

// ======================== 映射工具 ========================

function localStatusToLierenState(status) {
  return status === "1" ? 1 : 0;
}

function localSeatNumToLierenSeats(seatNum) {
  if (!seatNum || seatNum === "0") return "";
  const num = parseInt(seatNum, 10);
  if (isNaN(num) || num <= 0) return "";
  return Array.from({ length: num }, (_, i) => i + 1).join(",");
}

function extractLierenPlatRuleId(platOfferList) {
  try {
    const list =
      typeof platOfferList === "string"
        ? JSON.parse(platOfferList)
        : platOfferList;
    const lieren = list?.find(
      item =>
        item.platName === "lieren" && item.isSyncPlat == 1 && item.platRuleId
    );
    return lieren ? String(lieren.platRuleId) : null;
  } catch {
    return null;
  }
}

// ======================== 主逻辑 ========================

async function checkLierenRuleSync(opts = {}) {
  const { rule: ruleFilter, fix = false } = opts;

  console.group("🔍 猎人平台规则一致性检查（双向对比）");
  console.log("开始时间:", new Date().toLocaleString("zh-CN"));
  if (ruleFilter) console.log("过滤 rule:", ruleFilter);
  if (fix) console.warn("🔧 自动修复模式已启用");

  try {
    // ── 1. 获取 AK/SK ──
    const lierenMainAccountAkSk = dictStore.dictInfo?.lierenMainAccountAkSk;
    let akSkMap = {};
    if (lierenMainAccountAkSk) {
      try {
        akSkMap = JSON.parse(lierenMainAccountAkSk);
      } catch {
        /* ignore */
      }
    }
    const { userInfo: { rule: currentRule } = {} } = platTokens();

    // ── 2. 拉取本地全部规则，筛选同步猎人的 ──
    console.log("\n📋 拉取本地规则...");
    const allLocalRules = [];
    let pageNum = 1;
    const pageSize = 100;
    let totalNum = 0;

    do {
      const res = await svApi.queryRuleList({
        page_num: pageNum,
        page_size: pageSize,
        rule: currentRule // 只拉当前账号的规则
      });
      const list = res?.data?.ruleList || [];
      totalNum = res?.data?.totalNum || 0;
      list.forEach(item => {
        try {
          item.platOfferList = JSON.parse(item.platOfferList || "[]");
        } catch {
          item.platOfferList = [];
        }
      });
      allLocalRules.push(...list);
      pageNum++;
    } while (allLocalRules.length < totalNum);

    const localSynced = allLocalRules.filter(item => {
      if (item.status === "4") return false;
      if (item.offerType !== "1") return false;
      if (item.is_sync_plat != 1) return false;
      if (ruleFilter && item.rule !== ruleFilter) return false;
      return !!(item.platOfferList || []).find(
        p => p.platName === "lieren" && p.isSyncPlat == 1 && p.platRuleId
      );
    });
    console.log(
      `   本地共 ${allLocalRules.length} 条，同步猎人: ${localSynced.length} 条`
    );

    const localById = new Map();
    for (const r of localSynced) {
      const pid = extractLierenPlatRuleId(r.platOfferList);
      if (pid) localById.set(pid, r);
    }

    // ── 3. 拉取猎人平台规则（仅当前账号角色）──
    console.log("\n🔄 拉取猎人平台规则（仅当前账号）...");
    // 只拉取当前登录账号的规则，不跨账号
    const platRuleNames = [currentRule].filter(Boolean);

    const allPlatRules = []; // { ...fields, _ruleName, _ak, _sk }

    for (const rn of platRuleNames) {
      const akSk = akSkMap[rn] || akSkMap[currentRule];
      if (!akSk || akSk.length < 2) {
        console.warn(`   ⚠ rule="${rn}" 缺 AK/SK，跳过`);
        continue;
      }
      try {
        const res = await lierenApi.ruleList({
          lieren_ak: akSk[0],
          lieren_sk: akSk[1]
        });
        const list = res?.data || [];
        // 只对比 sum_mode=2（固定价）的规则，其它模式不在检查范围
        const filtered = list.filter(lr => lr.sum_mode == 2);
        if (list.length !== filtered.length) {
          console.log(
            `   rule="${rn}": ${list.length} 条（sum_mode=2: ${filtered.length} 条，跳过 ${list.length - filtered.length} 条）`
          );
        } else {
          console.log(`   rule="${rn}": ${list.length} 条`);
        }
        for (const lr of filtered) {
          allPlatRules.push({
            ...lr,
            _ruleName: rn,
            _ak: akSk[0],
            _sk: akSk[1]
          });
        }
      } catch (err) {
        console.error(`   ❌ rule="${rn}" 失败:`, err.message);
      }
    }
    console.log(
      `   猎人平台共 ${allPlatRules.length} 条（仅 sum_mode=2 固定价）`
    );

    const platById = new Map();
    for (const lr of allPlatRules) {
      platById.set(String(lr.rule_id), lr);
    }

    // ── 4. 双向对比 ──
    console.log("\n🔍 双向对比...");
    const allIds = new Set([...localById.keys(), ...platById.keys()]);
    const results = [];

    for (const platRuleId of allIds) {
      const local = localById.get(platRuleId);
      const plat = platById.get(platRuleId);
      const issues = [];

      if (local && plat) {
        // ✅ 两边都有 — 对比字段
        const expectedState = localStatusToLierenState(local.status);
        if (expectedState !== plat.state) {
          const m = { 1: "启用", 0: "禁用" };
          issues.push({
            type: "STATUS_MISMATCH",
            expected: `${expectedState}(${m[expectedState]})`,
            actual: `${plat.state}(${m[plat.state] || "?"})`,
            severity: "high",
            fixable: true
          });
        }
        const expectedSeats = localSeatNumToLierenSeats(local.seatNum);
        if (expectedSeats !== (plat.seats || "")) {
          issues.push({
            type: "SEATS_MISMATCH",
            expected: expectedSeats || "(空)",
            actual: plat.seats || "(空)",
            severity: "medium",
            fixable: false
          });
        }
        results.push({
          dbId: local.id,
          ruleName: local.ruleName,
          shadowLineName: local.shadowLineName,
          rule: local.rule,
          platRuleId,
          localStatus: local.status,
          localSeatNum: local.seatNum,
          platState: plat.state,
          platSeats: plat.seats,
          platName: plat.name,
          issues,
          isConsistent: issues.length === 0,
          matchType: "BOTH"
        });
      } else if (local && !plat) {
        // ⚠ 本地有，平台无
        issues.push({
          type: "LOCAL_ONLY",
          message: "本地已同步但猎人平台不存在",
          severity: "high"
        });
        results.push({
          dbId: local.id,
          ruleName: local.ruleName,
          shadowLineName: local.shadowLineName,
          rule: local.rule,
          platRuleId,
          localStatus: local.status,
          localSeatNum: local.seatNum,
          issues,
          isConsistent: false,
          matchType: "LOCAL_ONLY"
        });
      } else {
        // ⚠ 平台有，本地无
        issues.push({
          type: "PLATFORM_ONLY",
          message: "猎人平台有该规则但本地未同步",
          severity: "high"
        });
        results.push({
          dbId: null,
          ruleName: plat.name || "(无名称)",
          shadowLineName: plat.cinema_group || plat.cinema_code || "",
          rule: plat._ruleName,
          platRuleId,
          localStatus: plat.state === 1 ? "1" : "2",
          localSeatNum: "(无)",
          platState: plat.state,
          platSeats: plat.seats,
          platName: plat.name,
          issues,
          isConsistent: false,
          matchType: "PLATFORM_ONLY"
        });
      }
    }

    // ── 5. 输出报告 ──
    const consistent = results.filter(r => r.isConsistent).length;
    const inconsistent = results.filter(r => !r.isConsistent).length;
    const localOnly = results.filter(r => r.matchType === "LOCAL_ONLY").length;
    const platOnly = results.filter(
      r => r.matchType === "PLATFORM_ONLY"
    ).length;
    const statusMismatch = results.filter(r =>
      r.issues.some(i => i.type === "STATUS_MISMATCH")
    ).length;
    const seatsMismatch = results.filter(r =>
      r.issues.some(i => i.type === "SEATS_MISMATCH")
    ).length;

    console.log("\n" + "═".repeat(65));
    console.log("           猎人平台规则一致性检查报告（双向）");
    console.log("═".repeat(65));
    console.log(
      `  总数: ${results.length}  |  ✅一致: ${consistent}  |  ❌不一致: ${inconsistent}`
    );
    if (localOnly) console.log(`  📤 本地有平台无: ${localOnly}`);
    if (platOnly) console.log(`  📥 平台有本地无: ${platOnly}`);
    if (statusMismatch) console.log(`  🔴 状态不一致: ${statusMismatch}`);
    if (seatsMismatch) console.log(`  🟡 座位不一致: ${seatsMismatch}`);

    if (inconsistent > 0) {
      // 📥 平台有本地无
      const platOnlyItems = results.filter(
        r => r.matchType === "PLATFORM_ONLY"
      );
      if (platOnlyItems.length) {
        console.log(`\n📥 平台有、本地无 (${platOnlyItems.length} 条)`);
        console.table(
          platOnlyItems.map(r => ({
            平台规则ID: r.platRuleId,
            规则名: (r.platName || "").substring(0, 30),
            "院线/影院": r.shadowLineName,
            猎人状态: r.platState === 1 ? "启用" : "禁用",
            猎人座位: r.platSeats || "(空)",
            所属账号: r.rule
          }))
        );
      }

      // 📤 本地有平台无
      const localOnlyItems = results.filter(r => r.matchType === "LOCAL_ONLY");
      if (localOnlyItems.length) {
        console.log(`\n📤 本地有、平台无 (${localOnlyItems.length} 条)`);
        console.table(
          localOnlyItems.map(r => ({
            "DB ID": r.dbId,
            影线: r.shadowLineName,
            规则名: (r.ruleName || "").substring(0, 20),
            平台规则ID: r.platRuleId,
            本地状态:
              r.localStatus === "1"
                ? "正常"
                : r.localStatus === "2"
                  ? "禁用"
                  : "仅报价",
            本地座位: r.localSeatNum || "(空)"
          }))
        );
      }

      // 🔀 字段不一致
      const bothItems = results.filter(
        r => r.matchType === "BOTH" && !r.isConsistent
      );
      if (bothItems.length) {
        console.log(`\n🔀 字段不一致 (${bothItems.length} 条)`);
        console.table(
          bothItems.map(r => ({
            "DB ID": r.dbId,
            影线: r.shadowLineName,
            规则名: (r.ruleName || "").substring(0, 20),
            平台规则ID: r.platRuleId,
            问题: r.issues
              .map(i => {
                if (i.type === "STATUS_MISMATCH")
                  return `🔴状态: ${i.expected}→${i.actual}`;
                if (i.type === "SEATS_MISMATCH")
                  return `🟡座位: ${i.expected}→${i.actual}`;
                return i.type;
              })
              .join(" | ")
          }))
        );
      }
    } else {
      console.log("\n✅ 本地与平台完全一致");
    }
    console.log("═".repeat(65) + "\n");

    // ── 6. 自动修复（仅双边都存在的状态差异）──
    if (fix) {
      const fixable = results.filter(
        r =>
          r.matchType === "BOTH" &&
          r.issues.some(i => i.type === "STATUS_MISMATCH" && i.fixable)
      );
      if (fixable.length) {
        console.log(`\n🔧 修复 ${fixable.length} 条状态...`);
        let ok = 0;
        for (const item of fixable) {
          const plat = platById.get(item.platRuleId);
          if (!plat) continue;
          try {
            await lierenApi.ruleState({
              rule_id: [item.platRuleId],
              state: localStatusToLierenState(item.localStatus),
              lieren_ak: plat._ak,
              lieren_sk: plat._sk
            });
            console.log(`   ✅ ${item.shadowLineName} - ${item.ruleName}`);
            ok++;
          } catch (err) {
            console.error(`   ❌ ${item.shadowLineName}:`, err.message);
          }
        }
        console.log(`   🔧 完成: ${ok}/${fixable.length}`);
      }
    }

    console.groupEnd();
    return {
      total: results.length,
      consistent,
      inconsistent,
      localOnly,
      platOnly,
      statusMismatch,
      seatsMismatch,
      details: results.filter(r => !r.isConsistent)
    };
  } catch (error) {
    console.error("❌ 检查异常:", error);
    console.groupEnd();
    throw error;
  }
}

window.checkLierenRuleSync = checkLierenRuleSync;

export default function useCheckLierenRuleSync() {
  return { checkLierenRuleSync };
}
