/**
 * 万达影院编码匹配脚本
 *
 * 功能：
 *   1. 读取「平台-影院名字映射.json」，获取万达影院名称→平台编码的映射列表
 *   2. 调后端代理获取万达官方全量影院列表（含城市信息）
 *   3. 通过模糊匹配将平台影院名称(appName)关联到万达官方影院
 *   4. 生成 Excel 文件，格式可直接用于"影院编码映射"页面的导入
 *
 * 用法：
 *   node scripts/match-wanda-cinema-codes.js --mapping 平台-影院名字映射.json
 *
 * 可选参数：
 *   --backend <后端地址>          默认 http://47.113.191.173:3000
 *   --threshold <相似度阈值>      默认 0.7 (0~1)
 *   --output <输出文件名>         默认 万达影院编码匹配结果.xlsx
 *
 * 示例：
 *   node scripts/match-wanda-cinema-codes.js --mapping 平台-影院名字映射.json
 *   node scripts/match-wanda-cinema-codes.js --mapping ./平台-影院名字映射.json --threshold 0.8
 */

import axios from "axios";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";

// ======================== 命令行参数解析 ========================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    backend: "http://47.113.191.173:3000",
    threshold: 0.7,
    output: "万达影院编码匹配结果.xlsx",
    mapping: ""
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mapping":
        opts.mapping = args[++i] || "";
        break;
      case "--backend":
        opts.backend = args[++i] || opts.backend;
        break;
      case "--threshold":
        opts.threshold = parseFloat(args[++i]) || opts.threshold;
        break;
      case "--output":
        opts.output = args[++i] || opts.output;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }

  if (!opts.mapping) {
    console.error("❌ 缺少必填参数 --mapping");
    console.error(
      "用法: node scripts/match-wanda-cinema-codes.js --mapping 平台-影院名字映射.json"
    );
    process.exit(1);
  }

  // 转为绝对路径
  opts.mapping = path.resolve(opts.mapping);
  if (!fs.existsSync(opts.mapping)) {
    console.error(`❌ 映射文件不存在: ${opts.mapping}`);
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
万达影院编码匹配脚本
====================
用法: node scripts/match-wanda-cinema-codes.js --mapping <映射文件.json> [选项]

必填参数:
  --mapping <文件>   平台-影院名字映射.json 的路径

可选参数:
  --backend <URL>     后端服务地址 (默认: http://47.113.191.173:3000)
  --threshold <0~1>   模糊匹配相似度阈值 (默认: 0.7)
  --output <文件名>    输出 Excel 文件名 (默认: 万达影院编码匹配结果.xlsx)
  --help              显示帮助信息

示例:
  node scripts/match-wanda-cinema-codes.js --mapping 平台-影院名字映射.json
  node scripts/match-wanda-cinema-codes.js --mapping ./平台-影院名字映射.json --threshold 0.8
`);
}

// ======================== 读取映射文件 ========================

/**
 * 读取 JSON 映射文件
 * 文件格式：每个条目有 appName（万达影院名称）和 cinemaCode（平台编码）
 * 去重：同一影院可能有多条记录，只保留第一条
 */
function readMappingFile(filePath) {
  console.log(`\n📖 正在读取映射文件: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf-8");

  // 文件格式：多个 JSON 数组首尾直接拼接（[{...}][{...}][...] 格式）
  // 可能存在少量格式错乱（如对象边界有意外字符），逐个提取数组块容错解析
  let content = raw.trim();

  // 提取所有以 [ 开头、以 ] 结尾的独立数组块
  // 用栈匹配法找到每个完整的顶层数组
  const blocks = [];
  let depth = 0;
  let blockStart = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "[") {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && blockStart >= 0) {
        blocks.push(content.slice(blockStart, i + 1));
        blockStart = -1;
      }
    }
  }

  if (blocks.length === 0) {
    console.error("❌ 映射文件中未找到有效的 JSON 数组");
    process.exit(1);
  }

  // 逐个解析数组块并合并
  const data = [];
  let parseFailCount = 0;
  for (const block of blocks) {
    try {
      const arr = JSON.parse(block);
      if (Array.isArray(arr)) data.push(...arr);
    } catch {
      parseFailCount++;
    }
  }

  if (parseFailCount > 0) {
    console.warn(`   ⚠️  有 ${parseFailCount} 个数组块解析失败（已跳过）`);
  }

  if (!Array.isArray(data)) {
    console.error("❌ 映射文件格式错误：应为 JSON 数组");
    process.exit(1);
  }

  // 过滤出万达影院(WanDaFilm)的记录，按 appName 去重
  const seen = new Set();
  const mappingList = [];
  for (const item of data) {
    const name = (item.appName || "").trim();
    const code = (item.cinemaCode || "").trim();
    if (!name || !code) continue;
    // 只处理万达影院
    if (item.cinemaId !== "WanDaFilm") continue;
    // 去重
    const key = name + "||" + code;
    if (seen.has(key)) continue;
    seen.add(key);
    mappingList.push({ appName: name, cinemaCode: code });
  }

  console.log(
    `   ✅ 读取到 ${mappingList.length} 条万达影院映射记录（已去重）`
  );
  console.log("\n📋 映射样本（前5条）:");
  mappingList.slice(0, 5).forEach((item, i) => {
    console.log(`   ${i + 1}. "${item.appName}"  (code: ${item.cinemaCode})`);
  });

  return mappingList;
}

