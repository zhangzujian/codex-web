import assert from "node:assert/strict";
import test from "node:test";

import {
  REMOTE_DEFAULT_HOST_ID,
  remoteDefaultHostConfig,
} from "../src/server/remote-default-config.js";

test("default server host config is local", () => {
  assert.equal(REMOTE_DEFAULT_HOST_ID, "local");
  assert.deepEqual(remoteDefaultHostConfig(), {
    id: "local",
    display_name: "Local",
    kind: "local",
  });
});
