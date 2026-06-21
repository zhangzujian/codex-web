#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PUBLIC_TERMINAL_EXPORT = "openSessionSandboxSidePanel";
const PUBLIC_BROWSER_PANEL_EXPORT =
  "openThreadBrowserSidePanelTabWithPendingState";
const PATCH_MARKER = "side_panel_terminal";
const TERMINAL_KEYBOARD_SHORTCUT_SYMBOL =
  "codexWebTerminalKeyboardShortcut";
const TERMINAL_BROWSER_SHORTCUT_FUNCTION =
  "function codexWebInstallTerminalBrowserShortcut(e){let t=globalThis;if(t.codexWebTerminalBrowserShortcutHandler)document.removeEventListener(`keydown`,t.codexWebTerminalBrowserShortcutHandler,!0);let n=t.codexWebTerminalBrowserShortcutHandler=t=>{if(t.ctrlKey&&!t.metaKey&&!t.altKey&&!t.shiftKey&&t.code===`Backquote`){t.preventDefault();e()}};document.addEventListener(`keydown`,n,!0)}";
const TERMINAL_BROWSER_CHROME_MARKER = "codexWebIsTerminalTab";
const TERMINAL_SETTINGS_PARENT_CLOSE_MARKER =
  "codexWebCloseTerminalSettingsOnOutsidePointer";
const TERMINAL_EXIT_PARENT_CLOSE_MARKER = "codexWebCloseTerminalTabOnExit";
const TERMINAL_EXIT_PARENT_CLOSE_SCRIPT =
  "function codexWebCloseTerminalTabOnExit(e){if(e.origin!==globalThis.location.origin||e.data?.type!==`codex-web-terminal-exit`)return;let t=[...document.querySelectorAll(`iframe[data-codex-web-browser-panel-frame][src*=\"/__terminal\"]`)].find(t=>t.contentWindow===e.source),n=t?.dataset.browserSidebarBrowserTabId;if(!n)return;document.querySelector(`[data-app-shell-tab-controller][data-tab-id=\"${n}\"] button:not([role=\"tab\"])`)?.click()}window.addEventListener(`message`,codexWebCloseTerminalTabOnExit);";
const OLD_TERMINAL_EXIT_PARENT_CLOSE_EFFECT =
  "(0,Q.useEffect)(()=>{if(!codexWebIsTerminalTab)return;let e=e=>{if(e.origin!==globalThis.location.origin||e.data?.type!==`codex-web-terminal-exit`||e.source!==L.current?.querySelector(`iframe`)?.contentWindow)return;Mr(y).closeTab(b,n)};return window.addEventListener(`message`,e),()=>window.removeEventListener(`message`,e)},[codexWebIsTerminalTab,b,n,y]);";
const OLD_BROKEN_TERMINAL_EXIT_PARENT_CLOSE =
  ",codexWebTerminalExitTab=X.url?.includes(`/__terminal`)===!0;(0,Q.useEffect)(()=>{if(!codexWebTerminalExitTab)return;let e=e=>{if(e.origin!==globalThis.location.origin||e.data?.type!==`codex-web-terminal-exit`||e.source!==L.current?.querySelector(`iframe`)?.contentWindow)return;Mr(y).closeTab(b,n)};return window.addEventListener(`message`,e),()=>window.removeEventListener(`message`,e)},[codexWebTerminalExitTab,b,n,y]);";
const APPLICATION_MENU_PATCH_MARKER = "codexWebDisableApplicationMenu";
const APPLICATION_MENU_FEATURE_PATTERN =
  /function\s+([$A-Za-z_][\w$]*)\(\)\{return yt\(\)&&window\.electronBridge\?\.showApplicationMenu!=null\}/;
