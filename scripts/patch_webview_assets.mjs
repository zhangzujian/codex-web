#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchBrowserPanelIframeAsset } from "./patch_browser_panel_iframe.mjs";
import { patchTerminalSidePanelSupport } from "./patch_terminal_side_panel.mjs";
import { patchWebviewAutomationsEmptyStateIconAssets } from "./patch_webview_automations_empty_state_icon.mjs";
import { patchWebviewAutomationsNavAssets } from "./patch_webview_automations_nav.mjs";
import { patchWebviewClipboardAssets } from "./patch_webview_clipboard.mjs";
import { patchWebviewConsoleNoiseAssets } from "./patch_webview_console_noise.mjs";
import { patchWebviewI18nAssets } from "./patch_webview_i18n.mjs";
import { patchWebviewMarkdownRetryAssets } from "./patch_webview_markdown_retry.mjs";
import { patchWebviewMobileSidebarAssets } from "./patch_webview_mobile_sidebar.mjs";
import { patchWebviewMobileTabLayoutAssets } from "./patch_webview_mobile_tab_layout.mjs";
import { patchWebviewOpenTargetLabelsAssets } from "./patch_webview_open_target_labels.mjs";
import { patchWebviewThreadDeleteAssets } from "./patch_webview_thread_delete.mjs";
import { patchWebviewTurnStreamingAssets } from "./patch_webview_turn_streaming.mjs";

export function patchWebviewAssets(assetsDir) {
  const patchedFiles = [
    ...patchWebviewOpenTargetLabelsAssets(assetsDir),
    ...patchWebviewThreadDeleteAssets(assetsDir),
    ...patchWebviewI18nAssets(assetsDir),
    ...patchWebviewConsoleNoiseAssets(assetsDir),
    ...patchWebviewMarkdownRetryAssets(assetsDir),
    ...patchWebviewTurnStreamingAssets(assetsDir),
    ...patchTerminalSidePanelSupport(assetsDir),
    ...patchWebviewAutomationsNavAssets(assetsDir),
    ...patchWebviewAutomationsEmptyStateIconAssets(assetsDir),
    ...patchWebviewClipboardAssets(assetsDir),
    ...patchWebviewMobileSidebarAssets(assetsDir),
    ...patchWebviewMobileTabLayoutAssets(assetsDir),
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
