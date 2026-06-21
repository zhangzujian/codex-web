#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchBrowserPanelIframeAsset } from "./patch_browser_panel_iframe.mjs";
import { patchTerminalSidePanelSupport } from "./patch_terminal_side_panel.mjs";
import { patchWebviewAutomationsNavAssets } from "./patch_webview_automations_nav.mjs";
import { patchUserMessageClipboardAssets } from "./patch_webview_clipboard.mjs";
import { patchWebviewConsoleNoiseAssets } from "./patch_webview_console_noise.mjs";
import { patchWebviewI18nAssets } from "./patch_webview_i18n.mjs";
import { patchWebviewOpenTargetLabelsAssets } from "./patch_webview_open_target_labels.mjs";

export function patchWebviewAssets(assetsDir) {
  const patchedFiles = [
    ...patchWebviewOpenTargetLabelsAssets(assetsDir),
    ...patchWebviewI18nAssets(assetsDir),
    ...patchWebviewConsoleNoiseAssets(assetsDir),
    ...patchTerminalSidePanelSupport(assetsDir),
    ...patchWebviewAutomationsNavAssets(assetsDir),
    ...patchUserMessageClipboardAssets(assetsDir),
    patchBrowserPanelIframeAsset(assetsDir),
  ];

  return [...new Set(patchedFiles)];
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewAssets(assetsDir);
  console.log(`Patched webview assets in ${patchedFiles.length} file(s)`);
}
