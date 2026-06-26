#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import WebSocket from "ws";

function parseArgs(argv) {
  const options = {
    asarDir: "scratch/asar",
    port: 9333,
    preflightOnly: false,
    reportPath: "scratch/preload-hook-report.json",
    timeoutMs: 30000,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--preflight-only") options.preflightOnly = true;
    else if (arg === "--asar") options.asarDir = argv[++index];
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--report") options.reportPath = argv[++index];
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (!arg.startsWith("--")) options.asarDir = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function assertPreloadGate({ asarDir, reportPath }) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const indexHtml = fs.readFileSync(
    path.join(asarDir, "webview", "index.html"),
    "utf8",
  );
  const preloadAsset = path.join(asarDir, "webview", "assets", "preload.js");
  const failures = [];
  if (!report.support?.ok) failures.push("support.ok is false");
  if (!report.staticReview?.ok) failures.push("staticReview.ok is false");
  if (!indexHtml.includes('src="./assets/preload.js"')) {
    failures.push("webview/index.html does not load assets/preload.js");
  }
  if (!fs.existsSync(preloadAsset)) failures.push(`missing ${preloadAsset}`);
  if (failures.length > 0) throw new Error(failures.join("; "));
  return {
    bridgeMethods: report.staticProfile?.electronBridgeMethods ?? [],
    disabledBridgeMethods: disabledBridgeMethods(),
    preloadAsset,
  };
}

function disabledBridgeMethods() {
  const sourcePath = path.join(
    process.cwd(),
    "src",
    "browser",
    "context-bridge.mts",
  );
  if (!fs.existsSync(sourcePath)) return [];
  const source = fs.readFileSync(sourcePath, "utf8");
  return [
    ...new Set(
      [...source.matchAll(/\bdelete\s+sanitized\.([A-Za-z_$][\w$]*)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function expectedRuntimeBridgeMethods(bridgeMethods, disabledBridgeMethods) {
  const disabled = new Set(disabledBridgeMethods);
  return bridgeMethods.filter((method) => !disabled.has(method));
}

function runVmPreloadSmoke({
  bridgeMethods,
  disabledBridgeMethods,
  preloadAsset,
}) {
  const listeners = new Map();
  const matchMedia = () => ({
    addEventListener() {},
    matches: false,
    removeEventListener() {},
  });
  const document = {
    addEventListener() {},
    body: { appendChild() {}, removeChild() {} },
    createElement() {
      return {
        appendChild() {},
        remove() {},
        setAttribute() {},
        style: {},
      };
    },
    documentElement: { style: {} },
    removeEventListener() {},
  };
  class MessageEvent {
    constructor(type, init = {}) {
      this.data = init.data;
      this.ports = init.ports ?? [];
      this.source = init.source;
      this.type = type;
    }
  }
  class StubWebSocket {
    constructor() {
      this.readyState = 0;
    }
    addEventListener(type, listener) {
      if (type === "open") setTimeout(listener, 0);
    }
    close() {
      this.readyState = 3;
    }
    send() {}
  }
  const window = {
    __ELECTRON_SHIM__: {},
    __CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__: "smoke",
    crypto,
    dispatchEvent() {
      return true;
    },
    document,
    history: { pushState() {}, replaceState() {} },
    innerWidth: 1280,
    location: {
      host: "localhost",
      href: "http://localhost/",
      origin: "http://localhost",
      pathname: "/",
      protocol: "http:",
      search: "",
    },
    matchMedia,
    navigator: { maxTouchPoints: 0, userAgent: "node" },
    open() {},
    postMessage() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener() {},
  };
  Object.assign(window, {
    MessageEvent,
    URL,
    URLSearchParams,
    WebSocket: StubWebSocket,
    clearTimeout,
    console,
    document,
    globalThis: window,
    matchMedia,
    self: window,
    setTimeout,
    window,
  });
  const context = {
    MessageEvent,
    URL,
    URLSearchParams,
    WebSocket: StubWebSocket,
    clearTimeout,
    console,
    crypto,
    document,
    globalThis: window,
    matchMedia,
    navigator: window.navigator,
    process: {
      arch: process.arch,
      env: { NODE_ENV: "production" },
      platform: process.platform,
    },
    self: window,
    setTimeout,
    window,
  };
  vm.runInNewContext(fs.readFileSync(preloadAsset, "utf8"), context, {
    filename: preloadAsset,
    timeout: 5000,
  });
  const bridgeKeys =
    window.electronBridge && typeof window.electronBridge === "object"
      ? Object.keys(window.electronBridge).sort()
      : [];
  const expected = expectedRuntimeBridgeMethods(
    bridgeMethods,
    disabledBridgeMethods,
  );
  const missing = expected.filter((method) => !bridgeKeys.includes(method));
  if (missing.length > 0 || window.codexWindowType !== "electron") {
    throw new Error(
      `vm preload mismatch; missing: ${missing.join(", ") || "none"}`,
    );
  }
  return {
    bridgeKeys,
    codexWindowType: window.codexWindowType,
    disabledBridgeMethods,
    registeredWindowListeners: [...listeners.keys()].sort(),
  };
}

function electronBin() {
  const local = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron",
  );
  return fs.existsSync(local) ? local : "electron";
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  return (
    {
      ".css": "text/css",
      ".html": "text/html",
      ".js": "text/javascript",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".ttf": "font/ttf",
      ".woff2": "font/woff2",
    }[extension] ?? "application/octet-stream"
  );
}

function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${server.address().port}/index.html`,
      });
    });
  });
}

function writeElectronSmokeApp(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-smoke-electron-"));
  const mainPath = path.join(dir, "main.cjs");
  fs.writeFileSync(
    mainPath,
    [
      "const { app, BrowserWindow } = require('electron');",
      "app.whenReady().then(async () => {",
      "  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { contextIsolation: false, nodeIntegration: false, sandbox: false } });",
      `  await win.loadURL(${JSON.stringify(url)});`,
      "});",
      "app.on('window-all-closed', () => app.quit());",
      "",
    ].join("\n"),
  );
  return { dir, mainPath };
}

function assertCanLaunchElectron() {
  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error(
      "runtime smoke needs DISPLAY, WAYLAND_DISPLAY, or xvfb-run on Linux",
    );
  }
}

async function waitForPage(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find(
        (item) => item.type === "page" && item.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {
      // Electron is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Electron CDP page on port ${port}`);
}

function cdpEvaluate(webSocketDebuggerUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const id = 1;
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            awaitPromise: true,
            expression,
            returnByValue: true,
          },
        }),
      );
    });
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.id !== id) return;
      socket.close();
      if (message.error || message.result?.exceptionDetails) {
        reject(
          new Error(
            JSON.stringify(message.error ?? message.result.exceptionDetails),
          ),
        );
      } else {
        resolve(message.result.result.value);
      }
    });
    socket.on("error", reject);
  });
}

