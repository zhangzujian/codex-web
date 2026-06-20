import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findTerminalActionAsset,
  findTerminalSidePanelAsset,
  patchApplicationMenuSource,
  patchTerminalActionSource,
  patchTerminalBrowserChromeSource,
  patchTerminalSidePanelAsset,
  patchTerminalSidePanelSource,
  patchTerminalSidePanelSupport,
} from "../scripts/patch_terminal_side_panel.mjs";

const sourceChunk = [
  "function gs(e,t,n){st(e,t,{routeKind:un(e.value.routeKind)})}",
  "function wf(){let a=s(ft),b=l(_r),c=a.value.routeKind===`local-thread`?a.value.conversationId:null;return b}",
  "function zu(){let x=l(Or),h=l(kr),f={cwd:x,hostConfig:h};return f}",
  "function Rp(e,t){return t}",
  "function Hp(e,t,n){return n??re(crypto.randomUUID())}",
  "function Eu(){let X={url:`http://localhost/__terminal?cwd=/tmp`,isLoading:!1},Kt=!0;let Ui=!1,Wi=`Show`;return(0,$.jsxs)(`div`,{ref:L,\"data-browser-sidebar-primary-focus-target\":Kt?`webview`:`address`,className:`relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]`,tabIndex:-1,children:[(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`,children:[(0,$.jsx)(`input`,{\"data-browser-sidebar-address-input\":`true`})]}),(0,$.jsx)(`div`,{className:`relative flex min-h-0 min-w-0 flex-1 flex-col`})]})}",
  "function nm(e,t,n=!0,r=`right`){return t==null||e.value.routeKind,!1}",
  "function rm(e,t,n=!0){return t==null||e.value.routeKind,!1}",
  "export {",
  "  nm as d,",
  "  rm as i,",
  "  Rp as s,",
  "};",
].join("");

const reexportChunk =
  'import{d as n,i,s as u}from"./thread-side-panel-tabs-source.js";export{i as openSessionSandboxSidePanel,n as openThreadBrowserSidePanelTabWithoutAnimation,u as openThreadBrowserSidePanelTabWithPendingState};';

const sidePanelActionChunk = [
  'import{a as Bs,i as js,s as Ks}from"./thread-side-panel-tabs-source.js";',
  'import{t as Md}from"./terminal-icon.js";',
  "function tt(){",
  "  let Pe=()=>{js(a,P)&&n?.()};",
  "  let Re=()=>{De(a,r),n?.()};",
  "  return [{id:`terminal`,Icon:Md,onSelect:Re,title:(0,Q.jsx)(T,{id:`thread.sidePanel.newTab.terminal.title`,defaultMessage:`Terminal`})}];",
  "}",
].join("");

const browserChromeChunk = [
  "var fs=`about:blank#codex-browser-sidebar-attach-token=`;",
  "function ps({browserSnapshot:e,browserTabFallbackTitle:t,isBrowserUseActive:n,isBrowserUseTab:r}){let i=e?.tabType===ne.WEB,a=r&&i&&(e.url.length===0||e.url===`about:blank`),o=i&&(e.url.startsWith(fs)||e.title.startsWith(fs)),s=i&&!a&&!o?oi(e.url):``,c=i?e.title.trim():``,l=c.length===0||c===`about:blank`||c===t,u=i&&!a&&!o&&c.length>0;return{faviconUrl:i?e.faviconUrl:null,isAudible:i&&e.isAudible,isCapturingUserMedia:i&&e.isCapturingUserMedia,isHighlighted:n,preserveExistingTitle:o,title:u&&!l?c:s||t}}",
  "function Np(){let S={isTerminal:true,faviconUrl:null};w.updateTab(d,l,{icon:(0,$.jsx)(Dt,{alt:``,className:`size-full rounded-2xs`,logoUrl:S.faviconUrl,fallback:(0,$.jsx)(bi,{className:`size-full`})}),title:e})}",
  "function Eu(){",
  "let X={url:`http://localhost/__terminal?cwd=/tmp`,isLoading:!1},Kt=!0;",
  "let Ui=!1,Wi=`Show`;",
  "return(0,$.jsxs)(`div`,{ref:L,\"data-browser-sidebar-primary-focus-target\":Kt?`webview`:`address`,className:`relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]`,tabIndex:-1,children:[(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`,children:[(0,$.jsx)(`input`,{\"data-browser-sidebar-address-input\":`true`})]}),(0,$.jsx)(`div`,{className:`relative flex min-h-0 min-w-0 flex-1 flex-col`})]})",
  "}",
].join("");

