import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("src/browser/terminal-page.css", "utf8");

function block(selector) {
  const match = css.match(new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]+)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test("terminal surface is flush with the page and xterm viewport", () => {
  assert.match(block(".terminal-page"), /padding:\s*0;/);
  assert.doesNotMatch(block(".terminal-page__surface"), /\bborder:/);
  assert.doesNotMatch(block(".terminal-page__surface"), /border-radius:/);
  assert.match(block(".terminal-page__surface .xterm"), /padding:\s*0;/);
  assert.match(block(".terminal-page__surface .xterm-scrollable-element"), /height:\s*100%;/);
});
