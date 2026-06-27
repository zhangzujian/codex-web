#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchBrowserPanelIframeAssets } from "./patch_browser_panel_iframe.mjs";
import { patchTerminalSidePanelSupport } from "./patch_terminal_side_panel.mjs";
import { patchWebviewAutomationsNavAssets } from "./patch_webview_automations_nav.mjs";
import { patchWebviewMobileSidebarAssets } from "./patch_webview_mobile_sidebar.mjs";
import { patchWebviewMobileTabLayoutAssets } from "./patch_webview_mobile_tab_layout.mjs";
import { patchWebviewTelemetryDisableAssets } from "./patch_webview_telemetry_disable.mjs";
import { patchWebviewTurnStreamingAssets } from "./patch_webview_turn_streaming.mjs";

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
const STATSIG_NOOP_CLIENT_PATTERN =
  /\(\s*([$A-Za-z_][\w$]*)\.Log\.warn\(`Attempting to retrieve a StatsigClient but none was set\.`\),\s*([$A-Za-z_][\w$]*)\.NoopEvaluationsClient\s*\)/;
const PATCHED_STATSIG_NOOP_CLIENT_PATTERN =
  /codexWebStatsigNoopClient\(\s*[$A-Za-z_][\w$]*\.NoopEvaluationsClient\s*\)/;
const STATSIG_NOOP_CLIENT_HELPER_NAME = "codexWebStatsigNoopClient";
const STATSIG_NOOP_CLIENT_HELPER =
  "function codexWebStatsigNoopClient(e){return new Proxy(e,{get(t,n,r){if(n===`getDynamicConfig`)return(n,r)=>{let i=t.getDynamicConfig(n,r);return window.__ELECTRON_SHIM__?.overrideAdapter?.getDynamicConfigOverride?.(i)??i};if(n===`getLayer`)return(n,r)=>{let i=t.getLayer(n,r);return window.__ELECTRON_SHIM__?.overrideAdapter?.getLayerOverride?.(i)??i};if(n===`getFeatureGate`)return(n,r)=>{let i=t.getFeatureGate(n,r);return window.__ELECTRON_SHIM__?.overrideAdapter?.getGateOverride?.(i)??i};if(n===`checkGate`)return(n,r)=>{let i=t.checkGate(n,r);return window.__ELECTRON_SHIM__?.overrideAdapter?.getGateOverride?.({name:n,value:i})?.value??i};return Reflect.get(t,n,r)}})}";
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
const EXISTING_AUTOMATION_TOOL_DEFINITION_PATTERN =
  /\b[$A-Za-z_][\w$]*\s*=\s*`automation_update`[\s\S]{0,3000}?\{name:[$A-Za-z_][\w$]*,description:[$A-Za-z_][\w$]*,inputSchema:/;
const DYNAMIC_TOOLS_FEATURE_GATE_PATTERN =
  /(?:,|\blet\s+)([$A-Za-z_][\w$]*)=[$A-Za-z_][\w$]*\?\.\[[^\]]+\]===!0/g;
const DYNAMIC_TOOLS_AUTOMATION_TOOL =
  "var codexWebAutomationUpdateTool={name:`automation_update`,description:`Create, update, view, or delete recurring automations in the Codex app. Use this when the user asks for an automation, recurring task, reminder, monitor, follow-up, or thread wakeup. Do not set model or reasoningEffort unless the user explicitly requests them; omitted values use the Codex configured defaults. Never create OS crontab, systemd timer, or launchd jobs for Codex automations.`,inputSchema:{type:`object`,additionalProperties:!0,properties:{id:{type:`string`},mode:{type:`string`,enum:[`view`,`create`,`update`,`delete`]},kind:{type:`string`,enum:[`cron`,`heartbeat`]},name:{type:`string`},prompt:{type:`string`},rrule:{type:`string`},cwds:{anyOf:[{type:`string`},{type:`array`,items:{type:`string`}}]},destination:{type:`string`,enum:[`thread`]},targetThreadId:{type:`string`},status:{type:`string`,enum:[`ACTIVE`,`PAUSED`,`DELETED`]},executionEnvironment:{type:`string`},localEnvironmentConfigPath:{type:`string`},model:{type:`string`},reasoningEffort:{type:`string`}}}};";
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
const AUTOMATION_REQUIRED_MODEL_PATTERN =
  /,\s*([$A-Za-z_][\w$]*)\.model\?\?([$A-Za-z_][\w$]*)\.push\(`model`\)/g;
const AUTOMATION_DRAFT_MODEL_DEFAULT_PATTERN =
  /function ([$A-Za-z_][\w$]*)\(\{draft:([$A-Za-z_][\w$]*),modelSettings:([$A-Za-z_][\w$]*)\}\)\{return \2\.kind===`heartbeat`\?\{\.\.\.\2,model:null,reasoningEffort:null\}:\3\.isLoading\|\|\2\.model!=null\?\2:\{\.\.\.\2,model:\3\.model,reasoningEffort:\3\.reasoningEffort\}\}/g;
