import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewMobileTabLayoutAssets,
  patchWebviewMobileTabLayoutSource,
} from "../scripts/patch_webview_mobile_tab_layout.mjs";

const appShellTabStripChunk = [
  "function An(){",
  "let e=c(J),t=c(q),n=c(Y),r=c(H),i=c(N),a=c(ke),{headerLeftWidth:o,headerRightWidth:s}=ie(),l=$t`max(0px, calc(${s}px)`;",
  "return(0,Q.jsx)(_n,{headerHeight:`toolbar`,beforeList:(0,Q.jsxs)(Q.Fragment,{children:[i&&!a&&(0,Q.jsx)(w.div,{\"aria-hidden\":!0,className:`pointer-events-none h-full shrink-0`,style:{width:o}}),n]}),afterListSticky:t,emptyState:r,afterList:(0,Q.jsxs)(Q.Fragment,{children:[e,(0,Q.jsx)(On,{}),(0,Q.jsx)(w.div,{\"aria-hidden\":!0,\"data-testid\":`right-panel-tab-bar-header-spacer`,className:`pointer-events-none flex h-full shrink-0 items-center`,style:{width:l}})]}),controller:lt})",
  "}",
  "function vn(e){",
  "let t=(0,$.c)(94),{afterSticky:i}=e,[p,m]=Bt();",
  "let _=`${m??0}px`;",
  "t[41]===_?k=t[42]:(k={scrollPaddingInlineEnd:_},t[41]=_,t[42]=k);",
  "let J=i!=null&&(0,Q.jsx)(`div`,{ref:p,className:C(`sticky right-0 shrink-0 bg-token-main-surface-primary`),children:i});",
  "return (0,Q.jsxs)(`div`,{ref:E,\"data-app-shell-tab-strip-controller\":D,className:O,style:k,children:[A,j,V,H,q,J]})",
  "}",
].join("");

test("patchWebviewMobileTabLayoutSource reserves inline space for sticky tab actions", () => {
  const patched = patchWebviewMobileTabLayoutSource(appShellTabStripChunk);

  assert.match(
    patched,
    /k=\{scrollPaddingInlineEnd:_,paddingInlineEnd:_\}/,
  );
  assert.doesNotMatch(patched, /k=\{scrollPaddingInlineEnd:_\}/);
});

test("patchWebviewMobileTabLayoutSource keeps full-width panel tabs clear of header start buttons", () => {
  const patched = patchWebviewMobileTabLayoutSource(appShellTabStripChunk);

  assert.match(patched, /u=\$t`max\(\$\{o\}px, 142px\)`/);
  assert.match(
    patched,
    /!a&&\(i\|\|Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\)&&/,
  );
  assert.match(patched, /style:\{width:u\}/);
  assert.doesNotMatch(patched, /style:\{width:o\}/);
});

test("patchWebviewMobileTabLayoutSource is idempotent", () => {
  const patched = patchWebviewMobileTabLayoutSource(appShellTabStripChunk);

  assert.equal(patchWebviewMobileTabLayoutSource(patched), patched);
});

test("patchWebviewMobileTabLayoutAssets patches only the app shell tab strip asset", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-tab-layout-"));
  fs.writeFileSync(path.join(dir, "app-shell-test.js"), appShellTabStripChunk);
  fs.writeFileSync(path.join(dir, "other.js"), appShellTabStripChunk);

  const patchedFiles = patchWebviewMobileTabLayoutAssets(dir);

  assert.deepEqual(patchedFiles, [path.join(dir, "app-shell-test.js")]);
  assert.match(
    fs.readFileSync(path.join(dir, "app-shell-test.js"), "utf8"),
    /paddingInlineEnd:_/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(dir, "other.js"), "utf8"),
    /paddingInlineEnd:_/,
  );
});

test("patchWebviewMobileTabLayoutAssets picks the tab strip chunk imported by thread chrome", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-tab-layout-"));
  fs.writeFileSync(path.join(dir, "app-shell-0b-x_r3Z.js"), "other");
  fs.writeFileSync(path.join(dir, "app-shell-DCvuE1cb.js"), appShellTabStripChunk);
  fs.writeFileSync(
    path.join(dir, "thread-app-shell-chrome-test.js"),
    'import "./app-shell-DCvuE1cb.js";',
  );

  const patchedFiles = patchWebviewMobileTabLayoutAssets(dir);

  assert.deepEqual(patchedFiles, [path.join(dir, "app-shell-DCvuE1cb.js")]);
});
