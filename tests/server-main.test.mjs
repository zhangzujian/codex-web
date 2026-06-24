import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  createAuthCookie,
  createAuthLoginHtml,
  createFastifyOptions,
  isAllowedBackendWebSocketRequest,
  isAuthenticatedCookie,
  parseServerArgs,
  shouldServeWebviewShellPath,
  shouldBlockFsRequestPath,
} from "../src/server/main.js";
import * as serverMain from "../src/server/main.js";

test("isAllowedBackendWebSocketRequest accepts same-origin upgrades with the expected token", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    true,
  );
});

test("isAllowedBackendWebSocketRequest accepts https same-origin upgrades with the expected token", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "192.168.132.78:8214",
      origin: "https://192.168.132.78:8214",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    true,
  );
});

test("isAllowedBackendWebSocketRequest rejects cross-origin browser websocket upgrades", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "https://example.com",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    false,
  );
});

test("isAllowedBackendWebSocketRequest rejects websocket upgrades without Origin", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    false,
  );
});

test("isAllowedBackendWebSocketRequest rejects missing or incorrect tokens", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/terminal",
      token: "secret",
    }),
    false,
  );
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/terminal?token=wrong",
      token: "secret",
    }),
    false,
  );
});

test("shouldBlockFsRequestPath blocks active same-origin file documents", () => {
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/poc.html"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/poc%2Ehtml"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/script.js"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/image.svg"), true);
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/image.svg", {
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
    }),
    true,
  );
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/script.js", {
      "sec-fetch-dest": "script",
    }),
    true,
  );
});

test("shouldBlockFsRequestPath allows passive local file assets", () => {
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/image.png"), false);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/report.txt"), false);
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/image.svg", {
      "sec-fetch-dest": "image",
    }),
    false,
  );
});

test("shouldServeWebviewShellPath allows known app shell browser routes", () => {
  assert.equal(shouldServeWebviewShellPath("/"), true);
  assert.equal(shouldServeWebviewShellPath("/automations"), true);
  assert.equal(shouldServeWebviewShellPath("/thread/thread-1"), true);
  assert.equal(shouldServeWebviewShellPath("/settings"), true);
  assert.equal(shouldServeWebviewShellPath("/settings/connections"), true);
  assert.equal(shouldServeWebviewShellPath("/share/receive?text=hello"), true);
});

test("shouldServeWebviewShellPath rejects unknown fallback routes", () => {
  assert.equal(shouldServeWebviewShellPath("/unexpected"), false);
  assert.equal(shouldServeWebviewShellPath("/@fs/tmp/poc.html"), false);
});

test("parseServerArgs accepts tls certificate and key paths", () => {
  assert.deepEqual(
    parseServerArgs(
      [
        "--host",
        "0.0.0.0",
        "--port",
        "9443",
        "--tls-cert",
        "certs/codex-web.crt",
        "--tls-key",
        "certs/codex-web.key",
      ],
      {},
    ),
    {
      host: "0.0.0.0",
      port: 9443,
      tls: {
        certPath: "certs/codex-web.crt",
        keyPath: "certs/codex-web.key",
      },
    },
  );
});

test("parseServerArgs accepts an auth token", () => {
  assert.deepEqual(parseServerArgs(["--auth-token", "test-token"], {}), {
    host: "127.0.0.1",
    port: 8214,
    auth: {
      token: "test-token",
    },
  });
});

test("parseServerArgs accepts auth token from the environment", () => {
  assert.deepEqual(
    parseServerArgs([], { CODEX_WEB_AUTH_TOKEN: "test-token" }),
    {
      host: "127.0.0.1",
      port: 8214,
      auth: {
        token: "test-token",
      },
    },
  );
});

test("default terminal session factory uses the app-server command exec connection", async () => {
  const notifications = new Set();
  const rpcCalls = [];
  const appServerClient = {
    onNotification(listener) {
      notifications.add(listener);
      return () => notifications.delete(listener);
    },
    async rpc(method, params) {
      rpcCalls.push([method, params]);
      if (method === "command/exec") {
        return await new Promise(() => {});
      }
      return {};
    },
  };

  const session = serverMain
    .createDefaultTerminalSessionFactory(appServerClient)
    .createSession({
      cols: 80,
      cwd: "/workspace",
      rows: 24,
      terminalType: "xterm-256color",
    });
  await new Promise((resolve) => setImmediate(resolve));
  session.close();

  assert.equal(rpcCalls[0]?.[0], "command/exec");
  assert.equal(rpcCalls[0]?.[1].processId, session.id);
});

