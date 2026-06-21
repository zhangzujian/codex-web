#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPEN_TARGET_LABEL_HELPER =
  "function codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";

const CONTEXT_MENU_VALUES_HELPER =
  "function codexFormatMessageValues(e,t){if(e==null)return e;let n={};for(let[r,i]of Object.entries(e))n[r]=i&&typeof i==`object`&&typeof i.id==`string`&&typeof i.defaultMessage==`string`?t(i):i;return n}";
const CONTEXT_MENU_REACT_VALUES_HELPER =
  "function codexFormatReactMessageValues(e){if(e==null)return e;let t={};for(let[n,r]of Object.entries(e))t[n]=r&&typeof r==`object`&&typeof r.id==`string`&&typeof r.defaultMessage==`string`?(0,p.jsx)(a,{...r}):r;return t}";
const CONTEXT_MENU_PATTERN =
  "function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,e.messageValues):e.id,i=e.tooltipMessage?t(e.tooltipMessage,e.tooltipMessageValues):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}";
const PATCHED_CONTEXT_MENU = `${CONTEXT_MENU_VALUES_HELPER}function m(e,t){return e.map(e=>{if(e.type===\`separator\`)return{...e,nativeLabel:\`\`,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,codexFormatMessageValues(e.messageValues,t)):e.id,i=e.tooltipMessage?t(e.tooltipMessage,codexFormatMessageValues(e.tooltipMessageValues,t)):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}`;
const CONTEXT_MENU_REACT_PATTERN =
  "function he(e){return e.message?(0,p.jsx)(a,{...e.message,values:e.messageValues}):e.id}";
const PATCHED_CONTEXT_MENU_REACT = `${CONTEXT_MENU_REACT_VALUES_HELPER}function he(e){return e.message?(0,p.jsx)(a,{...e.message,values:codexFormatReactMessageValues(e.messageValues)}):e.id}`;

const OPEN_TARGET_CONTEXT_PATTERN =
  "function e({idPrefix:e,messages:t,onOpenInTarget:n,primaryTarget:r,visibleTargets:i}){return r==null?[]:[{id:`${e}-primary`,message:t.openInTarget,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)},{id:`${e}-targets`,message:t.openIn,submenu:i.map(r=>({id:`${e}-target-${r.id}`,message:t.openInTargetSubmenu,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)}))}]}";
const PATCHED_OPEN_TARGET_CONTEXT = `${OPEN_TARGET_LABEL_HELPER}function e({idPrefix:e,messages:t,onOpenInTarget:n,primaryTarget:r,visibleTargets:i}){return r==null?[]:[{id:\`${"${e}"}-primary\`,message:t.openInTarget,messageValues:{target:codexOpenTargetLabel(r)},icon:r.icon,onSelect:()=>n(r.target,r.appPath)},{id:\`${"${e}"}-targets\`,message:t.openIn,submenu:i.map(r=>({id:\`${"${e}"}-target-${"${r.id}"}\`,message:t.openInTargetSubmenu,messageValues:{target:codexOpenTargetLabel(r)},icon:r.icon,onSelect:()=>n(r.target,r.appPath)}))}]}`;

const WORKSPACE_FILE_CONTEXT_PATTERN =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";
const PATCHED_WORKSPACE_FILE_CONTEXT =
  "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:codexOpenTargetLabel(e)},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))";

export function patchContextMenuMessageValueLabelsSource(source) {
  let patched = source;

  if (!patched.includes(CONTEXT_MENU_VALUES_HELPER)) {
    if (!patched.includes(CONTEXT_MENU_PATTERN)) {
      throw new Error("Unable to patch context menu message values");
    }

    patched = patched.replace(CONTEXT_MENU_PATTERN, PATCHED_CONTEXT_MENU);
  }

  if (!patched.includes(CONTEXT_MENU_REACT_VALUES_HELPER)) {
    if (!patched.includes(CONTEXT_MENU_REACT_PATTERN)) {
      return patched;
    }

    patched = patched.replace(
      CONTEXT_MENU_REACT_PATTERN,
      PATCHED_CONTEXT_MENU_REACT,
    );
  }

  return patched;
}

export function patchOpenTargetContextMenuLabelsSource(source) {
  if (source.includes(OPEN_TARGET_LABEL_HELPER)) {
    return source;
  }

  if (!source.includes(OPEN_TARGET_CONTEXT_PATTERN)) {
    throw new Error("Unable to patch open target context menu labels");
  }

  return source.replace(
    OPEN_TARGET_CONTEXT_PATTERN,
    PATCHED_OPEN_TARGET_CONTEXT,
  );
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
    throw new Error("Unable to patch workspace file context menu labels");
  }

  return (
    source.replace(
      WORKSPACE_FILE_CONTEXT_PATTERN,
      PATCHED_WORKSPACE_FILE_CONTEXT,
    ) + `\n${OPEN_TARGET_LABEL_HELPER}`
  );
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
