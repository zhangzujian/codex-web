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

const markdownRelativeImageSource = [
  "function yn({allowWideBlocks:e,animateImageEnter:t,cwd:n,forceCodeBlockWordWrap:r,hideCodeBlocks:i,hostId:a,mediaCacheKey:o,mediaPresentation:s,rootRef:c,textClassName:l}){return{img(e){return(0,Q.jsx)(pn,{...e,animateEnter:t,hostId:a,mediaCacheKey:o,mediaPresentation:s,rootRef:c})}}}",
  "function pn(e){let t=(0,X.c)(80),{allowWide:n,alt:r,animateEnter:i,className:a,hostId:o,mediaCacheKey:s,mediaPresentation:c,rootRef:l,src:u,title:d}=e,f=n===void 0?!1:n,p=i===void 0?!1:i,m=N(),[h,g]=(0,Z.useState)(!1),[_,v]=(0,Z.useState)(null),[y,b]=(0,Z.useState)(null),x=u??``,C=H(x),w=x.length>0,T=Xt(x);return null}",
].join("");

const reviewFileSourceMarkdownPreviewSource = [
  "function Ai(e){let t=(0,$.c)(52),{cwd:n,headerActions:r,hostId:a,initialEndLine:s,initialLine:c,onSelectFile:l,path:u,setTabState:d,tabId:p,tabState:m}=e,h;if(C!=null&&(E===`always`||N&&D)){z=N;let e;t[27]!==j||t[28]!==a||t[29]!==u||t[30]!==C?(e=(0,Z.jsx)(Ii,{gitBlameFeatureEnabled:j,hostId:a,path:u,previewKind:C}),t[27]=j,t[28]=a,t[29]=u,t[30]=C,t[31]=e):e=t[31],I=e}return I}",
  "function Ii(e){let t=(0,$.c)(19),{gitBlameFeatureEnabled:n,hostId:r,path:i,previewKind:a}=e,o;t[0]!==r||t[1]!==i?(o={before:null,after:{kind:`worktree`,hostId:r,path:i}},t[0]=r,t[1]=i,t[2]=o):o=t[2];let s=o,c;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,Z.jsx)(Wi,{isError:!0,isLoading:!1}),t[3]=c):c=t[3];let l=c;switch(a){case`markdown`:{let e;t[6]!==n||t[7]!==r||t[8]!==i?(e=(0,Z.jsx)(Fi,{gitBlameFeatureEnabled:n,hostId:r,path:i}),t[6]=n,t[7]=r,t[8]=i,t[9]=e):e=t[9];let a;return t[10]!==r||t[11]!==i||t[12]!==e?(a=(0,Z.jsx)(Mn,{className:`h-full bg-token-main-surface-primary`,hostId:r,path:i,fallback:e,scrollable:!0}),t[10]=r,t[11]=i,t[12]=e,t[13]=a):a=t[13],a}}}",
].join("");

const markdownFilePreviewComponentSource =
  "function Oe(e){let t=(0,X.c)(23),{path:n,className:r,fallback:i,hostId:a,scrollable:o}=e,s=o===void 0?!1:o,c=n!=null&&n.length>0&&n!==`/dev/null`,l=n??``,u;t[0]===a?u=t[1]:(u=a==null?{}:{hostId:a},t[0]=a,t[1]=u);let d;t[2]!==l||t[3]!==u?(d={path:l,...u},t[2]=l,t[3]=u,t[4]=d):d=t[4];let f;t[5]===c?f=t[6]:(f={enabled:c},t[5]=c,t[6]=f);let p;t[7]!==d||t[8]!==f?(p={params:d,queryConfig:f},t[7]=d,t[8]=f,t[9]=p):p=t[9];let{data:m,isLoading:h,isError:g}=y(`read-file`,p),_=m?.contents??null;if(!c)return i;if(h){let e=s?`overflow-auto`:`overflow-clip`,n;t[10]!==r||t[11]!==e?(n=T(`relative`,e,r),t[10]=r,t[11]=e,t[12]=n):n=t[12];let i;t[13]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,Z.jsx)(ye,{className:`justify-center py-6 text-sm`}),t[13]=i):i=t[13];let a;return t[14]===n?a=t[15]:(a=(0,Z.jsx)(`div`,{className:n,children:i}),t[14]=n,t[15]=a),a}if(_==null||_.length===0||g)return i;let v=s?`normal`:`subtle`,b=s?`auto`:`clip`,x;t[16]===_?x=t[17]:(x=(0,Z.jsx)(be,{enableMetadataPreview:!0,markdown:_}),t[16]=_,t[17]=x);let S;return t[18]!==r||t[19]!==v||t[20]!==b||t[21]!==x?(S=(0,Z.jsx)(xe,{background:v,className:r,overflow:b,children:x}),t[18]=r,t[19]=v,t[20]=b,t[21]=x,t[22]=S):S=t[22],S}";

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

