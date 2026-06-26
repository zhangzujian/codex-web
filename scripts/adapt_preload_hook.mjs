#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE_TAG = '<base href="/" />';
const PRELOAD_TAG =
  '<script type="module" src="./assets/preload.js"></script>';
const RENDERER_ALIAS_TRACE_WINDOW = 2000;

export function injectPreloadHookIntoIndexHtml(html) {
  let next = stripPreloadHookFromIndexHtml(html);

  if (next.includes("<!-- PROD_BASE_TAG_HERE -->")) {
    next = next.replace(
      /^(\s*)(<!-- PROD_BASE_TAG_HERE -->)/m,
      (_match, indent, marker) => `${indent}${marker}\n${indent}${BASE_TAG}`,
    );
  } else {
    next = next.replace(
      /^(\s*)(<head[^>]*>)/im,
      (_match, indent, head) => `${indent}${head}\n${indent}  ${BASE_TAG}`,
    );
  }

  if (next.includes("<!-- PROD_CSP_TAG_HERE -->")) {
    next = next.replace(
      /^(\s*)(<!-- PROD_CSP_TAG_HERE -->)/m,
      (_match, indent, marker) => `${indent}${marker}\n${indent}${PRELOAD_TAG}`,
    );
  } else {
    next = next.replace(
      new RegExp(`^(\\s*)${escapeRegExp(BASE_TAG)}`, "m"),
      (_match, indent) => `${indent}${BASE_TAG}\n${indent}${PRELOAD_TAG}`,
    );
  }

  return next;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripPreloadHookFromIndexHtml(html) {
  return html
    .replace(/^\s*<base\s+href="\/"\s*\/>\n?/gm, "")
    .replace(
      /^\s*<script\s+type="module"\s+src="\.\/assets\/preload\.js"><\/script>\n?/gm,
      "",
    );
}

export function preloadSyncChannels(preloadSource) {
  const channelConstants = preloadChannelConstants(preloadSource);
  return preloadCallChannels(preloadSource, "sendSync", channelConstants);
}

function preloadChannelConstants(preloadSource) {
  return new Map(
    [
      ...preloadSource.matchAll(
        /([A-Za-z_$][\w$]*)\s*=\s*`(codex_desktop:[^`]+)`/g,
      ),
    ].map((match) => [match[1], match[2]]),
  );
}

function preloadCallChannels(preloadSource, method, channelConstants) {
  return [
    ...new Set(
      [
        ...preloadSource.matchAll(
          new RegExp(`ipcRenderer\\.${method}\\(([^,)]+)`, "g"),
        ),
      ]
        .map((match) => {
          const arg = match[1].trim();
          const literal = arg.match(/^(?:`([^`]+)`|"([^"]+)")$/);
          return literal ? (literal[1] ?? literal[2]) : channelConstants.get(arg);
        })
        .filter(Boolean),
    ),
  ].sort();
}

function preloadApiMethods(preloadSource, namespace) {
  return [
    ...new Set(
      [...preloadSource.matchAll(new RegExp(`${namespace}\\.([\\w$]+)`, "g"))]
        .map((match) => match[1])
        .filter(Boolean),
    ),
  ].sort();
}

