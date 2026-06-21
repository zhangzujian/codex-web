#!/usr/bin/env node
type ServerOptions = {
    host: string;
    port: number;
    tls?: {
        certPath: string;
        keyPath: string;
    };
};
export declare function parseServerArgs(args: string[]): ServerOptions;
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
export declare function isAllowedBackendWebSocketRequest({ host, origin, requestUrl, token, }: {
    host?: string | string[];
    origin?: string | string[];
    requestUrl: string;
    token: string;
}): boolean;
export declare function shouldBlockFsRequestPath(requestPath: string, headers?: Record<string, string | string[] | undefined>): boolean;
export declare function shouldServeWebviewShellPath(requestPath: string): boolean;
export declare function createTerminalHtml({ backendWebSocketToken, cwd: requestedCwd, locale: requestedLocale, stylesheetHrefs, }: {
    backendWebSocketToken: string;
    cwd: string | undefined;
    locale?: string | undefined;
    stylesheetHrefs: string[];
}): string;
export declare function injectWebviewRuntimeScripts(html: string, backendWebSocketToken: string): string;
export {};
//# sourceMappingURL=main.d.ts.map