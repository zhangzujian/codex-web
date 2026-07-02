#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generatePreloadHookPatch } from "./adapt_preload_hook.mjs";
import { runPreloadHookSmoke } from "./smoke_preload_hook.mjs";

const FOCUSED_TESTS = [
  "tests/preload-hook-adapter.test.mjs",
  "tests/asar-static-patches.test.mjs",
];

function parseArgs(argv) {
  const options = {
    asarDir: "scratch/asar",
    patchPath: "patches/webview-preload.patch",
    prepare: false,
    buildBrowser: true,
    reportPath: "scratch/preload-hook-report.json",
    runTests: true,
    smoke: "runtime",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--asar") options.asarDir = argv[++index];
    else if (arg === "--patch") options.patchPath = argv[++index];
    else if (arg === "--prepare") options.prepare = true;
    else if (arg === "--report") options.reportPath = argv[++index];
    else if (arg === "--skip-build-browser") options.buildBrowser = false;
    else if (arg === "--skip-tests") options.runTests = false;
    else if (arg === "--smoke") options.smoke = argv[++index];
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!["runtime", "preflight", "skip"].includes(options.smoke)) {
    throw new Error("--smoke must be runtime, preflight, or skip");
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function prepareAsar() {
  run("bash", ["./scripts/prepare_asar"]);
}

function assertReportGate(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const failures = [];
  if (!report.support?.ok) failures.push("support.ok is false");
  if (!report.staticReview?.ok) {
    failures.push("staticReview.ok is false");
    for (const [key, value] of Object.entries(report.staticReview ?? {})) {
      if (
        key !== "ok" &&
        key !== "unknownRendererArguments" &&
        Array.isArray(value) &&
        value.length > 0
      ) {
        failures.push(`${key}: ${value.length}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`preload hook report gate failed: ${failures.join("; ")}`);
  }
  return report;
}

async function runSmoke(options) {
  if (options.smoke === "skip") {
    console.log("smoke: skipped");
    return;
  }
  const result = await runPreloadHookSmoke({
    asarDir: options.asarDir,
    preflightOnly: options.smoke === "preflight",
    reportPath: options.reportPath,
  });
  console.log(`smoke: ${result.mode} ok`);
}

export async function adaptDesktopApp(options) {
  if (options.prepare) {
    prepareAsar();
  } else {
    generatePreloadHookPatch({
      asarDir: options.asarDir,
      patchPath: options.patchPath,
      reportPath: options.reportPath,
    });
  }
  const report = assertReportGate(options.reportPath);
  console.log(
    `report gate: ok (${report.staticProfile.electronBridgeContracts.length} bridge contracts, ${report.rendererAssetProfile.bridgeMethodCalls.length} renderer calls)`,
  );
  if (options.buildBrowser) {
    run("npm", ["run", "build:browser"]);
  }
  if (options.runTests) {
    run("node", ["--test", ...FOCUSED_TESTS]);
  }
  await runSmoke(options);
  return report;
}

async function main() {
  await adaptDesktopApp(parseArgs(process.argv));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
