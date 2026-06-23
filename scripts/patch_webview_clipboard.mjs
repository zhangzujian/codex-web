#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const USER_MESSAGE_CLIPBOARD_REPLACEMENTS = [
  [
    "navigator.clipboard.writeText(p(V))",
    "codexWebWriteTextToClipboard(p(V))",
  ],
  [
    "navigator.clipboard.writeText(d(V))",
    "codexWebWriteTextToClipboard(d(V))",
  ],
];
const COPY_TO_CLIPBOARD_PATTERN =
  "function e(e,t){let{navigator:n}=t?.target?.ownerDocument?.defaultView??window;return new Promise((t,r)=>{if(!n?.clipboard){r(Error(`Clipboard API unavailable`));return}try{if(typeof e!=`string`&&`write`in n.clipboard&&typeof ClipboardItem<`u`&&`supports`in ClipboardItem){let i=new ClipboardItem(Object.fromEntries(Object.entries(e).map(([e,t])=>[e,typeof t==`string`?new Blob([t],{type:e}):t])));n.clipboard.write([i]).then(()=>t(!0),()=>{r(Error(`Failed to copy to clipboard`))})}else{let i=typeof e==`string`?e:e[`text/plain`]??``;n.clipboard.writeText(i).then(()=>t(!0),()=>{r(Error(`Failed to copy to clipboard`))})}}catch{r(Error(`Failed to copy to clipboard`))}})}";
const LEGACY_CLIPBOARD_HELPER =
  "function codexWebWriteTextToClipboard(e){if(globalThis.navigator?.clipboard?.writeText)return globalThis.navigator.clipboard.writeText(e);let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();try{return document.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{t.remove()}}";
const CLIPBOARD_HELPER =
  "function codexWebExecCommandCopy(e){let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();try{return document.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{t.remove()}}function codexWebWriteTextToClipboard(e){return globalThis.navigator?.clipboard?.writeText?globalThis.navigator.clipboard.writeText(e).catch(()=>codexWebExecCommandCopy(e)):codexWebExecCommandCopy(e)}";
const COPY_TO_CLIPBOARD_HELPER =
  "function codexWebExecCommandCopy(e,t){let n=t?.document??document,r=n.createElement(`textarea`);r.value=e,r.setAttribute(`readonly`,``),r.style.position=`fixed`,r.style.top=`0`,r.style.left=`0`,r.style.opacity=`0`,n.body.appendChild(r),r.focus(),r.select(),typeof r.setSelectionRange==`function`&&r.setSelectionRange(0,r.value.length);try{return n.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{r.remove()}}function codexWebClipboardPlainText(e){return typeof e==`string`?e:e?.[`text/plain`]??``}function codexWebCopyPlainText(e,t,n,r){codexWebExecCommandCopy(codexWebClipboardPlainText(t),e).then(()=>n(!0),()=>r(Error(`Failed to copy to clipboard`)))}";
const PATCHED_COPY_TO_CLIPBOARD =
  "function e(e,t){let i=t?.target?.ownerDocument?.defaultView??window,{navigator:n}=i;return new Promise((t,r)=>{if(!n?.clipboard){codexWebCopyPlainText(i,e,t,r);return}try{if(typeof e!=`string`&&`write`in n.clipboard&&typeof ClipboardItem<`u`&&`supports`in ClipboardItem){let a=new ClipboardItem(Object.fromEntries(Object.entries(e).map(([e,t])=>[e,typeof t==`string`?new Blob([t],{type:e}):t])));n.clipboard.write([a]).then(()=>t(!0),()=>codexWebCopyPlainText(i,e,t,r))}else{let a=typeof e==`string`?e:e[`text/plain`]??``;n.clipboard.writeText(a).then(()=>t(!0),()=>codexWebCopyPlainText(i,a,t,r))}}catch{codexWebCopyPlainText(i,e,t,r)}})}";

export function patchCopyToClipboardAssetSource(source) {
  if (source.includes(COPY_TO_CLIPBOARD_HELPER)) {
    return source;
  }

  if (!source.includes(COPY_TO_CLIPBOARD_PATTERN)) {
    throw new Error("Unable to patch code block clipboard copy");
  }

  return (
    COPY_TO_CLIPBOARD_HELPER +
    source.replace(COPY_TO_CLIPBOARD_PATTERN, PATCHED_COPY_TO_CLIPBOARD)
  );
}

export function patchUserMessageClipboardAssetSource(source) {
  if (source.includes(CLIPBOARD_HELPER)) {
    return source;
  }

  if (source.includes(LEGACY_CLIPBOARD_HELPER)) {
    return source.replace(LEGACY_CLIPBOARD_HELPER, CLIPBOARD_HELPER);
  }

  const replacement = USER_MESSAGE_CLIPBOARD_REPLACEMENTS.find(([pattern]) =>
    source.includes(pattern),
  );

  if (replacement == null) {
    throw new Error("Unable to patch user message clipboard copy");
  }

  const [pattern, patchedPattern] = replacement;

  return (
    CLIPBOARD_HELPER +
    source.replace(pattern, patchedPattern)
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

export function patchCopyToClipboardAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^copy-to-clipboard-[\w-]+\.js$/.test(name));

  if (assetName == null) {
    throw new Error("Unable to find copy-to-clipboard asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchCopyToClipboardAssetSource(source);

  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

export function patchWebviewClipboardAssets(assetsDir) {
  return [
    ...patchCopyToClipboardAssets(assetsDir),
    ...patchUserMessageClipboardAssets(assetsDir),
  ];
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewClipboardAssets(assetsDir);
  console.log(
    `Patched webview clipboard copy in ${patchedFiles.length} asset(s)`,
  );
}
