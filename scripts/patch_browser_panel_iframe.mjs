#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEBVIEW_CREATE = "document.createElement(`webview`)";
const IFRAME_FACTORY = "codexWebCreateBrowserPanelFrame()";
const PATCH_MARKER = "data-codex-web-browser-panel-frame";
const IFRAME_SANDBOX_SETTER =
  "e.setAttribute(`sandbox`,`allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts`),";

const helperSource =
  "function codexWebCreateBrowserPanelFrame(){let e=document.createElement(`iframe`);return e.setAttribute(`data-codex-web-browser-panel-frame`,`true`),e.setAttribute(`referrerpolicy`,`no-referrer-when-downgrade`),e.setAttribute(`loading`,`eager`),e.isLoading=()=>!1,e.stop=()=>{},e.reload=()=>{try{e.contentWindow?.location.reload()}catch{codexWebSetBrowserPanelFrameSrc(e,e.getAttribute(`src`)??`about:blank`)}},e.goBack=()=>{try{e.contentWindow?.history.back()}catch{}},e.goForward=()=>{try{e.contentWindow?.history.forward()}catch{}},e.canGoBack=()=>!1,e.canGoForward=()=>!1,e.getURL=()=>e.getAttribute(`src`)??`about:blank`,e.loadURL=t=>(codexWebSetBrowserPanelFrameSrc(e,t),Promise.resolve()),e.destroy=()=>{e.dispatchEvent(new Event(`destroyed`)),e.remove()},e.addEventListener(`load`,()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)}),e.addEventListener(`error`,()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-fail-load`)}),e}function codexWebDispatchBrowserPanelFrameEvent(e,t){e.dispatchEvent(new Event(t))}function codexWebSetBrowserPanelFrameSrc(e,t){let n=t&&t.length>0?t:`about:blank`;e.setAttribute(`src`,n),queueMicrotask(()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)})}function codexWebSyncBrowserPanelSnapshotUrl(e,t){let n=t?.url&&t.url.length>0?t.url:`about:blank`;t?.tabType===`web`&&e?.webview!=null&&e.webview.getAttribute(`src`)!==n&&codexWebSetBrowserPanelFrameSrc(e.webview,n)}";
const helperExpression =
  "codexWebCreateBrowserPanelFrame=function(){let e=document.createElement(`iframe`);return e.setAttribute(`data-codex-web-browser-panel-frame`,`true`),e.setAttribute(`referrerpolicy`,`no-referrer-when-downgrade`),e.setAttribute(`loading`,`eager`),e.isLoading=()=>!1,e.stop=()=>{},e.reload=()=>{try{e.contentWindow?.location.reload()}catch{codexWebSetBrowserPanelFrameSrc(e,e.getAttribute(`src`)??`about:blank`)}},e.goBack=()=>{try{e.contentWindow?.history.back()}catch{}},e.goForward=()=>{try{e.contentWindow?.history.forward()}catch{}},e.canGoBack=()=>!1,e.canGoForward=()=>!1,e.getURL=()=>e.getAttribute(`src`)??`about:blank`,e.loadURL=t=>(codexWebSetBrowserPanelFrameSrc(e,t),Promise.resolve()),e.destroy=()=>{e.dispatchEvent(new Event(`destroyed`)),e.remove()},e.addEventListener(`load`,()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)}),e.addEventListener(`error`,()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-fail-load`)}),e},codexWebDispatchBrowserPanelFrameEvent=function(e,t){e.dispatchEvent(new Event(t))},codexWebSetBrowserPanelFrameSrc=function(e,t){let n=t&&t.length>0?t:`about:blank`;e.setAttribute(`src`,n),queueMicrotask(()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)})},codexWebSyncBrowserPanelSnapshotUrl=function(e,t){let n=t?.url&&t.url.length>0?t.url:`about:blank`;t?.tabType===`web`&&e?.webview!=null&&e.webview.getAttribute(`src`)!==n&&codexWebSetBrowserPanelFrameSrc(e.webview,n)},";
