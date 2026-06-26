#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ZH_CN_LOCALE_PATTERN = /^zh-CN-[\w-]+\.js$/;
const LOCALE_EXPORT_PATTERN = /export\{([^}]+)\}/;
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

  const defaultExportName = findDefaultExportName(source);
  if (defaultExportName == null) {
    throw new Error("Unable to locate zh-CN locale message export");
  }
  const assignmentNeedle = `${defaultExportName}={`;
  const assignmentIndex = source.indexOf(assignmentNeedle);
  if (assignmentIndex < 0) {
    throw new Error("Unable to locate zh-CN locale message export");
  }
  const objectStart = assignmentIndex + defaultExportName.length + 1;
  const objectEnd = findObjectEnd(source, objectStart);
  if (objectEnd == null) {
    throw new Error("Unable to locate zh-CN locale message export");
  }

  const insertion =
    (source.slice(objectStart + 1, objectEnd).trim().length > 0 ? "," : "") +
    missingEntries
      .map(
        ([key, value]) => `${JSON.stringify(key)}:\`${escapeTemplate(value)}\``,
      )
      .join(",");
  return source.slice(0, objectEnd) + insertion + source.slice(objectEnd);
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

function findDefaultExportName(source) {
  const match = LOCALE_EXPORT_PATTERN.exec(source);
  if (!match) {
    return null;
  }
  for (const exportSpec of match[1].split(",")) {
    const aliasMatch = /^\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*$/.exec(
      exportSpec,
    );
    if (aliasMatch) {
      return aliasMatch[1];
    }
  }
  return null;
}

function findObjectEnd(source, objectStart) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote != null) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
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
