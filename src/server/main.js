#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseServerArgs = parseServerArgs;
exports.createFastifyOptions = createFastifyOptions;
exports.isAllowedBackendWebSocketRequest = isAllowedBackendWebSocketRequest;
exports.shouldBlockFsRequestPath = shouldBlockFsRequestPath;
exports.shouldServeWebviewShellPath = shouldServeWebviewShellPath;
exports.createAuthCookie = createAuthCookie;
exports.isAuthenticatedCookie = isAuthenticatedCookie;
exports.createAuthLoginHtml = createAuthLoginHtml;
exports.createTerminalHtml = createTerminalHtml;
exports.injectWebviewRuntimeScripts = injectWebviewRuntimeScripts;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const ws_1 = require("ws");
const fastify_1 = __importDefault(require("fastify"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const static_1 = __importDefault(require("@fastify/static"));
const module_1 = require("./module");
const glob_1 = require("glob");
const terminal_1 = require("./terminal");
const browser_panel_runtime_1 = require("./browser-panel-runtime");
const native_open_1 = require("./native-open");
function workspaceDirectoryEntryTypeRank(entry) {
    return entry.type === "directory" ? 0 : 1;
}
function workspaceDirectoryEntryHiddenRank(entry) {
    return entry.name.startsWith(".") ? 1 : 0;
}
function compareWorkspaceDirectoryEntries(left, right) {
    return (workspaceDirectoryEntryTypeRank(left) -
        workspaceDirectoryEntryTypeRank(right) ||
        workspaceDirectoryEntryHiddenRank(left) -
            workspaceDirectoryEntryHiddenRank(right) ||
        left.name.localeCompare(right.name));
}
function printUsage() {
    console.log([
        "Usage:",
        "  server [--host <host>] [--port <port>] [--tls-cert <path> --tls-key <path>] [--auth-token <token>]",
        "",
        "Defaults:",
        "  --host 127.0.0.1",
        "  --port 8214",
        "",
        "Examples:",
        "  yarn server",
        "  yarn server --port 9000",
        "  CODEX_WEB_AUTH_TOKEN=your-token yarn server --host 0.0.0.0 --port 9443 --tls-cert certs/codex-web.crt --tls-key certs/codex-web.key",
    ].join("\n"));
}
function parsePort(raw) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port: ${raw}`);
    }
    return parsed;
}
function parseServerArgs(args, env = process.env) {
    const parsed = (0, node_util_1.parseArgs)({
        args,
        allowPositionals: false,
        options: {
            help: {
                short: "h",
                type: "boolean",
            },
            host: {
                type: "string",
            },
            port: {
                type: "string",
            },
            "tls-cert": {
                type: "string",
            },
            "tls-key": {
                type: "string",
            },
            "auth-token": {
                type: "string",
            },
        },
        strict: true,
    });
    if (parsed.values.help) {
        printUsage();
        process.exit(0);
    }
    const tlsCert = parsed.values["tls-cert"];
    const tlsKey = parsed.values["tls-key"];
    if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) {
        throw new Error("--tls-cert and --tls-key must be provided together");
    }
    const options = {
        host: parsed.values.host ?? "127.0.0.1",
        port: parsed.values.port ? parsePort(parsed.values.port) : 8214,
    };
    const authToken = (parsed.values["auth-token"] ?? env.CODEX_WEB_AUTH_TOKEN)?.trim();
    if (authToken) {
        options.auth = {
            token: authToken,
        };
    }
    if (tlsCert && tlsKey) {
        options.tls = {
            certPath: tlsCert,
            keyPath: tlsKey,
        };
    }
    return options;
}
async function createFastifyOptions(options) {
    if (!options.tls) {
        return { logger: false };
    }
    const [cert, key] = await Promise.all([
        promises_1.default.readFile(options.tls.certPath, "utf8"),
        promises_1.default.readFile(options.tls.keyPath, "utf8"),
    ]);
    return {
        logger: false,
        https: {
            cert,
            key,
        },
    };
}
function getIpcMainBridgeState() {
    const globals = globalThis;
    if (!globals.__codexElectronIpcBridge) {
        globals.__codexElectronIpcBridge = {};
    }
    return globals.__codexElectronIpcBridge;
}
function errorMessage(error) {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    return String(error);
}
function sendSocketMessage(socket, message) {
    if (socket.readyState === ws_1.WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}
function createVirtualMessagePort({ onClose, portId, socket, }) {
    const listeners = {
        close: new Set(),
        message: new Set(),
    };
    let closed = false;
    const emit = (event, payload) => {
        for (const listener of listeners[event]) {
            listener(payload);
        }
    };
    return {
        __codexVirtualPortId: portId,
        close() {
            if (closed) {
                return;
            }
            closed = true;
            onClose();
            sendSocketMessage(socket, {
                type: "virtual-port-close",
                portId,
            });
            emit("close");
        },
        emitMessage(data) {
            if (closed) {
                return;
            }
            emit("message", { data });
        },
        on(event, listener) {
            listeners[event].add(listener);
        },
        postMessage(data) {
            if (closed) {
                return;
            }
            sendSocketMessage(socket, {
                type: "virtual-port-message",
                portId,
                data,
            });
        },
        start() {
            // Electron MessagePortMain requires start(); this bridge is always live.
        },
    };
}
async function getWorkspaceDirectoryEntries({ directoryPath, directoriesOnly, }) {
    const requestedPath = directoryPath?.trim() || node_os_1.default.homedir();
    const resolvedPath = node_path_1.default.resolve(requestedPath);
    const stat = await promises_1.default.stat(resolvedPath);
    if (!stat.isDirectory()) {
        throw new Error(`Directory not found: ${requestedPath}`);
    }
    const entries = (await promises_1.default.readdir(resolvedPath, { withFileTypes: true }))
        .flatMap((entry) => {
        const type = entry.isDirectory() ? "directory" : "file";
        if (directoriesOnly && type !== "directory") {
            return [];
        }
        return [
            {
                name: entry.name,
                path: node_path_1.default.join(resolvedPath, entry.name),
                type,
            },
        ];
    })
        .sort(compareWorkspaceDirectoryEntries);
    const rootPath = node_path_1.default.parse(resolvedPath).root;
    const parentPath = resolvedPath === rootPath ? null : node_path_1.default.dirname(resolvedPath);
    return {
        directoryPath: resolvedPath,
        parentPath,
        entries,
    };
}
function ensureElectronLikeProcessContext() {
    if (!process.env.CODEX_CLI_PATH && process.env.CODEX_UNIX_SOCKET) {
        const remoteProxyPath = node_path_1.default.resolve(__dirname, "../../scripts/codex_remote_proxy");
        if (node_fs_1.default.existsSync(remoteProxyPath)) {
            process.env.CODEX_CLI_PATH = remoteProxyPath;
        }
    }
    const versions = process.versions;
    if (!versions.electron) {
        Object.defineProperty(versions, "electron", {
            value: "41.2.0",
            configurable: true,
            enumerable: true,
            writable: false,
        });
    }
    const processWithElectronFields = process;
    processWithElectronFields.resourcesPath ??= node_path_1.default.resolve(__dirname, "../../scratch/asar");
    processWithElectronFields.type ??= "browser";
    const processWithLinkedBinding = process;
    if (!processWithLinkedBinding._codexWebLinkedBindingShimInstalled) {
        const originalLinkedBinding = processWithLinkedBinding._linkedBinding;
        processWithLinkedBinding._linkedBinding = function linkedBindingShim(name) {
            if (name === "electron_common_owl_features") {
                return {
                    isOwlFeatureEnabled: () => false,
                };
            }
            if (typeof originalLinkedBinding !== "function") {
                throw new Error(`No linked binding available for ${name}`);
            }
            return originalLinkedBinding.call(this, name);
        };
        processWithLinkedBinding._codexWebLinkedBindingShimInstalled = true;
    }
}
async function startIpcBridgeServer(options) {
    const bridgeState = getIpcMainBridgeState();
    const app = (0, fastify_1.default)(await createFastifyOptions(options));
    const websocketServer = new ws_1.WebSocketServer({ noServer: true });
    const terminalWebsocketServer = new ws_1.WebSocketServer({ noServer: true });
    const sockets = new Set();
    const backendWebSocketToken = (0, node_crypto_1.randomUUID)();
    const terminalSessionFactory = (0, terminal_1.createNodePtyTerminalSessionFactory)();
    const handleTerminalSocket = (0, terminal_1.createTerminalSocketHandler)(terminalSessionFactory);
    await app.register(multipart_1.default, {
        limits: {
            fileSize: Infinity,
        },
    });
    const uploadRoot = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "codex-web-uploads-"));
    app.get("/__auth/login", async (request, reply) => {
        return reply.type("text/html").send(createAuthLoginHtml(request.url));
    });
    app.post("/__auth/session", async (request, reply) => {
        if (!options.auth) {
            return reply.code(404).send({ error: "Not Found" });
        }
        const body = request.body;
        const token = typeof body === "object" &&
            body !== null &&
            "token" in body &&
            typeof body.token === "string"
            ? body.token
            : "";
        if (!isSameSecret(token, options.auth.token)) {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        reply.header("set-cookie", createAuthCookie({
            token: options.auth.token,
            secure: Boolean(options.tls),
        }));
        return reply.send({ ok: true });
    });
    app.addHook("onRequest", async (request, reply) => {
        if (options.auth &&
            !isPublicAuthPath(request.url) &&
            !isAuthenticatedCookie({
                cookieHeader: request.headers.cookie,
                token: options.auth.token,
            })) {
            if (request.method === "GET" &&
                singleHeaderValue(request.headers.accept)?.includes("text/html")) {
                return reply.redirect(authLoginPath(request.url));
            }
            return reply.code(401).send({ error: "Unauthorized" });
        }
        if (shouldBlockFsRequestPath(request.url, request.headers)) {
            return reply.code(403).send({ error: "Forbidden" });
        }
    });
    app.post("/__backend/upload", async (request, reply) => {
        if (!request.isMultipart()) {
            return reply.code(400).send({ error: "expected multipart upload body" });
        }
        const files = await Array.fromAsync((async function* () {
            for await (const part of request.files()) {
                const label = part.filename?.trim() || "upload";
                const uploadedPath = node_path_1.default.join(uploadRoot, (0, node_crypto_1.randomUUID)());
                await promises_1.default.writeFile(uploadedPath, await part.toBuffer());
                yield {
                    label,
                    path: uploadedPath,
                    fsPath: uploadedPath,
                };
            }
        })());
        return reply.send({ files });
    });
    await app.register(static_1.default, {
        root: "/",
        prefix: "/@fs/",
        decorateReply: false,
    });
    const webviewRoot = node_path_1.default.resolve(__dirname, "../../scratch/asar/webview");
    await app.register(static_1.default, {
        root: webviewRoot,
        prefix: "/",
    });
    app.get("/", async (_request, reply) => {
        return sendWebviewIndex(reply, webviewRoot, backendWebSocketToken);
    });
    app.get("/__terminal", async (request, reply) => {
        return reply.type("text/html").send(createTerminalHtml({
            backendWebSocketToken,
            cwd: getTerminalCwdFromQuery(request.query),
            locale: getTerminalLocaleFromQuery(request.query),
            stylesheetHrefs: getTerminalStylesheetHrefs(webviewRoot),
        }));
    });
    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith("/@fs/")) {
            return reply.code(404).send({ error: "Not Found" });
        }
        if (request.method === "GET" && shouldServeWebviewShellPath(request.url)) {
            return sendWebviewIndex(reply, webviewRoot, backendWebSocketToken);
        }
        return reply.code(404).send({ error: "Not Found" });
    });
    app.server.on("upgrade", (request, socket, head) => {
        const requestUrl = request.url ?? "/";
        const host = request.headers.host ?? "localhost";
        const url = new URL(requestUrl, `http://${host}`);
        const isBackendWebSocket = url.pathname === "/__backend/terminal" ||
            url.pathname === "/__backend/ipc";
        if (isBackendWebSocket &&
            options.auth &&
            !isAuthenticatedCookie({
                cookieHeader: request.headers.cookie,
                token: options.auth.token,
            })) {
            socket.destroy();
            return;
        }
        if (isBackendWebSocket &&
            !isAllowedBackendWebSocketRequest({
                host: request.headers.host,
                origin: request.headers.origin,
                requestUrl,
                token: backendWebSocketToken,
            })) {
            socket.destroy();
            return;
        }
        if (url.pathname === "/__backend/terminal") {
            terminalWebsocketServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
                terminalWebsocketServer.emit("connection", upgradedSocket, request);
            });
            return;
        }
        if (url.pathname !== "/__backend/ipc") {
            socket.destroy();
            return;
        }
        websocketServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
            websocketServer.emit("connection", upgradedSocket, request);
        });
    });
    bridgeState.broadcastToRenderer = (message) => {
        const payload = JSON.stringify(message);
        for (const socket of sockets) {
            if (socket.readyState === ws_1.WebSocket.OPEN) {
                socket.send(payload);
            }
        }
    };
    const browserPanelRuntime = (0, browser_panel_runtime_1.createBrowserPanelRuntime)({
        broadcastToRenderer: (message) => bridgeState.broadcastToRenderer?.(message),
    });
    websocketServer.on("connection", (socket) => {
        sockets.add(socket);
        const virtualPorts = new Map();
        const getVirtualPort = (portId) => {
            let port = virtualPorts.get(portId);
            if (!port) {
                port = createVirtualMessagePort({
                    portId,
                    socket,
                    onClose: () => {
                        virtualPorts.delete(portId);
                    },
                });
                virtualPorts.set(portId, port);
            }
            return port;
        };
        socket.on("close", () => {
            sockets.delete(socket);
            for (const port of virtualPorts.values()) {
                port.close();
            }
            virtualPorts.clear();
        });
        socket.on("message", (rawData) => {
            let message;
            try {
                message = JSON.parse(String(rawData));
            }
            catch (error) {
                console.error("[ipc-bridge] invalid JSON payload", error);
                return;
            }
            if (message.type === "virtual-port-message") {
                getVirtualPort(message.portId).emitMessage(message.data);
                return;
            }
            if (message.type === "virtual-port-close") {
                virtualPorts.get(message.portId)?.close();
                return;
            }
            if (message.type === "ipc-renderer-send") {
                const ports = message.portIds?.map(getVirtualPort) ?? [];
                if (message.channel === "codex_desktop:message-from-view" &&
                    (0, native_open_1.canHandleNativeOpenFetchMessage)(message.args[0])) {
                    void (0, native_open_1.handleNativeOpenFetchMessage)(message.args[0], {
                        respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
                    });
                    return;
                }
                const handledByBrowserPanelRuntime = (0, browser_panel_runtime_1.handleBrowserPanelRuntimeIpcMessage)(browserPanelRuntime, message.channel, message.args);
                if (handledByBrowserPanelRuntime) {
                    return;
                }
                bridgeState.handleRendererSend?.(message.channel, message.args, message.sourceUrl, ports);
                return;
            }
            if (message.type === "workspace-directory-entries-request") {
                const { requestId } = message;
                getWorkspaceDirectoryEntries(message)
                    .then((result) => {
                    const payload = {
                        type: "workspace-directory-entries-result",
                        requestId,
                        ok: true,
                        result,
                    };
                    if (socket.readyState === ws_1.WebSocket.OPEN) {
                        socket.send(JSON.stringify(payload));
                    }
                })
                    .catch((error) => {
                    const payload = {
                        type: "workspace-directory-entries-result",
                        requestId,
                        ok: false,
                        errorMessage: errorMessage(error),
                    };
                    if (socket.readyState === ws_1.WebSocket.OPEN) {
                        socket.send(JSON.stringify(payload));
                    }
                });
                return;
            }
            if (message.type === "ipc-renderer-invoke") {
                const { channel, requestId, args, sourceUrl } = message;
                if (channel === "codex_desktop:message-from-view" &&
                    (0, native_open_1.canHandleNativeOpenFetchMessage)(args[0])) {
                    void (0, native_open_1.handleNativeOpenFetchMessage)(args[0], {
                        respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
                    });
                    sendSocketMessage(socket, {
                        type: "ipc-renderer-invoke-result",
                        requestId,
                        ok: true,
                        result: undefined,
                    });
                    return;
                }
                const handledByBrowserPanelRuntime = (0, browser_panel_runtime_1.handleBrowserPanelRuntimeIpcMessage)(browserPanelRuntime, channel, args);
                if (handledByBrowserPanelRuntime) {
                    sendSocketMessage(socket, {
                        type: "ipc-renderer-invoke-result",
                        requestId,
                        ok: true,
                        result: undefined,
                    });
                    return;
                }
                Promise.resolve(bridgeState.handleRendererInvoke?.(channel, args, sourceUrl) ??
                    Promise.reject(new Error(`[ipc-bridge] no ipcMain.handle for channel ${channel}`)))
                    .then((result) => {
                    const payload = {
                        type: "ipc-renderer-invoke-result",
                        requestId,
                        ok: true,
                        result,
                    };
                    sendSocketMessage(socket, payload);
                })
                    .catch((error) => {
                    const payload = {
                        type: "ipc-renderer-invoke-result",
                        requestId,
                        ok: false,
                        errorMessage: errorMessage(error),
                    };
                    sendSocketMessage(socket, payload);
                });
            }
        });
    });
    terminalWebsocketServer.on("connection", (socket) => {
        handleTerminalSocket(socket);
    });
    await app.listen({ host: options.host, port: options.port });
    const socketProtocol = options.tls ? "wss" : "ws";
    console.log(`IPC bridge listening at ${socketProtocol}://${options.host}:${options.port}`);
    ensureElectronLikeProcessContext();
    (0, module_1.installModuleAliasHook)();
    const matches = await (0, glob_1.glob)("../../scratch/asar/.vite/build/main-*.js", {
        nodir: true,
        cwd: __dirname,
    });
    if (matches.length === 0) {
        throw new Error("no main bundle found");
    }
    if (matches.length > 1) {
        throw new Error("multiple main bundles found");
    }
    const module = require(matches[0]);
    module.runMainAppStartup();
}
function isAllowedBackendWebSocketRequest({ host, origin, requestUrl, token, }) {
    const originValue = singleHeaderValue(origin);
    if (originValue == null) {
        return false;
    }
    const hostValue = singleHeaderValue(host);
    if (hostValue == null) {
        return false;
    }
    try {
        const originHost = new URL(originValue).host.toLowerCase();
        const request = new URL(requestUrl, `http://${hostValue}`);
        return (originHost === hostValue.toLowerCase() &&
            request.searchParams.get("token") === token);
    }
    catch {
        return false;
    }
}
const ACTIVE_FS_EXTENSIONS = new Set([
    ".html",
    ".htm",
    ".js",
    ".mjs",
    ".svg",
    ".xml",
    ".xhtml",
]);
const ACTIVE_FS_FETCH_DESTINATIONS = new Set([
    "document",
    "embed",
    "frame",
    "iframe",
    "object",
    "script",
    "serviceworker",
    "sharedworker",
    "worker",
    "xslt",
]);
const PASSIVE_FS_FETCH_DESTINATIONS = new Set([
    "audio",
    "font",
    "image",
    "manifest",
    "style",
    "track",
    "video",
]);
function shouldBlockFsRequestPath(requestPath, headers = {}) {
    let pathname;
    try {
        pathname = new URL(requestPath, "http://localhost").pathname;
    }
    catch {
        pathname = requestPath;
    }
    if (!pathname.startsWith("/@fs/")) {
        return false;
    }
    let decodedPathname = pathname;
    try {
        decodedPathname = decodeURIComponent(pathname);
    }
    catch {
        // Fall back to the raw path for malformed escape sequences.
    }
    if (!ACTIVE_FS_EXTENSIONS.has(node_path_1.default.extname(decodedPathname).toLowerCase())) {
        return false;
    }
    const fetchDestination = singleHeaderValue(headers["sec-fetch-dest"])
        ?.toLowerCase()
        .trim();
    if (fetchDestination && PASSIVE_FS_FETCH_DESTINATIONS.has(fetchDestination)) {
        return false;
    }
    if (fetchDestination && ACTIVE_FS_FETCH_DESTINATIONS.has(fetchDestination)) {
        return true;
    }
    return true;
}
function shouldServeWebviewShellPath(requestPath) {
    let pathname;
    let search;
    try {
        const url = new URL(requestPath, "http://localhost");
        pathname = url.pathname;
        search = url.search;
    }
    catch {
        pathname = requestPath;
        search = "";
    }
    if (pathname === "/") {
        return true;
    }
    if (pathname === "/share/receive") {
        return search.length > 0;
    }
    return /^\/thread\/[^/]+$/.test(pathname);
}
const AUTH_COOKIE_NAME = "codex_web_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
function createAuthCookie({ now = Date.now(), secure, token, }) {
    const expiresAt = now + AUTH_COOKIE_MAX_AGE_SECONDS * 1000;
    const payload = `${expiresAt}.${(0, node_crypto_1.randomBytes)(16).toString("base64url")}`;
    const value = `${payload}.${authSignature(token, payload)}`;
    return [
        `${AUTH_COOKIE_NAME}=${value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
        secure ? "Secure" : "",
    ]
        .filter(Boolean)
        .join("; ");
}
function isAuthenticatedCookie({ cookieHeader, now = Date.now(), token, }) {
    const cookie = parseCookieHeader(singleHeaderValue(cookieHeader));
    const value = cookie.get(AUTH_COOKIE_NAME);
    if (!value) {
        return false;
    }
    const parts = value.split(".");
    if (parts.length !== 3) {
        return false;
    }
    const [expiresAtRaw, nonce, signature] = parts;
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < now) {
        return false;
    }
    return isSameSecret(signature, authSignature(token, `${expiresAtRaw}.${nonce}`));
}
function authSignature(token, payload) {
    return (0, node_crypto_1.createHmac)("sha256", token).update(payload).digest("base64url");
}
function isSameSecret(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (leftBuffer.length === rightBuffer.length &&
        (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer));
}
function parseCookieHeader(cookieHeader) {
    const cookies = new Map();
    for (const part of cookieHeader?.split(";") ?? []) {
        const separator = part.indexOf("=");
        if (separator === -1) {
            continue;
        }
        cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1));
    }
    return cookies;
}
function isPublicAuthPath(requestPath) {
    try {
        const { pathname } = new URL(requestPath, "http://localhost");
        return pathname === "/__auth/login" || pathname === "/__auth/session";
    }
    catch {
        return false;
    }
}
function authLoginPath(requestPath) {
    return `/__auth/login?next=${encodeURIComponent(requestPath)}`;
}
function createAuthLoginHtml(requestPath) {
    const next = safeAuthNextPath(new URL(requestPath, "http://localhost").searchParams.get("next"));
    return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>codex-web login</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0c0d0e; color: #f8fafc; font: 16px system-ui, sans-serif; }
      form { width: min(320px, calc(100vw - 32px)); display: grid; gap: 12px; }
      input, button { box-sizing: border-box; width: 100%; border-radius: 6px; border: 1px solid rgb(255 255 255 / 0.18); padding: 10px 12px; font: inherit; }
      input { background: #15171a; color: inherit; }
      button { background: #f8fafc; color: #0c0d0e; cursor: pointer; }
      p { min-height: 20px; margin: 0; color: #ffb4a8; font-size: 14px; }
    </style>
  </head>
  <body>
    <form data-login-form>
      <input name="token" type="password" autocomplete="current-password" autofocus placeholder="Token" />
      <button type="submit">Sign in</button>
      <p data-error></p>
    </form>
    <script>
      const form = document.querySelector("[data-login-form]");
      const error = document.querySelector("[data-error]");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const response = await fetch("/__auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: new FormData(form).get("token") }),
        });
        if (response.ok) {
          location.href = ${JSON.stringify(next)};
        } else {
          error.textContent = "Invalid token";
        }
      });
    </script>
  </body>
</html>`;
}
function safeAuthNextPath(next) {
    if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
        return "/";
    }
    return next;
}
function singleHeaderValue(value) {
    if (Array.isArray(value)) {
        return value.length === 1 ? value[0] : null;
    }
    return value ?? null;
}
async function main(args) {
    const options = parseServerArgs(args);
    await startIpcBridgeServer(options);
}
if (require.main === module) {
    void main(process.argv.slice(2));
}
function createTerminalHtml({ backendWebSocketToken, cwd: requestedCwd, locale: requestedLocale, stylesheetHrefs, }) {
    const cwd = escapeHtml(requestedCwd ?? (0, terminal_1.defaultTerminalCwd)());
    const locale = terminalHtmlLocale(requestedLocale);
    const title = terminalHtmlTitle(locale);
    const token = escapeHtml(backendWebSocketToken);
    const stylesheetLinks = stylesheetHrefs
        .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
        .join("\n");
    return `<!doctype html>
<html lang="${locale}" data-codex-window-type="browser">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
${stylesheetLinks}
    <script type="module" src="/assets/terminal-page.js"></script>
  </head>
  <body data-terminal-cwd="${cwd}" data-terminal-locale="${locale}" data-backend-websocket-token="${token}">
    <div id="terminal-root"></div>
  </body>
</html>`;
}
function terminalHtmlLocale(locale) {
    const normalized = locale?.trim().replaceAll("_", "-").toLowerCase();
    return normalized === "zh" || normalized?.startsWith("zh-") ? "zh-CN" : "en";
}
function terminalHtmlTitle(locale) {
    return locale === "zh-CN" ? "终端" : "Terminal";
}
async function sendWebviewIndex(reply, webviewRoot, backendWebSocketToken) {
    const indexHtml = await promises_1.default.readFile(node_path_1.default.join(webviewRoot, "index.html"), "utf8");
    return reply
        .type("text/html")
        .send(injectWebviewRuntimeScripts(indexHtml, backendWebSocketToken));
}
function injectWebviewRuntimeScripts(html, backendWebSocketToken) {
    const scripts = `<script>${statsigOverrideBootstrapScript()}</script><script>window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__=${JSON.stringify(backendWebSocketToken)};</script>`;
    return html.includes("<head>")
        ? html.replace("<head>", `<head>${scripts}`)
        : `${scripts}${html}`;
}
function statsigOverrideBootstrapScript() {
    return `(() => {
  const shim = (window.__ELECTRON_SHIM__ ??= {});
  shim.overrideAdapter = {
    getGateOverride(evaluation) {
      if (evaluation?.name === "3075919032") {
        return { ...evaluation, value: true };
      }
      if (evaluation?.name === "2929582856") {
        return { ...evaluation, value: false };
      }
      return null;
    },
    getDynamicConfigOverride(config) {
      if (config?.name !== "72216192") {
        return null;
      }
      const originalValue =
        config.value && typeof config.value === "object" ? config.value : {};
      const value = {
        ...originalValue,
        enable_i18n: true,
        locale_source: originalValue.locale_source ?? "IDE",
      };
      return {
        ...config,
        value,
        get(key, fallback) {
          const configValue = value[key];
          return configValue == null ? (fallback ?? null) : configValue;
        },
      };
    },
    getLayerOverride(layer) {
      if (layer?.name !== "72216192") {
        return null;
      }
      const originalValue =
        layer.__value && typeof layer.__value === "object" ? layer.__value : {};
      const value = {
        ...originalValue,
        enable_i18n: true,
        locale_source: originalValue.locale_source ?? "IDE",
      };
      return {
        ...layer,
        __value: value,
        get(key, fallback) {
          const configValue = value[key];
          return configValue == null ? (fallback ?? null) : configValue;
        },
      };
    },
  };
})();`;
}
function getTerminalStylesheetHrefs(webviewRoot) {
    const assetsRoot = node_path_1.default.join(webviewRoot, "assets");
    try {
        return (0, terminal_1.terminalStylesheetHrefs)(node_fs_1.default.readdirSync(assetsRoot));
    }
    catch {
        return (0, terminal_1.terminalStylesheetHrefs)([]);
    }
}
function getTerminalCwdFromQuery(query) {
    if (typeof query === "object" &&
        query !== null &&
        "cwd" in query &&
        typeof query.cwd === "string" &&
        query.cwd.trim()) {
        return query.cwd;
    }
    return undefined;
}
function getTerminalLocaleFromQuery(query) {
    if (typeof query === "object" &&
        query !== null &&
        "locale" in query &&
        typeof query.locale === "string" &&
        query.locale.trim()) {
        return query.locale;
    }
    return undefined;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
//# sourceMappingURL=main.js.map