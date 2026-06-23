import assert from "node:assert/strict";
import test from "node:test";

import {
  mapBrowserPathToInitialRoute,
  mapMemoryPathToBrowserPath,
} from "../src/browser/routes.ts";

test("settings browser paths initialize the matching memory route", () => {
  assert.deepEqual(mapBrowserPathToInitialRoute("/settings", ""), {
    memoryPath: "/settings",
  });
  assert.deepEqual(mapBrowserPathToInitialRoute("/settings/connections", ""), {
    memoryPath: "/settings/connections",
  });
});

test("settings memory paths are reflected in the browser URL", () => {
  assert.deepEqual(mapMemoryPathToBrowserPath("/settings"), {
    path: "/settings",
  });
  assert.deepEqual(mapMemoryPathToBrowserPath("/settings/connections"), {
    path: "/settings/connections",
  });
});
