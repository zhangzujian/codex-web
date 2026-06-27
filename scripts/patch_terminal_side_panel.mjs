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
const TERMINAL_COMMAND_REGISTRATION_PATTERN =
  /([$A-Za-z_][\w$]*)\(`toggleTerminal`,([$A-Za-z_][\w$]*)\);(?!codexWebInstallNativeTerminalShortcut)/;
const TERMINAL_CTRL_W_PATCH = "if(Z(t,`w`))return J(t),i(`\\x17`),!1;";
const LEGACY_KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION =
  "function codexWebRenderBottomTerminalPanels(e,t,n,r,i){if(e.panelId!==`bottom`||t==null||!Array.isArray(n)||!n.some(e=>typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`)))return t==null?(0,Q.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:i}):(0,Q.jsx)(Cn,{controller:e,tab:t},r);let a=n.filter(e=>e.tabId===t.tabId||typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`));return(0,Q.jsx)(Q.Fragment,{children:a.map(n=>{let r=n.tabId===t.tabId;return(0,Q.jsx)(`div`,{className:r?`contents`:`hidden`,children:(0,Q.jsx)(Cn,{controller:e,tab:n},n.tabId)},n.tabId)})})}";
const KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION =
  "function codexWebRenderTerminalPanels(e,t,n,r,i){if(t==null||!Array.isArray(n)||!n.some(e=>typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`)))return t==null?(0,Q.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:i}):(0,Q.jsx)(Cn,{controller:e,tab:t},r);let a=n.filter(e=>e.tabId===t.tabId||typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`));return(0,Q.jsx)(Q.Fragment,{children:a.map(n=>{let r=n.tabId===t.tabId;return(0,Q.jsx)(`div`,{className:r?`contents`:`hidden`,children:(0,Q.jsx)(Cn,{controller:e,tab:n},n.tabId)},n.tabId)})})}";
const MODERN_KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION =
  "function codexWebRenderTerminalPanels(e,t,n,r,i,a,o){if(t==null||!o)return a?(0,CU.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:i}):(0,CU.jsx)(`div`,{className:`flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary`,children:(0,CU.jsx)(J,{id:`appShell.tabPanel.worktreeProvisioning`,defaultMessage:`Available when the worktree is ready`,description:`Placeholder shown instead of tab content while a worktree is being provisioned`})});if(!Array.isArray(n)||!n.some(e=>typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`)))return(0,CU.jsx)(ZGt,{controller:e,tab:t},r);let s=n.filter(e=>e.tabId===t.tabId||typeof e?.tabId==`string`&&e.tabId.startsWith(`terminal:`));return(0,CU.jsx)(CU.Fragment,{children:s.map(n=>{let r=n.tabId===t.tabId;return(0,CU.jsx)(`div`,{className:r?`contents`:`hidden`,children:(0,CU.jsx)(ZGt,{controller:e,tab:n},n.tabId)},n.tabId)})})}";
