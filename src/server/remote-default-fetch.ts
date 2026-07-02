type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type RemoteDefaultFetchEnvironment = {
  respond?: (message: MainToRendererMessage) => void;
};

export async function handleRemoteDefaultFetchMessage(
  _message: unknown,
  _environment: RemoteDefaultFetchEnvironment = {},
): Promise<boolean> {
  return false;
}

export function canHandleRemoteDefaultFetchMessage(_message: unknown): boolean {
  return false;
}
