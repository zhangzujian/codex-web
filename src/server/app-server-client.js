"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCodexAppServerClient = createCodexAppServerClient;
exports.createAppServerJsonRpcClient = createAppServerJsonRpcClient;
const node_child_process_1 = require("node:child_process");
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
function createCodexAppServerClient(env = process.env, requestHandler) {
    return createAppServerJsonRpcClient({
        args: ["app-server"],
        command: env.CODEX_CLI_PATH?.trim() || "codex",
        env,
        requestHandler,
    });
}
function createAppServerJsonRpcClient({ args, command, env = process.env, requestHandler, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, }) {
    let initialized = false;
    let initializing = null;
    let nextId = 1;
    let processHandle = null;
    let readBuffer = "";
    const listeners = new Set();
    const pending = new Map();
    const failPending = (error) => {
        for (const [id, request] of pending) {
            if (request.timeout) {
                clearTimeout(request.timeout);
            }
            pending.delete(id);
            request.reject(error);
        }
    };
    const start = () => {
        if (processHandle) {
            return processHandle;
        }
        const subprocess = (0, node_child_process_1.spawn)(command, args, {
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });
        processHandle = subprocess;
        subprocess.stdout.setEncoding("utf8");
        subprocess.stdout.on("data", (chunk) => {
            readBuffer += chunk;
            let lineEnd = readBuffer.indexOf("\n");
            while (lineEnd !== -1) {
                const line = readBuffer.slice(0, lineEnd).trim();
                readBuffer = readBuffer.slice(lineEnd + 1);
                if (line) {
                    handleLine(line);
                }
                lineEnd = readBuffer.indexOf("\n");
            }
        });
        subprocess.stderr.resume();
        subprocess.on("error", (error) => {
            if (processHandle !== subprocess) {
                return;
            }
            failPending(error);
        });
        subprocess.on("exit", () => {
            if (processHandle !== subprocess) {
                return;
            }
            processHandle = null;
            initialized = false;
            initializing = null;
            readBuffer = "";
            failPending(new Error("codex app-server exited"));
        });
        return subprocess;
    };
    const sendLine = (payload) => {
        start().stdin.write(`${JSON.stringify(payload)}\n`);
    };
    const call = (method, params, options = {}) => {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timeoutMs = "timeoutMs" in options ? options.timeoutMs : requestTimeoutMs;
            const timeout = timeoutMs === null
                ? null
                : setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`codex app-server request timed out: ${method}`));
                }, timeoutMs);
            pending.set(id, { reject, resolve, timeout });
            sendLine({ jsonrpc: "2.0", id, method, params });
        });
    };
    const ensureInitialized = async () => {
        if (initialized) {
            return;
        }
        if (initializing) {
            await initializing;
            return;
        }
        initializing = call("initialize", {
            capabilities: { experimentalApi: true },
            clientInfo: { name: "codex-web", version: "0.1.0" },
        })
            .then(() => {
            sendLine({ jsonrpc: "2.0", method: "initialized" });
            initialized = true;
        })
            .finally(() => {
            initializing = null;
        });
        await initializing;
    };
    const handleLine = (line) => {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return;
        }
        if (!isRecord(message)) {
            return;
        }
        if (typeof message.id === "number" && pending.has(message.id)) {
            const request = pending.get(message.id);
            pending.delete(message.id);
            if (!request) {
                return;
            }
            if (request.timeout) {
                clearTimeout(request.timeout);
            }
            const error = isRecord(message.error) ? message.error : null;
            if (error) {
                request.reject(new Error(String(error.message ?? "app-server error")));
            }
            else {
                request.resolve(message.result);
            }
            return;
        }
        if ((typeof message.id === "number" || typeof message.id === "string") &&
            typeof message.method === "string") {
            void handleServerRequest({
                id: message.id,
                method: message.method,
                params: message.params,
            });
            return;
        }
        if (typeof message.method === "string" && !("id" in message)) {
            for (const listener of listeners) {
                listener({ method: message.method, params: message.params });
            }
        }
    };
    const handleServerRequest = async (request) => {
        if (requestHandler == null) {
            sendLine({
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32601,
                    message: `Unhandled app-server request: ${request.method}`,
                },
            });
            return;
        }
        try {
            sendLine({
                jsonrpc: "2.0",
                id: request.id,
                result: await requestHandler(request),
            });
        }
        catch (error) {
            sendLine({
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    };
    return {
        dispose() {
            const subprocess = processHandle;
            processHandle = null;
            initialized = false;
            initializing = null;
            readBuffer = "";
            failPending(new Error("codex app-server stopped"));
            listeners.clear();
            subprocess?.stdin.end();
            subprocess?.kill();
        },
        onNotification(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        async rpc(method, params, options) {
            await ensureInitialized();
            return await call(method, params, options);
        },
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=app-server-client.js.map