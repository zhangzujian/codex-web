import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findBrowserSidebarManagerAssets,
  patchBrowserPanelIframeAssets,
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

const modernBrowserSidebarManagerFixture = [
  "bEe(),PEe=`about:blank`,",
  "FEe=`data-browser-sidebar-conversation-id`,LEe=`data-browser-sidebar-webview-host-root`,",
  "constructor({browserTabId:e,conversationId:t,elementKey:n,hostKind:r,partition:i,adoptionLease:a,adoptedWebContentsId:o,initialUrl:s,pagePersistence:c}){let l=document.createElement(`div`),u=document.createElement(`div`),d=document.createElement(`webview`);this.setAdoptionAttributes(a??null,o??null,s),d.setAttribute(`src`,PEe),l.append(d,u)}",
  "webview=document.createElement(`webview`);constructor({initialUrl:o}){this.webview.setAttribute(`src`,o.length===0?ODe:o),this.container.append(this.webview,this.cursorOverlayHost)}",
  "setAdoptionAttributes(e,t,n){if(this.webview!=null){if(e==null||t==null){this.webview.removeAttribute(zEe),this.webview.removeAttribute(BEe),this.webview.removeAttribute(VEe);return}this.webview.setAttribute(zEe,e),this.webview.setAttribute(BEe,t.toString()),this.webview.setAttribute(VEe,n)}}",
  "getWebview(e,...t){if(l instanceof ES&&l.getPartition()===c)return l.setHostKind(u),l.setPagePersistence(s)&&(this.notifyWebviewHostCreated(e,n,u,s),this.emitChange()),i!=null&&(l.setAdoptionAttributes(i.adoptionLease??null,i.adoptedWebContentsId??null,r),i.adoptionLease!=null&&i.adoptedWebContentsId!=null&&lr.info(`IAB_ADOPTION renderer updated adopted webview`,{safe:{adoptedWebContentsId:i.adoptedWebContentsId,browserTabId:n,conversationId:e,hasInitialUrl:r.length>0},sensitive:{}})),l;}",
  "getRetainedWebview(e,t,n,r){if(c!=null&&c.getPartition()===s)return c.setHostKind(l),c.setPagePersistence(o)&&(this.notifyWebviewHostCreated(e,t,l,o),this.emitChange()),c;}",
  "setSnapshot(e,t,n){this.snapshots.set(a,i),this.browserUseTabKeys.has(a)&&this.syncBrowserUseTabKeys(e),i.tabType!==p.WEB}",
  "gl.dispatchMessage(`browser-sidebar-webview-host-created`,{})",
  "let mcp=document.createElement(`webview`);",
].join("");

const parseableModernBrowserSidebarManagerFixture = [
  "let bEe=()=>{},ES=class{},lr={info(){}},p={WEB:`web`},gl={dispatchMessage(){}};",
  "bEe(),PEe=`about:blank`,ODe=`about:blank`,FEe=`data-browser-sidebar-conversation-id`,LEe=`data-browser-sidebar-webview-host-root`;",
  "class VisibleHost{constructor({browserTabId:e,conversationId:t,elementKey:n,hostKind:r,partition:i,adoptionLease:a,adoptedWebContentsId:o,initialUrl:s,pagePersistence:c}){let l=document.createElement(`div`),u=document.createElement(`div`),d=document.createElement(`webview`);this.setAdoptionAttributes(a??null,o??null,s),d.setAttribute(`src`,PEe),l.append(d,u)}setAdoptionAttributes(){}}",
  "class RetainedHost{webview=document.createElement(`webview`);container={append(){}};cursorOverlayHost={};constructor({initialUrl:o}){this.webview.setAttribute(`src`,o.length===0?ODe:o),this.container.append(this.webview,this.cursorOverlayHost)}setAdoptionAttributes(e,t,n){if(this.webview!=null){if(e==null||t==null){this.webview.removeAttribute(zEe),this.webview.removeAttribute(BEe),this.webview.removeAttribute(VEe);return}this.webview.setAttribute(zEe,e),this.webview.setAttribute(BEe,t.toString()),this.webview.setAttribute(VEe,n)}}}",
  "class Manager{notifyWebviewHostCreated(){}emitChange(){}syncBrowserUseTabKeys(){}getWebview(e,...t){if(l instanceof ES&&l.getPartition()===c)return l.setHostKind(u),l.setPagePersistence(s)&&(this.notifyWebviewHostCreated(e,n,u,s),this.emitChange()),i!=null&&(l.setAdoptionAttributes(i.adoptionLease??null,i.adoptedWebContentsId??null,r),i.adoptionLease!=null&&i.adoptedWebContentsId!=null&&lr.info(`IAB_ADOPTION renderer updated adopted webview`,{safe:{adoptedWebContentsId:i.adoptedWebContentsId,browserTabId:n,conversationId:e,hasInitialUrl:r.length>0},sensitive:{}})),l;}getRetainedWebview(e,t,n,r){if(c!=null&&c.getPartition()===s)return c.setHostKind(l),c.setPagePersistence(o)&&(this.notifyWebviewHostCreated(e,t,l,o),this.emitChange()),c;}setSnapshot(e,t,n){this.snapshots.set(a,i),this.browserUseTabKeys.has(a)&&this.syncBrowserUseTabKeys(e),i.tabType!==p.WEB}}",
  "gl.dispatchMessage(`browser-sidebar-webview-host-created`,{});let mcp=document.createElement(`webview`);",
].join("");

