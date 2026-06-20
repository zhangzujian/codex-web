import assert from "node:assert/strict";
import test from "node:test";

import { getPathForFile } from "../src/browser/web-utils.mts";
import { handleSyncIpc } from "../src/browser/sync-ipc.mts";
import { createStatsigOverrideAdapter } from "../src/browser/statsig-overrides.mts";

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

  assert.deepEqual(
    handleSyncIpc("codex_desktop:get-sentry-init-options", env),
    {
      codexAppSessionId: "42626fde-7064-471f-b44d-b1a7ad849c7f",
      buildFlavor: "prod",
      buildNumber: null,
      appVersion: "1.2.3",
      enabled: false,
    },
  );
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
    handleSyncIpc("codex_desktop:get-shared-object-snapshot", env).host_config
      .kind,
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

test("Statsig overrides enable localized application text", () => {
  const adapter = createStatsigOverrideAdapter();
  const originalConfig = {
    name: "72216192",
    value: {},
    get(key, fallback) {
      return this.value[key] ?? fallback ?? null;
    },
  };

  const overriddenConfig = adapter.getDynamicConfigOverride(originalConfig);

  assert.equal(overriddenConfig.get("enable_i18n", false), true);
  assert.equal(overriddenConfig.get("locale_source", "SYSTEM"), "IDE");
  assert.equal(adapter.getDynamicConfigOverride({ name: "other" }), null);

  const originalLayer = {
    name: "72216192",
    __value: {},
    get(key, fallback) {
      return this.__value[key] ?? fallback ?? null;
    },
  };

  const overriddenLayer = adapter.getLayerOverride(originalLayer);

  assert.equal(overriddenLayer.get("enable_i18n", false), true);
  assert.equal(overriddenLayer.get("locale_source", "SYSTEM"), "IDE");
  assert.equal(adapter.getLayerOverride({ name: "other" }), null);
});

test("Statsig overrides keep the Automations navigation enabled", () => {
  const adapter = createStatsigOverrideAdapter();

  assert.deepEqual(
    adapter.getGateOverride({ name: "3075919032", value: false }),
    { name: "3075919032", value: true },
  );
});