const MODERN_TAB_PANEL_RENDER_PATTERN =
  /([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\?\(0,([$A-Za-z_][\w$]*)\.jsx\)\(([$A-Za-z_][\w$]*),\{controller:([$A-Za-z_][\w$]*),tab:([$A-Za-z_][\w$]*)\},([$A-Za-z_][\w$]*)\):([$A-Za-z_][\w$]*)\?\(0,\3\.jsx\)\(`div`,\{className:`relative min-h-0 flex-1`,children:([$A-Za-z_][\w$]*)\}\):\(0,\3\.jsx\)\(`div`,\{className:`flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary`,children:\(0,\3\.jsx\)\(([$A-Za-z_][\w$]*),\{id:`appShell\.tabPanel\.worktreeProvisioning`,defaultMessage:`Available when the worktree is ready`,description:`Placeholder shown instead of tab content while a worktree is being provisioned`\}\)\}\)/;
const BOTTOM_PANEL_UNMOUNT_CONDITION = "return!o&&!i?null:";
const BOTTOM_PANEL_KEEP_MOUNTED_CONDITION = "return!o&&!i&&t==null?null:";
const RIGHT_PANEL_UNMOUNT_CONDITION = "),!g&&!t?null:";
const RIGHT_PANEL_LEGACY_KEEP_MOUNTED_CONDITION = "),!g&&!t&&e==null?null:";
const RIGHT_PANEL_KEEP_MOUNTED_CONDITION =
  "),!t&&e==null&&rightPanelOutlet==null?null:";
const RIGHT_PANEL_REF_CACHE_PATCH =
  "let rightPanelChildrenCache=(0,Z.useRef)(null);rightPanelChildrenCache.current=r?.children??rightPanelChildrenCache.current;";
const RIGHT_PANEL_GLOBAL_CACHE_PATCH =
  "let rightPanelChildrenCache=globalThis.__codexWebRightPanelChildrenCache??=new Map,rightPanelChildren=r?.children??rightPanelChildrenCache.get(i.value.pathname)??null;r?.children!=null&&rightPanelChildrenCache.set(i.value.pathname,r.children);";

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
  const matches = [];
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
      const terminalActionFunctionName =
        findDirectTerminalActionFunctionName(source);
      if (terminalActionFunctionName != null) {
        matches.push({
          assetPath,
          terminalActionFunctionName,
        });
      }
      continue;
    }

    matches.push({
      assetPath,
      terminalActionFunctionName: findTerminalActionFunctionName(
        source,
        importedSpecifier.local,
      ),
    });
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unable to find terminal side panel action asset in ${assetsDir}`
        : `Expected one terminal side panel action asset, found ${matches.length}`,
    );
  }

  return matches[0];
}

function findNativeTerminalAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (
      source.includes("attachCustomKeyEventHandler") &&
      source.includes("data-codex-terminal")
    ) {
      return assetPath;
    }
  }

  throw new Error(`Unable to find native terminal asset in ${assetsDir}`);
}

function findAppShellTabPanelAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    if (
      source.includes("activeTabReactKey$") &&
      source.includes("data-app-shell-tab-panel-controller")
    ) {
      return assetPath;
    }
  }

  throw new Error(`Unable to find app shell tab panel asset in ${assetsDir}`);
}

export function patchTerminalActionSource(
  source,
  { terminalActionFunctionName },
) {
  let patched = source
    .replace(TERMINAL_NATIVE_SHORTCUT_FUNCTION_PATTERN, "")
    .replace(TERMINAL_BROWSER_SHORTCUT_FUNCTION, "")
    .replace(/;codexWebInstallTerminalBrowserShortcut\(\(\)=>\{[^}]*\}\)/g, "")
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
  patched = patchTerminalCommandNativeShortcutSource(patched);
  if (!patched.includes("codexWebInstallNativeTerminalShortcut(")) {
    throw new Error("Terminal native shortcut was not installed");
  }
  if (patched.includes("codexWebInstallTerminalBrowserShortcut")) {
    throw new Error("Terminal browser shortcut patch was not removed");
  }
  return patched;
}

function patchTerminalCommandNativeShortcutSource(source) {
  if (
    !source.includes("codexWebInstallNativeTerminalShortcut(") &&
    !TERMINAL_COMMAND_REGISTRATION_PATTERN.test(source)
  ) {
    throw new Error("Terminal command registration target not found");
  }

  if (
    source.includes("codexWebInstallNativeTerminalShortcut(") &&
    !source.includes(TERMINAL_NATIVE_SHORTCUT_FUNCTION)
  ) {
    return `${TERMINAL_NATIVE_SHORTCUT_FUNCTION}${source}`;
  }

  if (!TERMINAL_COMMAND_REGISTRATION_PATTERN.test(source)) {
    return source;
  }

  const patched = source.includes(TERMINAL_NATIVE_SHORTCUT_FUNCTION)
    ? source
    : `${TERMINAL_NATIVE_SHORTCUT_FUNCTION}${source}`;

  return patched.replace(
    TERMINAL_COMMAND_REGISTRATION_PATTERN,
    "$1(`toggleTerminal`,$2);codexWebInstallNativeTerminalShortcut($2);",
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

  return source;
}

export function patchTerminalNewTabMenuSource(source) {
  let patched = source;
  if (
    !patched.includes(
      "e.props?.codexWebIsTerminal!==!0&&e.codexWebIsTerminal!==!0",
    ) &&
    patched.includes("function it(e){return de(e)}")
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
      "initiator:`side_panel_menu`,source:`manual`",
      "browserTabId:crypto.randomUUID(),initiator:`side_panel_browser`,source:`manual`",
    );
    if (!patched.includes("initiator:`side_panel_browser`")) {
      throw new Error("Browser new tab action not found");
    }
  }

  return patched;
}

export function patchNativeTerminalCtrlWSource(source) {
  let patched = patchNativeTerminalFontSource(source);

  if (patched.includes(TERMINAL_CTRL_W_PATCH)) {
    return patched;
  }

  return replaceOnce(
    patched,
    "if(t.type!==`keydown`)return!0;",
    `if(t.type!==\`keydown\`)return!0;${TERMINAL_CTRL_W_PATCH}`,
    "Native terminal key handler target not found",
  );
}

