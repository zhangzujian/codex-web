import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractRendererAssetStaticProfile,
  extractPreloadRequirements,
  extractPreloadStaticProfile,
  generatePreloadHookPatch,
  injectPreloadHookIntoIndexHtml,
  preloadSyncChannels,
  stripPreloadHookFromIndexHtml,
  validatePreloadHookSupport,
} from "../scripts/adapt_preload_hook.mjs";

test("injectPreloadHookIntoIndexHtml adds base and preload after upstream markers", () => {
  const html = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "  <head>",
    "    <!-- PROD_BASE_TAG_HERE -->",
    "    <!-- PROD_CSP_TAG_HERE -->",
    "    <title>Codex</title>",
    "  </head>",
    "</html>",
    "",
  ].join("\n");

  assert.equal(
    injectPreloadHookIntoIndexHtml(html),
    [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "  <head>",
      "    <!-- PROD_BASE_TAG_HERE -->",
      '    <base href="/" />',
      "    <!-- PROD_CSP_TAG_HERE -->",
      '    <script type="module" src="./assets/preload.js"></script>',
      "    <title>Codex</title>",
      "  </head>",
      "</html>",
      "",
    ].join("\n"),
  );
});

test("injectPreloadHookIntoIndexHtml preserves upstream indentation", () => {
  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "\t<head>",
    "\t\t<!-- PROD_BASE_TAG_HERE -->",
    "\t\t<!-- PROD_CSP_TAG_HERE -->",
    "\t</head>",
    "</html>",
    "",
  ].join("\n");

  assert.equal(
    injectPreloadHookIntoIndexHtml(html),
    [
      "<!DOCTYPE html>",
      "<html>",
      "\t<head>",
      "\t\t<!-- PROD_BASE_TAG_HERE -->",
      '\t\t<base href="/" />',
      "\t\t<!-- PROD_CSP_TAG_HERE -->",
      '\t\t<script type="module" src="./assets/preload.js"></script>',
      "\t</head>",
      "</html>",
      "",
    ].join("\n"),
  );
});

