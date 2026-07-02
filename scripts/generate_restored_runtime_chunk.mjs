#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { deriveRuntimeChunk } from "./derive_restored_runtime_chunk.mjs";

const [, , restoredRoot, asarRoot, restoredFile] = process.argv;

if (!restoredRoot || !asarRoot || !restoredFile) {
  console.error(
    "usage: generate_restored_runtime_chunk.mjs <restored-root> <asar-root> <restored-file>",
  );
  process.exit(2);
}

function hasIdentifier(node, name) {
  if (ts.isIdentifier(node) && node.text === name) return true;
  return node.getChildren().some((child) => hasIdentifier(child, name));
}

function findFunction(sourceFile, name) {
  let found;
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name != null &&
      node.name.text === name
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function returnsNavigationButtons(source) {
  const sourceFile = ts.createSourceFile(
    restoredFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const component = findFunction(sourceFile, "SidebarNavigationControls");
  if (component == null) {
    throw new Error(`${restoredFile}: missing SidebarNavigationControls`);
  }

  let returnsNavigation = false;
  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression != null) {
      returnsNavigation ||= hasIdentifier(node.expression, "navigationButtons");
    }
    ts.forEachChild(node, visit);
  }
  visit(component);
  return returnsNavigation;
}

function findSidebarChildrenArray(source, runtimeChunk) {
  const sourceFile = ts.createSourceFile(
    runtimeChunk,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  const matches = [];
  let childrenArray;
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "children" &&
      ts.isArrayLiteralExpression(node.initializer) &&
      node.initializer.elements.length === 2 &&
      node.initializer.elements.every(ts.isIdentifier) &&
      node.initializer.elements[0].text === "j" &&
      node.initializer.elements[1].text === "V"
    ) {
      matches.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (matches.length !== 1) {
    throw new Error(`${runtimeChunk}: missing sidebar navigation children array`);
  }
  childrenArray = matches[0];
  return childrenArray;
}

function listJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function findSettingsSectionsRuntimeChunk(asarRoot) {
  const marker =
    "general-settings.import.profile.keyboard-shortcuts.codex-micro.appshots.appearance.pets.agent.git-settings";
  const matches = listJsFiles(path.join(asarRoot, "webview/assets")).filter(
    (filePath) => readFileSync(filePath, "utf8").includes(marker),
  );
  if (matches.length !== 1) {
    throw new Error(`settings sections runtime chunk match count: ${matches.length}`);
  }
  return path.relative(asarRoot, matches[0]).split(path.sep).join("/");
}

function findStatsigSharedRuntimeChunk(asarRoot) {
  const marker = "Attempting to retrieve a StatsigClient but none was set.";
  const matches = listJsFiles(path.join(asarRoot, "webview/assets")).filter(
    (filePath) => readFileSync(filePath, "utf8").includes(marker),
  );
  if (matches.length !== 1) {
    throw new Error(`Statsig shared runtime chunk match count: ${matches.length}`);
  }
  return path.relative(asarRoot, matches[0]).split(path.sep).join("/");
}


function generatedSettingsSectionsSource(restoredSource, runtimeSource, runtimeChunk) {
  if (restoredSource.includes('"pets"')) {
    return runtimeSource;
  }
  let generatedSource = runtimeSource.replace(".appearance.pets.agent.", ".appearance.agent.");
  generatedSource = generatedSource.replace(/\s*\{\s*slug:\s*`pets`\s*\},/, "");
  if (generatedSource === runtimeSource || generatedSource.includes("{ slug: `pets` }")) {
    throw new Error(`${runtimeChunk}: failed to remove pets settings entry`);
  }
  return generatedSource;
}

function generatedStatsigSharedSource(restoredSource, runtimeSource, runtimeChunk) {
  if (restoredSource.includes("Attempting to retrieve a StatsigClient")) {
    return runtimeSource;
  }
  let generatedSource = runtimeSource;
  if (!generatedSource.includes("function codexWebStatsigNoopClient(e)")) {
    generatedSource = generatedSource.replace(
      /function sn\(e, t\) \{[\s\S]*?return n;\n\}/,
      (match) => `${match}\nfunction codexWebStatsigNoopClient(e) {
  return new Proxy(e, {
    get(t, n, r) {
      if (n === \`getDynamicConfig\`)
        return (n, r) => {
          let i = t.getDynamicConfig(n, r);
          return (
            window.__ELECTRON_SHIM__?.overrideAdapter?.getDynamicConfigOverride?.(
              i,
            ) ?? i
          );
        };
      if (n === \`getLayer\`)
        return (n, r) => {
          let i = t.getLayer(n, r);
          return (
            window.__ELECTRON_SHIM__?.overrideAdapter?.getLayerOverride?.(i) ??
            i
          );
        };
      if (n === \`getFeatureGate\`)
        return (n, r) => {
          let i = t.getFeatureGate(n, r);
          return (
            window.__ELECTRON_SHIM__?.overrideAdapter?.getGateOverride?.(i) ?? i
          );
        };
      if (n === \`checkGate\`)
        return (n, r) => {
          let i = t.checkGate(n, r);
          return (
            window.__ELECTRON_SHIM__?.overrideAdapter?.getGateOverride?.({
              name: n,
              value: i,
            })?.value ?? i
          );
        };
      return Reflect.get(t, n, r);
    },
  });
}`,
    );
  }
  generatedSource = generatedSource.replace(
    /if \(this\._loggingEnabled === `disabled`\) \{\n\s*this\._storeEventToStorage\(n\);\n\s*return;\n\s*\}/,
    "if (this._loggingEnabled === `disabled`) return",
  );
  generatedSource = generatedSource.replace(
    "start() {\n        let t = (0, u._isServerEnv)();",
    "start() {\n        let t = (0, u._isServerEnv)();\n        if (this._loggingEnabled === `disabled`) return;",
  );
  generatedSource = generatedSource.replace(
    /\(n\.Log\.warn\(\n\s*`Attempting to retrieve a StatsigClient but none was set\.`,\n\s*\),\n\s*r\.NoopEvaluationsClient\)/,
    "codexWebStatsigNoopClient(r.NoopEvaluationsClient)",
  );
  if (
    generatedSource === runtimeSource ||
    generatedSource.includes("Attempting to retrieve a StatsigClient")
  ) {
    throw new Error(`${runtimeChunk}: failed to disable Statsig noop warning`);
  }
  return generatedSource;
}

function generatedOpenPrimaryTargetSource(restoredSource, runtimeSource, runtimeChunk) {
  if (!restoredSource.includes("return null;")) {
    return runtimeSource;
  }
  const generatedSource = runtimeSource.replace(
    /function qn\(e\) \{[\s\S]*?\nfunction ir\(e\) \{/,
    "function qn(e) {\n  return null;\n}\nfunction ir(e) {",
  ).replace("De(), rr(), fe()", "De(), fe()");
  if (
    generatedSource === runtimeSource ||
    !generatedSource.includes("function qn(e) {\n  return null;\n}") ||
    generatedSource.includes("localConversationPage.openPrimaryTarget") ||
    generatedSource.includes("De(), rr(), fe()")
  ) {
    throw new Error(`${runtimeChunk}: failed to hide open primary target`);
  }
  return generatedSource;
}

function generatedLocalRemoteDropdownSource(restoredSource, runtimeSource, runtimeChunk) {
  if (!restoredSource.includes("return null;")) {
    return runtimeSource;
  }
  const generatedSource = runtimeSource.replace(
    "(va = (0, ga.memo)(function (e) {",
    "(va = (0, ga.memo)(function (e) {\n        return null;",
  );
  if (
    generatedSource === runtimeSource ||
    !generatedSource.includes("(va = (0, ga.memo)(function (e) {\n        return null;")
  ) {
    throw new Error(`${runtimeChunk}: failed to hide local/remote dropdown`);
  }
  return generatedSource;
}

function generatedTerminalPanelSource(restoredSource, runtimeSource, runtimeChunk) {
  if (!restoredSource.includes("__CODEX_WEB_TERMINAL_FONT__")) {
    return runtimeSource;
  }
  const generatedSource = runtimeSource.replace(
    /let e = ([A-Za-z_$][\w$]*\.fonts\.code\?\.trim\(\) \?\? ``),\n\s+([A-Za-z_$][\w$]*) = e\.length > 0 \? e : ([A-Za-z_$][\w$]*);/,
    `let e = $1,
      $2 =
        typeof window < \`u\` &&
        typeof window.__CODEX_WEB_TERMINAL_FONT__ == \`string\`
          ? window.__CODEX_WEB_TERMINAL_FONT__.trim()
          : \`\`;
    $2 = $2.length > 0 ? $2 : e.length > 0 ? e : $3;`,
  );
  if (
    generatedSource === runtimeSource ||
    !generatedSource.includes("__CODEX_WEB_TERMINAL_FONT__")
  ) {
    throw new Error(`${runtimeChunk}: failed to apply browser terminal font`);
  }
  return generatedSource;
}

function findMainRuntimeChunk(asarRoot) {
  const matches = listJsFiles(path.join(asarRoot, ".vite/build")).filter(
    (filePath) => {
      const source = readFileSync(filePath, "utf8");
      return (
        source.includes("open-in-new-window") &&
        source.includes("open-current-main-window") &&
        source.includes("show-settings")
      );
    },
  );
  if (matches.length !== 1) {
    throw new Error(`main runtime chunk match count: ${matches.length}`);
  }
  return matches[0];
}

function materializeViewMessageHandlerMainRuntime(restoredSource, asarRoot) {
  const runtimePath = findMainRuntimeChunk(asarRoot);
  let runtimeSource = readFileSync(runtimePath, "utf8");
  let generatedSource = runtimeSource;

  if (
    restoredSource.includes(`if (message.type === "open-in-new-window") {
        if (!isValidAppRoute(message.path)) return;
        hotkeyWindowLifecycleManager.hide();
        const targetWindow = await ensureWindow();
        if (targetWindow != null) {
          showAndFocusWindow(targetWindow);
          navigateToRoute(targetWindow, message.path);
        }
        return;
      }`)
  ) {
    generatedSource = generatedSource.replace(
      `if (n.type === \`open-in-new-window\`) {
      if (!t.ma(n.path)) return;
      i.hide();
      let e = await h(n.path);
      e && (e.isMinimized() && e.restore(), e.show(), e.focus());
      return;
    }`,
      `if (n.type === \`open-in-new-window\`) {
      if (!t.ma(n.path)) return;
      i.hide();
      let e = await m();
      e &&
        (e.isMinimized() && e.restore(),
        e.show(),
        e.focus(),
        C(e, n.path));
      return;
    }`,
    );
    if (
      generatedSource === runtimeSource ||
      generatedSource.includes("let e = await h(n.path);")
    ) {
      throw new Error(
        `${path.relative(asarRoot, runtimePath)}: failed to reuse main window for open-in-new-window`,
      );
    }
    runtimeSource = generatedSource;
  }

  if (
    restoredSource.includes("avatarOverlayNativeStack: false") &&
    restoredSource.includes("void event.sender") &&
    restoredSource.includes("void message.enabled")
  ) {
    generatedSource = generatedSource
      .replace(
        "avatarOverlayNativeStack: n.avatarOverlayNativeStack,",
        "avatarOverlayNativeStack: !1,",
      )
      .replace(
        "A || ((A = !0), await y(e.sender));",
        "A = !0;",
      )
      .replace(
        `if (n.type === \`electron-avatar-overlay-feedback-diagnostics-changed\`) {
      _(n.enabled);
      return;
    }`,
        `if (n.type === \`electron-avatar-overlay-feedback-diagnostics-changed\`) {
      return;
    }`,
      );
    if (
      generatedSource === runtimeSource ||
      generatedSource.includes("await y(e.sender)") ||
      generatedSource.includes("_(n.enabled)") ||
      generatedSource.includes("avatarOverlayNativeStack: n.avatarOverlayNativeStack")
    ) {
      throw new Error(
        `${path.relative(asarRoot, runtimePath)}: failed to disable avatar overlay runtime`,
      );
    }
    runtimeSource = generatedSource;
  }

  if (generatedSource === readFileSync(runtimePath, "utf8")) {
    throw new Error(
      `${path.relative(asarRoot, runtimePath)}: no view-message-handler runtime changes generated`,
    );
  }
  writeFileSync(runtimePath, generatedSource);
}

const restoredSource = readFileSync(path.join(restoredRoot, restoredFile), "utf8");
if (restoredFile === "main/ipc/view-message-ipc/view-message-handler.ts") {
  materializeViewMessageHandlerMainRuntime(restoredSource, asarRoot);
  process.exit(0);
}
const runtimeChunk =
  restoredFile === "settings/settings-sections.ts"
    ? findSettingsSectionsRuntimeChunk(asarRoot)
    : restoredFile === "vendor/remote-projects-app-shared-current-bundle.ts"
      ? findStatsigSharedRuntimeChunk(asarRoot)
    : restoredFile === "app-shell/thread-app-shell-chrome/open-primary-target.tsx"
      ? "webview/assets/thread-app-shell-chrome-CEI45G4c.js"
    : restoredFile ===
        "thread-summary/local-remote-dropdown-parts/local-remote-dropdown.tsx"
      ? "webview/assets/local-remote-dropdown-BT-TSjGN.js"
    : deriveRuntimeChunk(restoredRoot, asarRoot, restoredFile);
const runtimePath = path.join(asarRoot, runtimeChunk);
const runtimeSource = readFileSync(runtimePath, "utf8");

let generatedSource = runtimeSource;
if (restoredFile === "settings/settings-sections.ts") {
  generatedSource = generatedSettingsSectionsSource(
    restoredSource,
    runtimeSource,
    runtimeChunk,
  );
} else if (restoredFile === "vendor/remote-projects-app-shared-current-bundle.ts") {
  generatedSource = generatedStatsigSharedSource(
    restoredSource,
    runtimeSource,
    runtimeChunk,
  );
} else if (
  restoredFile ===
  "app-shell/thread-app-shell-chrome/open-primary-target.tsx"
) {
  generatedSource = generatedOpenPrimaryTargetSource(
    restoredSource,
    runtimeSource,
    runtimeChunk,
  );
} else if (
  restoredFile ===
  "thread-summary/local-remote-dropdown-parts/local-remote-dropdown.tsx"
) {
  generatedSource = generatedLocalRemoteDropdownSource(
    restoredSource,
    runtimeSource,
    runtimeChunk,
  );
} else if (restoredFile === "terminal/terminal-panel.tsx") {
  generatedSource = generatedTerminalPanelSource(
    restoredSource,
    runtimeSource,
    runtimeChunk,
  );
} else if (!returnsNavigationButtons(restoredSource)) {
  const childrenArray = findSidebarChildrenArray(runtimeSource, runtimeChunk);
  generatedSource =
    runtimeSource.slice(0, childrenArray.getStart()) +
    "[j]" +
    runtimeSource.slice(childrenArray.getEnd());
}

writeFileSync(runtimePath, generatedSource);
