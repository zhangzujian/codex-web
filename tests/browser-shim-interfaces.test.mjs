import assert from "node:assert/strict";
import test from "node:test";

import { getPathForFile } from "../src/browser/web-utils.mts";
import {
  createSyntheticUploadedFile,
  dataTransferHasDirectory,
  filesNeedingBrowserDropUpload,
  hasUploadedFileForEachCandidate,
  installBrowserFileDropUploadBridge,
  showBrowserDropUploadError,
  uploadBrowserDropFiles,
} from "../src/browser/drop-upload.mts";
import {
  handleSyncIpc,
  hostConfigForRoute,
  localBrowserFetchResponse,
  isReadConfigForHostFetchMessage,
  normalizeReadConfigForHostFetchResponse,
  normalizeSharedObjectUpdateForRoute,
} from "../src/browser/sync-ipc.mts";
import { createStatsigOverrideAdapter } from "../src/browser/statsig-overrides.mts";
import { exposedMainWorldValue } from "../src/browser/context-bridge.mts";

test("browser shim installs the Sentry IPC fetch no-op", async () => {
  const shimSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/browser/shim.ts", import.meta.url), "utf8"),
  );

  assert.match(shimSource, /installSentryIpcFetchNoop\(window\)/);
});

test("browser shim hides the unused application menu bridge", () => {
  const showApplicationMenu = () => {};
  const electronBridge = exposedMainWorldValue("electronBridge", {
    openPath: () => {},
    showApplicationMenu,
  });
  const otherBridge = { showApplicationMenu };

  assert.deepEqual(Object.keys(electronBridge).sort(), ["openPath"]);
  assert.equal(exposedMainWorldValue("otherBridge", otherBridge), otherBridge);
});

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

test("browser drop upload only targets non-image files without a local path", () => {
  const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
  const image = new File(["png"], "photo.png", { type: "image/png" });
  const empty = new File([], "empty.txt", { type: "text/plain" });
  const local = new File(["local"], "local.txt", { type: "text/plain" });
  Object.defineProperty(local, "path", { value: "/tmp/local.txt" });

  assert.deepEqual(
    filesNeedingBrowserDropUpload([txt, image, empty, local], getPathForFile),
    [txt, empty],
  );
});

test("browser drop upload reports upload failures", async () => {
  const errors = [];
  const uploadedFiles = await uploadBrowserDropFiles(
    [new File(["hello"], "notes.txt", { type: "text/plain" })],
    async () => {
      throw new Error("upload failed");
    },
    (error) => {
      errors.push(error);
    },
  );

  assert.deepEqual(uploadedFiles, []);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /upload failed/);
});

test("browser drop upload returns no files for malformed upload responses", async () => {
  const uploadedFiles = await uploadBrowserDropFiles(
    [new File(["hello"], "notes.txt", { type: "text/plain" })],
    async () => [{ label: "notes.txt" }],
  );

  assert.deepEqual(uploadedFiles, []);
});

test("browser drop upload requires one uploaded file per upload candidate", () => {
  assert.equal(
    hasUploadedFileForEachCandidate(
      [new File(["a"], "a.txt"), new File(["b"], "b.txt")],
      [new File([], "a.txt")],
    ),
    false,
  );
});

