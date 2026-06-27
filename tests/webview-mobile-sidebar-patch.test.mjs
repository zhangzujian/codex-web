import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewMobileSidebarAssets,
  patchWebviewMobileSidebarSource,
} from "../scripts/patch_webview_mobile_sidebar.mjs";

const appShellSource = [
  "function Yr({bottomPanelSlot:e,rightPanelSlot:r}){",
  "let p=r!=null,g=c(N),_=c(L),",
  "let ge={rightPanelAnimatedWidth:ae},",
  "let {rightPanelAnimatedWidth:ae,rightPanelWidth:oe,rightPanelWidthRatio:se,widthMode:ce}=Ar({isFullWidth:g,mainContentWidth:ie}),",
  "let ve=d,be=(0,Z.useCallback)(e=>e,[]),",
  "let A=d&&T,M=O&&x&&!g;",
  "return d&&(A||z)&&(0,Q.jsx)(Or,{className:`app-shell-left-panel`,children:u}),",
  "ve&&!T&&!z&&(0,Q.jsx)(Xr,{",
  "isVisible:D&&!T&&!z,",
  "onOpenSidebar:()=>{k(i,!0,{animate:!1})}",
  "})",
  "}",
].join("");
const currentV2AppShellSource = [
  "function jpn({bottomPanelSlot:e,children:t,leftPanelSlot:n,rightPanelSlot:r}){",
  "let f=(n??(l?d.current:void 0))?.children,p=f!=null,m=e!=null,h=r!=null,g=(0,dq.useRef)(!1),_=(0,dq.useRef)(!1),v=Nn(zC),y=Nn(WC),T=Nn(nw),E=Nn(Vu),D=Nn(Jpn),O=y===`thread-edge-scroll`,k=p&&T,A=O&&C&&!v,j=y===`full-bleed`;",
  "let N=rg(kWe()),P=og(N,e=>`${Math.max(0,e-Wpn*2)}px`),{isMounted:F,animatedSize:I}=$K({animation:Nn(cw),size:N,isVisible:k}),L=rg(window.innerWidth),R=rg(window.innerHeight-46);",
  "let te=og([L,I],([e,t])=>Math.max(0,e-t)),{rightPanelAnimatedWidth:ne,rightPanelWidth:re,rightPanelWidthRatio:K,widthMode:ie}=gpn({isFullWidth:v,mainContentWidth:te});",
  "let me=Rr(({width:e})=>{L.set(e);let t=e<=Vpn,n=e<=Hpn,r=t!==g.current,a=n!==_.current;});",
  "return fe&&!T&&!l&&!F&&(0,fq.jsx)(Mpn,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:D&&!T&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{ZC(i,!0,{animate:!1})}}),",
  "(0,fq.jsx)(`div`,{className:`app-shell-left-panel`,children:f}),",
  "(0,fq.jsx)(`div`,{className:Y(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,v?`w-0 flex-none overflow-hidden`:`flex-1`)}),",
  "rightPanelAnimatedWidth}",
].join("");
const currentV3AppShellSource = [
  "function FGe({bottomPanelSlot:e,children:t,leftPanelSlot:n,rightPanelSlot:r}){",
  "let i=B(Z),a=B(Pa),o=(0,HF.useRef)(null),[s,c]=(0,HF.useState)(null),[l,u]=(0,HF.useState)(!1),d=(0,HF.useRef)(n);",
  "let f=(n??(l?d.current:void 0))?.children,p=f!=null,m=e!=null,h=r!=null,g=(0,HF.useRef)(!1),_=(0,HF.useRef)(!1),v=X(wS),y=X(kS),b=al(),x=FWe(),S=qP(),[C,w]=(0,HF.useState)(!1),T=X(HS),E=X(Fo),D=X(JGe),O=y===`thread-edge-scroll`,k=p&&T,A=O&&C&&!v,j=y===`full-bleed`;",
  "let N=sp(cCe()),P=yp(N,e=>`${Math.max(0,e-GF*2)}px`),{isMounted:F,animatedSize:I}=CF({animation:X(JS),size:N,isVisible:k}),L=sp(window.innerWidth),R=sp(window.innerHeight-46),J=yp([L,I],([e,t])=>Math.max(0,e-t)),{rightPanelAnimatedWidth:Y,rightPanelWidth:ee,rightPanelWidthRatio:te,widthMode:ne}=SGe({isFullWidth:v,mainContentWidth:J});",
  "let fe=xl(({width:e})=>{L.set(e);let t=e<=UGe,n=e<=WGe,r=t!==g.current,a=n!==_.current;});",
  "return ue&&!T&&!l&&!F&&(0,UF.jsx)(IGe,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:D&&!T&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{IS(i,!0,{animate:!1})}}),",
  "(0,UF.jsx)(`div`,{className:`app-shell-left-panel`,children:f}),",
  "(0,UF.jsx)(`div`,{className:$(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,v?`w-0 flex-none overflow-hidden`:`flex-1`)}),",
  "rightPanelAnimatedWidth}",
].join("");

const mobileViewportWidthPattern =
  /Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)/;
