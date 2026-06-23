#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PUBLIC_TERMINAL_EXPORT = "openSessionSandboxSidePanel";
const TERMINAL_NATIVE_SHORTCUT_FUNCTION =
  "function codexWebInstallNativeTerminalShortcut(e){let t=globalThis;if(t.codexWebNativeTerminalShortcutHandler)document.removeEventListener(`keydown`,t.codexWebNativeTerminalShortcutHandler,!0);let n=t.codexWebNativeTerminalShortcutHandler=t=>{if(t.defaultPrevented)return;if(t.ctrlKey&&!t.metaKey&&!t.altKey&&!t.shiftKey&&t.code===`Backquote`){t.preventDefault();e()}};document.addEventListener(`keydown`,n,!0)}";
const TERMINAL_NATIVE_SHORTCUT_FUNCTION_PATTERN =
  /function codexWebInstallNativeTerminalShortcut\(e\)\{let t=globalThis;if\(t\.codexWebNativeTerminalShortcutHandler\)document\.removeEventListener\(`keydown`,t\.codexWebNativeTerminalShortcutHandler,!0\);let n=t\.codexWebNativeTerminalShortcutHandler=t=>\{[^]*?\};document\.addEventListener\(`keydown`,n,!0\)\}/g;
const TERMINAL_BROWSER_SHORTCUT_FUNCTION =
  "function codexWebInstallTerminalBrowserShortcut(e){let t=globalThis;if(t.codexWebTerminalBrowserShortcutHandler)document.removeEventListener(`keydown`,t.codexWebTerminalBrowserShortcutHandler,!0);let n=t.codexWebTerminalBrowserShortcutHandler=t=>{if(t.ctrlKey&&!t.metaKey&&!t.altKey&&!t.shiftKey&&t.code===`Backquote`){t.preventDefault();e()}};document.addEventListener(`keydown`,n,!0)}";
const SIDEBAR_NAVIGATION_BUTTONS_PATTERN =
  /let J;t\[\d+\]!==H\|\|t\[\d+\]!==q\?\(J=\(0,Q\.jsx\)\(_t,\{electron:!0,extension:!0,children:\(0,Q\.jsxs\)\(Q\.Fragment,\{children:\[H,q\]\}\)\}\),t\[\d+\]=H,t\[\d+\]=q,t\[\d+\]=J\):J=t\[\d+\];/;
const PATCHED_SIDEBAR_NAVIGATION_BUTTONS_PATTERN =
  /let J=null;[^]*?children:\[L,J\]/;

