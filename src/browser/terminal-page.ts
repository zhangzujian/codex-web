import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  resolveTerminalFontFamily,
  resolveTerminalFontSize,
} from "./terminal-options.mjs";
import "./terminal-page.css";

type TerminalServerMessage =
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

const root = document.getElementById("terminal-root");

if (!root) {
  throw new Error("Missing terminal root element");
}

const page = document.createElement("div");
page.className = "terminal-page";

const surface = document.createElement("div");
surface.className = "terminal-page__surface";
surface.dataset.codexTerminal = "true";

const status = document.createElement("div");
status.className = "terminal-page__status";
status.textContent = "Connecting...";

page.append(surface, status);
root.append(page);

const computedStyle = getComputedStyle(document.documentElement);

function cssColor(name: string, fallback: string): string {
  return computedStyle.getPropertyValue(name).trim() || fallback;
}

const terminal = new Terminal({
  allowProposedApi: false,
  cursorBlink: true,
  convertEol: true,
  fontFamily: resolveTerminalFontFamily(),
  fontSize: resolveTerminalFontSize(),
  lineHeight: 1.2,
  scrollback: 10_000,
  theme: {
    background: cssColor(
      "--vscode-terminal-background",
      cssColor("--color-token-editor-background", "#0c0d0e"),
    ),
    foreground: cssColor(
      "--vscode-terminal-foreground",
      cssColor("--color-token-editor-foreground", "#f3f4f6"),
    ),
    cursor: cssColor(
      "--vscode-terminal-cursor-foreground",
      cssColor("--color-token-editor-foreground", "#f3f4f6"),
    ),
    selectionBackground: cssColor(
      "--vscode-terminal-selectionBackground",
      cssColor("--color-token-editor-selection-background", "#3b82f680"),
    ),
    black: cssColor("--vscode-terminal-ansiBlack", "#0c0d0e"),
    blue: cssColor("--vscode-terminal-ansiBlue", "#339cff"),
    brightBlack: cssColor("--vscode-terminal-ansiBrightBlack", "#6b7280"),
    brightBlue: cssColor("--vscode-terminal-ansiBrightBlue", "#60a5fa"),
    brightCyan: cssColor("--vscode-terminal-ansiBrightCyan", "#67e8f9"),
    brightGreen: cssColor("--vscode-terminal-ansiBrightGreen", "#34d399"),
    brightMagenta: cssColor("--vscode-terminal-ansiBrightMagenta", "#c084fc"),
    brightRed: cssColor("--vscode-terminal-ansiBrightRed", "#f87171"),
    brightWhite: cssColor("--vscode-terminal-ansiBrightWhite", "#f9fafb"),
    brightYellow: cssColor("--vscode-terminal-ansiBrightYellow", "#facc15"),
    cyan: cssColor("--vscode-terminal-ansiCyan", "#22d3ee"),
    green: cssColor("--vscode-terminal-ansiGreen", "#22c55e"),
    magenta: cssColor("--vscode-terminal-ansiMagenta", "#a855f7"),
    red: cssColor("--vscode-terminal-ansiRed", "#ef4444"),
    white: cssColor("--vscode-terminal-ansiWhite", "#d1d5db"),
    yellow: cssColor("--vscode-terminal-ansiYellow", "#eab308"),
  },
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(surface);

let socket: WebSocket | null = null;
let created = false;

function terminalCwd(): string {
  return document.body.dataset.terminalCwd ?? "";
}

function setStatus(message: string): void {
  status.textContent = message;
}

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/__backend/terminal`;
}

function send(message: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function fitAndResize(): void {
  fitAddon.fit();
  if (created) {
    send({
      type: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    });
  }
}

function connect(): void {
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    fitAddon.fit();
    send({
      type: "create",
      cwd: terminalCwd(),
      cols: terminal.cols,
      rows: terminal.rows,
    });
  });

  socket.addEventListener("message", (event) => {
    let message: TerminalServerMessage;
    try {
      message = JSON.parse(String(event.data)) as TerminalServerMessage;
    } catch {
      return;
    }

    if (message.type === "created") {
      created = true;
      setStatus("Connected");
      terminal.focus();
      return;
    }

    if (message.type === "output") {
      terminal.write(message.data);
      return;
    }

    if (message.type === "exit") {
      created = false;
      setStatus(`Exited (${message.exitCode ?? message.signal ?? "unknown"})`);
      return;
    }

    setStatus(message.message);
    terminal.writeln(`\r\n${message.message}`);
  });

  socket.addEventListener("close", () => {
    created = false;
    setStatus("Disconnected");
  });

  socket.addEventListener("error", () => {
    setStatus("Connection error");
  });
}

terminal.onData((data) => {
  send({ type: "input", data });
});

const resizeObserver = new ResizeObserver(() => {
  fitAndResize();
});
resizeObserver.observe(surface);
window.addEventListener("resize", fitAndResize);

connect();