// ======================== 字符串工具函数 ========================

/**
 * 归一化影院名称，便于比较
 */
function normalizeCinemaName(name) {
  if (!name) return "";
  let s = String(name).trim();

  // 全角字符转半角
  s = s.replace(/[\uFF01-\uFF5E]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  s = s.replace(/\u3000/g, " ");
  s = s.replace(/\s+/g, "");
  s = s.replace(/\(/g, "（").replace(/\)/g, "）");

  return s;
}

/**
 * 提取影院核心名称（去除品牌名、常见后缀）
 */
function extractCoreName(name) {
  if (!name) return "";
  let s = normalizeCinemaName(name);

  // 去除前缀品牌名
  s = s.replace(/^万达影[城院]?/i, "");
  s = s.replace(/^wanda(cinema)?/i, "");
  s = s.replace(/^寰映影[城院]?/i, "");
  s = s.replace(/^寰时影[城院]?/i, "");
  // 去除括号内冗余信息（如 IMAX、PRIME、CINITY 等）
  s = s.replace(
    /（[^）]*?(?:IMAX|PRIME|CINITY|XLAND|4DX|激光|LED|双激光|店?).*?）/g,
    ""
  );
  // 去除 "店" 字后缀
  s = s.replace(/店$/, "");
  // 去除前导分隔符
  s = s.replace(/^[-–—·•]+/, "");

  return s || normalizeCinemaName(name);
}

/**
 * 计算 Levenshtein 距离
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * 计算归一化相似度 (0~1)
 */
function similarity(a, b) {
  const na = normalizeCinemaName(a);
  const nb = normalizeCinemaName(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(na, nb);
  return 1 - dist / maxLen;
}

/**
 * 子串包含匹配
 */
function containsMatch(a, b) {
  const na = normalizeCinemaName(a);
  const nb = normalizeCinemaName(b);
  return na.includes(nb) || nb.includes(na);
}

// ======================== API 调用 ========================

/**
 * 从后端代理获取万达官方全量影院列表（含城市信息）
 */
async function fetchWandaCinemaListWithCity(backend) {
  const url = `${backend}/wanda-film-ser/cinema/cinema/list-with-city`;
  console.log(`\n📡 正在获取万达官方影院列表（含城市信息）...`);
  console.log(`   URL: ${url}`);

  const response = await axios({
    method: "get",
    url,
    timeout: 60000,
    validateStatus: () => true
  });

  const { data } = response;

  if (data.code !== 0) {
    throw new Error(
      `万达影院 API 返回异常: code=${data.code}, msg=${data.msg || "未知错误"}`
    );
  }

  const cinemaList = data.data?.cinemaInfoList || [];
  console.log(`   ✅ 获取到 ${cinemaList.length} 条万达官方影院记录`);
  return cinemaList;
}

// ======================== 匹配逻辑 ========================

/**
 * 从映射列表(appName)匹配万达官方影院(cinemaName)
 *
 * 因映射文件中的 appName 与万达 API 的 cinemaName 是同一来源，
 * 主要做名称归一化后精确匹配，少量可能因格式差异需要模糊匹配。
 */
function matchCinemas(mappingList, wandaList, threshold) {
  const matched = [];
  const unmatched = [];
  const usedWandaIds = new Set();

  // 构建万达影院按归一化名称的索引（精确匹配）
  const wandaByName = {};
  for (const w of wandaList) {
    const normalized = normalizeCinemaName(w.cinemaName || "");
    if (!normalized) continue;
    if (!wandaByName[normalized]) wandaByName[normalized] = [];
    wandaByName[normalized].push(w);
  }

  // 同时建立核心名索引
  const wandaByCore = {};
  for (const w of wandaList) {
    const core = extractCoreName(w.cinemaName || "");
    if (!core) continue;
    if (!wandaByCore[core]) wandaByCore[core] = [];
    wandaByCore[core].push(w);
  }

  for (const item of mappingList) {
    const { appName, cinemaCode } = item;
    const normalized = normalizeCinemaName(appName);
    const core = extractCoreName(appName);

    let bestMatch = null;
    let bestScore = 0;
    let bestType = "";

    // 策略1: 归一化全名精确匹配
    const exactCandidates = wandaByName[normalized] || [];
    const unusedExact = exactCandidates.filter(
      w => !usedWandaIds.has(w.storeId)
    );
    if (unusedExact.length > 0) {
      bestMatch = unusedExact[0];
      bestScore = 1.0;
      bestType = "全名精确匹配";
    }

    // 策略2: 核心名精确匹配
    if (!bestMatch && core) {
      const coreCandidates = wandaByCore[core] || [];
      const unusedCore = coreCandidates.filter(
        w => !usedWandaIds.has(w.storeId)
      );
      if (unusedCore.length > 0) {
        bestMatch = unusedCore[0];
        bestScore = 1.0;
        bestType = "核心名精确匹配";
      }
    }

    // 策略3+: 模糊匹配（未精确匹配时遍历所有未使用万达影院）
    if (!bestMatch) {
      for (const w of wandaList) {
        if (usedWandaIds.has(w.storeId)) continue;
        const wName = w.cinemaName || "";
        if (!wName) continue;

        // 子串包含
        if (containsMatch(appName, wName)) {
          const score = 0.95;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = w;
            bestType = "全名包含匹配";
          }
        }

        // 核心名包含
        if (core) {
          const wCore = extractCoreName(wName);
          if (wCore && containsMatch(core, wCore)) {
            const score = 0.9;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = w;
              bestType = "核心名包含匹配";
            }
          }
        }

        // Levenshtein 全名
        const sim = similarity(appName, wName);
        if (sim > bestScore) {
          bestScore = sim;
          bestMatch = w;
          bestType = `全名模糊匹配(${sim.toFixed(2)})`;
        }

        // Levenshtein 核心名
        if (core) {
          const wCore = extractCoreName(wName);
          if (wCore) {
            const coreSim = similarity(core, wCore);
            if (coreSim > bestScore) {
              bestScore = coreSim;
              bestMatch = w;
              bestType = `核心名模糊匹配(${coreSim.toFixed(2)})`;
            }
          }
        }
      }
    }

    if (bestMatch && bestScore >= threshold) {
      usedWandaIds.add(bestMatch.storeId);
      matched.push({
        mapping: item,
        wanda: bestMatch,
        score: bestScore,
        matchType: bestType
      });
    } else {
      unmatched.push({
        appName,
        cinemaCode,
        _reason: bestMatch
          ? `最佳匹配得分 ${bestScore.toFixed(2)} 低于阈值 ${threshold}`
          : "未找到任何候选",
        _bestCandidateName: bestMatch?.cinemaName || "",
        _bestScore: bestMatch ? bestScore : null
      });
    }
  }

  const unmatchedWanda = wandaList.filter(w => !usedWandaIds.has(w.storeId));

  return { matched, unmatched, unmatchedWanda };
}