test("workspace directory entries can be read through app-server fs", async () => {
  const rpcCalls = [];
  const appServerClient = {
    async rpc(method, params) {
      rpcCalls.push([method, params]);
      return {
        entries: [
          { fileName: "file.txt", isDirectory: false, isFile: true },
          { fileName: ".config", isDirectory: true, isFile: false },
          { fileName: "src", isDirectory: true, isFile: false },
        ],
      };
    },
  };

  const result = await serverMain.getWorkspaceDirectoryEntries(
    {
      directoriesOnly: true,
      directoryPath: "/workspace",
    },
    appServerClient,
  );

  assert.deepEqual(rpcCalls, [["fs/readDirectory", { path: "/workspace" }]]);
  assert.deepEqual(result, {
    directoryPath: "/workspace",
    parentPath: "/",
    entries: [
      { name: "src", path: "/workspace/src", type: "directory" },
      { name: ".config", path: "/workspace/.config", type: "directory" },
    ],
  });
});

test("local workspace directory fetch reads local filesystem", async () => {
  const messages = [];
  const handled = await serverMain.handleWorkspaceDirectoryEntriesFetchMessage(
    {
      type: "fetch",
      requestId: "local-dir",
      method: "POST",
      url: "vscode://codex/remote-workspace-directory-entries",
      body: JSON.stringify({
        hostId: "local",
        directoryPath: new URL("fixtures", import.meta.url).pathname,
        directoriesOnly: false,
      }),
    },
    {
      async rpc() {
        throw new Error("local directory fetch should not use app-server rpc");
      },
    },
    (message) => messages.push(message),
  );

  assert.equal(handled, true);
  assert.equal(messages[0].args[0].responseType, "success");
  const body = JSON.parse(messages[0].args[0].bodyJsonString);
  assert.equal(body.entries.some((entry) => entry.name === "test-cert.pem"), true);
});

test("auth cookie validates only with the matching token", () => {
  const cookie = createAuthCookie({
    token: "test-token",
    secure: true,
    now: 1_000,
  });

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.equal(
    isAuthenticatedCookie({
      cookieHeader: cookie,
      token: "test-token",
      now: 1_000,
    }),
    true,
  );
  assert.equal(
    isAuthenticatedCookie({
      cookieHeader: cookie,
      token: "wrong",
      now: 1_000,
    }),
    false,
  );
});

test("auth login page only redirects to same-origin paths", () => {
  assert.match(
    createAuthLoginHtml("/__auth/login?next=%2Fthread%2Fabc%3Fx%3D1"),
    /location\.href = "\/thread\/abc\?x=1"/,
  );
  assert.match(
    createAuthLoginHtml("/__auth/login?next=https%3A%2F%2Fexample.com%2Fsteal"),
    /location\.href = "\/"/,
  );
  assert.match(
    createAuthLoginHtml("/__auth/login?next=%2F%2Fexample.com%2Fsteal"),
    /location\.href = "\/"/,
  );
  assert.match(
    createAuthLoginHtml("/__auth/login?next=%2F%5Cexample.com%2Fsteal"),
    /location\.href = "\/"/,
  );
});

test("parseServerArgs requires tls cert and key together", () => {
  assert.throws(
    () => parseServerArgs(["--tls-cert", "certs/codex-web.crt"], {}),
    /--tls-cert and --tls-key must be provided together/,
  );
  assert.throws(
    () => parseServerArgs(["--tls-key", "certs/codex-web.key"], {}),
    /--tls-cert and --tls-key must be provided together/,
  );
});

test("createFastifyOptions loads tls certificate and key", async () => {
  const options = await createFastifyOptions({
    host: "0.0.0.0",
    port: 9443,
    tls: {
      certPath: new URL("fixtures/test-cert.pem", import.meta.url).pathname,
      keyPath: new URL("fixtures/test-key.pem", import.meta.url).pathname,
    },
  });

  assert.deepEqual(options, {
    logger: false,
    https: {
      cert: "test certificate\n",
      key: "test key\n",
    },
  });
});

