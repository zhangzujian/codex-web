import assert from "node:assert/strict";
import test from "node:test";

import {
  REMOTE_DEFAULT_HOST_ID,
  remoteDefaultConnection,
  remoteDefaultHostConfig,
  remoteDefaultSshHost,
} from "../src/server/remote-default-config.js";

test("remote default server config uses the configured ssh host", () => {
  const previousHost = process.env.CODEX_WEB_REMOTE_SSH_HOST;
  process.env.CODEX_WEB_REMOTE_SSH_HOST = "remote.example";

  try {
    assert.equal(REMOTE_DEFAULT_HOST_ID, "remote:default");
    assert.equal(remoteDefaultSshHost(), "remote.example");
    assert.deepEqual(remoteDefaultHostConfig(), {
      id: "remote:default",
      display_name: "remote.example",
      kind: "ssh",
    });
    assert.deepEqual(remoteDefaultConnection(), {
      hostId: "remote:default",
      displayName: "remote.example",
      source: "codex-managed",
      sshHost: "remote.example",
      sshPort: null,
      sshAlias: null,
      identity: null,
      autoConnect: true,
    });
  } finally {
    if (previousHost === undefined) {
      delete process.env.CODEX_WEB_REMOTE_SSH_HOST;
    } else {
      process.env.CODEX_WEB_REMOTE_SSH_HOST = previousHost;
    }
  }
});