const TERMINAL_TAB_ICON_FUNCTION =
  "function codexWebTerminalTabIcon(e){return Q.createElement(`svg`,{width:20,height:20,viewBox:`0 0 20 20`,fill:`none`,xmlns:`http://www.w3.org/2000/svg`,...e},Q.createElement(`path`,{d:`M13.334 12.2529C13.701 12.2533 13.999 12.5509 13.999 12.918C13.9988 13.2849 13.7008 13.5827 13.334 13.583H6.66699C6.29984 13.583 6.00215 13.2851 6.00195 12.918C6.00195 12.5507 6.29972 12.2529 6.66699 12.2529H13.334Z`,fill:`currentColor`}),Q.createElement(`path`,{fillRule:`evenodd`,clipRule:`evenodd`,d:`M15 3.08594C16.748 3.08594 18.165 4.503 18.165 6.25098V13.751C18.165 15.499 16.748 16.916 15 16.916H5C3.25202 16.916 1.83496 15.499 1.83496 13.751V6.25098C1.83496 4.503 3.25202 3.08594 5 3.08594H15ZM5 4.41602C3.98656 4.41602 3.16504 5.23753 3.16504 6.25098V13.751C3.16504 14.7644 3.98656 15.5859 5 15.5859H15C16.0134 15.5859 16.835 14.7644 16.835 13.751V6.25098C16.835 5.23753 16.0134 4.41602 15 4.41602H5Z`,fill:`currentColor`}))}";
const SAFE_FAVICON_FUNCTION =
  "function codexWebSafeFaviconUrl(e){if(typeof e!=`string`)return null;try{let t=new URL(e,globalThis.location.href);return globalThis.location.protocol===`https:`&&t.protocol===`http:`?null:t.href}catch{return null}}";
const OLD_TERMINAL_LOCALE_HELPER_FUNCTION =
  "function codexWebTerminalLocale(){let e=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`],t=[];for(let n of e)try{let e=localStorage.getItem(n);if(e){t.push(e);try{let n=JSON.parse(e);typeof n==`string`?t.push(n):n&&typeof n==`object`&&t.push(n.locale,n.language,n.appLocale,n.appLanguage)}catch{}}}catch{}t.push(document.documentElement.lang);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}";
const TERMINAL_LOCALE_HELPER_FUNCTION =
  "function codexWebTerminalLocale(e){let t=[e],n=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`];for(let e of n)try{let n=localStorage.getItem(e);if(n){t.push(n);try{let e=JSON.parse(n);typeof e==`string`?t.push(e):e&&typeof e==`object`&&t.push(e.locale,e.language,e.appLocale,e.appLanguage,e.ideLocale,e.value)}catch{}}}catch{}t.push(document.documentElement.lang);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}";
const TERMINAL_SETTINGS_PARENT_CLOSE_SCRIPT =
  'function codexWebCloseTerminalSettingsOnOutsidePointer(e){let t=e.target,n=t instanceof Element?t:t instanceof Node?t.parentElement:null;if(n?.closest(`[data-codex-web-terminal-tab="true"]`)!=null)return;document.querySelectorAll(`iframe[data-codex-web-browser-panel-frame][src*="/__terminal"]`).forEach(e=>e.contentWindow?.postMessage({type:`codex-web-terminal-close-settings`},globalThis.location.origin))}document.addEventListener(`pointerdown`,codexWebCloseTerminalSettingsOnOutsidePointer,!0);';

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
      terminalOpenerFunctionName: importedSpecifier.local,
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
  const params = splitTopLevel(functionRange.params, ",").map((part) =>
    part.trim(),
  );
  const appScopeParam = paramName(params[0]);
  const conversationIdParam = paramName(params[1]);
  const cwdSymbol = findCurrentCwdSymbol(source);
  const appIntlSymbol = findAppIntlSymbol(source);
  const randomUuidSymbol = findRandomUuidSymbol(source);
  const localeExpression = `codexWebTerminalLocale(${appScopeParam}.get(${appIntlSymbol})?.locale)`;

  if (
    functionSource.includes(PATCH_MARKER) &&
    functionSource.includes("globalThis.location.origin") &&
    functionSource.includes(localeExpression) &&
    functionSource.includes("terminalConversationId=") &&
    functionSource.includes("terminalBrowserTabId=")
  ) {
    return patchTerminalLocaleHelperSource(source);
  }

  const replacement = `function ${functionName}(${functionRange.params}){let r=${appScopeParam}.get(${cwdSymbol}),i=${localeExpression},c=${randomUuidSymbol}(crypto.randomUUID()),l=${randomUuidSymbol}(crypto.randomUUID());return ${openBrowserPanelFunctionName}(${appScopeParam},{browserConversationId:c,browserTabId:l,initialUrl:\`\${globalThis.location.origin}/__terminal?cwd=\${encodeURIComponent(r??\`\`)}\${i?\`&locale=\${encodeURIComponent(i)}\`:\`\`}&terminalConversationId=\${encodeURIComponent(c)}&terminalBrowserTabId=\${encodeURIComponent(l)}\`,initiator:\`side_panel_terminal\`,source:\`manual\`,target:\`right\`,cwd:r??void 0})!=null}`;
  return patchTerminalLocaleHelperSource(
    source.slice(0, functionRange.start) +
      replacement +
      source.slice(functionRange.end),
  );
}