test("browser drop upload error creates an accessible alert", () => {
  const appended = [];
  const doc = {
    body: {
      append(element) {
        appended.push(element);
      },
    },
    createElement() {
      return {
        attributes: {},
        style: {},
        remove() {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
    getElementById() {
      return null;
    },
  };

  showBrowserDropUploadError(doc);

  assert.equal(appended.length, 1);
  assert.equal(appended[0].attributes.role, "alert");
  assert.equal(appended[0].textContent, "Unable to attach file");
});

test("browser drop upload error timer does not keep node alive", () => {
  let unrefCalled = false;
  const doc = {
    body: {
      append() {},
    },
    createElement() {
      return {
        style: {},
        remove() {},
        setAttribute() {},
      };
    },
    getElementById() {
      return null;
    },
  };

  showBrowserDropUploadError(doc, () => ({
    unref() {
      unrefCalled = true;
    },
  }));

  assert.equal(unrefCalled, true);
});

test("browser drop upload lets directory drops fall through", () => {
  assert.equal(
    dataTransferHasDirectory({
      items: [
        {
          webkitGetAsEntry: () => ({ isDirectory: true }),
        },
      ],
    }),
    true,
  );
});

test("uploaded browser drop files expose Electron-style paths", () => {
  const file = createSyntheticUploadedFile({
    label: "notes.txt",
    fsPath: "/tmp/codex-web-uploads/abc",
  });

  assert.equal(file?.name, "notes.txt");
  assert.ok((file?.size ?? 0) > 0);
  assert.equal(getPathForFile(file), "/tmp/codex-web-uploads/abc");
});

test("browser drop upload failure shows one alert", async () => {
  const previousDocument = globalThis.document;
  const previousConsoleError = console.error;
  const listeners = [];
  const appended = [];
  globalThis.document = {
    body: {
      append(element) {
        appended.push(element);
      },
    },
    addEventListener(type, listener) {
      if (type === "drop") {
        listeners.push(listener);
      }
    },
    createElement() {
      return {
        style: {},
        remove() {},
        setAttribute() {},
      };
    },
    getElementById() {
      return null;
    },
    removeEventListener() {},
  };
  console.error = () => {};

  try {
    const uninstall = installBrowserFileDropUploadBridge({
      getPathForFile,
      uploadFiles: async () => {
        throw new Error("upload failed");
      },
    });

    listeners[0]({
      dataTransfer: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
        items: [],
      },
      preventDefault() {},
      stopImmediatePropagation() {},
      target: new EventTarget(),
    });
    await new Promise((resolve) => setImmediate(resolve));
    uninstall();
  } finally {
    console.error = previousConsoleError;
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }

  assert.equal(appended.length, 1);
});

test("browser drop upload redispatches uploaded files with local paths", async () => {
  const previousDocument = globalThis.document;
  const previousDataTransfer = globalThis.DataTransfer;
  const previousDragEvent = globalThis.DragEvent;
  const listeners = [];
  const target = new EventTarget();
  const dispatched = [];
  let prevented = false;
  let stopped = false;
  let uploaded = null;

  class FakeDataTransfer {
    files = [];
    items = {
      add: (file) => {
        this.files.push(file);
      },
    };
  }

  globalThis.DataTransfer = FakeDataTransfer;
  globalThis.DragEvent = class FakeDragEvent extends Event {
    constructor(type, init) {
      super(type, init);
      this.dataTransfer = init.dataTransfer;
    }
  };
  globalThis.document = {
    addEventListener(type, listener) {
      if (type === "drop") {
        listeners.push(listener);
      }
    },
    removeEventListener() {},
  };
  target.addEventListener("drop", (event) => {
    dispatched.push(event);
  });

  try {
    const uninstall = installBrowserFileDropUploadBridge({
      getPathForFile,
      uploadFiles: async (files) => {
        uploaded = files;
        return [{ label: "notes.txt", fsPath: "/tmp/codex-web-uploads/abc" }];
      },
    });

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    listeners[0]({
      dataTransfer: {
        files: [file],
        items: [],
      },
      preventDefault() {
        prevented = true;
      },
      stopImmediatePropagation() {
        stopped = true;
      },
      target,
    });
    await new Promise((resolve) => setImmediate(resolve));
    uninstall();
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
    if (previousDataTransfer === undefined) {
      delete globalThis.DataTransfer;
    } else {
      globalThis.DataTransfer = previousDataTransfer;
    }
    if (previousDragEvent === undefined) {
      delete globalThis.DragEvent;
    } else {
      globalThis.DragEvent = previousDragEvent;
    }
  }

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(uploaded?.[0]?.name, "notes.txt");
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, "drop");
  assert.equal(dispatched[0].dataTransfer.files.length, 1);
  assert.equal(
    getPathForFile(dispatched[0].dataTransfer.files[0]),
    "/tmp/codex-web-uploads/abc",
  );
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
      .id,
    "remote:default",
  );
  assert.deepEqual(
    handleSyncIpc("codex_desktop:get-shared-object-snapshot", env)
      .remote_ssh_connections,
    [
      {
        hostId: "remote:default",
        displayName: "Remote",
        source: "codex-web",
        sshHost: "remote",
        sshPort: null,
        sshAlias: null,
        identity: null,
        autoConnect: true,
      },
    ],
  );
});

