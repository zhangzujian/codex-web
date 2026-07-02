import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
const execFileAsync = promisify(execFile);

type FetchMessage = {
  type: "fetch";
  requestId: string;
  method?: unknown;
  url?: unknown;
  body?: unknown;
};

type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type OpenTarget = {
  id: string;
  label: string;
  labelKey?: string;
  target: string;
  appPath?: string;
  icon?: string;
  kind?: "editor" | "native";
};

type OpenInTargetsPayload = {
  availableTargets: string[];
  mode: "editor";
  preferredTarget: string | null;
  targets: OpenTarget[];
};

type OpenFileRequest = {
  appPath?: unknown;
  column?: unknown;
  cwd?: unknown;
  hostId?: unknown;
  line?: unknown;
  locale?: unknown;
  openMode?: unknown;
  path?: unknown;
  remoteAuthority?: unknown;
  sshHost?: unknown;
  target?: unknown;
};

type OpenFileCommand = {
  command: string;
  args: string[];
};

type NativeOpenEnvironment = {
  codeCommand?: string;
  commandExists?: (command: string) => Promise<boolean>;
  gitBranch?: (request: OpenFileRequest) => Promise<string | null>;
  gitLabHosts?: string[];
  gitRemoteUrl?: (request: OpenFileRequest) => Promise<string | null>;
  gitRoot?: (request: OpenFileRequest) => Promise<string | null>;
  isDirectory?: (targetPath: string) => Promise<boolean>;
  platform?: NodeJS.Platform;
  respond?: (message: MainToRendererMessage) => void;
  spawnDetached?: (command: string, args: string[]) => void;
};

type GitWebRemote = {
  id: "github" | "gitlab";
  label: "GitHub" | "GitLab";
  target: "github" | "gitlab";
  icon: "apps/github.svg" | "apps/gitlab.svg";
  baseUrl: string;
};

export async function createOpenInTargetsPayload(
  environment: NativeOpenEnvironment = {},
  request: OpenFileRequest = {},
): Promise<OpenInTargetsPayload> {
  const { commandExists = defaultCommandExists, platform = process.platform } =
    environment;
  const targets: OpenTarget[] = [];
  const availableTargets: string[] = [];
  const codeCommand = await resolveCodeCommand(
    commandExists,
    environment.codeCommand,
  );
  const xftpCommand = await resolveXftpCommand(commandExists);
  const gitWebRemote = await resolveGitWebRemote(request, environment);
  const systemOpenAvailable = await hasSystemOpenCommand(
    platform,
    commandExists,
  );

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
      preferredTarget:
        codeCommand != null ? "workspace" : (availableTargets[0] ?? null),
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

  if (gitWebRemote != null) {
    targets.push({
      id: gitWebRemote.id,
      label: gitWebRemote.label,
      target: gitWebRemote.target,
      icon: gitWebRemote.icon,
      kind: "native",
    });
    availableTargets.push(gitWebRemote.target);
  }

  if (systemOpenAvailable) {
    const labels = localizedNativeOpenLabels(request.locale);
    targets.push(
      {
        id: "system-default",
        label: labels.systemDefault,
        labelKey: "openTarget.systemDefault",
        target: "systemDefault",
        kind: "native",
      },
      {
        id: "file-manager",
        label: labels.fileManager,
        labelKey: "openTarget.fileManager",
        target: "fileManager",
        kind: "native",
      },
    );
    availableTargets.push("systemDefault", "fileManager");
  }

  return {
    availableTargets,
    mode: "editor",
    preferredTarget:
      codeCommand != null ? "workspace" : (availableTargets[0] ?? null),
    targets,
  };
}

