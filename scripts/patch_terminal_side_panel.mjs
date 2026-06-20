#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PUBLIC_TERMINAL_EXPORT = "openSessionSandboxSidePanel";
const PUBLIC_BROWSER_PANEL_EXPORT =
  "openThreadBrowserSidePanelTabWithPendingState";
const PATCH_MARKER = "side_panel_terminal";

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

export function patchTerminalSidePanelSource(
  source,
  { functionName, openBrowserPanelFunctionName },
) {
  if (
    source.includes(PATCH_MARKER) &&
    source.includes("globalThis.location.origin")
  ) {
    return source;
  }

  const functionRange = findFunctionRange(source, functionName);
  const params = splitTopLevel(functionRange.params, ",").map((part) =>
    part.trim(),
  );
  const appScopeParam = paramName(params[0]);
  const conversationIdParam = paramName(params[1]);
  const cwdSymbol = findCurrentCwdSymbol(source);

  const replacement = `function ${functionName}(${functionRange.params}){let r=${appScopeParam}.get(${cwdSymbol});return ${openBrowserPanelFunctionName}(${appScopeParam},{browserConversationId:${conversationIdParam}??void 0,initialUrl:\`\${globalThis.location.origin}/__terminal?cwd=\${encodeURIComponent(r??\`\`)}\`,initiator:\`side_panel_terminal\`,source:\`manual\`,target:\`right\`,cwd:r??void 0})!=null}`;

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

export function patchTerminalSidePanelAsset(assetsDir) {
  const patchTarget = findTerminalSidePanelAsset(assetsDir);
  const source = fs.readFileSync(patchTarget.assetPath, "utf8");
  const patched = patchTerminalSidePanelSource(source, patchTarget);
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

export function patchTerminalSidePanelSupport(assetsDir) {
  const terminalPatchTarget = findTerminalSidePanelAsset(assetsDir);
  const source = fs.readFileSync(terminalPatchTarget.assetPath, "utf8");
  const patched = patchTerminalSidePanelSource(source, terminalPatchTarget);
  if (patched !== source) {
    fs.writeFileSync(terminalPatchTarget.assetPath, patched);
  }

  return [
    terminalPatchTarget.assetPath,
    patchTerminalActionAsset(assetsDir, terminalPatchTarget),
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
