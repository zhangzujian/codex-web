#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE_TAG = '<base href="/" />';
const PRELOAD_TAG = '<script type="module" src="./assets/preload.js"></script>';
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
          return literal
            ? (literal[1] ?? literal[2])
            : channelConstants.get(arg);
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
        [
          ...preloadSource.matchAll(
            /exposeInMainWorld\((?:`([^`]+)`|"([^"]+)")/g,
          ),
        ]
          .map((match) => match[1] ?? match[2])
          .filter(Boolean),
      ),
    ].sort(),
    invokeChannels: preloadCallChannels(
      preloadSource,
      "invoke",
      channelConstants,
    ),
    listenerChannels: preloadCallChannels(
      preloadSource,
      "on",
      channelConstants,
    ),
    postMessageChannels: preloadCallChannels(
      preloadSource,
      "postMessage",
      channelConstants,
    ),
    processDefines: [
      ...new Set(
        [
          ...preloadSource.matchAll(
            /\bprocess\.(arch|platform|env\.NODE_ENV)\b/g,
          ),
        ].map((match) => `process.${match[1]}`),
      ),
    ].sort(),
    syncChannels: preloadSyncChannels(preloadSource),
  };
}

export function extractPreloadStaticProfile(preloadSource) {
  const channelConstants = preloadChannelConstants(preloadSource);
  const definitions = valueDefinitions(preloadSource);
  const mainWorldExposures = extractMainWorldExposures(preloadSource);
  return {
    channelCalls: ["sendSync", "invoke", "on", "postMessage"]
      .flatMap((kind) =>
        extractIpcRendererCalls(preloadSource, kind, channelConstants),
      )
      .sort(
        (a, b) =>
          a.channel.localeCompare(b.channel) || a.kind.localeCompare(b.kind),
      ),
    electronBridgeContracts: extractElectronBridgeContracts(
      preloadSource,
      mainWorldExposures,
      channelConstants,
      definitions,
    ),
    electronBridgeMethods: extractElectronBridgeMethods(
      preloadSource,
      mainWorldExposures,
    ),
    ipcContracts: ["sendSync", "invoke", "on", "postMessage"]
      .flatMap((kind) =>
        extractIpcRendererContracts(preloadSource, kind, channelConstants, {
          definitions,
        }),
      )
      .sort(
        (a, b) =>
          a.channel.localeCompare(b.channel) || a.kind.localeCompare(b.kind),
      ),
    mainWorldExposures,
  };
}

function preloadHookAnalysisMethod() {
  return [
    "Generate webview-preload.patch from upstream webview/index.html after stripping any previous generated hook lines.",
    "Extract upstream preload requirements from .vite/build/preload.js: Electron APIs, main-world keys, process defines, sync/invoke/on/postMessage channels, and dynamic worker channel templates.",
    "Extract upstream preload static profile: ipcRenderer call sites, payload shapes, local value definitions, exposed electronBridge method contracts, and exposeInMainWorld targets.",
    "Trace renderer assets with preload-exposed bridge methods only; direct window.electronBridge calls are trusted, aliases are followed only near their binding and stop on reassignment.",
    "Extract renderer-side interface evidence: bridge method raw arguments, argument counts, literal values, object keys, return-value field reads, message payload keys, shared object keys, vscode://codex URLs, message event types, worker IDs, and unresolved expressions.",
    "Validate the current shim/sync/vite support and static contract review against extracted upstream requirements; report gaps for human review instead of blindly generating TypeScript shims.",
  ];
}

export function extractRendererAssetStaticProfile(assets, options = {}) {
  const sources = normalizeAssetSources(assets);
  const allowedBridgeMethods =
    options.allowedBridgeMethods?.length > 0
      ? new Set(options.allowedBridgeMethods)
      : null;
  const mainWorldKeys =
    options.mainWorldKeys?.length > 0 ? new Set(options.mainWorldKeys) : null;
  const bridgeMethodCalls = [];
  const bridgeReturnUsages = [];
  const eventPayloadKeys = new Set();
  const mainWorldKeyUsages = [];
  const messageEventTypes = new Set();
  const sharedObjectKeys = new Set();
  const unsupportedBridgeMethodCalls = [];
  const unknownBridgeArguments = [];
  const vscodeUrls = new Set();
  const workerIds = new Set();

  for (const [asset, source] of Object.entries(sources)) {
    const allCalls = extractBridgeMethodCalls(asset, source);
    const calls = allowedBridgeMethods
      ? allCalls.filter((call) => allowedBridgeMethods.has(call.method))
      : allCalls;
    const messageHandlers = extractMessageEventHandlers(source);
    bridgeMethodCalls.push(...calls);
    if (allowedBridgeMethods) {
      unsupportedBridgeMethodCalls.push(
        ...allCalls
          .filter((call) => !allowedBridgeMethods.has(call.method))
          .map(publicBridgeMethodCall),
      );
    }
    bridgeReturnUsages.push(...extractBridgeReturnUsages(source, calls));
    for (const call of calls) {
      const args = splitTopLevel(call.rawArgs);
      const firstArg = args[0]?.trim() ?? "";
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
      args
        .map((arg) => describeRendererArgumentShape(source, call, arg))
        .forEach((shape, index) => {
          if (shape.kind === "expression" || shape.kind === "identifier") {
            unknownBridgeArguments.push({
              argIndex: index,
              asset,
              expression: args[index],
              kind: shape.kind,
              method: call.method,
            });
          }
        });
    }
    for (const key of extractMessageEventPayloadKeys(source)) {
      eventPayloadKeys.add(key);
    }
    for (const handler of messageHandlers) {
      for (const value of handler.matchAll(
        /\.data\.type\s*={1,3}\s*(?:`([^`]+)`|"([^"]+)")/g,
      )) {
        messageEventTypes.add(value[1] ?? value[2]);
      }
    }
    for (const value of source.matchAll(
      /(?:`|")(vscode:\/\/codex\/[^`"]+)(?:`|")/g,
    )) {
      vscodeUrls.add(value[1]);
    }
    mainWorldKeyUsages.push(
      ...extractMainWorldKeyUsages(asset, source, mainWorldKeys),
    );
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
      args: splitTopLevel(call.rawArgs).map((arg) =>
        describeRendererArgumentShape(sources[call.asset], call, arg),
      ),
      method: call.method,
    })),
    bridgeMethodObjectArgumentFields: sortedBridgeMethodCalls.flatMap(
      bridgeMethodObjectArgumentFields,
    ),
    bridgeMethodCalls: sortedBridgeMethodCalls.map(publicBridgeMethodCall),
    bridgeReturnUsages: bridgeReturnUsages
      .filter(
        (usage) => usage.fieldReads.length > 0 || usage.useKinds.length > 0,
      )
      .sort(
        (a, b) =>
          a.asset.localeCompare(b.asset) ||
          a.method.localeCompare(b.method) ||
          (a.assignedTo ?? "").localeCompare(b.assignedTo ?? ""),
      ),
    eventPayloadKeys: [...eventPayloadKeys].sort(),
    mainWorldKeyUsages: mainWorldKeyUsages.sort(
      (a, b) =>
        a.asset.localeCompare(b.asset) ||
        a.key.localeCompare(b.key) ||
        a.property.localeCompare(b.property),
    ),
    messageEventTypes: [...messageEventTypes].sort(),
    sharedObjectKeys: [...sharedObjectKeys].sort(),
    unsupportedBridgeMethodCalls: unsupportedBridgeMethodCalls.sort(
      (a, b) =>
        a.asset.localeCompare(b.asset) ||
        a.method.localeCompare(b.method) ||
        a.rawArgs.localeCompare(b.rawArgs),
    ),
    unknownBridgeArguments: unknownBridgeArguments.sort(
      (a, b) =>
        a.asset.localeCompare(b.asset) ||
        a.method.localeCompare(b.method) ||
        a.argIndex - b.argIndex ||
        a.expression.localeCompare(b.expression),
    ),
    vscodeUrls: [...vscodeUrls].sort(),
    workerIds: [...workerIds].sort(),
  };
}

