import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findTerminalActionAsset,
  findTerminalSidePanelAsset,
  patchKeepMountedTerminalPanelsSource,
  patchNativeTerminalCtrlWSource,
  patchTerminalActionSource,
  patchTerminalNewTabMenuSource,
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

const modernSidePanelActionChunk = [
  "function tt(){",
  "  let ye=()=>{Je(i,t),e?.()};",
  "  return [...ue?[{id:`terminal`,Icon:Zt,onSelect:ye,title:(0,K.jsx)(V,{id:`thread.sidePanel.newTab.terminal.title`,defaultMessage:`Terminal`})}]:[]];",
  "}",
  "function Cr(){let v;t[13]!==m||t[14]!==i||t[15]!==l?(v=()=>{m&&Ze(i,void 0,l)},t[13]=m,t[14]=i,t[15]=l,t[16]=v):v=t[16],rn(`toggleTerminal`,v);return null}",
].join("");

const newTabMenuChunk = [
  "function tt(){",
  "let E=!0,D=!1,S=[],A={display_name:`host`},O={cwd:`/tmp`},N=`conversation`,r=`right`,a={},n=()=>{};",
  "let pe=E&&(D||!S.some(it));",
  "let ke=()=>{oe(a,{browserConversationId:N??void 0,browserHostDisplayName:A.display_name,cwd:O.cwd,initiator:`side_panel_menu`,source:`manual`,target:D?r:`right`})!=null&&n?.()};",
  "return [...pe?[{id:`browser`,onSelect:ke}]:[]]",
  "}",
  "function it(e){return de(e)}",
].join("");

const modernNewTabMenuChunk = [
  "function tt(){",
  "let ge=()=>{st(i,{browserConversationId:x??void 0,browserHostDisplayName:y.display_name,cwd:_.cwd,initiator:`side_panel_menu`,source:`manual`,target:m?t:`right`})!=null&&e?.()};",
  "return [...ae?[{id:`browser`,onSelect:ge}]:[]]",
  "}",
].join("");

const sidePanelActionWithNewTabMenuChunk = `${sidePanelActionWithTerminalCommandChunk}${newTabMenuChunk}`;

const nativeTerminalChunk = [
  "function oe({clipboard:e,event:t,onNewTerminalTab:n,pasteOnCtrlV:r=!1,sendText:i,term:a}){",
  "if(t.type!==`keydown`)return!0;",
  "if(n!=null&&le(t,[`t`]))return J(t),n(),!1;",
  "let o=ce(t);return o==null?!0:(J(t),i(o),!1)}",
  "function J(e){e.preventDefault(),e.stopPropagation()}",
  "function Z(e,t){return e.ctrlKey&&!e.shiftKey&&!e.altKey&&!e.metaKey&&e.key.toLowerCase()===t}",
  "function create(){let f=new be.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:P.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:N.current,letterSpacing:0,lineHeight:1.2,theme:me(t)})}",
  "function update(e){let b=N.current,x=P.current;e.options.fontFamily=b,e.options.fontSize=x}",
  "function terminal(){f.attachCustomKeyEventHandler(e=>oe({event:e,sendText:e=>write(e)}));return {\"data-codex-terminal\":!0}}",
].join("");

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

const appShellTabPanelChunk = [
  "function _n(e){",
  "let t=(0,$.c)(20),{emptyState:a,controller:s}=e,l=c(s.tabs$),u=c(s.activeTab$),d=c(s.activeTabReactKey$),g=(0,Q.jsx)(vn,{controller:s,tabs:l});",
  "let _;t[12]!==u||t[13]!==d||t[14]!==s||t[15]!==a?(_=u==null?(0,Q.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:a}):(0,Q.jsx)(Cn,{controller:s,tab:u},d),t[12]=u,t[13]=d,t[14]=s,t[15]=a,t[16]=_):_=t[16];",
  "let v;return t[17]!==g||t[18]!==_?(v=(0,Q.jsxs)(`div`,{children:[g,_]}),t[17]=g,t[18]=_,t[19]=v):v=t[19],v}",
  "function Sn(e,t){return t!==-1}",
  "var Cn=(0,Z.memo)(function(e){let{controller:n,tab:r}=e;return(0,Q.jsx)(`div`,{role:`tabpanel`,`data-app-shell-tab-panel-controller`:n.panelId,\"data-tab-id\":r.tabId})});",
].join("");

