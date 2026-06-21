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
  patchTerminalBrowserPanelOpenSource,
  patchTerminalBrowserTabMarkerSource,
  patchTerminalBrowserChromeSource,
  patchTerminalNewTabMenuSource,
  patchTerminalSidePanelAsset,
  patchTerminalSidePanelSource,
  patchTerminalSidePanelSupport,
  patchThreadOpenInPrimaryIconSource,
} from "../scripts/patch_terminal_side_panel.mjs";

const sourceChunk = [
  'import{t as Rr}from"./app-intl-signal-Bd_tJ6VJ.js";',
  "function gs(e,t,n){st(e,t,{routeKind:un(e.value.routeKind)})}",
  "function wf(){let a=s(ft),b=l(_r),c=a.value.routeKind===`local-thread`?a.value.conversationId:null;return b}",
  "function zu(){let x=l(Or),h=l(kr),f={cwd:x,hostConfig:h};return f}",
  "function Rp(e,t){return t}",
  "function Hp(e,t,n){return n??re(crypto.randomUUID())}",
  'function Eu(){let X={url:`http://localhost/__terminal?cwd=/tmp`,isLoading:!1},Kt=!0;let Ui=!1,Wi=`Show`;return(0,$.jsxs)(`div`,{ref:L,"data-browser-sidebar-primary-focus-target":Kt?`webview`:`address`,className:`relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]`,tabIndex:-1,children:[(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`,children:[(0,$.jsx)(`input`,{"data-browser-sidebar-address-input":`true`})]}),(0,$.jsx)(`div`,{className:`relative flex min-h-0 min-w-0 flex-1 flex-col`})]})}',
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

const oldTerminalLocaleHelper =
  "function codexWebTerminalLocale(){let e=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`],t=[];for(let n of e)try{let e=localStorage.getItem(n);if(e){t.push(e);try{let n=JSON.parse(e);typeof n==`string`?t.push(n):n&&typeof n==`object`&&t.push(n.locale,n.language,n.appLocale,n.appLanguage)}catch{}}}catch{}t.push(document.documentElement.lang);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}";

const sidePanelActionChunk = [
  'import{a as Bs,i as js,s as Ks}from"./thread-side-panel-tabs-source.js";',
  'import{t as Md}from"./terminal-icon.js";',
  "function tt(){",
  "  let R=i(J,`searchFiles`),B=i(J,`openSideChat`),V=i(J,`openBrowserTab`),ee=i(J,`openReviewTab`),ne=i(Je,P);",
  "  let Pe=()=>{js(a,P)&&n?.()};",
  "  let Re=()=>{De(a,r),n?.()};",
  "  return [{id:`terminal`,Icon:Md,onSelect:Re,title:(0,Q.jsx)(T,{id:`thread.sidePanel.newTab.terminal.title`,defaultMessage:`Terminal`})}];",
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

const browserChromeChunk = [
  "var fs=`about:blank#codex-browser-sidebar-attach-token=`;",
  "function ps({browserSnapshot:e,browserTabFallbackTitle:t,isBrowserUseActive:n,isBrowserUseTab:r}){let i=e?.tabType===ne.WEB,a=r&&i&&(e.url.length===0||e.url===`about:blank`),o=i&&(e.url.startsWith(fs)||e.title.startsWith(fs)),s=i&&!a&&!o?oi(e.url):``,c=i?e.title.trim():``,l=c.length===0||c===`about:blank`||c===t,u=i&&!a&&!o&&c.length>0;return{faviconUrl:i?e.faviconUrl:null,isAudible:i&&e.isAudible,isCapturingUserMedia:i&&e.isCapturingUserMedia,isHighlighted:n,preserveExistingTitle:o,title:u&&!l?c:s||t}}",
  "function Np(){let S={isTerminal:true,faviconUrl:null};w.updateTab(d,l,{icon:(0,$.jsx)(Dt,{alt:``,className:`size-full rounded-2xs`,logoUrl:S.faviconUrl,fallback:(0,$.jsx)(bi,{className:`size-full`})}),title:e})}",
  "function Eu(){",
  "let X={url:`http://localhost/__terminal?cwd=/tmp`,isLoading:!1},Wt=X.tabType===ne.WEB,Kt=Wt&&X.url.trim().length>0,Qt={};",
  "let Ui=!1,Wi=`Show`;",
  'return(0,$.jsxs)(`div`,{ref:L,"data-browser-sidebar-primary-focus-target":Kt?`webview`:`address`,className:`relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]`,tabIndex:-1,children:[(0,$.jsxs)(`div`,{className:`relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border`,children:[(0,$.jsx)(`input`,{"data-browser-sidebar-address-input":`true`})]}),(0,$.jsx)(`div`,{className:`relative flex min-h-0 min-w-0 flex-1 flex-col`})]})',
  "}",
].join("");

const applicationMenuChunk = [
  "function $n(){return(0,$.jsx)(`button`,{id:`sidebar-trigger`})}",
  "function In(){return yt()&&window.electronBridge?.showApplicationMenu!=null}",
  "var Ln=_({file:{id:`windowsMenuBar.file`,defaultMessage:`File`},edit:{id:`windowsMenuBar.edit`,defaultMessage:`Edit`},view:{id:`windowsMenuBar.view`,defaultMessage:`View`},help:{id:`windowsMenuBar.help`,defaultMessage:`Help`}});",
  "function zn(){if(!In())return null;return Rn.map(e=>(0,$.jsx)(`button`,{children:e.id}))}",
  "function ni(){let n=(0,$.jsx)($n,{}),r=null,i=(0,$.jsx)(zn,{});return(0,$.jsxs)(`div`,{children:[n,r,i]})}",
].join("");

const browserPanelOpenChunk =
  "function Rp(e,{browserConversationId:t,browserHostDisplayName:n,browserTabId:r,cwd:i,hostId:a,initialUrl:o,initiator:s,insertAfterTabId:c,source:l,target:u=`right`}={}){let d=t??vt(e);if(d==null)return null;let f=Hp(e,d,r),p=!e.get(h)&&!v(e,d,f);if(p&&Lr(e,d,f)==null&&Gt.removeTab(d,f),p&&qt(d,f,{initialUrl:o,initiator:s,source:l}),!Ip(e,!0,{browserConversationId:d,browserHostDisplayName:n,browserTabId:f,cwd:i,insertAfterTabId:c},u))return p&&$t(d,f),null;let m=u===`right`?Gp(e,d,f)??f:f;return p?m!==f&&($t(d,f),qt(d,m,{initialUrl:o,initiator:s,source:l})):qt(d,m,{initialUrl:o,initiator:s,source:l}),o!=null&&w.dispatchMessage(`browser-sidebar-command`,{browserTabId:m,conversationId:d,command:{hostId:a??e.get(Dr),initiator:s??`toggle_browser_command`,source:l??`manual`,type:`navigate`,url:o}}),m}";

const browserTabOpenChunk =
  "function Ip(e,t=!0,n={},r=`right`){let i=vt(e),a=n.browserConversationId??i;if(a==null)return!1;let o=Hp(e,a,n.browserTabId),s=Lr(e,a,o,r),c=s?.target??r,l=e.get(Rr).formatMessage({id:`thread.sidePanel.emptyBrowserTab`,defaultMessage:`New tab`}),u=ps({browserSnapshot:Gt.getSnapshot(a,o),browserTabFallbackTitle:l,isBrowserUseActive:Gt.isBrowserUseActive(a,o),isBrowserUseTab:Gt.isBrowserUseTab(a,o)}),d=Mr(c),f=s?.tab??e.get(d.tabById$,o),p=u.preserveExistingTitle&&f?.title!=null?f.title:u.title,m=n.browserHostDisplayName??e.get(kr).display_name,g=n.cwd??e.get(Or);return d.openTab(e,Mp,{icon:u.isTerminal?Q.createElement(codexWebTerminalTabIcon,{className:`icon-xs shrink-0`}):(0,Q.createElement)(Dt,{alt:``,className:`icon-xs shrink-0 rounded-2xs`,logoUrl:u.faviconUrl,fallback:(0,Q.createElement)(bi,{className:`size-full`})}),props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:c},id:o,kind:dt.BROWSER,onMove:(e,t)=>({props:{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:t.panelId}}),title:p}),!0}";

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

const openInPrimaryIconChunk = [
  "function ft(){",
  "let g={icon:`apps/vscode.png`,resolvedIcon:`data:image/png;base64,abc`,label:`VS Code`},_=!0;",
  "let R=(0,Q.jsx)(`span`,{className:`icon-sm inline-flex shrink-0 items-center justify-center`,children:g==null?(0,Q.jsx)(`span`,{className:`size-4 rounded bg-token-bg-tertiary`}):(0,Q.jsx)(`img`,{alt:_?g.label:``,onError:_t,src:g.icon,className:`icon-sm`})});",
  "}",
  "var vt=S({openPrimaryTarget:{id:`localConversationPage.openPrimaryTarget`,defaultMessage:`Open in`,description:`Primary open button label`}});",
].join("");

const openInPrimaryIconChunkWithOtherResolvedIcon = [
  "function other(){return (0,Q.jsx)(`img`,{src:g.resolvedIcon??g.icon,className:`icon-sm`})}",
  openInPrimaryIconChunk,
].join("");

const openInPrimaryIconChunkWithOtherUnpatchedIcon = [
  "function other(){return (0,Q.jsx)(`img`,{src:g.icon,className:`icon-sm`})}",
  openInPrimaryIconChunk,
].join("");

const sourceWithBrowserChromeChunk = `${sourceChunk.replace("function Rp(e,t){return t}", browserPanelOpenChunk)}${browserChromeChunk}${browserTabOpenChunk}`;

test("patchTerminalSidePanelSource replaces the openSessionSandboxSidePanel stub", () => {
  const patched = patchTerminalSidePanelSource(sourceChunk, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /initialUrl:`\$\{globalThis\.location\.origin\}\/__terminal\?cwd=\$\{encodeURIComponent/,
  );
  assert.match(
    patched,
    /\$\{i\?`&locale=\$\{encodeURIComponent\(i\)\}`:``\}/,
  );
  assert.match(patched, /i=codexWebTerminalLocale\(e\.get\(Rr\)\?\.locale\)/);
  assert.match(patched, /function codexWebTerminalLocale\(e\)/);
  assert.doesNotMatch(patched, /navigator\.language/);
  assert.match(patched, /c=re\(crypto\.randomUUID\(\)\)/);
  assert.match(patched, /l=re\(crypto\.randomUUID\(\)\)/);
  assert.match(patched, /browserConversationId:c/);
  assert.match(patched, /browserTabId:l/);
  assert.match(patched, /terminalConversationId=\$\{encodeURIComponent\(c\)\}/);
  assert.match(patched, /terminalBrowserTabId=\$\{encodeURIComponent\(l\)\}/);
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
    'import{t as Rr}from"./app-intl-signal-Bd_tJ6VJ.js";',
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
    /function rm\(e,t,n=!0\)\{let r=e\.get\(Or\),i=codexWebTerminalLocale\(e\.get\(Rr\)\?\.locale\),c=re\(crypto\.randomUUID\(\)\),l=re\(crypto\.randomUUID\(\)\);return Rp\(e,\{browserConversationId:c,browserTabId:l/,
  );
});

test("patchTerminalSidePanelSource upgrades the old locale helper when the side panel function is already current", () => {
  const alreadyCurrentSource = [
    oldTerminalLocaleHelper,
    'import{t as Rr}from"./app-intl-signal-Bd_tJ6VJ.js";',
    "function zu(){let x=l(Or),h=l(kr),f={cwd:x,hostConfig:h};return f}",
    "function Rp(e,t){return t}",
    "function Hp(e,t,n){return n??re(crypto.randomUUID())}",
    "function rm(e,t,n=!0){let r=e.get(Or),i=codexWebTerminalLocale(e.get(Rr)?.locale);return Rp(e,{browserConversationId:re(crypto.randomUUID()),browserTabId:re(crypto.randomUUID()),initialUrl:`${globalThis.location.origin}/__terminal?cwd=${encodeURIComponent(r??``)}${i?`&locale=${encodeURIComponent(i)}`:``}`,initiator:`side_panel_terminal`,source:`manual`,target:`right`,cwd:r??void 0})!=null}",
  ].join("");

  const patched = patchTerminalSidePanelSource(alreadyCurrentSource, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.doesNotMatch(patched, /function codexWebTerminalLocale\(\)/);
  assert.match(patched, /function codexWebTerminalLocale\(e\)/);
  assert.match(patched, /i=codexWebTerminalLocale\(e\.get\(Rr\)\?\.locale\)/);
});

test("patchTerminalBrowserPanelOpenSource keeps terminal opens on their requested tab id", () => {
  const patched = patchTerminalBrowserPanelOpenSource(browserPanelOpenChunk, {
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /let f=s===`side_panel_terminal`\|\|s===`side_panel_browser`\?r\?\?crypto\.randomUUID\(\):Hp\(e,d,r\),p=/,
  );
  assert.match(
    patched,
    /let m=s===`side_panel_terminal`\|\|s===`side_panel_browser`\?f:u===`right`\?Gp\(e,d,f\)\?\?f:f;/,
  );
  assert.match(
    patched,
    /!Ip\(e,!0,\{codexWebIsTerminal:s===`side_panel_terminal`,codexWebPreserveBrowserTabId:s===`side_panel_terminal`\|\|s===`side_panel_browser`,browserConversationId:d,browserHostDisplayName:n,browserTabId:f,cwd:i,insertAfterTabId:c\},u\)/,
  );
  assert.equal(
    patchTerminalBrowserPanelOpenSource(patched, {
      openBrowserPanelFunctionName: "Rp",
    }),
    patched,
  );
});

test("patchTerminalBrowserPanelOpenSource keeps Browser menu opens on their requested tab id", () => {
  const patched = patchTerminalBrowserPanelOpenSource(browserPanelOpenChunk, {
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /let f=s===`side_panel_terminal`\|\|s===`side_panel_browser`\?r\?\?crypto\.randomUUID\(\):Hp\(e,d,r\),p=/,
  );
  assert.match(
    patched,
    /let m=s===`side_panel_terminal`\|\|s===`side_panel_browser`\?f:u===`right`\?Gp\(e,d,f\)\?\?f:f;/,
  );
  assert.match(patched, /codexWebPreserveBrowserTabId:/);
  assert.match(patched, /codexWebIsTerminal:s===`side_panel_terminal`/);
});

test("patchTerminalBrowserTabMarkerSource marks terminal browser tabs", () => {
  const patched = patchTerminalBrowserTabMarkerSource(
    `${browserChromeChunk}${browserTabOpenChunk}`,
  );

  assert.match(patched, /y=n\.codexWebIsTerminal===!0\|\|u\.isTerminal===!0/);
  assert.match(patched, /p=y\?\(n\.cwd\?\.split\(\//);
  assert.match(patched, /id:`codexWeb\.terminal\.title`/);
  assert.match(patched, /defaultMessage:`Terminal`/);
  assert.match(patched, /codexWebIsTerminal:y/);
  assert.match(
    patched,
    /props:\{browserConversationId:a,browserHostDisplayName:m,browserTabId:o,cwd:g,target:c,codexWebIsTerminal:y\}/,
  );
  assert.match(patched, /icon:y\?/);
  assert.match(patched, /kind:y\?dt\.SANDBOX:dt\.BROWSER/);
  assert.match(
    patched,
    /w\.updateTab\(d,l,\{codexWebIsTerminal:S\.isTerminal===!0,/,
  );
  assert.equal(patchTerminalBrowserTabMarkerSource(patched), patched);
});

test("patchTerminalBrowserTabMarkerSource upgrades the old hardcoded terminal title fallback", () => {
  const freshPatch = patchTerminalBrowserTabMarkerSource(
    `${browserChromeChunk}${browserTabOpenChunk}`,
  );
  const previouslyPatched = freshPatch.replace(
    "??e.get(Rr).formatMessage({id:`codexWeb.terminal.title`,defaultMessage:`Terminal`}))",
    "??`Terminal`)",
  );

  const patched = patchTerminalBrowserTabMarkerSource(previouslyPatched);

  assert.doesNotMatch(patched, /\?\?`Terminal`/);
  assert.match(patched, /id:`codexWeb\.terminal\.title`/);
});

test("patchTerminalBrowserTabMarkerSource leaves unrelated browser tab kinds unchanged", () => {
  const unrelatedBrowserTabOpenChunk =
    "function Other(e){return e.openTab(e,Foo,{id:`other`,kind:dt.BROWSER,onActivate:()=>{}})}";
  const patched = patchTerminalBrowserTabMarkerSource(
    `${browserChromeChunk}${unrelatedBrowserTabOpenChunk}${browserTabOpenChunk}`,
  );

  assert.match(
    patched,
    /function Other\(e\)\{return e\.openTab\(e,Foo,\{id:`other`,kind:dt\.BROWSER,onActivate:/,
  );
  assert.match(
    patched,
    /function Ip\(e,t=!0,n=\{\},r=`right`\)[\s\S]*kind:y\?dt\.SANDBOX:dt\.BROWSER,onMove:/,
  );
});

test("patchTerminalNewTabMenuSource shows Browser when only terminal browser tabs exist", () => {
  const patched = patchTerminalNewTabMenuSource(newTabMenuChunk);

  assert.match(
    patched,
    /function it\(e\)\{return de\(e\)&&e\.props\?\.codexWebIsTerminal!==!0&&e\.codexWebIsTerminal!==!0\}/,
  );
  assert.match(patched, /browserTabId:crypto\.randomUUID\(\)/);
  assert.match(patched, /initiator:`side_panel_browser`/);
  assert.equal(patchTerminalNewTabMenuSource(patched), patched);
});

test("patchThreadOpenInPrimaryIconSource uses resolved icons for the top Open in button", () => {
  const patched = patchThreadOpenInPrimaryIconSource(openInPrimaryIconChunk);

  assert.match(patched, /src:g\.resolvedIcon\?\?g\.icon/);
  assert.doesNotMatch(patched, /src:g\.icon/);
  assert.equal(patchThreadOpenInPrimaryIconSource(patched), patched);
});

test("patchThreadOpenInPrimaryIconSource does not skip the top Open in button when another icon is already patched", () => {
  const patched = patchThreadOpenInPrimaryIconSource(
    openInPrimaryIconChunkWithOtherResolvedIcon,
  );

  assert.equal(
    (patched.match(/src:g\.resolvedIcon\?\?g\.icon,className:`icon-sm`/g) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(
    patched,
    /openPrimaryTarget[\s\S]*src:g\.icon,className:`icon-sm`/,
  );
});

test("patchThreadOpenInPrimaryIconSource does not patch an unrelated earlier icon", () => {
  const patched = patchThreadOpenInPrimaryIconSource(
    openInPrimaryIconChunkWithOtherUnpatchedIcon,
  );

  assert.match(
    patched,
    /function other\(\)\{return \(0,Q\.jsx\)\(`img`,\{src:g\.icon,className:`icon-sm`\}\)\}/,
  );
  assert.match(
    patched,
    /function ft\(\)[\s\S]*src:g\.resolvedIcon\?\?g\.icon,className:`icon-sm`[\s\S]*openPrimaryTarget/,
  );
  assert.equal(patchThreadOpenInPrimaryIconSource(patched), patched);
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
  const patched = patchTerminalActionSource(sidePanelActionWithTerminalCommandChunk, {
    terminalActionFunctionName: "Pe",
    terminalOpenerFunctionName: "js",
  });

  assert.match(patched, /let Re=\(\)=>\{De\(a,r\),n\?\.\(\)\}/);
  assert.match(
    patched,
    /codexWebTerminalKeyboardShortcut=i\(J,`toggleTerminal`\)/,
  );
  assert.match(
    patched,
    /\(codexWebInstallTerminalBrowserShortcut\(Pe\),\{id:`terminal`,Icon:Md,onSelect:Pe,keyboardShortcut:codexWebTerminalKeyboardShortcut,title:/,
  );
  assert.match(patched, /function codexWebInstallTerminalBrowserShortcut/);
  assert.match(
    patched,
    /Ne\(`toggleTerminal`,y\);codexWebInstallTerminalBrowserShortcut\(\(\)=>\{js\(r\)\}\);/,
  );
  assert.doesNotMatch(patched, /codexWebInstallTerminalBrowserShortcut\(y\)/);
  assert.equal(
    patchTerminalActionSource(patched, {
      terminalActionFunctionName: "Pe",
      terminalOpenerFunctionName: "js",
    }),
    patched,
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
  fs.writeFileSync(actionPath, sidePanelActionWithNewTabMenuChunk);
  const applicationMenuPath = path.join(assetsDir, "app-shell.js");
  fs.writeFileSync(applicationMenuPath, applicationMenuChunk);

  const patchedPaths = patchTerminalSidePanelSupport(assetsDir);

  assert.deepEqual(patchedPaths, [sourcePath, actionPath, applicationMenuPath]);
  assert.match(
    fs.readFileSync(sourcePath, "utf8"),
    /\$\{globalThis\.location\.origin\}\/__terminal\?cwd=/,
  );
  assert.match(fs.readFileSync(sourcePath, "utf8"), /S\.isTerminal\?/);
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /codexWebTerminalKeyboardShortcut=i\(J,`toggleTerminal`\)/,
  );
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /\(codexWebInstallTerminalBrowserShortcut\(Pe\),\{id:`terminal`,Icon:Md,onSelect:Pe,keyboardShortcut:codexWebTerminalKeyboardShortcut,title:/,
  );
  assert.doesNotMatch(
    fs.readFileSync(actionPath, "utf8"),
    /codexWebInstallTerminalBrowserShortcut\(y\)/,
  );
  assert.match(
    fs.readFileSync(applicationMenuPath, "utf8"),
    /function In\(\)\{return!1\/\*codexWebDisableApplicationMenu\*\/\}/,
  );
  assert.match(
    fs.readFileSync(actionPath, "utf8"),
    /e\.props\?\.codexWebIsTerminal!==!0/,
  );
});

test("patchTerminalBrowserChromeSource hides browser toolbar for terminal URLs", () => {
  const patched = patchTerminalBrowserChromeSource(browserChromeChunk);

  assert.match(patched, /function codexWebTerminalTabIcon/);
  assert.match(
    patched,
    /function codexWebCloseTerminalSettingsOnOutsidePointer/,
  );
  assert.match(
    patched,
    /document\.addEventListener\(`pointerdown`,codexWebCloseTerminalSettingsOnOutsidePointer,!0\)/,
  );
  assert.match(
    patched,
    /querySelectorAll\(`iframe\[data-codex-web-browser-panel-frame\]\[src\*="\/__terminal"\]`\)/,
  );
  assert.match(
    patched,
    /postMessage\(\{type:`codex-web-terminal-close-settings`\},globalThis\.location\.origin\)/,
  );
  assert.match(patched, /isTerminal:/);
  assert.match(patched, /codex-web-terminal-exit/);
  assert.match(patched, /function codexWebCloseTerminalTabOnExit/);
  assert.doesNotMatch(patched, /codexWebTerminalExitTab/);
  assert.doesNotMatch(patched, /;Qt=/);
  assert.match(
    patched,
    /iframe\[data-codex-web-browser-panel-frame\]\[src\*="\/__terminal"\]/,
  );
  assert.match(patched, /button:not\(\[role="tab"\]\)/);
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

test("patchTerminalBrowserChromeSource drops mixed-content favicon URLs", () => {
  const patched = patchTerminalBrowserChromeSource(browserChromeChunk);

  assert.match(patched, /function codexWebSafeFaviconUrl/);
  assert.match(patched, /faviconUrl:codexWebSafeFaviconUrl\(i\?e\.faviconUrl:null\)/);
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
