import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { RawData, WebSocket } from "ws";
import * as pty from "node-pty";

export type TerminalClientMessage =
  | {
      type: "create";
      cwd?: string;
      cols?: number;
      rows?: number;
      terminalType?: string;
    }
  | {
      type: "input";
      data: string;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    }
  | {
      type: "close";
    };

export type TerminalServerMessage =
  | {
      type: "created";
      sessionId: string;
    }
  | {
      type: "output";
      data: string;
    }
  | {
      type: "exit";
      exitCode: number | null;
      signal: number | null;
    }
  | {
      type: "error";
      message: string;
    };

export type TerminalSession = {
  id: string;
  close: () => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (
    listener: (event: {
      exitCode: number | null;
      signal?: number | null;
    }) => void,
  ) => void;
  resize: (cols: number, rows: number) => void;
  write: (data: string) => void;
};

export type TerminalSessionOptions = {
  cols: number;
  cwd: string;
  rows: number;
  terminalType: string;
};

export type TerminalSessionFactory = {
  createSession: (options: TerminalSessionOptions) => TerminalSession;
};

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERMINAL_TYPE = "xterm-256color";
const TERMINAL_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function parseTerminalClientMessage(
  value: unknown,
): TerminalClientMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Unknown terminal message type");
  }

  if (value.type === "create") {
    if (
      "cwd" in value &&
      value.cwd !== undefined &&
      typeof value.cwd !== "string"
    ) {
      throw new Error("Invalid terminal create message");
    }
    if (
      "cols" in value &&
      value.cols !== undefined &&
      !isPositiveInteger(value.cols)
    ) {
      throw new Error("Invalid terminal create message");
    }
    if (
      "rows" in value &&
      value.rows !== undefined &&
      !isPositiveInteger(value.rows)
    ) {
      throw new Error("Invalid terminal create message");
    }
    if (
      "terminalType" in value &&
      value.terminalType !== undefined &&
      !isTerminalType(value.terminalType)
    ) {
      throw new Error("Invalid terminal create message");
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
      throw new Error("Invalid terminal input message");
    }
    return {
      type: "input",
      data: value.data,
    };
  }

  if (value.type === "resize") {
    if (!isPositiveInteger(value.cols) || !isPositiveInteger(value.rows)) {
      throw new Error("Invalid terminal resize message");
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

  throw new Error("Unknown terminal message type");
}

export function resolveTerminalCwd(requestedCwd: string | undefined): string {
  const trimmed = requestedCwd?.trim();
  if (!trimmed) {
    return process.cwd();
  }

  const resolved = path.resolve(trimmed);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Terminal cwd is not a directory: ${trimmed}`);
  }
  return resolved;
}

export function createTerminalSocketHandler(
  factory: TerminalSessionFactory,
): (socket: Pick<WebSocket, "on" | "send" | "close" | "readyState">) => void {
  return (socket) => {
    let session: TerminalSession | null = null;

    const send = (message: TerminalServerMessage): void => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    };

    const closeSession = (): void => {
      if (!session) {
        return;
      }
      const closingSession = session;
      session = null;
      closingSession.close();
    };

    socket.on("message", (rawData: RawData) => {
      let message: TerminalClientMessage;
      try {
        message = parseTerminalClientMessage(
          JSON.parse(
            Buffer.isBuffer(rawData)
              ? rawData.toString("utf8")
              : String(rawData),
          ),
        );
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
        return;
      }

      try {
        if (message.type === "create") {
          closeSession();
          const createdSession = factory.createSession({
            cwd: resolveTerminalCwd(message.cwd),
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
      } catch (error) {
        send({ type: "error", message: errorMessage(error) });
      }
    });

    socket.on("close", closeSession);
  };
}

export function createNodePtyTerminalSessionFactory(): TerminalSessionFactory {
  return {
    createSession(options) {
      const id = randomUUID();
      const shell =
        process.env.SHELL ||
        (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
      const subprocess = pty.spawn(shell, [], {
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: {
          ...process.env,
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

export function defaultTerminalCwd(): string {
  return os.homedir();
}

export function terminalStylesheetHrefs(assetFiles: string[]): string[] {
  const terminalStylesheet = "terminal-page.css";
  const appStylesheets = assetFiles
    .filter((file) =>
      /^app(?:-[A-Za-z0-9_]+|-main-[A-Za-z0-9_]+|-shell-[A-Za-z0-9_]+)\.css$/.test(
        file,
      ),
    )
    .sort(compareAppStylesheets);
  const terminalStylesheets = assetFiles.includes(terminalStylesheet)
    ? [terminalStylesheet]
    : [];
  return [...appStylesheets, ...terminalStylesheets].map(
    (file) => `/assets/${file}`,
  );
}

function compareAppStylesheets(left: string, right: string): number {
  return (
    appStylesheetRank(left) - appStylesheetRank(right) ||
    left.localeCompare(right)
  );
}

function appStylesheetRank(file: string): number {
  if (/^app-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 0;
  }
  if (/^app-main-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 1;
  }
  if (/^app-shell-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 2;
  }
  return 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isTerminalType(value: unknown): value is string {
  return typeof value === "string" && TERMINAL_TYPE_PATTERN.test(value.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
