#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchBrowserPanelIframeAsset } from "./patch_browser_panel_iframe.mjs";
import { patchTerminalSidePanelSupport } from "./patch_terminal_side_panel.mjs";
import { patchWebviewThreadDeleteAssets } from "./patch_webview_thread_delete.mjs";
import { patchWebviewThreadDeleteI18nAssets } from "./patch_webview_thread_delete_i18n.mjs";

const STATSIG_OPTIONS_PATTERN =
  /(\b[$A-Za-z_][\w$]*\s*=\s*)\{\s*networkConfig\s*:\s*\{\s*api\s*:\s*([^,}]+?)\s*,\s*logEventUrl\s*:\s*([^,}]+?)\s*,\s*sdkExceptionUrl\s*:\s*([^,}]+?)\s*,\s*networkOverrideFunc\s*:\s*([^,}]+?)\s*,?\s*\}\s*,?\s*\}/s;
const PATCHED_STATSIG_OPTIONS_PATTERN =
  /\b[$A-Za-z_][\w$]*\s*=\s*\{\s*overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,\s*disableLogging\s*:\s*true\s*,\s*networkConfig\s*:\s*\{(?=[^}]*\bapi\s*:)(?=[^}]*\blogEventUrl\s*:)(?=[^}]*\bsdkExceptionUrl\s*:)(?=[^}]*\bpreventAllNetworkTraffic\s*:\s*true)(?=[^}]*\bnetworkOverrideFunc\s*:)[^}]*\}/s;
const PARTIAL_PATCHED_STATSIG_OPTIONS_PATTERN =
  /\b[$A-Za-z_][\w$]*\s*=\s*\{\s*overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,\s*networkConfig\s*:\s*\{(?=[^}]*\bapi\s*:)(?=[^}]*\blogEventUrl\s*:)(?=[^}]*\bsdkExceptionUrl\s*:)(?=[^}]*\bpreventAllNetworkTraffic\s*:\s*true)(?=[^}]*\bnetworkOverrideFunc\s*:)[^}]*\}/s;
const STATSIG_DISABLED_STORE_PATTERN =
  /if\(this\._loggingEnabled===`disabled`\)\{this\._storeEventToStorage\(([$A-Za-z_][\w$]*)\);return\}/;
const STATSIG_DISABLED_STALE_RETURN_PATTERN =
  /if\(this\._loggingEnabled===`disabled`\)return(?=this\._initFlushCoordinator\(\))/g;
