#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPEN_TARGET_LABEL_HELPER =
  "function codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";

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

const WORKSPACE_FILE_CONTEXT_PATTERN =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";
const PATCHED_WORKSPACE_FILE_CONTEXT =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:codexOpenTargetLabel(e)},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";

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

export function patchWorkspaceFileContextMenuLabelsSource(source) {
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

function patchOpenTargetLabelValues(source) {
  return source.replace(
    OPEN_TARGET_LABEL_VALUE_PATTERN,
    "messageValues:{target:codexOpenTargetLabel($1)}",
  );
}

function appendOpenTargetLabelHelper(source) {
  const sourceMapIndex = source.indexOf("\n//# sourceMappingURL=");
  if (sourceMapIndex === -1) {
    return `${source}\n${OPEN_TARGET_LABEL_HELPER}`;
  }

  return `${source.slice(0, sourceMapIndex)}\n${OPEN_TARGET_LABEL_HELPER}${source.slice(sourceMapIndex)}`;
}

function isInsideLineComment(source, offset) {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const lineComment = source.indexOf("//", lineStart);

  return lineComment !== -1 && lineComment < offset;
}

export function patchWebviewOpenTargetLabelsAssets(assetsDir) {
  const patchedFiles = [];
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
      pattern: /^workspace-file-context-menu-[\w-]+\.js$/,
      patch: patchWorkspaceFileContextMenuLabelsSource,
    },
  ];

  for (const { pattern, patch } of patchers) {
    const assetName = fs
      .readdirSync(assetsDir)
      .find((name) => pattern.test(name));
    if (assetName == null) {
      throw new Error(`Unable to find webview asset matching ${pattern}`);
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patch(source);
    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
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
