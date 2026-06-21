#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPEN_TARGET_LABEL_HELPER =
  "function codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";
const OPEN_TARGET_FORMAT_LABEL_HELPER =
  "function codexFormatOpenTargetLabel(e,t){let n=codexOpenTargetLabel(e);return n&&typeof n==`object`&&typeof n.id==`string`&&typeof n.defaultMessage==`string`?t(n):n}";
const OPEN_TARGET_LABEL_NODE_HELPER_NAME =
  "function codexOpenTargetLabelNode";
const OPEN_TARGET_LOCALE_HELPER =
  "function codexWebOpenTargetLocale(){let e=[globalThis.__codexOpenTargetLocale],t=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`];for(let n of t)try{let t=localStorage.getItem(n);if(t){e.push(t);try{let n=JSON.parse(t);typeof n==`string`?e.push(n):n&&typeof n==`object`&&e.push(n.locale,n.language,n.appLocale,n.appLanguage,n.ideLocale,n.value)}catch{}}}catch{}e.push(document.documentElement.lang,navigator.language);for(let t of e){if(typeof t!=`string`)continue;let e=t.trim();if(e)return e}return``}";
const OPEN_TARGET_LOCALE_HELPER_NAME =
  "function codexWebOpenTargetLocale";
const LEGACY_OPEN_TARGET_LOCALE_HELPERS = Object.freeze([
  "function codexWebOpenTargetLocale(){let e=[`codex-web.locale`,`codex-web.app.locale`,`codex-web.appLanguage`,`codex.locale`,`app.locale`,`locale`,`language`],t=[];for(let n of e)try{let e=localStorage.getItem(n);if(e){t.push(e);try{let n=JSON.parse(e);typeof n==`string`?t.push(n):n&&typeof n==`object`&&t.push(n.locale,n.language,n.appLocale,n.appLanguage,n.ideLocale,n.value)}catch{}}}catch{}t.push(document.documentElement.lang,navigator.language);for(let e of t){if(typeof e!=`string`)continue;let t=e.trim();if(t)return t}return``}",
]);
const OPEN_TARGET_SET_LOCALE_HELPER =
  "function codexSetWebOpenTargetLocale(e){globalThis.__codexOpenTargetLocale=e}";
const OPEN_TARGET_SET_LOCALE_HELPER_NAME =
  "function codexSetWebOpenTargetLocale";
const OPEN_TARGET_LOCALIZE_TARGETS_HELPER =
  "function codexLocalizeOpenTargets(e){return Array.isArray(e)?e.map(e=>{let t=codexWebOpenTargetLocale().trim().replaceAll(`_`,`-`).toLowerCase();if(!(t===`zh`||t.startsWith(`zh-`)))return e;return e.labelKey===`openTarget.systemDefault`?{...e,label:`默认应用`}:e.labelKey===`openTarget.fileManager`?{...e,label:`文件管理器`}:e}):e}";
const OPEN_TARGET_LOCALIZE_TARGETS_HELPER_NAME =
  "function codexLocalizeOpenTargets";
const OPEN_TARGET_WORKSPACE_LOCALE_HELPER =
  "function codexWorkspaceOpenTargetLocale(){codexSetWebOpenTargetLocale(codexReadSignal(codexAppIntlSignal)?.locale);return codexWebOpenTargetLocale()}";
const OPEN_TARGET_WORKSPACE_LOCALE_HELPER_NAME =
  "function codexWorkspaceOpenTargetLocale";

const CONTEXT_MENU_VALUES_HELPER =
  "function codexFormatMessageValues(e,t){if(e==null)return e;let n={};for(let[r,i]of Object.entries(e))n[r]=i&&typeof i==`object`&&typeof i.id==`string`&&typeof i.defaultMessage==`string`?t(i):i;return n}";
const CONTEXT_MENU_REACT_VALUES_HELPER_NAME =
  "function codexFormatReactMessageValues";
const CONTEXT_MENU_PATTERN =
  "function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,e.messageValues):e.id,i=e.tooltipMessage?t(e.tooltipMessage,e.tooltipMessageValues):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}";