const AUTOMATION_DRAFT_CRON_MODEL_REQUIRED_PATTERN =
  /if\(([$A-Za-z_][\w$]*)\.executionEnvironment==null\|\|\1\.model==null\)throw Error\(`Cron automation draft is incomplete`\);/g;
const AUTOMATION_DRAFT_HEARTBEAT_MODEL_FIELDS_PATTERN =
  /,model:null,reasoningEffort:null(?=,rrule:[$A-Za-z_][\w$]*)/g;
const AUTOMATION_DRAFT_CRON_MODEL_FIELDS_PATTERN =
  /,model:([$A-Za-z_][\w$]*)\.model,reasoningEffort:\1\.reasoningEffort(?=,rrule:[$A-Za-z_][\w$]*)/g;
const AUTOMATION_DRAFT_EDIT_MODEL_DEFAULT_PATTERN =
  /,model:([$A-Za-z_][\w$]*)\(([$A-Za-z_][\w$]*)\)\?null:([$A-Za-z_][\w$]*)\.model,reasoningEffort:\1\(\2\)\?null:\3\.reasoningEffort(?=,rawRrule:)/g;
const AUTOMATION_DRAFT_EDIT_MODEL_NORMALIZER_PATTERN =
  /let ([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\(\{automation:([$A-Za-z_][\w$]*),models:([$A-Za-z_][\w$]*)\?\?\[\]\}\);return(?=\{id:\3\.id)/g;
const AUTOMATION_DRAFT_TARGET_MODEL_DEFAULT_PATTERN =
  /(\blet\s+|,)([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)==null\?null:([$A-Za-z_][\w$]*)\(\{automation:\3,models:([$A-Za-z_][\w$]*)\?\?\[\]\}\)/g;
const AUTOMATION_DRAFT_TARGET_MODEL_FALLBACK_PATTERN =
  /,model:([$A-Za-z_][\w$]*)===`heartbeat`\?null:([$A-Za-z_][\w$]*)\.model\?\?([$A-Za-z_][\w$]*)\?\.model\?\?([$A-Za-z_][\w$]*)\.model,reasoningEffort:\1===`heartbeat`\?null:\2\.reasoningEffort\?\?\3\?\.reasoningEffort\?\?\4\.reasoningEffort(?=,rawRrule:)/g;
const AUTOMATION_MODEL_PICKER_SELECTED_MODEL_PATTERN =
  /([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)\?\.models\.find\(([$A-Za-z_][\w$]*)=>\3\.model===([$A-Za-z_][\w$]*)\)\?\?null;let ([^=]+)=([$A-Za-z_][\w$]*)\(\{model:\1,reasoningEffort:([$A-Za-z_][\w$]*)\}\)/g;
const AUTOMATION_MODEL_PICKER_LOADING_DEFAULT_PATTERN =
  /let ([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*)=([$A-Za-z_][\w$]*)==null\|\|([$A-Za-z_][\w$]*)\?\.models==null,([$A-Za-z_][\w$]*)=\4\?\?``,([$A-Za-z_][\w$]*)=\5\?\.models,([$A-Za-z_][\w$]*);/g;
const AUTOMATION_MODEL_PICKER_REASONING_SELECT_PATTERN =
  /b=e=>\{n!=null&&o\(n,e\)\}/g;
const AUTOMATION_MODEL_PICKER_LABEL_PATTERN =
  /w=n!=null&&n\.trim\(\)\.length>0\?\(0,Y\.jsx\)\(we,\{model:n,displayName:u\?\.displayName\?\?n,labelClassName:`text-token-foreground`\}\):\(0,Y\.jsx\)\(`span`,\{className:`truncate text-token-foreground`,children:c\.formatMessage\(\{id:`settings\.automations\.model\.loading`,defaultMessage:`Loading model`,description:`Fallback label while automation model options are loading`\}\)\}\)/g;
const AUTOMATION_NATIVE_MODE_PATTERN =
  /zt\(\[`view`,`create`,`update`,`delete`,`suggested_create`,`suggested_update`\]\)\.transform\(e=>\{switch\(e\)\{case`view`:return`view`;case`create`:return`create`;case`update`:return`update`;case`delete`:return`delete`;case`suggested_create`:return`suggested-create`;case`suggested_update`:return`suggested-update`\}\}\)/g;
const AUTOMATION_NATIVE_VIEW_DELETE_ID_PATTERN =
  /if\(e\.mode===`view`\|\|e\.mode===`delete`\)\{e\.id\?\?t\.addIssue\(\{code:`custom`,message:`Missing id`,path:\[`id`\]\}\);return\}/g;
const AUTOMATION_NATIVE_SUGGESTED_CREATE_PATTERN =
  /\|\|e\.mode===`suggested-create`/g;
const AUTOMATION_NATIVE_SUGGESTED_UPDATE_PATTERN =
  /\|\|e\.mode===`suggested-update`/g;
const AUTOMATION_NATIVE_OPTIONAL_FIELD_PATTERNS = [
  /,e\.kind\?\?t\.addIssue\(\{code:`custom`,message:`Missing kind`,path:\[`kind`\]\}\)/g,
  /,e\.status\?\?t\.addIssue\(\{code:`custom`,message:`Missing status`,path:\[`status`\]\}\)/g,
  /,e\.executionEnvironment\?\?t\.addIssue\(\{code:`custom`,message:`Missing executionEnvironment`,path:\[`executionEnvironment`\]\}\)/g,
  /,e\.model\?\?t\.addIssue\(\{code:`custom`,message:`Missing model`,path:\[`model`\]\}\)/g,
  /,e\.reasoningEffort\?\?t\.addIssue\(\{code:`custom`,message:`Missing reasoningEffort`,path:\[`reasoningEffort`\]\}\)/g,
];
const SETTINGS_SECTION_FILTER_ASSET_MARKERS = [
  "settings.hostDropdown.allSettings",
  ".filter(",
  "case`connections`",
  "groupSettingsSections:!0",
];
const SETTINGS_ALL_SETTINGS_SECTION_FILTER_PATCHES = [
  {
    name: "Connections",
    stale:
      /case`connections`:return ([$A-Za-z_][\w$]*)&&![$A-Za-z_][\w$]*(?=;case`usage`:)/,
    patched: /case`connections`:return [$A-Za-z_][\w$]*(?=;case`usage`:)/,
    replacement: (_match, featureGate) =>
      `case\`connections\`:return ${featureGate}`,
  },
];
const SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_PATTERN =
  /(\b[$A-Za-z_][\w$]*=\[(?=[^\]]*`profile`)(?=[^\]]*`agent`)(?=[^\]]*`mcp-settings`)(?=[^\]]*`hooks-settings`)(?=[^\]]*`data-controls`)(?![^\]]*`connections`)[^\]]*`hooks-settings`)([^\]]*\],[$A-Za-z_][\w$]*=`agent`)/;
const SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_WITH_CONNECTIONS_PATTERN =
  /\b[$A-Za-z_][\w$]*=\[(?=[^\]]*`profile`)(?=[^\]]*`agent`)(?=[^\]]*`mcp-settings`)(?=[^\]]*`hooks-settings`)(?=[^\]]*`data-controls`)(?=[^\]]*`connections`)[^\]]*\],[$A-Za-z_][\w$]*=`agent`/;
const SETTINGS_ARCHIVED_CHATS_LOCAL_THREADS_PATTERN =
  /(\blet\s+[$A-Za-z_][\w$]*=)([$A-Za-z_][\w$]*)===`local`\?([$A-Za-z_][\w$]*):\[\](?=,)/;
const PATCHED_SETTINGS_ARCHIVED_CHATS_LOCAL_THREADS_PATTERN =
  /(\blet\s+[$A-Za-z_][\w$]*=)\(([$A-Za-z_][\w$]*)===`local`\|\|\2===`remote:default`\)\?([$A-Za-z_][\w$]*):\[\](?=,)/;
const SETTINGS_ARCHIVED_CHATS_ASSET_MARKERS = [
  "settings.dataControls.archivedChats.empty",
  "queryKey:[`archived-threads`,",
  "localThreads:",
];
const APP_HEADER_NAVIGATION_BUTTONS_RENDER_PATTERN =
  /(viewTransitionName:`sidebar-trigger`[\s\S]{0,3600}?className:`flex items-center gap-1`,children:\[)([$A-Za-z_][\w$]*),([$A-Za-z_][\w$]*)(\]\})/;
const PATCHED_APP_HEADER_NAVIGATION_BUTTONS_RENDER_PATTERN =
  /viewTransitionName:`sidebar-trigger`[\s\S]{0,3600}?className:`flex items-center gap-1`,children:\[[$A-Za-z_][\w$]*\]\}/;