const STATSIG_DISABLED_START_PATTERN =
  /(start\(\)\{let [$A-Za-z_][\w$]*=\(0,[$A-Za-z_][\w$]*\._isServerEnv\)\(\);)(?!if\(this\._loggingEnabled===`disabled`\)return;)/;
const REFETCH_QUERIES_CANCEL_REFETCH_PATTERN =
  /(refetchQueries\s*\([^)]*\)\s*\{[\s\S]*?\bcancelRefetch\s*:\s*[$A-Za-z_][\w$]*\.cancelRefetch\s*\?\?\s*)(!0|true)/s;
const PATCHED_REFETCH_QUERIES_CANCEL_REFETCH_PATTERN =
  /refetchQueries\s*\([^)]*\)\s*\{[\s\S]*?\bcancelRefetch\s*:\s*[$A-Za-z_][\w$]*\.cancelRefetch\s*\?\?\s*(!1|false)/s;
const DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN =
  /(\.\.\.([$A-Za-z_][\w$]*)===`conversational_onboarding`\?\[([$A-Za-z_][\w$]*)\]:\[\],)\.\.\.([$A-Za-z_][\w$]*)&&\2!==`conversational_onboarding`\?\[\.\.\.([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*)\]:\[\]/;
const DYNAMIC_TOOLS_UNGATED_ONBOARDING_PATTERN =
  /(\.\.\.([$A-Za-z_][\w$]*)===`conversational_onboarding`\?\[([$A-Za-z_][\w$]*)\]:\[\],)\.\.\.\2!==`conversational_onboarding`\?\[\.\.\.([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*)\]:\[\]/;
const PATCHED_DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN =
  /codexWebAutomationUpdateTool,\.\.\.[$A-Za-z_][\w$]*&&[$A-Za-z_][\w$]*!==`conversational_onboarding`\?\[\.\.\.[$A-Za-z_][\w$]*,[$A-Za-z_][\w$]*\]:\[\]/;
const DYNAMIC_TOOLS_FEATURE_GATE_PATTERN =
  /(?:,|\blet\s+)([$A-Za-z_][\w$]*)=[$A-Za-z_][\w$]*\?\.\[[^\]]+\]===!0/g;
const DYNAMIC_TOOLS_AUTOMATION_TOOL =
  "var codexWebAutomationUpdateTool={name:`automation_update`,description:`Create, update, view, or delete recurring automations in the Codex app. Use this when the user asks for an automation, recurring task, reminder, monitor, follow-up, or thread wakeup. Never create OS crontab, systemd timer, or launchd jobs for Codex automations.`,inputSchema:{type:`object`,additionalProperties:!0,properties:{id:{type:`string`},mode:{type:`string`,enum:[`view`,`create`,`update`,`delete`,`suggested_create`,`suggested_update`]},kind:{type:`string`,enum:[`cron`,`heartbeat`]},name:{type:`string`},prompt:{type:`string`},rrule:{type:`string`},cwds:{anyOf:[{type:`string`},{type:`array`,items:{type:`string`}}]},destination:{type:`string`,enum:[`thread`]},targetThreadId:{type:`string`},status:{type:`string`,enum:[`ACTIVE`,`PAUSED`,`DELETED`]},executionEnvironment:{type:`string`},localEnvironmentConfigPath:{type:`string`},model:{type:`string`},reasoningEffort:{type:`string`}}}};";
const AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN =
  /if\(!([$A-Za-z_][\w$]*)\(([$A-Za-z_][\w$]*)\)\)\{([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\(`Automations are only supported for local threads\.`\);break\}/;
const PATCHED_AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN =
  /if\(![$A-Za-z_][\w$]*\(([$A-Za-z_][\w$]*)\)&&\1!==`remote:default`\)\{[$A-Za-z_][\w$]*=[$A-Za-z_][\w$]*\(`Automations are only supported for local threads\.`\);break\}/;
const AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN =
  /let ([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\.safeParse\(([$A-Za-z_][\w$]*)\.arguments\);if\(!\1\.success\)\{\s*([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\(`\$\{([$A-Za-z_][\w$]*)\} received invalid arguments\.`\);break\}/;
const PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN =
  /executionEnvironment===`local`&&\([$A-Za-z_][\w$]*\.executionEnvironment=`worktree`\)/;
const PARTIAL_PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN =
  /\.safeParse\(\(\(\)=>\{let [$A-Za-z_][\w$]*=[$A-Za-z_][\w$]*\.arguments;if\(/;
const AUTOMATION_ARGUMENTS_INLINE_PARSE_PATTERN =
  /let ([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\.safeParse\(\(\(\)=>\{let [$A-Za-z_][\w$]*=([$A-Za-z_][\w$]*)\.arguments;[\s\S]*?\}\)\(\)\);if\(!\1\.success\)\{\s*([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\(`\$\{([$A-Za-z_][\w$]*)\} received invalid arguments\.`\);break\}/;

export function patchWebviewAssets(assetsDir) {
  const patchedFiles = [
    ...patchWebviewThreadDeleteAssets(assetsDir),
    ...patchWebviewThreadDeleteI18nAssets(assetsDir),
    ...patchTerminalSidePanelSupport(assetsDir),
    patchBrowserPanelIframeAsset(assetsDir),
    ...patchRefetchQueriesCancelRefetchAsset(assetsDir),
    patchStatsigTelemetryDisableAsset(assetsDir),
    patchStatsigTelemetryFlushDisableAsset(assetsDir),
    patchDynamicToolsAutomationAsset(assetsDir),
    patchAutomationRemoteDefaultHostAsset(assetsDir),
    patchAutomationArgumentsNormalizationAsset(assetsDir),
    ...patchInvalidCssPropertyInitialValuesAsset(assetsDir),
  ];

  return [...new Set(patchedFiles)];
}

export function patchInvalidCssPropertyInitialValuesSupport(source) {
  return source.replace(
    /(@property\s+--edge-fade-distance\s*\{\s*syntax:"<length>";\s*inherits:false;\s*initial-value:)1rem(\s*\})/g,
    "$116px$2",
  );
}

export function patchInvalidCssPropertyInitialValuesAsset(assetsDir) {
  const patchedFiles = [];
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith(".css")) {
      continue;
    }
    const assetPath = path.join(assetsDir, name);
    const source = fs.readFileSync(assetPath, "utf8");
    if (!source.includes("@property --edge-fade-distance")) {
      continue;
    }
    const patched = patchInvalidCssPropertyInitialValuesSupport(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    patchedFiles.push(assetPath);
  }
  return patchedFiles;
}

export function patchRefetchQueriesCancelRefetchSupport(source) {
  if (PATCHED_REFETCH_QUERIES_CANCEL_REFETCH_PATTERN.test(source)) {
    return source;
  }
  if (!REFETCH_QUERIES_CANCEL_REFETCH_PATTERN.test(source)) {
    throw new Error("refetchQueries cancelRefetch default not found");
  }
  return source.replace(
    REFETCH_QUERIES_CANCEL_REFETCH_PATTERN,
    (_match, prefix, truthy) => `${prefix}${truthy === "!0" ? "!1" : "false"}`,
  );
}

export function patchRefetchQueriesCancelRefetchAsset(assetsDir) {
  const patchedFiles = [];
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("refetchQueries") && source.includes("cancelRefetch")
      );
    });

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchRefetchQueriesCancelRefetchSupport(source);
    } catch {
      continue;
    }
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    patchedFiles.push(assetPath);
  }

  if (patchedFiles.length > 0) {
    return patchedFiles;
  }

  throw new Error(`refetchQueries asset not found in ${assetsDir}`);
}

export function patchStatsigTelemetryDisableSupport(source) {
  if (PATCHED_STATSIG_OPTIONS_PATTERN.test(source)) {
    return source;
  }
  if (
    !/disableLogging\s*:\s*true/.test(source) &&
    PARTIAL_PATCHED_STATSIG_OPTIONS_PATTERN.test(source)
  ) {
    const patched = source.replace(
      /(overrideAdapter\s*:\s*window\.__ELECTRON_SHIM__\.overrideAdapter\s*,?)/,
      "$1disableLogging:true,",
    );
    if (patched !== source) {
      return patched;
    }
  }
  if (!STATSIG_OPTIONS_PATTERN.test(source)) {
    throw new Error("Statsig init options not found");
  }
  return source.replace(
    STATSIG_OPTIONS_PATTERN,
    (_match, prefix, api, logEventUrl, sdkExceptionUrl, networkOverrideFunc) =>
      `${prefix}{overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:true,networkConfig:{api:${api.trim()},logEventUrl:${logEventUrl.trim()},sdkExceptionUrl:${sdkExceptionUrl.trim()},preventAllNetworkTraffic:true,networkOverrideFunc:${networkOverrideFunc.trim()}}}`,
  );
}

export function patchStatsigTelemetryDisableAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) =>
      fs.readFileSync(assetPath, "utf8").includes("networkOverrideFunc"),
    );

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchStatsigTelemetryDisableSupport(source);
    } catch {
      continue;
    }
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      return assetPath;
    }
    return assetPath;
  }

  throw new Error(`Statsig asset not found in ${assetsDir}`);
}

export function patchStatsigTelemetryFlushDisableSupport(source) {
  let patched = source.replace(
    STATSIG_DISABLED_STORE_PATTERN,
    "if(this._loggingEnabled===`disabled`)return;",
  );
  patched = patched.replace(
    STATSIG_DISABLED_STALE_RETURN_PATTERN,
    "if(this._loggingEnabled===`disabled`)return;",
  );
  patched = patched.replace(
    STATSIG_DISABLED_START_PATTERN,
    "$1if(this._loggingEnabled===`disabled`)return;",
  );
  if (
    patched === source &&
    !source.includes("this._loggingEnabled===`disabled`)return")
  ) {
    throw new Error("Statsig disabled flush behavior not found");
  }
  return patched;
}

export function patchStatsigTelemetryFlushDisableAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("_initFlushCoordinator") &&
        (source.includes("_storeEventToStorage") || source.includes("returnthis"))
      );
    });

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchStatsigTelemetryFlushDisableSupport(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    return assetPath;
  }

  throw new Error(`Statsig SDK asset not found in ${assetsDir}`);
}

