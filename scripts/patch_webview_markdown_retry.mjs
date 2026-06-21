#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STREAMING_RESET_KEY =
  "resetKey:e.children,fallback:Hi,children:n}),t[2]=e.children";
const STABLE_STREAMING_RESET_KEY =
  "resetKey:e.isStreaming?`streaming`:e.children,fallback:Hi,children:n}),t[2]=e.children";
const MARKDOWN_FALLBACK_INLINE_RETRY =
  "function Hi(e){return(0,Q.jsx)(br,{onRetry:()=>{e.resetError()}})}";
const MARKDOWN_FALLBACK_STABLE_RETRY =
  "function Hi(e){return(0,Q.jsx)(br,{onRetry:e.resetError})}";
const REGULAR_MARKDOWN_FALLBACK_INLINE_RETRY =
  "function ni(e){return(0,Q.jsx)(br,{onRetry:()=>{e.resetError()}})}";
const REGULAR_MARKDOWN_FALLBACK_STABLE_RETRY =
  "function ni(e){return(0,Q.jsx)(br,{onRetry:e.resetError})}";
const MARKDOWN_SAFE_MEDIA_URL_FUNCTION =
  "function codexWebSafeMarkdownMediaUrl(e){if(typeof e!=`string`)return e;try{let t=new URL(e,globalThis.location.href);return globalThis.location.protocol===`https:`&&t.protocol===`http:`?null:e}catch{return e}}";
const MARKDOWN_MEDIA_URL_SOURCE =
  "let R=I?.contentsBase64??null,z=j.safeUrl??ee??(P&&R!=null?Qt({contentsBase64:R,mimeType:I?.mimeType??null,path:C??x}):x),B=r??``";
const MARKDOWN_SAFE_MEDIA_URL_SOURCE =
  "let R=I?.contentsBase64??null,z=codexWebSafeMarkdownMediaUrl(j.safeUrl??ee??(P&&R!=null?Qt({contentsBase64:R,mimeType:I?.mimeType??null,path:C??x}):x)),B=r??``";
const MARKDOWN_FALLBACK_START =
  "function br(e){let t=(0,X.c)(4),{onRetry:n}=e,r;";
const MARKDOWN_FALLBACK_GLOBAL_RETRY_START =
  "var markdownRetryCount=0;function br(e){let t=(0,X.c)(6),{onRetry:n}=e,r,o;t[4]===n?o=t[5]:(o=()=>{if(markdownRetryCount>=2)return;markdownRetryCount+=1;let e=setTimeout(n,100);return()=>clearTimeout(e)},t[4]=n,t[5]=o),(0,Z.useEffect)(o,[n]);";
const MARKDOWN_FALLBACK_AUTO_RETRY_START =
  "var markdownRetryCounts=new WeakMap;function br(e){let t=(0,X.c)(6),{onRetry:n}=e,r,o;t[4]===n?o=t[5]:(o=()=>{let e=markdownRetryCounts.get(n)??0;if(e>=2)return;markdownRetryCounts.set(n,e+1);let t=setTimeout(n,100);return()=>clearTimeout(t)},t[4]=n,t[5]=o),(0,Z.useEffect)(o,[n]);";

export function patchWebviewMarkdownRetrySource(source, assetName = "") {
  if (!assetName.startsWith("markdown-") && !source.includes("function br(e)")) {
    return source;
  }

  let patched = source;
  patched = replaceOnceIfPresent(
    patched,
    STREAMING_RESET_KEY,
    STABLE_STREAMING_RESET_KEY,
    "StreamingMarkdown reset key",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FALLBACK_INLINE_RETRY,
    MARKDOWN_FALLBACK_STABLE_RETRY,
    "Markdown fallback retry callback",
  );
  patched = replaceOnceIfPresent(
    patched,
    REGULAR_MARKDOWN_FALLBACK_INLINE_RETRY,
    REGULAR_MARKDOWN_FALLBACK_STABLE_RETRY,
    "regular Markdown fallback retry callback",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FALLBACK_GLOBAL_RETRY_START,
    MARKDOWN_FALLBACK_AUTO_RETRY_START,
    "Markdown fallback auto retry",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FALLBACK_START,
    MARKDOWN_FALLBACK_AUTO_RETRY_START,
    "Markdown fallback auto retry",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_MEDIA_URL_SOURCE,
    MARKDOWN_SAFE_MEDIA_URL_SOURCE,
    "Markdown media URL",
  );
  if (
    patched.includes(MARKDOWN_SAFE_MEDIA_URL_SOURCE) &&
    !patched.includes("function codexWebSafeMarkdownMediaUrl")
  ) {
    patched = `${MARKDOWN_SAFE_MEDIA_URL_FUNCTION}${patched}`;
  }
  return patched;
}

export function patchWebviewMarkdownRetryAssets(assetsDir) {
  const patchedFiles = [];
  let sawMarkdownFallback = false;
  let sawMarkdownRetryCallback = false;
  let sawRegularMarkdownRetryCallback = false;
  let sawStreamingResetKey = false;
  let sawSafeMediaUrl = false;

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js")) {
      continue;
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchWebviewMarkdownRetrySource(source, assetName);
    sawMarkdownFallback ||= patched.includes(MARKDOWN_FALLBACK_AUTO_RETRY_START);
    sawMarkdownRetryCallback ||= patched.includes(MARKDOWN_FALLBACK_STABLE_RETRY);
    sawRegularMarkdownRetryCallback ||= patched.includes(
      REGULAR_MARKDOWN_FALLBACK_STABLE_RETRY,
    );
    sawStreamingResetKey ||= patched.includes(STABLE_STREAMING_RESET_KEY);
    sawSafeMediaUrl ||= patched.includes(MARKDOWN_SAFE_MEDIA_URL_SOURCE);

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  if (!sawMarkdownFallback) {
    throw new Error("Unable to patch Markdown render retry fallback");
  }
  if (!sawMarkdownRetryCallback) {
    throw new Error("Unable to patch Markdown render retry callback");
  }
  if (!sawRegularMarkdownRetryCallback) {
    throw new Error("Unable to patch regular Markdown render retry callback");
  }
  if (!sawStreamingResetKey) {
    throw new Error("Unable to patch StreamingMarkdown reset key");
  }
  if (!sawSafeMediaUrl) {
    throw new Error("Unable to patch Markdown media URL");
  }

  return patchedFiles;
}

function replaceOnceIfPresent(source, before, after, label) {
  if (source.includes(after)) {
    return source;
  }

  const first = source.indexOf(before);
  if (first === -1) {
    return source;
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    throw new Error(`Expected one ${label}, found multiple`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewMarkdownRetryAssets(assetsDir);
  console.log(`Patched webview Markdown retry in ${patchedFiles.length} asset(s)`);
}
