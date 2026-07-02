import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultMcpMessage,
  handleRemoteDefaultMcpMessage,
} from "../src/server/remote-default-mcp.js";

test("remote default mcp override is disabled", async () => {
  const messages = [];
  const request = {
    jsonrpc: "2.0",
    id: "config-request-1",
    method: "config/read",
    params: { hostId: "local" },
  };

  const handled = await handleRemoteDefaultMcpMessage(
    {
      type: "mcp-request",
      hostId: "local",
      request,
    },
    { respond: (message) => messages.push(message) },
  );

  assert.equal(handled, false);
  assert.deepEqual(messages, []);
});

test("remote default mcp override ignores local hosts", () => {
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
