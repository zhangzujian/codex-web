#!/usr/bin/env node
import { type AppServerRpcClient, type TerminalSessionFactory } from "./terminal";
type ServerOptions = {
    auth?: {
        token: string;
    };
    host: string;
    port: number;
    tls?: {
        certPath: string;
        keyPath: string;
    };
};
type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
    portIds?: string[];
} | {
    type: "ipc-renderer-invoke-result";
    requestId: string;
    ok: true;
    result: unknown;
} | {
    type: "ipc-renderer-invoke-result";
    requestId: string;
    ok: false;
    errorMessage: string;
} | {
    type: "workspace-directory-entries-result";
    requestId: string;
    ok: true;
    result: WorkspaceDirectoryEntries;
} | {
    type: "workspace-directory-entries-result";
    requestId: string;
    ok: false;
    errorMessage: string;
} | {
    type: "virtual-port-message";
    portId: string;
    data: unknown;
} | {
    type: "virtual-port-close";
    portId: string;
};
type WorkspaceDirectoryEntry = {
    name: string;
    path: string;
    type: "directory" | "file";
};
type WorkspaceDirectoryEntries = {
    directoryPath: string;
    parentPath: string | null;
    entries: WorkspaceDirectoryEntry[];
};
type FetchMessage = {
    type: "fetch";
    requestId: string;
    method?: unknown;
    url?: unknown;
    body?: unknown;
};
export declare function parseServerArgs(args: string[], env?: NodeJS.ProcessEnv): ServerOptions;
export declare function createFastifyOptions(options: ServerOptions): Promise<{
    logger: boolean;
    https?: undefined;
} | {
    logger: boolean;
    https: {
        cert: string;
        key: string;
    };
}>;
export declare function getWorkspaceDirectoryEntries({ directoryPath, directoriesOnly, }: {
    directoryPath: string | null;
    directoriesOnly: boolean;
}, appServerClient?: {
    rpc: (method: string, params: unknown) => Promise<unknown>;
}): Promise<WorkspaceDirectoryEntries>;
export declare function canHandleWorkspaceDirectoryEntriesFetchMessage(message: unknown): message is FetchMessage;
export declare function handleWorkspaceDirectoryEntriesFetchMessage(message: FetchMessage, appServerClient: {
    rpc: (method: string, params: unknown) => Promise<unknown>;
}, respond: (message: MainToRendererMessage) => void): Promise<boolean>;
export declare function canHandleReadConfigForHostFetchMessage(message: unknown): message is FetchMessage;
export declare function handleReadConfigForHostFetchMessage(message: FetchMessage, appServerClient: {
    rpc: (method: string, params: unknown) => Promise<unknown>;
}, respond: (message: MainToRendererMessage) => void): Promise<boolean>;
export declare function createDefaultTerminalSessionFactory(appServerClient?: AppServerRpcClient): TerminalSessionFactory;
export declare function isAllowedBackendWebSocketRequest({ host, origin, requestUrl, token, }: {
    host?: string | string[];
    origin?: string | string[];
    requestUrl: string;
    token: string;
}): boolean;
export declare function shouldBlockFsRequestPath(requestPath: string, headers?: Record<string, string | string[] | undefined>): boolean;
export declare function shouldServeWebviewShellPath(requestPath: string): boolean;
export declare function createAuthCookie({ now, secure, token, }: {
    now?: number;
    secure: boolean;
    token: string;
}): string;
export declare function isAuthenticatedCookie({ cookieHeader, now, token, }: {
    cookieHeader: string | string[] | undefined;
    now?: number;
    token: string;
}): boolean;
export declare function createAuthLoginHtml(requestPath: string): string;
export declare function injectWebviewRuntimeScripts(html: string, backendWebSocketToken: string): string;
export {};
//# sourceMappingURL=main.d.ts.map