test("markdown patch resolves relative image URLs against cwd", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownRelativeImageSource,
    "markdown-CMykY9jH.js",
  );

  assert.match(patched, /function codexWebResolveMarkdownMediaPath/);
  assert.match(patched, /pn,\{\.\.\.e,cwd:n,animateEnter:t/);
  assert.match(
    patched,
    /C=H\(x\)\?\?codexWebResolveMarkdownMediaPath\(x,codexWebCwd\)/,
  );
});

test("markdown relative image helper rejects paths above cwd", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownRelativeImageSource,
    "markdown-CMykY9jH.js",
  );
  const helperSource = patched.match(
    /function codexWebResolveMarkdownMediaPath\(.*?\}\}/,
  )[0];
  const helper = Function(`${helperSource};return codexWebResolveMarkdownMediaPath`)();

  assert.equal(
    helper("../img.png", "/repo/docs/guide"),
    null,
  );
  assert.equal(
    helper("../img.png", "/repo/a#b/guide"),
    null,
  );
  assert.equal(
    helper("../img.png", "/repo/a?b/guide"),
    null,
  );
  assert.equal(
    helper("foo%2F..%2F..%2Fetc/passwd", "/repo/docs/guide"),
    null,
  );
  assert.equal(
    helper("../../../etc/passwd", "/repo/docs/guide"),
    null,
  );
  assert.equal(
    helper("a#b.png", "/repo/docs"),
    "/repo/docs/a#b.png",
  );
  assert.equal(
    helper("a?b.png", "/repo/docs"),
    "/repo/docs/a?b.png",
  );
});

test("review file markdown preview passes the file directory as cwd", () => {
  const patched = patchWebviewMarkdownRetrySource(
    reviewFileSourceMarkdownPreviewSource,
    "review-file-source-tab-D2Ah3Wtd.js",
  );

  assert.match(patched, /function codexWebMarkdownFileCwd/);
  assert.match(patched, /Ii,\{cwd:codexWebMarkdownFileCwd\(u\),gitBlameFeatureEnabled:j/);
  assert.match(
    patched,
    /\{cwd:codexWebCwd,gitBlameFeatureEnabled:n,hostId:r,path:i,previewKind:a\}=e/,
  );
  assert.match(patched, /Mn,\{className:`h-full bg-token-main-surface-primary`,cwd:codexWebCwd,hostId:r,path:i,fallback:e,scrollable:!0\}/);

  const helperSource = patched.match(/function codexWebMarkdownFileCwd\(.*?\}/)[0];
  const helper = Function(`${helperSource};return codexWebMarkdownFileCwd`)();
  assert.equal(helper("/README.md"), "/");
});

test("markdown file preview component forwards cwd to markdown surface", () => {
  const patched = patchWebviewMarkdownRetrySource(
    markdownFilePreviewComponentSource,
    "use-diff-annotations-BvXsbftx.js",
  );

  assert.match(patched, /\(0,X\.c\)\(24\)/);
  assert.match(
    patched,
    /\{path:n,className:r,cwd:codexWebCwd,fallback:i,hostId:a,scrollable:o\}=e/,
  );
  assert.match(
    patched,
    /be,\{cwd:codexWebCwd,enableMetadataPreview:!0,markdown:_\}/,
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
