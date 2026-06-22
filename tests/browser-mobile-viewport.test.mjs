import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSidebarStateForValues,
  isMobileSidebarViewportForValues,
} from "../src/browser/mobile-viewport.mts";

test("coarse physical-width phone viewport uses mobile sidebar behavior", () => {
  assert.equal(isMobileSidebarViewportForValues(1264, true), true);
});

test("desktop-width fine pointer viewport keeps desktop sidebar behavior", () => {
  assert.equal(isMobileSidebarViewportForValues(1264, false), false);
});

test("touch physical-width phone viewport uses mobile sidebar behavior even without coarse pointer", () => {
  assert.equal(isMobileSidebarViewportForValues(1264, false, 5), true);
});

test("coarse physical-width existing thread starts with sidebar closed", () => {
  assert.equal(initialSidebarStateForValues(1264, true, "/local/thread-id"), false);
});

test("touch physical-width existing thread starts with sidebar closed without coarse pointer", () => {
  assert.equal(
    initialSidebarStateForValues(1264, false, "/local/thread-id", 5),
    false,
  );
});

test("coarse physical-width new thread starts with sidebar closed", () => {
  assert.equal(initialSidebarStateForValues(1264, true, "/"), false);
});