function patchTerminalLocaleHelperSource(source) {
  if (source.includes(TERMINAL_LOCALE_HELPER_FUNCTION)) {
    return source;
  }

  if (source.includes(OLD_TERMINAL_LOCALE_HELPER_FUNCTION)) {
    return source.replace(
      OLD_TERMINAL_LOCALE_HELPER_FUNCTION,
      TERMINAL_LOCALE_HELPER_FUNCTION,
    );
  }

  return TERMINAL_LOCALE_HELPER_FUNCTION + source;
}

export function patchTerminalActionSource(
  source,
  { terminalActionFunctionName, terminalOpenerFunctionName },
) {
  let patched = patchTerminalActionKeyboardShortcutSource(source);
  const actionPattern =
    /(id:`terminal`[\s\S]{0,160}?onSelect\s*:\s*)[$A-Za-z_][\w$]*((?:\s*,\s*keyboardShortcut:[^,}]+)?\s*,\s*title\s*:\s*\(0,[\s\S]{0,180}?thread\.sidePanel\.newTab\.terminal\.title)/;
  const match = actionPattern.exec(patched);
  if (!match) {
    throw new Error("Terminal side panel action handler not found");
  }

  const currentHandler = patched.slice(
    match.index + match[1].length,
    match.index + match[0].length - match[2].length,
  );
  if (currentHandler !== terminalActionFunctionName) {
    patched =
      patched.slice(0, match.index) +
      `${match[1]}${terminalActionFunctionName}${match[2]}` +
      patched.slice(match.index + match[0].length);
  }

  return patchTerminalActionBrowserShortcutSource(
    patchTerminalCommandBrowserShortcutSource(
      patchTerminalActionKeyboardShortcutField(
        removeTerminalCommandBrowserShortcutSource(patched),
        terminalActionFunctionName,
      ),
      terminalOpenerFunctionName,
    ),
    terminalActionFunctionName,
  );
}

function patchTerminalCommandBrowserShortcutSource(
  source,
  terminalOpenerFunctionName,
) {
  if (!terminalOpenerFunctionName || !source.includes("Ne(`toggleTerminal`,")) {
    return source;
  }
  if (
    source.includes(
      `codexWebInstallTerminalBrowserShortcut(()=>{${terminalOpenerFunctionName}(`,
    )
  ) {
    return source;
  }

  const commandPattern =
    /(\b([$A-Za-z_][\w$]*)=o\(U\)[\s\S]{0,700}?Ne\(`toggleTerminal`,[$A-Za-z_][\w$]*\);)(?!codexWebInstallTerminalBrowserShortcut)/;
  return replaceOnce(
    source,
    commandPattern,
    `$1codexWebInstallTerminalBrowserShortcut(()=>{${terminalOpenerFunctionName}($2)});`,
    "Terminal browser shortcut command registration target not found",
  );
}

function patchTerminalActionBrowserShortcutSource(
  source,
  terminalActionFunctionName,
) {
  const installCall = `codexWebInstallTerminalBrowserShortcut(${terminalActionFunctionName})`;
  let patched = source.includes(TERMINAL_BROWSER_SHORTCUT_FUNCTION)
    ? source
    : `${TERMINAL_BROWSER_SHORTCUT_FUNCTION}${source}`;

  const terminalActionPattern =
    /id:`terminal`[\s\S]{0,300}?thread\.sidePanel\.newTab\.terminal\.title/;
  const terminalActionMatch = terminalActionPattern.exec(patched);
  if (!terminalActionMatch) {
    throw new Error("Terminal browser shortcut action target not found");
  }

  const objectStart = patched.lastIndexOf("{", terminalActionMatch.index);
  if (objectStart === -1) {
    throw new Error("Terminal browser shortcut object start not found");
  }
  if (
    patched.slice(objectStart - installCall.length - 2, objectStart) ===
    `(${installCall},`
  ) {
    return patched;
  }

  const objectEnd = findMatchingDelimiter(patched, objectStart, "{", "}") + 1;
  const objectSource = patched.slice(objectStart, objectEnd);
  if (objectSource.includes(installCall)) {
    return patched;
  }
  if (!objectSource.includes(`onSelect:${terminalActionFunctionName}`)) {
    throw new Error("Terminal browser shortcut handler target not found");
  }

  return (
    patched.slice(0, objectStart) +
    `(${installCall},` +
    objectSource +
    ")" +
    patched.slice(objectEnd)
  );
}

