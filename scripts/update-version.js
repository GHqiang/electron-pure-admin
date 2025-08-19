#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置文件路径
const configPath = path.resolve(__dirname, "../public/platform-config.json");
const packagePath = path.resolve(__dirname, "../package.json");

// 读取配置文件
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

// 解析版本号
const versionParts = config.Version.split(".").map(Number);

// 增加最后一位版本号
versionParts[versionParts.length - 1] += 1;

// 更新版本号
const newVersion = versionParts.join(".");
config.Version = newVersion;
pkg.version = newVersion; // 同时更新 package.json

// 写入更新后的配置
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2), "utf8");

console.log(`✅ 版本号已更新至 ${newVersion}`);
