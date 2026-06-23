import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findTerminalActionAsset,
  findTerminalSidePanelAsset,
  patchSidebarNavigationButtonsAsset,
  patchTerminalActionSource,
  patchTerminalNewTabMenuSource,
  patchSidebarNavigationButtonsSource,
  patchTerminalSidePanelAsset,
  patchTerminalSidePanelSupport,
  patchThreadOpenInPrimaryIconSource,
} from "../scripts/patch_terminal_side_panel.mjs";

const sourceChunk = [
  "function gs(e,t,n){st(e,t,{routeKind:un(e.value.routeKind)})}",
  "function nm(e,t,n=!0,r=`right`){return t==null||e.value.routeKind,!1}",
  "function rm(e,t,n=!0){return t==null||e.value.routeKind,!1}",
  "export {",
  "  nm as d,",
  "  rm as i,",
  "};",
].join("");

const reexportChunk =
  'import{d as n,i}from"./thread-side-panel-tabs-source.js";export{i as openSessionSandboxSidePanel,n as openThreadBrowserSidePanelTabWithoutAnimation};';

const sidePanelActionChunk = [
  'import{a as Bs,i as js}from"./thread-side-panel-tabs-source.js";',
  'import{t as Md}from"./terminal-icon.js";',
  "function tt(){",
  "  let R=i(J,`searchFiles`),B=i(J,`openSideChat`),V=i(J,`openBrowserTab`),ee=i(J,`openReviewTab`),ne=i(Je,P),N=`conversation`,A={display_name:`host`},O={cwd:`/tmp`};",
  "  let ke=()=>{oe(a,{browserConversationId:N??void 0,browserHostDisplayName:A.display_name,cwd:O.cwd,initiator:`side_panel_menu`,source:`manual`,target:D?r:`right`})!=null&&n?.()};",
  "  let Pe=()=>{js(a,P)&&n?.()};",
  "  let Re=()=>{De(a,r),n?.()};",
  "  return [{id:`terminal`,Icon:Md,onSelect:Re,keyboardShortcut:ne,title:(0,Q.jsx)(T,{id:`thread.sidePanel.newTab.terminal.title`,defaultMessage:`Terminal`})}];",
  "}",
].join("");

const terminalCommandShortcutChunk = [
  "function It(e){",
  "let t=(0,$.c)(40),r=o(U),u=s(Oe),m=Ae(r),_;",
  "t[8]!==m||t[9]!==r||t[10]!==u?(_=()=>{m&&q(r,void 0,u)},t[8]=m,t[9]=r,t[10]=u,t[11]=_):_=t[11],v(`toggle-terminal`,_),Ne(`toggleBottomPanel`,g);",
  "let y;t[12]!==r||t[13]!==u?(y=()=>{q(r,void 0,u)},t[12]=r,t[13]=u,t[14]=y):y=t[14],Ne(`toggleTerminal`,y);",
  "return null}",
].join("");

const sidePanelActionWithTerminalCommandChunk = `${sidePanelActionChunk}${terminalCommandShortcutChunk}`;

const newTabMenuChunk = [
  "function tt(){",
  "let E=!0,D=!1,S=[],A={display_name:`host`},O={cwd:`/tmp`},N=`conversation`,r=`right`,a={},n=()=>{};",
  "let pe=E&&(D||!S.some(it));",
  "let ke=()=>{oe(a,{browserConversationId:N??void 0,browserHostDisplayName:A.display_name,cwd:O.cwd,initiator:`side_panel_menu`,source:`manual`,target:D?r:`right`})!=null&&n?.()};",
  "return [...pe?[{id:`browser`,onSelect:ke}]:[]]",
  "}",
  "function it(e){return de(e)}",
].join("");

const sidePanelActionWithNewTabMenuChunk = `${sidePanelActionWithTerminalCommandChunk}${newTabMenuChunk}`;

const legacyTerminalNativeShortcutFunction =
  "function codexWebInstallNativeTerminalShortcut(e){let t=globalThis;if(t.codexWebNativeTerminalShortcutHandler)document.removeEventListener(`keydown`,t.codexWebNativeTerminalShortcutHandler,!0);let n=t.codexWebNativeTerminalShortcutHandler=t=>{let n=t.target instanceof Element?t.target:null,r=document.activeElement instanceof Element?document.activeElement:null,i=n?.closest(`[role=\"tabpanel\"]`)??r?.closest(`[role=\"tabpanel\"]`);if((t.ctrlKey||t.metaKey)&&!t.altKey&&!t.shiftKey&&t.code===`KeyW`&&i!=null){t.preventDefault();return}if(t.defaultPrevented)return;if(t.ctrlKey&&!t.metaKey&&!t.altKey&&!t.shiftKey&&t.code===`Backquote`){t.preventDefault();e()}};document.addEventListener(`keydown`,n,!0)}";

