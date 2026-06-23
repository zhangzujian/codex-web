"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRemoteDefaultFetchMessage = handleRemoteDefaultFetchMessage;
exports.canHandleRemoteDefaultFetchMessage = canHandleRemoteDefaultFetchMessage;
const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
const REMOTE_DEFAULT_HOST_ID = "remote:default";
const REMOTE_DEFAULT_CONNECTION = {
    hostId: REMOTE_DEFAULT_HOST_ID,
    displayName: "Remote",
    source: "codex-web",
    sshHost: "remote",
    sshPort: null,
    sshAlias: null,
    identity: null,
    autoConnect: true,
};
async function handleRemoteDefaultFetchMessage(message, environment = {}) {
    if (!canHandleRemoteDefaultFetchMessage(message)) {
        return false;
    }
    try {
        sendFetchResponse(environment, message.requestId, 200, responseForRoute(routeFromFetchUrl(message.url)));
        return true;
    }
    catch (error) {
        sendFetchError(environment, message.requestId, errorMessage(error));
        return true;
    }
}
function canHandleRemoteDefaultFetchMessage(message) {
    const hostId = isFetchMessage(message) ? fetchHostId(message.body) : null;
    return (isFetchMessage(message) &&
        routeFromFetchUrl(message.url) != null &&
        (hostId == null || hostId === REMOTE_DEFAULT_HOST_ID));
}
function responseForRoute(route) {
    switch (route) {
        case "read-config-for-host":
            return {
                config: {
                    features: {
                        remote_connections: true,
                        remote_ssh_connections: true,
                    },
                    "features.remote_connections": true,
                    "features.remote_ssh_connections": true,
                },
                origins: {},
                layers: [],
            };
        case "refresh-remote-connections":
        case "save-codex-managed-remote-ssh-connections":
            return {
                remoteConnections: [{ ...REMOTE_DEFAULT_CONNECTION }],
            };
        case "discover-remote-ssh-connections":
            return {
                discoveredRemoteConnections: [],
            };
        case "set-remote-connection-auto-connect":
            return {
                remoteConnections: [{ ...REMOTE_DEFAULT_CONNECTION }],
                state: "connected",
                error: null,
            };
        case "install-remote-codex":
            return {
                state: "connected",
                error: null,
            };
        case "refresh-remote-control-connections":
            return {
                remoteControlConnections: [],
            };
    }
}
function fetchHostId(body) {
    if (typeof body !== "string") {
        return null;
    }
    try {
        const parsed = JSON.parse(body);
        return isRecord(parsed) && typeof parsed.hostId === "string"
            ? parsed.hostId
            : null;
    }
    catch {
        return null;
    }
}
function isFetchMessage(value) {
    return (isRecord(value) &&
        value.type === "fetch" &&
        typeof value.requestId === "string");
}
function routeFromFetchUrl(value) {
    if (typeof value !== "string") {
        return null;
    }
    try {
        const url = new URL(value);
        if (url.protocol !== "vscode:" || url.hostname !== "codex") {
            return null;
        }
        const route = url.pathname.slice(1);
        if (isRemoteDefaultRoute(route)) {
            return route;
        }
    }
    catch {
        return null;
    }
    return null;
}
function isRemoteDefaultRoute(value) {
    return (value === "read-config-for-host" ||
        value === "refresh-remote-connections" ||
        value === "discover-remote-ssh-connections" ||
        value === "refresh-remote-control-connections" ||
        value === "save-codex-managed-remote-ssh-connections" ||
        value === "set-remote-connection-auto-connect" ||
        value === "install-remote-codex");
}
function sendFetchResponse({ respond }, requestId, status, body) {
    respond?.({
        type: "ipc-main-event",
        channel: MESSAGE_FOR_VIEW_CHANNEL,
        args: [
            {
                type: "fetch-response",
                requestId,
                responseType: "success",
                status,
                headers: {},
                bodyJsonString: JSON.stringify(body),
            },
        ],
    });
}
function sendFetchError({ respond }, requestId, error) {
    respond?.({
        type: "ipc-main-event",
        channel: MESSAGE_FOR_VIEW_CHANNEL,
        args: [
            {
                type: "fetch-response",
                requestId,
                responseType: "error",
                status: 500,
                error,
            },
        ],
    });
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=remote-default-fetch.js.map