const mobileViewportNarrowPattern =
  /\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|\(globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0\|\|globalThis\.navigator\?\.maxTouchPoints>0\)&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1440\)/;

test("mobile sidebar patch uses floating overlay while sidebar is open on narrow screens", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.match(patched, mobileViewportWidthPattern);
  assert.match(patched, mobileViewportNarrowPattern);
  assert.match(patched, /g=c\(N\)\|\|p&&\(Math\.min/);
  assert.match(patched, /Ar\(\{isFullWidth:g,mainContentWidth:g\?V:ie\}\)/);
  assert.match(patched, /ve=d&&!\(p&&\(Math\.min/);
  assert.match(patched, /A=d&&T&&!\(Math\.min/);
  assert.match(patched, /d&&!\(Math\.min[\s\S]*&&\(A\|\|z\)&&\(0,Q\.jsx\)\(Or,/);
  assert.match(patched, /ve&&\(!T\|\|\(Math\.min[\s\S]*\)\)&&!z&&!\(p&&\(Math\.min[\s\S]*\)\)&&\(0,Q\.jsx\)\(Xr,/);
  assert.match(patched, /isVisible:\(D&&!\(Math\.min[\s\S]*\|\|T&&\(Math\.min[\s\S]*\)\)&&!z,/);
  assert.match(patched, /onOpenSidebar:\(\)=>\{k\(i,!\(T&&\(Math\.min[\s\S]*\)\),\{animate:!1\}\)\}/);
});

test("mobile sidebar patch treats coarse physical-width phones as narrow", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.match(patched, /<=1440/);
});

test("mobile sidebar patch treats touch physical-width phones as narrow without coarse pointer", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.match(patched, /navigator\?\.maxTouchPoints>0/);
});

test("mobile sidebar patch supports the current jpn app shell layout", () => {
  const patched = patchWebviewMobileSidebarSource(currentV2AppShellSource);

  assert.match(patched, mobileViewportWidthPattern);
  assert.match(patched, /navigator\?\.maxTouchPoints>0/);
  assert.match(patched, /gpn\(\{isFullWidth:v\|\|h&&\(Math\.min/);
  assert.match(patched, /mainContentWidth:v\|\|h&&\(Math\.min[\s\S]*\?L:te/);
  assert.match(patched, /k=p&&T&&!\(Math\.min/);
  assert.match(patched, /fe&&\(!T\|\|\(Math\.min[\s\S]*\)\)&&!l&&!F&&!\(h&&\(Math\.min/);
  assert.match(
    patched,
    /className:Y\(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,\(v\|\|h&&\(Math\.min/,
  );
  assert.equal(patchWebviewMobileSidebarSource(patched), patched);
});

test("mobile sidebar patch supports the current FGe app shell layout", () => {
  const patched = patchWebviewMobileSidebarSource(currentV3AppShellSource);

  assert.match(patched, mobileViewportWidthPattern);
  assert.match(patched, /navigator\?\.maxTouchPoints>0/);
  assert.match(patched, /SGe\(\{isFullWidth:v\|\|h&&\(Math\.min/);
  assert.match(patched, /mainContentWidth:v\|\|h&&\(Math\.min[\s\S]*\?L:J/);
  assert.match(patched, /k=p&&T&&!\(Math\.min/);
  assert.match(patched, /ue&&\(!T\|\|\(Math\.min[\s\S]*\)\)&&!l&&!F&&!\(h&&\(Math\.min/);
  assert.match(
    patched,
    /className:\$\(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,\(v\|\|h&&\(Math\.min/,
  );
  assert.equal(patchWebviewMobileSidebarSource(patched), patched);
});

test("mobile sidebar patch is idempotent", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.equal(patchWebviewMobileSidebarSource(patched), patched);
});

test("mobile sidebar patch upgrades previous coarse pointer threshold", () => {
  const legacy = patchWebviewMobileSidebarSource(appShellSource).replaceAll(
    "<=1440",
    "<=1024",
  );

  const patched = patchWebviewMobileSidebarSource(legacy);

  assert.match(patched, mobileViewportNarrowPattern);
  assert.doesNotMatch(patched, /<=1024/);
});

test("mobile sidebar patch upgrades the previous unconditional full-width condition", () => {
  const legacy = patchWebviewMobileSidebarSource(appShellSource).replace(
    "g=c(N)||p&&(Math.min",
    "g=c(N)||(Math.min",
  );

  const patched = patchWebviewMobileSidebarSource(legacy);

  assert.match(
    patched,
    /g=c\(N\)\|\|p&&\(Math\.min\(window\.innerWidth,window\.visualViewport/,
  );
});

test("mobile sidebar patch hides the floating left panel while mobile right panel is open", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.match(patched, /!\(p&&\(Math\.min/);
});

test("mobile sidebar patch upgrades the earlier hover-visible overlay patch", () => {
  const intermediate = appShellSource.replace(
    "isVisible:D&&!T&&!z,",
    "isVisible:(D||T&&window.innerWidth<=Ur)&&!z,",
  );
  assert.notEqual(intermediate, appShellSource);

  const patched = patchWebviewMobileSidebarSource(intermediate);

  assert.match(
    patched,
    mobileViewportNarrowPattern,
  );
});

test("mobile sidebar patch upgrades the previous innerWidth-only patch", () => {
  const innerWidthOnly = [
    "function Yr({bottomPanelSlot:e,rightPanelSlot:r}){",
    "let p=r!=null,g=c(N)||p&&window.innerWidth<=Ur,_=c(L),",
    "let ge={rightPanelAnimatedWidth:ae},",
    "let {rightPanelAnimatedWidth:ae,rightPanelWidth:oe,rightPanelWidthRatio:se,widthMode:ce}=Ar({isFullWidth:g,mainContentWidth:ie}),",
    "let ve=d,be=(0,Z.useCallback)(e=>e,[]),",
    "let A=d&&T&&window.innerWidth>Ur,M=O&&x&&!g;",
    "return d&&window.innerWidth>Ur&&(A||z)&&(0,Q.jsx)(Or,{className:`app-shell-left-panel`,children:u}),",
    "ve&&(!T||window.innerWidth<=Ur)&&!z&&(0,Q.jsx)(Xr,{",
    "isVisible:(D&&window.innerWidth>Ur||T&&window.innerWidth<=Ur)&&!z,",
    "onOpenSidebar:()=>{k(i,!(T&&window.innerWidth<=Ur),{animate:!1})}",
    "})",
    "}",
  ].join("");

  const patched = patchWebviewMobileSidebarSource(innerWidthOnly);

  assert.match(patched, mobileViewportWidthPattern);
  assert.doesNotMatch(patched, /window\.innerWidth[<>]=?Ur/);
});

test("mobile sidebar patch upgrades the previous visualViewport-only patch", () => {
  const visualViewportOnly = [
    "function Yr({bottomPanelSlot:e,rightPanelSlot:r}){",
    "let p=r!=null,g=c(N)||p&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)<=Ur,_=c(L),",
    "let ge={rightPanelAnimatedWidth:ae},",
    "let {rightPanelAnimatedWidth:ae,rightPanelWidth:oe,rightPanelWidthRatio:se,widthMode:ce}=Ar({isFullWidth:g,mainContentWidth:ie}),",
    "let ve=d,be=(0,Z.useCallback)(e=>e,[]),",
    "let A=d&&T&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)>Ur,M=O&&x&&!g;",
    "return d&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)>Ur&&(A||z)&&(0,Q.jsx)(Or,{className:`app-shell-left-panel`,children:u}),",
    "ve&&(!T||Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)<=Ur)&&!z&&(0,Q.jsx)(Xr,{",
    "isVisible:(D&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)>Ur||T&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)<=Ur)&&!z,",
    "onOpenSidebar:()=>{k(i,!(T&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)<=Ur),{animate:!1})}",
    "})",
    "}",
  ].join("");

  const patched = patchWebviewMobileSidebarSource(visualViewportOnly);

  assert.match(patched, mobileViewportWidthPattern);
  assert.match(patched, /window\.screen\?\.width/);
  assert.doesNotMatch(
    patched,
    /Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth\)[<>]=?Ur/,
  );
});

test("mobile sidebar patch fails when app shell layout shape changes", () => {
  assert.throws(
    () => patchWebviewMobileSidebarSource("function Yr(){let A=d&&T;}"),
    /Unable to patch mobile sidebar/,
  );
});

test("mobile sidebar asset patch updates the bundled app shell chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-mobile-sidebar-"),
  );

  try {
    fs.writeFileSync(path.join(assetsDir, "app-shell-test.js"), appShellSource);

    const patchedFiles = patchWebviewMobileSidebarAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["app-shell-test.js"],
    );
    assert.match(
      fs.readFileSync(path.join(assetsDir, "app-shell-test.js"), "utf8"),
      mobileViewportWidthPattern,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});

test("mobile sidebar asset patch ignores app shell helper chunks", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-mobile-sidebar-"),
  );

  try {
    fs.writeFileSync(
      path.join(assetsDir, "app-shell-bottom-panel-scroll-sync-test.js"),
      "export const helper = true;",
    );
    fs.writeFileSync(path.join(assetsDir, "app-shell-test.js"), appShellSource);

    const patchedFiles = patchWebviewMobileSidebarAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["app-shell-test.js"],
    );
    assert.equal(
      fs.readFileSync(
        path.join(assetsDir, "app-shell-bottom-panel-scroll-sync-test.js"),
        "utf8",
      ),
      "export const helper = true;",
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});

test("mobile sidebar asset patch picks the app shell chunk imported by thread chrome", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-mobile-sidebar-"),
  );

  try {
    fs.writeFileSync(path.join(assetsDir, "app-shell-0b-x_r3Z.js"), "other");
    fs.writeFileSync(path.join(assetsDir, "app-shell-DCvuE1cb.js"), appShellSource);
    fs.writeFileSync(
      path.join(assetsDir, "thread-app-shell-chrome-test.js"),
      'import "./app-shell-DCvuE1cb.js";',
    );

    const patchedFiles = patchWebviewMobileSidebarAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["app-shell-DCvuE1cb.js"],
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