test("generatePreloadHookPatch writes a patch from upstream artifacts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-hook-"));
  const asarDir = path.join(dir, "asar");
  const patchPath = path.join(dir, "webview-preload.patch");
  const reportPath = path.join(dir, "preload-hook-report.json");

  try {
    fs.mkdirSync(path.join(asarDir, "webview"), { recursive: true });
    fs.mkdirSync(path.join(asarDir, "webview", "assets"), { recursive: true });
    fs.mkdirSync(path.join(asarDir, ".vite", "build"), { recursive: true });
    fs.writeFileSync(
      path.join(asarDir, "webview", "index.html"),
      [
        "<!DOCTYPE html>",
        "<html>",
        "  <head>",
        "    <!-- PROD_BASE_TAG_HERE -->",
        "    <!-- PROD_CSP_TAG_HERE -->",
        "  </head>",
        "</html>",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(asarDir, ".vite", "build", "preload.js"),
      'require("electron");',
    );
    fs.writeFileSync(path.join(asarDir, "webview", "assets", "main.js"), "");

    const result = generatePreloadHookPatch({ asarDir, patchPath, reportPath });

    assert.equal(result.patchPath, patchPath);
    assert.equal(result.reportPath, reportPath);
    assert.ok(
      result.analysisMethod.some((item) =>
        item.includes("renderer assets with preload-exposed bridge methods"),
      ),
    );
    assert.deepEqual(result.syncChannels, []);
    const patch = fs.readFileSync(patchPath, "utf8");
    assert.match(patch, /^--- a\/webview\/index\.html/m);
    assert.match(patch, /^\+\s+<base href="\/" \/>/m);
    assert.match(
      patch,
      /^\+\s+<script type="module" src="\.\/assets\/preload\.js"><\/script>/m,
    );
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.patchPath, patchPath);
    assert.equal(report.support.ok, true);
    assert.deepEqual(report.requirements.syncChannels, []);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("generatePreloadHookPatch fails when renderer assets are missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-hook-"));
  const asarDir = path.join(dir, "asar");
  const patchPath = path.join(dir, "webview-preload.patch");

  try {
    fs.mkdirSync(path.join(asarDir, "webview"), { recursive: true });
    fs.mkdirSync(path.join(asarDir, ".vite", "build"), { recursive: true });
    fs.writeFileSync(
      path.join(asarDir, "webview", "index.html"),
      [
        "<!DOCTYPE html>",
        "<html>",
        "  <head>",
        "    <!-- PROD_BASE_TAG_HERE -->",
        "    <!-- PROD_CSP_TAG_HERE -->",
        "  </head>",
        "</html>",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(asarDir, ".vite", "build", "preload.js"),
      'require("electron");',
    );

    assert.throws(
      () => generatePreloadHookPatch({ asarDir, patchPath }),
      /Missing upstream renderer assets/,
    );
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("stripPreloadHookFromIndexHtml removes generated hook lines", () => {
  const html = [
    "  <head>",
    '    <base href="/" />',
    '    <script type="module" src="./assets/preload.js"></script>',
    "    <title>Codex</title>",
    "  </head>",
    "",
  ].join("\n");

  assert.equal(
    stripPreloadHookFromIndexHtml(html),
    ["  <head>", "    <title>Codex</title>", "  </head>", ""].join("\n"),
  );
});

test("preloadSyncChannels resolves minified channel constants", () => {
  assert.deepEqual(
    preloadSyncChannels(
      "var i=`codex_desktop:get-sentry-init-options`,a=`codex_desktop:get-build-flavor`;e.ipcRenderer.sendSync(i);e.ipcRenderer.sendSync(a);e.ipcRenderer.sendSync(`codex_desktop:get-shared-object-snapshot`);",
    ),
    [
      "codex_desktop:get-build-flavor",
      "codex_desktop:get-sentry-init-options",
      "codex_desktop:get-shared-object-snapshot",
    ],
  );
});

test("extractPreloadRequirements derives hooks from upstream preload source", () => {
  const requirements = extractPreloadRequirements(
    "let e=require(`electron`);var i=`codex_desktop:get-sentry-init-options`,n=`codex_desktop:show-context-menu`,g=`codex_desktop:message-for-view`,d=`codex_desktop:connect-app-host`;function f(e){return`codex_desktop:worker:${e}:from-view`}e.ipcRenderer.sendSync(i);e.ipcRenderer.invoke(n,{});e.ipcRenderer.on(g,()=>{});e.ipcRenderer.postMessage(d,void 0,[]);e.contextBridge.exposeInMainWorld(`electronBridge`,{});e.webUtils.getPathForFile(file);process.platform;process.arch;",
  );

  assert.deepEqual(requirements, {
    dynamicChannelTemplates: ["codex_desktop:worker:${}:from-view"],
    electronApis: {
      contextBridge: ["exposeInMainWorld"],
      ipcRenderer: ["invoke", "on", "postMessage", "sendSync"],
      webUtils: ["getPathForFile"],
    },
    exposedMainWorldKeys: ["electronBridge"],
    invokeChannels: ["codex_desktop:show-context-menu"],
    listenerChannels: ["codex_desktop:message-for-view"],
    postMessageChannels: ["codex_desktop:connect-app-host"],
    processDefines: ["process.arch", "process.platform"],
    syncChannels: ["codex_desktop:get-sentry-init-options"],
  });
});

test("extractPreloadStaticProfile summarizes bridge methods and channel calls", () => {
  const profile = extractPreloadStaticProfile(
    "let e=require(`electron`);var i=`codex_desktop:get-sentry-init-options`,n=`codex_desktop:show-context-menu`,g=`codex_desktop:message-for-view`,d=`codex_desktop:connect-app-host`;var D={windowType:m,sendMessageFromView:async t=>{await e.ipcRenderer.invoke(h,t)},getPathForFile:t=>e.webUtils.getPathForFile(t)||null,showContextMenu:async t=>e.ipcRenderer.invoke(n,t),usesOwlAppShell:()=>y};e.ipcRenderer.sendSync(i);e.ipcRenderer.invoke(n,{menuId:`x`});e.ipcRenderer.on(g,(e,t)=>{window.dispatchEvent(new MessageEvent(`message`,{data:t}))});e.ipcRenderer.postMessage(d,void 0,[port]);e.contextBridge.exposeInMainWorld(`electronBridge`,D);",
  );

  assert.deepEqual(profile.electronBridgeMethods, [
    "getPathForFile",
    "sendMessageFromView",
    "showContextMenu",
    "usesOwlAppShell",
    "windowType",
  ]);
  assert.deepEqual(profile.channelCalls, [
    {
      channel: "codex_desktop:connect-app-host",
      kind: "postMessage",
      rawArgs: "d,void 0,[port]",
    },
    {
      channel: "codex_desktop:get-sentry-init-options",
      kind: "sendSync",
      rawArgs: "i",
    },
    {
      channel: "codex_desktop:message-for-view",
      kind: "on",
      rawArgs:
        "g,(e,t)=>{window.dispatchEvent(new MessageEvent(`message`,{data:t}))}",
    },
    {
      channel: "codex_desktop:show-context-menu",
      kind: "invoke",
      rawArgs: "n,t",
    },
    {
      channel: "codex_desktop:show-context-menu",
      kind: "invoke",
      rawArgs: "n,{menuId:`x`}",
    },
  ]);
  assert.deepEqual(profile.mainWorldExposures, [
    { key: "electronBridge", valueExpression: "D" },
  ]);
});

test("extractRendererAssetStaticProfile summarizes renderer-side bridge evidence", () => {
  const profile = extractRendererAssetStaticProfile(
    {
      "main.js":
        "let bridge=window.electronBridge,{sendMessageFromView:send,getSharedObjectSnapshotValue}=window.electronBridge,menu=window.electronBridge.showContextMenu;send({type:`fetch`,requestId:i,url:`vscode://codex/read-config-for-host`,body:JSON.stringify({hostId:e})});window.electronBridge?.getSharedObjectSnapshotValue?.(`host_config`);getSharedObjectSnapshotValue(`remote_connections`);menu({id:`copy`});bridge?.showApplicationMenu?.(`main`,1,2);bridge={add(){}};bridge.add(1);window.addEventListener(`message`,e=>{if(e.data.type===`shared-object-updated`)console.log(e.data.key)});",
      "worker.js":
        "electronBridge.sendWorkerMessageFromView(`git`,{type:`worker-request`,request:{method:`availability`}});",
    },
    {
      allowedBridgeMethods: [
        "getSharedObjectSnapshotValue",
        "sendMessageFromView",
        "sendWorkerMessageFromView",
        "showApplicationMenu",
        "showContextMenu",
      ],
    },
  );

  assert.deepEqual(profile, {
    bridgeMethodArgumentShapes: [
      {
        argCount: 1,
        args: [
          {
            kind: "string",
            value: "host_config",
          },
        ],
        method: "getSharedObjectSnapshotValue",
      },
      {
        argCount: 1,
        args: [
          {
            kind: "string",
            value: "remote_connections",
          },
        ],
        method: "getSharedObjectSnapshotValue",
      },
      {
        argCount: 1,
        args: [
          {
            keys: ["body", "requestId", "type", "url"],
            kind: "object",
          },
        ],
        method: "sendMessageFromView",
      },
      {
        argCount: 3,
        args: [
          {
            kind: "string",
            value: "main",
          },
          {
            kind: "number",
            value: "1",
          },
          {
            kind: "number",
            value: "2",
          },
        ],
        method: "showApplicationMenu",
      },
      {
        argCount: 1,
        args: [
          {
            keys: ["id"],
            kind: "object",
          },
        ],
        method: "showContextMenu",
      },
      {
        argCount: 2,
        args: [
          {
            kind: "string",
            value: "git",
          },
          {
            keys: ["request", "type"],
            kind: "object",
          },
        ],
        method: "sendWorkerMessageFromView",
      },
    ],
    bridgeMethodCalls: [
      {
        asset: "main.js",
        method: "getSharedObjectSnapshotValue",
        rawArgs: "`host_config`",
      },
      {
        asset: "main.js",
        method: "getSharedObjectSnapshotValue",
        rawArgs: "`remote_connections`",
      },
      {
        asset: "main.js",
        method: "sendMessageFromView",
        rawArgs:
          "{type:`fetch`,requestId:i,url:`vscode://codex/read-config-for-host`,body:JSON.stringify({hostId:e})}",
      },
      {
        asset: "main.js",
        method: "showApplicationMenu",
        rawArgs: "`main`,1,2",
      },
      {
        asset: "main.js",
        method: "showContextMenu",
        rawArgs: "{id:`copy`}",
      },
      {
        asset: "worker.js",
        method: "sendWorkerMessageFromView",
        rawArgs:
          "`git`,{type:`worker-request`,request:{method:`availability`}}",
      },
    ],
    messageEventTypes: ["shared-object-updated"],
    sharedObjectKeys: ["host_config", "remote_connections"],
    vscodeUrls: ["vscode://codex/read-config-for-host"],
    workerIds: ["git"],
  });
});

test("extractRendererAssetStaticProfile stops following reassigned bridge aliases", () => {
  const profile = extractRendererAssetStaticProfile(
    {
      "main.js":
        "let bridge=window.electronBridge;bridge.showContextMenu({id:`copy`});bridge={showContextMenu(){}};bridge.showContextMenu({id:`local`});",
    },
    { allowedBridgeMethods: ["showContextMenu"] },
  );

  assert.deepEqual(profile.bridgeMethodCalls, [
    {
      asset: "main.js",
      method: "showContextMenu",
      rawArgs: "{id:`copy`}",
    },
  ]);
});

test("validatePreloadHookSupport reports unsupported upstream requirements", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-support-"));

  try {
    fs.mkdirSync(path.join(dir, "src", "browser"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src", "browser", "sync-ipc.mts"),
      'if (channel === "codex_desktop:get-build-flavor") return "prod";',
    );
    fs.writeFileSync(
      path.join(dir, "src", "browser", "shim.ts"),
      "export const ipcRenderer={sendSync(){}};export const contextBridge={};export const webUtils={};",
    );
    fs.writeFileSync(
      path.join(dir, "vite.browser.config.ts"),
      '"process.platform": JSON.stringify(process.platform),',
    );

    assert.deepEqual(
      validatePreloadHookSupport({
        projectRoot: dir,
        requirements: {
          dynamicChannelTemplates: [],
          electronApis: {
            contextBridge: ["exposeInMainWorld"],
            ipcRenderer: ["invoke", "sendSync"],
            webUtils: ["getPathForFile"],
          },
          exposedMainWorldKeys: [],
          invokeChannels: [],
          listenerChannels: [],
          postMessageChannels: [],
          processDefines: ["process.arch", "process.platform"],
          syncChannels: ["codex_desktop:get-build-flavor", "codex_desktop:new"],
        },
      }),
      {
        missingElectronApis: [
          "contextBridge.exposeInMainWorld",
          "ipcRenderer.invoke",
          "webUtils.getPathForFile",
        ],
        missingProcessDefines: ["process.arch"],
        missingSyncChannels: ["codex_desktop:new"],
        ok: false,
      },
    );
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("validatePreloadHookSupport ignores unrelated helper methods", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-support-"));

  try {
    fs.mkdirSync(path.join(dir, "src", "browser"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src", "browser", "sync-ipc.mts"),
      'if (channel === "codex_desktop:get-build-flavor") return "prod";',
    );
    fs.writeFileSync(
      path.join(dir, "src", "browser", "shim.ts"),
      [
        "function invoke() {}",
        "function exposeInMainWorld() {}",
        "function getPathForFile() {}",
        "export const ipcRenderer={sendSync(){}};",
        "export const contextBridge={};",
        "export const webUtils={};",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(dir, "vite.browser.config.ts"),
      '"process.platform": JSON.stringify(process.platform),',
    );

    assert.deepEqual(
      validatePreloadHookSupport({
        projectRoot: dir,
        requirements: {
          dynamicChannelTemplates: [],
          electronApis: {
            contextBridge: ["exposeInMainWorld"],
            ipcRenderer: ["invoke", "sendSync"],
            webUtils: ["getPathForFile"],
          },
          exposedMainWorldKeys: [],
          invokeChannels: [],
          listenerChannels: [],
          postMessageChannels: [],
          processDefines: ["process.platform"],
          syncChannels: ["codex_desktop:get-build-flavor"],
        },
      }),
      {
        missingElectronApis: [
          "contextBridge.exposeInMainWorld",
          "ipcRenderer.invoke",
          "webUtils.getPathForFile",
        ],
        missingProcessDefines: [],
        missingSyncChannels: [],
        ok: false,
      },
    );
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