export function patchWebviewAssets(assetsDir) {
  const patchedFiles = [
    ...patchTerminalSidePanelSupport(assetsDir),
    ...patchBrowserPanelIframeAssets(assetsDir),
    ...patchRefetchQueriesCancelRefetchAsset(assetsDir),
    patchStatsigTelemetryDisableAsset(assetsDir),
    patchStatsigTelemetryFlushDisableAsset(assetsDir),
    ...patchWebviewTelemetryDisableAssets(assetsDir),
    ...patchWebviewTurnStreamingAssets(assetsDir),
    ...patchWebviewAutomationsNavAssets(assetsDir),
    ...patchWebviewMobileSidebarAssets(assetsDir),
    ...patchWebviewMobileTabLayoutAssets(assetsDir),
    patchStatsigNoopClientOverrideAsset(assetsDir),
    patchAppHeaderNavigationButtonsRenderAsset(assetsDir),
    patchSettingsAllSettingsSectionFiltersAsset(assetsDir),
    patchSettingsArchivedChatsRemoteDefaultAsset(assetsDir),
    patchDynamicToolsAutomationAsset(assetsDir),
    ...patchAutomationToolContractAsset(assetsDir),
    patchAutomationRemoteDefaultHostAsset(assetsDir),
    patchAutomationArgumentsNormalizationAsset(assetsDir),
    ...patchAutomationDefaultModelAsset(assetsDir),
    ...patchAutomationModelPickerAsset(assetsDir),
  ];

  const uniquePatchedFiles = [...new Set(patchedFiles)];
  verifyPatchedWebviewAssets(assetsDir, uniquePatchedFiles);
  return uniquePatchedFiles;
}

export function verifyPatchedWebviewAssets(assetsDir, patchedFiles) {
  checkPatchedAssetFileList(assetsDir, patchedFiles);
  checkPatchedJavaScriptFilesSyntax(webviewJavaScriptFiles(assetsDir));
  checkPatchedWebviewAssetInvariants(assetsDir);
}

function checkPatchedAssetFileList(assetsDir, filePaths) {
  const root = path.resolve(assetsDir);
  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(root + path.sep)) {
      throw new Error(`Patched asset is outside ${assetsDir}: ${filePath}`);
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Patched asset does not exist: ${filePath}`);
    }
  }
}

function checkPatchedWebviewAssetInvariants(assetsDir) {
  const failures = [];
  for (const filePath of webviewJavaScriptFiles(assetsDir)) {
    const source = fs.readFileSync(filePath, "utf8");
    const label = path.relative(assetsDir, filePath);
    if (path.basename(filePath) === "preload.js") {
      continue;
    }
    if (
      source.includes("refetchQueries") &&
      source.includes("cancelRefetch") &&
      patternMatches(REFETCH_QUERIES_CANCEL_REFETCH_PATTERN, source)
    ) {
      failures.push(
        `${label}: refetchQueries still defaults cancelRefetch to true`,
      );
    }
    if (patternMatches(STATSIG_OPTIONS_PATTERN, source)) {
      failures.push(
        `${label}: Statsig init options still allow network traffic`,
      );
    }
    if (patternMatches(STATSIG_DISABLED_STORE_PATTERN, source)) {
      failures.push(`${label}: disabled Statsig events are still stored`);
    }
    if (patternMatches(STATSIG_DISABLED_START_PATTERN, source)) {
      failures.push(`${label}: disabled Statsig flush loop can still start`);
    }
    if (patternMatches(STATSIG_NOOP_CLIENT_PATTERN, source)) {
      failures.push(`${label}: Statsig noop client ignores browser overrides`);
    }
    if (source.includes("returnthis")) {
      failures.push(`${label}: contains malformed returnthis token`);
    }
    const isDynamicToolsAsset =
      source.includes("automation-host-support") &&
      source.includes("threadStartKind");
    if (
      isDynamicToolsAsset &&
      (patternMatches(DYNAMIC_TOOLS_AUTOMATION_GATE_PATTERN, source) ||
        patternMatches(DYNAMIC_TOOLS_UNGATED_ONBOARDING_PATTERN, source))
    ) {
      failures.push(`${label}: automation_update tool was not inserted`);
    }
    if (patternMatches(AUTOMATION_REMOTE_DEFAULT_HOST_PATTERN, source)) {
      failures.push(`${label}: automations still reject remote:default`);
    }
    if (patternMatches(AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN, source)) {
      failures.push(`${label}: automation arguments are still parsed raw`);
    }
    for (const patch of SETTINGS_ALL_SETTINGS_SECTION_FILTER_PATCHES) {
      if (patternMatches(patch.stale, source)) {
        failures.push(`${label}: All settings still hides ${patch.name}`);
      }
    }
    if (
      SETTINGS_SECTION_FILTER_ASSET_MARKERS.every((marker) =>
        source.includes(marker),
      ) &&
      patternMatches(
        SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_WITH_CONNECTIONS_PATTERN,
        source,
      )
    ) {
      failures.push(
        `${label}: remote host-specific settings still show Connections`,
      );
    }
    if (
      patternMatches(AUTOMATION_REQUIRED_MODEL_PATTERN, source) ||
      patternMatches(AUTOMATION_DRAFT_CRON_MODEL_REQUIRED_PATTERN, source)
    ) {
      failures.push(
        `${label}: cron automations still require an explicit model`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Patched webview asset verification failed:\n${failures.join("\n")}`,
    );
  }
}

