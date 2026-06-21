import assert from "node:assert/strict";
import test from "node:test";

import {
  patchArtifactPreviewOpenTargetLabelsSource,
  patchContextMenuMessageValueLabelsSource,
  patchFileTreeOpenTargetLabelsSource,
  patchOpenTargetContextMenuLabelsSource,
  patchThreadAppShellOpenTargetLabelsSource,
  patchWorkspaceFileContextMenuLabelsSource,
} from "../scripts/patch_webview_open_target_labels.mjs";

test("context menu patch formats nested message descriptor values", () => {
  const source =
    "function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,e.messageValues):e.id,i=e.tooltipMessage?t(e.tooltipMessage,e.tooltipMessageValues):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}function he(e){return e.message?(0,p.jsx)(a,{...e.message,values:e.messageValues}):e.id}";

  const patched = patchContextMenuMessageValueLabelsSource(source);

  assert.match(patched, /function codexFormatMessageValues\(/);
  assert.match(patched, /function codexFormatReactMessageValues\(/);
  assert.match(
    patched,
    /t\(e\.message,codexFormatMessageValues\(e\.messageValues,t\)\)/,
  );
  assert.match(
    patched,
    /\(0,p\.jsx\)\(a,\{\.\.\.e\.message,values:codexFormatReactMessageValues\(e\.messageValues\)\}\)/,
  );
});

test("context menu patch fails when the React message renderer is absent", () => {
  const source =
    "function codexFormatMessageValues(e,t){if(e==null)return e;let n={};for(let[r,i]of Object.entries(e))n[r]=i&&typeof i==`object`&&typeof i.id==`string`&&typeof i.defaultMessage==`string`?t(i):i;return n}function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,codexFormatMessageValues(e.messageValues,t)):e.id,i=e.tooltipMessage?t(e.tooltipMessage,codexFormatMessageValues(e.tooltipMessageValues,t)):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}";

  assert.throws(
    () => patchContextMenuMessageValueLabelsSource(source),
    /Unable to patch context menu React message values/,
  );
});

test("context menu patch upgrades native-only patches with React message formatting", () => {
  const source =
    "function codexFormatMessageValues(e,t){if(e==null)return e;let n={};for(let[r,i]of Object.entries(e))n[r]=i&&typeof i==`object`&&typeof i.id==`string`&&typeof i.defaultMessage==`string`?t(i):i;return n}function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,codexFormatMessageValues(e.messageValues,t)):e.id,i=e.tooltipMessage?t(e.tooltipMessage,codexFormatMessageValues(e.tooltipMessageValues,t)):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}function he(e){return e.message?(0,p.jsx)(a,{...e.message,values:e.messageValues}):e.id}";

  const patched = patchContextMenuMessageValueLabelsSource(source);

  assert.match(patched, /function codexFormatReactMessageValues\(/);
  assert.match(
    patched,
    /values:codexFormatReactMessageValues\(e\.messageValues\)/,
  );
});

test("context menu patch handles renamed React renderer aliases", () => {
  const source =
    "function q(t){return t.message?(0,x.jsx)(Fmt,{...t.message,values:t.messageValues}):t.id}";

  const patched = patchContextMenuMessageValueLabelsSource(source);

  assert.match(
    patched,
    /function codexFormatReactMessageValues\(e\)\{if\(e==null\)return e;let t=\{\};for\(let\[n,r\]of Object\.entries\(e\)\)t\[n\]=r&&typeof r==`object`&&typeof r\.id==`string`&&typeof r\.defaultMessage==`string`\?\(0,x\.jsx\)\(Fmt,\{\.\.\.r\}\):r;return t\}/,
  );
  assert.match(
    patched,
    /function q\(t\)\{return t\.message\?\(0,x\.jsx\)\(Fmt,\{\.\.\.t\.message,values:codexFormatReactMessageValues\(t\.messageValues\)\}\):t\.id\}/,
  );
});

test("open target context menu patch uses localized target labels", () => {
  const source =
    "function e({idPrefix:e,messages:t,onOpenInTarget:n,primaryTarget:r,visibleTargets:i}){return r==null?[]:[{id:`${e}-primary`,message:t.openInTarget,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)},{id:`${e}-targets`,message:t.openIn,submenu:i.map(r=>({id:`${e}-target-${r.id}`,message:t.openInTargetSubmenu,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)}))}]}export{e as t};";

  const patched = patchOpenTargetContextMenuLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(r\)/);
});

test("open target context menu patch handles renamed minified variables", () => {
  const source =
    "function build({idPrefix:a,messages:b,onOpenInTarget:c,primaryTarget:d,visibleTargets:f}){return d==null?[]:[{id:`${a}-primary`,message:b.openInTarget,messageValues:{target:d.label},icon:d.icon,onSelect:()=>c(d.target,d.appPath)},{id:`${a}-targets`,message:b.openIn,submenu:f.map(item=>({id:`${a}-target-${item.id}`,message:b.openInTargetSubmenu,messageValues:{target:item.label},icon:item.icon,onSelect:()=>c(item.target,item.appPath)}))}]}";

  const patched = patchOpenTargetContextMenuLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(d\)/);
  assert.match(patched, /target:codexOpenTargetLabel\(item\)/);
});

test("artifact preview open dropdown patch localizes target labels", () => {
  const source =
    "let open=(0,Q.jsx)(w,{id:`artifactTab.preview.open`,defaultMessage:`Open`});function at(e){let t=(0,Z.c)(19),{cwd:n,deferEnrichment:r,hostId:i,isQueryEnabled:a,openPath:o}=e,s=r===void 0?!1:r,l=c(),u,d,p;t[0]!==n||t[1]!==s||t[2]!==i||t[3]!==o?(u={cwd:n,hostId:i,path:o,...s?{deferEnrichment:!0}:{}},p=h,d=f(`open-in-targets`,u),t[0]=n,t[1]=s,t[2]=i,t[3]=o,t[4]=u,t[5]=d,t[6]=p):(u=t[4],d=t[5],p=t[6]);return p({queryKey:d})}let K=r==null?x:f.formatMessage({id:`artifactTab.preview.openPrimaryTarget.tooltip`,defaultMessage:`Open in {target}`,description:`Tooltip for opening an artifact in the primary app`},{target:r.label}),re;let V=(0,Q.jsx)(we,{dropdownContent:(0,Q.jsx)(Q.Fragment,{children:s.map(e=>(0,Q.jsxs)(J.Item,{onSelect:()=>{F(e,u)},children:[(0,Q.jsx)(J.ItemIcon,{children:(0,Q.jsx)(`img`,{alt:``,src:e.icon,className:`icon-sm`})}),e.label]},e.id))}),tooltipContent:K})";

  const patched = patchArtifactPreviewOpenTargetLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /function codexFormatOpenTargetLabel\(/);
  assert.match(patched, /function codexOpenTargetLabelNode\(/);
  assert.match(patched, /function codexWebOpenTargetLocale\(/);
  assert.match(
    patched,
    /u=\{cwd:n,hostId:i,path:o,locale:codexWebOpenTargetLocale\(\),\.\.\.s\?\{deferEnrichment:!0\}:\{\}\}/,
  );
  assert.match(
    patched,
    /\{target:codexFormatOpenTargetLabel\(r,f\.formatMessage\)\}/,
  );
  assert.match(
    patched,
    /codexOpenTargetLabelNode\(e,Q,w\)/,
  );
  assert.doesNotMatch(patched, /target:r\.label/);
  assert.doesNotMatch(patched, /\),e\.label\]/);
});

test("artifact preview open dropdown patch upgrades legacy locale helper", () => {
  const source =
    "let open=(0,Q.jsx)(w,{id:`artifactTab.preview.open`,defaultMessage:`Open`});let u={cwd:n,hostId:i,path:o,locale:codexWebOpenTargetLocale(),...s?{deferEnrichment:!0}:{}};let K=r==null?x:f.formatMessage({id:`artifactTab.preview.openPrimaryTarget.tooltip`,defaultMessage:`Open in {target}`,description:`Tooltip for opening an artifact in the primary app`},{target:codexFormatOpenTargetLabel(r,f.formatMessage)});let V=(0,Q.jsx)(we,{dropdownContent:(0,Q.jsx)(Q.Fragment,{children:s.map(e=>(0,Q.jsxs)(J.Item,{children:[(0,Q.jsx)(J.ItemIcon,{children:(0,Q.jsx)(`img`,{alt:``,src:e.icon,className:`icon-sm`})}),codexOpenTargetLabelNode(e,Q,w)]},e.id))})});function codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}function codexOpenTargetLabelNode(e,t,n){let r=codexOpenTargetLabel(e);return r&&typeof r==`object`&&typeof r.id==`string`&&typeof r.defaultMessage==`string`?(0,t.jsx)(n,{...r}):r}function codexFormatOpenTargetLabel(e,t){let n=codexOpenTargetLabel(e);return n&&typeof n==`object`&&typeof n.id==`string`&&typeof n.defaultMessage==`string`?t(n):n}function codexWebOpenTargetLocale(){let e=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`],t=[];for(let n of e)try{let e=localStorage.getItem(n);if(e){t.push(e);try{let n=JSON.parse(e);typeof n==`string`?t.push(n):n&&typeof n==`object`&&t.push(n.locale,n.language,n.appLocale,n.appLanguage,n.ideLocale,n.value)}catch{}}}catch{}t.push(document.documentElement.lang,navigator.language);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}";

  const patched = patchArtifactPreviewOpenTargetLabelsSource(source);

  assert.match(patched, /globalThis\.__codexOpenTargetLocale/);
  assert.doesNotMatch(patched, /let e=\[`codex-web\.locale`/);
});

test("file tree open target patch localizes fallback targets and requests locale", () => {
  const source =
    "import{Z as ta}from\"./app-scope-CWE-zIhQ.js\";function ia(e){let t=(0,ta.c)(97),N=w(C()),{platform:P}=_(),F=s(`add-context-file`);return F}function la({cwd:e,fallbackOpenTargets:t,hostId:n,queryClient:r,targetPath:i}){if(i==null)return{isLoadingOpenTargets:!1,primaryTarget:null,visibleTargets:[]};let a=o(`open-in-targets`,{cwd:e,hostId:n,path:i}),s=r.getQueryData(a),c=s?.targets??t.targets,l=s?.availableTargets??t.availableTargets,u=s?.preferredTarget??t.preferredTarget,d=s?.mode??t.mode;return{isLoadingOpenTargets:s==null&&!t.hasLoadedTargets&&r.getQueryState(a)?.status!==`error`,primaryTarget:D({preferredTarget:u,targets:c,availableTargets:l,mode:d}),visibleTargets:E({targets:c,availableTargets:l,includeHiddenTargets:!0,mode:d})}}function ua({cwd:e,hostId:t,queryClient:n,targetPath:r}){if(r!=null)return n.prefetchQuery({gcTime:c.INFINITE,queryKey:o(`open-in-targets`,{cwd:e,hostId:t,path:r}),queryFn:()=>a(`open-in-targets`,{params:{cwd:e,hostId:t,path:r}}),staleTime:c.ONE_MINUTE})}";

  const patched = patchFileTreeOpenTargetLabelsSource(source);

  assert.match(
    patched,
    /import\{Z as ta,s as codexReadSignal\}from"\.\/app-scope-CWE-zIhQ\.js";import\{t as codexAppIntlSignal\}from"\.\/app-intl-signal-Bd_tJ6VJ\.js";/,
  );
  assert.match(
    patched,
    /codexSetWebOpenTargetLocale\(codexReadSignal\(codexAppIntlSignal\)\?\.locale\)/,
  );
  assert.match(patched, /function codexWebOpenTargetLocale\(/);
  assert.match(patched, /globalThis\.__codexOpenTargetLocale/);
  assert.match(patched, /function codexLocalizeOpenTargets\(/);
  assert.match(
    patched,
    /let codexLocale=codexWebOpenTargetLocale\(\),a=o\(`open-in-targets`,\{cwd:e,hostId:n,path:i,locale:codexLocale\}\),s=r\.getQueryData\(a\),c=codexLocalizeOpenTargets\(s\?\.targets\?\?t\.targets\)/,
  );
  assert.match(
    patched,
    /queryKey:o\(`open-in-targets`,\{cwd:e,hostId:t,path:r,locale:codexWebOpenTargetLocale\(\)\}\)/,
  );
  assert.match(
    patched,
    /queryFn:\(\)=>a\(`open-in-targets`,\{params:\{cwd:e,hostId:t,path:r,locale:codexWebOpenTargetLocale\(\)\}\}\)/,
  );
});

test("file tree open target patch upgrades legacy locale helper", () => {
  const source =
    "import{Z as ta,s as codexReadSignal}from\"./app-scope-CWE-zIhQ.js\";import{t as codexAppIntlSignal}from\"./app-intl-signal-Bd_tJ6VJ.js\";function ia(e){let t=(0,ta.c)(97),N=w(C());codexSetWebOpenTargetLocale(codexReadSignal(codexAppIntlSignal)?.locale);let{platform:P}=_(),F=s(`add-context-file`);return F}function la({cwd:e,fallbackOpenTargets:t,hostId:n,queryClient:r,targetPath:i}){if(i==null)return{isLoadingOpenTargets:!1,primaryTarget:null,visibleTargets:[]};let codexLocale=codexWebOpenTargetLocale(),a=o(`open-in-targets`,{cwd:e,hostId:n,path:i,locale:codexLocale}),s=r.getQueryData(a),c=codexLocalizeOpenTargets(s?.targets??t.targets),l=s?.availableTargets??t.availableTargets,u=s?.preferredTarget??t.preferredTarget,d=s?.mode??t.mode;return{isLoadingOpenTargets:s==null&&!t.hasLoadedTargets&&r.getQueryState(a)?.status!==`error`,primaryTarget:D({preferredTarget:u,targets:c,availableTargets:l,mode:d}),visibleTargets:E({targets:c,availableTargets:l,includeHiddenTargets:!0,mode:d})}}function ua({cwd:e,hostId:t,queryClient:n,targetPath:r}){if(r!=null)return n.prefetchQuery({gcTime:c.INFINITE,queryKey:o(`open-in-targets`,{cwd:e,hostId:t,path:r,locale:codexWebOpenTargetLocale()}),queryFn:()=>a(`open-in-targets`,{params:{cwd:e,hostId:t,path:r,locale:codexWebOpenTargetLocale()}}),staleTime:c.ONE_MINUTE})}function codexWebOpenTargetLocale(){let e=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`],t=[];for(let n of e)try{let e=localStorage.getItem(n);if(e){t.push(e);try{let n=JSON.parse(e);typeof n==`string`?t.push(n):n&&typeof n==`object`&&t.push(n.locale,n.language,n.appLocale,n.appLanguage,n.ideLocale,n.value)}catch{}}}catch{}t.push(document.documentElement.lang,navigator.language);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}function codexSetWebOpenTargetLocale(e){globalThis.__codexOpenTargetLocale=e}function codexLocalizeOpenTargets(e){return Array.isArray(e)?e.map(e=>{let t=codexWebOpenTargetLocale().trim().replaceAll(`_`,`-`).toLowerCase();if(!(t===`zh`||t.startsWith(`zh-`)))return e;return e.labelKey===`openTarget.systemDefault`?{...e,label:`默认应用`}:e.labelKey===`openTarget.fileManager`?{...e,label:`文件管理器`}:e}):e}";

  const patched = patchFileTreeOpenTargetLabelsSource(source);

  assert.match(patched, /globalThis\.__codexOpenTargetLocale/);
  assert.doesNotMatch(patched, /let e=\[`codex-web\.locale`/);
});

test("workspace file context menu patch uses localized submenu labels", () => {
  const source =
    'import{t as d}from"./open-target-context-menu-items-ClwD6vw2.js";var g=o({openWithTarget:{id:`markdown.fileReference.openWithTarget`,defaultMessage:`{target}`}});function x(t){return D.push({id:`workspace-file-open-targets`,message:g.openWith,submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))})}export{x as n};\n//# sourceMappingURL=workspace-file-context-menu-BD8jqgos.js.map';

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(e\)/);
  assert.match(
    patched,
    /function codexOpenTargetLabel[\s\S]*\n\/\/# sourceMappingURL=workspace-file-context-menu-BD8jqgos\.js\.map$/,
  );
});

test("workspace file context menu patch requests locale and localizes selected targets", () => {
  const source =
    'import"./use-host-config-Dpd_LQBD.js";import{n as r,u as i}from"./vscode-api-C493k1u5.js";import{t as d}from"./open-target-context-menu-items-ClwD6vw2.js";import{n as f,r as p}from"./open-target-selection-D_PPYsC7.js";function _({cwd:e,hostId:t,path:n}){return{gcTime:i.INFINITE,queryKey:r(`open-in-targets`,{cwd:e,hostId:t,path:n}),queryFn:()=>a(`open-in-targets`,{params:{cwd:e,hostId:t,path:n}}),staleTime:i.ONE_MINUTE}}function v(e){return{primaryTarget:p({preferredTarget:e?.preferredTarget??null,targets:e?.targets??[],availableTargets:e?.availableTargets??[],mode:e?.mode}),visibleTargets:f({targets:e?.targets??[],availableTargets:e?.availableTargets??[],includeHiddenTargets:!0,mode:e?.mode})}}function x(t){return D.push({id:`workspace-file-open-targets`,message:g.openWith,submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))})}';

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.doesNotMatch(patched, /codexReadSignal|codexAppIntlSignal/);
  assert.doesNotMatch(patched, /function codexWorkspaceOpenTargetLocale\(/);
  assert.match(
    patched,
    /let codexLocale=codexWebOpenTargetLocale\(\);return\{gcTime:i\.INFINITE,queryKey:r\(`open-in-targets`,\{cwd:e,hostId:t,path:n,locale:codexLocale\}\),queryFn:\(\)=>a\(`open-in-targets`,\{params:\{cwd:e,hostId:t,path:n,locale:codexLocale\}\}\),staleTime:i\.ONE_MINUTE\}/,
  );
  assert.match(
    patched,
    /function v\(e\)\{let codexTargets=codexLocalizeOpenTargets\(e\?\.targets\?\?\[\]\);return\{primaryTarget:p\(\{preferredTarget:e\?\.preferredTarget\?\?null,targets:codexTargets,availableTargets:e\?\.availableTargets\?\?\[\],mode:e\?\.mode\}\),visibleTargets:f\(\{targets:codexTargets,availableTargets:e\?\.availableTargets\?\?\[\],includeHiddenTargets:!0,mode:e\?\.mode\}\)\}\}/,
  );
  assert.match(patched, /function codexWebOpenTargetLocale\(/);
  assert.match(patched, /function codexLocalizeOpenTargets\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(e\)/);
});

test("workspace file context menu patch repairs helpers appended inside sourcemap comments", () => {
  const source =
    "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:codexOpenTargetLabel(e)},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))}\n//# sourceMappingURL=workspace-file-context-menu-BD8jqgos.js.mapfunction codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.match(
    patched,
    /sourceMappingURL=workspace-file-context-menu-BD8jqgos\.js\.map\nfunction codexOpenTargetLabel/,
  );
});

test("workspace file context menu patch removes hook-based locale helper", () => {
  const source =
    "function _({cwd:e,hostId:t,path:n}){let codexLocale=codexWorkspaceOpenTargetLocale();return{gcTime:i.INFINITE,queryKey:r(`open-in-targets`,{cwd:e,hostId:t,path:n,locale:codexLocale}),queryFn:()=>a(`open-in-targets`,{params:{cwd:e,hostId:t,path:n,locale:codexLocale}}),staleTime:i.ONE_MINUTE}}function v(e){let codexTargets=codexLocalizeOpenTargets(e?.targets??[]);return{primaryTarget:p({preferredTarget:e?.preferredTarget??null,targets:codexTargets,availableTargets:e?.availableTargets??[],mode:e?.mode}),visibleTargets:f({targets:codexTargets,availableTargets:e?.availableTargets??[],includeHiddenTargets:!0,mode:e?.mode})}}function codexWebOpenTargetLocale(){return``}function codexSetWebOpenTargetLocale(e){globalThis.__codexOpenTargetLocale=e}function codexWorkspaceOpenTargetLocale(){codexSetWebOpenTargetLocale(codexReadSignal(codexAppIntlSignal)?.locale);return codexWebOpenTargetLocale()}function codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.doesNotMatch(patched, /codexReadSignal|codexAppIntlSignal/);
  assert.doesNotMatch(patched, /codexWorkspaceOpenTargetLocale/);
  assert.match(patched, /let codexLocale=codexWebOpenTargetLocale\(\)/);
});

test("thread app shell open dropdown patch localizes header target labels", () => {
  const source =
    'import{Z as r,a as i,c as a,o,s,t as c}from"./app-scope-CWE-zIhQ.js";import{r as Me}from"./open-target-selection-D_PPYsC7.js";import{m as Ue}from"./image-preview-dialog-Bb-vTCJ6.js";function ft(e){let t=(0,$.c)(61),{cwd:n,hostConfig:r}=e,i=C(),a=Xe(`(max-width: 920px)`),[o,s]=(0,Z.useState)(null),c=r?.id,l;t[0]!==n||t[1]!==c?(l={cwd:n,deferEnrichment:!0,hostId:c},t[0]=n,t[1]=c,t[2]=l):l=t[2];let{canLoadTargets:u,preferredTarget:d,targets:f,availableTargets:p,hasLoadedTargets:m,open:h}=Ue(l);if(!n||!u)return null;let g,_,v;t[3]!==p||t[4]!==i||t[5]!==a||t[6]!==d||t[7]!==f?(g=Me({preferredTarget:d,targets:f,availableTargets:p,mode:`editor`}),_=a||g!=null&&d===g.target,v=g?i.formatMessage({id:`localConversationPage.openPrimaryTarget.tooltip`,defaultMessage:`Open in {target}`,description:`Tooltip for the primary open button`},{target:g.label}):void 0,t[3]=p,t[4]=i,t[5]=a,t[6]=d,t[7]=f,t[8]=g,t[9]=_,t[10]=v):(g=t[8],_=t[9],v=t[10]);let k=e.length===0?(0,Q.jsx)(gt,{}):e.map(e=>(0,Q.jsxs)(Y.Item,{children:[(0,Q.jsx)(Y.ItemIcon,{children:(0,Q.jsx)(`img`,{alt:``,src:e.icon,className:`icon-sm`})}),(0,Q.jsx)(`span`,{className:`truncate`,children:e.label})]},e.id))}';

  const patched = patchThreadAppShellOpenTargetLabelsSource(source);

  assert.match(
    patched,
    /import\{Z as r,a as i,c as a,o,s,t as c,s as codexReadSignal\}from"\.\/app-scope-CWE-zIhQ\.js";import\{t as codexAppIntlSignal\}from"\.\/app-intl-signal-Bd_tJ6VJ\.js";/,
  );
  assert.match(
    patched,
    /codexSetWebOpenTargetLocale\(codexReadSignal\(codexAppIntlSignal\)\?\.locale\);f=codexLocalizeOpenTargets\(f\);if\(!n\|\|!u\)return null/,
  );
  assert.match(
    patched,
    /\{target:codexFormatOpenTargetLabel\(g,i\.formatMessage\)\}/,
  );
  assert.match(patched, /function codexWebOpenTargetLocale\(/);
  assert.match(patched, /function codexSetWebOpenTargetLocale\(/);
  assert.match(patched, /function codexLocalizeOpenTargets\(/);
  assert.match(patched, /function codexFormatOpenTargetLabel\(/);
  assert.doesNotMatch(patched, /target:g\.label/);
});
