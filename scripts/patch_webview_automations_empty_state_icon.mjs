#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EMPTY_STATE_TITLE_ID = "inbox.automations.emptyCreateFirst";
const PATCHED_EMPTY_STATE_ICON_SIZE = "size:192";
const AUTOMATIONS_EMPTY_STATE_ICON_CALL_PATTERN =
  /(\(\s*0\s*,\s*[\w$]+\.jsx\s*\)\(\s*[\w$]+\s*,\s*\{)([^{}]*\banimation\s*:\s*`automation`[^{}]*\bshowFallbackWhileLoading\s*:\s*!1[^{}]*|[^{}]*\bshowFallbackWhileLoading\s*:\s*!1[^{}]*\banimation\s*:\s*`automation`[^{}]*)(\}\s*\))/g;
const BAD_EMPTY_STATE_ICON_SIZE_PATTERN =
  /\bsize\s*:\s*(?:`fill`|128)(?=\s*(?:[,})]|$))/;

function findFunctionBounds(source, index) {
  const start = source.lastIndexOf("function ", index);
  if (start === -1) {
    throw new Error("Unable to find Automations empty state function");
  }

  const nextFunction = source.indexOf("function ", index);
  return {
    start,
    end: nextFunction === -1 ? source.length : nextFunction,
  };
}

function hasBadEmptyStateIconSize(source) {
  return (
    /animation\s*:\s*`automation`/.test(source) &&
    /showFallbackWhileLoading\s*:\s*!1/.test(source) &&
    BAD_EMPTY_STATE_ICON_SIZE_PATTERN.test(source)
  );
}

export function patchWebviewAutomationsEmptyStateIconSource(source) {
  const titleIndex = source.indexOf(EMPTY_STATE_TITLE_ID);
  if (titleIndex === -1) {
    throw new Error("Unable to find Automations empty state title");
  }

  const { start, end } = findFunctionBounds(source, titleIndex);
  const before = source.slice(0, start);
  let functionSource = source.slice(start, end);
  const after = source.slice(end);

  const originalFunctionSource = functionSource;

  functionSource = functionSource.replace(
    AUTOMATIONS_EMPTY_STATE_ICON_CALL_PATTERN,
    (match, prefix, props, suffix) => {
      if (!BAD_EMPTY_STATE_ICON_SIZE_PATTERN.test(props)) {
        return match;
      }

      return (
        prefix +
        props.replace(
          BAD_EMPTY_STATE_ICON_SIZE_PATTERN,
          PATCHED_EMPTY_STATE_ICON_SIZE,
        ) +
        suffix
      );
    },
  );

  functionSource = functionSource.replace(
    /,\s*illustrationSize\s*:\s*`hero`/,
    "",
  );

  if (functionSource === originalFunctionSource) {
    if (hasBadEmptyStateIconSize(functionSource)) {
      throw new Error("Unable to patch Automations empty state icon size");
    }

    return source;
  }

  if (hasBadEmptyStateIconSize(functionSource)) {
    throw new Error("Unable to patch Automations empty state icon size");
  }

  if (functionSource.includes("illustrationSize:`hero`")) {
    throw new Error("Unable to fully patch Automations empty state icon");
  }

  if (!functionSource.includes(PATCHED_EMPTY_STATE_ICON_SIZE)) {
    throw new Error("Unable to patch Automations empty state icon size");
  }

  return before + functionSource + after;
}

export function patchWebviewAutomationsEmptyStateIconAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^automations-page-[\w-]+\.js$/.test(name));

  if (assetName == null) {
    throw new Error("Unable to find Automations page asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchWebviewAutomationsEmptyStateIconSource(source);

  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewAutomationsEmptyStateIconAssets(assetsDir);
  console.log(
    `Patched webview Automations empty state icon in ${patchedFiles.length} asset(s)`,
  );
}
