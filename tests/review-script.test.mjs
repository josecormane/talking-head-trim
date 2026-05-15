import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeTempDir() {
  return mkdtempSync(resolve(tmpdir(), "talking-head-review-script-test-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

test("builds readable review script from source transcript and final EDL", () => {
  const tmp = makeTempDir();
  try {
    const editDir = resolve(tmp, "edit");
    const source = resolve(tmp, "source.mov");
    mkdirSync(resolve(editDir, "transcripts"), { recursive: true });
    writeFileSync(source, "placeholder\n");
    writeFileSync(resolve(editDir, "transcripts", "source.json"), `${JSON.stringify({
      words: [
        { text: "hello", start: 0.1, end: 0.2, type: "word" },
        { text: "hello", start: 0.21, end: 0.32, type: "word" },
        { text: "world", start: 0.4, end: 0.6, type: "word" },
      ],
    })}\n`);
    writeFileSync(resolve(editDir, "edl_final.json"), `${JSON.stringify({
      sources: { source },
      ranges: [{ source: "source", start: 0, end: 0.8, beat: "fixture" }],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      "scripts/build-talking-head-review-script.mjs",
      "--edit-dir", editDir,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const reviewScriptPath = resolve(editDir, "review_script.md");
    assert.ok(existsSync(reviewScriptPath));
    const reviewScript = readFileSync(reviewScriptPath, "utf8");
    assert.match(reviewScript, /Final Script With Output Times/);
    assert.match(reviewScript, /Output: 00:00\.00-00:00\.80/);
    assert.match(reviewScript, /hello hello world/);
    assert.match(reviewScript, /Adjacent duplicate/);
  } finally {
    cleanup(tmp);
  }
});
