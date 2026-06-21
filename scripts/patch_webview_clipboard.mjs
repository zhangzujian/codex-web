#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const USER_MESSAGE_CLIPBOARD_PATTERN = "navigator.clipboard.writeText(p(V))";
const PATCHED_USER_MESSAGE_CLIPBOARD = "codexWebWriteTextToClipboard(p(V))";
const LEGACY_CLIPBOARD_HELPER =
  "function codexWebWriteTextToClipboard(e){if(globalThis.navigator?.clipboard?.writeText)return globalThis.navigator.clipboard.writeText(e);let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();try{return document.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{t.remove()}}";
const CLIPBOARD_HELPER =
  "function codexWebExecCommandCopy(e){let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();try{return document.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{t.remove()}}function codexWebWriteTextToClipboard(e){return globalThis.navigator?.clipboard?.writeText?globalThis.navigator.clipboard.writeText(e).catch(()=>codexWebExecCommandCopy(e)):codexWebExecCommandCopy(e)}";

export function patchUserMessageClipboardAssetSource(source) {
  if (source.includes(CLIPBOARD_HELPER)) {
    return source;
  }

  if (source.includes(LEGACY_CLIPBOARD_HELPER)) {
    return source.replace(LEGACY_CLIPBOARD_HELPER, CLIPBOARD_HELPER);
  }

  if (!source.includes(USER_MESSAGE_CLIPBOARD_PATTERN)) {
    throw new Error("Unable to patch user message clipboard copy");
  }

  return (
    CLIPBOARD_HELPER +
    source.replace(
      USER_MESSAGE_CLIPBOARD_PATTERN,
      PATCHED_USER_MESSAGE_CLIPBOARD,
    )
  );
}

export function patchUserMessageClipboardAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^user-message-attachments-[\w-]+\.js$/.test(name));

  if (assetName == null) {
    throw new Error("Unable to find user message attachments asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchUserMessageClipboardAssetSource(source);

  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchUserMessageClipboardAssets(assetsDir);
  console.log(
    `Patched webview clipboard copy in ${patchedFiles.length} asset(s)`,
  );
}
