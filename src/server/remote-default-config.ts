export const REMOTE_DEFAULT_HOST_ID = "local";

export function remoteDefaultHostConfig() {
  return {
    id: REMOTE_DEFAULT_HOST_ID,
    display_name: "Local",
    kind: "local",
  };
}
