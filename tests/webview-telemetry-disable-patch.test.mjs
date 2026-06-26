import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  patchWebviewTelemetryDisableAssets,
  patchWebviewTelemetryDisableSource,
} from "../scripts/patch_webview_telemetry_disable.mjs";

const appMainAssetName = "app-main-C-_HjS2P.js";
const composerAssetName = "composer-CCuv6v-2.js";

const appMainFixture = `function dP({ appVersion: e, client: t, deviceId: n, enabled: r }) {
  let { data: i, status: a } = Oc(),
    o = r && a === \`success\` && i === !0,
    s = (0, $.useMemo)(() => fP(t), [t]),
    c = (0, $.useRef)(o),
    l = (0, $.useRef)(null),
    u = l.current;
}
async function hP(e) {
  try {
    switch (e.eventKind) {
      case \`turn_rating\`:
        return;
    }
  } catch {}
}
const KP = \`/v1\`,
  tP = \`/log_event\`,
  qP = \`/sdk_exception\`,
  XP = 500,
  ZP = \`1569253508\`,
  QP = {
    networkConfig: {
      api: KP,
      logEventUrl: tP,
      sdkExceptionUrl: qP,
      networkOverrideFunc: UP,
    },
  };
function eF(e) {
  let t = (0, Q.c)(27),
    {
      auth: n,
    } = e;
}`;

const composerFixture = `var sf = \`/wham/analytics-events/events\`;
async function ff({
  eventType: e,
  context: t,
  ctaAction: n,
  isReferralCta: r,
  referralCtaText: i,
}) {
  let a = { ...t },
    o = {
      eventType: e,
      bannerType: t.banner_type,
      limitReason: t.limit_reason,
    };
  return at.getInstance().post(sf, JSON.stringify({ events: [] }), Nn());
}`;

test("webview telemetry patch disables analytics and network telemetry", () => {
  const patched = patchWebviewTelemetryDisableSource(
    appMainFixture,
    appMainAssetName,
  );

  assert.match(patched, /o=false,/);
  assert.match(patched, /async function hP\(e\) \{\s*return;/);
  assert.match(
    patched,
    /overrideAdapter:window\.__ELECTRON_SHIM__\.overrideAdapter/,
  );
  assert.match(patched, /disableLogging:!0/);
  assert.match(patched, /preventAllNetworkTraffic:!0/);
  assert.match(patched, /function eF\(e\) \{\s*return e\.children;/);
  assert.equal(
    patchWebviewTelemetryDisableSource(patched, appMainAssetName),
    patched,
  );
});

test("webview telemetry patch disables direct usage limit analytics", () => {
  const patched = patchWebviewTelemetryDisableSource(
    composerFixture,
    composerAssetName,
  );

  assert.match(patched, /async function ff\(\{[\s\S]*?\}\) \{\s*return false;/);
  assert.equal(
    patchWebviewTelemetryDisableSource(patched, composerAssetName),
    patched,
  );
});

test("webview telemetry asset patch updates app main and composer chunks", () => {
  const assetsDir = fs.mkdtempSync(join(tmpdir(), "codex-web-telemetry-"));
  try {
    fs.writeFileSync(join(assetsDir, appMainAssetName), appMainFixture);
    fs.writeFileSync(join(assetsDir, composerAssetName), composerFixture);

    const patchedFiles = patchWebviewTelemetryDisableAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => basename(filePath)).sort(),
      [appMainAssetName, composerAssetName],
    );
    const patchedAppMain = fs.readFileSync(
      join(assetsDir, appMainAssetName),
      "utf8",
    );
    const patchedComposer = fs.readFileSync(
      join(assetsDir, composerAssetName),
      "utf8",
    );

    assert.match(patchedAppMain, /\bo=false,/);
    assert.match(patchedAppMain, /async function hP\(e\) \{\s*return;/);
    assert.match(patchedAppMain, /function eF\(e\) \{\s*return e\.children;/);
    assert.match(
      patchedComposer,
      /async function ff\(\{[\s\S]*?\}\) \{\s*return false;/,
    );
  } finally {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
});