async function runRuntimeSmoke({
  asarDir,
  bridgeMethods,
  disabledBridgeMethods,
  port,
  timeoutMs,
}) {
  assertCanLaunchElectron();
  const staticServer = await startStaticServer(path.join(asarDir, "webview"));
  const smokeApp = writeElectronSmokeApp(staticServer.url);
  const child = spawn(
    electronBin(),
    ["--disable-gpu", `--remote-debugging-port=${port}`, smokeApp.mainPath],
    {
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const page = await waitForPage(port, timeoutMs);
    const expression = `(async () => {
        const deadline = Date.now() + 10000;
        while (!globalThis.electronBridge && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const bridge = globalThis.electronBridge;
        return {
          bridgeKeys: bridge && typeof bridge === "object" ? Object.keys(bridge).sort() : [],
          hasBridge: !!bridge,
          hasCodexWindowType: "codexWindowType" in globalThis
        };
      })()`;
    let result;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        result = await cdpEvaluate(page.webSocketDebuggerUrl, expression);
        break;
      } catch (error) {
        if (
          !String(error.message).includes("Execution context was destroyed")
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!result) throw new Error("Unable to evaluate preload runtime smoke");
    const expected = expectedRuntimeBridgeMethods(
      bridgeMethods,
      disabledBridgeMethods,
    );
    const missing = expected.filter(
      (method) => !result.bridgeKeys.includes(method),
    );
    if (!result.hasBridge || missing.length > 0) {
      throw new Error(
        `runtime electronBridge mismatch; missing: ${missing.join(", ")}`,
      );
    }
    return result;
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    await staticServer.close();
    fs.rmSync(smokeApp.dir, { force: true, recursive: true });
    if (child.exitCode && child.exitCode !== 0 && stderr) {
      process.stderr.write(stderr);
    }
  }
}

export async function runPreloadHookSmoke(options) {
  options = { port: 9333, timeoutMs: 30000, ...options };
  const gate = assertPreloadGate(options);
  if (options.preflightOnly) {
    return { mode: "preflight", ...gate, vm: runVmPreloadSmoke(gate) };
  }
  const runtime = await runRuntimeSmoke({ ...options, ...gate });
  return { mode: "runtime", ...gate, runtime };
}

async function main() {
  const result = await runPreloadHookSmoke(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
