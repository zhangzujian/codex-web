#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchBrowserPanelIframeAsset } from "./patch_browser_panel_iframe.mjs";
import { patchTerminalSidePanelSupport } from "./patch_terminal_side_panel.mjs";

const STATSIG_OPTIONS_PATTERN =
  /(\b[$A-Za-z_][\w$]*\s*=\s*)\{\s*networkConfig\s*:\s*\{\s*api\s*:\s*([^,}]+?)\s*,\s*logEventUrl\s*:\s*([^,}]+?)\s*,\s*sdkExceptionUrl\s*:\s*([^,}]+?)\s*,\s*networkOverrideFunc\s*:\s*([^,}]+?)\s*,?\s*\}\s*,?\s*\}/s;
const PATCHED_STATSIG_OPTIONS_PATTERN =
  /\b[$A-Za-z_][\w$]*\s*=\s*\{\s*overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,\s*disableLogging\s*:\s*true\s*,\s*networkConfig\s*:\s*\{(?=[^}]*\bapi\s*:)(?=[^}]*\blogEventUrl\s*:)(?=[^}]*\bsdkExceptionUrl\s*:)(?=[^}]*\bpreventAllNetworkTraffic\s*:\s*true)(?=[^}]*\bnetworkOverrideFunc\s*:)[^}]*\}/s;
const PARTIAL_PATCHED_STATSIG_OPTIONS_PATTERN =
  /\b[$A-Za-z_][\w$]*\s*=\s*\{\s*overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,\s*networkConfig\s*:\s*\{(?=[^}]*\bapi\s*:)(?=[^}]*\blogEventUrl\s*:)(?=[^}]*\bsdkExceptionUrl\s*:)(?=[^}]*\bpreventAllNetworkTraffic\s*:\s*true)(?=[^}]*\bnetworkOverrideFunc\s*:)[^}]*\}/s;

export function patchWebviewAssets(assetsDir) {
  const patchedFiles = [
    // ponytail: keep only browser access plumbing; no desktop UI/UX asset rewrites.
    ...patchTerminalSidePanelSupport(assetsDir),
    patchBrowserPanelIframeAsset(assetsDir),
    patchStatsigTelemetryDisableAsset(assetsDir),
    ...patchInvalidCssPropertyInitialValuesAsset(assetsDir),
  ];

  return [...new Set(patchedFiles)];
}

export function patchInvalidCssPropertyInitialValuesSupport(source) {
  return source.replace(
    /(@property\s+--edge-fade-distance\s*\{\s*syntax:"<length>";\s*inherits:false;\s*initial-value:)1rem(\s*\})/g,
    "$116px$2",
  );
}

export function patchInvalidCssPropertyInitialValuesAsset(assetsDir) {
  const patchedFiles = [];
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith(".css")) {
      continue;
    }
    const assetPath = path.join(assetsDir, name);
    const source = fs.readFileSync(assetPath, "utf8");
    if (!source.includes("@property --edge-fade-distance")) {
      continue;
    }
    const patched = patchInvalidCssPropertyInitialValuesSupport(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    patchedFiles.push(assetPath);
  }
  return patchedFiles;
}

export function patchStatsigTelemetryDisableSupport(source) {
  if (PATCHED_STATSIG_OPTIONS_PATTERN.test(source)) {
    return source;
  }
  if (
    !/disableLogging\s*:\s*true/.test(source) &&
    PARTIAL_PATCHED_STATSIG_OPTIONS_PATTERN.test(source)
  ) {
    const patched = source.replace(
      /(overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,?)/,
      "$1disableLogging:true,",
    );
    if (patched !== source) {
      return patched;
    }
  }
  if (!STATSIG_OPTIONS_PATTERN.test(source)) {
    throw new Error("Statsig init options not found");
  }
  return source.replace(
    STATSIG_OPTIONS_PATTERN,
    (_match, prefix, api, logEventUrl, sdkExceptionUrl, networkOverrideFunc) =>
      `${prefix}{overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:true,networkConfig:{api:${api.trim()},logEventUrl:${logEventUrl.trim()},sdkExceptionUrl:${sdkExceptionUrl.trim()},preventAllNetworkTraffic:true,networkOverrideFunc:${networkOverrideFunc.trim()}}}`,
  );
}

export function patchStatsigTelemetryDisableAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) =>
      fs.readFileSync(assetPath, "utf8").includes("networkOverrideFunc"),
    );

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchStatsigTelemetryDisableSupport(source);
    } catch {
      continue;
    }
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      return assetPath;
    }
    return assetPath;
  }

  throw new Error(`Statsig asset not found in ${assetsDir}`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewAssets(assetsDir);
  console.log(`Patched webview assets in ${patchedFiles.length} file(s)`);
}