function patchTerminalActionKeyboardShortcutSource(source) {
  if (
    source.includes(
      `${TERMINAL_KEYBOARD_SHORTCUT_SYMBOL}=i(J,\`toggleTerminal\`)`,
    )
  ) {
    return source;
  }

  return replaceOnce(
    source,
    /(\b[$A-Za-z_][\w$]*=i\(J,`openReviewTab`\),)/,
    `$1${TERMINAL_KEYBOARD_SHORTCUT_SYMBOL}=i(J,\`toggleTerminal\`),`,
    "Terminal keyboard shortcut signal target not found",
  );
}

function patchTerminalActionKeyboardShortcutField(
  source,
  terminalActionFunctionName,
) {
  const terminalActionPattern =
    /id:`terminal`[\s\S]{0,260}?thread\.sidePanel\.newTab\.terminal\.title/;
  const terminalActionMatch = terminalActionPattern.exec(source);
  if (!terminalActionMatch) {
    throw new Error("Terminal side panel action shortcut target not found");
  }
  if (terminalActionMatch[0].includes("keyboardShortcut:")) {
    return source;
  }

  const shortcutPattern = new RegExp(
    `(id:\\\`terminal\\\`[\\s\\S]{0,180}?onSelect\\s*:\\s*${escapeRegex(
      terminalActionFunctionName,
    )})(\\s*,\\s*title\\s*:\\s*\\(0,[\\s\\S]{0,180}?thread\\.sidePanel\\.newTab\\.terminal\\.title)`,
  );

  return replaceOnce(
    source,
    shortcutPattern,
    `$1,keyboardShortcut:${TERMINAL_KEYBOARD_SHORTCUT_SYMBOL}$2`,
    "Terminal side panel action shortcut insertion target not found",
  );
}

