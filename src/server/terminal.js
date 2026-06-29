"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTerminalCwd = resolveTerminalCwd;
exports.createRemoteTerminalSessionFactory = createRemoteTerminalSessionFactory;
exports.createCommandExecRemoteProcessConnection = createCommandExecRemoteProcessConnection;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const node_string_decoder_1 = require("node:string_decoder");
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
        throw new Error(`Terminal cwd is not a directory: ${trimmed}`);
    }
    if (!stat.isDirectory()) {
        throw new Error(`Terminal cwd is not a directory: ${trimmed}`);
    }
    return resolved;
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
//# sourceMappingURL=terminal.js.map