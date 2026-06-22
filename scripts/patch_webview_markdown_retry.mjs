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
const MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n)||/%2f|%5c/i.test(n))return null;try{let r=t.replace(/\\/+$/,``);if(r===``)r=`/`;if(!r.startsWith(`/`))return null;let i=r.split(`/`).map(encodeURIComponent).join(`/`),a=n.split(`/`).map(encodeURIComponent).join(`/`),o=new URL(a,`http://codex.local/__cwd__${i===`/`?`/`:`${i}/`}`),s=decodeURIComponent(o.pathname);if(!s.startsWith(`/__cwd__/`))return null;let c=s.slice(`/__cwd__`.length);if(c.length===0)return null;if(r!==`/`&&c!==r&&!c.startsWith(`${r}/`))return null;return c}catch{return null}}";
const OLD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n))return null;try{let e=new URL(n,`http://codex.local/__cwd__/`),r=decodeURIComponent(e.pathname);if(!r.startsWith(`/__cwd__/`))return null;let i=r.slice(`/__cwd__/`.length);return i.length===0?null:`${t.replace(/\\/+$/,``)}/${i}`}catch{return null}}";
const RAW_CWD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n))return null;try{let r=t.replace(/\\/+$/,``);if(r===``)r=`/`;if(!r.startsWith(`/`))return null;let i=new URL(n,`http://codex.local${r===`/`?`/`:`${r}/`}`),a=decodeURIComponent(i.pathname);return a.length===0?null:a}catch{return null}}";
const ENCODED_CWD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n))return null;try{let r=t.replace(/\\/+$/,``);if(r===``)r=`/`;if(!r.startsWith(`/`))return null;let i=r.split(`/`).map(encodeURIComponent).join(`/`),a=new URL(n,`http://codex.local/__cwd__${i===`/`?`/`:`${i}/`}`),o=decodeURIComponent(a.pathname);if(!o.startsWith(`/__cwd__/`))return null;let s=o.slice(`/__cwd__`.length);return s.length===0?null:s}catch{return null}}";
const ENCODED_SEPARATOR_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n)||/%2f|%5c/i.test(n))return null;try{let r=t.replace(/\\/+$/,``);if(r===``)r=`/`;if(!r.startsWith(`/`))return null;let i=r.split(`/`).map(encodeURIComponent).join(`/`),a=new URL(n,`http://codex.local/__cwd__${i===`/`?`/`:`${i}/`}`),o=decodeURIComponent(a.pathname);if(!o.startsWith(`/__cwd__/`))return null;let s=o.slice(`/__cwd__`.length);return s.length===0?null:s}catch{return null}}";
const CWD_BOUNDARY_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION =
  "function codexWebResolveMarkdownMediaPath(e,t){if(typeof e!=`string`||typeof t!=`string`||t.length===0)return null;let n=e.trim();if(n.length===0||n.startsWith(`/`)||n.startsWith(`//`)||/^[a-z][a-z0-9+.-]*:/i.test(n)||/%2f|%5c/i.test(n))return null;try{let r=t.replace(/\\/+$/,``);if(r===``)r=`/`;if(!r.startsWith(`/`))return null;let i=r.split(`/`).map(encodeURIComponent).join(`/`),a=new URL(n,`http://codex.local/__cwd__${i===`/`?`/`:`${i}/`}`),o=decodeURIComponent(a.pathname);if(!o.startsWith(`/__cwd__/`))return null;let s=o.slice(`/__cwd__`.length);if(s.length===0)return null;if(r!==`/`&&s!==r&&!s.startsWith(`${r}/`))return null;return s}catch{return null}}";
const MARKDOWN_MEDIA_URL_SOURCE =
  "let R=I?.contentsBase64??null,z=j.safeUrl??ee??(P&&R!=null?Qt({contentsBase64:R,mimeType:I?.mimeType??null,path:C??x}):x),B=r??``";
const MARKDOWN_SAFE_MEDIA_URL_SOURCE =
  "let R=I?.contentsBase64??null,z=codexWebSafeMarkdownMediaUrl(j.safeUrl??ee??(P&&R!=null?Qt({contentsBase64:R,mimeType:I?.mimeType??null,path:C??x}):x)),B=r??``";
