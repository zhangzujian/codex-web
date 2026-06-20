#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedBackendWebSocketRequest = isAllowedBackendWebSocketRequest;
exports.shouldBlockFsRequestPath = shouldBlockFsRequestPath;
exports.shouldServeWebviewShellPath = shouldServeWebviewShellPath;
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
        "  server [--host <host>] [--port <port>]",
        "",
        "Defaults:",
        "  --host 127.0.0.1",
        "  --port 8214",
        "",
        "Examples:",
        "  yarn server",
        "  yarn server --port 9000",
    ].join("\n"));
}
function parsePort(raw) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port: ${raw}`);
    }
    return parsed;
}
function parseServerArgs(args) {
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
        },
        strict: true,
    });
    if (parsed.values.help) {
        printUsage();
        process.exit(0);
    }
    return {
        host: parsed.values.host ?? "127.0.0.1",
        port: parsed.values.port ? parsePort(parsed.values.port) : 8214,
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
    const app = (0, fastify_1.default)({ logger: false });
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
    app.addHook("onRequest", async (request, reply) => {
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
    console.log(`IPC bridge listening at ws://${options.host}:${options.port}`);
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
function createTerminalHtml({ backendWebSocketToken, cwd: requestedCwd, stylesheetHrefs, }) {
    const cwd = escapeHtml(requestedCwd ?? (0, terminal_1.defaultTerminalCwd)());
    const token = escapeHtml(backendWebSocketToken);
    const stylesheetLinks = stylesheetHrefs
        .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
        .join("\n");
    return `<!doctype html>
<html lang="en" data-codex-window-type="browser">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Terminal</title>
${stylesheetLinks}
    <script type="module" src="/assets/terminal-page.js"></script>
  </head>
  <body data-terminal-cwd="${cwd}" data-backend-websocket-token="${token}">
    <div id="terminal-root"></div>
  </body>
</html>`;
}
async function sendWebviewIndex(reply, webviewRoot, backendWebSocketToken) {
    const indexHtml = await promises_1.default.readFile(node_path_1.default.join(webviewRoot, "index.html"), "utf8");
    return reply
        .type("text/html")
        .send(injectBackendWebSocketToken(indexHtml, backendWebSocketToken));
}
function injectBackendWebSocketToken(html, token) {
    const script = `<script>window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__=${JSON.stringify(token)};</script>`;
    return html.includes("</head>")
        ? html.replace("</head>", `${script}</head>`)
        : `${script}${html}`;
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
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
//# sourceMappingURL=main.js.map