function localizedNativeOpenLabels(locale: unknown): {
  fileManager: string;
  systemDefault: string;
} {
  const normalized =
    typeof locale === "string"
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

export async function createOpenFileCommand(
  request: OpenFileRequest,
  environment: NativeOpenEnvironment = {},
): Promise<OpenFileCommand> {
  const {
    commandExists = defaultCommandExists,
    isDirectory = defaultIsDirectory,
    platform = process.platform,
  } = environment;
  const targetPath = resolveRequestPath(request);
  const target = stringValue(request.target) ?? "systemDefault";

  if (target === "workspace") {
    const command = await resolveCodeCommand(
      commandExists,
      environment.codeCommand,
    );
    if (command == null) {
      throw new Error("Open target is not available: workspace");
    }
    const remoteEditor = remoteEditorTarget(request);
    if (stringValue(request.openMode) === "workspace") {
      return {
        command,
        args:
          remoteEditor == null
            ? [targetPath]
            : ["--folder-uri", remoteEditor.workspaceRootUri ?? remoteEditor.pathUri],
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
    return createSystemDefaultCommand(
      await createGitWebFileUrl(request, environment),
      platform,
    );
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

export async function handleNativeOpenFetchMessage(
  message: unknown,
  environment: NativeOpenEnvironment = {},
): Promise<boolean> {
  if (!canHandleNativeOpenFetchMessage(message)) {
    return false;
  }

  const fetchMessage = message;
  const route = routeFromFetchUrl(message.url);

  try {
    const body = parseFetchBody(fetchMessage.body);
    if (route === "open-in-targets") {
      sendFetchResponse(
        environment,
        fetchMessage.requestId,
        200,
        await createOpenInTargetsPayload(environment, body),
      );
      return true;
    }

    const target = stringValue(body.target);
    if (target === "github" || target === "gitlab") {
      sendFetchResponse(environment, fetchMessage.requestId, 200, {
        openInBrowser: true,
        url: await createGitWebFileUrl(body, environment),
      });
      return true;
    }

    const command = await createOpenFileCommand(body, environment);
    const spawnDetached = environment.spawnDetached ?? defaultSpawnDetached;
    spawnDetached(command.command, command.args);
    sendFetchResponse(environment, fetchMessage.requestId, 200, {});
    return true;
  } catch (error) {
    sendFetchError(environment, fetchMessage.requestId, errorMessage(error));
    return true;
  }
}

export function canHandleNativeOpenFetchMessage(
  message: unknown,
): message is FetchMessage {
  return isFetchMessage(message) && routeFromFetchUrl(message.url) != null;
}

function isFetchMessage(value: unknown): value is FetchMessage {
  return (
    isRecord(value) &&
    value.type === "fetch" &&
    typeof value.requestId === "string"
  );
}

function routeFromFetchUrl(
  value: unknown,
): "open-file" | "open-in-targets" | null {
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
  } catch {
    return null;
  }

  return null;
}

function parseFetchBody(body: unknown): OpenFileRequest {
  if (body == null || body === "") {
    return {};
  }
  if (typeof body !== "string") {
    throw new Error("Expected fetch body to be a JSON string");
  }
  const parsed = JSON.parse(body) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Expected fetch body JSON to be an object");
  }
  return isRecord(parsed.params) ? parsed.params : parsed;
}

function sendFetchResponse(
  { respond }: NativeOpenEnvironment,
  requestId: string,
  status: number,
  body: unknown,
): void {
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

function sendFetchError(
  { respond }: NativeOpenEnvironment,
  requestId: string,
  error: string,
): void {
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

function resolveRequestPath(request: OpenFileRequest): string {
  const rawPath = stringValue(request.path);
  if (rawPath == null || rawPath.length === 0) {
    throw new Error("open-file requires a path");
  }

  if (path.isAbsolute(rawPath)) {
    return path.normalize(rawPath);
  }

  const cwd = stringValue(request.cwd);
  return path.resolve(cwd ?? process.cwd(), rawPath);
}

async function createFileManagerCommand(
  targetPath: string,
  {
    isDirectory,
    platform,
  }: {
    isDirectory: (targetPath: string) => Promise<boolean>;
    platform: NodeJS.Platform;
  },
): Promise<OpenFileCommand> {
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
    : path.dirname(targetPath);
  return {
    command: "xdg-open",
    args: [openPath],
  };
}

function createSystemDefaultCommand(
  targetPath: string,
  platform: NodeJS.Platform,
): OpenFileCommand {
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

async function createGitWebFileUrl(
  request: OpenFileRequest,
  environment: NativeOpenEnvironment,
): Promise<string> {
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
  const relativePath = path
    .relative(gitRoot, targetPath)
    .split(path.sep)
    .join("/");
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path is outside the git repository");
  }

  const encodedPath = encodePathSegments(relativePath);
  const encodedBranch = encodeURIComponent(branch);
  const isDirectory = await (environment.isDirectory ?? defaultIsDirectory)(
    targetPath,
  );
  const line = isDirectory ? null : positiveIntegerValue(request.line);
  const lineFragment = line == null ? "" : `#L${line}`;
  const gitObject = isDirectory ? "tree" : "blob";
  const blobPath =
    remote.target === "gitlab"
      ? `/-/${gitObject}/${encodedBranch}/${encodedPath}`
      : `/${gitObject}/${encodedBranch}/${encodedPath}`;
  return `${remote.baseUrl}${blobPath}${lineFragment}`;
}

async function resolveGitWebRemote(
  request: OpenFileRequest,
  environment: NativeOpenEnvironment,
): Promise<GitWebRemote | null> {
  if (!hasGitPathContext(request)) {
    return null;
  }
  const remoteUrl = await resolveGitRemoteUrl(request, environment);
  return remoteUrl == null ? null : parseGitWebRemote(remoteUrl, environment);
}

function hasGitPathContext(request: OpenFileRequest): boolean {
  const cwd = stringValue(request.cwd);
  const rawPath = stringValue(request.path);
  return (
    (cwd != null && cwd.length > 0) || (rawPath != null && rawPath.length > 0)
  );
}

function parseGitWebRemote(
  remoteUrl: string,
  environment: NativeOpenEnvironment,
): GitWebRemote | null {
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
    icon: provider === "github" ? "apps/github.svg" : "apps/gitlab.svg",
    baseUrl: `${parsed.protocol}://${parsed.host}/${repoPath}`,
  };
}

function parseGitRemoteUrl(
  remoteUrl: string,
): { protocol: "http" | "https"; host: string; repoPath: string } | null {
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
  } catch {
    return null;
  }

  return null;
}

function isConfiguredGitLabHost(
  host: string,
  { gitLabHosts }: NativeOpenEnvironment,
): boolean {
  const configuredHosts = [
    ...(gitLabHosts ?? []),
    ...configuredGitLabHostsFromEnvironment(),
  ].map(normalizeHostConfig);
  return configuredHosts.some((configuredHost) => configuredHost === host);
}

function configuredGitLabHostsFromEnvironment(): string[] {
  return splitHostList(process.env.CODEX_WEB_GITLAB_HOSTS);
}

function splitHostList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHostConfig(value: string): string {
  const trimmed = value.trim().toLowerCase();
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    return url.host;
  } catch {
    return trimmed.replace(/^\/+|\/+$/g, "");
  }
}

async function resolveGitRoot(
  request: OpenFileRequest,
  { gitRoot = defaultGitRoot }: NativeOpenEnvironment,
): Promise<string | null> {
  const root = await gitRoot(request);
  return root == null ? null : path.resolve(root);
}

async function resolveGitRemoteUrl(
  request: OpenFileRequest,
  { gitRemoteUrl = defaultGitRemoteUrl }: NativeOpenEnvironment,
): Promise<string | null> {
  return gitRemoteUrl(request);
}

async function resolveGitBranch(
  request: OpenFileRequest,
  { gitBranch = defaultGitBranch }: NativeOpenEnvironment,
): Promise<string | null> {
  return gitBranch(request);
}

async function defaultGitRoot(
  request: OpenFileRequest,
): Promise<string | null> {
  return runGit(request, ["rev-parse", "--show-toplevel"]);
}

async function defaultGitRemoteUrl(
  request: OpenFileRequest,
): Promise<string | null> {
  return runGit(request, ["config", "--get", "remote.origin.url"]);
}

async function defaultGitBranch(
  request: OpenFileRequest,
): Promise<string | null> {
  return (
    (await runGit(request, ["branch", "--show-current"])) ??
    (await runGit(request, ["rev-parse", "--short", "HEAD"]))
  );
}

async function runGit(
  request: OpenFileRequest,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: resolveGitCommandCwd(request),
    });
    const value = stdout.trim();
    return value.length === 0 ? null : value;
  } catch {
    return null;
  }
}

