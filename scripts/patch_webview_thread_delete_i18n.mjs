#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ZH_CN_LOCALE_PATTERN = /^zh-CN-[\w-]+\.js$/;
const LOCALE_EXPORT_PATTERN = /,t=\{([\s\S]*)\};export\{t as default/;
const TRANSLATIONS = Object.freeze({
  "threadHeader.deleteThread": "移除对话",
  "threadHeader.deleteThreadError": "无法移除对话",
  "threadHeader.deleteThreadConfirm.title": "移除对话？",
  "threadHeader.deleteThreadConfirm.body": "这会从 Codex 中永久移除该对话。",
  "threadHeader.deleteThreadConfirm.cancel": "取消",
  "threadHeader.deleteThreadConfirm.confirm": "移除",
  "threadHeader.deleteThreadConfirm.removing": "正在移除…",
});

export function patchThreadDeleteZhCnLocaleSource(source) {
  const missingEntries = Object.entries(TRANSLATIONS).filter(
    ([key]) => !source.includes(JSON.stringify(key)),
  );
  if (missingEntries.length === 0) {
    return source;
  }

  const match = LOCALE_EXPORT_PATTERN.exec(source);
  if (!match) {
    throw new Error("Unable to locate zh-CN locale message export");
  }

  const insertion =
    (match[1].trim().length > 0 ? "," : "") +
    missingEntries
      .map(
        ([key, value]) => `${JSON.stringify(key)}:\`${escapeTemplate(value)}\``,
      )
      .join(",");
  const insertAt = match.index + match[0].indexOf("};export");
  return source.slice(0, insertAt) + insertion + source.slice(insertAt);
}

export function patchWebviewThreadDeleteI18nAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => ZH_CN_LOCALE_PATTERN.test(name));
  if (assetName == null) {
    throw new Error("Unable to find zh-CN locale asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchThreadDeleteZhCnLocaleSource(source);
  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

function escapeTemplate(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewThreadDeleteI18nAssets(assetsDir);
  console.log(`Patched thread delete i18n in ${patchedFiles.length} asset(s)`);
}
