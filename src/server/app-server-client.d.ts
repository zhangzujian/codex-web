export type AppServerNotification = {
    method: string;
    params: unknown;
};
export type AppServerJsonRpcClient = {
    dispose: () => void;
    onNotification: (listener: (notification: AppServerNotification) => void) => () => void;
    rpc: (method: string, params: unknown, options?: {
        timeoutMs?: number | null;
    }) => Promise<unknown>;
};
export declare function createCodexAppServerClient(env?: NodeJS.ProcessEnv): AppServerJsonRpcClient;
export declare function createAppServerJsonRpcClient({ args, command, env, requestTimeoutMs, }: {
    args: string[];
    command: string;
    env?: NodeJS.ProcessEnv;
    requestTimeoutMs?: number;
}): AppServerJsonRpcClient;
//# sourceMappingURL=app-server-client.d.ts.map