function resolveGitCommandCwd(request: OpenFileRequest): string {
  const cwd = stringValue(request.cwd);
  if (cwd != null && cwd.length > 0) {
    return cwd;
  }

  const rawPath = stringValue(request.path);
  if (rawPath != null && rawPath.length > 0) {
    const resolvedPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(process.cwd(), rawPath);
    return path.dirname(resolvedPath);
  }

  return process.cwd();
}

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function formatEditorPath(
  targetPath: string,
  request: OpenFileRequest,
): string {
  const line = positiveIntegerValue(request.line);
  if (line == null) {
    return targetPath;
  }

  const column = positiveIntegerValue(request.column);
  return column == null
    ? `${targetPath}:${line}`
    : `${targetPath}:${line}:${column}`;
}

function remoteEditorTarget(request: OpenFileRequest): {
  authority: string;
  path: string;
  pathUri: string;
  workspaceRoot: string | null;
  workspaceRootUri: string | null;
} | null {
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
    workspaceRootUri:
      workspaceRoot == null ? null : remoteEditorUri(authority, workspaceRoot),
  };
}

function remoteEditorArgs(
  target: NonNullable<ReturnType<typeof remoteEditorTarget>>,
  request: OpenFileRequest,
): string[] {
  const location = remoteLocation(request);
  const args: string[] = [];
  if (target.workspaceRootUri != null) {
    args.push("--folder-uri", target.workspaceRootUri);
  }
  if (location != null) {
    args.push(
      "--remote",
      target.authority,
      "--goto",
      `${target.path}:${location.line}:${location.column}`,
    );
  } else {
    args.push("--file-uri", target.pathUri);
  }
  return args;
}

