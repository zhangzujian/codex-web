type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
};
type RemoteDefaultFetchEnvironment = {
    respond?: (message: MainToRendererMessage) => void;
};
export declare function handleRemoteDefaultFetchMessage(_message: unknown, _environment?: RemoteDefaultFetchEnvironment): Promise<boolean>;
export declare function canHandleRemoteDefaultFetchMessage(_message: unknown): boolean;
export {};
//# sourceMappingURL=remote-default-fetch.d.ts.map