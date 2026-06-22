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

export function patchWebviewMobileSidebarSource(source) {
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
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => /^app-shell-[\w-]+\.js$/.test(name))
    .map((name) => {
      const filePath = path.join(assetsDir, name);
      return { filePath, source: fs.readFileSync(filePath, "utf8") };
    })
    .filter(({ source }) =>
      APP_SHELL_LAYOUT_MARKERS.every((marker) => source.includes(marker)),
    );

  if (candidates.length === 0) {
    throw new Error("Unable to find app shell asset");
  }
  if (candidates.length > 1) {
    throw new Error("Expected one app shell asset, found multiple");
  }

  const [{ filePath: assetPath, source }] = candidates;
  const patched = patchWebviewMobileSidebarSource(source);

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
  const patchedFiles = patchWebviewMobileSidebarAssets(assetsDir);
  console.log(
    `Patched webview mobile sidebar in ${patchedFiles.length} asset(s)`,
  );
}
