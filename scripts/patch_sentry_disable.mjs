#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SENTRY_INIT_PATTERNS = [
  /(?<prefix>\b[A-Za-z_$][\w$]*\(\{\s*)(?<rest>dsn:[\s\S]{0,300}?environment:[\s\S]{0,300}?release:)/g,
  /(?<prefix>\b[A-Za-z_$][\w$]*\(\{\s*)(?<rest>beforeSend:[\s\S]{0,300}?dsn:[\s\S]{0,300}?environment:[\s\S]{0,300}?release:)/g,
];

const DISABLED_SENTRY_INIT_PATTERN =
  /\b[A-Za-z_$][\w$]*\(\{\s*enabled:\s*!1,\s*(?:dsn:|beforeSend:[\s\S]{0,300}?dsn:)[\s\S]{0,300}?environment:[\s\S]{0,300}?release:/;

export function patchSentryDisableSource(source, label = "Sentry init") {
  if (DISABLED_SENTRY_INIT_PATTERN.test(source)) {
    return source;
  }

  const matches = [];
  for (const pattern of SENTRY_INIT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      matches.push(match);
    }
  }

  if (matches.length === 0) {
    throw new Error(`Unable to find ${label}`);
  }

  if (matches.length > 1) {
    throw new Error(`Expected one ${label}, found multiple`);
  }

  const match = matches[0];
  const prefix = match.groups.prefix;
  const rest = match.groups.rest;
  return (
    source.slice(0, match.index) +
    prefix +
    "enabled: !1," +
    rest +
    source.slice(match.index + match[0].length)
  );
}

export function findSentryDisableTargets(asarRoot) {
  const buildDir = path.join(asarRoot, ".vite/build");
  const webviewAssetsDir = path.join(asarRoot, "webview/assets");
  const targets = [];

  const workerPath = path.join(buildDir, "worker.js");
  if (fs.existsSync(workerPath)) {
    targets.push(workerPath);
  }

  if (fs.existsSync(buildDir)) {
    for (const name of fs.readdirSync(buildDir)) {
      if (!/^workspace-root-drop-handler-[\w-]+\.js$/.test(name)) {
        continue;
      }
      const filePath = path.join(buildDir, name);
      const source = fs.readFileSync(filePath, "utf8");
      if (source.includes("buildFlavor") && source.includes("dsn:")) {
        targets.push(filePath);
      }
    }
  }

  if (fs.existsSync(webviewAssetsDir)) {
    for (const name of fs.readdirSync(webviewAssetsDir)) {
      if (!/^error-boundary-[\w-]+\.js$/.test(name)) {
        continue;
      }
      const filePath = path.join(webviewAssetsDir, name);
      const source = fs.readFileSync(filePath, "utf8");
      if (source.includes("beforeSend") && source.includes("dsn:")) {
        targets.push(filePath);
      }
    }
  }

  return [...new Set(targets)];
}

export function patchSentryDisableAssets(asarRoot) {
  const targets = findSentryDisableTargets(asarRoot);
  if (targets.length === 0) {
    throw new Error(`No Sentry assets found in ${asarRoot}`);
  }

  const patchedFiles = [];
  for (const filePath of targets) {
    const source = fs.readFileSync(filePath, "utf8");
    const patched = patchSentryDisableSource(source, path.basename(filePath));
    if (patched !== source) {
      fs.writeFileSync(filePath, patched);
      patchedFiles.push(filePath);
    }
  }

  return patchedFiles;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const asarRoot = process.argv[2] ?? path.join(workspaceRoot, "scratch/asar");
  const patchedFiles = patchSentryDisableAssets(asarRoot);
  console.log(`Disabled Sentry in ${patchedFiles.length} file(s)`);
}
