import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultMcpMessage,
  handleRemoteDefaultMcpMessage,
} from "../src/server/remote-default-mcp.js";

test("remote default mcp override no-ops config reads", async () => {
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

  assert.equal(handled, false);
  assert.deepEqual(messages, []);
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