const PATCHED_CONTEXT_MENU = `${CONTEXT_MENU_VALUES_HELPER}function m(e,t){return e.map(e=>{if(e.type===\`separator\`)return{...e,nativeLabel:\`\`,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,codexFormatMessageValues(e.messageValues,t)):e.id,i=e.tooltipMessage?t(e.tooltipMessage,codexFormatMessageValues(e.tooltipMessageValues,t)):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}`;
const CONTEXT_MENU_REACT_RENDERER_PATTERN =
  /function\s+([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2\.message\?\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*),\{\.\.\.\2\.message,values:\2\.messageValues\}\):\2\.id\}/;

const OPEN_TARGET_LABEL_VALUE_PATTERN =
  /messageValues:\{target:([A-Za-z_$][\w$]*)\.label\}/g;
const ARTIFACT_PREVIEW_OPEN_TOOLTIP_PATTERN =
  /([A-Za-z_$][\w$]*)\.formatMessage\(\{id:`artifactTab\.preview\.openPrimaryTarget\.tooltip`,defaultMessage:`Open in \{target\}`,description:`Tooltip for opening an artifact in the primary app`\},\{target:([A-Za-z_$][\w$]*)\.label\}\)/g;
const ARTIFACT_PREVIEW_OPEN_ITEM_LABEL_PATTERN =
  /(\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.ItemIcon,\{children:\(0,\2\.jsx\)\(`img`,\{alt:``,src:([A-Za-z_$][\w$]*)\.icon,className:`icon-sm`\}\)\}\)),\4\.label/g;
const ARTIFACT_PREVIEW_OPEN_TARGET_PARAMS_PATTERN =
  /([A-Za-z_$][\w$]*=\{cwd:[A-Za-z_$][\w$]*,hostId:[A-Za-z_$][\w$]*,path:[A-Za-z_$][\w$]*,)(\.\.\.[A-Za-z_$][\w$]*\?\{deferEnrichment:!0\}:\{\}\})/g;
const FILE_TREE_OPEN_TARGETS_DATA_PATTERN =
  /function\s+([A-Za-z_$][\w$]*)\(\{cwd:([A-Za-z_$][\w$]*),fallbackOpenTargets:([A-Za-z_$][\w$]*),hostId:([A-Za-z_$][\w$]*),queryClient:([A-Za-z_$][\w$]*),targetPath:([A-Za-z_$][\w$]*)\}\)\{if\(\6==null\)return\{isLoadingOpenTargets:!1,primaryTarget:null,visibleTargets:\[\]\};let\s+([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(`open-in-targets`,\{cwd:\2,hostId:\4,path:\6\}\),([A-Za-z_$][\w$]*)=\5\.getQueryData\(\7\),([A-Za-z_$][\w$]*)=\9\?\.targets\?\?\3\.targets,/;
const FILE_TREE_OPEN_TARGETS_PREFETCH_PATTERN =
  /queryKey:([A-Za-z_$][\w$]*)\(`open-in-targets`,\{cwd:([A-Za-z_$][\w$]*),hostId:([A-Za-z_$][\w$]*),path:([A-Za-z_$][\w$]*)\}\),queryFn:\(\)=>([A-Za-z_$][\w$]*)\(`open-in-targets`,\{params:\{cwd:\2,hostId:\3,path:\4\}\}\)/g;
const FILE_TREE_APP_SCOPE_IMPORT_PATTERN =
  /import\{Z as ([A-Za-z_$][\w$]*)\}from"\.\/(app-scope-[^"]+\.js)";/;
const FILE_TREE_LOCALE_RENDER_PATTERN =
  /,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\(\)\),\{platform:([A-Za-z_$][\w$]*)\}=([A-Za-z_$][\w$]*)\(\),/;

const THREAD_APP_SHELL_APP_SCOPE_IMPORT_PATTERN =
  /import\{([^}]*)\}from"\.\/(app-scope-[^"]+\.js)";/;
const THREAD_APP_SHELL_OPEN_TARGETS_PATTERN =
  /let\{canLoadTargets:([A-Za-z_$][\w$]*),preferredTarget:([A-Za-z_$][\w$]*),targets:([A-Za-z_$][\w$]*),availableTargets:([A-Za-z_$][\w$]*),hasLoadedTargets:([A-Za-z_$][\w$]*),open:([A-Za-z_$][\w$]*)\}=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\);if\(!([A-Za-z_$][\w$]*)\|\|!\1\)return null;/;
