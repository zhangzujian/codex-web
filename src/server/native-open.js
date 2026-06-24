"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenInTargetsPayload = createOpenInTargetsPayload;
exports.createOpenFileCommand = createOpenFileCommand;
exports.handleNativeOpenFetchMessage = handleNativeOpenFetchMessage;
exports.canHandleNativeOpenFetchMessage = canHandleNativeOpenFetchMessage;
const node_child_process_1 = require("node:child_process");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const remote_default_config_1 = require("./remote-default-config");
const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function createOpenInTargetsPayload(environment = {}, request = {}) {
    const { commandExists = defaultCommandExists, platform = process.platform } = environment;
    const targets = [];
    const availableTargets = [];
    const codeCommand = await resolveCodeCommand(commandExists, environment.codeCommand);
    const xftpCommand = await resolveXftpCommand(commandExists);
    const gitWebRemote = await resolveGitWebRemote(request, environment);
    const systemOpenAvailable = await hasSystemOpenCommand(platform, commandExists);
    if (codeCommand != null) {
        targets.push({
            id: codeCommand === "code-insiders" ? "vscode-insiders" : "vscode",
            label: codeCommand === "code-insiders" ? "VS Code Insiders" : "VS Code",
            target: "workspace",
            appPath: codeCommand,
            kind: "editor",
        });
        availableTargets.push("workspace");
    }
    if (remoteSshAuthority(request) != null) {
        return {
            availableTargets,
            mode: "editor",
            preferredTarget: codeCommand != null ? "workspace" : (availableTargets[0] ?? null),
            targets,
        };
    }
    if (xftpCommand != null) {
        targets.push({
            id: "xsftp",
            label: "Xftp",
            target: "xsftp",
            appPath: xftpCommand,
            kind: "native",
        });
        availableTargets.push("xsftp");
    }
    if (gitWebRemote != null && systemOpenAvailable) {
        targets.push({
            id: gitWebRemote.id,
            label: gitWebRemote.label,
            target: gitWebRemote.target,
            kind: "native",
        });
        availableTargets.push(gitWebRemote.target);
    }
    if (systemOpenAvailable) {
        const labels = localizedNativeOpenLabels(request.locale);
        targets.push({
            id: "system-default",
            label: labels.systemDefault,
            labelKey: "openTarget.systemDefault",
            target: "systemDefault",
            kind: "native",
        }, {
            id: "file-manager",
            label: labels.fileManager,
            labelKey: "openTarget.fileManager",
            target: "fileManager",
            kind: "native",
        });
        availableTargets.push("systemDefault", "fileManager");
    }
    return {
        availableTargets,
        mode: "editor",
        preferredTarget: codeCommand != null ? "workspace" : (availableTargets[0] ?? null),
        targets,
    };
}
function localizedNativeOpenLabels(locale) {
    const normalized = typeof locale === "string"
        ? locale.trim().replaceAll("_", "-").toLowerCase()
        : "";
    if (normalized === "zh" || normalized.startsWith("zh-")) {
        return {
            fileManager: "文件管理器",
            systemDefault: "默认应用",
        };
    }
    return {
        fileManager: "File manager",
        systemDefault: "Default app",
    };
}
async function createOpenFileCommand(request, environment = {}) {
    const { commandExists = defaultCommandExists, isDirectory = defaultIsDirectory, platform = process.platform, } = environment;
    const targetPath = resolveRequestPath(request);
    const target = stringValue(request.target) ?? "systemDefault";
    if (target === "workspace") {
        const command = await resolveCodeCommand(commandExists, environment.codeCommand);
        if (command == null) {
            throw new Error("Open target is not available: workspace");
        }
        const remoteEditor = remoteEditorTarget(request);
        if (stringValue(request.openMode) === "workspace") {
            return {
                command,
                args: remoteEditor == null
                    ? [targetPath]
                    : ["--folder-uri", remoteEditor.pathUri],
            };
        }
        if (remoteEditor != null) {
            return {
                command,
                args: remoteEditorArgs(remoteEditor, request),
            };
        }
        return {
            command,
            args: ["-g", formatEditorPath(targetPath, request)],
        };
    }
    if (target === "github" || target === "gitlab") {
        if (!(await hasSystemOpenCommand(platform, commandExists))) {
            throw new Error(`Open target is not available: ${target}`);
        }
        return createSystemDefaultCommand(await createGitWebFileUrl(request, environment), platform);
    }
    if (target === "xsftp") {
        const command = await resolveXftpCommand(commandExists);
        if (command == null) {
            throw new Error("Open target is not available: xsftp");
        }
        return {
            command,
            args: [targetPath],
        };
    }
    if (target === "fileManager") {
        if (!(await hasSystemOpenCommand(platform, commandExists))) {
            throw new Error("Open target is not available: fileManager");
        }
        return createFileManagerCommand(targetPath, { isDirectory, platform });
    }
    if (target === "systemDefault") {
        if (!(await hasSystemOpenCommand(platform, commandExists))) {
            throw new Error("Open target is not available: systemDefault");
        }
        return createSystemDefaultCommand(targetPath, platform);
    }
    throw new Error(`Open target is not available: ${target}`);
}
async function handleNativeOpenFetchMessage(message, environment = {}) {
    if (!canHandleNativeOpenFetchMessage(message)) {
        return false;
    }
    const fetchMessage = message;
    const route = routeFromFetchUrl(message.url);
    try {
        const body = parseFetchBody(fetchMessage.body);
        if (route === "open-in-targets") {
            sendFetchResponse(environment, fetchMessage.requestId, 200, await createOpenInTargetsPayload(environment, body));
            return true;
        }
        const command = await createOpenFileCommand(body, environment);
        const spawnDetached = environment.spawnDetached ?? defaultSpawnDetached;
        spawnDetached(command.command, command.args);
        sendFetchResponse(environment, fetchMessage.requestId, 200, {});
        return true;
    }
    catch (error) {
        sendFetchError(environment, fetchMessage.requestId, errorMessage(error));
        return true;
    }
}
function canHandleNativeOpenFetchMessage(message) {
    return isFetchMessage(message) && routeFromFetchUrl(message.url) != null;
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
        if (url.pathname === "/open-file") {
            return "open-file";
        }
        if (url.pathname === "/open-in-targets") {
            return "open-in-targets";
        }
    }
    catch {
        return null;
    }
    return null;
}
function parseFetchBody(body) {
    if (body == null || body === "") {
        return {};
    }
    if (typeof body !== "string") {
        throw new Error("Expected fetch body to be a JSON string");
    }
    const parsed = JSON.parse(body);
    if (!isRecord(parsed)) {
        throw new Error("Expected fetch body JSON to be an object");
    }
    return parsed;
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
function resolveRequestPath(request) {
    const rawPath = stringValue(request.path);
    if (rawPath == null || rawPath.length === 0) {
        throw new Error("open-file requires a path");
    }
    if (node_path_1.default.isAbsolute(rawPath)) {
        return node_path_1.default.normalize(rawPath);
    }
    const cwd = stringValue(request.cwd);
    return node_path_1.default.resolve(cwd ?? process.cwd(), rawPath);
}
async function createFileManagerCommand(targetPath, { isDirectory, platform, }) {
    if (platform === "darwin") {
        return {
            command: "open",
            args: ["-R", targetPath],
        };
    }
    if (platform === "win32") {
        return {
            command: "explorer.exe",
            args: ["/select,", targetPath],
        };
    }
    const openPath = (await isDirectory(targetPath))
        ? targetPath
        : node_path_1.default.dirname(targetPath);
    return {
        command: "xdg-open",
        args: [openPath],
    };
}
function createSystemDefaultCommand(targetPath, platform) {
    if (platform === "darwin") {
        return {
            command: "open",
            args: [targetPath],
        };
    }
    if (platform === "win32") {
        return {
            command: "rundll32.exe",
            args: ["url.dll,FileProtocolHandler", targetPath],
        };
    }
    return {
        command: "xdg-open",
        args: [targetPath],
    };
}
async function createGitWebFileUrl(request, environment) {
    const targetPath = resolveRequestPath(request);
    const remote = await resolveGitWebRemote(request, environment);
    if (remote == null) {
        throw new Error("Unable to resolve a GitHub or GitLab remote for path");
    }
    const gitRoot = await resolveGitRoot(request, environment);
    if (gitRoot == null) {
        throw new Error("Unable to resolve git root for path");
    }
    const branch = (await resolveGitBranch(request, environment)) ?? "HEAD";
    const relativePath = node_path_1.default
        .relative(gitRoot, targetPath)
        .split(node_path_1.default.sep)
        .join("/");
    if (relativePath.startsWith("..") || node_path_1.default.isAbsolute(relativePath)) {
        throw new Error("Path is outside the git repository");
    }
    const encodedPath = encodePathSegments(relativePath);
    const encodedBranch = encodeURIComponent(branch);
    const isDirectory = await (environment.isDirectory ?? defaultIsDirectory)(targetPath);
    const line = isDirectory ? null : positiveIntegerValue(request.line);
    const lineFragment = line == null ? "" : `#L${line}`;
    const gitObject = isDirectory ? "tree" : "blob";
    const blobPath = remote.target === "gitlab"
        ? `/-/${gitObject}/${encodedBranch}/${encodedPath}`
        : `/${gitObject}/${encodedBranch}/${encodedPath}`;
    return `${remote.baseUrl}${blobPath}${lineFragment}`;
}
async function resolveGitWebRemote(request, environment) {
    if (!hasGitPathContext(request)) {
        return null;
    }
    const remoteUrl = await resolveGitRemoteUrl(request, environment);
    return remoteUrl == null ? null : parseGitWebRemote(remoteUrl, environment);
}
function hasGitPathContext(request) {
    const cwd = stringValue(request.cwd);
    const rawPath = stringValue(request.path);
    return ((cwd != null && cwd.length > 0) || (rawPath != null && rawPath.length > 0));
}
function parseGitWebRemote(remoteUrl, environment) {
    const parsed = parseGitRemoteUrl(remoteUrl);
    if (parsed == null) {
        return null;
    }
    const host = parsed.host.toLowerCase();
    const provider = host.includes("github")
        ? "github"
        : isConfiguredGitLabHost(host, environment) || host.includes("gitlab")
            ? "gitlab"
            : null;
    if (provider == null) {
        return null;
    }
    const repoPath = parsed.repoPath.replace(/\.git$/i, "");
    if (repoPath.length === 0) {
        return null;
    }
    return {
        id: provider,
        label: provider === "github" ? "GitHub" : "GitLab",
        target: provider,
        baseUrl: `${parsed.protocol}://${parsed.host}/${repoPath}`,
    };
}
function parseGitRemoteUrl(remoteUrl) {
    const trimmed = remoteUrl.trim();
    const scpLikeMatch = /^git@([^:]+):(.+)$/.exec(trimmed);
    if (scpLikeMatch?.[1] && scpLikeMatch[2]) {
        return {
            protocol: "https",
            host: scpLikeMatch[1],
            repoPath: scpLikeMatch[2].replace(/^\/+/, ""),
        };
    }
    try {
        const url = new URL(trimmed);
        if (url.protocol === "http:" || url.protocol === "https:") {
            return {
                protocol: url.protocol === "http:" ? "http" : "https",
                host: url.host,
                repoPath: url.pathname.replace(/^\/+/, ""),
            };
        }
        if (url.protocol === "ssh:") {
            return {
                protocol: "https",
                host: url.hostname,
                repoPath: url.pathname.replace(/^\/+/, ""),
            };
        }
    }
    catch {
        return null;
    }
    return null;
}
function isConfiguredGitLabHost(host, { gitLabHosts }) {
    const configuredHosts = [
        ...(gitLabHosts ?? []),
        ...configuredGitLabHostsFromEnvironment(),
    ].map(normalizeHostConfig);
    return configuredHosts.some((configuredHost) => configuredHost === host);
}
function configuredGitLabHostsFromEnvironment() {
    return splitHostList(process.env.CODEX_WEB_GITLAB_HOSTS);
}
function splitHostList(value) {
    return (value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function normalizeHostConfig(value) {
    const trimmed = value.trim().toLowerCase();
    try {
        const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        return url.host;
    }
    catch {
        return trimmed.replace(/^\/+|\/+$/g, "");
    }
}
async function resolveGitRoot(request, { gitRoot = defaultGitRoot }) {
    const root = await gitRoot(request);
    return root == null ? null : node_path_1.default.resolve(root);
}
async function resolveGitRemoteUrl(request, { gitRemoteUrl = defaultGitRemoteUrl }) {
    return gitRemoteUrl(request);
}
async function resolveGitBranch(request, { gitBranch = defaultGitBranch }) {
    return gitBranch(request);
}
async function defaultGitRoot(request) {
    return runGit(request, ["rev-parse", "--show-toplevel"]);
}
async function defaultGitRemoteUrl(request) {
    return runGit(request, ["config", "--get", "remote.origin.url"]);
}
async function defaultGitBranch(request) {
    return ((await runGit(request, ["branch", "--show-current"])) ??
        (await runGit(request, ["rev-parse", "--short", "HEAD"])));
}
async function runGit(request, args) {
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd: resolveGitCommandCwd(request),
        });
        const value = stdout.trim();
        return value.length === 0 ? null : value;
    }
    catch {
        return null;
    }
}
function resolveGitCommandCwd(request) {
    const cwd = stringValue(request.cwd);
    if (cwd != null && cwd.length > 0) {
        return cwd;
    }
    const rawPath = stringValue(request.path);
    if (rawPath != null && rawPath.length > 0) {
        const resolvedPath = node_path_1.default.isAbsolute(rawPath)
            ? rawPath
            : node_path_1.default.resolve(process.cwd(), rawPath);
        return node_path_1.default.dirname(resolvedPath);
    }
    return process.cwd();
}
function encodePathSegments(value) {
    return value.split("/").map(encodeURIComponent).join("/");
}
function formatEditorPath(targetPath, request) {
    const line = positiveIntegerValue(request.line);
    if (line == null) {
        return targetPath;
    }
    const column = positiveIntegerValue(request.column);
    return column == null
        ? `${targetPath}:${line}`
        : `${targetPath}:${line}:${column}`;
}
function remoteEditorTarget(request) {
    const authority = remoteSshAuthority(request);
    if (authority == null) {
        return null;
    }
    const path = resolveRemoteRequestPath(request);
    const workspaceRoot = resolveRemoteWorkspaceRoot(request);
    return {
        authority,
        path,
        pathUri: remoteEditorUri(authority, path),
        workspaceRoot,
        workspaceRootUri: workspaceRoot == null ? null : remoteEditorUri(authority, workspaceRoot),
    };
}
function remoteEditorArgs(target, request) {
    const location = remoteLocation(request);
    const args = [];
    if (target.workspaceRootUri != null) {
        args.push("--folder-uri", target.workspaceRootUri);
    }
    if (location != null) {
        args.push("--remote", target.authority, "--goto", `${target.path}:${location.line}:${location.column}`);
    }
    else {
        args.push("--file-uri", target.pathUri);
    }
    return args;
}
function remoteLocation(request) {
    const line = positiveIntegerValue(request.line);
    if (line == null) {
        return null;
    }
    return {
        line,
        column: positiveIntegerValue(request.column) ?? 1,
    };
}
function remoteEditorUri(authority, remotePath) {
    return `vscode-remote://${authority}${encodePathSegments(remotePath)}`;
}
function resolveRemoteRequestPath(request) {
    const rawPath = normalizeRemotePathSeparators(stringValue(request.path) ?? "");
    if (node_path_1.default.posix.isAbsolute(rawPath)) {
        return node_path_1.default.posix.normalize(rawPath);
    }
    const cwd = normalizeRemotePathSeparators(stringValue(request.cwd) ?? "/");
    return node_path_1.default.posix.resolve(cwd, rawPath);
}
function resolveRemoteWorkspaceRoot(request) {
    const rawCwd = normalizeRemotePathSeparators(stringValue(request.cwd)?.trim() ?? "");
    if (rawCwd.length === 0) {
        return null;
    }
    return node_path_1.default.posix.isAbsolute(rawCwd)
        ? node_path_1.default.posix.normalize(rawCwd)
        : node_path_1.default.posix.resolve("/", rawCwd);
}
function normalizeRemotePathSeparators(value) {
    return value.replaceAll("\\", "/");
}
function remoteSshAuthority(request) {
    const remoteAuthority = stringValue(request.remoteAuthority);
    if (remoteAuthority != null && remoteAuthority.length > 0) {
        return remoteAuthority.startsWith("ssh-remote+")
            ? remoteAuthority
            : `ssh-remote+${encodeURIComponent(remoteAuthority)}`;
    }
    const sshHost = stringValue(request.sshHost);
    if (sshHost != null && sshHost.length > 0) {
        return `ssh-remote+${encodeURIComponent(sshHost)}`;
    }
    return stringValue(request.hostId) === "remote:default"
        ? `ssh-remote+${encodeURIComponent((0, remote_default_config_1.remoteDefaultSshHost)())}`
        : null;
}
async function resolveCodeCommand(commandExists, configuredCommand = process.env.CODEX_WEB_VSCODE_CLI) {
    const configured = configuredCommand?.trim();
    if (configured != null && configured.length > 0) {
        if (await configuredCodeCommandExists(configured, commandExists)) {
            return configured;
        }
    }
    if (await commandExists("code")) {
        return "code";
    }
    if (await commandExists("code-insiders")) {
        return "code-insiders";
    }
    return null;
}
async function configuredCodeCommandExists(command, commandExists) {
    if (!command.includes("/") && !command.includes("\\")) {
        return commandExists(command);
    }
    try {
        await promises_1.default.access(command);
        return true;
    }
    catch {
        return false;
    }
}
async function resolveXftpCommand(commandExists) {
    if (await commandExists("xsftp")) {
        return "xsftp";
    }
    if (await commandExists("xftp")) {
        return "xftp";
    }
    return null;
}
async function hasSystemOpenCommand(platform, commandExists) {
    if (platform === "darwin" || platform === "win32") {
        return true;
    }
    return commandExists("xdg-open");
}
async function defaultCommandExists(command) {
    const pathEntries = (process.env.PATH ?? "")
        .split(node_path_1.default.delimiter)
        .filter(Boolean);
    for (const pathEntry of pathEntries) {
        try {
            await promises_1.default.access(node_path_1.default.join(pathEntry, command));
            return true;
        }
        catch {
            // Keep scanning PATH.
        }
    }
    return false;
}
async function defaultIsDirectory(targetPath) {
    try {
        return (await promises_1.default.stat(targetPath)).isDirectory();
    }
    catch {
        return false;
    }
}
function defaultSpawnDetached(command, args) {
    const subprocess = (0, node_child_process_1.spawn)(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    subprocess.on("error", (error) => {
        console.error(`[native-open] failed to spawn ${command}`, error);
    });
    subprocess.unref();
}
function stringValue(value) {
    return typeof value === "string" ? value : null;
}
function positiveIntegerValue(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=native-open.js.map