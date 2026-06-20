import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewAutomationsNavAssets,
  patchWebviewAutomationsNavSource,
} from "../scripts/patch_webview_automations_nav.mjs";

const appMainSource =
  "e && !l && _\n              ? (0, Z.jsx)(Ca, {items:[{id:`mark-all-read`}],children:(0,Z.jsx)(a_,{label:(0,Z.jsx)(X,{id:`sidebarElectron.inboxRouteNavLink`,defaultMessage:`Automations`})})})\n              : null";

test("Automations nav patch keeps the nav visible for remote host contexts", () => {
  const patched = patchWebviewAutomationsNavSource(appMainSource);

  assert.doesNotMatch(patched, /e && !l && _/);
  assert.doesNotMatch(patched, /e && _/);
  assert.match(patched, /e\n\s+\? \(0, Z\.jsx\)\(Ca,/);
  assert.match(patched, /sidebarElectron\.inboxRouteNavLink/);
});

test("Automations nav patch upgrades gate-only intermediate patches", () => {
  const patched = patchWebviewAutomationsNavSource(
    appMainSource.replace("e && !l && _", "e && _"),
  );

  assert.doesNotMatch(patched, /e && _/);
  assert.match(patched, /e\n\s+\? \(0, Z\.jsx\)\(Ca,/);
});

test("Automations nav asset patch updates the bundled app main chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-automations-nav-"),
  );

  try {
    fs.writeFileSync(path.join(assetsDir, "app-main-test.js"), appMainSource);

    const patchedFiles = patchWebviewAutomationsNavAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["app-main-test.js"],
    );
    assert.match(
      fs.readFileSync(path.join(assetsDir, "app-main-test.js"), "utf8"),
      /e\n\s+\? \(0, Z\.jsx\)\(Ca,/,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
