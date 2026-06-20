#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PUBLIC_TERMINAL_EXPORT = "openSessionSandboxSidePanel";
const PUBLIC_BROWSER_PANEL_EXPORT =
  "openThreadBrowserSidePanelTabWithPendingState";
const PATCH_MARKER = "side_panel_terminal";
const TERMINAL_BROWSER_CHROME_MARKER = "codexWebIsTerminalTab";
const APPLICATION_MENU_PATCH_MARKER = "codexWebDisableApplicationMenu";
const APPLICATION_MENU_FEATURE_PATTERN =
  /function\s+([$A-Za-z_][\w$]*)\(\)\{return yt\(\)&&window\.electronBridge\?\.showApplicationMenu!=null\}/;
const TERMINAL_TAB_ICON_FUNCTION =
  "function codexWebTerminalTabIcon(e){return Q.createElement(`svg`,{width:20,height:20,viewBox:`0 0 20 20`,fill:`none`,xmlns:`http://www.w3.org/2000/svg`,...e},Q.createElement(`path`,{d:`M13.334 12.2529C13.701 12.2533 13.999 12.5509 13.999 12.918C13.9988 13.2849 13.7008 13.5827 13.334 13.583H6.66699C6.29984 13.583 6.00215 13.2851 6.00195 12.918C6.00195 12.5507 6.29972 12.2529 6.66699 12.2529H13.334Z`,fill:`currentColor`}),Q.createElement(`path`,{fillRule:`evenodd`,clipRule:`evenodd`,d:`M15 3.08594C16.748 3.08594 18.165 4.503 18.165 6.25098V13.751C18.165 15.499 16.748 16.916 15 16.916H5C3.25202 16.916 1.83496 15.499 1.83496 13.751V6.25098C1.83496 4.503 3.25202 3.08594 5 3.08594H15ZM5 4.41602C3.98656 4.41602 3.16504 5.23753 3.16504 6.25098V13.751C3.16504 14.7644 3.98656 15.5859 5 15.5859H15C16.0134 15.5859 16.835 14.7644 16.835 13.751V6.25098C16.835 5.23753 16.0134 4.41602 15 4.41602H5Z`,fill:`currentColor`}))}";

export function findTerminalSidePanelAsset(assetsDir) {
  const terminal = resolvePublicExport(assetsDir, PUBLIC_TERMINAL_EXPORT);
  const browserPanel = resolvePublicExport(
    assetsDir,
    PUBLIC_BROWSER_PANEL_EXPORT,
  );

  if (terminal.assetPath !== browserPanel.assetPath) {
    throw new Error(
      `Terminal side panel export and browser panel export are in different assets: ${terminal.assetPath}, ${browserPanel.assetPath}`,
    );
  }

  return {
    assetPath: terminal.assetPath,
    functionName: terminal.symbolName,
    openBrowserPanelFunctionName: browserPanel.symbolName,
  };
}

export function findTerminalActionAsset(assetsDir, terminalPatchTarget) {
  const terminalAssetName = path.basename(terminalPatchTarget.assetPath);
  const terminalSource = fs.readFileSync(terminalPatchTarget.assetPath, "utf8");
  const terminalExportName = findExportedName(
    terminalSource,
    terminalPatchTarget.functionName,
  );
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (!source.includes("thread.sidePanel.newTab.terminal.title")) {
      continue;
    }

    const terminalImport = parseImportClauses(source).find(
      (importClause) => importClause.source === terminalAssetName,
    );
    if (!terminalImport) {
      continue;
    }

    const importedSpecifier = terminalImport.specifiers.find(
      (specifier) => specifier.imported === terminalExportName,
    );
    if (!importedSpecifier) {
      continue;
    }

    return {
      assetPath,
      terminalActionFunctionName: findTerminalActionFunctionName(
        source,
        importedSpecifier.local,
      ),
    };
  }

  throw new Error(
    `Unable to find terminal side panel action asset in ${assetsDir}`,
  );
}

