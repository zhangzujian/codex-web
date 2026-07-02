#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , restoredRoot, asarRoot, restoredFile] = process.argv;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectStringMarkers(source, restoredFile) {
  const sourceFile = ts.createSourceFile(
    restoredFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    restoredFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const markers = new Set();

  function add(text) {
    if (
      text.length >= 6 &&
      /^[A-Za-z0-9_.:-]+$/.test(text) &&
      !/^(?:className|defaultMessage|description|children)$/.test(text)
    ) {
      markers.add(text);
    }
  }

  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...markers];
}

function listJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

export function deriveRuntimeChunk(restoredRoot, asarRoot, restoredFile) {
  const restoredSource = readFileSync(path.join(restoredRoot, restoredFile), "utf8");
  const markers = collectStringMarkers(restoredSource, restoredFile);
  if (markers.length === 0) {
    throw new Error(`${restoredFile}: no string markers to derive runtime chunk`);
  }

  const assetsRoot = path.join(asarRoot, "webview/assets");
  const scored = listJsFiles(assetsRoot)
    .map((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return {
        filePath,
        score: markers.filter((marker) => source.includes(marker)).length,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 3) {
    throw new Error(`${restoredFile}: could not derive runtime chunk`);
  }
  if (scored[1] != null && scored[1].score === scored[0].score) {
    throw new Error(`${restoredFile}: runtime chunk match is ambiguous`);
  }

  return toPosixPath(path.relative(asarRoot, scored[0].filePath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!restoredRoot || !asarRoot || !restoredFile) {
    console.error(
      "usage: derive_restored_runtime_chunk.mjs <restored-root> <asar-root> <restored-file>",
    );
    process.exit(2);
  }

  console.log(deriveRuntimeChunk(restoredRoot, asarRoot, restoredFile));
}