const modernAppShellTabPanelChunk = [
  "function ZF(e){",
  "let t=(0,eI.c)(23),{afterList:n,afterListSticky:r,beforeList:i,emptyState:a,headerHeight:o,controller:s}=e,c=K(s.tabs$),l=K(s.activeTab$),u=K(s.activeTabReactKey$),d=K(WP),h=d===`ready`,g=l!=null&&(h||l.requiresWorkspaceReady===!1),v=(0,nI.jsx)(HF,{controller:s,tabs:c});",
  "let y;t[13]!==l||t[14]!==g||t[15]!==u||t[16]!==s||t[17]!==a||t[18]!==h?(y=g?(0,nI.jsx)(iI,{controller:s,tab:l},u):h?(0,nI.jsx)(`div`,{className:`relative min-h-0 flex-1`,children:a}):(0,nI.jsx)(`div`,{className:`flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary`,children:(0,nI.jsx)(X,{id:`appShell.tabPanel.worktreeProvisioning`,defaultMessage:`Available when the worktree is ready`,description:`Placeholder shown instead of tab content while a worktree is being provisioned`})}),t[13]=l,t[14]=g,t[15]=u,t[16]=s,t[17]=a,t[18]=h,t[19]=y):y=t[19];",
  "return(0,nI.jsxs)(`div`,{children:[v,y]})}",
  "var iI=(0,tI.memo)(function({controller:e,tab:t}){return(0,nI.jsx)(`div`,{role:`tabpanel`,`data-app-shell-tab-panel-controller`:e.panelId,\"data-tab-id\":t.tabId,children:t.renderPanel()})});",
].join("");

const appShellPanelWrapperChunk = [
  "function fr({bottomPanelHeight:e,children:t,clampedBottomPanelHeight:n,mainContentHeight:r,isVisible:i=!1}){let a=s(X),{isMounted:o}=lr({size:n,isVisible:i});return!o&&!i?null:(0,Q.jsx)(`div`,{children:t})}",
  "function kr({children:e,isRightPanelOpen:t,rightPanelWidth:r}){let o=s(X),l=c(Se),u=c(I),{isMounted:g}=lr({size:r,isVisible:t});return Qt(r,`change`,()=>{}),!g&&!t?null:(0,Q.jsx)(`aside`,{children:[e,l]})}",
].join("");

const actualAppShellSource = readActualAppShellSource();
const appShellRootStart = actualAppShellSource.indexOf(
  "bottomPanelSlot:e,children:t,leftPanelSlot:n,rightPanelSlot:r",
);
const appShellRootChunk = actualAppShellSource.slice(
  actualAppShellSource.lastIndexOf("function ", appShellRootStart),
  actualAppShellSource.indexOf("function ", appShellRootStart + 1),
);

const openInPrimaryIconChunk = [
  "function ft(){",
  "let g={icon:`apps/vscode.png`,resolvedIcon:`data:image/png;base64,abc`,label:`VS Code`},_=!0;",
  "let R=(0,Q.jsx)(`span`,{className:`icon-sm inline-flex shrink-0 items-center justify-center`,children:g==null?(0,Q.jsx)(`span`,{className:`size-4 rounded bg-token-bg-tertiary`}):(0,Q.jsx)(`img`,{alt:_?g.label:``,onError:_t,src:g.icon,className:`icon-sm`})});",
  "}",
  "var vt=S({openPrimaryTarget:{id:`localConversationPage.openPrimaryTarget`,defaultMessage:`Open in`,description:`Primary open button label`}});",
].join("");