const helperBindingVarPrefix =
  "var codexWebCreateBrowserPanelFrame,codexWebDispatchBrowserPanelFrameEvent,codexWebSetBrowserPanelFrameSrc,codexWebSyncBrowserPanelSnapshotUrl,";

export function findBrowserSidebarManagerAssets(assetsDir) {
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const assetName = path.basename(assetPath);
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        assetName.startsWith("browser-sidebar-manager-") ||
        source.includes("browser-sidebar-manager") ||
        (source.includes(WEBVIEW_CREATE) &&
          source.includes("browser-sidebar-webview-host-created") &&
          source.includes("data-browser-sidebar-webview-host-root"))
      );
    });
}

export function patchBrowserPanelIframeSupport(source) {
  const alreadyPatched = source.includes(PATCH_MARKER);
  let patched = source.replaceAll(IFRAME_SANDBOX_SETTER, "");

  if (isModernBrowserSidebarManagerSource(source)) {
    return patchModernBrowserPanelIframeSupport(patched, alreadyPatched);
  }

  if (!alreadyPatched) {
    const webviewCreateCount = countOccurrences(source, WEBVIEW_CREATE);
    if (webviewCreateCount !== 2) {
      throw new Error(
        `Expected 2 browser panel webview hosts, found ${webviewCreateCount}`,
      );
    }

    patched = source.replaceAll(WEBVIEW_CREATE, IFRAME_FACTORY);

    patched = replaceOnce(
      patched,
      "var me=`about:blank`,",
      `${helperSource}var me=\`about:blank\`,`,
      "browser panel constants",
    );

    patched = replaceOnce(
      patched,
      "u.setAttribute(`src`,me);let d=()=>{this.finishPendingDetach()};",
      "codexWebSetBrowserPanelFrameSrc(u,s.length===0?me:s);let d=()=>{this.finishPendingDetach()};",
      "visible browser panel initial URL",
    );

    patched = replaceOnce(
      patched,
      "this.webview.setAttribute(`src`,o.length===0?Ee:o),this.container.append(this.webview,this.cursorOverlayHost)",
      "codexWebSetBrowserPanelFrameSrc(this.webview,o.length===0?Ee:o),this.container.append(this.webview,this.cursorOverlayHost)",
      "retained browser panel initial URL",
    );

    patched = replaceOnce(
      patched,
      "this.webview.removeAttribute(k),this.webview.removeAttribute(A),this.webview.removeAttribute(j);return}this.webview.setAttribute(k,e),this.webview.setAttribute(A,t.toString()),this.webview.setAttribute(j,n)}}",
      "this.webview.removeAttribute(k),this.webview.removeAttribute(A),this.webview.removeAttribute(j),codexWebSetBrowserPanelFrameSrc(this.webview,n.length===0?me:n);return}this.webview.setAttribute(k,e),this.webview.setAttribute(A,t.toString()),this.webview.setAttribute(j,n),codexWebSetBrowserPanelFrameSrc(this.webview,n.length===0?me:n)}}",
      "browser panel adoption URL updates",
    );
  }

  patched = replaceFirstAvailable(
    patched,
    [
      {
        before:
          "if(s instanceof P)return s.setHostKind(c),a!=null&&(s.setAdoptionAttributes(a.adoptionLease??null,a.adoptedWebContentsId??null,i),",
        after:
          "if(s instanceof P)return s.setHostKind(c),s.setAdoptionAttributes(a?.adoptionLease??null,a?.adoptedWebContentsId??null,i),a!=null&&(",
      },
      {
        before:
          "if(s instanceof P)return s.setHostKind(c),a!=null&&(s.setAdoptionAttributes(a.adoptionLease??null,a.adoptedWebContentsId??null,i)),s;",
        after:
          "if(s instanceof P)return s.setHostKind(c),s.setAdoptionAttributes(a?.adoptionLease??null,a?.adoptedWebContentsId??null,i),s;",
      },
    ],
    "s.setAdoptionAttributes(a?.adoptionLease??null,a?.adoptedWebContentsId??null,i)",
    "existing visible browser panel URL updates",
  );

  patched = replaceOnceIfMissing(
    patched,
    "if(o!=null)return o.setHostKind(s),o;let c=new G({browserTabId:n",
    "if(o!=null)return o.setHostKind(s),codexWebSetBrowserPanelFrameSrc(o.webview,r.length===0?Ee:r),o;let c=new G({browserTabId:n",
    "codexWebSetBrowserPanelFrameSrc(o.webview,r.length===0?Ee:r)",
    "existing retained browser panel URL updates",
  );

  patched = replaceOnceIfMissing(
    patched,
    "function codexWebSetBrowserPanelFrameSrc(e,t){let n=t&&t.length>0?t:`about:blank`;e.setAttribute(`src`,n),queueMicrotask(()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)})}",
    "function codexWebSetBrowserPanelFrameSrc(e,t){let n=t&&t.length>0?t:`about:blank`;e.setAttribute(`src`,n),queueMicrotask(()=>{codexWebDispatchBrowserPanelFrameEvent(e,`did-attach`),codexWebDispatchBrowserPanelFrameEvent(e,`did-stop-loading`)})}function codexWebSyncBrowserPanelSnapshotUrl(e,t){let n=t?.url&&t.url.length>0?t.url:`about:blank`;t?.tabType===`web`&&e?.webview!=null&&e.webview.getAttribute(`src`)!==n&&codexWebSetBrowserPanelFrameSrc(e.webview,n)}",
    "function codexWebSyncBrowserPanelSnapshotUrl",
    "browser panel snapshot URL sync helper",
  );

  patched = replaceOnceIfMissing(
    patched,
    "this.snapshots.set(o,a),this.browserUseTabKeys.has(o)&&this.syncBrowserUseTabKeys(e),a.tabType!==n.WEB",
    "this.snapshots.set(o,a),codexWebSyncBrowserPanelSnapshotUrl(this.webviews.get(o),a),this.browserUseTabKeys.has(o)&&this.syncBrowserUseTabKeys(e),a.tabType!==n.WEB",
    "this.snapshots.set(o,a),codexWebSyncBrowserPanelSnapshotUrl(this.webviews.get(o),a)",
    "browser panel snapshot URL updates",
  );

  return patched;
}