test("webview shell installs Statsig overrides before module scripts run", async () => {
  assert.equal(typeof serverMain.injectWebviewRuntimeScripts, "function");

  const html = `<!doctype html>
<html>
  <head>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self'"
    />
    <script type="module" crossorigin src="./assets/index.js"></script>
  </head>
</html>`;

  const injected = serverMain.injectWebviewRuntimeScripts(html, "secret");
  const overrideIndex = injected.indexOf("window.__ELECTRON_SHIM__");
  const layerOverrideIndex = injected.indexOf("getLayerOverride");
  const localeSourceIndex = injected.indexOf("locale_source");
  const tokenIndex = injected.indexOf("__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__");
  const preloadIndex = injected.indexOf("./assets/preload.js");
  const appIndex = injected.indexOf("./assets/index.js");

  assert.equal(injected.includes("Content-Security-Policy"), false);
  assert.match(injected, /<base href="\/" \/>/);
  assert.match(
    injected,
    /<script type="module" src="\.\/assets\/preload\.js"><\/script>/,
  );
  assert.notEqual(overrideIndex, -1);
  assert.notEqual(layerOverrideIndex, -1);
  assert.notEqual(localeSourceIndex, -1);
  assert.notEqual(tokenIndex, -1);
  assert.notEqual(preloadIndex, -1);
  assert.ok(overrideIndex < preloadIndex);
  assert.ok(overrideIndex < appIndex);

  const bootstrapScript = [
    ...injected.matchAll(/<script>([\s\S]*?)<\/script>/g),
  ]
    .map((match) => match[1])
    .find((script) => script.includes("window.__ELECTRON_SHIM__"));
  assert.equal(typeof bootstrapScript, "string");
  const nativeFetch = () => Promise.resolve(new Response("native"));
  const context = { window: { fetch: nativeFetch }, Response, URL };
  runInNewContext(bootstrapScript, context);

  const adapter = context.window.__ELECTRON_SHIM__.overrideAdapter;
  const automationsGateOverride = adapter.getGateOverride({
    name: "3075919032",
    value: false,
  });
  const remoteConnectionsGateOverride = adapter.getGateOverride({
    name: "4114442250",
    value: false,
  });
  const remoteSshConnectionsGateOverride = adapter.getGateOverride({
    name: "1042620455",
    value: false,
  });
  assert.equal(automationsGateOverride.name, "3075919032");
  assert.equal(automationsGateOverride.value, true);
  assert.equal(remoteConnectionsGateOverride.name, "4114442250");
  assert.equal(remoteConnectionsGateOverride.value, true);
  assert.equal(remoteSshConnectionsGateOverride.name, "1042620455");
  assert.equal(remoteSshConnectionsGateOverride.value, true);
  const sentryIpcResponse = await context.window.fetch(
    "sentry-ipc://scope/sentry_key",
  );
  assert.equal(sentryIpcResponse.status, 204);
  const nativeResponse = await context.window.fetch("https://example.test");
  assert.equal(await nativeResponse.text(), "native");
});