function readActualAppShellSource() {
  const assetsDir = path.join(process.cwd(), "scratch/asar/webview/assets");
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => {
      if (!name.endsWith(".js")) {
        return false;
      }
      return fs
        .readFileSync(path.join(assetsDir, name), "utf8")
        .includes("bottomPanelSlot:e,children:t,leftPanelSlot:n,rightPanelSlot:r");
    });
  assert.ok(assetName, "app shell source asset should exist in scratch");
  return fs.readFileSync(path.join(assetsDir, assetName), "utf8");
}

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

test("patchNativeTerminalCtrlWSource keeps Ctrl+W inside the terminal", () => {
  const patched = patchNativeTerminalCtrlWSource(nativeTerminalChunk);

  assert.match(
    patched,
    /if\(Z\(t,`w`\)\)return J\(t\),i\(`\\x17`\),!1;/,
  );
  assert.equal(patchNativeTerminalCtrlWSource(patched), patched);
});

test("patchNativeTerminalCtrlWSource applies the configured terminal font", () => {
  const patched = patchNativeTerminalCtrlWSource(nativeTerminalChunk);

  assert.match(
    patched,
    /fontFamily:window\.__CODEX_WEB_TERMINAL_FONT__\?\?N\.current/,
  );
  assert.match(
    patched,
    /e\.options\.fontFamily=window\.__CODEX_WEB_TERMINAL_FONT__\?\?b/,
  );
  assert.equal(patchNativeTerminalCtrlWSource(patched), patched);
});