function isModernBrowserSidebarManagerSource(source) {
  return (
    source.includes("data-browser-sidebar-webview-host-root") &&
    source.includes("browser-sidebar-webview-host-created") &&
    source.includes("setAdoptionAttributes(e,t,n)") &&
    source.includes("getRetainedWebview(e,t,n,r)")
  );
}

function patchModernBrowserPanelIframeSupport(source, alreadyPatched) {
  let patched = ensureModernBrowserPanelHelperBindings(
    fixMalformedModernBrowserPanelHelper(source),
    findModernBrowserPanelSymbols(source),
  );
  const symbols = findModernBrowserPanelSymbols(patched);

  if (!alreadyPatched) {
    patched = patchModernBrowserPanelConstants(patched, symbols);

    patched = replaceOnce(
      patched,
      "let l=document.createElement(`div`),u=document.createElement(`div`),d=document.createElement(`webview`);",
      "let l=document.createElement(`div`),u=document.createElement(`div`),d=codexWebCreateBrowserPanelFrame();",
      "modern visible browser panel host",
    );

    patched = replaceOnce(
      patched,
      "webview=document.createElement(`webview`);",
      "webview=codexWebCreateBrowserPanelFrame();",
      "modern retained browser panel host",
    );

    patched = patchModernVisibleBrowserPanelInitialUrl(patched, symbols);

    patched = patchModernRetainedBrowserPanelInitialUrl(patched, symbols);

    patched = patchModernBrowserPanelAdoptionUrlUpdates(patched, symbols);
  }

  patched = patchModernExistingVisibleBrowserPanelUrlUpdates(patched);

  patched = patchModernExistingRetainedBrowserPanelUrlUpdates(patched, symbols);

  patched = patchModernBrowserPanelSnapshotUrlUpdates(patched);

  return patched;
}