function bridgeMethodObjectArgumentFields(call) {
  return splitTopLevel(call.rawArgs).flatMap((arg, index) => {
    const trimmed = arg.trim();
    if (!trimmed.startsWith("{")) {
      return [];
    }
    const bodyEnd = findMatchingBrace(trimmed, 0);
    if (bodyEnd === -1) {
      return [];
    }
    return [
      {
        argIndex: index,
        asset: call.asset,
        fields: objectLiteralFieldContracts(trimmed.slice(1, bodyEnd)),
        method: call.method,
      },
    ];
  });
}

function objectLiteralFieldContracts(body) {
  return splitTopLevel(body)
    .map((entry) => {
      const match = entry.match(
        /^\s*(?:([A-Za-z_$][\w$]*)|`([^`]+)`|"([^"]+)"|'([^']+)')\s*:\s*(.+)$/s,
      );
      if (!match) {
        return null;
      }
      const value = match[5].trim();
      return {
        key: match[1] ?? match[2] ?? match[3] ?? match[4],
        jsonStringifyObjectKeys: jsonStringifyObjectKeys(value),
        valueShape: describeExpressionShape(value),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function jsonStringifyObjectKeys(expression) {
  const prefix = "JSON.stringify(";
  if (!expression.startsWith(prefix)) {
    return [];
  }
  const argsStart = prefix.length;
  const argsEnd = findMatchingParen(expression, argsStart - 1);
  if (argsEnd === -1) {
    return [];
  }
  const firstArg = splitTopLevel(expression.slice(argsStart, argsEnd))[0] ?? "";
  if (!firstArg.trim().startsWith("{")) {
    return [];
  }
  const bodyEnd = findMatchingBrace(firstArg.trim(), 0);
  return bodyEnd === -1
    ? []
    : objectLiteralKeys(firstArg.trim().slice(1, bodyEnd));
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
        .map((name) => [
          name,
          fs.readFileSync(path.join(assets, name), "utf8"),
        ]),
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

function extractBridgeMethodCalls(
  asset,
  source,
  { allowedBridgeMethods = null } = {},
) {
  const aliases = traceRendererBridgeAliases(source);
  const calls = [];
  const seen = new Set();
  const pushCall = (method, calleeStart, argsStart) => {
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
    calls.push({ argsEnd, argsStart, asset, calleeStart, method, rawArgs });
  };

  for (const match of source.matchAll(
    /(?:window\.)?electronBridge(?:\?\.|\.)([A-Za-z_$][\w$]*)(?:\?\.)?\(/g,
  )) {
    pushCall(match[1], match.index, match.index + match[0].length);
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
      pushCall(
        match[1],
        rangeStart + match.index,
        rangeStart + match.index + match[0].length,
      );
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
      pushCall(
        alias.method,
        rangeStart + match.index,
        rangeStart + match.index + match[0].length,
      );
    }
  }
  return calls;
}

function publicBridgeMethodCall(call) {
  return {
    asset: call.asset,
    method: call.method,
    rawArgs: call.rawArgs,
  };
}

function extractBridgeReturnUsages(source, calls) {
  return calls.map((call) => {
    const before = source.slice(
      Math.max(0, call.calleeStart - 120),
      call.calleeStart,
    );
    const after = source.slice(call.argsEnd + 1, call.argsEnd + 1200);
    const assignment = before.match(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s*)?$/,
    );
    const awaited = /\bawait\s*$/.test(before);
    const chainedFieldReads = [
      ...after.matchAll(/^(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g),
    ]
      .map((match) => match[1])
      .filter((field) => !["catch", "finally", "then"].includes(field));
    const thenMatch = after.match(
      /^\.then\(\s*(?:\(?\s*([A-Za-z_$][\w$]*)[^=)]*\)?\s*=>\s*)/,
    );
    const thenFieldReads = thenMatch
      ? variableFieldReads(after.slice(0, 600), thenMatch[1])
      : [];
    const assignedFieldReads = assignment
      ? variableFieldReads(
          source.slice(
            call.argsEnd + 1,
            reassignmentIndex(source, assignment[1], call.argsEnd + 1),
          ),
          assignment[1],
        )
      : [];

    return {
      asset: call.asset,
      assignedTo: assignment?.[1] ?? null,
      awaited,
      fieldReads: [
        ...new Set([
          ...chainedFieldReads,
          ...thenFieldReads,
          ...assignedFieldReads,
        ]),
      ].sort(),
      method: call.method,
      useKinds: inferReturnUseKinds(before, after),
    };
  });
}

function variableFieldReads(source, name) {
  return [
    ...new Set(
      [
        ...source.matchAll(
          new RegExp(
            `\\b${escapeRegExp(name)}(?:\\?\\.|\\.)([A-Za-z_$][\\w$]*)`,
            "g",
          ),
        ),
        ...source.matchAll(
          new RegExp(
            `\\b${escapeRegExp(name)}\\s*\\[\\s*(?:\`([^\`]+)\`|"([^"]+)"|'([^']+)')\\s*\\]`,
            "g",
          ),
        ),
      ]
        .map((match) => match[1] ?? match[2] ?? match[3])
        .filter(Boolean),
    ),
  ].sort();
}