export function findApplicationMenuAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (
      source.includes("windowsMenuBar.file") &&
      (source.includes("showApplicationMenu") ||
        source.includes(APPLICATION_MENU_PATCH_MARKER))
    ) {
      return assetPath;
    }
  }

  throw new Error(`Unable to find application menu asset in ${assetsDir}`);
}

export function patchApplicationMenuSource(source) {
  const match = APPLICATION_MENU_FEATURE_PATTERN.exec(source);
  if (match) {
    return (
      source.slice(0, match.index) +
      `function ${match[1]}(){return!1/*${APPLICATION_MENU_PATCH_MARKER}*/}` +
      source.slice(match.index + match[0].length)
    );
  }

  if (
    source.includes("windowsMenuBar.file") &&
    source.includes(APPLICATION_MENU_PATCH_MARKER)
  ) {
    return source;
  }

  throw new Error("Application menu feature gate not found");
}

export function patchTerminalSidePanelSource(
  source,
  { functionName, openBrowserPanelFunctionName },
) {
  const functionRange = findFunctionRange(source, functionName);
  const functionSource = source.slice(functionRange.start, functionRange.end);
  if (
    functionSource.includes(PATCH_MARKER) &&
    functionSource.includes("globalThis.location.origin") &&
    functionSource.includes("browserTabId:")
  ) {
    return source;
  }

  const params = splitTopLevel(functionRange.params, ",").map((part) =>
    part.trim(),
  );
  const appScopeParam = paramName(params[0]);
  const conversationIdParam = paramName(params[1]);
  const cwdSymbol = findCurrentCwdSymbol(source);
  const randomUuidSymbol = findRandomUuidSymbol(source);

  const replacement = `function ${functionName}(${functionRange.params}){let r=${appScopeParam}.get(${cwdSymbol});return ${openBrowserPanelFunctionName}(${appScopeParam},{browserConversationId:${conversationIdParam}??void 0,browserTabId:${randomUuidSymbol}(crypto.randomUUID()),initialUrl:\`\${globalThis.location.origin}/__terminal?cwd=\${encodeURIComponent(r??\`\`)}\`,initiator:\`side_panel_terminal\`,source:\`manual\`,target:\`right\`,cwd:r??void 0})!=null}`;

  return (
    source.slice(0, functionRange.start) +
    replacement +
    source.slice(functionRange.end)
  );
}

