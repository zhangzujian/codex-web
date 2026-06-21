import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findBrowserSidebarManagerAsset,
  patchBrowserPanelIframeSupport,
} from "../scripts/patch_browser_panel_iframe.mjs";

const browserSidebarManagerFixture = [
  "var me=`about:blank`,",
  "let first=document.createElement(`webview`);",
  "let second=document.createElement(`webview`);",
  "u.setAttribute(`src`,me);let d=()=>{this.finishPendingDetach()};",
  "this.webview.setAttribute(`src`,o.length===0?Ee:o),this.container.append(this.webview,this.cursorOverlayHost)",
  "this.webview.removeAttribute(k),this.webview.removeAttribute(A),this.webview.removeAttribute(j);return}this.webview.setAttribute(k,e),this.webview.setAttribute(A,t.toString()),this.webview.setAttribute(j,n)}}",
  "this.snapshots.set(o,a),this.browserUseTabKeys.has(o)&&this.syncBrowserUseTabKeys(e),a.tabType!==n.WEB",
  "if(s instanceof P)return s.setHostKind(c),a!=null&&(s.setAdoptionAttributes(a.adoptionLease??null,a.adoptedWebContentsId??null,i)),s;",
  "if(o!=null)return o.setHostKind(s),o;let c=new G({browserTabId:n",
].join("");

test("findBrowserSidebarManagerAsset locates the bundled browser sidebar manager", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-browser-panel-assets-"),
  );
  fs.writeFileSync(path.join(assetsDir, "unrelated.js"), "console.log('nope')");
  fs.writeFileSync(
    path.join(assetsDir, "browser-sidebar-manager-test.js"),
    browserSidebarManagerFixture,
  );

  const assetPath = findBrowserSidebarManagerAsset(assetsDir);

  assert.match(path.basename(assetPath), /^browser-sidebar-manager-.+\.js$/);
});

test("patchBrowserPanelIframeSupport replaces Electron webview hosts with iframe-compatible hosts", () => {
  const patched = patchBrowserPanelIframeSupport(browserSidebarManagerFixture);

  assert.equal(patched.includes("document.createElement(`webview`)"), false);
  assert.equal(
    (patched.match(/document\.createElement\(`iframe`\)/g) ?? []).length,
    1,
  );
  assert.equal(
    (patched.match(/=codexWebCreateBrowserPanelFrame\(\)/g) ?? []).length,
    2,
  );
  assert.match(
    patched,
    /data-codex-web-browser-panel-frame/,
    "patched iframe should be discoverable in browser tests",
  );
  assert.doesNotMatch(
    patched,
    /sandbox[^`]*allow-same-origin[^`]*allow-scripts|sandbox[^`]*allow-scripts[^`]*allow-same-origin/,
  );
  assert.match(
    patched,
    /addEventListener\(`load`,.*did-stop-loading/s,
    "iframe load should satisfy webview did-stop-loading listeners",
  );
  assert.match(
    patched,
    /isLoading=\(\)=>!1/,
    "iframe host should expose the Electron webview isLoading method used by the manager",
  );
  assert.match(
    patched,
    /codexWebSetBrowserPanelFrameSrc\(u,s\.length===0\?me:s\)/,
    "visible browser panel hosts should load their requested initial URL",
  );
  assert.match(
    patched,
    /codexWebSetBrowserPanelFrameSrc\(this\.webview,n\.length===0\?me:n\)/,
    "updated adoption attributes should navigate iframe hosts to the new URL",
  );
  assert.match(
    patched,
    /codexWebSyncBrowserPanelSnapshotUrl/,
    "browser-sidebar-state snapshot updates should navigate existing iframe hosts",
  );
  assert.match(
    patched,
    /this\.snapshots\.set\(o,a\),codexWebSyncBrowserPanelSnapshotUrl\(this\.webviews\.get\(o\),a\)/,
    "snapshot updates should synchronize the iframe URL before notifying listeners",
  );
  assert.match(
    patched,
    /s\.setAdoptionAttributes\(a\?\.adoptionLease\?\?null,a\?\.adoptedWebContentsId\?\?null,i\)/,
    "existing visible iframe hosts should navigate when their tab URL changes",
  );
  assert.match(
    patched,
    /codexWebSetBrowserPanelFrameSrc\(o\.webview,r\.length===0\?Ee:r\)/,
    "existing retained iframe hosts should navigate when their tab URL changes",
  );
});