function findModernBrowserPanelSymbols(source) {
  const rootIndex = source.indexOf("`data-browser-sidebar-webview-host-root`");
  const rootPrefix =
    rootIndex === -1
      ? ""
      : source.slice(Math.max(0, rootIndex - 500), rootIndex);
  const visibleBlankUrlVar = rootPrefix.match(
    /([$A-Za-z_][\w$]*)=`about:blank`/,
  )?.[1];
  const retainedBlankUrlVar = source.match(
    /this\.webview\.setAttribute\(`src`,o\.length===0\?([$A-Za-z_][\w$]*):o\),this\.container\.append\(this\.webview,this\.cursorOverlayHost\)/,
  )?.[1];
  const adoptionAttributeVars = source.match(
    /this\.webview\.removeAttribute\(([$A-Za-z_][\w$]*)\),this\.webview\.removeAttribute\(([$A-Za-z_][\w$]*)\),this\.webview\.removeAttribute\(([$A-Za-z_][\w$]*)\);return\}this\.webview\.setAttribute\(\1,e\),this\.webview\.setAttribute\(\2,t\.toString\(\)\),this\.webview\.setAttribute\(\3,n\)\}\}/,
  );

  if (visibleBlankUrlVar == null) {
    return null;
  }

  return {
    visibleBlankUrlVar,
    retainedBlankUrlVar,
    adoptionLeaseVar: adoptionAttributeVars?.[1],
    adoptedWebContentsIdVar: adoptionAttributeVars?.[2],
    adoptedInitialUrlVar: adoptionAttributeVars?.[3],
  };
}

function patchModernBrowserPanelConstants(source, symbols) {
  if (symbols != null) {
    return replaceOnce(
      source,
      `${symbols.visibleBlankUrlVar}=\`about:blank\`,`,
      `${helperExpression}${symbols.visibleBlankUrlVar}=\`about:blank\`,`,
      "modern browser panel constants",
    );
  }

  return replaceOnce(
    source,
    "bEe(),PEe=`about:blank`,",
    `${helperExpression}bEe(),PEe=\`about:blank\`,`,
    "modern browser panel constants",
  );
}

function patchModernVisibleBrowserPanelInitialUrl(source, symbols) {
  const blankUrlVar = symbols?.visibleBlankUrlVar ?? "PEe";
  return replaceOnce(
    source,
    `this.setAdoptionAttributes(a??null,o??null,s),d.setAttribute(\`src\`,${blankUrlVar}),l.append(d,u)`,
    `this.setAdoptionAttributes(a??null,o??null,s),codexWebSetBrowserPanelFrameSrc(d,s.length===0?${blankUrlVar}:s),l.append(d,u)`,
    "modern visible browser panel initial URL",
  );
}

function patchModernRetainedBrowserPanelInitialUrl(source, symbols) {
  const blankUrlVar = symbols?.retainedBlankUrlVar ?? "ODe";
  return replaceOnce(
    source,
    `this.webview.setAttribute(\`src\`,o.length===0?${blankUrlVar}:o),this.container.append(this.webview,this.cursorOverlayHost)`,
    `codexWebSetBrowserPanelFrameSrc(this.webview,o.length===0?${blankUrlVar}:o),this.container.append(this.webview,this.cursorOverlayHost)`,
    "modern retained browser panel initial URL",
  );
}