function remoteLocation(
  request: OpenFileRequest,
): { line: number; column: number } | null {
  const line = positiveIntegerValue(request.line);
  if (line == null) {
    return null;
  }
  return {
    line,
    column: positiveIntegerValue(request.column) ?? 1,
  };
}

function remoteEditorUri(authority: string, remotePath: string): string {
  return `vscode-remote://${authority}${encodePathSegments(remotePath)}`;
}

function resolveRemoteRequestPath(request: OpenFileRequest): string {
  const rawPath = normalizeRemotePathSeparators(stringValue(request.path) ?? "");
  if (path.posix.isAbsolute(rawPath)) {
    return path.posix.normalize(rawPath);
  }
  const cwd = normalizeRemotePathSeparators(stringValue(request.cwd) ?? "/");
  return path.posix.resolve(cwd, rawPath);
}

function resolveRemoteWorkspaceRoot(request: OpenFileRequest): string | null {
  const rawCwd = normalizeRemotePathSeparators(
    stringValue(request.cwd)?.trim() ?? "",
  );
  if (rawCwd.length === 0) {
    return null;
  }
  return path.posix.isAbsolute(rawCwd)
    ? path.posix.normalize(rawCwd)
    : path.posix.resolve("/", rawCwd);
}

function normalizeRemotePathSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

function remoteSshAuthority(request: OpenFileRequest): string | null {
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
  return null;
}

async function resolveCodeCommand(
  commandExists: (command: string) => Promise<boolean>,
  configuredCommand = process.env.CODEX_WEB_VSCODE_CLI,
): Promise<string | null> {
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

async function configuredCodeCommandExists(
  command: string,
  commandExists: (command: string) => Promise<boolean>,
): Promise<boolean> {
  if (!command.includes("/") && !command.includes("\\")) {
    return commandExists(command);
  }
  try {
    await fs.access(command);
    return true;
  } catch {
    return false;
  }
}

async function resolveXftpCommand(
  commandExists: (command: string) => Promise<boolean>,
): Promise<string | null> {
  if (await commandExists("xsftp")) {
    return "xsftp";
  }
  if (await commandExists("xftp")) {
    return "xftp";
  }
  return null;
}

async function hasSystemOpenCommand(
  platform: NodeJS.Platform,
  commandExists: (command: string) => Promise<boolean>,
): Promise<boolean> {
  if (platform === "darwin" || platform === "win32") {
    return true;
  }
  return commandExists("xdg-open");
}

async function defaultCommandExists(command: string): Promise<boolean> {
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const pathEntry of pathEntries) {
    try {
      await fs.access(path.join(pathEntry, command));
      return true;
    } catch {
      // Keep scanning PATH.
    }
  }
  return false;
}

async function defaultIsDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

function defaultSpawnDetached(command: string, args: string[]): void {
  const subprocess = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  subprocess.on("error", (error) => {
    console.error(`[native-open] failed to spawn ${command}`, error);
  });
  subprocess.unref();
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function positiveIntegerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