const appShellNavigationChunk = [
  "function $n(e){",
  "let L=(0,Q.jsx)(nr,{viewTransitionName:`sidebar-trigger`});",
  "let H=(0,Q.jsx)(nr,{ariaLabel:R,disabled:z,shortcut:x,tooltipContent:B,onClick:tr,children:V});",
  "let q=(0,Q.jsx)(nr,{ariaLabel:U,disabled:W,shortcut:S,tooltipContent:G,onClick:er,children:K});",
  "let J;t[46]!==H||t[47]!==q?(J=(0,Q.jsx)(_t,{electron:!0,extension:!0,children:(0,Q.jsxs)(Q.Fragment,{children:[H,q]})}),t[46]=H,t[47]=q,t[48]=J):J=t[48];",
  "let Y;return t[49]!==L||t[50]!==J?(Y=(0,Q.jsxs)(`div`,{className:`flex items-center gap-1`,children:[L,J]}),t[49]=L,t[50]=J,t[51]=Y):Y=t[51],Y",
  "}",
].join("");

const openInPrimaryIconChunk = [
  "function ft(){",
  "let g={icon:`apps/vscode.png`,resolvedIcon:`data:image/png;base64,abc`,label:`VS Code`},_=!0;",
  "let R=(0,Q.jsx)(`span`,{className:`icon-sm inline-flex shrink-0 items-center justify-center`,children:g==null?(0,Q.jsx)(`span`,{className:`size-4 rounded bg-token-bg-tertiary`}):(0,Q.jsx)(`img`,{alt:_?g.label:``,onError:_t,src:g.icon,className:`icon-sm`})});",
  "}",
  "var vt=S({openPrimaryTarget:{id:`localConversationPage.openPrimaryTarget`,defaultMessage:`Open in`,description:`Primary open button label`}});",
].join("");

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

  assert.equal(path.basename(result.assetPath), "thread-side-panel-tabs-source.js");
  assert.equal(result.functionName, "rm");
});

test("patchTerminalSidePanelAsset leaves the native terminal source chunk alone", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-side-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceChunk);

  assert.equal(patchTerminalSidePanelAsset(assetsDir), sourcePath);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceChunk);
});