export function patchKeepMountedTerminalPanelsSource(source) {
  const upgradedSource = source
    .replace(
      LEGACY_KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION,
      KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION,
    )
    .replace(
      /codexWebRenderBottomTerminalPanels/g,
      "codexWebRenderTerminalPanels",
    )
    .replace("`${n.tabId}:${r?`active`:`inactive`}`", "n.tabId")
    .replace(
      BOTTOM_PANEL_UNMOUNT_CONDITION,
      BOTTOM_PANEL_KEEP_MOUNTED_CONDITION,
    )
    .replace(RIGHT_PANEL_UNMOUNT_CONDITION, RIGHT_PANEL_KEEP_MOUNTED_CONDITION)
    .replace(
      RIGHT_PANEL_LEGACY_KEEP_MOUNTED_CONDITION,
      RIGHT_PANEL_KEEP_MOUNTED_CONDITION,
    )
    .replace("),!t&&e==null?null:", RIGHT_PANEL_KEEP_MOUNTED_CONDITION);
  const modernPanelPatch =
    findModernKeepMountedTerminalPanelsPatch(upgradedSource);
  const withHelper = upgradedSource.includes(
    KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION,
  )
    ? upgradedSource
    : upgradedSource.includes(MODERN_KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION)
      ? upgradedSource
      : upgradedSource.includes("function codexWebRenderTerminalPanels(")
        ? upgradedSource
        : modernPanelPatch != null
          ? `${upgradedSource.slice(0, modernPanelPatch.functionStart)}${modernPanelPatch.helper}${upgradedSource.slice(modernPanelPatch.functionStart)}`
          : upgradedSource.includes("function GGt(e){")
            ? replaceOnce(
                upgradedSource,
                "function GGt(e){",
                `${MODERN_KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION}function GGt(e){`,
                "App shell tab panel component target not found",
              )
            : replaceOnce(
                upgradedSource,
                "var Cn=(0,Z.memo)(function(e){",
                `${KEEP_MOUNTED_TERMINAL_PANELS_FUNCTION}var Cn=(0,Z.memo)(function(e){`,
                "App shell tab panel component target not found",
              );

  let withRightPanelCache = withHelper
    .replace(RIGHT_PANEL_REF_CACHE_PATCH, "")
    .replace(RIGHT_PANEL_GLOBAL_CACHE_PATCH, "")
    .replace("children:rightPanelChildrenCache.current", "children:r?.children")
    .replace("children:rightPanelChildren", "children:r?.children");
  if (!withRightPanelCache.includes("children:r?.children")) {
    throw new Error("Right panel children render target not found");
  }

  const hasLegacyRightPanelWrapper =
    withRightPanelCache.includes("children:[e,l]") ||
    withRightPanelCache.includes("children:[e,rightPanelOutlet]") ||
    withRightPanelCache.includes("let o=s(X),l=c(Se),u=c(I),");
  if (
    hasLegacyRightPanelWrapper &&
    !withRightPanelCache.includes("rightPanelOutletCache.current")
  ) {
    withRightPanelCache = replaceOnce(
      withRightPanelCache,
      "let o=s(X),l=c(Se),u=c(I),",
      "let o=s(X),l=c(Se),rightPanelOutletCache=(0,Z.useRef)(null);rightPanelOutletCache.current=l??rightPanelOutletCache.current;let rightPanelOutlet=l??rightPanelOutletCache.current,u=c(I),",
      "Right panel outlet cache target not found",
    );
  }
  if (withRightPanelCache.includes("children:[e,l]")) {
    withRightPanelCache = replaceOnce(
      withRightPanelCache,
      "children:[e,l]",
      "children:[e,rightPanelOutlet]",
      "Right panel outlet render target not found",
    );
  } else if (
    hasLegacyRightPanelWrapper &&
    !withRightPanelCache.includes("children:[e,rightPanelOutlet]")
  ) {
    throw new Error("Right panel outlet render target not found");
  }

  if (withRightPanelCache.includes("codexWebRenderTerminalPanels(s,u,l,d,a)")) {
    return withRightPanelCache;
  }
  if (
    withRightPanelCache.includes("codexWebRenderTerminalPanels(s,l,c,u,a,h,g)")
  ) {
    return withRightPanelCache;
  }
  if (
    /[$A-Za-z_][\w$]*=codexWebRenderTerminalPanels\(/.test(withRightPanelCache)
  ) {
    return withRightPanelCache;
  }

  const modernPanelReplacement =
    findModernKeepMountedTerminalPanelsPatch(withRightPanelCache);
  if (modernPanelReplacement != null) {
    return replaceOnce(
      withRightPanelCache,
      modernPanelReplacement.renderSource,
      modernPanelReplacement.renderReplacement,
      "Active tab panel render target not found",
    );
  }

  if (withRightPanelCache.includes("function GGt(e){")) {
    return replaceOnce(
      withRightPanelCache,
      "y=g?(0,CU.jsx)(ZGt,{controller:s,tab:l},u):h?(0,CU.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:a}):(0,CU.jsx)(`div`,{className:`flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary`,children:(0,CU.jsx)(J,{id:`appShell.tabPanel.worktreeProvisioning`,defaultMessage:`Available when the worktree is ready`,description:`Placeholder shown instead of tab content while a worktree is being provisioned`})})",
      "y=codexWebRenderTerminalPanels(s,l,c,u,a,h,g)",
      "Active tab panel render target not found",
    );
  }

  return replaceOnce(
    withRightPanelCache,
    "let _;t[12]!==u||t[13]!==d||t[14]!==s||t[15]!==a?(_=u==null?(0,Q.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:a}):(0,Q.jsx)(Cn,{controller:s,tab:u},d),t[12]=u,t[13]=d,t[14]=s,t[15]=a,t[16]=_):_=t[16];",
    "let _=codexWebRenderTerminalPanels(s,u,l,d,a);",
    "Active tab panel render target not found",
  );
}

function findModernKeepMountedTerminalPanelsPatch(source) {
  const match = source.match(MODERN_TAB_PANEL_RENDER_PATTERN);
  if (match == null || match.index == null) {
    return null;
  }

  const [
    renderSource,
    assignmentVar,
    visibleVar,
    jsxNamespace,
    panelComponent,
    controllerVar,
    activeTabVar,
    reactKeyVar,
    workspaceReadyVar,
    emptyStateVar,
    placeholderComponent,
  ] = match;
  const functionStart = source.lastIndexOf("function ", match.index);
  if (functionStart === -1) {
    return null;
  }

  const tabsVar = findModernTabsVariable(
    source.slice(functionStart, match.index),
    controllerVar,
    activeTabVar,
    reactKeyVar,
  );
  if (tabsVar == null) {
    return null;
  }

  return {
    functionStart,
    helper: buildModernKeepMountedTerminalPanelsFunction({
      jsxNamespace,
      panelComponent,
      placeholderComponent,
    }),
    renderSource,
    renderReplacement: `${assignmentVar}=codexWebRenderTerminalPanels(${controllerVar},${activeTabVar},${tabsVar},${reactKeyVar},${emptyStateVar},${workspaceReadyVar},${visibleVar})`,
  };
}

function findModernTabsVariable(
  source,
  controllerVar,
  activeTabVar,
  reactKeyVar,
) {
  const identifier = "([$A-Za-z_][\\w$]*)";
  const call = "[$A-Za-z_][\\w$]*";
  const pattern = new RegExp(
    `${identifier}=${call}\\(${escapeRegExp(controllerVar)}\\.tabs\\$\\),${escapeRegExp(activeTabVar)}=${call}\\(${escapeRegExp(controllerVar)}\\.activeTab\\$\\),${escapeRegExp(reactKeyVar)}=${call}\\(${escapeRegExp(controllerVar)}\\.activeTabReactKey\\$\\)`,
  );
  return source.match(pattern)?.[1] ?? null;
}

function buildModernKeepMountedTerminalPanelsFunction({
  jsxNamespace,
  panelComponent,
  placeholderComponent,
}) {
  return `function codexWebRenderTerminalPanels(e,t,n,r,i,a,o){if(t==null||!o)return a?(0,${jsxNamespace}.jsx)(\`div\`,{className:\`relative min-h-0 flex-1\`,children:i}):(0,${jsxNamespace}.jsx)(\`div\`,{className:\`flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary\`,children:(0,${jsxNamespace}.jsx)(${placeholderComponent},{id:\`appShell.tabPanel.worktreeProvisioning\`,defaultMessage:\`Available when the worktree is ready\`,description:\`Placeholder shown instead of tab content while a worktree is being provisioned\`})});if(!Array.isArray(n)||!n.some(e=>typeof e?.tabId==\`string\`&&e.tabId.startsWith(\`terminal:\`)))return(0,${jsxNamespace}.jsx)(${panelComponent},{controller:e,tab:t},r);let s=n.filter(e=>e.tabId===t.tabId||typeof e?.tabId==\`string\`&&e.tabId.startsWith(\`terminal:\`));return(0,${jsxNamespace}.jsx)(${jsxNamespace}.Fragment,{children:s.map(n=>{let r=n.tabId===t.tabId;return(0,${jsxNamespace}.jsx)(\`div\`,{className:r?\`contents\`:\`hidden\`,children:(0,${jsxNamespace}.jsx)(${panelComponent},{controller:e,tab:n},n.tabId)},n.tabId)})})}`;
}

function patchNativeTerminalFontSource(source) {
  return source
    .replace(
      /fontFamily:(?!window\.__CODEX_WEB_TERMINAL_FONT__\?\?)([$A-Za-z_][\w$]*\.current)/,
      "fontFamily:window.__CODEX_WEB_TERMINAL_FONT__??$1",
    )
    .replace(
      /(\.options\.fontFamily=)(?!window\.__CODEX_WEB_TERMINAL_FONT__\?\?)([$A-Za-z_][\w$]*)/,
      "$1window.__CODEX_WEB_TERMINAL_FONT__??$2",
    );
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

export function patchNativeTerminalCtrlWAsset(assetsDir) {
  const assetPath = findNativeTerminalAsset(assetsDir);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchNativeTerminalCtrlWSource(source);
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return assetPath;
}

export function patchKeepMountedTerminalPanelsAsset(assetsDir) {
  const assetPath = findAppShellTabPanelAsset(assetsDir);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchKeepMountedTerminalPanelsSource(source);
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return assetPath;
}

export function patchTerminalSidePanelSupport(assetsDir) {
  const terminalPatchTarget = findTerminalSidePanelAsset(assetsDir);
  return [
    patchTerminalActionAsset(assetsDir, terminalPatchTarget),
    patchNativeTerminalCtrlWAsset(assetsDir),
    patchKeepMountedTerminalPanelsAsset(assetsDir),
  ];
}

function resolvePublicExport(assetsDir, publicName) {
  const matches = [];
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
      matches.push(
        resolveLocalBinding(assetsDir, assetPath, source, specifier.local),
      );
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unable to find ${publicName} export in ${assetsDir}`
        : `Expected one ${publicName} export, found ${matches.length}`,
    );
  }

  return matches[0];
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
    "g",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unable to find terminal action wrapper for ${terminalOpenerName}`
        : `Expected one terminal action wrapper for ${terminalOpenerName}, found ${matches.length}`,
    );
  }
  return matches[0][1];
}

function findDirectTerminalActionFunctionName(source) {
  const pattern =
    /id:`terminal`[\s\S]{0,220}?\bonSelect:([$A-Za-z_][\w$]*)[\s\S]{0,240}?thread\.sidePanel\.newTab\.terminal\.title/;
  const match = pattern.exec(source);
  return match?.[1] ?? null;
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

function escapeRegExp(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
