import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findSentryDisableTargets,
  patchSentryDisableAssets,
  patchSentryDisableSource,
} from "../scripts/patch_sentry_disable.mjs";

test("patchSentryDisableSource disables formatted shell Sentry init", () => {
  const source = [
    "function init(e) {",
    "  (vO({",
    "    dsn: wW,",
    "    environment: e.buildFlavor,",
    "    release: TW(n.version),",
    "    dist: e.buildNumber ?? void 0,",
    "  }));",
    "}",
  ].join("\n");

  const patched = patchSentryDisableSource(source);

  assert.match(patched, /vO\(\{\s*enabled: !1,\s*dsn: wW,/);
  assert.equal(patchSentryDisableSource(patched), patched);
});

test("patchSentryDisableSource disables minified Sentry init with beforeSend first", () => {
  const source =
    "Df({beforeSend:ne,dsn:l,environment:kf,release:d(n.version),dist:e.buildNumber??void 0,tracesSampleRate:0})";

  const patched = patchSentryDisableSource(source);

  assert.match(patched, /Df\(\{enabled: !1,beforeSend:ne,dsn:l,/);
  assert.equal(patchSentryDisableSource(patched), patched);
});

test("patchSentryDisableAssets patches shell and webview Sentry bundles", () => {
  const asarRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-sentry-assets-"),
  );
  const buildDir = path.join(asarRoot, ".vite/build");
  const webviewAssetsDir = path.join(asarRoot, "webview/assets");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(webviewAssetsDir, { recursive: true });

  fs.writeFileSync(
    path.join(buildDir, "worker.js"),
    "vO({dsn:wW,environment:e.buildFlavor,release:TW(n.version),dist:e.buildNumber??void 0})",
  );
  fs.writeFileSync(
    path.join(buildDir, "workspace-root-drop-handler-test.js"),
    "Fz({dsn:t.Ti,environment:tB.buildFlavor,release:i,dist:tB.buildNumber??void 0,beforeSend:Jz({app:r.app})})",
  );
  fs.writeFileSync(
    path.join(webviewAssetsDir, "error-boundary-test.js"),
    "Df({beforeSend:ne,dsn:l,environment:kf,release:d(n.version),dist:e.buildNumber??void 0,tracesSampleRate:0})",
  );

  const targets = findSentryDisableTargets(asarRoot);
  assert.equal(targets.length, 3);

  const patchedFiles = patchSentryDisableAssets(asarRoot);
  assert.equal(patchedFiles.length, 3);
  for (const filePath of patchedFiles) {
    assert.match(fs.readFileSync(filePath, "utf8"), /enabled: !1,/);
  }
  assert.deepEqual(patchSentryDisableAssets(asarRoot), []);
});

test("patchSentryDisableAssets rejects duplicate drop handler targets", () => {
  const asarRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-sentry-duplicate-"),
  );
  const buildDir = path.join(asarRoot, ".vite/build");
  fs.mkdirSync(buildDir, { recursive: true });

  fs.writeFileSync(
    path.join(buildDir, "workspace-root-drop-handler-a.js"),
    "Fz({dsn:t.Ti,environment:tB.buildFlavor,release:i,dist:tB.buildNumber??void 0,beforeSend:Jz({app:r.app})})",
  );
  fs.writeFileSync(
    path.join(buildDir, "workspace-root-drop-handler-b.js"),
    "Fz({dsn:t.Ti,environment:tB.buildFlavor,release:i,dist:tB.buildNumber??void 0,beforeSend:Jz({app:r.app})})",
  );

  assert.throws(
    () => findSentryDisableTargets(asarRoot),
    /Expected one Sentry workspace-root-drop-handler asset/,
  );
});

test("patchSentryDisableAssets rejects duplicate webview error boundary targets", () => {
  const asarRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-sentry-duplicate-"),
  );
  const webviewAssetsDir = path.join(asarRoot, "webview/assets");
  fs.mkdirSync(webviewAssetsDir, { recursive: true });

  fs.writeFileSync(
    path.join(webviewAssetsDir, "error-boundary-a.js"),
    "Df({beforeSend:ne,dsn:l,environment:kf,release:d(n.version),dist:e.buildNumber??void 0,tracesSampleRate:0})",
  );
  fs.writeFileSync(
    path.join(webviewAssetsDir, "error-boundary-b.js"),
    "Df({beforeSend:ne,dsn:l,environment:kf,release:d(n.version),dist:e.buildNumber??void 0,tracesSampleRate:0})",
  );

  assert.throws(
    () => findSentryDisableTargets(asarRoot),
    /Expected one Sentry error-boundary asset/,
  );
});