const THREAD_APP_SHELL_OPEN_TOOLTIP_PATTERN =
  /([A-Za-z_$][\w$]*)\.formatMessage\(\{id:`localConversationPage\.openPrimaryTarget\.tooltip`,defaultMessage:`Open in \{target\}`,description:`Tooltip for the primary open button`\},\{target:([A-Za-z_$][\w$]*)\.label\}\)/g;

const WORKSPACE_FILE_CONTEXT_PATTERN =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";
const PATCHED_WORKSPACE_FILE_CONTEXT =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:codexOpenTargetLabel(e)},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";
const WORKSPACE_FILE_OPEN_TARGETS_QUERY_PATTERN =
  /function\s+([A-Za-z_$][\w$]*)\(\{cwd:([A-Za-z_$][\w$]*),hostId:([A-Za-z_$][\w$]*),path:([A-Za-z_$][\w$]*)\}\)\{return\{gcTime:([A-Za-z_$][\w$]*)\.INFINITE,queryKey:([A-Za-z_$][\w$]*)\(`open-in-targets`,\{cwd:\2,hostId:\3,path:\4\}\),queryFn:\(\)=>([A-Za-z_$][\w$]*)\(`open-in-targets`,\{params:\{cwd:\2,hostId:\3,path:\4\}\}\),staleTime:\5\.ONE_MINUTE\}\}/;
const WORKSPACE_FILE_OPEN_TARGETS_SELECTION_PATTERN =
  /function\s+([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return\{primaryTarget:([A-Za-z_$][\w$]*)\(\{preferredTarget:\2\?\.preferredTarget\?\?null,targets:\2\?\.targets\?\?\[\],availableTargets:\2\?\.availableTargets\?\?\[\],mode:\2\?\.mode\}\),visibleTargets:([A-Za-z_$][\w$]*)\(\{targets:\2\?\.targets\?\?\[\],availableTargets:\2\?\.availableTargets\?\?\[\],includeHiddenTargets:!0,mode:\2\?\.mode\}\)\}\}/;

export function patchContextMenuMessageValueLabelsSource(source) {
  let patched = source;

  if (!patched.includes(CONTEXT_MENU_VALUES_HELPER)) {
    if (patched.includes(CONTEXT_MENU_PATTERN)) {
      patched = patched.replace(CONTEXT_MENU_PATTERN, PATCHED_CONTEXT_MENU);
    } else if (patched.includes("nativeLabel")) {
      const nativePatched = patchNativeContextMenuFormatter(patched);
      if (nativePatched === patched) {
        throw new Error("Unable to patch context menu message values");
      }
      patched = CONTEXT_MENU_VALUES_HELPER + nativePatched;
    } else if (!CONTEXT_MENU_REACT_RENDERER_PATTERN.test(patched)) {
      throw new Error("Unable to patch context menu message values");
    }
  }

  if (!patched.includes(CONTEXT_MENU_REACT_VALUES_HELPER_NAME)) {
    const match = patched.match(CONTEXT_MENU_REACT_RENDERER_PATTERN);
    if (match == null) {
      throw new Error("Unable to patch context menu React message values");
    }

    const [, functionName, itemName, jsxNamespace, messageComponent] = match;
    const helper = reactMessageValuesHelper(jsxNamespace, messageComponent);
    const replacement = `function ${functionName}(${itemName}){return ${itemName}.message?(0,${jsxNamespace}.jsx)(${messageComponent},{...${itemName}.message,values:codexFormatReactMessageValues(${itemName}.messageValues)}):${itemName}.id}`;
    patched =
      helper +
      patched.replace(CONTEXT_MENU_REACT_RENDERER_PATTERN, replacement);
  }

  return patched;
}

export function patchOpenTargetContextMenuLabelsSource(source) {
  if (source.includes(OPEN_TARGET_LABEL_HELPER)) {
    return source;
  }

  const patched = patchOpenTargetLabelValues(source);
  if (patched === source) {
    throw new Error("Unable to patch open target context menu labels");
  }

  return OPEN_TARGET_LABEL_HELPER + patched;
}

export function patchArtifactPreviewOpenTargetLabelsSource(source) {
  let patched = source;
  let didPatch = false;
  let didLocalePatch = false;

  patched = patched.replace(
    ARTIFACT_PREVIEW_OPEN_TOOLTIP_PATTERN,
    (_match, intlName, targetName) => {
      didPatch = true;
      return `${intlName}.formatMessage({id:\`artifactTab.preview.openPrimaryTarget.tooltip\`,defaultMessage:\`Open in {target}\`,description:\`Tooltip for opening an artifact in the primary app\`},{target:codexFormatOpenTargetLabel(${targetName},${intlName}.formatMessage)})`;
    },
  );

  const itemMatch = ARTIFACT_PREVIEW_OPEN_ITEM_LABEL_PATTERN.exec(patched);
  ARTIFACT_PREVIEW_OPEN_ITEM_LABEL_PATTERN.lastIndex = 0;
  if (itemMatch != null) {
    const jsxNamespace = itemMatch[2];
    const messageComponent = findMessageComponentAlias(
      patched,
      jsxNamespace,
    );
    const nodeHelper = openTargetLabelNodeHelper(
      jsxNamespace,
      messageComponent,
    );

    patched = patched.replace(
      ARTIFACT_PREVIEW_OPEN_ITEM_LABEL_PATTERN,
      (_match, itemIcon, _jsxNamespace, _dropdownNamespace, itemName) => {
        didPatch = true;
        return `${itemIcon},codexOpenTargetLabelNode(${itemName},${jsxNamespace},${messageComponent})`;
      },
    );

    if (!patched.includes(OPEN_TARGET_LABEL_NODE_HELPER_NAME)) {
      patched = appendOpenTargetLabelHelper(patched, nodeHelper);
    }
  }

  patched = patched.replace(
    ARTIFACT_PREVIEW_OPEN_TARGET_PARAMS_PATTERN,
    (match, paramsStart, deferEnrichmentSpread) => {
      if (match.includes("locale:")) {
        return match;
      }
      didLocalePatch = true;
      return `${paramsStart}locale:codexWebOpenTargetLocale(),${deferEnrichmentSpread}`;
    },
  );

  if (!didPatch && !didLocalePatch) {
    if (
      patched.includes("codexFormatOpenTargetLabel(") &&
      patched.includes("codexOpenTargetLabelNode(") &&
      patched.includes("locale:codexWebOpenTargetLocale()")
    ) {
      return ensureOpenTargetLocaleHelper(patched);
    }
    throw new Error("Unable to patch artifact preview open target labels");
  }

  if (!patched.includes(OPEN_TARGET_LABEL_HELPER)) {
    patched = appendOpenTargetLabelHelper(patched, OPEN_TARGET_LABEL_HELPER);
  }

  if (!patched.includes(OPEN_TARGET_FORMAT_LABEL_HELPER)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_FORMAT_LABEL_HELPER,
    );
  }

  patched = ensureOpenTargetLocaleHelper(patched);

  return patched;
}