export function findTerminalSidePanelAsset(assetsDir) {
  const terminal = resolvePublicExport(assetsDir, PUBLIC_TERMINAL_EXPORT);
  return {
    assetPath: terminal.assetPath,
    functionName: terminal.symbolName,
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
    const importedSpecifier = terminalImport?.specifiers.find(
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

export function findSidebarNavigationButtonsAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (
      source.includes("viewTransitionName:`sidebar-trigger`") &&
      (SIDEBAR_NAVIGATION_BUTTONS_PATTERN.test(source) ||
        PATCHED_SIDEBAR_NAVIGATION_BUTTONS_PATTERN.test(source))
    ) {
      return assetPath;
    }
  }

  throw new Error(
    `Unable to find sidebar navigation buttons asset in ${assetsDir}`,
  );
}

export function patchTerminalActionSource(
  source,
  { terminalActionFunctionName },
) {
  let patched = source
    .replace(TERMINAL_NATIVE_SHORTCUT_FUNCTION_PATTERN, "")
    .replace(TERMINAL_BROWSER_SHORTCUT_FUNCTION, "")
    .replace(
      /;codexWebInstallTerminalBrowserShortcut\(\(\)=>\{[^}]*\}\)/g,
      "",
    )
    .replace(
      /;codexWebInstallTerminalBrowserShortcut\([$A-Za-z_][\w$]*\)/g,
      "",
    );
  const browserPatchedActionPattern =
    /(id:`terminal`[\s\S]{0,160}?onSelect\s*:)[$A-Za-z_][\w$]*===`right`\?[\s\S]{0,900}?(\s*,\s*title\s*:\s*\(0,[\s\S]{0,180}?thread\.sidePanel\.newTab\.terminal\.title)/;
  patched = patched.replace(
    browserPatchedActionPattern,
    `$1${terminalActionFunctionName}$2`,
  );
  return patchTerminalCommandNativeShortcutSource(patched);
}

function patchTerminalCommandNativeShortcutSource(source) {
  if (!source.includes("Ne(`toggleTerminal`,")) {
    return source;
  }

  const patched = source.includes(TERMINAL_NATIVE_SHORTCUT_FUNCTION)
    ? source
    : `${TERMINAL_NATIVE_SHORTCUT_FUNCTION}${source}`;

  return patched.replace(
    /Ne\(`toggleTerminal`,([$A-Za-z_][\w$]*)\);(?!codexWebInstallNativeTerminalShortcut)/,
    "Ne(`toggleTerminal`,$1);codexWebInstallNativeTerminalShortcut($1);",
  );
}

export function patchThreadOpenInPrimaryIconSource(source) {
  const primaryMessageId = "localConversationPage.openPrimaryTarget";
  const primaryIconSource = "src:g.icon,className:`icon-sm`";
  const primaryResolvedIconSource =
    "src:g.resolvedIcon??g.icon,className:`icon-sm`";
  const primaryMessageIndex = source.indexOf(primaryMessageId);

  if (primaryMessageIndex === -1) {
    return source;
  }

  const primaryIconIndexBefore = source.lastIndexOf(
    primaryIconSource,
    primaryMessageIndex,
  );
  const primaryIconIndexAfter = source.indexOf(
    primaryIconSource,
    primaryMessageIndex,
  );
  const primaryResolvedIconIndexBefore = source.lastIndexOf(
    primaryResolvedIconSource,
    primaryMessageIndex,
  );
  const primaryResolvedIconIndexAfter = source.indexOf(
    primaryResolvedIconSource,
    primaryMessageIndex,
  );
  const primaryIconIndex =
    primaryIconIndexBefore === -1
      ? primaryIconIndexAfter
      : primaryIconIndexBefore;
  const primaryResolvedIconIndex =
    primaryResolvedIconIndexBefore === -1
      ? primaryResolvedIconIndexAfter
      : primaryResolvedIconIndexBefore;

  if (
    primaryIconIndex !== -1 &&
    (primaryResolvedIconIndex === -1 ||
      primaryIconIndex > primaryResolvedIconIndex)
  ) {
    return (
      source.slice(0, primaryIconIndex) +
      primaryResolvedIconSource +
      source.slice(primaryIconIndex + primaryIconSource.length)
    );
  }

  if (primaryResolvedIconIndex !== -1) {
    return source;
  }

  throw new Error("Top Open in primary icon target not found");
}

export function patchTerminalNewTabMenuSource(source) {
  let patched = source;
  if (
    !patched.includes(
      "e.props?.codexWebIsTerminal!==!0&&e.codexWebIsTerminal!==!0",
    )
  ) {
    patched = replaceOnce(
      patched,
      "function it(e){return de(e)}",
      "function it(e){return de(e)&&e.props?.codexWebIsTerminal!==!0&&e.codexWebIsTerminal!==!0}",
      "Browser new tab filter predicate not found",
    );
  }

  if (!patched.includes("initiator:`side_panel_browser`")) {
    patched = patched.replace(
      /oe\(([$A-Za-z_][\w$]*),\{browserConversationId:([^,]+),browserHostDisplayName:([^,]+),cwd:([^,]+),initiator:`side_panel_menu`,source:`manual`,target:([^}]+)\}\)/,
      "oe($1,{browserConversationId:$2,browserTabId:crypto.randomUUID(),browserHostDisplayName:$3,cwd:$4,initiator:`side_panel_browser`,source:`manual`,target:$5})",
    );
    if (!patched.includes("initiator:`side_panel_browser`")) {
      throw new Error("Browser new tab action not found");
    }
  }

  return patched;
}

export function patchSidebarNavigationButtonsSource(source) {
  const patched = source.replace(
    SIDEBAR_NAVIGATION_BUTTONS_PATTERN,
    "let J=null;",
  );
  if (
    patched !== source ||
    PATCHED_SIDEBAR_NAVIGATION_BUTTONS_PATTERN.test(source)
  ) {
    return patched;
  }
  throw new Error("Sidebar navigation buttons target not found");
}

export function patchTerminalSidePanelAsset(assetsDir) {
  return findTerminalSidePanelAsset(assetsDir).assetPath;
}

export function patchTerminalActionAsset(assetsDir, terminalPatchTarget) {
  const patchTarget = findTerminalActionAsset(assetsDir, terminalPatchTarget);
  const source = fs.readFileSync(patchTarget.assetPath, "utf8");
  const patched = patchThreadOpenInPrimaryIconSource(
    patchTerminalNewTabMenuSource(
      patchTerminalActionSource(source, patchTarget),
    ),
  );
  if (patched !== source) {
    fs.writeFileSync(patchTarget.assetPath, patched);
  }
  return patchTarget.assetPath;
}

export function patchSidebarNavigationButtonsAsset(assetsDir) {
  const assetPath = findSidebarNavigationButtonsAsset(assetsDir);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchSidebarNavigationButtonsSource(source);
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return assetPath;
}

export function patchTerminalSidePanelSupport(assetsDir) {
  const terminalPatchTarget = findTerminalSidePanelAsset(assetsDir);
  return [
    patchTerminalActionAsset(assetsDir, terminalPatchTarget),
    patchSidebarNavigationButtonsAsset(assetsDir),
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

function replaceOnce(source, search, replacement, errorMessage) {
  const patched = source.replace(search, replacement);
  if (patched === source) {
    throw new Error(errorMessage);
  }
  return patched;
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
