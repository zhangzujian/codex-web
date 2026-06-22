import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  createAuthCookie,
  createAuthLoginHtml,
  createTerminalHtml,
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
  assert.equal(shouldServeWebviewShellPath("/thread/thread-1"), true);
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
  assert.deepEqual(
    parseServerArgs(["--auth-token", "test-token"], {}),
    {
      host: "127.0.0.1",
      port: 8214,
      auth: {
        token: "test-token",
      },
    },
  );
});

test("parseServerArgs accepts auth token from the environment", () => {
  assert.deepEqual(parseServerArgs([], { CODEX_WEB_AUTH_TOKEN: "test-token" }), {
    host: "127.0.0.1",
    port: 8214,
    auth: {
      token: "test-token",
    },
  });
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
    createAuthLoginHtml(
      "/__auth/login?next=https%3A%2F%2Fexample.com%2Fsteal",
    ),
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

test("webview shell installs Statsig overrides before module scripts run", () => {
  assert.equal(typeof serverMain.injectWebviewRuntimeScripts, "function");

  const html = `<!doctype html>
<html>
  <head>
    <script type="module" src="./assets/preload.js"></script>
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

  assert.notEqual(overrideIndex, -1);
  assert.notEqual(layerOverrideIndex, -1);
  assert.notEqual(localeSourceIndex, -1);
  assert.notEqual(tokenIndex, -1);
  assert.ok(overrideIndex < preloadIndex);
  assert.ok(overrideIndex < appIndex);

  const [bootstrapScript] = [
    ...injected.matchAll(/<script>([\s\S]*?)<\/script>/g),
  ].map((match) => match[1]);
  const context = { window: {} };
  runInNewContext(bootstrapScript, context);

  const adapter = context.window.__ELECTRON_SHIM__.overrideAdapter;
  const automationsGateOverride = adapter.getGateOverride({
    name: "3075919032",
    value: false,
  });
  assert.equal(automationsGateOverride.name, "3075919032");
  assert.equal(automationsGateOverride.value, true);
});

test("terminal html carries the requested locale for terminal i18n", () => {
  const html = createTerminalHtml({
    backendWebSocketToken: "secret",
    cwd: "/tmp/work",
    locale: "zh-CN",
    stylesheetHrefs: ["/assets/terminal-page.css"],
  });

  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<title>终端<\/title>/);
  assert.match(html, /data-terminal-locale="zh-CN"/);
  assert.match(html, /data-backend-websocket-token="secret"/);
});