export function patchFileTreeOpenTargetLabelsSource(
  source,
  appIntlSignalAssetName = "app-intl-signal-Bd_tJ6VJ.js",
) {
  let patched = source;
  let didPatch = false;

  patched = patched.replace(
    FILE_TREE_APP_SCOPE_IMPORT_PATTERN,
    (_match, memoCacheAlias, appScopeAssetName) => {
      didPatch = true;
      return `import{Z as ${memoCacheAlias},s as codexReadSignal}from"./${appScopeAssetName}";import{t as codexAppIntlSignal}from"./${appIntlSignalAssetName}";`;
    },
  );

  patched = patched.replace(
    FILE_TREE_LOCALE_RENDER_PATTERN,
    (
      _match,
      resolvedThemeName,
      resolvedThemeFunctionName,
      themeInputFunctionName,
      platformName,
      platformFunctionName,
    ) => {
      didPatch = true;
      return `,${resolvedThemeName}=${resolvedThemeFunctionName}(${themeInputFunctionName}());codexSetWebOpenTargetLocale(codexReadSignal(codexAppIntlSignal)?.locale);let{platform:${platformName}}=${platformFunctionName}(),`;
    },
  );

  patched = patched.replace(
    FILE_TREE_OPEN_TARGETS_DATA_PATTERN,
    (
      _match,
      functionName,
      cwdName,
      fallbackName,
      hostIdName,
      queryClientName,
      targetPathName,
      queryKeyName,
      queryKeyFunctionName,
      dataName,
      targetsName,
    ) => {
      didPatch = true;
      return `function ${functionName}({cwd:${cwdName},fallbackOpenTargets:${fallbackName},hostId:${hostIdName},queryClient:${queryClientName},targetPath:${targetPathName}}){if(${targetPathName}==null)return{isLoadingOpenTargets:!1,primaryTarget:null,visibleTargets:[]};let codexLocale=codexWebOpenTargetLocale(),${queryKeyName}=${queryKeyFunctionName}(\`open-in-targets\`,{cwd:${cwdName},hostId:${hostIdName},path:${targetPathName},locale:codexLocale}),${dataName}=${queryClientName}.getQueryData(${queryKeyName}),${targetsName}=codexLocalizeOpenTargets(${dataName}?.targets??${fallbackName}.targets),`;
    },
  );

  patched = patched.replace(
    FILE_TREE_OPEN_TARGETS_PREFETCH_PATTERN,
    (
      _match,
      queryKeyFunctionName,
      cwdName,
      hostIdName,
      targetPathName,
      requestFunctionName,
    ) => {
      didPatch = true;
      return `queryKey:${queryKeyFunctionName}(\`open-in-targets\`,{cwd:${cwdName},hostId:${hostIdName},path:${targetPathName},locale:codexWebOpenTargetLocale()}),queryFn:()=>${requestFunctionName}(\`open-in-targets\`,{params:{cwd:${cwdName},hostId:${hostIdName},path:${targetPathName},locale:codexWebOpenTargetLocale()}})`;
    },
  );

  if (!didPatch) {
    if (
      patched.includes("codexLocalizeOpenTargets(") &&
      patched.includes("locale:codexWebOpenTargetLocale()") &&
      patched.includes("codexReadSignal(codexAppIntlSignal)?.locale")
    ) {
      patched = ensureOpenTargetLocaleHelper(patched);
      if (!patched.includes(OPEN_TARGET_SET_LOCALE_HELPER_NAME)) {
        patched = appendOpenTargetLabelHelper(
          patched,
          OPEN_TARGET_SET_LOCALE_HELPER,
        );
      }
      if (!patched.includes(OPEN_TARGET_LOCALIZE_TARGETS_HELPER_NAME)) {
        patched = appendOpenTargetLabelHelper(
          patched,
          OPEN_TARGET_LOCALIZE_TARGETS_HELPER,
        );
      }
      return patched;
    }
    throw new Error("Unable to patch file tree open target labels");
  }

  patched = ensureOpenTargetLocaleHelper(patched);

  if (!patched.includes(OPEN_TARGET_SET_LOCALE_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_SET_LOCALE_HELPER,
    );
  }

  if (!patched.includes(OPEN_TARGET_LOCALIZE_TARGETS_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_LOCALIZE_TARGETS_HELPER,
    );
  }

  return patched;
}

