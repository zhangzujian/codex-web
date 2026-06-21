import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewMarkdownRetryAssets,
  patchWebviewMarkdownRetrySource,
} from "../scripts/patch_webview_markdown_retry.mjs";

const markdownSource = [
  "function Vi(e){let t=(0,X.c)(5),n;t[0]===e?n=t[1]:(n=(0,Q.jsx)(Ui,{...e}),t[0]=e,t[1]=n);let r;return t[2]!==e.children||t[3]!==n?(r=(0,Q.jsx)(fe,{name:`StreamingMarkdown`,resetKey:e.children,fallback:Hi,children:n}),t[2]=e.children,t[3]=n,t[4]=r):r=t[4],r}",
  "function Hi(e){return(0,Q.jsx)(br,{onRetry:()=>{e.resetError()}})}",
  "function br(e){let t=(0,X.c)(4),{onRetry:n}=e,r;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(r=(0,Q.jsx)(`div`,{className:`mb-2 font-medium text-token-text-primary`,children:(0,Q.jsx)(P,{id:`markdown.renderError.title`,defaultMessage:`Markdown couldn't render`,description:`Error message shown when Markdown content fails to render`})}),t[0]=r):r=t[0];let i;t[1]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,Q.jsx)(P,{id:`markdown.renderError.retry`,defaultMessage:`Try again`,description:`Button label to retry rendering Markdown content`}),t[1]=i):i=t[1];let a;return t[2]===n?a=t[3]:(a=(0,Q.jsxs)(`div`,{className:`rounded-md border border-token-border bg-token-foreground/5 px-3 py-2 text-sm text-token-text-secondary`,children:[r,(0,Q.jsx)(I,{color:`secondary`,size:`default`,onClick:n,children:i})]}),t[2]=n,t[3]=a),a}",
  "function ni(e){return(0,Q.jsx)(br,{onRetry:()=>{e.resetError()}})}",
].join("");

const markdownMediaSource =
  "function pn(e){let R=I?.contentsBase64??null,z=j.safeUrl??ee??(P&&R!=null?Qt({contentsBase64:R,mimeType:I?.mimeType??null,path:C??x}):x),B=r??``;return(0,Q.jsx)(`img`,{src:z,alt:B})}";

test("markdown retry patch stabilizes streaming reset key and auto-retries fallback", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownSource,
    "markdown-CMykY9jH.js",
  );

  assert.match(patched, /resetKey:e\.isStreaming\?`streaming`:e\.children/);
  assert.match(patched, /function Hi\(e\)\{return\(0,Q\.jsx\)\(br,\{onRetry:e\.resetError\}\)\}/);
  assert.match(patched, /function ni\(e\)\{return\(0,Q\.jsx\)\(br,\{onRetry:e\.resetError\}\)\}/);
  assert.match(patched, /markdownRetryCounts=new WeakMap/);
  assert.match(patched, /setTimeout\(n,100\)/);
  assert.doesNotMatch(patched, /onRetry:\(\)=>\{e\.resetError\(\)\}/);
});

test("markdown retry patch is idempotent", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownSource,
    "markdown-CMykY9jH.js",
  );

  assert.equal(
    patchWebviewMarkdownRetrySource(patched, "markdown-CMykY9jH.js"),
    patched,
  );
});

test("markdown patch drops mixed-content media URLs", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownMediaSource,
    "markdown-CMykY9jH.js",
  );

  assert.match(patched, /function codexWebSafeMarkdownMediaUrl/);
  assert.match(
    patched,
    /z=codexWebSafeMarkdownMediaUrl\(j\.safeUrl\?\?ee\?\?\(P&&R!=null\?Qt/,
  );
});

test("markdown retry asset patch fails when regular fallback is not stabilized", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-retry-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "markdown-test.js"),
      patchWebviewMarkdownRetrySource(markdownSource, "markdown-test.js").replace(
        "function ni(e){return(0,Q.jsx)(br,{onRetry:e.resetError})}",
        "function nj(e){return(0,Q.jsx)(br,{onRetry:()=>{e.resetError()}})}",
      ),
    );

    assert.throws(
      () => patchWebviewMarkdownRetryAssets(tmpDir),
      /regular Markdown render retry callback/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