const MARKDOWN_IMAGE_COMPONENT_SOURCE =
  "return(0,Q.jsx)(pn,{...e,animateEnter:t,hostId:a,mediaCacheKey:o,mediaPresentation:s,rootRef:c})";
const MARKDOWN_IMAGE_COMPONENT_WITH_CWD =
  "return(0,Q.jsx)(pn,{...e,cwd:n,animateEnter:t,hostId:a,mediaCacheKey:o,mediaPresentation:s,rootRef:c})";
const MARKDOWN_IMAGE_PROPS_SOURCE =
  "{allowWide:n,alt:r,animateEnter:i,className:a,hostId:o,mediaCacheKey:s,mediaPresentation:c,rootRef:l,src:u,title:d}=e";
const MARKDOWN_IMAGE_PROPS_WITH_CWD =
  "{allowWide:n,alt:r,animateEnter:i,className:a,cwd:codexWebCwd,hostId:o,mediaCacheKey:s,mediaPresentation:c,rootRef:l,src:u,title:d}=e";
const MARKDOWN_IMAGE_PATH_SOURCE =
  "x=u??``,C=H(x),w=x.length>0,T=Xt(x)";
const MARKDOWN_IMAGE_PATH_WITH_RELATIVE_SOURCE =
  "x=u??``,C=H(x)??codexWebResolveMarkdownMediaPath(x,codexWebCwd),w=x.length>0,T=Xt(x)";
const MARKDOWN_FILE_CWD_FUNCTION =
  "function codexWebMarkdownFileCwd(e){if(typeof e!=`string`||e.length===0)return null;let t=e.replace(/\\\\/g,`/`),n=t.lastIndexOf(`/`);return n>0?t.slice(0,n):n===0?`/`:null}";
const OLD_MARKDOWN_FILE_CWD_FUNCTION =
  "function codexWebMarkdownFileCwd(e){if(typeof e!=`string`||e.length===0)return null;let t=e.replace(/\\\\/g,`/`),n=t.lastIndexOf(`/`);return n>0?t.slice(0,n):null}";
const REVIEW_MARKDOWN_PREVIEW_COMPONENT_SOURCE =
  "(e=(0,Z.jsx)(Ii,{gitBlameFeatureEnabled:j,hostId:a,path:u,previewKind:C}),t[27]=j,t[28]=a,t[29]=u,t[30]=C,t[31]=e)";
const REVIEW_MARKDOWN_PREVIEW_COMPONENT_WITH_CWD =
  "(e=(0,Z.jsx)(Ii,{cwd:codexWebMarkdownFileCwd(u),gitBlameFeatureEnabled:j,hostId:a,path:u,previewKind:C}),t[27]=j,t[28]=a,t[29]=u,t[30]=C,t[31]=e)";
const REVIEW_MARKDOWN_PREVIEW_PROPS_SOURCE =
  "{gitBlameFeatureEnabled:n,hostId:r,path:i,previewKind:a}=e";
const REVIEW_MARKDOWN_PREVIEW_PROPS_WITH_CWD =
  "{cwd:codexWebCwd,gitBlameFeatureEnabled:n,hostId:r,path:i,previewKind:a}=e";
const REVIEW_MARKDOWN_PREVIEW_SOURCE =
  "a=(0,Z.jsx)(Mn,{className:`h-full bg-token-main-surface-primary`,hostId:r,path:i,fallback:e,scrollable:!0}),t[10]=r,t[11]=i,t[12]=e,t[13]=a";
const REVIEW_MARKDOWN_PREVIEW_WITH_CWD =
  "a=(0,Z.jsx)(Mn,{className:`h-full bg-token-main-surface-primary`,cwd:codexWebCwd,hostId:r,path:i,fallback:e,scrollable:!0}),t[10]=r,t[11]=i,t[12]=e,t[13]=a";
const MARKDOWN_FILE_PREVIEW_CACHE_SOURCE = "function Oe(e){let t=(0,X.c)(23),";
const MARKDOWN_FILE_PREVIEW_CACHE_WITH_CWD =
  "function Oe(e){let t=(0,X.c)(24),";