export function patchWorkspaceFileContextMenuLabelsSource(
  source,
  appIntlSignalAssetName = "app-intl-signal-Bd_tJ6VJ.js",
  appScopeAssetName = "app-scope-CWE-zIhQ.js",
) {
  let patched = patchWorkspaceFileOpenTargetsSource(
    source,
    appIntlSignalAssetName,
    appScopeAssetName,
  );

  if (patched !== source) {
    return patchWorkspaceFileContextMenuLabelsSource(
      patched,
      appIntlSignalAssetName,
      appScopeAssetName,
    );
  }

  const helperIndex = source.indexOf(OPEN_TARGET_LABEL_HELPER);
  if (helperIndex !== -1) {
    if (isInsideLineComment(source, helperIndex)) {
      return source.slice(0, helperIndex) + "\n" + source.slice(helperIndex);
    }

    return source;
  }

  if (!source.includes(WORKSPACE_FILE_CONTEXT_PATTERN)) {
    const patched = patchOpenTargetLabelValues(source);
    if (patched === source) {
      throw new Error("Unable to patch workspace file context menu labels");
    }
    return appendOpenTargetLabelHelper(patched);
  }

  return appendOpenTargetLabelHelper(
    source.replace(
      WORKSPACE_FILE_CONTEXT_PATTERN,
      PATCHED_WORKSPACE_FILE_CONTEXT,
    ),
  );
}