// ======================== Excel 生成 ========================

function generateExcel(matched, unmatched, unmatchedWanda, outputPath) {
  console.log(`\n📊 正在生成 Excel 文件...`);

  const wb = XLSX.utils.book_new();

  // ---- Sheet1: 匹配成功（可直接导入） ----
  const importHeader = [
    "app_type_code",
    "app_type_name",
    "app_name",
    "app_label",
    "app_cinema_name",
    "app_cinema_code",
    "plat_cinema_code",
    "映射文件名(appName)",
    "万达影院名(cinemaName)",
    "万达城市",
    "万达地址",
    "匹配方式",
    "相似度"
  ];

  const importRows = matched.map(({ mapping, wanda, score, matchType }) => {
    const cityId = wanda.city_id || "";
    const storeId = wanda.storeId || "";
    const appCinemaCode =
      cityId && storeId ? `${cityId}_${storeId}` : String(storeId);

    return [
      "wanda_applet",
      "万达小程序",
      "wanda",
      "万达",
      wanda.cinemaName || "",
      appCinemaCode,
      String(mapping.cinemaCode || ""), // plat_cinema_code
      mapping.appName || "",
      wanda.cinemaName || "",
      wanda.city_name || "",
      wanda.address || "",
      matchType,
      score.toFixed(4)
    ];
  });

  const importData = [importHeader, ...importRows];
  const ws1 = XLSX.utils.aoa_to_sheet(importData);
  ws1["!cols"] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 8 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
    { wch: 30 },
    { wch: 12 },
    { wch: 35 },
    { wch: 26 },
    { wch: 8 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "匹配成功-可导入");

  // ---- Sheet2: 匹配失败（需人工处理） ----
  const unmatchedHeader = [
    "映射文件名(appName)",
    "平台编码(cinemaCode)",
    "最佳候选万达影院",
    "最佳候选得分",
    "失败原因",
    "建议操作"
  ];
  const unmatchedRows = unmatched.map(item => {
    const hasCandidate = !!item._bestCandidateName;
    const suggestion = hasCandidate
      ? "得分接近阈值，建议人工确认"
      : "映射文件中存在但万达官方无对应，请检查影院名称是否已变更";
    return [
      item.appName || "",
      item.cinemaCode || "",
      item._bestCandidateName || "",
      item._bestScore != null ? item._bestScore.toFixed(4) : "",
      item._reason || "",
      suggestion
    ];
  });
  const unmatchedData = [unmatchedHeader, ...unmatchedRows];
  const ws2 = XLSX.utils.aoa_to_sheet(unmatchedData);
  ws2["!cols"] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 30 },
    { wch: 14 },
    { wch: 40 },
    { wch: 45 }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "匹配失败-需人工处理");

  // ---- Sheet3: 未匹配的万达影院（参考） ----
  if (unmatchedWanda.length > 0) {
    const wandaHeader = ["万达影院名称", "storeId", "城市", "城市ID"];
    const wandaRows = unmatchedWanda.map(w => [
      w.cinemaName || "",
      w.storeId || "",
      w.city_name || "",
      w.city_id || ""
    ]);
    const wandaData = [wandaHeader, ...wandaRows];
    const ws3 = XLSX.utils.aoa_to_sheet(wandaData);
    ws3["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, "未匹配万达影院-参考");
  }

  XLSX.writeFile(wb, outputPath);
  console.log(`   ✅ Excel 已生成: ${path.resolve(outputPath)}`);
}