test("findBrowserSidebarManagerAssets locates bundled browser sidebar managers", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-browser-panel-assets-"),
  );
  fs.writeFileSync(path.join(assetsDir, "unrelated.js"), "console.log('nope')");
  fs.writeFileSync(
    path.join(assetsDir, "browser-sidebar-manager-test.js"),
    browserSidebarManagerFixture,
  );
  fs.writeFileSync(
    path.join(assetsDir, "browser-sidebar-manager-alt.js"),
    browserSidebarManagerFixture,
  );

  const assetPaths = findBrowserSidebarManagerAssets(assetsDir);

  assert.equal(assetPaths.length, 2);
  for (const assetPath of assetPaths) {
    assert.match(path.basename(assetPath), /^browser-sidebar-manager-.+\.js$/);
  }
});

test("findBrowserSidebarManagerAssets locates modern bundled browser sidebar managers by content", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-browser-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "browser-use-settings.js"),
    "document.createElement(`webview`)",
  );
  fs.writeFileSync(
    path.join(assetsDir, "app-initial-modern.js"),
    modernBrowserSidebarManagerFixture,
  );

  const assetPaths = findBrowserSidebarManagerAssets(assetsDir);

  assert.deepEqual(assetPaths.map((assetPath) => path.basename(assetPath)), [
    "app-initial-modern.js",
  ]);
});

test("patchBrowserPanelIframeAssets patches every bundled browser sidebar manager", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-browser-panel-assets-"),
  );
  const first = path.join(assetsDir, "browser-sidebar-manager-first.js");
  const second = path.join(assetsDir, "browser-sidebar-manager-second.js");
  fs.writeFileSync(first, browserSidebarManagerFixture);
  fs.writeFileSync(second, browserSidebarManagerFixture);

  const patchedFiles = patchBrowserPanelIframeAssets(assetsDir);

  assert.equal(patchedFiles.length, 2);
  for (const assetPath of patchedFiles) {
    const patched = fs.readFileSync(assetPath, "utf8");
    assert.equal(patched.includes("document.createElement(`webview`)"), false);
    assert.match(
      patched,
      /data-codex-web-browser-panel-frame/,
      "patched iframe should be discoverable in browser tests",
    );
  }
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

test("patchBrowserPanelIframeSupport patches modern browser sidebar hosts only", () => {
  const patched = patchBrowserPanelIframeSupport(
    modernBrowserSidebarManagerFixture,
  );

  assert.equal(
    (patched.match(/=codexWebCreateBrowserPanelFrame\(\)/g) ?? []).length,
    2,
  );
  assert.equal(
    (patched.match(/document\.createElement\(`webview`\)/g) ?? []).length,
    1,
    "unrelated MCP webview host should be preserved",
  );
  assert.match(patched, /data-codex-web-browser-panel-frame/);
  assert.match(
    patched,
    /l\.setAdoptionAttributes\(i\?\.adoptionLease\?\?null,i\?\.adoptedWebContentsId\?\?null,r\)/,
  );
  assert.match(
    patched,
    /codexWebSetBrowserPanelFrameSrc\(c\.webview,n\.length===0\?ODe:n\)/,
  );
  assert.match(
    patched,
    /this\.snapshots\.set\(a,i\),codexWebSyncBrowserPanelSnapshotUrl\(this\.webviews\.get\(a\),i\)/,
  );
  assert.equal(patchBrowserPanelIframeSupport(patched), patched);
});

test("patchBrowserPanelIframeSupport keeps modern browser sidebar bundles parseable", () => {
  const patched = patchBrowserPanelIframeSupport(
    parseableModernBrowserSidebarManagerFixture,
  );

  assert.doesNotThrow(() => new Function(patched));
});
