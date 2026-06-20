#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUTOMATIONS_NAV_PATTERN =
  "e && !l && _\n              ? (0, Z.jsx)(Ca, {";
const AUTOMATIONS_NAV_GATE_ONLY_PATTERN =
  "e && _\n              ? (0, Z.jsx)(Ca, {";
const PATCHED_AUTOMATIONS_NAV = "e\n              ? (0, Z.jsx)(Ca, {";

export function patchWebviewAutomationsNavSource(source) {
  if (source.includes(PATCHED_AUTOMATIONS_NAV)) {
    return source;
  }

  const pattern = source.includes(AUTOMATIONS_NAV_PATTERN)
    ? AUTOMATIONS_NAV_PATTERN
    : AUTOMATIONS_NAV_GATE_ONLY_PATTERN;
  const first = source.indexOf(pattern);
  if (first === -1) {
    throw new Error("Unable to patch Automations navigation visibility");
  }

  const second = source.indexOf(pattern, first + pattern.length);
  if (second !== -1) {
    throw new Error(
      "Expected one Automations navigation condition, found multiple",
    );
  }

  return (
    source.slice(0, first) +
    PATCHED_AUTOMATIONS_NAV +
    source.slice(first + pattern.length)
  );
}

export function patchWebviewAutomationsNavAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^app-main-[\w-]+\.js$/.test(name));

  if (assetName == null) {
    throw new Error("Unable to find app main asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchWebviewAutomationsNavSource(source);

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
  const patchedFiles = patchWebviewAutomationsNavAssets(assetsDir);
  console.log(
    `Patched webview Automations navigation in ${patchedFiles.length} asset(s)`,
  );
}