function patchWorkspaceFileOpenTargetsSource(
  source,
  appIntlSignalAssetName,
  appScopeAssetName,
) {
  const hasOpenTargetsQuery = source.includes("open-in-targets");
  if (!hasOpenTargetsQuery) {
    return source;
  }

  let patched = source;
  let didPatch = false;

  if (!patched.includes("codexAppIntlSignal")) {
    patched = `import{s as codexReadSignal}from"./${appScopeAssetName}";import{t as codexAppIntlSignal}from"./${appIntlSignalAssetName}";${patched}`;
    didPatch = true;
  }

  patched = patched.replace(
    WORKSPACE_FILE_OPEN_TARGETS_QUERY_PATTERN,
    (
      _match,
      functionName,
      cwdName,
      hostIdName,
      pathName,
      staleTimesName,
      queryKeyName,
      requestName,
    ) => {
      didPatch = true;
      return `function ${functionName}({cwd:${cwdName},hostId:${hostIdName},path:${pathName}}){let codexLocale=codexWorkspaceOpenTargetLocale();return{gcTime:${staleTimesName}.INFINITE,queryKey:${queryKeyName}(\`open-in-targets\`,{cwd:${cwdName},hostId:${hostIdName},path:${pathName},locale:codexLocale}),queryFn:()=>${requestName}(\`open-in-targets\`,{params:{cwd:${cwdName},hostId:${hostIdName},path:${pathName},locale:codexLocale}}),staleTime:${staleTimesName}.ONE_MINUTE}}`;
    },
  );

  patched = patched.replace(
    WORKSPACE_FILE_OPEN_TARGETS_SELECTION_PATTERN,
    (
      _match,
      functionName,
      payloadName,
      primaryTargetFunctionName,
      visibleTargetsFunctionName,
    ) => {
      didPatch = true;
      return `function ${functionName}(${payloadName}){let codexTargets=codexLocalizeOpenTargets(${payloadName}?.targets??[]);return{primaryTarget:${primaryTargetFunctionName}({preferredTarget:${payloadName}?.preferredTarget??null,targets:codexTargets,availableTargets:${payloadName}?.availableTargets??[],mode:${payloadName}?.mode}),visibleTargets:${visibleTargetsFunctionName}({targets:codexTargets,availableTargets:${payloadName}?.availableTargets??[],includeHiddenTargets:!0,mode:${payloadName}?.mode})}}`;
    },
  );

  if (!didPatch) {
    if (
      patched.includes("codexWorkspaceOpenTargetLocale()") &&
      patched.includes("codexLocalizeOpenTargets(") &&
      patched.includes("locale:codexLocale")
    ) {
      return patched;
    }
    throw new Error("Unable to patch workspace file open target labels");
  }

  patched = ensureOpenTargetLocaleHelper(patched);

  if (!patched.includes(OPEN_TARGET_SET_LOCALE_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_SET_LOCALE_HELPER,
    );
  }

  if (!patched.includes(OPEN_TARGET_WORKSPACE_LOCALE_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_WORKSPACE_LOCALE_HELPER,
    );
  }

  if (!patched.includes(OPEN_TARGET_LOCALIZE_TARGETS_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_LOCALIZE_TARGETS_HELPER,
    );
  }

  return patched;
}

export function patchThreadAppShellOpenTargetLabelsSource(
  source,
  appIntlSignalAssetName = "app-intl-signal-Bd_tJ6VJ.js",
) {
  let patched = source;
  let didPatch = false;

  if (!patched.includes("codexAppIntlSignal")) {
    patched = patched.replace(
      THREAD_APP_SHELL_APP_SCOPE_IMPORT_PATTERN,
      (_match, specifiers, appScopeAssetName) => {
        didPatch = true;
        const readSignalImport = specifiers.includes("codexReadSignal")
          ? specifiers
          : `${specifiers},s as codexReadSignal`;
        return `import{${readSignalImport}}from"./${appScopeAssetName}";import{t as codexAppIntlSignal}from"./${appIntlSignalAssetName}";`;
      },
    );
  }

  patched = patched.replace(
    THREAD_APP_SHELL_OPEN_TARGETS_PATTERN,
    (
      _match,
      canLoadTargetsName,
      preferredTargetName,
      targetsName,
      availableTargetsName,
      hasLoadedTargetsName,
      openName,
      useOpenTargetsName,
      paramsName,
      cwdName,
    ) => {
      didPatch = true;
      return `let{canLoadTargets:${canLoadTargetsName},preferredTarget:${preferredTargetName},targets:${targetsName},availableTargets:${availableTargetsName},hasLoadedTargets:${hasLoadedTargetsName},open:${openName}}=${useOpenTargetsName}(${paramsName});codexSetWebOpenTargetLocale(codexReadSignal(codexAppIntlSignal)?.locale);${targetsName}=codexLocalizeOpenTargets(${targetsName});if(!${cwdName}||!${canLoadTargetsName})return null;`;
    },
  );

  patched = patched.replace(
    THREAD_APP_SHELL_OPEN_TOOLTIP_PATTERN,
    (_match, intlName, targetName) => {
      didPatch = true;
      return `${intlName}.formatMessage({id:\`localConversationPage.openPrimaryTarget.tooltip\`,defaultMessage:\`Open in {target}\`,description:\`Tooltip for the primary open button\`},{target:codexFormatOpenTargetLabel(${targetName},${intlName}.formatMessage)})`;
    },
  );

  if (!didPatch) {
    if (
      patched.includes("codexSetWebOpenTargetLocale(") &&
      patched.includes("codexLocalizeOpenTargets(") &&
      patched.includes("codexFormatOpenTargetLabel(")
    ) {
      return ensureThreadAppShellOpenTargetHelpers(patched);
    }
    throw new Error("Unable to patch thread app shell open target labels");
  }

  return ensureThreadAppShellOpenTargetHelpers(patched);
}

