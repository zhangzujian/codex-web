import os from "node:os";

export const REMOTE_DEFAULT_HOST_ID = "remote:default";

export function remoteDefaultSshHost(): string {
  return (
    process.env.CODEX_WEB_REMOTE_SSH_HOST?.trim() || os.hostname() || "remote"
  );
}

export function remoteDefaultHostConfig() {
  return {
    id: REMOTE_DEFAULT_HOST_ID,
    display_name: remoteDefaultSshHost(),
    kind: "ssh",
  };
}

export function remoteDefaultConnection() {
  const sshHost = remoteDefaultSshHost();
  return {
    hostId: REMOTE_DEFAULT_HOST_ID,
    displayName: sshHost,
    source: "codex-managed",
    sshHost,
    sshPort: null,
    sshAlias: null,
    identity: null,
    autoConnect: true,
  };
}