test("webview shell keeps terminal Ctrl+W out of global key handlers", () => {
  const injected = serverMain.injectWebviewRuntimeScripts("<head></head>", "secret");
  const bootstrapScripts = [
    ...injected.matchAll(/<script>([\s\S]*?)<\/script>/g),
  ].map((match) => match[1]);

  class FakeEventTarget {
    constructor() {
      this.listeners = [];
    }

    addEventListener(type, listener) {
      this.listeners.push({ type, listener });
    }

    removeEventListener(type, listener) {
      this.listeners = this.listeners.filter(
        (entry) => entry.type !== type || entry.listener !== listener,
      );
    }

    dispatchEvent(event) {
      for (const entry of this.listeners) {
        if (entry.type === event.type) {
          entry.listener.call(this, event);
        }
      }
    }
  }

  class FakeElement extends FakeEventTarget {
    constructor({ isTerminal = false } = {}) {
      super();
      this.isTerminal = isTerminal;
    }

    closest(selector) {
      return selector === "[data-codex-terminal]" && this.isTerminal
        ? this
        : null;
    }
  }

  const document = new FakeEventTarget();
  document.body = new FakeElement();
  document.documentElement = new FakeElement();
  const window = new FakeEventTarget();
  window.fetch = () => Promise.resolve(new Response(null, { status: 204 }));

  runInNewContext(bootstrapScripts.join("\n"), {
    document,
    Element: FakeElement,
    EventTarget: FakeEventTarget,
    Response,
    URL,
    window,
  });

  const terminalTarget = new FakeElement({ isTerminal: true });
  const nonTerminalTarget = new FakeElement();
  let xtermCalls = 0;
  let appCalls = 0;
  let objectListenerThis = null;
  let preventDefaultCalls = 0;

  terminalTarget.addEventListener("keydown", () => {
    xtermCalls += 1;
  });
  const objectListener = {
    handleEvent() {
      objectListenerThis = this;
    },
  };
  terminalTarget.addEventListener("keydown", objectListener);
  document.addEventListener("keydown", () => {
    appCalls += 1;
  });

  const terminalCtrlWEvent = {
    altKey: false,
    code: "KeyW",
    ctrlKey: true,
    defaultPrevented: false,
    key: "w",
    metaKey: false,
    preventDefault() {
      this.defaultPrevented = true;
      preventDefaultCalls += 1;
    },
    shiftKey: false,
    target: terminalTarget,
    type: "keydown",
  };

  window.dispatchEvent(terminalCtrlWEvent);
  assert.equal(preventDefaultCalls, 1);

  terminalTarget.dispatchEvent(terminalCtrlWEvent);
  document.dispatchEvent(terminalCtrlWEvent);

  assert.equal(xtermCalls, 1);
  assert.equal(objectListenerThis, objectListener);
  assert.equal(appCalls, 0);
  assert.ok(preventDefaultCalls >= 1);

  document.dispatchEvent({
    ...terminalCtrlWEvent,
    target: nonTerminalTarget,
  });

  assert.equal(appCalls, 1);
});

test("webview shell exposes configured terminal font", () => {
  const previousFont = process.env.CODEX_WEB_TERMINAL_FONT;
  process.env.CODEX_WEB_TERMINAL_FONT = "MesloLGS NF";
  try {
    const injected = serverMain.injectWebviewRuntimeScripts(
      "<head></head>",
      "secret",
    );

    assert.match(injected, /__CODEX_WEB_TERMINAL_FONT__/);
    assert.match(injected, /MesloLGS NF/);
  } finally {
    if (previousFont === undefined) {
      delete process.env.CODEX_WEB_TERMINAL_FONT;
    } else {
      process.env.CODEX_WEB_TERMINAL_FONT = previousFont;
    }
  }
});

test("webview shell declares the bundled configured terminal font", () => {
  const previousFont = process.env.CODEX_WEB_TERMINAL_FONT;
  process.env.CODEX_WEB_TERMINAL_FONT = "MesloLGS NF";
  try {
    const injected = serverMain.injectWebviewRuntimeScripts(
      "<head></head>",
      "secret",
    );

    assert.match(injected, /@font-face/);
    assert.match(injected, /font-family: "MesloLGS NF"/);
    assert.match(injected, /\/__codex-web\/fonts\/MesloLGS%20NF%20Regular.ttf/);
    assert.doesNotMatch(injected, /MesloLGS%20NF%20Bold.ttf/);
    assert.doesNotMatch(injected, /font-weight:/);
    assert.doesNotMatch(injected, /font-style:/);
  } finally {
    if (previousFont === undefined) {
      delete process.env.CODEX_WEB_TERMINAL_FONT;
    } else {
      process.env.CODEX_WEB_TERMINAL_FONT = previousFont;
    }
  }
});

test("webview shell fetches the manifest with auth credentials", () => {
  const html = `<!doctype html>
<html>
  <head>
    <link rel="manifest" href="/manifest.json" />
  </head>
</html>`;

  assert.match(
    serverMain.injectWebviewRuntimeScripts(html, "secret"),
    /<link rel="manifest" href="\/manifest\.json" crossorigin="use-credentials" \/>/,
  );
});