function patternMatches(pattern, source) {
  pattern.lastIndex = 0;
  return pattern.test(source);
}

function insertAfterImports(source, insertion) {
  if (source.includes(`function ${STATSIG_NOOP_CLIENT_HELPER_NAME}(`)) {
    return source;
  }
  const imports = /^(?:\s*import[\s\S]*?;\s*)+/.exec(source);
  if (!imports) {
    return `${insertion};${source}`;
  }
  return `${source.slice(0, imports[0].length)}${insertion};${source.slice(
    imports[0].length,
  )}`;
}

function webviewJavaScriptFiles(assetsDir) {
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));
}

function patchSingleWebviewAsset(assetsDir, candidates, label, patchSource) {
  const matches = [];
  for (const assetPath of candidates) {
    const source = fs.readFileSync(assetPath, "utf8");
    let patched;
    try {
      patched = patchSource(source);
    } catch {
      continue;
    }
    matches.push({ assetPath, patched, source });
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `${label} asset not found in ${assetsDir}`
        : `Expected one ${label} asset, found ${matches.length}`,
    );
  }

  const [{ assetPath, patched, source }] = matches;
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return assetPath;
}

function patchOptionalSingleWebviewAsset(candidates, label, patchSource) {
  const matches = candidates.map((assetPath) => {
    const source = fs.readFileSync(assetPath, "utf8");
    return { assetPath, patched: patchSource(source), source };
  });

  if (matches.length === 0) {
    return [];
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} asset, found ${matches.length}`);
  }

  const [{ assetPath, patched, source }] = matches;
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched);
  }
  return [assetPath];
}

export function checkPatchedJavaScriptFilesSyntax(filePaths) {
  const jsFiles = [...new Set(filePaths)].filter((filePath) =>
    filePath.endsWith(".js"),
  );
  if (jsFiles.length === 0) {
    return;
  }

  const checker = `
    import fs from "node:fs";
    import fsp from "node:fs/promises";
    import vm from "node:vm";
    const files = JSON.parse(fs.readFileSync(0, "utf8"));
    const failures = [];
    for (const filePath of files) {
      try {
        new vm.SourceTextModule(await fsp.readFile(filePath, "utf8"), {
          identifier: filePath,
        });
      } catch (error) {
        if (error?.name !== "SyntaxError") throw error;
        failures.push(filePath + "\\n" + (error.stack || error.message));
      }
    }
    if (failures.length > 0) {
      console.error(failures.join("\\n\\n"));
      process.exit(1);
    }
  `;
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-vm-modules",
      "--input-type=module",
      "--eval",
      checker,
    ],
    {
      encoding: "utf8",
      input: JSON.stringify(jsFiles),
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Invalid JavaScript syntax in patched file(s)\n${result.stderr || result.stdout}`,
    );
  }
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
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "Statsig",
    patchStatsigTelemetryDisableSupport,
  );
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
        (source.includes("_storeEventToStorage") ||
          source.includes("returnthis"))
      );
    });
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "Statsig SDK",
    patchStatsigTelemetryFlushDisableSupport,
  );
}

export function patchStatsigNoopClientOverrideSupport(source) {
  if (PATCHED_STATSIG_NOOP_CLIENT_PATTERN.test(source)) {
    return source.includes(`function ${STATSIG_NOOP_CLIENT_HELPER_NAME}(`)
      ? source
      : insertAfterImports(source, STATSIG_NOOP_CLIENT_HELPER);
  }
  if (!STATSIG_NOOP_CLIENT_PATTERN.test(source)) {
    throw new Error("Statsig noop client fallback not found");
  }
  const patched = source.replace(
    STATSIG_NOOP_CLIENT_PATTERN,
    (_match, log, statsig) =>
      `(${log}.Log.warn(\`Attempting to retrieve a StatsigClient but none was set.\`),${STATSIG_NOOP_CLIENT_HELPER_NAME}(${statsig}.NoopEvaluationsClient))`,
  );
  return insertAfterImports(patched, STATSIG_NOOP_CLIENT_HELPER);
}

export function patchStatsigNoopClientOverrideAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) =>
      fs
        .readFileSync(assetPath, "utf8")
        .includes("Attempting to retrieve a StatsigClient but none was set."),
    );
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "Statsig noop client",
    patchStatsigNoopClientOverrideSupport,
  );
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
    gatedMatch == null
      ? (findLastDynamicToolsFeatureGate(source) ?? "C")
      : match[4];
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
  return source.replace(
    "var gr=100",
    `${DYNAMIC_TOOLS_AUTOMATION_TOOL}var gr=100`,
  );
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
  if (candidates.length > 0) {
    return patchSingleWebviewAsset(
      assetsDir,
      candidates,
      "dynamic tools",
      patchDynamicToolsAutomationSupport,
    );
  }

  const existingAutomationToolAssets = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) =>
      EXISTING_AUTOMATION_TOOL_DEFINITION_PATTERN.test(
        fs.readFileSync(assetPath, "utf8"),
      ),
    );
  if (existingAutomationToolAssets.length > 0) {
    if (existingAutomationToolAssets.length !== 1) {
      throw new Error(
        `Expected one dynamic tools asset, found ${existingAutomationToolAssets.length}`,
      );
    }
    return existingAutomationToolAssets[0];
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
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "automation host guard",
    patchAutomationRemoteDefaultHostSupport,
  );
}

