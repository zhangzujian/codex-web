import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { adaptDesktopApp } from "../scripts/adapt_desktop_app.mjs";
import { runPreloadHookSmoke } from "../scripts/smoke_preload_hook.mjs";

function makeAsarFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-adapt-"));
  const asarDir = path.join(dir, "asar");
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
      '    <script type="module" src="./assets/preload.js"></script>',
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
  fs.writeFileSync(
    path.join(asarDir, "webview", "assets", "preload.js"),
    "window.codexWindowType='electron';window.electronBridge={openPath(){}};",
  );
  return { asarDir, dir };
}

test("runPreloadHookSmoke accepts a clean preflight gate", async () => {
  const { asarDir, dir } = makeAsarFixture();
  const reportPath = path.join(dir, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      staticProfile: { electronBridgeMethods: ["openPath"] },
      staticReview: { ok: true },
      support: { ok: true },
    }),
  );

  try {
    const result = await runPreloadHookSmoke({
      asarDir,
      preflightOnly: true,
      reportPath,
    });

    assert.equal(result.mode, "preflight");
    assert.deepEqual(result.bridgeMethods, ["openPath"]);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("runPreloadHookSmoke rejects unresolved static review", async () => {
  const { asarDir, dir } = makeAsarFixture();
  const reportPath = path.join(dir, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      staticProfile: { electronBridgeMethods: [] },
      staticReview: { ok: false, unresolvedBridgeReturns: [{}] },
      support: { ok: true },
    }),
  );

  try {
    await assert.rejects(
      runPreloadHookSmoke({ asarDir, preflightOnly: true, reportPath }),
      /staticReview\.ok is false/,
    );
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("adaptDesktopApp generates report, enforces gate, and runs preflight smoke", async () => {
  const { asarDir, dir } = makeAsarFixture();
  const patchPath = path.join(dir, "webview-preload.patch");
  const reportPath = path.join(dir, "preload-hook-report.json");

  try {
    const report = await adaptDesktopApp({
      asarDir,
      buildBrowser: false,
      patchPath,
      prepare: false,
      reportPath,
      runTests: false,
      smoke: "preflight",
    });

    assert.equal(report.support.ok, true);
    assert.equal(report.staticReview.ok, true);
    assert.match(fs.readFileSync(patchPath, "utf8"), /assets\/preload\.js/);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("adaptDesktopApp rejects simulated upstream renderer bridge drift", async () => {
  const { asarDir, dir } = makeAsarFixture();
  const patchPath = path.join(dir, "webview-preload.patch");
  const reportPath = path.join(dir, "preload-hook-report.json");
  fs.writeFileSync(
    path.join(asarDir, ".vite", "build", "preload.js"),
    'let e=require("electron");var D={openPath:()=>null};e.contextBridge.exposeInMainWorld("electronBridge",D);',
  );
  fs.writeFileSync(
    path.join(asarDir, "webview", "assets", "main.js"),
    "window.electronBridge.openSecretPanel();",
  );

  try {
    await assert.rejects(
      adaptDesktopApp({
        asarDir,
        buildBrowser: false,
        patchPath,
        prepare: false,
        reportPath,
        runTests: false,
        smoke: "preflight",
      }),
      /unsupportedBridgeMethodCalls: 1/,
    );
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