export function patchTerminalActionSource(
  source,
  { terminalActionFunctionName },
) {
  const actionPattern =
    /(id:`terminal`[\s\S]{0,160}?onSelect\s*:\s*)[$A-Za-z_][\w$]*(\s*,\s*title\s*:\s*\(0,[\s\S]{0,180}?thread\.sidePanel\.newTab\.terminal\.title)/;
  const match = actionPattern.exec(source);
  if (!match) {
    throw new Error("Terminal side panel action handler not found");
  }

  const currentHandler = source.slice(
    match.index + match[1].length,
    match.index + match[0].length - match[2].length,
  );
  if (currentHandler === terminalActionFunctionName) {
    return source;
  }

  return (
    source.slice(0, match.index) +
    `${match[1]}${terminalActionFunctionName}${match[2]}` +
    source.slice(match.index + match[0].length)
  );
}

export function patchTerminalBrowserChromeSource(source) {
  if (
    isTerminalBrowserChromePatched(source) &&
    isTerminalBrowserTabSnapshotPatched(source)
  ) {
    return source;
  }

  let patched = source;
  patched = patchTerminalTabIconFunction(patched);
  patched = patchTerminalBrowserTabSnapshotSource(patched);
  if (!patched.includes(TERMINAL_BROWSER_CHROME_MARKER)) {
    patched = replaceOnce(
      patched,
      /((?:let\s+)?Ui=[\s\S]{0,240}?Wi=[^;]+);return\(0,\$\.jsxs\)\(`div`,\{ref:L,/,
      `$1,codexWebIsTerminalTab=X.url?.includes(\`/__terminal\`)===!0;return(0,$.jsxs)(\`div\`,{ref:L,"data-codex-web-terminal-tab":codexWebIsTerminalTab?\`true\`:void 0,`,
      "Terminal browser panel root not found",
    );
  }
  if (
    !patched.includes(
      `"data-browser-sidebar-primary-focus-target":codexWebIsTerminalTab?`,
    )
  ) {
    patched = replaceOnce(
      patched,
      `"data-browser-sidebar-primary-focus-target":Kt?\`webview\`:\`address\``,
      `"data-browser-sidebar-primary-focus-target":codexWebIsTerminalTab?\`webview\`:Kt?\`webview\`:\`address\``,
      "Terminal browser panel focus target not found",
    );
  }
  if (!patched.includes("codexWebIsTerminalTab?`grid-rows-[1fr]`")) {
    patched = replaceOnce(
      patched,
      "className:`relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]`",
      "className:J(`relative grid h-full min-h-0 w-full min-w-0`,codexWebIsTerminalTab?`grid-rows-[1fr]`:`grid-rows-[auto_1fr]`)",
      "Terminal browser panel grid layout not found",
    );
  }
  if (!patched.includes("children:[codexWebIsTerminalTab?null:")) {
    patched = replaceOnce(
      patched,
      "children:[(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`",
      "children:[codexWebIsTerminalTab?null:(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`",
      "Terminal browser panel toolbar not found",
    );
  }

  return patched;
}

function patchTerminalTabIconFunction(source) {
  if (source.includes("function codexWebTerminalTabIcon")) {
    return source;
  }

  if (source.includes("var fs=`about:blank#codex-browser-sidebar-attach-token=`")) {
    return source.replace(
      "var fs=`about:blank#codex-browser-sidebar-attach-token=`",
      `${TERMINAL_TAB_ICON_FUNCTION}var fs=\`about:blank#codex-browser-sidebar-attach-token=\``,
    );
  }

  return `${TERMINAL_TAB_ICON_FUNCTION}${source}`;
}

function patchTerminalBrowserTabSnapshotSource(source) {
  let patched = source;
  const snapshotPattern =
    "let i=e?.tabType===ne.WEB,a=r&&i&&(e.url.length===0||e.url===`about:blank`),o=i&&(e.url.startsWith(fs)||e.title.startsWith(fs)),s=i&&!a&&!o?oi(e.url):``,c=i?e.title.trim():``,l=c.length===0||c===`about:blank`||c===t,u=i&&!a&&!o&&c.length>0;return{faviconUrl:i?e.faviconUrl:null,";
  if (
    patched.includes(snapshotPattern) &&
    !patched.includes("d=i&&e.url.includes(`/__terminal`)")
  ) {
    patched = patched.replace(
      snapshotPattern,
      "let i=e?.tabType===ne.WEB,a=r&&i&&(e.url.length===0||e.url===`about:blank`),o=i&&(e.url.startsWith(fs)||e.title.startsWith(fs)),s=i&&!a&&!o?oi(e.url):``,c=i?e.title.trim():``,l=c.length===0||c===`about:blank`||c===t,u=i&&!a&&!o&&c.length>0,d=i&&e.url.includes(`/__terminal`);return{faviconUrl:i?e.faviconUrl:null,isTerminal:d,",
    );
  }
  if (!patched.includes("isTerminal:")) {
    throw new Error("Terminal browser tab snapshot metadata not found");
  }

  patched = replaceIfPresent(
    patched,
    "icon:(0,$.jsx)(Dt,{alt:``,className:`size-full rounded-2xs`,logoUrl:S.faviconUrl,fallback:(0,$.jsx)(bi,{className:`size-full`})})",
    "icon:S.isTerminal?(0,$.jsx)(codexWebTerminalTabIcon,{className:`size-full`}):(0,$.jsx)(Dt,{alt:``,className:`size-full rounded-2xs`,logoUrl:S.faviconUrl,fallback:(0,$.jsx)(bi,{className:`size-full`})})",
  );
  patched = replaceIfPresent(
    patched,
    "icon:(0,Q.createElement)(Dt,{alt:``,className:`icon-xs shrink-0 rounded-2xs`,logoUrl:u.faviconUrl,fallback:(0,Q.createElement)(bi,{className:`size-full`})})",
    "icon:u.isTerminal?Q.createElement(codexWebTerminalTabIcon,{className:`icon-xs shrink-0`}):(0,Q.createElement)(Dt,{alt:``,className:`icon-xs shrink-0 rounded-2xs`,logoUrl:u.faviconUrl,fallback:(0,Q.createElement)(bi,{className:`size-full`})})",
  );
  if (!isTerminalBrowserTabSnapshotPatched(patched)) {
    throw new Error("Terminal browser tab icon target not found");
  }

  return patched;
}

function isTerminalBrowserChromePatched(source) {
  return (
    source.includes(TERMINAL_BROWSER_CHROME_MARKER) &&
    source.includes(
      `"data-browser-sidebar-primary-focus-target":codexWebIsTerminalTab?`,
    ) &&
    source.includes("codexWebIsTerminalTab?`grid-rows-[1fr]`") &&
    source.includes("children:[codexWebIsTerminalTab?null:") &&
    source.includes("codexWebTerminalTabIcon")
  );
}

function isTerminalBrowserTabSnapshotPatched(source) {
  return (
    source.includes("isTerminal:") &&
    (source.includes("S.isTerminal?") || source.includes("u.isTerminal?"))
  );
}

export function patchTerminalSidePanelAsset(assetsDir) {
  const patchTarget = findTerminalSidePanelAsset(assetsDir);
  const source = fs.readFileSync(patchTarget.assetPath, "utf8");
  const patched = patchTerminalBrowserChromeSource(
    patchTerminalSidePanelSource(source, patchTarget),
  );
  if (patched !== source) {
    fs.writeFileSync(patchTarget.assetPath, patched);
  }
  return patchTarget.assetPath;
}

export function patchTerminalActionAsset(assetsDir, terminalPatchTarget) {
  const patchTarget = findTerminalActionAsset(assetsDir, terminalPatchTarget);
  const source = fs.readFileSync(patchTarget.assetPath, "utf8");
  const patched = patchTerminalActionSource(source, patchTarget);
  if (patched !== source) {
    fs.writeFileSync(patchTarget.assetPath, patched);
  }
  return patchTarget.assetPath;
}

export function patchApplicationMenuAsset(assetsDir) {
  const assetPath = findApplicationMenuAsset(assetsDir);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchApplicationMenuSource(source);
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return assetPath;
}

export function patchTerminalSidePanelSupport(assetsDir) {
  const terminalPatchTarget = findTerminalSidePanelAsset(assetsDir);
  const source = fs.readFileSync(terminalPatchTarget.assetPath, "utf8");
  const patched = patchTerminalBrowserChromeSource(
    patchTerminalSidePanelSource(source, terminalPatchTarget),
  );
  if (patched !== source) {
    fs.writeFileSync(terminalPatchTarget.assetPath, patched);
  }

  return [
    terminalPatchTarget.assetPath,
    patchTerminalActionAsset(assetsDir, terminalPatchTarget),
    patchApplicationMenuAsset(assetsDir),
  ];
}

function resolvePublicExport(assetsDir, publicName) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (!source.includes(publicName)) {
      continue;
    }

    for (const specifier of parseExportSpecifiers(source)) {
      if (specifier.exported !== publicName) {
        continue;
      }
      return resolveLocalBinding(assetsDir, assetPath, source, specifier.local);
    }
  }

  throw new Error(`Unable to find ${publicName} export in ${assetsDir}`);
}

function findExportedName(source, localName) {
  const specifier = parseExportSpecifiers(source).find(
    (specifier) => specifier.local === localName,
  );
  if (specifier) {
    return specifier.exported;
  }
  throw new Error(`Unable to find export for local symbol ${localName}`);
}

function findTerminalActionFunctionName(source, terminalOpenerName) {
  const pattern = new RegExp(
    `\\b([$A-Za-z_][\\w$]*)\\s*=\\s*\\(\\)\\s*=>\\s*\\{\\s*${escapeRegex(terminalOpenerName)}\\s*\\(`,
  );
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(
      `Unable to find terminal action wrapper for ${terminalOpenerName}`,
    );
  }
  return match[1];
}

