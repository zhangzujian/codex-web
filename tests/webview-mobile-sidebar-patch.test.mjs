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
  "let A=d&&T,M=O&&x&&!g;",
  "return d&&(A||z)&&(0,Q.jsx)(Or,{className:`app-shell-left-panel`,children:u}),",
  "ve&&!T&&!z&&(0,Q.jsx)(Xr,{",
  "isVisible:D&&!T&&!z,",
  "onOpenSidebar:()=>{k(i,!0,{animate:!1})}",
  "})",
  "}",
].join("");

const mobileViewportWidthPattern =
  /Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)/;
const mobileViewportNarrowPattern =
  /\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)/;

test("mobile sidebar patch uses floating overlay while sidebar is open on narrow screens", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.match(patched, mobileViewportWidthPattern);
  assert.match(patched, mobileViewportNarrowPattern);
  assert.match(
    patched,
    /g=c\(N\)\|\|p&&\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\),/,
  );
  assert.match(
    patched,
    /A=d&&T&&!\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\),/,
  );
  assert.match(
    patched,
    /d&&!\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)&&\(A\|\|z\)&&\(0,Q\.jsx\)\(Or,/,
  );
  assert.match(
    patched,
    /ve&&\(!T\|\|\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)\)&&!z&&\(0,Q\.jsx\)\(Xr,/,
  );
  assert.match(
    patched,
    /isVisible:\(D&&!\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)\|\|T&&\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)\)&&!z,/,
  );
  assert.match(
    patched,
    /onOpenSidebar:\(\)=>\{k\(i,!\(T&&\(Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=Ur\|\|globalThis\.matchMedia\?\.\(`\(pointer: coarse\)`\)\?\.matches===!0&&Math\.min\(window\.innerWidth,window\.visualViewport\?\.width\?\?window\.innerWidth,window\.screen\?\.width\?\?window\.innerWidth\)<=1024\)\),\{animate:!1\}\)\}/,
  );
});

test("mobile sidebar patch is idempotent", () => {
  const patched = patchWebviewMobileSidebarSource(appShellSource);

  assert.equal(patchWebviewMobileSidebarSource(patched), patched);
});

test("mobile sidebar patch upgrades the earlier hover-visible overlay patch", () => {
  const current = patchWebviewMobileSidebarSource(appShellSource);
  const intermediate = current.replace(
    "isVisible:(D&&!(Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)<=Ur||globalThis.matchMedia?.(`(pointer: coarse)`)?.matches===!0&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)<=1024)||T&&(Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)<=Ur||globalThis.matchMedia?.(`(pointer: coarse)`)?.matches===!0&&Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)<=1024))&&!z,",
    "isVisible:(D||T&&window.innerWidth<=Ur)&&!z,",
  );
  assert.notEqual(intermediate, current);

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