function ensureThreadAppShellOpenTargetHelpers(source) {
  let patched = ensureOpenTargetLocaleHelper(source);

  if (!patched.includes(OPEN_TARGET_SET_LOCALE_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_SET_LOCALE_HELPER,
    );
  }

  if (!patched.includes(OPEN_TARGET_LOCALIZE_TARGETS_HELPER_NAME)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_LOCALIZE_TARGETS_HELPER,
    );
  }

  if (!patched.includes(OPEN_TARGET_LABEL_HELPER)) {
    patched = appendOpenTargetLabelHelper(patched, OPEN_TARGET_LABEL_HELPER);
  }

  if (!patched.includes(OPEN_TARGET_FORMAT_LABEL_HELPER)) {
    patched = appendOpenTargetLabelHelper(
      patched,
      OPEN_TARGET_FORMAT_LABEL_HELPER,
    );
  }

  return patched;
}

function patchNativeContextMenuFormatter(source) {
  return source
    .replace(
      /([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.message,\2\.messageValues\)/g,
      "$1($2.message,codexFormatMessageValues($2.messageValues,$1))",
    )
    .replace(
      /([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.tooltipMessage,\2\.tooltipMessageValues\)/g,
      "$1($2.tooltipMessage,codexFormatMessageValues($2.tooltipMessageValues,$1))",
    );
}

function reactMessageValuesHelper(jsxNamespace, messageComponent) {
  return `function codexFormatReactMessageValues(e){if(e==null)return e;let t={};for(let[n,r]of Object.entries(e))t[n]=r&&typeof r==\`object\`&&typeof r.id==\`string\`&&typeof r.defaultMessage==\`string\`?(0,${jsxNamespace}.jsx)(${messageComponent},{...r}):r;return t}`;
}

function openTargetLabelNodeHelper(jsxNamespace, messageComponent) {
  return `function codexOpenTargetLabelNode(e,t,n){let r=codexOpenTargetLabel(e);return r&&typeof r==\`object\`&&typeof r.id==\`string\`&&typeof r.defaultMessage==\`string\`?(0,t.jsx)(n,{...r}):r}`;
}

function findMessageComponentAlias(source, jsxNamespace) {
  const pattern = new RegExp(
    `\\(0,${escapeRegExp(
      jsxNamespace,
    )}\\.jsx\\)\\(([A-Za-z_$][\\w$]*),\\{id:\`artifactTab\\.preview\\.open\``,
  );
  const match = pattern.exec(source);
  if (match == null) {
    throw new Error("Unable to find artifact preview message component");
  }

  return match[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patchOpenTargetLabelValues(source) {
  return source.replace(
    OPEN_TARGET_LABEL_VALUE_PATTERN,
    "messageValues:{target:codexOpenTargetLabel($1)}",
  );
}

function appendOpenTargetLabelHelper(source, helper = OPEN_TARGET_LABEL_HELPER) {
  const sourceMapIndex = source.indexOf("\n//# sourceMappingURL=");
  if (sourceMapIndex === -1) {
    return `${source}\n${helper}`;
  }

  return `${source.slice(0, sourceMapIndex)}\n${helper}${source.slice(sourceMapIndex)}`;
}

function ensureOpenTargetLocaleHelper(source) {
  if (source.includes(OPEN_TARGET_LOCALE_HELPER)) {
    return source;
  }

  for (const legacyHelper of LEGACY_OPEN_TARGET_LOCALE_HELPERS) {
    if (source.includes(legacyHelper)) {
      return source.replaceAll(legacyHelper, OPEN_TARGET_LOCALE_HELPER);
    }
  }

  if (source.includes(OPEN_TARGET_LOCALE_HELPER_NAME)) {
    throw new Error("Unable to upgrade open target locale helper");
  }

  return appendOpenTargetLabelHelper(source, OPEN_TARGET_LOCALE_HELPER);
}

function isInsideLineComment(source, offset) {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const lineComment = source.indexOf("//", lineStart);

  return lineComment !== -1 && lineComment < offset;
}

export function patchWebviewOpenTargetLabelsAssets(assetsDir) {
  const patchedFiles = [];
  const assetNames = fs.readdirSync(assetsDir);
  const appIntlSignalAssetName = assetNames.find((name) =>
    /^app-intl-signal-[\w-]+\.js$/.test(name),
  );
  const appScopeAssetName = assetNames.find((name) =>
    /^app-scope-[\w-]+\.js$/.test(name),
  );
  const patchers = [
    {
      pattern: /^context-menu-[\w-]+\.js$/,
      patch: patchContextMenuMessageValueLabelsSource,
    },
    {
      pattern: /^open-target-context-menu-items-[\w-]+\.js$/,
      patch: patchOpenTargetContextMenuLabelsSource,
    },
    {
      pattern: /^image-preview-dialog-[\w-]+\.js$/,
      patch: patchArtifactPreviewOpenTargetLabelsSource,
    },
    {
      pattern: /^file-tree-search-input-[\w-]+\.js$/,
      patch: patchFileTreeOpenTargetLabelsSource,
    },
    {
      pattern: /^workspace-file-context-menu-[\w-]+\.js$/,
      patch: patchWorkspaceFileContextMenuLabelsSource,
    },
    {
      pattern: /^thread-app-shell-chrome-[\w-]+\.js$/,
      patch: patchThreadAppShellOpenTargetLabelsSource,
      isCandidate: (source) =>
        source.includes("localConversationPage.openPrimaryTarget") ||
        source.includes("codexLocalizeOpenTargets("),
    },
  ];

  for (const { pattern, patch, isCandidate } of patchers) {
    const matchingAssetNames = assetNames.filter((name) => pattern.test(name));
    if (matchingAssetNames.length === 0) {
      throw new Error(`Unable to find webview asset matching ${pattern}`);
    }

    let didFindCandidate = false;
    for (const assetName of matchingAssetNames) {
      const assetPath = path.join(assetsDir, assetName);
      const source = fs.readFileSync(assetPath, "utf8");
      if (isCandidate != null && !isCandidate(source)) {
        continue;
      }
      didFindCandidate = true;

      if (
        (patch === patchFileTreeOpenTargetLabelsSource ||
          patch === patchWorkspaceFileContextMenuLabelsSource ||
          patch === patchThreadAppShellOpenTargetLabelsSource) &&
        (appIntlSignalAssetName == null || appScopeAssetName == null)
      ) {
        throw new Error("Unable to find app intl signal assets");
      }

      const patched =
        patch === patchFileTreeOpenTargetLabelsSource
          ? patch(source, appIntlSignalAssetName)
          : patch === patchWorkspaceFileContextMenuLabelsSource
            ? patch(source, appIntlSignalAssetName, appScopeAssetName)
            : patch === patchThreadAppShellOpenTargetLabelsSource
              ? patch(source, appIntlSignalAssetName)
              : patch(source);

      if (patched !== source) {
        fs.writeFileSync(assetPath, patched);
        patchedFiles.push(assetPath);
      }
    }

    if (!didFindCandidate) {
      throw new Error(`Unable to find webview asset candidate for ${pattern}`);
    }
  }

  return patchedFiles;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewOpenTargetLabelsAssets(assetsDir);
  console.log(
    `Patched webview open target labels in ${patchedFiles.length} file(s)`,
  );
}
