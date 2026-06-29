export type TerminalSession = {
    id: string;
    close: () => void;
    onData: (listener: (data: string) => void) => void;
    onExit: (listener: (event: {
        exitCode: number | null;
        signal?: number | null;
    }) => void) => void;
    resize: (cols: number, rows: number) => void;
    write: (data: string) => void;
};
export type TerminalSessionOptions = {
    cols: number;
    cwd: string;
    rows: number;
    terminalType: string;
};
export type TerminalSessionFactory = {
    createSession: (options: TerminalSessionOptions) => TerminalSession;
};
export type RemoteProcessOutputDelta = {
    capReached?: boolean;
    chunk: Buffer;
};
export type RemoteProcessSession = {
    response: Promise<{
        exitCode: number | null;
    }>;
    resize: (size: {
        cols: number;
        rows: number;
    }) => Promise<unknown>;
    terminate: () => Promise<unknown>;
    write: (data: Buffer, options?: {
        closeStdin?: boolean;
    }) => Promise<unknown>;
};
export type RemoteProcessConnection = {
    startProcess: (options: {
        command: string[];
        cwd: string;
        env: Record<string, string | null>;
        onStderrDelta: (delta: RemoteProcessOutputDelta) => void;
        onStdoutDelta: (delta: RemoteProcessOutputDelta) => void;
        outputBytesCap: null;
        processHandle: string;
        size: {
            cols: number;
            rows: number;
        };
        streamStdoutStderr: true;
        timeoutMs: null;
        tty: true;
    }) => Promise<RemoteProcessSession>;
};
export type AppServerRpcClient = {
    onNotification: (listener: (notification: {
        method: string;
        params: unknown;
    }) => void) => () => void;
    rpc: (method: string, params: unknown, options?: {
        timeoutMs?: number | null;
    }) => Promise<unknown>;
};
export declare function resolveTerminalCwd(requestedCwd: string | undefined): string;
export declare function createRemoteTerminalSessionFactory(connection: RemoteProcessConnection): TerminalSessionFactory;
export declare function createCommandExecRemoteProcessConnection(client: AppServerRpcClient): RemoteProcessConnection;
//# sourceMappingURL=terminal.d.ts.map