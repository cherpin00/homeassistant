import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "../../tools/stonebridge-build.mjs";

const dist = new URL("../../www/stonebridge/dist/", import.meta.url);

test("committed bundle matches sources (run: node tools/stonebridge-build.mjs)", () => {
  const { bundle, versionJson } = build();
  assert.equal(readFileSync(new URL("stonebridge.js", dist), "utf8"), bundle);
  assert.equal(readFileSync(new URL("version.json", dist), "utf8"), versionJson);
});

test("bundle has no leftover import/export statements", () => {
  const { bundle } = build();
  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m);
});
