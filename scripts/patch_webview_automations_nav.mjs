#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUTOMATIONS_NAV_PATTERN =
  "e && !l && _\n              ? (0, Z.jsx)(Ca, {";
const AUTOMATIONS_NAV_GATE_ONLY_PATTERN =
  "e && _\n              ? (0, Z.jsx)(Ca, {";
const AUTOMATIONS_NAV_MINIFIED_PATTERN = "e&&!l&&_?(0,Z.jsx)(Ca,{";
const AUTOMATIONS_NAV_MINIFIED_GATE_ONLY_PATTERN = "e&&_?(0,Z.jsx)(Ca,{";
const MODERN_AUTOMATIONS_NAV_MINIFIED_PATTERN =
  "t&&!c&&l&&n===`codex`?(0,TN.jsx)(rS,{";
const PATCHED_AUTOMATIONS_NAV = "e\n              ? (0, Z.jsx)(Ca, {";
const PATCHED_AUTOMATIONS_NAV_MINIFIED = "e?(0,Z.jsx)(Ca,{";
const PATCHED_MODERN_AUTOMATIONS_NAV_MINIFIED = "t?(0,TN.jsx)(rS,{";
const CURRENT_AUTOMATIONS_NAV_PATTERN =
  /([$A-Za-z_][\w$]*)&&![$A-Za-z_][\w$]*&&[$A-Za-z_][\w$]*&&[$A-Za-z_][\w$]*===`codex`\?\(0,([$A-Za-z_][\w$]*)\.jsx\)\(([$A-Za-z_][\w$]*),\{/;

export function patchWebviewAutomationsNavSource(source) {
  if (
    source.includes(PATCHED_AUTOMATIONS_NAV) ||
    source.includes(PATCHED_AUTOMATIONS_NAV_MINIFIED) ||
    source.includes(PATCHED_MODERN_AUTOMATIONS_NAV_MINIFIED) ||
    /(^|[^&$A-Za-z_])[$A-Za-z_][\w$]*\?\(0,[$A-Za-z_][\w$]*\.jsx\)\([$A-Za-z_][\w$]*,\{items:\[\{id:`mark-all-read`/.test(
      source,
    )
  ) {
    return source;
  }

  const currentMatches = [
    ...source.matchAll(new RegExp(CURRENT_AUTOMATIONS_NAV_PATTERN, "g")),
  ];
  if (currentMatches.length === 1) {
    const [match, gate, jsxNamespace, menuComponent] = currentMatches[0];
    return source.replace(
      match,
      `${gate}?(0,${jsxNamespace}.jsx)(${menuComponent},{`,
    );
  }
  if (currentMatches.length > 1) {
    throw new Error(
      "Expected one Automations navigation condition, found multiple",
    );
  }

  const replacements = [
    [AUTOMATIONS_NAV_PATTERN, PATCHED_AUTOMATIONS_NAV],
    [AUTOMATIONS_NAV_GATE_ONLY_PATTERN, PATCHED_AUTOMATIONS_NAV],
    [AUTOMATIONS_NAV_MINIFIED_PATTERN, PATCHED_AUTOMATIONS_NAV_MINIFIED],
    [
      AUTOMATIONS_NAV_MINIFIED_GATE_ONLY_PATTERN,
      PATCHED_AUTOMATIONS_NAV_MINIFIED,
    ],
    [
      MODERN_AUTOMATIONS_NAV_MINIFIED_PATTERN,
      PATCHED_MODERN_AUTOMATIONS_NAV_MINIFIED,
    ],
  ];
  const replacement = replacements.find(([pattern]) =>
    source.includes(pattern),
  );
  if (replacement == null) {
    throw new Error("Unable to patch Automations navigation visibility");
  }

  const [pattern, patchedPattern] = replacement;
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
    patchedPattern +
    source.slice(first + pattern.length)
  );
}

export function patchWebviewAutomationsNavAssets(assetsDir) {
  const assetNames = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => {
      if (/^app-main-[\w-]+\.js$/.test(name)) {
        return true;
      }
      const source = fs.readFileSync(path.join(assetsDir, name), "utf8");
      return (
        source.includes("sidebarElectron.inboxRouteNavLink") &&
        source.includes("mark-all-read")
      );
    });

  if (assetNames.length === 0) {
    throw new Error("Unable to find app main asset");
  }

  const matches = [];
  for (const assetName of assetNames) {
    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchWebviewAutomationsNavSource(source);
    } catch (error) {
      if (!source.includes("sidebarElectron.inboxRouteNavLink")) {
        continue;
      }
      throw error;
    }
    matches.push({ assetPath, patched, source });
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Unable to find Automations navigation asset"
        : `Expected one Automations navigation asset, found ${matches.length}`,
    );
  }

  const [{ assetPath, patched, source }] = matches;
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
    return [assetPath];
  }

  return [];
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