test("browser shared object snapshot enables i18n without Statsig", () => {
  const snapshot = handleSyncIpc("codex_desktop:get-shared-object-snapshot", {
    appVersion: "1.2.3",
    buildFlavor: "prod",
    getSystemThemeVariant: () => "dark",
  });

  assert.equal(snapshot.statsig_default_enable_features.enable_i18n, true);
});

test("settings routes expose local host_config so Connections stays visible", () => {
  const env = {
    appVersion: "1.2.3",
    buildFlavor: "prod",
    getCurrentRoute: () => "/settings/connections",
    getSystemThemeVariant: () => "dark",
  };

  assert.deepEqual(
    handleSyncIpc("codex_desktop:get-shared-object-snapshot", env).host_config,
    {
      id: "local",
      display_name: "Local",
      kind: "local",
    },
  );
});

test("browser host_config route mapping uses local only for settings", () => {
  assert.deepEqual(hostConfigForRoute("/settings"), {
    id: "local",
    display_name: "Local",
    kind: "local",
  });
  assert.deepEqual(hostConfigForRoute("/settings/connections"), {
    id: "local",
    display_name: "Local",
    kind: "local",
  });
  assert.deepEqual(hostConfigForRoute("/thread/abc"), {
    id: "remote:default",
    display_name: "Remote",
    kind: "ssh",
  });
});

test("host_config shared-object updates are scoped to the current route", () => {
  assert.deepEqual(
    normalizeSharedObjectUpdateForRoute(
      {
        type: "shared-object-updated",
        key: "host_config",
        value: { id: "remote:other", display_name: "Other", kind: "ssh" },
      },
      "/settings",
    ),
    {
      type: "shared-object-updated",
      key: "host_config",
      value: { id: "local", display_name: "Local", kind: "local" },
    },
  );

  assert.deepEqual(
    normalizeSharedObjectUpdateForRoute(
      {
        type: "shared-object-updated",
        key: "host_config",
        value: { id: "local", display_name: "Local", kind: "local" },
      },
      "/",
    ),
    {
      type: "shared-object-updated",
      key: "host_config",
      value: { id: "remote:default", display_name: "Remote", kind: "ssh" },
    },
  );
});

test("non-host_config shared-object updates pass through unchanged", () => {
  const message = {
    type: "shared-object-updated",
    key: "remote_connections",
    value: [{ hostId: "local" }],
  };

  assert.equal(normalizeSharedObjectUpdateForRoute(message, "/settings"), message);
});

test("read-config-for-host fetch responses expose browser remote connection features", () => {
  assert.equal(
    isReadConfigForHostFetchMessage({
      type: "fetch",
      requestId: "request-1",
      method: "POST",
      url: "vscode://codex/read-config-for-host",
      body: JSON.stringify({ hostId: "remote:default" }),
    }),
    true,
  );

  const response = normalizeReadConfigForHostFetchResponse(
    {
      type: "fetch-response",
      requestId: "request-1",
      responseType: "success",
      status: 200,
      bodyJsonString: JSON.stringify({
        config: {
          model: "gpt-5",
          features: {
            existing: true,
            remote_connections: false,
          },
        },
      }),
    },
    "zh-CN",
  );

  assert.deepEqual(JSON.parse(response.bodyJsonString), {
    config: {
      ideLocale: "zh-CN",
      model: "gpt-5",
      systemLocale: "zh-CN",
      features: {
        existing: true,
        remote_connections: true,
        remote_ssh_connections: true,
      },
    },
  });
});

