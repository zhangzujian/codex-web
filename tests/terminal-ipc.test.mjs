import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalIpcMessageHandler } from "../src/server/terminal-ipc.js";

test("terminal IPC messages create and control upstream terminal sessions", () => {
  const events = [];
  const calls = [];
  const session = {
    id: "session-1",
    close() {
      calls.push(["close"]);
    },
    onData(listener) {
      this.dataListener = listener;
    },
    onExit(listener) {
      this.exitListener = listener;
    },
    resize(cols, rows) {
      calls.push(["resize", cols, rows]);
    },
    write(data) {
      calls.push(["write", data]);
    },
  };
  const handler = createTerminalIpcMessageHandler({
    createSession(options) {
      calls.push(["create", options]);
      return session;
    },
  }, {
    resolveCwd: (cwd) => cwd || "/home/user",
    respond: (message) => events.push(message),
  });

  assert.equal(
    handler({ type: "terminal-create", sessionId: "session-1", cwd: "/repo" }),
    true,
  );
  session.dataListener("hello");
  handler({ type: "terminal-resize", sessionId: "session-1", cols: 100, rows: 30 });
  handler({ type: "terminal-write", sessionId: "session-1", data: "pwd\r" });
  handler({ type: "terminal-attach", sessionId: "session-1" });
  handler({ type: "terminal-close", sessionId: "session-1" });

  assert.deepEqual(calls, [
    [
      "create",
      {
        cols: 80,
        cwd: "/repo",
        rows: 24,
        terminalType: "xterm-256color",
      },
    ],
    ["resize", 100, 30],
    ["write", "pwd\r"],
    ["close"],
  ]);
  assert.deepEqual(events, [
    {
      type: "terminal-attached",
      sessionId: "session-1",
      cwd: "/repo",
      shell: process.env.SHELL || "unknown",
    },
    { type: "terminal-data", sessionId: "session-1", data: "hello" },
    {
      type: "terminal-attached",
      sessionId: "session-1",
      cwd: "/repo",
      shell: process.env.SHELL || "unknown",
    },
  ]);
});