export function patchAutomationArgumentsNormalizationSupport(source) {
  let patched = source.replace(
    /Use suggested_create or suggested_update so the user can review and approve the setup-capable automation, or set localEnvironmentConfigPath to null\./g,
    "Set localEnvironmentConfigPath to null.",
  );

  if (PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(patched)) {
    return patched;
  }
  if (PARTIAL_PATCHED_AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(patched)) {
    return patched.replace(
      AUTOMATION_ARGUMENTS_INLINE_PARSE_PATTERN,
      (_match, parsed, schema, params, resultLocal, errorLocal, toolName) =>
        `let ${parsed}=${schema}.safeParse(${buildAutomationArgumentsNormalizerExpression(params, "o")});if(!${parsed}.success){${resultLocal}=${errorLocal}(\`\${${toolName}} received invalid arguments.\`);break}`,
    );
  }
  if (!AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN.test(patched)) {
    throw new Error("automation arguments safeParse not found");
  }
  patched = patched.replace(
    AUTOMATION_ARGUMENTS_SAFE_PARSE_PATTERN,
    (_match, parsed, schema, params, resultLocal, errorLocal, toolName) =>
      `let ${parsed}=${schema}.safeParse(${buildAutomationArgumentsNormalizerExpression(params, "o")});if(!${parsed}.success){${resultLocal}=${errorLocal}(\`\${${toolName}} received invalid arguments.\`);break}`,
  );
  return patched;
}

function buildAutomationArgumentsNormalizerExpression(params, sourceThreadId) {
  return `(()=>{let e=${params}.arguments;if(e==null||typeof e!==\`object\`||Array.isArray(e))return e;let t={...e};if(typeof t.cwds===\`string\`)t.cwds=[t.cwds];if(typeof t.rrule===\`string\`){let e=t.rrule.split(\`\\n\`).find(e=>e.startsWith(\`RRULE:\`));e!=null&&(t.rrule=e),t.rrule.startsWith(\`RRULE:\`)&&(t.rrule=t.rrule.slice(6))}return t.mode===\`create\`&&t.kind==null&&(t.kind=\`cron\`),(t.mode===\`create\`||t.mode===\`update\`)&&(t.model===\`\`&&delete t.model,t.reasoningEffort===\`\`&&delete t.reasoningEffort),t.kind===\`cron\`&&(t.cwds==null&&(t.cwds=[]),t.executionEnvironment==null&&(t.executionEnvironment=\`worktree\`),t.executionEnvironment===\`\`&&(t.executionEnvironment=\`worktree\`),t.executionEnvironment===\`local\`&&(t.executionEnvironment=\`worktree\`),t.localEnvironmentConfigPath===\`\`&&delete t.localEnvironmentConfigPath,delete t.destination,delete t.targetThreadId),t.destination===\`thread\`&&t.targetThreadId==null&&typeof ${sourceThreadId}===\`string\`&&t.kind===\`heartbeat\`&&(t.targetThreadId=${sourceThreadId}),t})()`;
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
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "automation arguments safeParse",
    patchAutomationArgumentsNormalizationSupport,
  );
}

export function patchAutomationDefaultModelSupport(source) {
  return source
    .replace(AUTOMATION_REQUIRED_MODEL_PATTERN, "")
    .replace(
      AUTOMATION_DRAFT_MODEL_DEFAULT_PATTERN,
      "function $1({draft:$2}){return $2}",
    )
    .replace(
      AUTOMATION_DRAFT_CRON_MODEL_REQUIRED_PATTERN,
      "if($1.executionEnvironment==null)throw Error(`Cron automation draft is incomplete`);",
    )
    .replace(AUTOMATION_DRAFT_HEARTBEAT_MODEL_FIELDS_PATTERN, "")
    .replace(
      AUTOMATION_DRAFT_CRON_MODEL_FIELDS_PATTERN,
      ",...$1.model==null?{}:{model:$1.model},...$1.reasoningEffort==null?{}:{reasoningEffort:$1.reasoningEffort}",
    )
    .replace(
      AUTOMATION_DRAFT_EDIT_MODEL_DEFAULT_PATTERN,
      ",model:$1($2)?null:$2.model??null,reasoningEffort:$1($2)?null:$2.reasoningEffort??null",
    )
    .replace(AUTOMATION_DRAFT_EDIT_MODEL_NORMALIZER_PATTERN, "return")
    .replace(
      AUTOMATION_DRAFT_TARGET_MODEL_DEFAULT_PATTERN,
      "$1$2=$3==null?null:{model:$3.model??null,reasoningEffort:$3.reasoningEffort??null}",
    )
    .replace(
      AUTOMATION_DRAFT_TARGET_MODEL_FALLBACK_PATTERN,
      ",model:$1===`heartbeat`?null:$2.model??$3?.model??null,reasoningEffort:$1===`heartbeat`?null:$2.reasoningEffort??$3?.reasoningEffort??null",
    );
}

export function patchAutomationDefaultModelAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("missingRequirements") &&
        ((source.includes(".model??") && source.includes(".push(`model`)")) ||
          source.includes("modelSettings") ||
          source.includes("model:e.model,reasoningEffort:e.reasoningEffort"))
      );
    });
  return patchOptionalSingleWebviewAsset(
    candidates,
    "automation default model",
    patchAutomationDefaultModelSupport,
  );
}

export function patchAutomationModelPickerSupport(source) {
  return source
    .replace(
      AUTOMATION_MODEL_PICKER_SELECTED_MODEL_PATTERN,
      "$1=$2?.models.find($3=>$3.model===($4??$2?.defaultModel?.model))??$2?.defaultModel??null;let $5=$6({model:$1,reasoningEffort:$7})",
    )
    .replace(
      AUTOMATION_MODEL_PICKER_LOADING_DEFAULT_PATTERN,
      "let $1=$2,$3=$5?.models==null,$6=$4??$5?.defaultModel?.model??``,$7=$5?.models,$8;",
    )
    .replace(
      AUTOMATION_MODEL_PICKER_REASONING_SELECT_PATTERN,
      "b=e=>{v.trim().length>0&&o(v,e)}",
    )
    .replace(
      AUTOMATION_MODEL_PICKER_LABEL_PATTERN,
      "w=v.trim().length>0?(0,Y.jsx)(we,{model:v,displayName:u?.displayName??v,labelClassName:`text-token-foreground`}):(0,Y.jsx)(`span`,{className:`truncate text-token-foreground`,children:c.formatMessage({id:`settings.automations.model.loading`,defaultMessage:`Loading model`,description:`Fallback label while automation model options are loading`})})",
    );
}

export function patchAutomationModelPickerAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("settings.automations.model.loading") &&
        source.includes("settings.automations.modelAndReasoning.ariaLabel") &&
        patchAutomationModelPickerSupport(source) !== source
      );
    });
  return patchOptionalSingleWebviewAsset(
    candidates,
    "automation model picker",
    patchAutomationModelPickerSupport,
  );
}

export function patchAutomationToolContractSupport(source) {
  let patched = source
    .replace(
      AUTOMATION_NATIVE_MODE_PATTERN,
      "zt([`view`,`create`,`update`,`delete`])",
    )
    .replace(
      AUTOMATION_NATIVE_VIEW_DELETE_ID_PATTERN,
      "if(e.mode===`view`)return;if(e.mode===`delete`){e.id??t.addIssue({code:`custom`,message:`Missing id`,path:[`id`]});return}",
    )
    .replace(AUTOMATION_NATIVE_SUGGESTED_CREATE_PATTERN, "")
    .replace(AUTOMATION_NATIVE_SUGGESTED_UPDATE_PATTERN, "")
    .replace(/suggested_create or suggested_update/g, "create or update")
    .replace(/suggested_create\/suggested_update/g, "create/update")
    .replace(/, suggested_create, and suggested_update/g, "")
    .replace(/, suggested_create, or suggested_update/g, "")
    .replace(/, and mode=suggested_update/g, "")
    .replace(/ and mode=suggested_create/g, "")
    .replace(
      /Required for mode=view, mode=update, mode=delete\./g,
      "Required for mode=update and mode=delete.",
    )
    .replace(
      /Use view to show an existing automation, create\/update\/delete to mutate immediately, and create\/update to present a proposal for the user to review\./g,
      "Use view to list automations and create/update/delete to mutate immediately.",
    )
    .replace(
      /,model:e\.model\?\?null,reasoningEffort:e\.reasoningEffort\?\?null(?=,rrule:e\.rrule\?\?``)/g,
      ",...e.model===void 0?{}:{model:e.model},...e.reasoningEffort===void 0?{}:{reasoningEffort:e.reasoningEffort}",
    )
    .replace(/,model:null,reasoningEffort:null(?=,rrule:e\.rrule\?\?``)/g, "")
    .replace(/Use suggested_create or suggested_update[^`]*\./g, "")
    .replace(
      /Model to use for cron automations\./g,
      "Optional model override for cron automations.",
    )
    .replace(
      /Reasoning effort to use for cron automations\.[^`]*/g,
      "Optional reasoning effort override for cron automations. Do not set model or reasoningEffort unless explicitly requested.",
    );

  for (const pattern of AUTOMATION_NATIVE_OPTIONAL_FIELD_PATTERNS) {
    patched = patched.replace(pattern, "");
  }
  return patched;
}

