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
});
