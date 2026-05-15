import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeTempDir() {
  return mkdtempSync(resolve(tmpdir(), "talking-head-render-final-gate-test-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

test("render-final refuses to run before review handoff", () => {
  const tmp = makeTempDir();
  try {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(resolve(tmp, "edl_final.json"), `${JSON.stringify({
      sources: { source: "/tmp/source.mov" },
      ranges: [{ source: "source", start: 0, end: 1, beat: "test" }],
    })}\n`);

    const result = spawnSync(process.execPath, [
      "scripts/render-talking-head-final.mjs",
      "--edit-dir", tmp,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cannot render final before review handoff/);
    assert.match(result.stderr, /review_script\.md/);
    assert.match(result.stderr, /presenter_cut_review_maxres_latest\.json/);
    assert.match(result.stderr, /trim_ui\/handoff\.json/);
  } finally {
    cleanup(tmp);
  }
});
