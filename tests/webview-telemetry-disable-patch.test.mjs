import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const patchPath = new URL(
  "../patches/webview-statsig-override-adapter.patch",
  import.meta.url,
);

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

test("webview Statsig patch disables analytics and network telemetry", async () => {
  const patch = await readFile(patchPath, "utf8");

  assert.match(patch, /\+\s+disableLogging: true,/);
  assert.match(patch, /\+\s+preventAllNetworkTraffic: true,/);
  assert.match(patch, /\+\s+o = false,/);
  assert.match(
    patch,
    /async function hP\(e\) \{\n\+\s+return;/,
    "Codex analytics event submission should be disabled before it can POST",
  );
  assert.match(
    patch,
    /function eF\(e\) \{\n\+\s+return e\.children;/,
    "Statsig provider setup should return children without initializing experiments",
  );
  assert.match(
    patch,
    /--- a\/webview\/assets\/composer-DdM3sB3u\.js/,
    "Composer usage limit analytics should be patched too",
  );
  assert.match(
    patch,
    /--- a\/webview\/assets\/composer-DdM3sB3u\.js[\s\S]*?\}\) \{\n\+\s+return false;/,
    "Composer usage limit analytics should return before POSTing",
  );
});

test("webview telemetry patch disables direct analytics helpers when applied", async () => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "codex-web-telemetry-patch-"),
  );
  try {
    const assetsPath = join(fixtureRoot, "webview/assets");
    await mkdir(assetsPath, { recursive: true });
    await writeFile(join(assetsPath, "app-main-Cykt_nvm.js"), appMainFixture);
    await writeFile(join(assetsPath, "composer-DdM3sB3u.js"), composerFixture);

    const patch = await readFile(patchPath, "utf8");
    const result = spawnSync(
      "patch",
      ["--batch", "--forward", "--strip", "1"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
        input: patch,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const patchedAppMain = await readFile(
      join(assetsPath, "app-main-Cykt_nvm.js"),
      "utf8",
    );
    const patchedComposer = await readFile(
      join(assetsPath, "composer-DdM3sB3u.js"),
      "utf8",
    );

    assert.match(patchedAppMain, /\bo = false,/);
    assert.match(patchedAppMain, /async function hP\(e\) \{\n\s+return;/);
    assert.match(patchedAppMain, /function eF\(e\) \{\n\s+return e\.children;/);
    assert.match(
      patchedComposer,
      /async function ff\(\{[\s\S]*?\}\) \{\n\s+return false;/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
