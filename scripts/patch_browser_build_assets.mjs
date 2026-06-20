#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchWebviewAssets } from "./patch_webview_assets.mjs";

const REQUIRED_UPSTREAM_ASSET_PATTERNS = Object.freeze([
  /^app-main-[\w-]+\.js$/,
  /^context-menu-[\w-]+\.js$/,
  /^open-target-context-menu-items-[\w-]+\.js$/,
  /^workspace-file-context-menu-[\w-]+\.js$/,
  /^zh-CN-[\w-]+\.js$/,
  /statsig.*\.js$/,
]);

export function hasUpstreamWebviewAssets(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    return false;
  }

  const assetNames = fs.readdirSync(assetsDir);
  return REQUIRED_UPSTREAM_ASSET_PATTERNS.every((pattern) =>
    assetNames.some((assetName) => pattern.test(assetName)),
  );
}

export function patchBrowserBuildAssets(assetsDir) {
  if (!hasUpstreamWebviewAssets(assetsDir)) {
    return [];
  }

  return patchWebviewAssets(assetsDir);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchBrowserBuildAssets(assetsDir);
  console.log(`Patched browser build assets in ${patchedFiles.length} file(s)`);
}