const applicationMenuChunk = [
  "function $n(){return(0,$.jsx)(`button`,{id:`sidebar-trigger`})}",
  "function In(){return yt()&&window.electronBridge?.showApplicationMenu!=null}",
  "var Ln=_({file:{id:`windowsMenuBar.file`,defaultMessage:`File`},edit:{id:`windowsMenuBar.edit`,defaultMessage:`Edit`},view:{id:`windowsMenuBar.view`,defaultMessage:`View`},help:{id:`windowsMenuBar.help`,defaultMessage:`Help`}});",
  "function zn(){if(!In())return null;return Rn.map(e=>(0,$.jsx)(`button`,{children:e.id}))}",
  "function ni(){let n=(0,$.jsx)($n,{}),r=null,i=(0,$.jsx)(zn,{});return(0,$.jsxs)(`div`,{children:[n,r,i]})}",
].join("");

const sourceWithBrowserChromeChunk = `${sourceChunk}${browserChromeChunk}`;

test("patchTerminalSidePanelSource replaces the openSessionSandboxSidePanel stub", () => {
  const patched = patchTerminalSidePanelSource(sourceChunk, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /initialUrl:`\$\{globalThis\.location\.origin\}\/__terminal\?cwd=\$\{encodeURIComponent/,
  );
  assert.match(patched, /browserTabId:re\(crypto\.randomUUID\(\)\)/);
  assert.match(patched, /initiator:`side_panel_terminal`/);
  assert.match(patched, /cwd:r\?\?void 0/);
  assert.doesNotMatch(
    patched,
    /function rm\(e,t,n=!0\)\{return t==null\|\|e\.value\.routeKind,!1\}/,
  );
});

test("patchTerminalSidePanelSource upgrades an older terminal patch even when the chunk has other browser tab ids", () => {
  const previouslyPatchedSource = [
    "function zu(){let x=l(Or),h=l(kr),f={cwd:x,hostConfig:h};return f}",
    "function Rp(e,t){return t}",
    "function Hp(e,t,n){return n??re(crypto.randomUUID())}",
    "function other(){return {browserTabId:re(crypto.randomUUID())}}",
    "function rm(e,t,n=!0){let r=e.get(Or);return Rp(e,{browserConversationId:t??void 0,initialUrl:`${globalThis.location.origin}/__terminal?cwd=${encodeURIComponent(r??``)}`,initiator:`side_panel_terminal`,source:`manual`,target:`right`,cwd:r??void 0})!=null}",
  ].join("");

  const patched = patchTerminalSidePanelSource(previouslyPatchedSource, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /function rm\(e,t,n=!0\)\{let r=e\.get\(Or\);return Rp\(e,\{browserConversationId:t\?\?void 0,browserTabId:re\(crypto\.randomUUID\(\)\)/,
  );
});

test("findTerminalSidePanelAsset follows the public re-export to the source chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-side-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    sourceChunk,
  );

  const result = findTerminalSidePanelAsset(assetsDir);

  assert.equal(
    path.basename(result.assetPath),
    "thread-side-panel-tabs-source.js",
  );
  assert.equal(result.functionName, "rm");
  assert.equal(result.openBrowserPanelFunctionName, "Rp");
});

test("patchTerminalSidePanelAsset patches the discovered source chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-side-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceWithBrowserChromeChunk);

  const patchedPath = patchTerminalSidePanelAsset(assetsDir);
  const patched = fs.readFileSync(sourcePath, "utf8");

  assert.equal(patchedPath, sourcePath);
  assert.match(patched, /\$\{globalThis\.location\.origin\}\/__terminal\?cwd=/);
  assert.match(patched, /S\.isTerminal\?/);
});

test("patchTerminalActionSource points Terminal at the side panel opener", () => {
  const patched = patchTerminalActionSource(sidePanelActionChunk, {
    terminalActionFunctionName: "Pe",
  });

  assert.match(patched, /let Re=\(\)=>\{De\(a,r\),n\?\.\(\)\}/);
  assert.match(patched, /id:`terminal`,Icon:Md,onSelect:Pe,title:/);
});

test("findTerminalActionAsset finds the side panel Terminal action importer", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-action-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    sourceChunk,
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-app-shell-chrome.js"),
    sidePanelActionChunk,
  );

  const result = findTerminalActionAsset(assetsDir, {
    assetPath: path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    functionName: "rm",
  });

  assert.equal(path.basename(result.assetPath), "thread-app-shell-chrome.js");
  assert.equal(result.terminalActionFunctionName, "Pe");
});

test("patchTerminalSidePanelSupport patches the source and Terminal action", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-support-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceWithBrowserChromeChunk);
  const actionPath = path.join(assetsDir, "thread-app-shell-chrome.js");
  fs.writeFileSync(actionPath, sidePanelActionChunk);
  const applicationMenuPath = path.join(assetsDir, "app-shell.js");
  fs.writeFileSync(applicationMenuPath, applicationMenuChunk);

  const patchedPaths = patchTerminalSidePanelSupport(assetsDir);

  assert.deepEqual(patchedPaths, [sourcePath, actionPath, applicationMenuPath]);
  assert.match(
    fs.readFileSync(sourcePath, "utf8"),
    /\$\{globalThis\.location\.origin\}\/__terminal\?cwd=/,
  );
  assert.match(fs.readFileSync(sourcePath, "utf8"), /S\.isTerminal\?/);
  assert.match(fs.readFileSync(actionPath, "utf8"), /onSelect:Pe,title:/);
  assert.match(
    fs.readFileSync(applicationMenuPath, "utf8"),
    /function In\(\)\{return!1\/\*codexWebDisableApplicationMenu\*\/\}/,
  );
});

test("patchTerminalBrowserChromeSource hides browser toolbar for terminal URLs", () => {
  const patched = patchTerminalBrowserChromeSource(browserChromeChunk);

  assert.match(patched, /function codexWebTerminalTabIcon/);
  assert.match(patched, /isTerminal:/);
  assert.match(patched, /S\.isTerminal\?/);
  assert.match(patched, /codexWebTerminalTabIcon/);
  assert.match(
    patched,
    /codexWebIsTerminalTab=X\.url\?\.includes\(`\/__terminal`\)===!0/,
  );
  assert.match(
    patched,
    /"data-codex-web-terminal-tab":codexWebIsTerminalTab\?`true`:void 0/,
  );
  assert.match(
    patched,
    /className:J\(`relative grid h-full min-h-0 w-full min-w-0`,codexWebIsTerminalTab\?`grid-rows-\[1fr\]`:`grid-rows-\[auto_1fr\]`\)/,
  );
  assert.match(
    patched,
    /children:\[codexWebIsTerminalTab\?null:\(0,\$\.jsxs\)\(`div`,\{className:`relative z-10 h-toolbar-pane/,
  );
  assert.equal(patchTerminalBrowserChromeSource(patched), patched);
});

test("patchTerminalBrowserChromeSource fails when terminal tab metadata cannot be patched", () => {
  assert.throws(
    () =>
      patchTerminalBrowserChromeSource(
        browserChromeChunk.replace(
          "icon:(0,$.jsx)(Dt,{alt:``,className:`size-full rounded-2xs`,logoUrl:S.faviconUrl,fallback:(0,$.jsx)(bi,{className:`size-full`})})",
          "icon:(0,$.jsx)(UnknownIcon,{})",
        ),
      ),
    /Terminal browser tab icon target not found/,
  );
});

test("patchApplicationMenuSource hides the desktop menu bar but keeps the left control", () => {
  const patched = patchApplicationMenuSource(applicationMenuChunk);

  assert.match(
    patched,
    /function In\(\)\{return!1\/\*codexWebDisableApplicationMenu\*\/\}/,
  );
  assert.match(patched, /function \$n\(\)/);
  assert.match(patched, /children:\[n,r,i\]/);
  assert.doesNotMatch(
    patched,
    /window\.electronBridge\?\.showApplicationMenu!=null/,
  );
  assert.equal(patchApplicationMenuSource(patched), patched);
});
