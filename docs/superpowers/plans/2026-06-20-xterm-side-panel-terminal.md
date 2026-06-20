# Xterm Side Panel Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-accessible xterm.js terminal backed by a real PTY, and wire the side panel terminal entry to open it.

**Architecture:** The server owns PTY processes through a focused terminal backend module. The browser terminal page uses xterm.js and communicates over a dedicated `/__backend/terminal` WebSocket, keeping high-volume terminal IO out of the Electron IPC shim. The side panel integration opens the internal terminal page through the existing browser side panel tab path.

**Tech Stack:** TypeScript, Fastify, ws, node-pty, @xterm/xterm, @xterm/addon-fit, Node test runner.

---

### Task 1: Terminal Message Parsing and Session Defaults

**Files:**
- Create: `src/server/terminal.ts`
- Test: `tests/terminal-protocol.test.mjs`

- [ ] **Step 1: Write failing protocol tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { parseTerminalClientMessage, resolveTerminalCwd } from "../src/server/terminal.js";

test("parseTerminalClientMessage accepts create, input, resize, and close messages", () => {
  assert.deepEqual(parseTerminalClientMessage({ type: "create", cwd: "/tmp", cols: 80, rows: 24 }), {
    type: "create",
    cwd: "/tmp",
    cols: 80,
    rows: 24,
  });
  assert.deepEqual(parseTerminalClientMessage({ type: "input", data: "ls\r" }), {
    type: "input",
    data: "ls\r",
  });
  assert.deepEqual(parseTerminalClientMessage({ type: "resize", cols: 100, rows: 30 }), {
    type: "resize",
    cols: 100,
    rows: 30,
  });
  assert.deepEqual(parseTerminalClientMessage({ type: "close" }), { type: "close" });
});

test("parseTerminalClientMessage rejects malformed messages", () => {
  assert.throws(() => parseTerminalClientMessage({ type: "create", cwd: 123 }), /Invalid terminal create message/);
  assert.throws(() => parseTerminalClientMessage({ type: "input", data: 123 }), /Invalid terminal input message/);
  assert.throws(() => parseTerminalClientMessage({ type: "resize", cols: 0, rows: 24 }), /Invalid terminal resize message/);
  assert.throws(() => parseTerminalClientMessage({ type: "unknown" }), /Unknown terminal message type/);
});

test("resolveTerminalCwd returns requested directories and falls back to process cwd", () => {
  assert.equal(resolveTerminalCwd("/tmp"), "/tmp");
  assert.equal(resolveTerminalCwd(""), process.cwd());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build:server && node --test tests/terminal-protocol.test.mjs`

Expected: FAIL because `src/server/terminal.js` does not exist.

- [ ] **Step 3: Implement parser and cwd defaults**

Add `TerminalClientMessage` types, `parseTerminalClientMessage`, and `resolveTerminalCwd` in `src/server/terminal.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:server && node --test tests/terminal-protocol.test.mjs`

Expected: PASS.

### Task 2: PTY-backed WebSocket Route

**Files:**
- Modify: `src/server/terminal.ts`
- Modify: `src/server/main.ts`
- Test: `tests/terminal-protocol.test.mjs`

- [ ] **Step 1: Write failing WebSocket behavior test**

Add a test that creates a fake PTY adapter, attaches a terminal socket handler, sends create/input/resize/close messages, and asserts calls reach the fake session.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build:server && node --test tests/terminal-protocol.test.mjs`

Expected: FAIL because the socket handler is missing.

- [ ] **Step 3: Implement WebSocket handling**

Export `handleTerminalSocket(socket, options)` from `src/server/terminal.ts`. In `src/server/main.ts`, route `/__backend/terminal` upgrades to a second `WebSocketServer`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:server && node --test tests/terminal-protocol.test.mjs`

Expected: PASS.

### Task 3: Xterm Terminal Page

**Files:**
- Create: `src/browser/terminal-page.ts`
- Create: `src/browser/terminal-page.css`
- Modify: `vite.browser.config.ts`
- Modify: `src/server/main.ts`
- Modify: `package.json`

- [ ] **Step 1: Add dependencies**

Install `@xterm/xterm`, `@xterm/addon-fit`, and `node-pty`.

- [ ] **Step 2: Create browser terminal entry**

Build an xterm page that connects to `/__backend/terminal`, sends `create`, forwards input, sends resize events, and writes server output.

- [ ] **Step 3: Expose `/__terminal`**

Serve `terminal.html` from the backend and ensure the Vite browser build emits `terminal-page.js`.

- [ ] **Step 4: Verify build**

Run: `npm run build:browser && npm run build:server`

Expected: PASS.

### Task 4: Side Panel Entry

**Files:**
- Modify: `patches/webview-initial-route.patch` or add a focused side panel patch
- Modify: `scripts/prepare_asar`

- [ ] **Step 1: Patch the stubbed terminal opener**

Patch the current `openSessionSandboxSidePanel` stub to call the existing browser side panel opener with `initialUrl: "/__terminal"` and source metadata.

- [ ] **Step 2: Rebuild patched webview**

Run: `npm run build:browser`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run: `npm run build:server && node --test tests/terminal-protocol.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full available test suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS.

- [ ] **Step 3: Build browser and server**

Run: `npm run build:browser && npm run build:server`

Expected: PASS.