function resolveLocalBinding(assetsDir, assetPath, source, localName) {
  for (const importClause of parseImportClauses(source)) {
    const importedSpecifier = importClause.specifiers.find(
      (specifier) => specifier.local === localName,
    );
    if (!importedSpecifier) {
      continue;
    }

    const sourceAssetPath = path.join(assetsDir, importClause.source);
    const sourceAsset = fs.readFileSync(sourceAssetPath, "utf8");
    const exportedSpecifier = parseExportSpecifiers(sourceAsset).find(
      (specifier) => specifier.exported === importedSpecifier.imported,
    );

    return {
      assetPath: sourceAssetPath,
      symbolName: exportedSpecifier?.local ?? importedSpecifier.imported,
    };
  }

  return { assetPath, symbolName: localName };
}

function parseImportClauses(source) {
  const clauses = [];
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*"\.\/([^"]+)"/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    clauses.push({
      source: match[2],
      specifiers: parseSpecifiers(match[1], "import"),
    });
  }
  return clauses;
}

function parseExportSpecifiers(source) {
  const specifiers = [];
  const exportPattern = /export\s*\{([^}]+)\}/g;
  let match;
  while ((match = exportPattern.exec(source)) !== null) {
    specifiers.push(...parseSpecifiers(match[1], "export"));
  }
  return specifiers;
}