export function patchAutomationToolContractAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return (
        source.includes("Required for mode=view") ||
        source.includes("Missing reasoningEffort") ||
        source.includes(
          "model:e.model??null,reasoningEffort:e.reasoningEffort??null",
        ) ||
        source.includes("Use view to list automations")
      );
    });
  return patchOptionalSingleWebviewAsset(
    candidates,
    "automation tool contract",
    patchAutomationToolContractSupport,
  );
}

export function patchSettingsAllSettingsSectionFiltersSupport(source) {
  let patched = source;
  for (const patch of SETTINGS_ALL_SETTINGS_SECTION_FILTER_PATCHES) {
    if (patch.patched.test(patched)) {
      continue;
    }
    if (!patch.stale.test(patched)) {
      throw new Error(`settings ${patch.name} visibility guard not found`);
    }
    patched = patched.replace(patch.stale, patch.replacement);
  }
  if (
    SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_WITH_CONNECTIONS_PATTERN.test(
      patched,
    )
  ) {
    patched = patched.replace(
      SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_WITH_CONNECTIONS_PATTERN,
      (match) =>
        match.replace(/,?`connections`,?/, (item) =>
          item.startsWith(",") && item.endsWith(",") ? "," : "",
        ),
    );
  } else if (!SETTINGS_HOST_SPECIFIC_SECTION_ALLOWLIST_PATTERN.test(patched)) {
    throw new Error("settings host-specific section allowlist not found");
  }
  return patched;
}

export function patchSettingsConnectionsAllSettingsSupport(source) {
  return patchSettingsAllSettingsSectionFiltersSupport(source);
}

export function patchSettingsAllSettingsSectionFiltersAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return SETTINGS_SECTION_FILTER_ASSET_MARKERS.every((marker) =>
        source.includes(marker),
      );
    });
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "settings page",
    patchSettingsAllSettingsSectionFiltersSupport,
  );
}

export function patchSettingsConnectionsAllSettingsAsset(assetsDir) {
  return patchSettingsAllSettingsSectionFiltersAsset(assetsDir);
}

export function patchSettingsArchivedChatsRemoteDefaultSupport(source) {
  if (PATCHED_SETTINGS_ARCHIVED_CHATS_LOCAL_THREADS_PATTERN.test(source)) {
    return source;
  }
  if (!SETTINGS_ARCHIVED_CHATS_LOCAL_THREADS_PATTERN.test(source)) {
    throw new Error("settings archived chats local thread source not found");
  }
  return source.replace(
    SETTINGS_ARCHIVED_CHATS_LOCAL_THREADS_PATTERN,
    (_match, prefix, hostId, localThreads) =>
      `${prefix}(${hostId}===\`local\`||${hostId}===\`remote:default\`)?${localThreads}:[]`,
  );
}

export function patchSettingsArchivedChatsRemoteDefaultAsset(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name))
    .filter((assetPath) => {
      const source = fs.readFileSync(assetPath, "utf8");
      return SETTINGS_ARCHIVED_CHATS_ASSET_MARKERS.every((marker) =>
        source.includes(marker),
      );
    });
  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "settings archived chats",
    patchSettingsArchivedChatsRemoteDefaultSupport,
  );
}

export function patchAppHeaderNavigationButtonsRenderSupport(source) {
  if (PATCHED_APP_HEADER_NAVIGATION_BUTTONS_RENDER_PATTERN.test(source)) {
    return source;
  }
  if (!APP_HEADER_NAVIGATION_BUTTONS_RENDER_PATTERN.test(source)) {
    throw new Error("app header navigation button render target not found");
  }
  return source.replace(APP_HEADER_NAVIGATION_BUTTONS_RENDER_PATTERN, "$1$2$4");
}

export function patchAppHeaderNavigationButtonsRenderAsset(assetsDir) {
  const candidates = webviewJavaScriptFiles(assetsDir).filter((assetPath) => {
    const source = fs.readFileSync(assetPath, "utf8");
    return (
      source.includes("viewTransitionName:`sidebar-trigger`") &&
      source.includes("sidebar_back") &&
      source.includes("sidebar_forward")
    );
  });

  if (candidates.length === 0) {
    throw new Error(`app header shell asset not found in ${assetsDir}`);
  }

  return patchSingleWebviewAsset(
    assetsDir,
    candidates,
    "app header shell",
    patchAppHeaderNavigationButtonsRenderSupport,
  );
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