test("patchNativeTerminalCtrlWSource upgrades partially patched terminal font", () => {
  const partiallyPatched = nativeTerminalChunk.replace(
    "fontFamily:N.current",
    "fontFamily:window.__CODEX_WEB_TERMINAL_FONT__??N.current",
  );

  const patched = patchNativeTerminalCtrlWSource(partiallyPatched);

  assert.match(
    patched,
    /e\.options\.fontFamily=window\.__CODEX_WEB_TERMINAL_FONT__\?\?b/,
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

test("findTerminalActionAsset supports modern direct Terminal actions", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-modern-action-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    sourceChunk,
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-app-shell-chrome.js"),
    modernSidePanelActionChunk,
  );

  const result = findTerminalActionAsset(assetsDir, {
    assetPath: path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    functionName: "rm",
  });

  assert.equal(path.basename(result.assetPath), "thread-app-shell-chrome.js");
  assert.equal(result.terminalActionFunctionName, "ye");
});

test("patchTerminalActionSource supports modern command registration names", () => {
  const patched = patchTerminalActionSource(modernSidePanelActionChunk, {
    terminalActionFunctionName: "ye",
  });

  assert.match(
    patched,
    /rn\(`toggleTerminal`,v\);codexWebInstallNativeTerminalShortcut\(v\)/,
  );
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

test("patchTerminalNewTabMenuSource supports modern Browser actions", () => {
  const patched = patchTerminalNewTabMenuSource(modernNewTabMenuChunk);

  assert.doesNotThrow(() => patchTerminalNewTabMenuSource(patched));
  assert.match(patched, /browserTabId:crypto\.randomUUID\(\)/);
  assert.match(patched, /initiator:`side_panel_browser`/);
});

test("patchThreadOpenInPrimaryIconSource uses resolved icons for the top Open in button", () => {
  const patched = patchThreadOpenInPrimaryIconSource(openInPrimaryIconChunk);

  assert.match(patched, /src:g\.resolvedIcon\?\?g\.icon,className:`icon-sm`/);
  assert.equal(patchThreadOpenInPrimaryIconSource(patched), patched);
});

test("patchThreadOpenInPrimaryIconSource skips modern resolved icon code", () => {
  const source =
    "src:c==null?e.resolvedIcon??e.icon:c.get(e.id)??e.icon;localConversationPage.openPrimaryTarget";

  assert.equal(patchThreadOpenInPrimaryIconSource(source), source);
});

test("patchKeepMountedTerminalPanelsSource keeps terminal panels mounted", () => {
  const patched = patchKeepMountedTerminalPanelsSource(
    `${appShellPanelWrapperChunk}${appShellRootChunk}${appShellTabPanelChunk}`,
  );

  assert.match(patched, /function codexWebRenderTerminalPanels/);
  assert.match(patched, /return!o&&!i&&t==null\?null:/);
  assert.match(patched, /,!t&&e==null&&rightPanelOutlet==null\?null:/);
  assert.match(patched, /rightPanelOutletCache\.current=l\?\?rightPanelOutletCache\.current/);
  assert.match(patched, /children:\[e,rightPanelOutlet\]/);
  assert.match(patched, /children:r\?\.children/);
  assert.match(
    patched,
    /let _=codexWebRenderTerminalPanels\(s,u,l,d,a\);/,
  );
  assert.match(patched, /startsWith\(`terminal:`\)/);
  assert.match(patched, /className:r\?`contents`:`hidden`/);
  assert.match(patched, /\(Cn,\{controller:e,tab:n\},n\.tabId\)/);
  assert.doesNotMatch(patched, /panelId!==`bottom`/);
  assert.doesNotMatch(patched, /inactive/);
  assert.doesNotMatch(patched, /activeTabReactKey\$\).*?t\[12\]!==u/s);
  assert.equal(patchKeepMountedTerminalPanelsSource(patched), patched);
});

test("patchKeepMountedTerminalPanelsSource adapts modern app shell tab panels", () => {
  const patched = patchKeepMountedTerminalPanelsSource(
    `${appShellPanelWrapperChunk}${appShellRootChunk}${modernAppShellTabPanelChunk}`,
  );

  assert.match(patched, /function codexWebRenderTerminalPanels/);
  assert.match(patched, /y=codexWebRenderTerminalPanels\(s,l,c,u,a,h,g\)/);
  assert.match(patched, /\(0,nI\.jsx\)\(iI,\{controller:e,tab:n\},n\.tabId\)/);
  assert.match(patched, /\(0,nI\.jsx\)\(X,\{id:`appShell\.tabPanel\.worktreeProvisioning`/);
  assert.equal(patchKeepMountedTerminalPanelsSource(patched), patched);
});

test("patchTerminalSidePanelSupport keeps sidebar Terminal native without patching app shell navigation", () => {
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
  const nativeTerminalPath = path.join(
    assetsDir,
    "thread-page-bottom-panel-state.js",
  );
  fs.writeFileSync(nativeTerminalPath, nativeTerminalChunk);
  const appShellPath = path.join(assetsDir, "app-shell.js");
  fs.writeFileSync(
    appShellPath,
    `${appShellNavigationChunk}${appShellPanelWrapperChunk}${appShellRootChunk}${appShellTabPanelChunk}`,
  );
  const patchedPaths = patchTerminalSidePanelSupport(assetsDir);

  assert.deepEqual(patchedPaths, [actionPath, nativeTerminalPath, appShellPath]);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), sourceChunk);
  assert.doesNotMatch(
    fs.readFileSync(actionPath, "utf8"),
    /codexWebInstallTerminalBrowserShortcut/,
  );
  assert.match(
    fs.readFileSync(nativeTerminalPath, "utf8"),
    /i\(`\\x17`\)/,
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
  assert.match(fs.readFileSync(appShellPath, "utf8"), /children:\[H,q\]/);
  assert.match(
    fs.readFileSync(appShellPath, "utf8"),
    /codexWebRenderTerminalPanels/,
  );
  assert.match(fs.readFileSync(appShellPath, "utf8"), /&&!i&&t==null/);
  assert.match(
    fs.readFileSync(appShellPath, "utf8"),
    /!t&&e==null&&rightPanelOutlet==null\?null:/,
  );
  assert.match(fs.readFileSync(appShellPath, "utf8"), /rightPanelOutletCache/);
});