function removeTerminalCommandBrowserShortcutSource(source) {
  return source.replace(
    /Ne\(`toggleTerminal`,([$A-Za-z_][\w$]*)\);codexWebInstallTerminalBrowserShortcut\(\1\);/g,
    "Ne(`toggleTerminal`,$1);",
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
    primaryIconIndexBefore === -1 ? primaryIconIndexAfter : primaryIconIndexBefore;
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

export function patchTerminalBrowserPanelOpenSource(
  source,
  { openBrowserPanelFunctionName },
) {
  const functionRange = findFunctionRange(source, openBrowserPanelFunctionName);
  let functionSource = source.slice(functionRange.start, functionRange.end);
  const initiatorSymbol = findDestructuredParamSymbol(
    functionRange.params,
    "initiator",
  );
  const browserTabIdSymbol = findDestructuredParamSymbol(
    functionRange.params,
    "browserTabId",
  );
  const targetSymbol = findDestructuredParamSymbol(
    functionRange.params,
    "target",
  );
  const terminalInitiatorCondition = `${initiatorSymbol}===\`side_panel_terminal\`||${initiatorSymbol}===\`side_panel_browser\``;

  if (
    !functionSource.includes(
      `${terminalInitiatorCondition}?${browserTabIdSymbol}??crypto.randomUUID():Hp`,
    )
  ) {
    const tabIdPattern = new RegExp(
      `let\\s+([$A-Za-z_][\\w$]*)=Hp\\(([^)]*${escapeRegex(browserTabIdSymbol)})\\),`,
    );
    const tabIdMatch = tabIdPattern.exec(functionSource);
    if (!tabIdMatch) {
      throw new Error("Browser panel tab id resolution not found");
    }
    functionSource =
      functionSource.slice(0, tabIdMatch.index) +
      `let ${tabIdMatch[1]}=${terminalInitiatorCondition}?${browserTabIdSymbol}??crypto.randomUUID():Hp(${tabIdMatch[2]}),` +
      functionSource.slice(tabIdMatch.index + tabIdMatch[0].length);
  }

  const tabSelectionPattern = new RegExp(
    `let\\s+([$A-Za-z_][\\w$]*)=${escapeRegex(targetSymbol)}===\\\`right\\\`\\?([^;]+);return`,
  );
  const match = tabSelectionPattern.exec(functionSource);
  if (match) {
    const rightPanelExpression = match[2];
    const requestedTabIdSymbol =
      rightPanelExpression.match(/:([$A-Za-z_][\w$]*)$/)?.[1];
    if (!requestedTabIdSymbol) {
      throw new Error("Unable to infer requested browser tab id symbol");
    }

    functionSource =
      functionSource.slice(0, match.index) +
      `let ${match[1]}=${terminalInitiatorCondition}?${requestedTabIdSymbol}:${targetSymbol}===\`right\`?${rightPanelExpression};return` +
      functionSource.slice(match.index + match[0].length);
  } else if (
    !functionSource.includes(
      `${terminalInitiatorCondition}?${browserTabIdSymbol}`,
    )
  ) {
    throw new Error("Browser panel tab selection not found");
  }

  if (
    !functionSource.includes(
      `codexWebPreserveBrowserTabId:${terminalInitiatorCondition}`,
    )
  ) {
    const openTabPattern = new RegExp(
      `!Ip\\(([$A-Za-z_][\\w$]*),!0,\\{browserConversationId:([$A-Za-z_][\\w$]*),browserHostDisplayName:([$A-Za-z_][\\w$]*),browserTabId:([$A-Za-z_][\\w$]*),cwd:([$A-Za-z_][\\w$]*),insertAfterTabId:([$A-Za-z_][\\w$]*)\\},${escapeRegex(targetSymbol)}\\)`,
    );
    const openTabMatch = openTabPattern.exec(functionSource);
    if (!openTabMatch) {
      throw new Error("Browser panel openTab call not found");
    }
    functionSource =
      functionSource.slice(0, openTabMatch.index) +
      `!Ip(${openTabMatch[1]},!0,{codexWebPreserveBrowserTabId:${terminalInitiatorCondition},browserConversationId:${openTabMatch[2]},browserHostDisplayName:${openTabMatch[3]},browserTabId:${openTabMatch[4]},cwd:${openTabMatch[5]},insertAfterTabId:${openTabMatch[6]}},${targetSymbol})` +
      functionSource.slice(openTabMatch.index + openTabMatch[0].length);
  }
  if (!functionSource.includes("codexWebIsTerminal:")) {
    functionSource = replaceOnce(
      functionSource,
      `codexWebPreserveBrowserTabId:${terminalInitiatorCondition},`,
      `codexWebIsTerminal:${initiatorSymbol}===\`side_panel_terminal\`,codexWebPreserveBrowserTabId:${terminalInitiatorCondition},`,
      "Browser panel terminal marker option not found",
    );
  }

  return (
    source.slice(0, functionRange.start) +
    functionSource +
    source.slice(functionRange.end)
  );
}

export function patchTerminalBrowserTabMarkerSource(source) {
  let patched = source;

  if (
    !patched.includes(
      "codexWebPreserveBrowserTabId===!0?n.browserTabId??crypto.randomUUID():Hp",
    )
  ) {
    patched = patched.replace(
      /let\s+([$A-Za-z_][\w$]*)=Hp\(([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*)\.browserTabId\),/,
      "let $1=$4.codexWebPreserveBrowserTabId===!0?$4.browserTabId??crypto.randomUUID():Hp($2,$3,$4.browserTabId),",
    );
    if (
      !patched.includes(
        "codexWebPreserveBrowserTabId===!0?n.browserTabId??crypto.randomUUID():Hp",
      )
    ) {
      throw new Error("Browser tab id preservation target not found");
    }
  }

  if (!patched.includes("n.codexWebIsTerminal===!0||u.isTerminal===!0")) {
    patched = replaceOnce(
      patched,
      "),d=Mr(c),f=s?.tab??e.get(d.tabById$,o),p=u.preserveExistingTitle&&f?.title!=null?f.title:u.title,m=n.browserHostDisplayName??e.get(kr).display_name,g=n.cwd??e.get(Or);return",
      "),y=n.codexWebIsTerminal===!0||u.isTerminal===!0,d=Mr(c),f=s?.tab??e.get(d.tabById$,o),p=y?(n.cwd?.split(/[\\\\/]/).filter(Boolean).at(-1)??e.get(Rr).formatMessage({id:`codexWeb.terminal.title`,defaultMessage:`Terminal`})):u.preserveExistingTitle&&f?.title!=null?f.title:u.title,m=n.browserHostDisplayName??e.get(kr).display_name,g=n.cwd??e.get(Or);return",
      "Browser tab terminal initial metadata target not found",
    );
  }
  patched = replaceIfPresent(
    patched,
    "??`Terminal`):u.preserveExistingTitle",
    "??e.get(Rr).formatMessage({id:`codexWeb.terminal.title`,defaultMessage:`Terminal`})):u.preserveExistingTitle",
  );

  patched = patched.replaceAll("icon:u.isTerminal?", "icon:y?");
  patched = patched.replaceAll(
    "codexWebIsTerminal:u.isTerminal===!0",
    "codexWebIsTerminal:y",
  );
  patched = patchTerminalBrowserTabKindSource(patched);

  if (
    !patched.includes(
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:c,codexWebIsTerminal:y",
    )
  ) {
    patched = replaceOnce(
      patched,
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:c},id:o,",
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:c,codexWebIsTerminal:y},codexWebIsTerminal:y,id:o,",
      "Browser tab props target not found",
    );
  }
  if (
    !patched.includes(
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:t.panelId,codexWebIsTerminal:y}",
    )
  ) {
    patched = replaceIfPresent(
      patched,
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:t.panelId}})",
      "props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:t.panelId,codexWebIsTerminal:y}})",
    );
  }

  if (!patched.includes("updateTab(d,l,{codexWebIsTerminal:")) {
    patched = replaceIfPresent(
      patched,
      "w.updateTab(d,l,{icon:S.isTerminal?",
      "w.updateTab(d,l,{codexWebIsTerminal:S.isTerminal===!0,icon:S.isTerminal?",
    );
    patched = replaceIfPresent(
      patched,
      "w.updateTab(d,l,{icon:",
      "w.updateTab(d,l,{codexWebIsTerminal:S.isTerminal===!0,icon:",
    );
    patched = replaceIfPresent(
      patched,
      "w.updateTab(d,l,{highlightedIcon:",
      "w.updateTab(d,l,{codexWebIsTerminal:S.isTerminal===!0,highlightedIcon:",
    );
  }
  if (
    !patched.includes(
      "let r=a!=null&&a!==i&&S.title===i,e=r||S.preserveExistingTitle",
    )
  ) {
    patched = replaceIfPresent(
      patched,
      "T=()=>{let e=S.preserveExistingTitle&&a!=null?a:S.title;w.updateTab(d,l,{codexWebIsTerminal:S.isTerminal===!0,highlightedIcon:",
      "T=()=>{let r=a!=null&&a!==i&&S.title===i,e=r||S.preserveExistingTitle&&a!=null?a:S.title;w.updateTab(d,l,{codexWebIsTerminal:r||S.isTerminal===!0,highlightedIcon:",
    );
    patched = replaceIfPresent(
      patched,
      "icon:S.isTerminal?(0,$.jsx)(codexWebTerminalTabIcon",
      "icon:r||S.isTerminal?(0,$.jsx)(codexWebTerminalTabIcon",
    );
    patched = replaceIfPresent(
      patched,
      "icon:S.isTerminal?Q.createElement(codexWebTerminalTabIcon",
      "icon:r||S.isTerminal?Q.createElement(codexWebTerminalTabIcon",
    );
  }

  if (!patched.includes("codexWebIsTerminal:")) {
    throw new Error("Browser tab terminal marker target not found");
  }

  return patched;
}

