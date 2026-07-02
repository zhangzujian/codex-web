import type { TerminalSession, TerminalSessionFactory } from "./terminal";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERMINAL_TYPE = "xterm-256color";

type TerminalEvent =
  | {
      type: "terminal-attached";
      sessionId: string;
      cwd: string;
      shell: string;
    }
  | {
      type: "terminal-data";
      sessionId: string;
      data: string;
    }
  | {
      type: "terminal-exit";
      sessionId: string;
      code: number | null;
      signal: number | null;
    }
  | {
      type: "terminal-error";
      sessionId: string;
      message: string;
    };

type TerminalIpcOptions = {
  resolveCwd?: (requestedCwd: string | undefined) => string;
  respond: (message: TerminalEvent) => void;
};

type ManagedTerminalSession = {
  cwd: string;
  session: TerminalSession;
};

export function createTerminalIpcMessageHandler(
  factory: TerminalSessionFactory,
  { resolveCwd = (cwd) => cwd?.trim() || process.cwd(), respond }: TerminalIpcOptions,
): (message: unknown) => boolean {
  const sessions = new Map<string, ManagedTerminalSession>();

  const closeSession = (sessionId: string): void => {
    const managed = sessions.get(sessionId);
    if (!managed) {
      return;
    }
    sessions.delete(sessionId);
    managed.session.close();
  };

  const createSession = (message: Record<string, unknown>): void => {
    const sessionId = stringValue(message.sessionId);
    if (!sessionId) {
      return;
    }

    closeSession(sessionId);

    try {
      const cwd = resolveCwd(stringValue(message.cwd));
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
    } catch (error) {
      respond({
        type: "terminal-error",
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const attachSession = (message: Record<string, unknown>): void => {
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

  return (message): boolean => {
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
        try {
          const cwd = stringValue(message.cwd);
          const resolvedCwd = cwd ? resolveCwd(cwd) : managed.cwd;
          const cdPrefix =
            resolvedCwd === managed.cwd
              ? ""
              : `cd -- ${shellQuote(resolvedCwd)}\r`;
          managed.cwd = resolvedCwd;
          managed.session.write(`${cdPrefix}${command}\r`);
        } catch (error) {
          respond({
            type: "terminal-error",
            sessionId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return true;
    }

    return false;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
