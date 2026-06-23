"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTerminalClientMessage = parseTerminalClientMessage;
exports.resolveTerminalCwd = resolveTerminalCwd;
exports.createTerminalSocketHandler = createTerminalSocketHandler;
exports.createNodePtyTerminalSessionFactory = createNodePtyTerminalSessionFactory;
exports.createRemoteTerminalSessionFactory = createRemoteTerminalSessionFactory;
exports.createCommandExecRemoteProcessConnection = createCommandExecRemoteProcessConnection;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const node_string_decoder_1 = require("node:string_decoder");
const pty = __importStar(require("node-pty"));
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERMINAL_TYPE = "xterm-256color";
const TERMINAL_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
class TerminalMessageError extends Error {
    messageKey;
    messageValues;
    constructor(message, messageKey, messageValues = {}) {
        super(message);
        this.messageKey = messageKey;
        this.messageValues = messageValues;
        this.name = "TerminalMessageError";
    }
}
function parseTerminalClientMessage(value) {
    if (!isRecord(value) || typeof value.type !== "string") {
        throw new TerminalMessageError("Unknown terminal message type", "error.unknownMessageType");
    }
    if (value.type === "create") {
        if ("cwd" in value &&
            value.cwd !== undefined &&
            typeof value.cwd !== "string") {
            throw new TerminalMessageError("Invalid terminal create message", "error.invalidCreateMessage");
        }
        if ("cols" in value &&
            value.cols !== undefined &&
            !isPositiveInteger(value.cols)) {
            throw new TerminalMessageError("Invalid terminal create message", "error.invalidCreateMessage");
        }
        if ("rows" in value &&
            value.rows !== undefined &&
            !isPositiveInteger(value.rows)) {
            throw new TerminalMessageError("Invalid terminal create message", "error.invalidCreateMessage");
        }
        if ("terminalType" in value &&
            value.terminalType !== undefined &&
            !isTerminalType(value.terminalType)) {
            throw new TerminalMessageError("Invalid terminal create message", "error.invalidCreateMessage");
        }
        return {
            type: "create",
            ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
            ...(isPositiveInteger(value.cols) ? { cols: value.cols } : {}),
            ...(isPositiveInteger(value.rows) ? { rows: value.rows } : {}),
            ...(isTerminalType(value.terminalType)
                ? { terminalType: value.terminalType.trim() }
                : {}),
        };
    }
    if (value.type === "input") {
        if (typeof value.data !== "string") {
            throw new TerminalMessageError("Invalid terminal input message", "error.invalidInputMessage");
        }
        return {
            type: "input",
            data: value.data,
        };
    }
    if (value.type === "resize") {
        if (!isPositiveInteger(value.cols) || !isPositiveInteger(value.rows)) {
            throw new TerminalMessageError("Invalid terminal resize message", "error.invalidResizeMessage");
        }
        return {
            type: "resize",
            cols: value.cols,
            rows: value.rows,
        };
    }
    if (value.type === "close") {
        return {
            type: "close",
        };
    }
    throw new TerminalMessageError("Unknown terminal message type", "error.unknownMessageType");
}
function resolveTerminalCwd(requestedCwd) {
    const trimmed = requestedCwd?.trim();
    if (!trimmed) {
        return process.cwd();
    }
    const resolved = node_path_1.default.resolve(trimmed);
    let stat;
    try {
        stat = node_fs_1.default.statSync(resolved);
    }
    catch {
        throw new TerminalMessageError(`Terminal cwd is not a directory: ${trimmed}`, "error.cwdNotDirectory", { cwd: trimmed });
    }
    if (!stat.isDirectory()) {
        throw new TerminalMessageError(`Terminal cwd is not a directory: ${trimmed}`, "error.cwdNotDirectory", { cwd: trimmed });
    }
    return resolved;
}
function createTerminalSocketHandler(factory, { resolveCwd = resolveTerminalCwd, } = {}) {
    return (socket) => {
        let session = null;
        const send = (message) => {
            if (socket.readyState === 1) {
                socket.send(JSON.stringify(message));
            }
        };
        const closeSession = () => {
            if (!session) {
                return;
            }
            const closingSession = session;
            session = null;
            closingSession.close();
        };
        socket.on("message", (rawData) => {
            let message;
            try {
                message = parseTerminalClientMessage(JSON.parse(Buffer.isBuffer(rawData)
                    ? rawData.toString("utf8")
                    : String(rawData)));
            }
            catch (error) {
                send(terminalErrorMessage(error));
                return;
            }
            try {
                if (message.type === "create") {
                    closeSession();
                    const createdSession = factory.createSession({
                        cwd: resolveCwd(message.cwd),
                        cols: message.cols ?? DEFAULT_COLS,
                        rows: message.rows ?? DEFAULT_ROWS,
                        terminalType: message.terminalType ?? DEFAULT_TERMINAL_TYPE,
                    });
                    session = createdSession;
                    send({ type: "created", sessionId: session.id });
                    createdSession.onData((data) => {
                        send({ type: "output", data });
                    });
                    createdSession.onExit((event) => {
                        send({
                            type: "exit",
                            exitCode: event.exitCode,
                            signal: event.signal ?? null,
                        });
                        if (session === createdSession) {
                            session = null;
                        }
                    });
                    return;
                }
                if (message.type === "input") {
                    session?.write(message.data);
                    return;
                }
                if (message.type === "resize") {
                    session?.resize(message.cols, message.rows);
                    return;
                }
                closeSession();
            }
            catch (error) {
                send(terminalErrorMessage(error));
            }
        });
        socket.on("close", closeSession);
    };
}
function createNodePtyTerminalSessionFactory() {
    return {
        createSession(options) {
            const id = (0, node_crypto_1.randomUUID)();
            const shell = process.env.SHELL ||
                (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
            const subprocess = pty.spawn(shell, [], {
                cols: options.cols,
                rows: options.rows,
                cwd: options.cwd,
                env: {
                    ...process.env,
                    CODEX_SHELL: "1",
                    TERM: options.terminalType,
                    COLORTERM: "truecolor",
                },
                name: options.terminalType,
            });
            return {
                id,
                close() {
                    subprocess.kill();
                },
                onData(listener) {
                    subprocess.onData(listener);
                },
                onExit(listener) {
                    subprocess.onExit((event) => {
                        listener({
                            exitCode: event.exitCode,
                            signal: event.signal,
                        });
                    });
                },
                resize(cols, rows) {
                    subprocess.resize(cols, rows);
                },
                write(data) {
                    subprocess.write(data);
                },
            };
        },
    };
}
function createRemoteTerminalSessionFactory(connection) {
    return {
        createSession(options) {
            const id = (0, node_crypto_1.randomUUID)();
            const dataListeners = new Set();
            const exitListeners = new Set();
            const decoder = new node_string_decoder_1.StringDecoder("utf8");
            let closed = false;
            let pending = Promise.resolve();
            const cleanup = () => {
                dataListeners.clear();
                exitListeners.clear();
            };
            const emitData = (delta) => {
                if (closed) {
                    return;
                }
                const data = decoder.write(delta.chunk);
                if (!data) {
                    return;
                }
                for (const listener of dataListeners) {
                    listener(data);
                }
            };
            const processSession = connection.startProcess({
                processHandle: id,
                command: remoteLoginShellCommand(),
                tty: true,
                size: { cols: options.cols, rows: options.rows },
                streamStdoutStderr: true,
                outputBytesCap: null,
                timeoutMs: null,
                cwd: options.cwd,
                env: remoteTerminalEnv(options.terminalType),
                onStdoutDelta: emitData,
                onStderrDelta: emitData,
            });
            processSession
                .then((session) => session.response)
                .then((event) => {
                if (closed) {
                    return;
                }
                const tail = decoder.end();
                if (tail) {
                    for (const listener of dataListeners) {
                        listener(tail);
                    }
                }
                for (const listener of exitListeners) {
                    listener({ exitCode: event.exitCode, signal: null });
                }
                cleanup();
            }, () => {
                if (closed) {
                    return;
                }
                for (const listener of exitListeners) {
                    listener({ exitCode: null, signal: null });
                }
                cleanup();
            });
            const enqueue = (action) => {
                if (closed) {
                    return;
                }
                pending = pending
                    .then(async () => {
                    await action(await processSession);
                })
                    .catch(() => { });
            };
            return {
                id,
                close() {
                    closed = true;
                    cleanup();
                    pending = pending
                        .then(async () => {
                        await (await processSession).terminate();
                    })
                        .catch(() => { });
                },
                onData(listener) {
                    if (!closed) {
                        dataListeners.add(listener);
                    }
                },
                onExit(listener) {
                    if (!closed) {
                        exitListeners.add(listener);
                    }
                },
                resize(cols, rows) {
                    enqueue((session) => session.resize({ cols, rows }));
                },
                write(data) {
                    enqueue((session) => session.write(Buffer.from(data, "utf8")));
                },
            };
        },
    };
}
function createCommandExecRemoteProcessConnection(client) {
    return {
        async startProcess(options) {
            const processId = options.processHandle;
            let cleaned = false;
            const offNotification = client.onNotification((notification) => {
                if (notification.method !== "command/exec/outputDelta") {
                    return;
                }
                const params = asCommandExecOutputDelta(notification.params);
                if (!params || params.processId !== processId) {
                    return;
                }
                const delta = {
                    chunk: Buffer.from(params.deltaBase64, "base64"),
                    capReached: params.capReached,
                };
                if (params.stream === "stderr") {
                    options.onStderrDelta(delta);
                }
                else {
                    options.onStdoutDelta(delta);
                }
            });
            const cleanup = () => {
                if (cleaned) {
                    return;
                }
                cleaned = true;
                offNotification();
            };
            const response = client
                .rpc("command/exec", {
                command: options.command,
                cwd: options.cwd,
                disableOutputCap: options.outputBytesCap === null,
                disableTimeout: options.timeoutMs === null,
                env: options.env,
                processId,
                size: options.size,
                streamStdin: true,
                streamStdoutStderr: options.streamStdoutStderr,
                tty: options.tty,
            }, { timeoutMs: null })
                .finally(cleanup)
                .then((result) => ({
                exitCode: commandExecExitCode(result),
            }));
            return {
                response,
                resize(size) {
                    return client.rpc("command/exec/resize", { processId, size });
                },
                terminate() {
                    cleanup();
                    return client.rpc("command/exec/terminate", { processId });
                },
                write(data, writeOptions) {
                    return client.rpc("command/exec/write", {
                        processId,
                        deltaBase64: data.toString("base64"),
                        closeStdin: writeOptions?.closeStdin ?? false,
                    });
                },
            };
        },
    };
}
function remoteLoginShellCommand() {
    return [
        "sh",
        "-c",
        [
            'login_shell="${SHELL:-}"',
            'if [ -z "$login_shell" ] && command -v getent >/dev/null 2>&1; then login_shell="$(getent passwd "$(id -un)" | cut -d: -f7 || true)"; fi',
            'if [ -z "$login_shell" ] || [ ! -x "$login_shell" ]; then login_shell="/bin/bash"; fi',
            'exec "$login_shell" -il',
        ].join("\n"),
    ];
}
function remoteTerminalEnv(terminalType) {
    return {
        TERM: terminalType,
        TERMINFO: null,
        TERMINFO_DIRS: null,
    };
}
function asCommandExecOutputDelta(value) {
    if (!isRecord(value)) {
        return null;
    }
    if (typeof value.processId !== "string" ||
        typeof value.deltaBase64 !== "string" ||
        typeof value.capReached !== "boolean") {
        return null;
    }
    if (value.stream !== "stdout" && value.stream !== "stderr") {
        return null;
    }
    return {
        capReached: value.capReached,
        deltaBase64: value.deltaBase64,
        processId: value.processId,
        stream: value.stream,
    };
}
function commandExecExitCode(result) {
    if (!isRecord(result) || typeof result.exitCode !== "number") {
        return null;
    }
    return result.exitCode;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0;
}
function isTerminalType(value) {
    return typeof value === "string" && TERMINAL_TYPE_PATTERN.test(value.trim());
}
function errorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function terminalErrorMessage(error) {
    const message = errorMessage(error);
    if (error instanceof TerminalMessageError) {
        return {
            type: "error",
            message,
            messageKey: error.messageKey,
            messageValues: error.messageValues,
        };
    }
    return { type: "error", message };
}
//# sourceMappingURL=terminal.js.map