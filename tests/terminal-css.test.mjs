import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("src/browser/terminal-page.css", "utf8");

function block(selector) {
  const match = css.match(
    new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]+)\\}`),
  );
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

function mediaBlock(query, selector) {
  const mediaStart = css.indexOf(`@media ${query} {`);
  assert.notEqual(mediaStart, -1, `Missing @media ${query}`);

  let depth = 0;
  let mediaEnd = -1;
  for (let index = mediaStart; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        mediaEnd = index + 1;
        break;
      }
    }
  }
  assert.notEqual(mediaEnd, -1, `Unclosed @media ${query}`);

  const media = css.slice(mediaStart, mediaEnd);
  const match = media.match(
    new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]+)\\}`),
  );
  assert.ok(match, `Missing CSS block for ${selector} in @media ${query}`);
  return match[1];
}

test("terminal surface is flush with the page and xterm viewport", () => {
  assert.match(block(".terminal-page"), /padding:\s*0;/);
  assert.match(block(".terminal-page"), /--vscode-terminal-background/);
  assert.doesNotMatch(block(".terminal-page__surface"), /\bborder:/);
  assert.doesNotMatch(block(".terminal-page__surface"), /border-radius:/);
  assert.match(block(".terminal-page__surface .xterm"), /box-sizing:\s*border-box;/);
  assert.match(block(".terminal-page__surface .xterm"), /padding:\s*0;/);
  assert.match(
    block(".terminal-page__surface .xterm-scrollable-element"),
    /height:\s*100%;/,
  );
});

test("terminal settings are an overlay instead of a toolbar", () => {
  assert.match(block(".terminal-page__settings"), /position:\s*fixed;/);
  assert.match(
    block(".terminal-page__settings-panel"),
    /position:\s*absolute;/,
  );
});

test("terminal touch layout reserves top space without narrowing xterm", () => {
  const surfaceTouchBlock = mediaBlock(
    "(pointer: coarse)",
    ".terminal-page__surface",
  );
  const xtermTouchBlock = mediaBlock(
    "(pointer: coarse)",
    ".terminal-page__surface .xterm",
  );

  assert.doesNotMatch(
    css,
    /@media \(pointer: coarse\) \{[\s\S]*?\.terminal-page__surface \.xterm \{[^}]*padding-right:/,
  );
  assert.match(surfaceTouchBlock, /padding-top:\s*42px;/);
  assert.doesNotMatch(xtermTouchBlock, /margin-top:/);
  assert.doesNotMatch(xtermTouchBlock, /height:\s*calc\(100%/);
});
