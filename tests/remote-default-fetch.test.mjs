import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandleRemoteDefaultFetchMessage,
  handleRemoteDefaultFetchMessage,
} from "../src/server/remote-default-fetch.js";

test("remote default fetch override is disabled", async () => {
  const messages = [];
  const message = {
    type: "fetch",
    requestId: "req-1",
    method: "POST",
    url: "vscode://codex/app-server-connection-state",
    body: JSON.stringify({ hostId: "local" }),
  };

  assert.equal(canHandleRemoteDefaultFetchMessage(message), false);
  assert.equal(
    await handleRemoteDefaultFetchMessage(message, {
      respond: (response) => messages.push(response),
    }),
    false,
  );
  assert.deepEqual(messages, []);
});
