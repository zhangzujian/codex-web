#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MOBILE_VIEWPORT_WIDTH =
  "Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)";
const MOBILE_VIEWPORT_HAS_TOUCH =
  "(globalThis.matchMedia?.(`(pointer: coarse)`)?.matches===!0||globalThis.navigator?.maxTouchPoints>0)";
const MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=Ur||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440)`;
const MOBILE_RIGHT_PANEL_OPEN = `p&&${MOBILE_VIEWPORT_IS_NARROW}`;
const CURRENT_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=tz||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440)`;
const CURRENT_MOBILE_RIGHT_PANEL_OPEN =
  `h&&${CURRENT_MOBILE_VIEWPORT_IS_NARROW}`;
const CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=Vpn||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440)`;
const CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN =
  `h&&${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW}`;
const CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=UGe||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440)`;
const CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN =
  `h&&${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW}`;
const LEGACY_MOBILE_VIEWPORT_WIDTH =
  "Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth)";
const LEGACY_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=Ur||globalThis.matchMedia?.(\`(pointer: coarse)\`)?.matches===!0&&${MOBILE_VIEWPORT_WIDTH}<=1024)`;
const LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=Ur||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1024)`;
const LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW =
  `(${MOBILE_VIEWPORT_WIDTH}<=Ur||globalThis.matchMedia?.(\`(pointer: coarse)\`)?.matches===!0&&${MOBILE_VIEWPORT_WIDTH}<=1440)`;

const DOCKED_LEFT_PANEL_PATTERNS = [
  "A=d&&T,",
  "A=d&&T&&window.innerWidth>Ur,",
  `A=d&&T&&${LEGACY_MOBILE_VIEWPORT_WIDTH}>Ur,`,
  `A=d&&T&&${MOBILE_VIEWPORT_WIDTH}>Ur,`,
  `A=d&&T&&!${LEGACY_MOBILE_VIEWPORT_IS_NARROW},`,
  `A=d&&T&&!${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW},`,
  `A=d&&T&&!${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW},`,
];
const PATCHED_DOCKED_LEFT_PANEL = `A=d&&T&&!${MOBILE_VIEWPORT_IS_NARROW},`;

const DOCKED_LEFT_PANEL_RENDER_PATTERNS = [
  "d&&(A||z)&&(0,Q.jsx)(Or,{",
  "d&&window.innerWidth>Ur&&(A||z)&&(0,Q.jsx)(Or,{",
  `d&&${LEGACY_MOBILE_VIEWPORT_WIDTH}>Ur&&(A||z)&&(0,Q.jsx)(Or,{`,
  `d&&${MOBILE_VIEWPORT_WIDTH}>Ur&&(A||z)&&(0,Q.jsx)(Or,{`,
  `d&&!${LEGACY_MOBILE_VIEWPORT_IS_NARROW}&&(A||z)&&(0,Q.jsx)(Or,{`,
  `d&&!${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW}&&(A||z)&&(0,Q.jsx)(Or,{`,
  `d&&!${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW}&&(A||z)&&(0,Q.jsx)(Or,{`,
];
const PATCHED_DOCKED_LEFT_PANEL_RENDER =
  `d&&!${MOBILE_VIEWPORT_IS_NARROW}&&(A||z)&&(0,Q.jsx)(Or,{`;

const MOBILE_RIGHT_PANEL_FULL_WIDTH_PATTERNS = [
  "g=c(N),_=c(L),",
  "g=c(N)||p&&window.innerWidth<=Ur,_=c(L),",
  `g=c(N)||p&&${LEGACY_MOBILE_VIEWPORT_WIDTH}<=Ur,_=c(L),`,
  `g=c(N)||p&&${MOBILE_VIEWPORT_WIDTH}<=Ur,_=c(L),`,
  `g=c(N)||p&&${LEGACY_MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||p&&${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||p&&${MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||${LEGACY_MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
  `g=c(N)||${MOBILE_VIEWPORT_IS_NARROW},_=c(L),`,
];
const PATCHED_MOBILE_RIGHT_PANEL_FULL_WIDTH =
  `g=c(N)||p&&${MOBILE_VIEWPORT_IS_NARROW},_=c(L),`;

const LEFT_PANEL_SLOT_AVAILABLE_PATTERNS = [
  "ve=d,",
  `ve=d&&!(p&&${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW}),`,
  `ve=d&&!(p&&${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW}),`,
];
const PATCHED_LEFT_PANEL_SLOT_AVAILABLE =
  `ve=d&&!(${MOBILE_RIGHT_PANEL_OPEN}),`;

const RIGHT_PANEL_WIDTH_SOURCE_PATTERNS = [
  "Ar({isFullWidth:g,mainContentWidth:ie}),",
];
const PATCHED_RIGHT_PANEL_WIDTH_SOURCE =
  "Ar({isFullWidth:g,mainContentWidth:g?V:ie}),";

const FLOATING_LEFT_PANEL_RENDER_PATTERNS = [
  "ve&&!T&&!z&&(0,Q.jsx)(Xr,{",
  "ve&&(!T||window.innerWidth<=Ur)&&!z&&(0,Q.jsx)(Xr,{",
  `ve&&(!T||${LEGACY_MOBILE_VIEWPORT_WIDTH}<=Ur)&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${MOBILE_VIEWPORT_WIDTH}<=Ur)&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${LEGACY_MOBILE_VIEWPORT_IS_NARROW})&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW})&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW})&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${MOBILE_VIEWPORT_IS_NARROW})&&!z&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW})&&!z&&!(p&&${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW})&&(0,Q.jsx)(Xr,{`,
  `ve&&(!T||${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW})&&!z&&!(p&&${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW})&&(0,Q.jsx)(Xr,{`,
];
const PATCHED_FLOATING_LEFT_PANEL_RENDER =
  `ve&&(!T||${MOBILE_VIEWPORT_IS_NARROW})&&!z&&!(${MOBILE_RIGHT_PANEL_OPEN})&&(0,Q.jsx)(Xr,{`;

const FLOATING_LEFT_PANEL_VISIBLE_PATTERNS = [
  "isVisible:D&&!T&&!z,",
  "isVisible:(D||T&&window.innerWidth<=Ur)&&!z,",
  "isVisible:(D&&window.innerWidth>Ur||T&&window.innerWidth<=Ur)&&!z,",
  `isVisible:(D&&${LEGACY_MOBILE_VIEWPORT_WIDTH}>Ur||T&&${LEGACY_MOBILE_VIEWPORT_WIDTH}<=Ur)&&!z,`,
  `isVisible:(D&&${MOBILE_VIEWPORT_WIDTH}>Ur||T&&${MOBILE_VIEWPORT_WIDTH}<=Ur)&&!z,`,
  `isVisible:(D&&!${LEGACY_MOBILE_VIEWPORT_IS_NARROW}||T&&${LEGACY_MOBILE_VIEWPORT_IS_NARROW})&&!z,`,
  `isVisible:(D&&!${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW}||T&&${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW})&&!z,`,
  `isVisible:(D&&!${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW}||T&&${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW})&&!z,`,
];
const PATCHED_FLOATING_LEFT_PANEL_VISIBLE =
  `isVisible:(D&&!${MOBILE_VIEWPORT_IS_NARROW}||T&&${MOBILE_VIEWPORT_IS_NARROW})&&!z,`;

const FLOATING_LEFT_PANEL_TOGGLE_PATTERNS = [
  "onOpenSidebar:()=>{k(i,!0,{animate:!1})}",
  "onOpenSidebar:()=>{k(i,!(T&&window.innerWidth<=Ur),{animate:!1})}",
  `onOpenSidebar:()=>{k(i,!(T&&${LEGACY_MOBILE_VIEWPORT_WIDTH}<=Ur),{animate:!1})}`,
  `onOpenSidebar:()=>{k(i,!(T&&${MOBILE_VIEWPORT_WIDTH}<=Ur),{animate:!1})}`,
  `onOpenSidebar:()=>{k(i,!(T&&${LEGACY_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}`,
  `onOpenSidebar:()=>{k(i,!(T&&${LEGACY_TOUCH_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}`,
  `onOpenSidebar:()=>{k(i,!(T&&${LEGACY_COARSE_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}`,
];
const PATCHED_FLOATING_LEFT_PANEL_TOGGLE =
  `onOpenSidebar:()=>{k(i,!(T&&${MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}`;

const APP_SHELL_LAYOUT_MARKERS = [
  "function Yr({bottomPanelSlot:",
  "app-shell-left-panel",
  "rightPanelAnimatedWidth",
];
const CURRENT_APP_SHELL_LAYOUT_MARKERS = [
  "function HR({bottomPanelSlot:",
  "app-shell-left-panel",
  "rightPanelAnimatedWidth",
  "app-shell-main-content-viewport",
];
const CURRENT_V2_APP_SHELL_LAYOUT_MARKERS = [
  "function jpn({bottomPanelSlot:",
  "app-shell-left-panel",
  "rightPanelAnimatedWidth",
  "app-shell-main-content-viewport",
];
const CURRENT_V3_APP_SHELL_LAYOUT_MARKERS = [
  "function FGe({bottomPanelSlot:",
  "app-shell-left-panel",
  "rightPanelAnimatedWidth",
  "app-shell-main-content-viewport",
];

function replaceOnce(source, patternOrPatterns, replacement, description) {
  if (source.includes(replacement)) {
    return source;
  }

  const patterns = Array.isArray(patternOrPatterns)
    ? patternOrPatterns
    : [patternOrPatterns];
  const matches = patterns
    .map((pattern) => ({ pattern, index: source.indexOf(pattern) }))
    .filter((match) => match.index !== -1);
  if (matches.length === 0) {
    throw new Error(`Unable to patch mobile sidebar ${description}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Expected one mobile sidebar ${description} target, found multiple`,
    );
  }

  const { pattern, index: first } = matches[0];
  const second = source.indexOf(pattern, first + pattern.length);
  if (second !== -1) {
    throw new Error(
      `Expected one mobile sidebar ${description} target, found multiple`,
    );
  }

  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + pattern.length)
  );
}

function pickAppShellCandidate(candidates, assetsDir) {
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const threadAppShellChromeNames = fs
    .readdirSync(assetsDir)
    .filter((name) => /^thread-app-shell-chrome-[\w-]+\.js$/.test(name));

  for (const name of threadAppShellChromeNames) {
    const source = fs.readFileSync(path.join(assetsDir, name), "utf8");
    const match = candidates.find(({ filePath }) =>
      source.includes(`./${path.basename(filePath)}`),
    );
    if (match != null) {
      return match;
    }
  }

  return null;
}

export function patchWebviewMobileSidebarSource(source) {
  if (isCurrentV3WebviewMobileSidebarSource(source)) {
    return patchCurrentV3WebviewMobileSidebarSource(source);
  }
  if (isCurrentV2WebviewMobileSidebarSource(source)) {
    return patchCurrentV2WebviewMobileSidebarSource(source);
  }
  if (isCurrentWebviewMobileSidebarSource(source)) {
    return patchCurrentWebviewMobileSidebarSource(source);
  }

  let patched = source;
  patched = replaceOnce(
    patched,
    DOCKED_LEFT_PANEL_PATTERNS,
    PATCHED_DOCKED_LEFT_PANEL,
    "docked left panel condition",
  );
  patched = replaceOnce(
    patched,
    DOCKED_LEFT_PANEL_RENDER_PATTERNS,
    PATCHED_DOCKED_LEFT_PANEL_RENDER,
    "docked left panel render condition",
  );
  patched = replaceOnce(
    patched,
    MOBILE_RIGHT_PANEL_FULL_WIDTH_PATTERNS,
    PATCHED_MOBILE_RIGHT_PANEL_FULL_WIDTH,
    "mobile right panel full width condition",
  );
  patched = replaceOnce(
    patched,
    LEFT_PANEL_SLOT_AVAILABLE_PATTERNS,
    PATCHED_LEFT_PANEL_SLOT_AVAILABLE,
    "left panel slot availability",
  );
  patched = replaceOnce(
    patched,
    RIGHT_PANEL_WIDTH_SOURCE_PATTERNS,
    PATCHED_RIGHT_PANEL_WIDTH_SOURCE,
    "right panel width source",
  );
  patched = replaceOnce(
    patched,
    FLOATING_LEFT_PANEL_RENDER_PATTERNS,
    PATCHED_FLOATING_LEFT_PANEL_RENDER,
    "floating left panel render condition",
  );
  patched = replaceOnce(
    patched,
    FLOATING_LEFT_PANEL_VISIBLE_PATTERNS,
    PATCHED_FLOATING_LEFT_PANEL_VISIBLE,
    "floating left panel visibility",
  );
  patched = replaceOnce(
    patched,
    FLOATING_LEFT_PANEL_TOGGLE_PATTERNS,
    PATCHED_FLOATING_LEFT_PANEL_TOGGLE,
    "floating left panel toggle action",
  );
  return patched;
}

export function patchWebviewMobileSidebarAssets(assetsDir) {
  const assetNames = fs.readdirSync(assetsDir);
  const appShellNames = assetNames.filter((name) =>
    /^app-shell-[\w-]+\.js$/.test(name),
  );
  const candidateNames = appShellNames.length > 0 ? appShellNames : assetNames;
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => candidateNames.includes(name))
    .filter((name) => name.endsWith(".js"))
    .map((name) => {
      const filePath = path.join(assetsDir, name);
      return { filePath, source: fs.readFileSync(filePath, "utf8") };
    })
    .filter(
      ({ source }) =>
        APP_SHELL_LAYOUT_MARKERS.every((marker) => source.includes(marker)) ||
        CURRENT_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
          source.includes(marker),
        ) ||
        CURRENT_V2_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
          source.includes(marker),
        ) ||
        CURRENT_V3_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
          source.includes(marker),
        ),
    );

  if (candidates.length === 0) {
    return [];
  }

  const selectedCandidate = pickAppShellCandidate(candidates, assetsDir);
  if (selectedCandidate == null) {
    throw new Error("Expected one app shell asset, found multiple");
  }

  const { filePath: assetPath, source } = selectedCandidate;
  const patched = patchWebviewMobileSidebarSource(source);

  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

function patchCurrentWebviewMobileSidebarSource(source) {
  if (!isCurrentWebviewMobileSidebarSource(source)) {
    return source;
  }
  if (
    source.includes(`z=kt(${MOBILE_VIEWPORT_WIDTH}),`) &&
    source.includes(MOBILE_VIEWPORT_HAS_TOUCH)
  ) {
    return source;
  }

  let patched = source;
  patched = replaceCurrentOnce(
    patched,
    "z=kt(window.innerWidth),",
    `z=kt(${MOBILE_VIEWPORT_WIDTH}),`,
    "current shell width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "j=p&&E,",
    `j=p&&E&&!${CURRENT_MOBILE_VIEWPORT_IS_NARROW},`,
    "current docked left panel condition",
  );
  patched = replaceCurrentOnce(
    patched,
    "wR({isFullWidth:y,mainContentWidth:ie})",
    `wR({isFullWidth:y||${CURRENT_MOBILE_RIGHT_PANEL_OPEN},mainContentWidth:y||${CURRENT_MOBILE_RIGHT_PANEL_OPEN}?z:ie})`,
    "current right panel width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "let t=e<=tz,n=e<=nz",
    `let t=e<=tz||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440,n=e<=nz||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440`,
    "current resize narrow thresholds",
  );
  patched = replaceCurrentOnce(
    patched,
    "className:k(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,y?`w-0 flex-none overflow-hidden`:`flex-1`)",
    `className:k(\`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col\`,(y||${CURRENT_MOBILE_RIGHT_PANEL_OPEN})?\`w-0 flex-none overflow-hidden\`:\`flex-1\`)`,
    "current main content full-width class",
  );
  patched = replaceCurrentOnce(
    patched,
    "ve&&!E&&!l&&!L&&(0,QR.jsx)(UR,{floatingLeftPanelWidth:I,isApplicationMenuBarEnabled:C,isVisible:O&&!E&&!L,leftPanelWidth:F,leftPanel:f,shouldUseReducedMotion:D,onOpenSidebar:()=>{fm(i,!0,{animate:!1})}})",
    `ve&&(!E||${CURRENT_MOBILE_VIEWPORT_IS_NARROW})&&!l&&!L&&!(${CURRENT_MOBILE_RIGHT_PANEL_OPEN})&&(0,QR.jsx)(UR,{floatingLeftPanelWidth:I,isApplicationMenuBarEnabled:C,isVisible:(O&&!${CURRENT_MOBILE_VIEWPORT_IS_NARROW}||E&&${CURRENT_MOBILE_VIEWPORT_IS_NARROW})&&!L,leftPanelWidth:F,leftPanel:f,shouldUseReducedMotion:D,onOpenSidebar:()=>{fm(i,!(E&&${CURRENT_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}})`,
    "current floating left panel condition",
  );
  return patched;
}

function isCurrentWebviewMobileSidebarSource(source) {
  return CURRENT_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
    source.includes(marker),
  );
}

function patchCurrentV3WebviewMobileSidebarSource(source) {
  if (!isCurrentV3WebviewMobileSidebarSource(source)) {
    return source;
  }
  if (
    source.includes(`L=sp(${MOBILE_VIEWPORT_WIDTH}),`) &&
    source.includes(
      `SGe({isFullWidth:v||${CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN}`,
    )
  ) {
    return source;
  }

  let patched = source;
  patched = replaceCurrentOnce(
    patched,
    "L=sp(window.innerWidth),",
    `L=sp(${MOBILE_VIEWPORT_WIDTH}),`,
    "current v3 shell width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "k=p&&T,A=O&&C&&!v,",
    `k=p&&T&&!${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW},A=O&&C&&!v,`,
    "current v3 docked left panel condition",
  );
  patched = replaceCurrentOnce(
    patched,
    "SGe({isFullWidth:v,mainContentWidth:J})",
    `SGe({isFullWidth:v||${CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN},mainContentWidth:v||${CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN}?L:J})`,
    "current v3 right panel width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "let t=e<=UGe,n=e<=WGe",
    `let t=e<=UGe||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440,n=e<=WGe||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440`,
    "current v3 resize narrow thresholds",
  );
  patched = replaceCurrentOnce(
    patched,
    "className:$(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,v?`w-0 flex-none overflow-hidden`:`flex-1`)",
    `className:$(\`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col\`,(v||${CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN})?\`w-0 flex-none overflow-hidden\`:\`flex-1\`)`,
    "current v3 main content full-width class",
  );
  patched = replaceCurrentOnce(
    patched,
    "ue&&!T&&!l&&!F&&(0,UF.jsx)(IGe,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:D&&!T&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{IS(i,!0,{animate:!1})}})",
    `ue&&(!T||${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW})&&!l&&!F&&!(${CURRENT_V3_MOBILE_RIGHT_PANEL_OPEN})&&(0,UF.jsx)(IGe,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:(D&&!${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW}||T&&${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW})&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{IS(i,!(T&&${CURRENT_V3_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}})`,
    "current v3 floating left panel condition",
  );
  return patched;
}

function isCurrentV3WebviewMobileSidebarSource(source) {
  return CURRENT_V3_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
    source.includes(marker),
  );
}

function patchCurrentV2WebviewMobileSidebarSource(source) {
  if (!isCurrentV2WebviewMobileSidebarSource(source)) {
    return source;
  }
  if (
    source.includes(`L=rg(${MOBILE_VIEWPORT_WIDTH}),`) &&
    source.includes(
      `gpn({isFullWidth:v||${CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN}`,
    )
  ) {
    return source;
  }

  let patched = source;
  patched = replaceCurrentOnce(
    patched,
    "L=rg(window.innerWidth),",
    `L=rg(${MOBILE_VIEWPORT_WIDTH}),`,
    "current v2 shell width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "k=p&&T,A=O&&C&&!v,",
    `k=p&&T&&!${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW},A=O&&C&&!v,`,
    "current v2 docked left panel condition",
  );
  patched = replaceCurrentOnce(
    patched,
    "gpn({isFullWidth:v,mainContentWidth:te})",
    `gpn({isFullWidth:v||${CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN},mainContentWidth:v||${CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN}?L:te})`,
    "current v2 right panel width source",
  );
  patched = replaceCurrentOnce(
    patched,
    "let t=e<=Vpn,n=e<=Hpn",
    `let t=e<=Vpn||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440,n=e<=Hpn||${MOBILE_VIEWPORT_HAS_TOUCH}&&${MOBILE_VIEWPORT_WIDTH}<=1440`,
    "current v2 resize narrow thresholds",
  );
  patched = replaceCurrentOnce(
    patched,
    "className:Y(`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col`,v?`w-0 flex-none overflow-hidden`:`flex-1`)",
    `className:Y(\`app-shell-main-content-viewport relative flex min-h-0 min-w-0 flex-col\`,(v||${CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN})?\`w-0 flex-none overflow-hidden\`:\`flex-1\`)`,
    "current v2 main content full-width class",
  );
  patched = replaceCurrentOnce(
    patched,
    "fe&&!T&&!l&&!F&&(0,fq.jsx)(Mpn,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:D&&!T&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{ZC(i,!0,{animate:!1})}})",
    `fe&&(!T||${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW})&&!l&&!F&&!(${CURRENT_V2_MOBILE_RIGHT_PANEL_OPEN})&&(0,fq.jsx)(Mpn,{floatingLeftPanelWidth:P,isApplicationMenuBarEnabled:S,isVisible:(D&&!${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW}||T&&${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW})&&!F,leftPanelWidth:N,leftPanel:f,shouldUseReducedMotion:E,onOpenSidebar:()=>{ZC(i,!(T&&${CURRENT_V2_MOBILE_VIEWPORT_IS_NARROW}),{animate:!1})}})`,
    "current v2 floating left panel condition",
  );
  return patched;
}

function isCurrentV2WebviewMobileSidebarSource(source) {
  return CURRENT_V2_APP_SHELL_LAYOUT_MARKERS.every((marker) =>
    source.includes(marker),
  );
}

function replaceCurrentOnce(source, pattern, replacement, description) {
  if (source.includes(replacement)) {
    return source;
  }
  const first = source.indexOf(pattern);
  if (first === -1) {
    throw new Error(`Unable to patch mobile sidebar ${description}`);
  }
  const second = source.indexOf(pattern, first + pattern.length);
  if (second !== -1) {
    throw new Error(
      `Expected one mobile sidebar ${description} target, found multiple`,
    );
  }
  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + pattern.length)
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewMobileSidebarAssets(assetsDir);
  console.log(
    `Patched webview mobile sidebar in ${patchedFiles.length} asset(s)`,
  );
}
