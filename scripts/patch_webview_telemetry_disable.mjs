#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STATSIG_OPTIONS_MINIFIED =
  "QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}}";
const STATSIG_OPTIONS_DISABLED_MINIFIED =
  "QP={overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:!0,networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,preventAllNetworkTraffic:!0,networkOverrideFunc:UP}}";
const STATSIG_OPTIONS_FORMATTED =
  /QP\s*=\s*\{\s*networkConfig:\s*\{\s*api:\s*KP,\s*logEventUrl:\s*tP,\s*sdkExceptionUrl:\s*qP,\s*networkOverrideFunc:\s*UP,?\s*\},?\s*\}/;

export function patchWebviewTelemetryDisableSource(source, assetName = "") {
  let patched = source;

  if (
    source.includes("function dP({") ||
    source.includes("Structured analytics disabled")
  ) {
    patched = replaceFirstAvailableByRegex(
      patched,
      [
        {
          pattern:
            /(\bfunction [$A-Za-z_][\w$]*\(\{\s*appVersion\s*:[\s\S]{0,160}?enabled\s*:[\s\S]{0,60}?\}\)\s*\{[\s\S]{0,320}?[,;]\s*)([$A-Za-z_][\w$]*)\s*=\s*[$A-Za-z_][\w$]*\s*&&\s*[$A-Za-z_][\w$]*\s*===\s*`success`\s*&&\s*[$A-Za-z_][\w$]*\s*===\s*!0/,
          replacement: "$1$2=false",
        },
      ],
      /\bfunction [$A-Za-z_][\w$]*\(\{\s*appVersion\s*:[\s\S]{0,160}?enabled\s*:[\s\S]{0,60}?\}\)\s*\{[\s\S]{0,320}?[$A-Za-z_][\w$]*\s*=\s*false/,
      "AnalyticsLogger enabled flag",
    );
    patched = replaceFirstAvailableByRegex(
      patched,
      [
        {
          pattern: /async function hP\(e\)\s*\{/,
          replacement: (match) => `${match}return;`,
        },
        {
          pattern:
            /async function [$A-Za-z_][\w$]*\(e\)\s*\{\s*try\s*\{\s*switch\s*\(e\.eventKind\)\s*\{\s*case\s*`turn_rating`/,
          replacement: (match) => match.replace(/\{\s*try/, "{return;try"),
        },
      ],
      /async function [$A-Za-z_][\w$]*\(e\)\s*\{\s*return;\s*(?:try\s*\{\s*switch\s*\(e\.eventKind\)\s*\{\s*case\s*`turn_rating`)?/,
      "Codex analytics submitter",
    );
    patched = replaceStatsigOptions(patched);
    patched = replaceFirstAvailableByRegex(
      patched,
      [
        {
          pattern: /function eF\(e\)\s*\{/,
          replacement: (match) => `${match}return e.children;`,
        },
        {
          pattern:
            /function [$A-Za-z_][\w$]*\(\{appVersion:[^}]*children:([$A-Za-z_][\w$]*)\}\)\{(?=[\s\S]{0,1800}?StatsigProvider)/,
          replacement: (match, childrenName) => `${match}return ${childrenName};`,
        },
      ],
      /function [$A-Za-z_][\w$]*\((?:e|\{appVersion:[^}]*children:[$A-Za-z_][\w$]*\})\)\s*\{\s*return (?:e\.children|[$A-Za-z_][\w$]*);/,
      "Statsig provider",
    );
  }

  if (
    source.includes("/wham/analytics-events/events") &&
    source.includes("async function")
  ) {
    patched = replaceFirstAvailableByRegex(
      patched,
      [
        {
          pattern: /async function ff\(\{[\s\S]{0,300}?\}\)\s*\{/,
          replacement: (match) => `${match}return false;`,
        },
        {
          pattern:
            /async function [$A-Za-z_][\w$]*\(\{\s*eventType\s*:[\s\S]{0,220}?\}\)\s*\{/,
          replacement: (match) => `${match}return false;`,
        },
      ],
      /async function [$A-Za-z_][\w$]*\(\{\s*(?:eventType\s*:)?[\s\S]{0,300}?\}\)\s*\{\s*return false;/,
      "usage limit analytics submitter",
    );
  }

  return patched;
}

export function patchWebviewTelemetryDisableAssets(assetsDir) {
  const patchedFiles = [];
  let sawAppMain = false;
  let sawComposer = false;

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js")) {
      continue;
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchWebviewTelemetryDisableSource(source, assetName);
    sawAppMain ||= hasAppMainTelemetryDisable(patched);
    sawComposer ||= hasComposerTelemetryDisable(patched);

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  if (!sawAppMain) {
    throw new Error("Unable to disable webview app telemetry");
  }
  if (!sawComposer) {
    throw new Error("Unable to disable webview composer telemetry");
  }

  return patchedFiles;
}

function replaceStatsigOptions(source) {
  if (
    source.includes("overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter")
  ) {
    return source;
  }
  if (source.includes(STATSIG_OPTIONS_MINIFIED)) {
    return source.replace(
      STATSIG_OPTIONS_MINIFIED,
      STATSIG_OPTIONS_DISABLED_MINIFIED,
    );
  }
  return replaceOnceByRegex(
    source,
    STATSIG_OPTIONS_FORMATTED,
    "QP={overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:!0,networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,preventAllNetworkTraffic:!0,networkOverrideFunc:UP}}",
    /QP\s*=\s*\{\s*overrideAdapter:\s*window\.__ELECTRON_SHIM__\.overrideAdapter/,
    "Statsig network options",
  );
}

function replaceOnceByRegex(source, pattern, replacement, marker, label) {
  if (marker.test(source)) {
    return source;
  }
  const matches = [
    ...source.matchAll(
      new RegExp(
        pattern,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
      ),
    ),
  ];
  if (matches.length === 0) {
    throw new Error(`Unable to patch ${label}`);
  }
  if (matches.length > 1) {
    throw new Error(`Expected one ${label}, found multiple`);
  }
  return source.replace(pattern, replacement);
}

function replaceFirstAvailableByRegex(source, replacements, marker, label) {
  if (marker.test(source)) {
    return source;
  }

  const errors = [];
  for (const { pattern, replacement } of replacements) {
    try {
      return replaceOnceByRegex(source, pattern, replacement, marker, label);
    } catch (error) {
      errors.push(error);
    }
  }

  throw errors.at(-1) ?? new Error(`Unable to patch ${label}`);
}

function hasAppMainTelemetryDisable(source) {
  return (
    /\bfunction [$A-Za-z_][\w$]*\(\{\s*appVersion\s*:[\s\S]{0,160}?enabled\s*:[\s\S]{0,60}?\}\)\s*\{[\s\S]{0,320}?[$A-Za-z_][\w$]*\s*=\s*false/.test(
      source,
    ) &&
    /async function [$A-Za-z_][\w$]*\(e\)\s*\{\s*return;/.test(source) &&
    source.includes(
      "overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter",
    ) &&
    /preventAllNetworkTraffic:(?:!0|true)/.test(source) &&
    /function [$A-Za-z_][\w$]*\((?:e|\{appVersion:[^}]*children:[$A-Za-z_][\w$]*\})\)\s*\{\s*return (?:e\.children|[$A-Za-z_][\w$]*);/.test(
      source,
    )
  );
}

function hasComposerTelemetryDisable(source) {
  return /async function [$A-Za-z_][\w$]*\(\{[\s\S]{0,300}?\}\)\s*\{\s*return false;/.test(
    source,
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
  const patchedFiles = patchWebviewTelemetryDisableAssets(assetsDir);
  console.log(`Disabled webview telemetry in ${patchedFiles.length} file(s)`);
}
