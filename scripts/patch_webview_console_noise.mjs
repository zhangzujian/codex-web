#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STATSIG_NOOP_WARNING =
  "(0,i.isNoopClient)(e)?(r.Log.warn(`Attempting to retrieve a StatsigClient but none was set.`),i.NoopEvaluationsClient):e";
const STATSIG_NOOP_SILENT = "(0,i.isNoopClient)(e)?i.NoopEvaluationsClient:e";

export function patchWebviewConsoleNoiseSource(source, assetName = "") {
  let patched = source;

  if (
    assetName.includes("statsig") ||
    patched.includes("Attempting to retrieve a StatsigClient")
  ) {
    patched = replaceOnceIfPresent(
      patched,
      STATSIG_NOOP_WARNING,
      STATSIG_NOOP_SILENT,
    );
  }

  return patched;
}

export function patchWebviewConsoleNoiseAssets(assetsDir) {
  const patchedFiles = [];
  let sawStatsigHook = false;

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js")) {
      continue;
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchWebviewConsoleNoiseSource(source, assetName);

    sawStatsigHook ||=
      hasStatsigHookPatch(source) || hasStatsigHookPatch(patched);

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  if (!sawStatsigHook) {
    throw new Error("Unable to patch Statsig Noop client warning");
  }

  return patchedFiles;
}

function replaceOnceIfPresent(source, before, after) {
  const first = source.indexOf(before);
  if (first === -1) {
    return source;
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    throw new Error(`Expected one Statsig warning hook, found multiple`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function hasStatsigHookPatch(source) {
  return (
    source.includes(STATSIG_NOOP_WARNING) ||
    source.includes(STATSIG_NOOP_SILENT)
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewConsoleNoiseAssets(assetsDir);
  console.log(
    `Patched webview console noise in ${patchedFiles.length} asset(s)`,
  );
}