test("read-config-for-host fetch responses add missing feature maps", () => {
  const response = normalizeReadConfigForHostFetchResponse(
    {
      type: "fetch-response",
      requestId: "request-2",
      responseType: "success",
      status: 200,
      bodyJsonString: JSON.stringify({
        config: {
          model: "gpt-5",
        },
      }),
    },
    "zh-CN",
  );

  assert.deepEqual(JSON.parse(response.bodyJsonString), {
    config: {
      ideLocale: "zh-CN",
      model: "gpt-5",
      systemLocale: "zh-CN",
      features: {
        remote_connections: true,
        remote_ssh_connections: true,
      },
    },
  });
});

test("browser local fetch responses expose locale info", () => {
  const response = localBrowserFetchResponse(
    {
      type: "fetch",
      requestId: "locale-1",
      method: "POST",
      url: "vscode://codex/locale-info",
    },
    {
      locale: "zh-CN",
      getSetting: () => undefined,
      setSetting: () => {},
    },
  );

  assert.deepEqual(JSON.parse(response.bodyJsonString), {
    ideLocale: "zh-CN",
    systemLocale: "zh-CN",
  });
});

test("browser locale info uses the saved language override", () => {
  const response = localBrowserFetchResponse(
    {
      type: "fetch",
      requestId: "locale-override-1",
      method: "POST",
      url: "vscode://codex/locale-info",
    },
    {
      locale: "en-US",
      getSetting: (key) => (key === "localeOverride" ? "zh-CN" : undefined),
      setSetting: () => {},
    },
  );

  assert.deepEqual(JSON.parse(response.bodyJsonString), {
    ideLocale: "zh-CN",
    systemLocale: "zh-CN",
  });
});

test("browser local fetch responses persist settings", () => {
  const settings = new Map();
  const env = {
    locale: "zh-CN",
    getSetting: (key) => settings.get(key),
    setSetting: (key, value) => settings.set(key, value),
  };

  localBrowserFetchResponse(
    {
      type: "fetch",
      requestId: "set-1",
      method: "POST",
      url: "vscode://codex/set-setting",
      body: JSON.stringify({ params: { key: "localeOverride", value: "zh-CN" } }),
    },
    env,
  );

  const response = localBrowserFetchResponse(
    {
      type: "fetch",
      requestId: "settings-1",
      method: "POST",
      url: "vscode://codex/get-settings",
    },
    env,
  );

  assert.deepEqual(JSON.parse(response.bodyJsonString), {
    configuredValues: {
      localeOverride: "zh-CN",
    },
    values: {
      localeOverride: "zh-CN",
    },
  });
});

test("browser local fetch responses persist settings from direct request bodies", () => {
  const settings = new Map();
  const env = {
    locale: "zh-CN",
    getSetting: (key) => settings.get(key),
    setSetting: (key, value) => settings.set(key, value),
  };

  localBrowserFetchResponse(
    {
      type: "fetch",
      requestId: "set-direct-1",
      method: "POST",
      url: "vscode://codex/set-setting",
      body: JSON.stringify({ key: "localeOverride", value: "zh-CN" }),
    },
    env,
  );

  assert.equal(settings.get("localeOverride"), "zh-CN");
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

test("Statsig overrides keep browser-only navigation gates enabled", () => {
  const adapter = createStatsigOverrideAdapter();

  assert.deepEqual(adapter.getGateOverride({ name: "3075919032", value: false }), {
    name: "3075919032",
    value: true,
  });
  assert.deepEqual(
    adapter.getGateOverride({ name: "4114442250", value: false }),
    { name: "4114442250", value: true },
  );
  assert.deepEqual(
    adapter.getGateOverride({ name: "1042620455", value: false }),
    { name: "1042620455", value: true },
  );
});