function patchModernBrowserPanelAdoptionUrlUpdates(source, symbols) {
  const visibleBlankUrlVar = symbols?.visibleBlankUrlVar ?? "PEe";
  const adoptionLeaseVar = symbols?.adoptionLeaseVar ?? "zEe";
  const adoptedWebContentsIdVar = symbols?.adoptedWebContentsIdVar ?? "BEe";
  const adoptedInitialUrlVar = symbols?.adoptedInitialUrlVar ?? "VEe";
  return replaceOnce(
    source,
    `this.webview.removeAttribute(${adoptionLeaseVar}),this.webview.removeAttribute(${adoptedWebContentsIdVar}),this.webview.removeAttribute(${adoptedInitialUrlVar});return}this.webview.setAttribute(${adoptionLeaseVar},e),this.webview.setAttribute(${adoptedWebContentsIdVar},t.toString()),this.webview.setAttribute(${adoptedInitialUrlVar},n)}}`,
    `this.webview.removeAttribute(${adoptionLeaseVar}),this.webview.removeAttribute(${adoptedWebContentsIdVar}),this.webview.removeAttribute(${adoptedInitialUrlVar}),codexWebSetBrowserPanelFrameSrc(this.webview,n.length===0?${visibleBlankUrlVar}:n);return}this.webview.setAttribute(${adoptionLeaseVar},e),this.webview.setAttribute(${adoptedWebContentsIdVar},t.toString()),this.webview.setAttribute(${adoptedInitialUrlVar},n),codexWebSetBrowserPanelFrameSrc(this.webview,n.length===0?${visibleBlankUrlVar}:n)}}`,
    "modern browser panel adoption URL updates",
  );
}

function patchModernExistingVisibleBrowserPanelUrlUpdates(source) {
  return replaceRegexOnceIfMissing(
    source,
    /if\(l instanceof ([$A-Za-z_][\w$]*)&&l\.getPartition\(\)===c\)return l\.setHostKind\(u\),l\.setPagePersistence\(s\)&&\(this\.notifyWebviewHostCreated\(e,n,u,s\),this\.emitChange\(\)\),i!=null&&\(l\.setAdoptionAttributes\(i\.adoptionLease\?\?null,i\.adoptedWebContentsId\?\?null,r\),i\.adoptionLease!=null&&i\.adoptedWebContentsId!=null&&([$A-Za-z_][\w$]*)\.info\(`IAB_ADOPTION renderer updated adopted webview`,\{safe:\{adoptedWebContentsId:i\.adoptedWebContentsId,browserTabId:n,conversationId:e,hasInitialUrl:r\.length>0\},sensitive:\{\}\}\)\),l;/,
    (_match, hostClass, logger) =>
      `if(l instanceof ${hostClass}&&l.getPartition()===c)return l.setHostKind(u),l.setPagePersistence(s)&&(this.notifyWebviewHostCreated(e,n,u,s),this.emitChange()),l.setAdoptionAttributes(i?.adoptionLease??null,i?.adoptedWebContentsId??null,r),i?.adoptionLease!=null&&i.adoptedWebContentsId!=null&&${logger}.info(\`IAB_ADOPTION renderer updated adopted webview\`,{safe:{adoptedWebContentsId:i.adoptedWebContentsId,browserTabId:n,conversationId:e,hasInitialUrl:r.length>0},sensitive:{}}),l;`,
    "l.setAdoptionAttributes(i?.adoptionLease??null,i?.adoptedWebContentsId??null,r)",
    "modern existing visible browser panel URL updates",
  );
}

function patchModernExistingRetainedBrowserPanelUrlUpdates(source, symbols) {
  const blankUrlVar = symbols?.retainedBlankUrlVar ?? "ODe";
  return replaceOnceIfMissing(
    source,
    "if(c!=null&&c.getPartition()===s)return c.setHostKind(l),c.setPagePersistence(o)&&(this.notifyWebviewHostCreated(e,t,l,o),this.emitChange()),c;",
    `if(c!=null&&c.getPartition()===s)return c.setHostKind(l),c.setPagePersistence(o)&&(this.notifyWebviewHostCreated(e,t,l,o),this.emitChange()),codexWebSetBrowserPanelFrameSrc(c.webview,n.length===0?${blankUrlVar}:n),c;`,
    "codexWebSetBrowserPanelFrameSrc(c.webview,",
    "modern existing retained browser panel URL updates",
  );
}