function patchTerminalBrowserTabKindSource(source) {
  const functionRange = findFunctionRange(source, "Ip");
  let functionSource = source.slice(functionRange.start, functionRange.end);

  if (!functionSource.includes("kind:y?dt.SANDBOX:dt.BROWSER")) {
    functionSource = replaceOnce(
      functionSource,
      "kind:dt.BROWSER",
      "kind:y?dt.SANDBOX:dt.BROWSER",
      "Browser tab kind target not found",
    );
  }

  return (
    source.slice(0, functionRange.start) +
    functionSource +
    source.slice(functionRange.end)
  );
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

export function patchTerminalBrowserChromeSource(source) {
  if (
    isTerminalBrowserChromePatched(source) &&
    isTerminalBrowserTabSnapshotPatched(source)
  ) {
    return source;
  }

  let patched = source;
  patched = patchTerminalSettingsParentCloseSource(patched);
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
  patched = patchTerminalExitParentCloseSource(patched);

  return patched;
}

function patchTerminalExitParentCloseSource(source) {
  let patched = source
    .replace(OLD_BROKEN_TERMINAL_EXIT_PARENT_CLOSE, ",")
    .replace(OLD_TERMINAL_EXIT_PARENT_CLOSE_EFFECT, "");
  if (patched.includes(TERMINAL_EXIT_PARENT_CLOSE_MARKER)) {
    return patched;
  }

  return `${TERMINAL_EXIT_PARENT_CLOSE_SCRIPT}${patched}`;
}

function patchTerminalSettingsParentCloseSource(source) {
  if (source.includes(TERMINAL_SETTINGS_PARENT_CLOSE_MARKER)) {
    return source;
  }

  return `${TERMINAL_SETTINGS_PARENT_CLOSE_SCRIPT}${source}`;
}

function patchTerminalTabIconFunction(source) {
  const helpers = [
    source.includes("function codexWebSafeFaviconUrl")
      ? ""
      : SAFE_FAVICON_FUNCTION,
    source.includes("function codexWebTerminalTabIcon")
      ? ""
      : TERMINAL_TAB_ICON_FUNCTION,
  ].join("");
  if (!helpers) {
    return source;
  }

  if (
    source.includes("var fs=`about:blank#codex-browser-sidebar-attach-token=`")
  ) {
    return source.replace(
      "var fs=`about:blank#codex-browser-sidebar-attach-token=`",
      `${helpers}var fs=\`about:blank#codex-browser-sidebar-attach-token=\``,
    );
  }

  return `${helpers}${source}`;
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
  if (!patched.includes("faviconUrl:codexWebSafeFaviconUrl(")) {
    patched = replaceOnce(
      patched,
      "return{faviconUrl:i?e.faviconUrl:null,",
      "return{faviconUrl:codexWebSafeFaviconUrl(i?e.faviconUrl:null),",
      "Browser favicon URL target not found",
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
    source.includes(TERMINAL_SETTINGS_PARENT_CLOSE_MARKER) &&
    source.includes("codexWebIsTerminalTab?`grid-rows-[1fr]`") &&
    source.includes("children:[codexWebIsTerminalTab?null:") &&
    source.includes("codexWebSafeFaviconUrl") &&
    source.includes("codexWebTerminalTabIcon") &&
    source.includes(TERMINAL_EXIT_PARENT_CLOSE_MARKER) &&
    !source.includes("codexWebTerminalExitTab")
  );
}

function isTerminalBrowserTabSnapshotPatched(source) {
  return (
    source.includes("isTerminal:") &&
    source.includes("faviconUrl:codexWebSafeFaviconUrl(") &&
    (source.includes("S.isTerminal?") || source.includes("u.isTerminal?"))
  );
}

export function patchTerminalSidePanelAsset(assetsDir) {
  const patchTarget = findTerminalSidePanelAsset(assetsDir);
  const source = fs.readFileSync(patchTarget.assetPath, "utf8");
  const patched = patchTerminalBrowserChromeSource(
    patchTerminalBrowserTabMarkerSource(
      patchTerminalBrowserPanelOpenSource(
        patchTerminalSidePanelSource(source, patchTarget),
        patchTarget,
      ),
    ),
  );
  if (patched !== source) {
    fs.writeFileSync(patchTarget.assetPath, patched);
  }
  return patchTarget.assetPath;
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
    patchTerminalBrowserTabMarkerSource(
      patchTerminalBrowserPanelOpenSource(
        patchTerminalSidePanelSource(source, terminalPatchTarget),
        terminalPatchTarget,
      ),
    ),
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

function findAppIntlSymbol(source) {
  for (const importClause of parseImportClauses(source)) {
    if (!importClause.source.includes("app-intl-signal")) {
      continue;
    }

    const intlSpecifier = importClause.specifiers.find(
      (specifier) => specifier.imported === "t",
    );
    if (intlSpecifier) {
      return intlSpecifier.local;
    }
  }

  const formatMessageMatch = source.match(
    /\.get\(([$A-Za-z_][\w$]*)\)\.formatMessage\(/,
  );
  if (formatMessageMatch) {
    return formatMessageMatch[1];
  }

  throw new Error("Unable to infer app intl state symbol");
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

function findDestructuredParamSymbol(params, propertyName) {
  const pattern = new RegExp(
    `\\b${escapeRegex(propertyName)}\\s*:\\s*([$A-Za-z_][\\w$]*)`,
  );
  const symbol = params.match(pattern)?.[1];
  if (!symbol) {
    throw new Error(`Unable to infer ${propertyName} option symbol`);
  }
  return symbol;
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
