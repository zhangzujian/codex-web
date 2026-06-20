import assert from "node:assert/strict";
import test from "node:test";

import { getPathForFile } from "../src/browser/web-utils.mts";
import { handleSyncIpc } from "../src/browser/sync-ipc.mts";

test("getPathForFile returns Electron-provided absolute file paths", () => {
  assert.equal(getPathForFile({ path: "/tmp/upload.txt" }), "/tmp/upload.txt");
});

test("getPathForFile preserves whitespace in Electron-provided paths", () => {
  assert.equal(
    getPathForFile({ path: "/tmp/name-with-trailing-space " }),
    "/tmp/name-with-trailing-space ",
  );
  assert.equal(
    getPathForFile({ path: " /tmp/name-with-leading-space" }),
    " /tmp/name-with-leading-space",
  );
});

test("getPathForFile returns null for ordinary browser File-like objects", () => {
  assert.equal(
    getPathForFile({
      name: "upload.txt",
      webkitRelativePath: "folder/upload.txt",
    }),
    null,
  );
  assert.equal(getPathForFile({ path: "" }), null);
});

test("handleSyncIpc serves the synchronous preload channels used by Codex", () => {
  const env = {
    appVersion: "1.2.3",
    buildFlavor: "prod",
    getSystemThemeVariant: () => "dark",
  };

  assert.deepEqual(handleSyncIpc("codex_desktop:get-sentry-init-options", env), {
    codexAppSessionId: "42626fde-7064-471f-b44d-b1a7ad849c7f",
    buildFlavor: "prod",
    buildNumber: null,
    appVersion: "1.2.3",
    enabled: false,
  });
  assert.equal(handleSyncIpc("codex_desktop:get-build-flavor", env), "prod");
  assert.equal(
    handleSyncIpc("codex_desktop:get-uses-owl-app-shell", env),
    false,
  );
  assert.equal(
    handleSyncIpc("codex_desktop:get-system-theme-variant", env),
    "dark",
  );
  assert.equal(
    handleSyncIpc(
      "codex_desktop:get-shared-object-snapshot",
      env,
    ).host_config.kind,
    "local",
  );
});

test("handleSyncIpc rejects unsupported synchronous channels with channel context", () => {
  assert.throws(
    () =>
      handleSyncIpc("codex_desktop:missing-sync-channel", {
        appVersion: "1.2.3",
        buildFlavor: "prod",
        getSystemThemeVariant: () => "light",
      }),
    /Unsupported ipcRenderer\.sendSync channel: codex_desktop:missing-sync-channel/,
  );
});