// ======================== 主流程 ========================

async function main() {
  console.log("========================================");
  console.log("  万达影院编码匹配脚本");
  console.log("========================================");

  const opts = parseArgs();

  console.log(`\n⚙️  配置信息:`);
  console.log(`   映射文件:   ${opts.mapping}`);
  console.log(`   后端地址:   ${opts.backend}`);
  console.log(`   相似度阈值: ${opts.threshold}`);
  console.log(`   输出文件:   ${opts.output}`);

  try {
    // 1. 读取映射文件
    const mappingList = readMappingFile(opts.mapping);
    if (!mappingList.length) {
      console.warn("⚠️  映射文件中没有万达影院的有效记录");
      return;
    }

    // 2. 获取万达官方影院列表
    const wandaList = await fetchWandaCinemaListWithCity(opts.backend);
    if (!wandaList.length) {
      console.warn("⚠️  万达官方未返回影院数据，请检查后端服务");
      return;
    }

    console.log("\n📋 万达官方影院样本（前5条）:");
    wandaList.slice(0, 5).forEach((item, i) => {
      console.log(
        `   ${i + 1}. "${item.cinemaName}"  (storeId: ${item.storeId}, 城市: ${item.city_name || "未知"})`
      );
    });

    // 3. 匹配
    console.log(`\n🔍 正在进行匹配（阈值: ${opts.threshold}）...`);
    const { matched, unmatched, unmatchedWanda } = matchCinemas(
      mappingList,
      wandaList,
      opts.threshold
    );

    console.log("\n========================================");
    console.log("  匹配结果汇总");
    console.log("========================================");
    console.log(`  ✅ 匹配成功:       ${matched.length} 条`);
    console.log(`  ❌ 匹配失败:       ${unmatched.length} 条`);
    console.log(
      `  ℹ️  未匹配万达影院: ${unmatchedWanda.length} 条（官方有但映射文件无对应）`
    );

    if (matched.length > 0) {
      console.log("\n📋 匹配成功明细（前10条）:");
      matched
        .slice(0, 10)
        .forEach(({ mapping, wanda, score, matchType }, i) => {
          console.log(
            `   ${i + 1}. [${matchType}] ` +
              `"${mapping.appName}" ↔ "${wanda.cinemaName}" ` +
              `(plat: ${mapping.cinemaCode}, storeId: ${wanda.storeId})`
          );
        });
    }

    if (unmatched.length > 0) {
      console.log("\n⚠️  匹配失败列表（需人工处理）:");
      unmatched.forEach((item, i) => {
        console.log(
          `   ${i + 1}. "${item.appName}" (code: ${item.cinemaCode}) — ${item._reason}`
        );
      });
    }

    // 4. 生成 Excel
    generateExcel(matched, unmatched, unmatchedWanda, opts.output);

    console.log("\n========================================");
    console.log("  处理完成！");
    console.log("========================================");
    console.log(`\n💡 提示:`);
    console.log(`   1. 打开 "${opts.output}"，查看「匹配成功-可导入」sheet`);
    console.log(
      `   2. 该 sheet 的数据可直接用于「影院编码映射」页面的「导入映射维护信息」功能`
    );
    console.log(`   3. 「匹配失败-需人工处理」sheet 中的记录需要手动核对`);
  } catch (error) {
    console.error("\n❌ 脚本执行失败:", error.message);
    if (error.response) {
      console.error("   HTTP 状态:", error.response.status);
      console.error(
        "   响应内容:",
        JSON.stringify(error.response.data).slice(0, 500)
      );
    }
    process.exit(1);
  }
}

main();
