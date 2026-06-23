"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRemoteDefaultMcpMessage = handleRemoteDefaultMcpMessage;
exports.canHandleRemoteDefaultMcpMessage = canHandleRemoteDefaultMcpMessage;
const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
const REMOTE_DEFAULT_HOST_ID = "remote:default";
async function handleRemoteDefaultMcpMessage(message, environment = {}) {
    if (!canHandleRemoteDefaultMcpMessage(message)) {
        return false;
    }
    sendMcpResponse(environment, message.hostId, message.request.id, {
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
    });
    return true;
}
function canHandleRemoteDefaultMcpMessage(message) {
    return (isRecord(message) &&
        message.type === "mcp-request" &&
        message.hostId === REMOTE_DEFAULT_HOST_ID &&
        isRecord(message.request) &&
        message.request.method === "config/read");
}
function sendMcpResponse({ respond }, hostId, requestId, result) {
    respond?.({
        type: "ipc-main-event",
        channel: MESSAGE_FOR_VIEW_CHANNEL,
        args: [
            {
                type: "mcp-response",
                hostId,
                message: {
                    jsonrpc: "2.0",
                    id: requestId,
                    result,
                },
            },
        ],
    });
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=remote-default-mcp.js.map