const MARKDOWN_FILE_PREVIEW_PROPS_SOURCE =
  "{path:n,className:r,fallback:i,hostId:a,scrollable:o}=e";
const MARKDOWN_FILE_PREVIEW_PROPS_WITH_CWD =
  "{path:n,className:r,cwd:codexWebCwd,fallback:i,hostId:a,scrollable:o}=e";
const MARKDOWN_FILE_PREVIEW_MARKDOWN_SOURCE =
  "t[16]===_?x=t[17]:(x=(0,Z.jsx)(be,{enableMetadataPreview:!0,markdown:_}),t[16]=_,t[17]=x)";
const MARKDOWN_FILE_PREVIEW_MARKDOWN_WITH_CWD =
  "t[16]!==_||t[17]!==codexWebCwd?x=(t[18]=(0,Z.jsx)(be,{cwd:codexWebCwd,enableMetadataPreview:!0,markdown:_}),t[16]=_,t[17]=codexWebCwd,t[18]):x=t[18]";
const MARKDOWN_FILE_PREVIEW_SURFACE_SOURCE =
  "t[18]!==r||t[19]!==v||t[20]!==b||t[21]!==x?(S=(0,Z.jsx)(xe,{background:v,className:r,overflow:b,children:x}),t[18]=r,t[19]=v,t[20]=b,t[21]=x,t[22]=S):S=t[22],S";
const MARKDOWN_FILE_PREVIEW_SURFACE_WITH_CWD =
  "t[19]!==r||t[20]!==v||t[21]!==b||t[22]!==x?(S=(0,Z.jsx)(xe,{background:v,className:r,overflow:b,children:x}),t[19]=r,t[20]=v,t[21]=b,t[22]=x,t[23]=S):S=t[23],S";
const MARKDOWN_FALLBACK_START =
  "function br(e){let t=(0,X.c)(4),{onRetry:n}=e,r;";
const MARKDOWN_FALLBACK_GLOBAL_RETRY_START =
  "var markdownRetryCount=0;function br(e){let t=(0,X.c)(6),{onRetry:n}=e,r,o;t[4]===n?o=t[5]:(o=()=>{if(markdownRetryCount>=2)return;markdownRetryCount+=1;let e=setTimeout(n,100);return()=>clearTimeout(e)},t[4]=n,t[5]=o),(0,Z.useEffect)(o,[n]);";
const MARKDOWN_FALLBACK_AUTO_RETRY_START =
  "var markdownRetryCounts=new WeakMap;function br(e){let t=(0,X.c)(6),{onRetry:n}=e,r,o;t[4]===n?o=t[5]:(o=()=>{let e=markdownRetryCounts.get(n)??0;if(e>=2)return;markdownRetryCounts.set(n,e+1);let t=setTimeout(n,100);return()=>clearTimeout(t)},t[4]=n,t[5]=o),(0,Z.useEffect)(o,[n]);";