function patchModernBrowserPanelSnapshotUrlUpdates(source) {
  return replaceRegexOnceIfMissing(
    source,
    /this\.snapshots\.set\(a,i\),this\.browserUseTabKeys\.has\(a\)&&this\.syncBrowserUseTabKeys\(e\),i\.tabType!==([$A-Za-z_][\w$]*)\.WEB/,
    (_match, tabTypeEnum) =>
      `this.snapshots.set(a,i),codexWebSyncBrowserPanelSnapshotUrl(this.webviews.get(a),i),this.browserUseTabKeys.has(a)&&this.syncBrowserUseTabKeys(e),i.tabType!==${tabTypeEnum}.WEB`,
    "this.snapshots.set(a,i),codexWebSyncBrowserPanelSnapshotUrl(this.webviews.get(a),i)",
    "modern browser panel snapshot URL updates",
  );
}

function fixMalformedModernBrowserPanelHelper(source) {
  return source
    .replace(
      `bEe(),${helperSource}PEe=\`about:blank\`,`,
      `${helperExpression}bEe(),PEe=\`about:blank\`,`,
    )
    .replace(
      `${helperSource}bEe(),PEe=\`about:blank\`,`,
      `${helperExpression}bEe(),PEe=\`about:blank\`,`,
    );
}

function ensureModernBrowserPanelHelperBindings(source, symbols = null) {
  if (
    source.includes(helperBindingVarPrefix) ||
    (!source.includes("var PEe,FEe,") &&
      !source.includes(`var ${symbols?.visibleBlankUrlVar},`))
  ) {
    return source;
  }
  if (symbols?.visibleBlankUrlVar != null) {
    return source.replace(
      `var ${symbols.visibleBlankUrlVar},`,
      `${helperBindingVarPrefix}${symbols.visibleBlankUrlVar},`,
    );
  }
  return source.replace("var PEe,FEe,", `${helperBindingVarPrefix}PEe,FEe,`);
}

export function patchBrowserPanelIframeAssets(assetsDir) {
  const assetPaths = findBrowserSidebarManagerAssets(assetsDir);

  if (assetPaths.length === 0) {
    throw new Error(`Browser sidebar manager asset not found in ${assetsDir}`);
  }

  const patchedFiles = [];
  for (const assetPath of assetPaths) {
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchBrowserPanelIframeSupport(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  return patchedFiles;
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) {
    throw new Error(`Unable to patch ${label}`);
  }
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Expected one ${label} target, found multiple`);
  }
  return source.replace(before, after);
}

function replaceOnceIfMissing(source, before, after, marker, label) {
  if (source.includes(marker)) {
    return source;
  }
  return replaceOnce(source, before, after, label);
}

function replaceRegexOnceIfMissing(
  source,
  pattern,
  replacement,
  marker,
  label,
) {
  if (source.includes(marker)) {
    return source;
  }
  const matches = [
    ...source.matchAll(
      new RegExp(
        pattern,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
      ),
    ),
  ];
  if (matches.length === 0) {
    throw new Error(`Unable to patch ${label}`);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} target, found multiple`);
  }
  return source.replace(pattern, replacement);
}

function replaceFirstAvailable(source, replacements, marker, label) {
  if (source.includes(marker)) {
    return source;
  }

  const matches = [];
  for (const { before, after } of replacements) {
    if (source.includes(before)) {
      const first = source.indexOf(before);
      if (source.indexOf(before, first + before.length) !== -1) {
        throw new Error(`Expected one ${label} target, found multiple`);
      }
      matches.push({ after, before });
    }
  }

  if (matches.length === 0) {
    throw new Error(`Unable to patch ${label}`);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} target, found multiple`);
  }

  const [{ before, after }] = matches;
  return source.replace(before, after);
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = -1;
  while ((index = source.indexOf(needle, index + 1)) !== -1) {
    count += 1;
  }
  return count;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchBrowserPanelIframeAssets(assetsDir);
  console.log(
    `Patched browser panel iframe support in ${patchedFiles.length} file(s)`,
  );
}
