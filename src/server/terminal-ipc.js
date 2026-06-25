"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTerminalIpcMessageHandler = createTerminalIpcMessageHandler;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERMINAL_TYPE = "xterm-256color";
function createTerminalIpcMessageHandler(factory, { resolveCwd = (cwd) => cwd?.trim() || process.cwd(), respond }) {
    const sessions = new Map();
    const closeSession = (sessionId) => {
        const managed = sessions.get(sessionId);
        if (!managed) {
            return;
        }
        sessions.delete(sessionId);
        managed.session.close();
    };
    const createSession = (message) => {
        const sessionId = stringValue(message.sessionId);
        if (!sessionId) {
            return;
        }
        closeSession(sessionId);
        const cwd = resolveCwd(stringValue(message.cwd));
        try {
            const session = factory.createSession({
                cols: positiveInteger(message.cols) ?? DEFAULT_COLS,
                cwd,
                rows: positiveInteger(message.rows) ?? DEFAULT_ROWS,
                terminalType: stringValue(message.terminalType) ?? DEFAULT_TERMINAL_TYPE,
            });
            sessions.set(sessionId, { cwd, session });
            session.onData((data) => {
                respond({ type: "terminal-data", sessionId, data });
            });
            session.onExit((event) => {
                sessions.delete(sessionId);
                respond({
                    type: "terminal-exit",
                    sessionId,
                    code: event.exitCode,
                    signal: event.signal ?? null,
                });
            });
            respond({
                type: "terminal-attached",
                sessionId,
                cwd,
                shell: process.env.SHELL || "unknown",
            });
        }
        catch (error) {
            respond({
                type: "terminal-error",
                sessionId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
    const attachSession = (message) => {
        const sessionId = stringValue(message.sessionId);
        if (!sessionId) {
            return;
        }
        const managed = sessions.get(sessionId);
        if (!managed) {
            createSession(message);
            return;
        }
        respond({
            type: "terminal-attached",
            sessionId,
            cwd: managed.cwd,
            shell: process.env.SHELL || "unknown",
        });
    };
    return (message) => {
        if (!isRecord(message) || typeof message.type !== "string") {
            return false;
        }
        if (message.type === "terminal-create") {
            createSession(message);
            return true;
        }
        if (message.type === "terminal-attach") {
            attachSession(message);
            return true;
        }
        const sessionId = stringValue(message.sessionId);
        if (!sessionId) {
            return false;
        }
        const managed = sessions.get(sessionId);
        if (message.type === "terminal-close") {
            closeSession(sessionId);
            return true;
        }
        if (message.type === "terminal-resize") {
            const cols = positiveInteger(message.cols);
            const rows = positiveInteger(message.rows);
            if (managed && cols && rows) {
                managed.session.resize(cols, rows);
            }
            return true;
        }
        if (message.type === "terminal-write") {
            const data = stringValue(message.data);
            if (managed && data != null) {
                managed.session.write(data);
            }
            return true;
        }
        if (message.type === "terminal-run-action") {
            const command = stringValue(message.command);
            if (managed && command) {
                managed.session.write(`${command}\r`);
            }
            return true;
        }
        return false;
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
    return typeof value === "string" ? value : undefined;
}
function positiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}
//# sourceMappingURL=terminal-ipc.js.map