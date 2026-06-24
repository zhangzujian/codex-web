import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultFetchMessage,
  handleRemoteDefaultFetchMessage,
} from "../src/server/remote-default-fetch.js";

test("remote default fetch override exposes app-server connection state", async () => {
  const messages = [];

  const handled = await handleRemoteDefaultFetchMessage(
    {
      type: "fetch",
      requestId: "req-1",
      method: "POST",
      url: "vscode://codex/app-server-connection-state",
      body: JSON.stringify({ hostId: "remote:default" }),
    },
    { respond: (message) => messages.push(message) },
  );

  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
    state: "connected",
    error: null,
  });
});

test("remote default fetch override refreshes only the default remote connection", async () => {
  const messages = [];
  const previousHost = process.env.CODEX_WEB_REMOTE_SSH_HOST;
  process.env.CODEX_WEB_REMOTE_SSH_HOST = "remote";

  try {
    assert.equal(
      canHandleRemoteDefaultFetchMessage({
        type: "fetch",
        requestId: "req-local",
        method: "POST",
        url: "vscode://codex/app-server-connection-state",
        body: JSON.stringify({ hostId: "local" }),
      }),
      false,
    );

    const handled = await handleRemoteDefaultFetchMessage(
      {
        type: "fetch",
        requestId: "req-2",
        method: "POST",
        url: "vscode://codex/refresh-remote-connections",
        body: JSON.stringify({}),
      },
      { respond: (message) => messages.push(message) },
    );

    assert.equal(handled, true);
    assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
      remoteConnections: [
        {
          hostId: "remote:default",
          displayName: "remote",
          source: "codex-managed",
          sshHost: "remote",
          sshPort: null,
          sshAlias: null,
          identity: null,
          autoConnect: true,
        },
      ],
    });
    assert.equal(messages[1].args[0].type, "codex-app-server-connection-changed");
    assert.equal(messages[1].args[0].state, "connected");
  } finally {
    if (previousHost === undefined) {
      delete process.env.CODEX_WEB_REMOTE_SSH_HOST;
    } else {
      process.env.CODEX_WEB_REMOTE_SSH_HOST = previousHost;
    }
  }
});

test("remote default fetch override ignores nested local host params", () => {
  assert.equal(
    canHandleRemoteDefaultFetchMessage({
      type: "fetch",
      requestId: "req-local-nested",
      method: "POST",
      url: "vscode://codex/app-server-connection-state",
      body: JSON.stringify({ params: { hostId: "local" } }),
    }),
    false,
  );
});