export function patchDynamicToolsAutomationSupport(source) {
  if (PATCHED_DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN.test(source)) {
    return source.includes("codexWebAutomationUpdateTool={")
      ? source
      : insertDynamicToolsAutomationTool(source);
  }
  const gatedMatch = DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN.exec(source);
  const ungatedMatch = DYNAMIC_TOOLS_UNGATED_ONBOARDING_PATTERN.exec(source);
  const match = gatedMatch ?? ungatedMatch;
  if (match == null) {
    throw new Error("dynamic tools automation gate not found");
  }
  const onboardingGate =
    gatedMatch == null ? findLastDynamicToolsFeatureGate(source) ?? "C" : match[4];
  const patched = source.replace(
    gatedMatch == null
      ? DYNAMIC_TOOLS_UNGATED_ONBOARDING_PATTERN
      : DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN,
    (
      _match,
      prefix,
      threadStartKind,
      _onboardingTool,
      _gateOrTools,
      toolsOrTool,
      maybeTool,
    ) => {
      const onboardingTools = gatedMatch == null ? _gateOrTools : toolsOrTool;
      const onboardingTool = gatedMatch == null ? toolsOrTool : maybeTool;
      return `${prefix}codexWebAutomationUpdateTool,...${onboardingGate}&&${threadStartKind}!==\`conversational_onboarding\`?[...${onboardingTools},${onboardingTool}]:[]`;
    },
  );
  return insertDynamicToolsAutomationTool(patched);
}

