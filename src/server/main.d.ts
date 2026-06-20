#!/usr/bin/env node
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
//# sourceMappingURL=main.d.ts.map