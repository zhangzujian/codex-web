import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultFetchMessage,
  handleRemoteDefaultFetchMessage,
} from "../src/server/remote-default-fetch.js";

test("remote default fetch override exposes remote connection feature config", async () => {
  const messages = [];

  const handled = await handleRemoteDefaultFetchMessage(
    {
      type: "fetch",
      requestId: "req-1",
      method: "POST",
      url: "vscode://codex/read-config-for-host",
      body: JSON.stringify({ hostId: "remote:default" }),
    },
    { respond: (message) => messages.push(message) },
  );

  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
    config: {
      features: {
        remote_connections: true,
        remote_ssh_connections: true,
      },
      "features.remote_connections": true,
      "features.remote_ssh_connections": true,
    },
    origins: {},
    layers: [],
  });
});

test("remote default fetch override refreshes only the default remote connection", async () => {
  const messages = [];

  assert.equal(
    canHandleRemoteDefaultFetchMessage({
      type: "fetch",
      requestId: "req-local",
      method: "POST",
      url: "vscode://codex/read-config-for-host",
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
        displayName: "Remote",
        source: "codex-web",
        sshHost: "remote",
        sshPort: null,
        sshAlias: null,
        identity: null,
        autoConnect: true,
      },
    ],
  });
});