function findLastDynamicToolsFeatureGate(source) {
  let gate = null;
  for (const match of source.matchAll(DYNAMIC_TOOLS_FEATURE_GATE_PATTERN)) {
    gate = match[1] ?? null;
  }
  return gate;
}

function insertDynamicToolsAutomationTool(source) {
  if (source.includes("codexWebAutomationUpdateTool={")) {
    return source;
  }
  if (!source.includes("var gr=100")) {
    throw new Error("dynamic tools insertion point not found");
  }
  return source.replace("var gr=100", `${DYNAMIC_TOOLS_AUTOMATION_TOOL}var gr=100`);
}

export function patchDynamicToolsAutomationAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("automation-host-support") &&
        source.includes("threadStartKind")
      );
    });

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchDynamicToolsAutomationSupport(source);
    } catch {
      continue;
    }
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    return assetPath;
  }

  throw new Error(`dynamic tools asset not found in ${assetsDir}`);
}

export function patchAutomationRemoteDefaultHostSupport(source) {
  if (PATCHED_AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN.test(source)) {
    return source;
  }
  if (!AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN.test(source)) {
    throw new Error("automation local host guard not found");
  }
  return source.replace(
    AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN,
    (_match, isLocalHost, hostId, resultLocal, errorLocal) =>
      `if(!${isLocalHost}(${hostId})&&${hostId}!==\`remote:default\`){${resultLocal}=${errorLocal}(\`Automations are only supported for local threads.\`);break}`,
  );
}

export function patchAutomationRemoteDefaultHostAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) =>
      fs
        .readFileSync(assetPath, "utf8")
        .includes("Automations are only supported for local threads."),
    );

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchAutomationRemoteDefaultHostSupport(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    return assetPath;
  }

  throw new Error(`automation host guard asset not found in ${assetsDir}`);
}

export function patchAutomationArgumentsNormalizationSupport(source) {
  if (PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(source)) {
    return source;
  }
  if (PARTIAL_PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(source)) {
    return source.replace(
      AUTOMATION_ARGUMENTS_INLINE_PARSE_PATTERN,
      (
        _match,
        parsed,
        schema,
        params,
        resultLocal,
        errorLocal,
        toolName,
      ) =>
        `let ${parsed}=${schema}.safeParse(${buildAutomationArgumentsNormalizerExpression(params, "o")});if(!${parsed}.success){${resultLocal}=${errorLocal}(\`\${${toolName}} received invalid arguments.\`);break}`,
    );
  }
  if (!AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(source)) {
    throw new Error("automation arguments safeParse not found");
  }
  const patched = source.replace(
    AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN,
    (
      _match,
      parsed,
      schema,
      params,
      resultLocal,
      errorLocal,
      toolName,
    ) =>
      `let ${parsed}=${schema}.safeParse(${buildAutomationArgumentsNormalizerExpression(params, "o")});if(!${parsed}.success){${resultLocal}=${errorLocal}(\`\${${toolName}} received invalid arguments.\`);break}`,
  );
  return patched;
}

function buildAutomationArgumentsNormalizerExpression(params, sourceThreadId) {
  return `(()=>{let e=${params}.arguments;if(e==null||typeof e!==\`object\`||Array.isArray(e))return e;let t={...e};if(typeof t.cwds===\`string\`)t.cwds=[t.cwds];if(typeof t.rrule===\`string\`){let e=t.rrule.split(\`\\n\`).find(e=>e.startsWith(\`RRULE:\`));e!=null&&(t.rrule=e),t.rrule.startsWith(\`RRULE:\`)&&(t.rrule=t.rrule.slice(6))}return t.mode===\`create\`&&t.kind==null&&(t.kind=\`cron\`),(t.mode===\`create\`||t.mode===\`update\`)&&(t.status==null&&(t.status=\`ACTIVE\`),t.model===void 0&&(t.model=null),t.model===\`\`&&(t.model=null),t.reasoningEffort===void 0&&(t.reasoningEffort=null),t.reasoningEffort===\`\`&&(t.reasoningEffort=null)),t.kind===\`cron\`&&(t.cwds==null&&(t.cwds=[]),t.executionEnvironment==null&&(t.executionEnvironment=\`worktree\`),t.executionEnvironment===\`\`&&(t.executionEnvironment=\`worktree\`),t.executionEnvironment===\`local\`&&(t.executionEnvironment=\`worktree\`),t.localEnvironmentConfigPath===void 0&&(t.localEnvironmentConfigPath=null),t.localEnvironmentConfigPath===\`\`&&(t.localEnvironmentConfigPath=null),delete t.destination,delete t.targetThreadId),t.destination===\`thread\`&&t.targetThreadId==null&&typeof ${sourceThreadId}===\`string\`&&t.kind===\`heartbeat\`&&(t.targetThreadId=${sourceThreadId}),t})()`;
}

export function patchAutomationArgumentsNormalizationAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        (source.includes("safeParse(a.arguments)") ||
          source.includes("let e=a.arguments")) &&
        source.includes("received invalid arguments")
      );
    });

  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchAutomationArgumentsNormalizationSupport(source);
    } catch {
      continue;
    }
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
    }
    return assetPath;
  }

  throw new Error(`automation arguments safeParse asset not found in ${assetsDir}`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewAssets(assetsDir);
  console.log(`Patched webview assets in ${patchedFiles.length} file(s)`);
}
