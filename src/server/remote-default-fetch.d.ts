type FetchMessage = {
    type: "fetch";
    requestId: string;
    method?: unknown;
    url?: unknown;
    body?: unknown;
};
type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
};
type RemoteDefaultFetchEnvironment = {
    respond?: (message: MainToRendererMessage) => void;
};
export declare function handleRemoteDefaultFetchMessage(message: unknown, environment?: RemoteDefaultFetchEnvironment): Promise<boolean>;
export declare function canHandleRemoteDefaultFetchMessage(message: unknown): message is FetchMessage;
export {};
//# sourceMappingURL=remote-default-fetch.d.ts.map