#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TAB_STRIP_STYLE_PATTERN = "k={scrollPaddingInlineEnd:_}";
const PATCHED_TAB_STRIP_STYLE = "k={scrollPaddingInlineEnd:_,paddingInlineEnd:_}";
const RIGHT_PANEL_HEADER_SPACER_DECLARATION =
  "l=$t`max(0px, calc(${s}px)`;return";
const PATCHED_RIGHT_PANEL_HEADER_SPACER_DECLARATION =
  "l=$t`max(0px, calc(${s}px)`,u=$t`max(${o}px, 142px)`;return";
const MOBILE_VIEWPORT_WIDTH =
  "Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)";
const RIGHT_PANEL_HEADER_SPACER_CONDITION = "children:[i&&!a&&";
const PATCHED_RIGHT_PANEL_HEADER_SPACER_CONDITION =
  `children:[!a&&(i||${MOBILE_VIEWPORT_WIDTH}<=Ur)&&`;
const RIGHT_PANEL_HEADER_SPACER_STYLE = "style:{width:o}}),n]})";
const PATCHED_RIGHT_PANEL_HEADER_SPACER_STYLE = "style:{width:u}}),n]})";

const APP_SHELL_TAB_STRIP_MARKERS = [
  "data-app-shell-tab-strip-controller",
  "sticky right-0 shrink-0 bg-token-main-surface-primary",
  "scrollPaddingInlineEnd",
];

function pickAppShellTabStripCandidate(candidates, assetsDir) {
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

export function patchWebviewMobileTabLayoutSource(source) {
  let patched = source;

  if (!patched.includes(PATCHED_TAB_STRIP_STYLE)) {
    const first = patched.indexOf(TAB_STRIP_STYLE_PATTERN);
    if (first === -1) {
      throw new Error(
        "Unable to patch app shell tab strip sticky action spacing",
      );
    }

    const second = patched.indexOf(
      TAB_STRIP_STYLE_PATTERN,
      first + TAB_STRIP_STYLE_PATTERN.length,
    );
    if (second !== -1) {
      throw new Error(
        "Expected one app shell tab strip sticky action spacing target, found multiple",
      );
    }

    patched =
      patched.slice(0, first) +
      PATCHED_TAB_STRIP_STYLE +
      patched.slice(first + TAB_STRIP_STYLE_PATTERN.length);
  }

  if (!patched.includes(PATCHED_RIGHT_PANEL_HEADER_SPACER_DECLARATION)) {
    const first = patched.indexOf(RIGHT_PANEL_HEADER_SPACER_DECLARATION);
    if (first === -1) {
      throw new Error("Unable to patch app shell tab strip header start spacer");
    }

    const second = patched.indexOf(
      RIGHT_PANEL_HEADER_SPACER_DECLARATION,
      first + RIGHT_PANEL_HEADER_SPACER_DECLARATION.length,
    );
    if (second !== -1) {
      throw new Error(
        "Expected one app shell tab strip header start spacer declaration target, found multiple",
      );
    }

    patched =
      patched.slice(0, first) +
      PATCHED_RIGHT_PANEL_HEADER_SPACER_DECLARATION +
      patched.slice(first + RIGHT_PANEL_HEADER_SPACER_DECLARATION.length);
  }

  if (!patched.includes(PATCHED_RIGHT_PANEL_HEADER_SPACER_STYLE)) {
    const first = patched.indexOf(RIGHT_PANEL_HEADER_SPACER_STYLE);
    if (first === -1) {
      throw new Error("Unable to patch app shell tab strip header start style");
    }

    const second = patched.indexOf(
      RIGHT_PANEL_HEADER_SPACER_STYLE,
      first + RIGHT_PANEL_HEADER_SPACER_STYLE.length,
    );
    if (second !== -1) {
      throw new Error(
        "Expected one app shell tab strip header start style target, found multiple",
      );
    }

    patched =
      patched.slice(0, first) +
      PATCHED_RIGHT_PANEL_HEADER_SPACER_STYLE +
      patched.slice(first + RIGHT_PANEL_HEADER_SPACER_STYLE.length);
  }

  if (!patched.includes(PATCHED_RIGHT_PANEL_HEADER_SPACER_CONDITION)) {
    const first = patched.indexOf(RIGHT_PANEL_HEADER_SPACER_CONDITION);
    if (first === -1) {
      throw new Error(
        "Unable to patch app shell tab strip header start condition",
      );
    }

    const second = patched.indexOf(
      RIGHT_PANEL_HEADER_SPACER_CONDITION,
      first + RIGHT_PANEL_HEADER_SPACER_CONDITION.length,
    );
    if (second !== -1) {
      throw new Error(
        "Expected one app shell tab strip header start condition target, found multiple",
      );
    }

    patched =
      patched.slice(0, first) +
      PATCHED_RIGHT_PANEL_HEADER_SPACER_CONDITION +
      patched.slice(first + RIGHT_PANEL_HEADER_SPACER_CONDITION.length);
  }

  return patched;
}

export function patchWebviewMobileTabLayoutAssets(assetsDir) {
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => /^app-shell-[\w-]+\.js$/.test(name))
    .map((name) => {
      const filePath = path.join(assetsDir, name);
      return { filePath, source: fs.readFileSync(filePath, "utf8") };
    })
    .filter(({ source }) =>
      APP_SHELL_TAB_STRIP_MARKERS.every((marker) => source.includes(marker)),
    );

  if (candidates.length === 0) {
    throw new Error("Unable to find app shell tab strip asset");
  }

  const selectedCandidate = pickAppShellTabStripCandidate(candidates, assetsDir);
  if (selectedCandidate == null) {
    throw new Error("Expected one app shell tab strip asset, found multiple");
  }

  const { filePath: assetPath, source } = selectedCandidate;
  const patched = patchWebviewMobileTabLayoutSource(source);

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
  const patchedFiles = patchWebviewMobileTabLayoutAssets(assetsDir);
  console.log(`Patched mobile tab layout in ${patchedFiles.length} file(s)`);
}