test("patchTerminalActionSource keeps Terminal on the native desktop opener", () => {
  const patched = patchTerminalActionSource(
    sidePanelActionWithTerminalCommandChunk,
    {
      terminalActionFunctionName: "Pe",
    },
  );

  assert.match(patched, /let Re=\(\)=>\{De\(a,r\),n\?\.\(\)\}/);
  assert.match(
    patched,
    /\{id:`terminal`,Icon:Md,onSelect:Re,keyboardShortcut:ne,title:/,
  );
  assert.doesNotMatch(patched, /globalThis\.open/);
  assert.doesNotMatch(patched, /codexWebInstallTerminalBrowserShortcut/);
  assert.match(patched, /function codexWebInstallNativeTerminalShortcut/);
  assert.doesNotMatch(patched, /KeyW/);
  assert.doesNotMatch(patched, /document\.activeElement/);
  assert.doesNotMatch(patched, /Terminal input/);
  assert.match(
    patched,
    /Ne\(`toggleTerminal`,y\);codexWebInstallNativeTerminalShortcut\(y\)/,
  );
  assert.equal(
    patchTerminalActionSource(patched, {
      terminalActionFunctionName: "Pe",
    }),
    patched,
  );
});

test("patchTerminalActionSource removes old browser terminal shortcut calls", () => {
  const oldBrowserShortcutChunk =
    "function It(e){let y;t[12]!==r||t[13]!==u?(y=()=>{q(r,void 0,u)},t[12]=r,t[13]=u,t[14]=y):y=t[14],Ne(`toggleTerminal`,y);codexWebInstallTerminalBrowserShortcut(()=>{js(r)});return null}";

  const patched = patchTerminalActionSource(
    `${sidePanelActionChunk}${oldBrowserShortcutChunk}`,
    {
      terminalActionFunctionName: "Pe",
    },
  );

  assert.doesNotMatch(patched, /codexWebInstallTerminalBrowserShortcut/);
  assert.match(
    patched,
    /Ne\(`toggleTerminal`,y\);codexWebInstallNativeTerminalShortcut\(y\);return null/,
  );
});

test("patchTerminalActionSource replaces legacy native shortcut patches", () => {
  const legacyPatchedChunk =
    legacyTerminalNativeShortcutFunction +
    sidePanelActionWithTerminalCommandChunk.replace(
      "Ne(`toggleTerminal`,y);",
      "Ne(`toggleTerminal`,y);codexWebInstallNativeTerminalShortcut(y);",
    );

  const patched = patchTerminalActionSource(legacyPatchedChunk, {
    terminalActionFunctionName: "Pe",
  });

  assert.doesNotMatch(patched, /KeyW/);
  assert.equal(
    patched.match(/function codexWebInstallNativeTerminalShortcut/g)?.length,
    1,
  );
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

test("patchTerminalNewTabMenuSource keeps Browser available for legacy terminal tabs", () => {
  const patched = patchTerminalNewTabMenuSource(newTabMenuChunk);

  assert.match(
    patched,
    /function it\(e\)\{return de\(e\)&&e\.props\?\.codexWebIsTerminal!==!0&&e\.codexWebIsTerminal!==!0\}/,
  );
  assert.match(patched, /initiator:`side_panel_browser`/);
  assert.equal(patchTerminalNewTabMenuSource(patched), patched);
});

test("patchThreadOpenInPrimaryIconSource uses resolved icons for the top Open in button", () => {
  const patched = patchThreadOpenInPrimaryIconSource(openInPrimaryIconChunk);

  assert.match(patched, /src:g\.resolvedIcon\?\?g\.icon,className:`icon-sm`/);
  assert.equal(patchThreadOpenInPrimaryIconSource(patched), patched);
});

test("patchSidebarNavigationButtonsSource removes back and forward buttons", () => {
  const patched = patchSidebarNavigationButtonsSource(appShellNavigationChunk);

  assert.match(patched, /viewTransitionName:`sidebar-trigger`/);
  assert.match(patched, /J=null/);
  assert.doesNotMatch(patched, /children:\[H,q\]/);
  assert.equal(patchSidebarNavigationButtonsSource(patched), patched);
});

test("patchSidebarNavigationButtonsSource ignores unrelated null locals", () => {
  const patched = patchSidebarNavigationButtonsSource(
    `function unrelated(){let J=null;}${appShellNavigationChunk}`,
  );

  assert.doesNotMatch(patched, /children:\[H,q\]/);
});

test("patchSidebarNavigationButtonsAsset skips unrelated null locals", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-sidebar-navigation-assets-"),
  );
  const unrelatedPath = path.join(assetsDir, "a.js");
  fs.writeFileSync(
    unrelatedPath,
    "function unrelated(){let J=null;}let L=(0,Q.jsx)(nr,{viewTransitionName:`sidebar-trigger`});",
  );
  const appShellPath = path.join(assetsDir, "z.js");
  fs.writeFileSync(appShellPath, appShellNavigationChunk);

  assert.equal(patchSidebarNavigationButtonsAsset(assetsDir), appShellPath);
  assert.match(fs.readFileSync(unrelatedPath, "utf8"), /let J=null/);
  assert.doesNotMatch(fs.readFileSync(appShellPath, "utf8"), /children:\[H,q\]/);
});

test("patchTerminalSidePanelSupport keeps sidebar Terminal native", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-support-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceChunk);
  const actionPath = path.join(assetsDir, "thread-app-shell-chrome.js");
  fs.writeFileSync(actionPath, sidePanelActionWithNewTabMenuChunk);
  const appShellPath = path.join(assetsDir, "app-shell.js");
  fs.writeFileSync(appShellPath, appShellNavigationChunk);
  const patchedPaths = patchTerminalSidePanelSupport(assetsDir);

  assert.deepEqual(patchedPaths, [actionPath, appShellPath]);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceChunk);
  assert.doesNotMatch(
    fs.readFileSync(actionPath, "utf8"),
    /codexWebInstallTerminalBrowserShortcut/,
  );
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /\{id:`terminal`,Icon:Md,onSelect:Re,keyboardShortcut:ne,title:/,
  );
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /codexWebInstallNativeTerminalShortcut\(y\)/,
  );
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /e\.props\?\.codexWebIsTerminal!==!0/,
  );
  assert.doesNotMatch(fs.readFileSync(appShellPath, "utf8"), /children:\[H,q\]/);
});
