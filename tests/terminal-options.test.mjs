import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  resolveTerminalFontFamily,
  resolveTerminalFontSize,
  TERMINAL_FONT_FAMILY_STORAGE_KEY,
  TERMINAL_FONT_SIZE_STORAGE_KEY,
} from "../src/browser/terminal-options.mjs";

function storage(values) {
  return {
    getItem(key) {
      return values[key] ?? null;
    },
  };
}

test("resolveTerminalFontFamily prefers the fontFamily URL parameter", () => {
  assert.equal(
    resolveTerminalFontFamily({
      search: "?fontFamily=JetBrains%20Mono",
      storage: storage({
        [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
      }),
    }),
    "JetBrains Mono",
  );
});

test("resolveTerminalFontFamily falls back to localStorage then default", () => {
  assert.equal(
    resolveTerminalFontFamily({
      search: "",
      storage: storage({
        [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
      }),
    }),
    "Fira Code",
  );
  assert.equal(
    resolveTerminalFontFamily({ search: "", storage: storage({}) }),
    DEFAULT_TERMINAL_FONT_FAMILY,
  );
});

test("resolveTerminalFontSize reads URL and localStorage values within bounds", () => {
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=14.5",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
      }),
    }),
    14.5,
  );
  assert.equal(
    resolveTerminalFontSize({
      search: "",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
      }),
    }),
    16,
  );
});

test("resolveTerminalFontSize rejects invalid or out-of-range values", () => {
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=100",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "7",
      }),
    }),
    DEFAULT_TERMINAL_FONT_SIZE,
  );
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=abc",
      storage: storage({}),
    }),
    DEFAULT_TERMINAL_FONT_SIZE,
  );
});