export function extractPreloadRequirements(preloadSource) {
  const channelConstants = preloadChannelConstants(preloadSource);
  return {
    dynamicChannelTemplates: [
      ...new Set(
        [...preloadSource.matchAll(/`(codex_desktop:[^`]*\$\{[^`]+)`/g)].map(
          (match) => match[1].replace(/\$\{[^}]+\}/g, "${}"),
        ),
      ),
    ].sort(),
    electronApis: {
      contextBridge: preloadApiMethods(preloadSource, "contextBridge"),
      ipcRenderer: preloadApiMethods(preloadSource, "ipcRenderer"),
      webUtils: preloadApiMethods(preloadSource, "webUtils"),
    },
    exposedMainWorldKeys: [
      ...new Set(
        [...preloadSource.matchAll(/exposeInMainWorld\((?:`([^`]+)`|"([^"]+)")/g)]
          .map((match) => match[1] ?? match[2])
          .filter(Boolean),
      ),
    ].sort(),
    invokeChannels: preloadCallChannels(preloadSource, "invoke", channelConstants),
    listenerChannels: preloadCallChannels(preloadSource, "on", channelConstants),
    postMessageChannels: preloadCallChannels(
      preloadSource,
      "postMessage",
      channelConstants,
    ),
    processDefines: [
      ...new Set(
        [...preloadSource.matchAll(/\bprocess\.(arch|platform|env\.NODE_ENV)\b/g)]
          .map((match) => `process.${match[1]}`),
      ),
    ].sort(),
    syncChannels: preloadSyncChannels(preloadSource),
  };
}

export function extractPreloadStaticProfile(preloadSource) {
  const channelConstants = preloadChannelConstants(preloadSource);
  const mainWorldExposures = extractMainWorldExposures(preloadSource);
  return {
    channelCalls: ["sendSync", "invoke", "on", "postMessage"]
      .flatMap((kind) =>
        extractIpcRendererCalls(preloadSource, kind, channelConstants),
      )
      .sort((a, b) => a.channel.localeCompare(b.channel) || a.kind.localeCompare(b.kind)),
    electronBridgeMethods: extractElectronBridgeMethods(
      preloadSource,
      mainWorldExposures,
    ),
    mainWorldExposures,
  };
}

function preloadHookAnalysisMethod() {
  return [
    "Generate webview-preload.patch from upstream webview/index.html after stripping any previous generated hook lines.",
    "Extract upstream preload requirements from .vite/build/preload.js: Electron APIs, main-world keys, process defines, sync/invoke/on/postMessage channels, and dynamic worker channel templates.",
    "Extract upstream preload static profile: ipcRenderer call sites, exposed electronBridge methods, and exposeInMainWorld targets.",
    "Trace renderer assets with preload-exposed bridge methods only; direct window.electronBridge calls are trusted, aliases are followed only near their binding and stop on reassignment.",
    "Extract renderer-side interface evidence: bridge method raw arguments, argument counts, literal values, object keys, shared object keys, vscode://codex URLs, message event types, and worker IDs.",
    "Validate the current shim/sync/vite support against extracted upstream requirements; report gaps for human review instead of blindly generating TypeScript shims.",
  ];
}

export function extractRendererAssetStaticProfile(assets, options = {}) {
  const sources = normalizeAssetSources(assets);
  const allowedBridgeMethods =
    options.allowedBridgeMethods?.length > 0
      ? new Set(options.allowedBridgeMethods)
      : null;
  const bridgeMethodCalls = [];
  const messageEventTypes = new Set();
  const sharedObjectKeys = new Set();
  const vscodeUrls = new Set();
  const workerIds = new Set();

  for (const [asset, source] of Object.entries(sources)) {
    const calls = extractBridgeMethodCalls(asset, source, { allowedBridgeMethods });
    bridgeMethodCalls.push(...calls);
    for (const call of calls) {
      const firstArg = splitTopLevel(call.rawArgs)[0]?.trim() ?? "";
      if (call.method === "getSharedObjectSnapshotValue") {
        const key = stringLiteralValue(firstArg);
        if (key) {
          sharedObjectKeys.add(key);
        }
      }
      if (call.method === "sendWorkerMessageFromView") {
        const workerId = stringLiteralValue(firstArg);
        if (workerId) {
          workerIds.add(workerId);
        }
      }
    }
    for (const value of source.matchAll(/\.data\.type\s*={1,3}\s*(?:`([^`]+)`|"([^"]+)")/g)) {
      messageEventTypes.add(value[1] ?? value[2]);
    }
    for (const value of source.matchAll(/(?:`|")(vscode:\/\/codex\/[^`"]+)(?:`|")/g)) {
      vscodeUrls.add(value[1]);
    }
  }

  const sortedBridgeMethodCalls = bridgeMethodCalls.sort(
    (a, b) =>
      a.asset.localeCompare(b.asset) ||
      a.method.localeCompare(b.method) ||
      a.rawArgs.localeCompare(b.rawArgs),
  );

  return {
    bridgeMethodArgumentShapes: sortedBridgeMethodCalls.map((call) => ({
      argCount: splitTopLevel(call.rawArgs).length,
      args: splitTopLevel(call.rawArgs).map(describeExpressionShape),
      method: call.method,
    })),
    bridgeMethodCalls: sortedBridgeMethodCalls,
    messageEventTypes: [...messageEventTypes].sort(),
    sharedObjectKeys: [...sharedObjectKeys].sort(),
    vscodeUrls: [...vscodeUrls].sort(),
    workerIds: [...workerIds].sort(),
  };
}

function normalizeAssetSources(assets) {
  if (typeof assets === "string") {
    if (!fs.existsSync(assets)) {
      return {};
    }
    return Object.fromEntries(
      fs
        .readdirSync(assets)
        .filter((name) => name.endsWith(".js"))
        .map((name) => [name, fs.readFileSync(path.join(assets, name), "utf8")]),
    );
  }
  return assets;
}

function rendererAssetNames(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    return [];
  }
  return fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
}

function extractBridgeMethodCalls(asset, source, { allowedBridgeMethods = null } = {}) {
  const aliases = traceRendererBridgeAliases(source);
  const calls = [];
  const seen = new Set();
  const pushCall = (method, argsStart) => {
    if (allowedBridgeMethods && !allowedBridgeMethods.has(method)) {
      return;
    }
    const argsEnd = findMatchingParen(source, argsStart - 1);
    if (argsEnd === -1) {
      return;
    }
    const rawArgs = source.slice(argsStart, argsEnd);
    const key = `${asset}\0${method}\0${rawArgs}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    calls.push({ asset, method, rawArgs });
  };

  for (const match of source.matchAll(
    /(?:window\.)?electronBridge(?:\?\.|\.)([A-Za-z_$][\w$]*)(?:\?\.)?\(/g,
  )) {
    pushCall(match[1], match.index + match[0].length);
  }

  for (const alias of aliases.objectAliases) {
    const pattern = new RegExp(
      `\\b${escapeRegExp(alias.name)}(?:\\?\\.|\\.)([A-Za-z_$][\\w$]*)(?:\\?\\.)?\\(`,
      "g",
    );
    const [rangeStart, rangeEnd] = rendererAliasSearchRange(
      source,
      alias.name,
      alias.index,
    );
    const segment = source.slice(rangeStart, rangeEnd);
    for (const match of segment.matchAll(pattern)) {
      pushCall(match[1], rangeStart + match.index + match[0].length);
    }
  }

  for (const alias of aliases.methodAliases) {
    const pattern = new RegExp(`\\b${escapeRegExp(alias.name)}\\(`, "g");
    const [rangeStart, rangeEnd] = rendererAliasSearchRange(
      source,
      alias.name,
      alias.index,
    );
    const segment = source.slice(rangeStart, rangeEnd);
    for (const match of segment.matchAll(pattern)) {
      pushCall(alias.method, rangeStart + match.index + match[0].length);
    }
  }
  return calls;
}

function rendererAliasSearchRange(source, alias, index) {
  const maxEnd = Math.min(source.length, index + RENDERER_ALIAS_TRACE_WINDOW);
  let end = maxEnd;
  for (const pattern of [
    new RegExp(`\\b${escapeRegExp(alias)}\\s*=`, "g"),
    new RegExp(`\\b(?:let|const|var)\\s+[^;]*\\b${escapeRegExp(alias)}\\b`, "g"),
  ]) {
    pattern.lastIndex = index + 1;
    const match = pattern.exec(source);
    if (match && match.index < end) {
      end = match.index;
    }
  }
  return [index, end];
}

function describeExpressionShape(expression) {
  const trimmed = expression.trim();
  const literal = stringLiteralValue(trimmed);
  if (literal !== null) {
    return { kind: "string", value: literal };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return { kind: "number", value: trimmed };
  }
  if (trimmed === "true" || trimmed === "false") {
    return { kind: "boolean", value: trimmed };
  }
  if (trimmed === "null" || trimmed === "undefined" || trimmed === "void 0") {
    return { kind: "empty", value: trimmed };
  }
  if (trimmed.startsWith("{")) {
    const end = findMatchingBrace(trimmed, 0);
    const body = end === -1 ? "" : trimmed.slice(1, end);
    return { kind: "object", keys: objectLiteralKeys(body) };
  }
  if (trimmed.startsWith("[")) {
    return { kind: "array", length: splitTopLevel(trimmed.slice(1, -1)).length };
  }
  if (/^(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(trimmed)) {
    return { kind: "function" };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    return { kind: "identifier", name: trimmed };
  }
  return { kind: "expression" };
}

function objectLiteralKeys(body) {
  return splitTopLevel(body)
    .map((entry) => {
      const match = entry.match(
        /^\s*(?:([A-Za-z_$][\w$]*)|`([^`]+)`|"([^"]+)"|'([^']+)')\s*:/,
      );
      return match ? (match[1] ?? match[2] ?? match[3] ?? match[4]) : null;
    })
    .filter(Boolean)
    .sort();
}

function traceRendererBridgeAliases(source) {
  const objectAliases = [];
  const methodAliases = [];

  for (const match of source.matchAll(
    /\b([A-Za-z_$][\w$]*)\s*=\s*window\.electronBridge\b/g,
  )) {
    objectAliases.push({ index: match.index, name: match[1] });
  }

  for (const match of source.matchAll(
    /\b([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?electronBridge(?:\?\.|\.)([A-Za-z_$][\w$]*)\b/g,
  )) {
    methodAliases.push({ index: match.index, method: match[2], name: match[1] });
  }

  for (const match of source.matchAll(/\{([^}]+)\}\s*=\s*window\.electronBridge\b/g)) {
    for (const part of splitTopLevel(match[1])) {
      const [method, alias = method] = part.split(":").map((item) => item.trim());
      if (
        /^[A-Za-z_$][\w$]*$/.test(method) &&
        /^[A-Za-z_$][\w$]*$/.test(alias)
      ) {
        methodAliases.push({ index: match.index, method, name: alias });
      }
    }
  }

  return { methodAliases, objectAliases };
}

function extractIpcRendererCalls(preloadSource, kind, channelConstants) {
  const calls = [];
  const needle = `ipcRenderer.${kind}(`;
  let start = preloadSource.indexOf(needle);
  while (start !== -1) {
    const argsStart = start + needle.length;
    const argsEnd = findMatchingParen(preloadSource, argsStart - 1);
    if (argsEnd === -1) {
      break;
    }
    const rawArgs = preloadSource.slice(argsStart, argsEnd);
    const firstArg = splitTopLevel(rawArgs)[0]?.trim() ?? "";
    const channel = resolveChannelExpression(firstArg, channelConstants);
    if (channel) {
      calls.push({ channel, kind, rawArgs });
    }
    start = preloadSource.indexOf(needle, argsEnd + 1);
  }
  return calls;
}

function extractMainWorldExposures(preloadSource) {
  const exposures = [];
  const needle = "exposeInMainWorld(";
  let start = preloadSource.indexOf(needle);
  while (start !== -1) {
    const argsStart = start + needle.length;
    const argsEnd = findMatchingParen(preloadSource, argsStart - 1);
    if (argsEnd === -1) {
      break;
    }
    const args = splitTopLevel(preloadSource.slice(argsStart, argsEnd));
    const key = stringLiteralValue(args[0]?.trim() ?? "");
    const valueExpression = args[1]?.trim();
    if (key && valueExpression) {
      exposures.push({ key, valueExpression });
    }
    start = preloadSource.indexOf(needle, argsEnd + 1);
  }
  return exposures.sort((a, b) => a.key.localeCompare(b.key));
}

function extractElectronBridgeMethods(preloadSource, exposures) {
  const exposure = exposures.find((item) => item.key === "electronBridge");
  if (!exposure) {
    return [];
  }
  const objectBody = objectBodyForExpression(preloadSource, exposure.valueExpression);
  if (!objectBody) {
    return [];
  }
  return splitTopLevel(objectBody)
    .map((entry) => entry.match(/^\s*([A-Za-z_$][\w$]*)\s*:/)?.[1])
    .filter(Boolean)
    .sort();
}

function objectBodyForExpression(source, expression) {
  if (expression.startsWith("{")) {
    const end = findMatchingBrace(expression, 0);
    return end === -1 ? null : expression.slice(1, end);
  }

  const assignment = new RegExp(`\\b${escapeRegExp(expression)}\\s*=\\s*\\{`, "g");
  const match = assignment.exec(source);
  if (!match) {
    return null;
  }
  const braceStart = match.index + match[0].length - 1;
  const braceEnd = findMatchingBrace(source, braceStart);
  return braceEnd === -1 ? null : source.slice(braceStart + 1, braceEnd);
}

function resolveChannelExpression(expression, channelConstants) {
  return stringLiteralValue(expression) ?? channelConstants.get(expression) ?? null;
}

function stringLiteralValue(expression) {
  const literal = expression.match(/^(?:`([^`]+)`|"([^"]+)"|'([^']+)')$/);
  return literal ? (literal[1] ?? literal[2] ?? literal[3]) : null;
}

function findMatchingParen(source, openIndex) {
  return findMatchingDelimiter(source, openIndex, "(", ")");
}

function findMatchingBrace(source, openIndex) {
  return findMatchingDelimiter(source, openIndex, "{", "}");
}

function findMatchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "`" || char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
      continue;
    }
    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitTopLevel(source) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "`" || char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (
      char === "," &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function validatePreloadHookSupport({
  projectRoot = process.cwd(),
  requirements,
} = {}) {
  const syncIpc = readProjectFile(projectRoot, "src/browser/sync-ipc.mts");
  const shim = readProjectFile(projectRoot, "src/browser/shim.ts");
  const viteConfig = readProjectFile(projectRoot, "vite.browser.config.ts");
  const shimApis = {
    contextBridge: exportedObjectMethods(shim, "contextBridge"),
    ipcRenderer: exportedObjectMethods(shim, "ipcRenderer"),
    webUtils: exportedObjectMethods(shim, "webUtils"),
  };

  const missingSyncChannels = requirements.syncChannels.filter(
    (channel) => !syncIpc.includes(channel),
  );
  const missingElectronApis = Object.entries(requirements.electronApis).flatMap(
    ([namespace, methods]) =>
      methods
        .filter((method) => !shimApis[namespace]?.has(method))
        .map((method) => `${namespace}.${method}`),
  );
  const missingProcessDefines = requirements.processDefines.filter(
    (define) => !viteConfig.includes(`"${define}"`),
  );

  return {
    missingElectronApis,
    missingProcessDefines,
    missingSyncChannels,
    ok:
      missingElectronApis.length === 0 &&
      missingProcessDefines.length === 0 &&
      missingSyncChannels.length === 0,
  };
}

function readProjectFile(projectRoot, relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function exportedObjectMethods(source, exportName) {
  const objectBody = objectBodyForExpression(source, exportName);
  if (!objectBody) {
    return new Set();
  }
  return new Set(
    splitTopLevel(objectBody)
      .map((entry) =>
        entry.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:[:(])/)?.[1],
      )
      .filter(Boolean),
  );
}

export function generatePreloadHookPatch({
  asarDir = path.join(process.cwd(), "scratch", "asar"),
  patchPath = path.join(process.cwd(), "patches", "webview-preload.patch"),
  reportPath = path.join(process.cwd(), "scratch", "preload-hook-report.json"),
} = {}) {
  const indexPath = path.join(asarDir, "webview", "index.html");
  const preloadPath = path.join(asarDir, ".vite", "build", "preload.js");
  const rendererAssetsDir = path.join(asarDir, "webview", "assets");

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing upstream webview index: ${indexPath}`);
  }
  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Missing upstream preload artifact: ${preloadPath}`);
  }
  if (rendererAssetNames(rendererAssetsDir).length === 0) {
    throw new Error(`Missing upstream renderer assets: ${rendererAssetsDir}`);
  }

  const originalHtml = stripPreloadHookFromIndexHtml(
    fs.readFileSync(indexPath, "utf8"),
  );
  const patchedHtml = injectPreloadHookIntoIndexHtml(originalHtml);
  const preloadSource = fs.readFileSync(preloadPath, "utf8");
  const requirements = extractPreloadRequirements(preloadSource);
  const staticProfile = extractPreloadStaticProfile(preloadSource);
  const rendererAssetProfile = extractRendererAssetStaticProfile(
    rendererAssetsDir,
    { allowedBridgeMethods: staticProfile.electronBridgeMethods },
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-preload-hook-"));

  try {
    const before = path.join(tmpDir, "before.html");
    const after = path.join(tmpDir, "after.html");
    fs.writeFileSync(before, originalHtml);
    fs.writeFileSync(after, patchedHtml);

    const diff = spawnSync(
      "diff",
      [
        "-u",
        "--label",
        "a/webview/index.html",
        "--label",
        "b/webview/index.html",
        before,
        after,
      ],
      { encoding: "utf8" },
    );

    if (diff.status !== 1) {
      throw new Error(diff.stderr || "Unable to generate preload hook patch");
    }

    fs.mkdirSync(path.dirname(patchPath), { recursive: true });
    fs.writeFileSync(patchPath, diff.stdout);

    const result = {
      analysisMethod: preloadHookAnalysisMethod(),
      patchPath,
      preloadPath,
      reportPath,
      requirements,
      rendererAssetProfile,
      staticProfile,
      support: validatePreloadHookSupport({ requirements }),
      syncChannels: requirements.syncChannels,
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  }
}

function printResult(result) {
  console.log(`wrote ${result.patchPath}`);
  console.log(`wrote ${result.reportPath}`);
  console.log(`upstream preload: ${result.preloadPath}`);
  console.log("");
  console.log("static analysis method:");
  for (const item of result.analysisMethod) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log("current preload shim support:");
  console.log(`ok: ${result.support.ok}`);
  for (const [key, values] of Object.entries(result.support)) {
    if (key !== "ok" && values.length > 0) {
      console.log(`${key}: ${values.join(", ")}`);
    }
  }
  console.log(
    `renderer bridge calls: ${result.rendererAssetProfile.bridgeMethodCalls.length}`,
  );
  if (!result.support.ok) {
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log("covered sync channels:");
  for (const channel of result.requirements.syncChannels) {
    console.log(`- ${channel}`);
  }
}

function main(argv) {
  const asarDir = argv[2] ?? path.join(process.cwd(), "scratch", "asar");
  const patchPath =
    argv[3] ?? path.join(process.cwd(), "patches", "webview-preload.patch");
  const reportPath =
    argv[4] ?? path.join(process.cwd(), "scratch", "preload-hook-report.json");
  printResult(generatePreloadHookPatch({ asarDir, patchPath, reportPath }));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  main(process.argv);
}
