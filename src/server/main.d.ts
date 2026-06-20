#!/usr/bin/env node
export declare function isAllowedBackendWebSocketRequest({ host, origin, requestUrl, token, }: {
    host?: string | string[];
    origin?: string | string[];
    requestUrl: string;
    token: string;
}): boolean;
export declare function shouldBlockFsRequestPath(requestPath: string, headers?: Record<string, string | string[] | undefined>): boolean;
export declare function shouldServeWebviewShellPath(requestPath: string): boolean;
//# sourceMappingURL=main.d.ts.map