import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createNodePtyTerminalSessionFactory,
  createTerminalSocketHandler,
  parseTerminalClientMessage,
  resolveTerminalCwd,
  terminalStylesheetHrefs,
} from "../src/server/terminal.js";

test("parseTerminalClientMessage accepts create, input, resize, and close messages", () => {
  assert.deepEqual(
    parseTerminalClientMessage({
      type: "create",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
      terminalType: "linux",
    }),
    {
      type: "create",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
      terminalType: "linux",
    },
  );
  assert.deepEqual(
    parseTerminalClientMessage({ type: "input", data: "ls\r" }),
    {
      type: "input",
      data: "ls\r",
    },
  );
  assert.deepEqual(
    parseTerminalClientMessage({ type: "resize", cols: 100, rows: 30 }),
    {
      type: "resize",
      cols: 100,
      rows: 30,
    },
  );
  assert.deepEqual(parseTerminalClientMessage({ type: "close" }), {
    type: "close",
  });
});

test("parseTerminalClientMessage rejects malformed messages", () => {
  assert.throws(
    () => parseTerminalClientMessage({ type: "create", cwd: 123 }),
    /Invalid terminal create message/,
  );
  assert.throws(
    () =>
      parseTerminalClientMessage({ type: "create", terminalType: "bad term" }),
    /Invalid terminal create message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "input", data: 123 }),
    /Invalid terminal input message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "resize", cols: 0, rows: 24 }),
    /Invalid terminal resize message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "unknown" }),
    /Unknown terminal message type/,
  );
});

test("resolveTerminalCwd returns requested directories and falls back to process cwd", () => {
  assert.equal(resolveTerminalCwd("/tmp"), "/tmp");
  assert.equal(resolveTerminalCwd(""), process.cwd());
});

test("terminalStylesheetHrefs loads app styles first and terminal styles last", () => {
  const hrefs = terminalStylesheetHrefs([
    "terminal-page.css",
    "app-shell-DJDX7Pvr.css",
    "random.css",
    "app-main-C8zHCT66.css",
    "app-CAcOAj6U.css",
  ]);

  assert.deepEqual(hrefs, [
    "/assets/app-CAcOAj6U.css",
    "/assets/app-main-C8zHCT66.css",
    "/assets/app-shell-DJDX7Pvr.css",
    "/assets/terminal-page.css",
  ]);
});

test(
  "node pty terminal sessions inject CODEX_SHELL",
  { skip: process.platform === "win32" },
  async () => {
  const previousCodexShell = process.env.CODEX_SHELL;
  const previousShell = process.env.SHELL;
  delete process.env.CODEX_SHELL;
  process.env.SHELL = "/bin/sh";

  try {
    const session = createNodePtyTerminalSessionFactory().createSession({
      cols: 80,
      cwd: "/tmp",
      rows: 24,
      terminalType: "xterm-256color",
    });
    let output = "";
    session.onData((data) => {
      output += data;
    });
    const exit = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.close();
        reject(new Error("Timed out waiting for terminal session to exit"));
      }, 3000);
      session.onExit(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

    session.write('printf "codex-shell=%s\\n" "$CODEX_SHELL"; exit\r');
    await exit;

    assert.match(output, /codex-shell=1/);
  } finally {
    if (previousCodexShell === undefined) {
      delete process.env.CODEX_SHELL;
    } else {
      process.env.CODEX_SHELL = previousCodexShell;
    }
    if (previousShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = previousShell;
    }
  }
  },
);

test("terminal socket handler creates a session and forwards input, resize, and close", async () => {
  const socket = new FakeSocket();
  const calls = [];
  const handler = createTerminalSocketHandler({
    createSession(options) {
      calls.push(["create", options]);
      return {
        id: "session-1",
        write(data) {
          calls.push(["write", data]);
        },
        resize(cols, rows) {
          calls.push(["resize", cols, rows]);
        },
        close() {
          calls.push(["close"]);
        },
        onData(listener) {
          calls.push(["onData"]);
          listener("hello\r\n");
        },
        onExit(listener) {
          calls.push(["onExit"]);
          this.exit = listener;
        },
      };
    },
  });

  handler(socket);

  socket.emitMessage({
    type: "create",
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    terminalType: "linux",
  });
  socket.emitMessage({ type: "input", data: "pwd\r" });
  socket.emitMessage({ type: "resize", cols: 100, rows: 30 });
  socket.emitMessage({ type: "close" });

  assert.deepEqual(calls, [
    ["create", { cwd: "/tmp", cols: 80, rows: 24, terminalType: "linux" }],
    ["onData"],
    ["onExit"],
    ["write", "pwd\r"],
    ["resize", 100, 30],
    ["close"],
  ]);
  assert.deepEqual(socket.sentMessages, [
    { type: "created", sessionId: "session-1" },
    { type: "output", data: "hello\r\n" },
  ]);
});

test("terminal socket handler ignores stale exit events from replaced sessions", async () => {
  const socket = new FakeSocket();
  const sessions = [];
  const calls = [];
  const handler = createTerminalSocketHandler({
    createSession() {
      const id = `session-${sessions.length + 1}`;
      const session = {
        id,
        write(data) {
          calls.push([id, "write", data]);
        },
        resize() {},
        close() {
          calls.push([id, "close"]);
        },
        onData() {},
        onExit(listener) {
          session.exit = listener;
        },
      };
      sessions.push(session);
      return session;
    },
  });

  handler(socket);

  socket.emitMessage({ type: "create", cwd: "/tmp", cols: 80, rows: 24 });
  socket.emitMessage({ type: "create", cwd: "/tmp", cols: 80, rows: 24 });
  sessions[0].exit({ exitCode: 0, signal: null });
  socket.emitMessage({ type: "input", data: "still-active\r" });

  assert.deepEqual(calls, [
    ["session-1", "close"],
    ["session-2", "write", "still-active\r"],
  ]);
});

test("terminal socket handler sends localized error keys with fallback text", async () => {
  const socket = new FakeSocket();
  const handler = createTerminalSocketHandler({
    createSession() {
      throw new Error("should not create a session");
    },
  });

  handler(socket);
  socket.emitMessage({ type: "create", cwd: 123 });
  socket.emitMessage({ type: "create", cwd: "/tmp/not-a-directory" });

  assert.deepEqual(socket.sentMessages, [
    {
      type: "error",
      message: "Invalid terminal create message",
      messageKey: "error.invalidCreateMessage",
      messageValues: {},
    },
    {
      type: "error",
      message: "Terminal cwd is not a directory: /tmp/not-a-directory",
      messageKey: "error.cwdNotDirectory",
      messageValues: { cwd: "/tmp/not-a-directory" },
    },
  ]);
});

class FakeSocket extends EventEmitter {
  sentMessages = [];
  readyState = 1;

  send(payload) {
    this.sentMessages.push(JSON.parse(String(payload)));
  }

  close() {
    this.emit("close");
  }

  emitMessage(message) {
    this.emit("message", JSON.stringify(message));
  }
}
