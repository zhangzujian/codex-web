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

export function findBrowserSidebarManagerAssets(assetsDir) {
  return fs
    .readdirSync(assetsDir)
    .filter(
      (name) =>
        name.startsWith("browser-sidebar-manager-") && name.endsWith(".js"),
    )
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("browser-sidebar-manager") ||
        source.includes(WEBVIEW_CREATE)
      );
    });
}

export function patchBrowserPanelIframeSupport(source) {
  const alreadyPatched = source.includes(PATCH_MARKER);
  let patched = source.replaceAll(IFRAME_SANDBOX_SETTER, "");

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
  if (!source.includes(before)) {
    throw new Error(`Unable to patch ${label}`);
  }
  return source.replace(before, after);
}

function replaceOnceIfMissing(source, before, after, marker, label) {
  if (source.includes(marker)) {
    return source;
  }
  return replaceOnce(source, before, after, label);
}

function replaceFirstAvailable(source, replacements, marker, label) {
  if (source.includes(marker)) {
    return source;
  }

  for (const { before, after } of replacements) {
    if (source.includes(before)) {
      return source.replace(before, after);
    }
  }

  throw new Error(`Unable to patch ${label}`);
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