export function patchWebviewMarkdownRetrySource(source, assetName = "") {
  const isKnownMarkdownAsset =
    assetName.startsWith("markdown-") ||
    assetName.startsWith("review-file-source-tab-") ||
    assetName.startsWith("use-diff-annotations-") ||
    source.includes("function br(e)");

  if (!isKnownMarkdownAsset) {
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
  patched = replaceOnceIfPresent(
    patched,
    OLD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    "Markdown relative image helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    RAW_CWD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    "Markdown relative image helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    ENCODED_CWD_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    "Markdown relative image helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    ENCODED_SEPARATOR_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    "Markdown relative image helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    CWD_BOUNDARY_MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION,
    "Markdown relative image helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_IMAGE_COMPONENT_SOURCE,
    MARKDOWN_IMAGE_COMPONENT_WITH_CWD,
    "Markdown image cwd prop",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_IMAGE_PROPS_SOURCE,
    MARKDOWN_IMAGE_PROPS_WITH_CWD,
    "Markdown image cwd destructuring",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_IMAGE_PATH_SOURCE,
    MARKDOWN_IMAGE_PATH_WITH_RELATIVE_SOURCE,
    "Markdown relative image path",
  );
  patched = replaceOnceIfPresent(
    patched,
    OLD_MARKDOWN_FILE_CWD_FUNCTION,
    MARKDOWN_FILE_CWD_FUNCTION,
    "Markdown file cwd helper",
  );
  patched = replaceOnceIfPresent(
    patched,
    REVIEW_MARKDOWN_PREVIEW_COMPONENT_SOURCE,
    REVIEW_MARKDOWN_PREVIEW_COMPONENT_WITH_CWD,
    "review Markdown preview cwd prop",
  );
  patched = replaceOnceIfPresent(
    patched,
    REVIEW_MARKDOWN_PREVIEW_PROPS_SOURCE,
    REVIEW_MARKDOWN_PREVIEW_PROPS_WITH_CWD,
    "review Markdown preview cwd destructuring",
  );
  patched = replaceOnceIfPresent(
    patched,
    REVIEW_MARKDOWN_PREVIEW_SOURCE,
    REVIEW_MARKDOWN_PREVIEW_WITH_CWD,
    "review Markdown preview cwd forwarding",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FILE_PREVIEW_CACHE_SOURCE,
    MARKDOWN_FILE_PREVIEW_CACHE_WITH_CWD,
    "Markdown file preview cache size",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FILE_PREVIEW_PROPS_SOURCE,
    MARKDOWN_FILE_PREVIEW_PROPS_WITH_CWD,
    "Markdown file preview cwd destructuring",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FILE_PREVIEW_MARKDOWN_SOURCE,
    MARKDOWN_FILE_PREVIEW_MARKDOWN_WITH_CWD,
    "Markdown file preview cwd forwarding",
  );
  patched = replaceOnceIfPresent(
    patched,
    MARKDOWN_FILE_PREVIEW_SURFACE_SOURCE,
    MARKDOWN_FILE_PREVIEW_SURFACE_WITH_CWD,
    "Markdown file preview cache indexes",
  );
  if (
    patched.includes(MARKDOWN_SAFE_MEDIA_URL_SOURCE) &&
    !patched.includes("function codexWebSafeMarkdownMediaUrl")
  ) {
    patched = `${MARKDOWN_SAFE_MEDIA_URL_FUNCTION}${patched}`;
  }
  if (
    patched.includes(MARKDOWN_IMAGE_PATH_WITH_RELATIVE_SOURCE) &&
    !patched.includes("function codexWebResolveMarkdownMediaPath")
  ) {
    patched = `${MARKDOWN_RESOLVE_MEDIA_PATH_FUNCTION}${patched}`;
  }
  if (
    patched.includes(REVIEW_MARKDOWN_PREVIEW_COMPONENT_WITH_CWD) &&
    !patched.includes("function codexWebMarkdownFileCwd")
  ) {
    patched = `${MARKDOWN_FILE_CWD_FUNCTION}${patched}`;
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
  let sawRelativeImagePath = false;
  let sawReviewMarkdownPreviewCwd = false;
  let sawMarkdownFilePreviewCwd = false;

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
    sawRelativeImagePath ||= patched.includes(
      MARKDOWN_IMAGE_PATH_WITH_RELATIVE_SOURCE,
    );
    sawReviewMarkdownPreviewCwd ||=
      patched.includes(REVIEW_MARKDOWN_PREVIEW_COMPONENT_WITH_CWD) &&
      patched.includes(REVIEW_MARKDOWN_PREVIEW_WITH_CWD);
    sawMarkdownFilePreviewCwd ||= patched.includes(
      MARKDOWN_FILE_PREVIEW_MARKDOWN_WITH_CWD,
    );

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
  if (!sawRelativeImagePath) {
    throw new Error("Unable to patch Markdown relative image path");
  }
  if (!sawReviewMarkdownPreviewCwd) {
    throw new Error("Unable to patch review Markdown preview cwd");
  }
  if (!sawMarkdownFilePreviewCwd) {
    throw new Error("Unable to patch Markdown file preview cwd");
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
