import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultMcpMessage,
  handleRemoteDefaultMcpMessage,
} from "../src/server/remote-default-mcp.js";

test("remote default mcp override exposes remote connection feature config", async () => {
  const messages = [];
  const request = {
    jsonrpc: "2.0",
    id: "config-request-1",
    method: "config/read",
    params: { hostId: "remote:default" },
  };

  const handled = await handleRemoteDefaultMcpMessage(
    {
      type: "mcp-request",
      hostId: "remote:default",
      request,
    },
    { respond: (message) => messages.push(message) },
  );

  assert.equal(handled, true);
  assert.deepEqual(messages[0].args[0].message.result.config.features, {
    remote_connections: true,
    remote_ssh_connections: true,
  });
});

test("remote default mcp override ignores non-default hosts", () => {
  assert.equal(
    canHandleRemoteDefaultMcpMessage({
      type: "mcp-request",
      hostId: "local",
      request: {
        id: "config-request-2",
        method: "config/read",
        params: { hostId: "local" },
      },
    }),
    false,
  );
});