function reassignmentIndex(source, name, start) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=`, "g");
  pattern.lastIndex = start;
  const match = pattern.exec(source);
  return match?.index ?? Math.min(source.length, start + 1200);
}

function inferReturnUseKinds(before, after) {
  const uses = new Set();
  if (/\bawait\s*$/.test(before)) {
    uses.add("awaited");
  }
  if (/(?:if|while)\s*\(\s*(?:!?\s*)?$/.test(before)) {
    uses.add("condition");
  }
  if (/^\.then\(/.test(after)) {
    uses.add("promise");
  }
  return [...uses].sort();
}

function extractMessageEventPayloadKeys(source) {
  const handlers = extractMessageEventHandlers(source);
  return [
    ...new Set(
      handlers.flatMap((handler) =>
        [
          ...handler.matchAll(/\.data(?:\?\.|\.)([A-Za-z_$][\w$]*)/g),
          ...handler.matchAll(
            /\.data\s*\[\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)')\s*\]/g,
          ),
        ]
          .map((match) => match[1] ?? match[2] ?? match[3])
          .filter(Boolean),
      ),
    ),
  ].sort();
}

function extractMessageEventHandlers(source) {
  const handlers = [];
  const needle = "addEventListener(";
  let start = source.indexOf(needle);
  while (start !== -1) {
    const argsStart = start + needle.length;
    const argsEnd = findMatchingParen(source, argsStart - 1);
    if (argsEnd === -1) {
      break;
    }
    const args = splitTopLevel(source.slice(argsStart, argsEnd));
    if (stringLiteralValue(args[0]?.trim() ?? "") === "message" && args[1]) {
      handlers.push(args[1]);
    }
    start = source.indexOf(needle, argsEnd + 1);
  }
  return handlers;
}

function extractMainWorldKeyUsages(asset, source, mainWorldKeys) {
  if (!mainWorldKeys) {
    return [];
  }
  const usages = [];
  for (const key of mainWorldKeys) {
    if (key === "electronBridge") {
      continue;
    }
    const pattern = new RegExp(
      `\\bwindow\\.${escapeRegExp(key)}(?:\\?\\.|\\.)([A-Za-z_$][\\w$]*)`,
      "g",
    );
    for (const match of source.matchAll(pattern)) {
      usages.push({ asset, key, property: match[1] });
    }
  }
  return [
    ...new Map(
      usages.map((usage) => [
        `${usage.asset}\0${usage.key}\0${usage.property}`,
        usage,
      ]),
    ).values(),
  ];
}

function rendererAliasSearchRange(source, alias, index) {
  const maxEnd = Math.min(source.length, index + RENDERER_ALIAS_TRACE_WINDOW);
  let end = Math.min(
    maxEnd,
    nearestFunctionBodyEnd(source, index) ??
      containingBraceEnd(source, index) ??
      maxEnd,
  );
  for (const pattern of [
    new RegExp(`\\b${escapeRegExp(alias)}\\s*=`, "g"),
    new RegExp(
      `\\b(?:let|const|var)\\s+[^;]*\\b${escapeRegExp(alias)}\\b`,
      "g",
    ),
  ]) {
    pattern.lastIndex = index + 1;
    const match = pattern.exec(source);
    if (match && match.index < end) {
      end = match.index;
    }
  }
  return [index, end];
}

function nearestFunctionBodyEnd(source, index) {
  const offset = Math.max(0, index - RENDERER_ALIAS_TRACE_WINDOW);
  const segment = source.slice(offset, index);
  const candidates = [
    ...segment.matchAll(/(?:async\s*)?\([^)]*\)\s*=>\s*\{/g),
    ...segment.matchAll(/[A-Za-z_$][\w$]*\s*=>\s*\{/g),
    ...segment.matchAll(/function\s*[A-Za-z_$]*\s*\([^)]*\)\s*\{/g),
  ].sort((left, right) => left.index - right.index);
  for (const match of candidates.reverse()) {
    const open = offset + match.index + match[0].lastIndexOf("{");
    const close = findMatchingBrace(source, open);
    if (close > index) {
      return close;
    }
  }
  return null;
}

function containingBraceEnd(source, index) {
  const stack = [];
  let quote = null;
  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = source[cursor];
    const previous = source[cursor - 1];
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
    if (char === "{") {
      stack.push(cursor);
      continue;
    }
    if (char === "}") {
      stack.pop();
    }
  }
  const open = stack.at(-1);
  if (open == null) {
    return null;
  }
  const close = findMatchingBrace(source, open);
  return close === -1 ? null : close;
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
    return {
      kind: "array",
      length: splitTopLevel(trimmed.slice(1, -1)).length,
    };
  }
  if (
    /^(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(
      trimmed,
    )
  ) {
    return { kind: "function" };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    return { kind: "identifier", name: trimmed };
  }
  return { kind: "expression" };
}

function describeRendererArgumentShape(source, call, expression) {
  const definitions = valueDefinitions(
    source.slice(
      Math.max(0, call.calleeStart - RENDERER_ALIAS_TRACE_WINDOW),
      call.calleeStart,
    ),
  );
  return describeContractExpressionShape(expression, {
    definitions,
    params: rendererFunctionParams(source, call.calleeStart),
  });
}

function describeContractExpressionShape(
  expression,
  { definitions = new Map(), params = [], depth = 0 } = {},
) {
  const trimmed = expression.trim();
  if (params.includes(trimmed)) {
    return { kind: "parameter", name: trimmed };
  }
  if (depth > 4) {
    return describeExpressionShape(trimmed);
  }
  if (/^Math\.(?:round|floor|ceil|trunc|abs|max|min)\(/.test(trimmed)) {
    return { kind: "number", value: trimmed };
  }
  if (/(?:={2,3}|!==|!=|>=|<=|>|<)/.test(trimmed) || /^!/.test(trimmed)) {
    return { kind: "boolean", value: trimmed };
  }
  if (/\bipcRenderer\.sendSync\(/.test(trimmed)) {
    return { kind: "sync-ipc" };
  }
  const call = trimmed.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/s);
  if (call) {
    const definition = definitions.get(call[1]);
    if (definition) {
      const returned = returnedExpression(definition);
      if (returned) {
        return describeContractExpressionShape(returned, {
          definitions,
          params: functionParams(definition),
          depth: depth + 1,
        });
      }
    }
    return {
      args: splitTopLevel(call[2]).map((arg) =>
        describeContractExpressionShape(arg, {
          definitions,
          params,
          depth: depth + 1,
        }),
      ),
      callee: call[1],
      kind: "call",
    };
  }
  const member = trimmed.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
  if (member) {
    const base = describeContractExpressionShape(member[1], {
      definitions,
      params,
      depth: depth + 1,
    });
    return {
      baseKind: base.kind,
      kind: base.kind === "sync-ipc" ? "object-property" : "member",
      object: member[1],
      property: member[2],
    };
  }
  const index = trimmed.match(/^([A-Za-z_$][\w$]*)\[(.+)\]$/s);
  if (index) {
    const base = describeContractExpressionShape(index[1], {
      definitions,
      params,
      depth: depth + 1,
    });
    return {
      baseKind: base.kind,
      indexShape: describeContractExpressionShape(index[2], {
        definitions,
        params,
        depth: depth + 1,
      }),
      kind: "object-index",
      object: index[1],
    };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed) && definitions.has(trimmed)) {
    const definition = definitions.get(trimmed);
    const returned = returnedExpression(definition);
    if (returned) {
      return describeContractExpressionShape(returned, {
        definitions,
        params: functionParams(definition),
        depth: depth + 1,
      });
    }
    return describeContractExpressionShape(definition, {
      definitions,
      params,
      depth: depth + 1,
    });
  }
  const returned = returnedExpression(trimmed);
  if (returned) {
    return {
      kind: "function",
      returnShape: describeContractExpressionShape(returned, {
        definitions,
        params: functionParams(trimmed),
        depth: depth + 1,
      }),
    };
  }
  return describeExpressionShape(trimmed);
}

function nearestFunctionParams(source, index) {
  const segment = source.slice(
    Math.max(0, index - RENDERER_ALIAS_TRACE_WINDOW),
    index,
  );
  const candidates = [
    ...segment.matchAll(/(?:async\s*)?\(([^)]*)\)\s*=>/g),
    ...segment.matchAll(/(?:function\s*[A-Za-z_$]*|[,(])\s*\(([^)]*)\)\s*=>/g),
    ...segment.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g),
    ...segment.matchAll(/function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g),
  ].sort((left, right) => left.index - right.index);
  const last = candidates.at(-1);
  return last ? splitParams(last[1]) : [];
}

function rendererFunctionParams(source, index) {
  return [
    ...new Set([
      ...nearestFunctionParams(source, index),
      ...destructuredParameterBindings(source, index),
    ]),
  ];
}

function destructuredParameterBindings(source, index) {
  const segment = source.slice(
    Math.max(0, index - RENDERER_ALIAS_TRACE_WINDOW),
    index,
  );
  return [...segment.matchAll(/\(\s*(\{[^)]*\})\s*\)\s*=>/g)].flatMap(
    (match) => splitParams(match[1]),
  );
}

function valueDefinitions(source) {
  const definitions = new Map();
  for (const simple of source.matchAll(
    /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([^,;{}]+)/g,
  )) {
    definitions.set(simple[1], simple[2].trim());
  }
  for (const declaration of source.matchAll(
    /\b(?:var|let|const)\s+([^;]+);/g,
  )) {
    for (const part of splitTopLevel(declaration[1])) {
      const match = part.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)$/s);
      if (match) {
        definitions.set(match[1], match[2].trim());
      }
    }
  }
  for (const simple of source.matchAll(
    /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([^,;{}]+)(?=[,;}])/g,
  )) {
    definitions.set(simple[1], simple[2].trim());
  }
  for (const fn of source.matchAll(
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  )) {
    const bodyStart = fn.index + fn[0].length - 1;
    const bodyEnd = findMatchingBrace(source, bodyStart);
    if (bodyEnd !== -1) {
      definitions.set(fn[1], source.slice(fn.index, bodyEnd + 1));
    }
  }
  return definitions;
}

function returnedExpression(expression) {
  const trimmed = expression.trim();
  if (/=>/.test(trimmed)) {
    const arrowIndex = trimmed.indexOf("=>");
    const body = trimmed.slice(arrowIndex + 2).trim();
    if (body.startsWith("{")) {
      if (/return[\s\S]*=>\s*\{/.test(body)) {
        return "()=>{}";
      }
      return body.match(/\breturn\s+([^;]+);?/s)?.[1]?.trim() ?? null;
    }
    if (/=>\s*\{/.test(body)) {
      return "()=>{}";
    }
    return body.replace(/^\((.*)\)$/s, "$1").trim();
  }
  if (/return[\s\S]*=>\s*\{/.test(trimmed)) {
    return "()=>{}";
  }
  return trimmed.match(/\breturn\s+([^;]+);?/s)?.[1]?.trim() ?? null;
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
    methodAliases.push({
      index: match.index,
      method: match[2],
      name: match[1],
    });
  }

  for (const match of source.matchAll(
    /\{([^}]+)\}\s*=\s*window\.electronBridge\b/g,
  )) {
    for (const part of splitTopLevel(match[1])) {
      const [method, alias = method] = part
        .split(":")
        .map((item) => item.trim());
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

function extractIpcRendererContracts(
  preloadSource,
  kind,
  channelConstants,
  { definitions = new Map(), params = [] } = {},
) {
  return extractIpcRendererCalls(preloadSource, kind, channelConstants).map(
    (call) => {
      const args = splitTopLevel(call.rawArgs);
      const payloadArgs = args.slice(1);
      return {
        argCount: args.length,
        channel: call.channel,
        handlerPayloadKeys:
          kind === "on"
            ? extractMessageEventPayloadKeys(payloadArgs.join(","))
            : [],
        kind,
        payloadShapes: payloadArgs.map((arg) =>
          describeContractExpressionShape(arg, { definitions, params }),
        ),
        rawArgs: call.rawArgs,
        transferCount:
          kind === "postMessage" && payloadArgs[1]?.trim().startsWith("[")
            ? splitTopLevel(payloadArgs[1].trim().slice(1, -1)).length
            : 0,
      };
    },
  );
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
  const objectBody = objectBodyForExpression(
    preloadSource,
    exposure.valueExpression,
  );
  if (!objectBody) {
    return [];
  }
  return splitTopLevel(objectBody)
    .map((entry) => entry.match(/^\s*([A-Za-z_$][\w$]*)\s*:/)?.[1])
    .filter(Boolean)
    .sort();
}

function extractElectronBridgeContracts(
  preloadSource,
  exposures,
  channelConstants,
  definitions,
) {
  const exposure = exposures.find((item) => item.key === "electronBridge");
  if (!exposure) {
    return [];
  }
  const objectBody = objectBodyForExpression(
    preloadSource,
    exposure.valueExpression,
  );
  if (!objectBody) {
    return [];
  }
  return splitTopLevel(objectBody)
    .map((entry) => describeBridgeMember(entry, channelConstants, definitions))
    .filter(Boolean)
    .sort((a, b) => a.method.localeCompare(b.method));
}

function describeBridgeMember(entry, channelConstants, definitions) {
  const methodEntry = entry.match(
    /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/,
  );
  if (methodEntry) {
    return describeBridgeImplementation(
      {
        async: /^\s*async\b/.test(entry),
        expression: entry,
        method: methodEntry[1],
        params: splitParams(methodEntry[2]),
      },
      channelConstants,
      definitions,
    );
  }

  const propertyEntry = entry.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+)$/s);
  if (!propertyEntry) {
    return null;
  }
  const method = propertyEntry[1];
  const expression = propertyEntry[2].trim();
  return describeBridgeImplementation(
    {
      async: /^\s*async\b/.test(expression),
      expression,
      method,
      params: functionParams(expression),
    },
    channelConstants,
    definitions,
  );
}

function describeBridgeImplementation(member, channelConstants, definitions) {
  const ipcCalls = ["sendSync", "invoke", "on", "postMessage"].flatMap((kind) =>
    extractIpcRendererContracts(member.expression, kind, channelConstants, {
      definitions,
      params: member.params,
    }),
  );
  const returnShape = inferBridgeReturnShape(
    member.expression,
    member.async,
    ipcCalls,
    {
      definitions,
      params: member.params,
    },
  );
  return {
    async: member.async,
    ipcCalls,
    method: member.method,
    params: member.params,
    processDefines: [
      ...new Set(
        [
          ...member.expression.matchAll(
            /\bprocess\.(arch|platform|env\.NODE_ENV)\b/g,
          ),
        ].map((match) => `process.${match[1]}`),
      ),
    ].sort(),
    returnKind: returnShape.kind,
    returnShape,
    webUtilsCalls: [
      ...new Set(
        [
          ...member.expression.matchAll(/\bwebUtils\.([A-Za-z_$][\w$]*)\b/g),
        ].map((match) => match[1]),
      ),
    ].sort(),
  };
}

function functionParams(expression) {
  const arrow = expression.match(
    /^(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/s,
  );
  if (arrow) {
    return splitParams(arrow[1] ?? arrow[2]);
  }
  const fn = expression.match(
    /^function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/s,
  );
  return fn ? splitParams(fn[1]) : [];
}

function splitParams(params) {
  return splitTopLevel(params)
    .flatMap(parameterBindings)
    .filter(Boolean);
}

function parameterBindings(param) {
  const trimmed = stripTopLevelDefault(param.trim());
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return objectPatternBindings(trimmed.slice(1, -1));
  }
  return [trimmed];
}

function objectPatternBindings(body) {
  return splitTopLevel(body).flatMap((part) => {
    const entry = part.trim().replace(/^\.\.\./, "");
    const colon = topLevelIndex(entry, ":");
    const target = stripTopLevelDefault(
      colon === -1 ? entry : entry.slice(colon + 1),
    ).trim();
    if (target.startsWith("{") && target.endsWith("}")) {
      return objectPatternBindings(target.slice(1, -1));
    }
    return /^[A-Za-z_$][\w$]*$/.test(target) ? [target] : [];
  });
}

function stripTopLevelDefault(value) {
  const index = topLevelIndex(value, "=");
  return index === -1 ? value : value.slice(0, index);
}

function topLevelIndex(source, needle) {
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
    else if (char === ")") parenDepth -= 1;
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (
      char === needle &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      return index;
    }
  }
  return -1;
}

function inferBridgeReturnShape(
  expression,
  isAsync,
  ipcCalls,
  { definitions, params },
) {
  if (isAsync || ipcCalls.some((call) => call.kind === "invoke")) {
    return { kind: "promise" };
  }
  if (ipcCalls.some((call) => call.kind === "sendSync")) {
    return { kind: "sync-ipc" };
  }
  if (/\bwebUtils\./.test(expression)) {
    return { kind: "sync" };
  }
  const returned = returnedExpression(expression);
  if (!returned) {
    return describeContractExpressionShape(expression, { definitions, params });
  }
  return describeContractExpressionShape(returned, { definitions, params });
}

function objectBodyForExpression(source, expression) {
  if (expression.startsWith("{")) {
    const end = findMatchingBrace(expression, 0);
    return end === -1 ? null : expression.slice(1, end);
  }

  const assignment = new RegExp(
    `\\b${escapeRegExp(expression)}\\s*=\\s*\\{`,
    "g",
  );
  const match = assignment.exec(source);
  if (!match) {
    return null;
  }
  const braceStart = match.index + match[0].length - 1;
  const braceEnd = findMatchingBrace(source, braceStart);
  return braceEnd === -1 ? null : source.slice(braceStart + 1, braceEnd);
}

function resolveChannelExpression(expression, channelConstants) {
  return (
    stringLiteralValue(expression) ?? channelConstants.get(expression) ?? null
  );
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

export function deriveStaticContractReview({
  rendererAssetProfile,
  staticProfile,
}) {
  const bridgeIpcCalls = staticProfile.electronBridgeContracts.flatMap(
    (contract) => contract.ipcCalls ?? [],
  );
  const bridgeIpcCallKeys = new Set(
    bridgeIpcCalls.map(
      (call) => `${call.kind}\0${call.channel}\0${call.rawArgs}`,
    ),
  );
  const nonBridgeIpcCalls = staticProfile.ipcContracts.filter(
    (call) =>
      !bridgeIpcCallKeys.has(`${call.kind}\0${call.channel}\0${call.rawArgs}`),
  );
  const unresolvedBridgeReturns = staticProfile.electronBridgeContracts
    .filter((contract) =>
      ["expression", "identifier", "unknown"].includes(contract.returnKind),
    )
    .map((contract) => ({
      method: contract.method,
      returnKind: contract.returnKind,
    }));
  const unresolvedIpcPayloads = [
    ...bridgeIpcCalls,
    ...nonBridgeIpcCalls,
  ].flatMap((contract) =>
    contract.payloadShapes.flatMap((shape, index) =>
      ["expression", "identifier"].includes(shape.kind)
        ? [
            {
              argIndex: index + 1,
              channel: contract.channel,
              kind: contract.kind,
              rawArgs: contract.rawArgs,
              shape,
            },
          ]
        : [],
    ),
  );
  const review = {
    unknownRendererArguments: rendererAssetProfile.unknownBridgeArguments,
    unresolvedBridgeReturns,
    unresolvedIpcPayloads,
    unsupportedBridgeMethodCalls:
      rendererAssetProfile.unsupportedBridgeMethodCalls,
  };
  return {
    ...review,
    ok: Object.values(review).every((items) => items.length === 0),
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
      .map(
        (entry) =>
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
    {
      allowedBridgeMethods: staticProfile.electronBridgeMethods,
      mainWorldKeys: staticProfile.mainWorldExposures.map((item) => item.key),
    },
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
      staticReview: deriveStaticContractReview({
        rendererAssetProfile,
        staticProfile,
      }),
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
  console.log(`static contract review ok: ${result.staticReview.ok}`);
  for (const [key, values] of Object.entries(result.staticReview)) {
    if (key !== "ok" && values.length > 0) {
      console.log(`${key}: ${values.length}`);
    }
  }
  if (!result.support.ok || !result.staticReview.ok) {
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