function parseSpecifiers(source, kind) {
  return splitTopLevel(source, ",").map((part) => {
    const names = part.trim().split(/\s+as\s+/);
    if (names.length === 1) {
      return kind === "import"
        ? { imported: names[0], local: names[0] }
        : { local: names[0], exported: names[0] };
    }
    return kind === "import"
      ? { imported: names[0], local: names[1] }
      : { local: names[0], exported: names[1] };
  });
}

function findFunctionRange(source, functionName) {
  const pattern = new RegExp(`function\\s+${escapeRegex(functionName)}\\s*\\(`);
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Terminal side panel function not found: ${functionName}`);
  }

  const paramsStart = source.indexOf("(", match.index);
  const paramsEnd = findMatchingDelimiter(source, paramsStart, "(", ")");
  const bodyStart = source.indexOf("{", paramsEnd);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, "{", "}") + 1;

  return {
    start: match.index,
    end: bodyEnd,
    params: source.slice(paramsStart + 1, paramsEnd),
  };
}

function findCurrentCwdSymbol(source) {
  const cwdObjectMatch = source.match(
    /\b([A-Za-z_$][\w$]*)\s*=\s*l\(([$A-Za-z_][\w$]*)\)[\s\S]{0,700}\{\s*cwd:\s*\1\s*,\s*hostConfig:/,
  );
  if (cwdObjectMatch) {
    return cwdObjectMatch[2];
  }

  throw new Error("Unable to infer current cwd state symbol");
}

function findRandomUuidSymbol(source) {
  const match = source.match(
    /\b([$A-Za-z_][\w$]*)\s*\(\s*crypto\.randomUUID\(\)\s*\)/,
  );
  if (match) {
    return match[1];
  }

  throw new Error("Unable to infer random browser tab id wrapper symbol");
}

function replaceOnce(source, search, replacement, errorMessage) {
  const patched = source.replace(search, replacement);
  if (patched === source) {
    throw new Error(errorMessage);
  }
  return patched;
}

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source;
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === delimiter && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(source.slice(start));
  return parts.filter((part) => part.trim().length > 0);
}

function findMatchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Unclosed ${open} delimiter`);
}

function paramName(param) {
  const name = param?.match(/^[$A-Za-z_][\w$]*/)?.[0];
  if (!name) {
    throw new Error(`Unable to parse terminal side panel parameter: ${param}`);
  }
  return name;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const assetPaths = patchTerminalSidePanelSupport(assetsDir);
  console.log(
    `Patched terminal side panel support in ${assetPaths.join(", ")}`,
  );
}
