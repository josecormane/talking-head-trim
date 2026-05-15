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
  return mkdtempSync(resolve(tmpdir(), "talking-head-qc-test-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

function runQc(editDir) {
  return spawnSync(process.execPath, ["scripts/check-talking-head-qc.mjs", "--edit-dir", editDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function writeEdl(path) {
  writeFileSync(path, `${JSON.stringify({
    sources: { source: "/tmp/source.mov" },
    ranges: [{ source: "source", start: 0, end: 1, beat: "test" }],
  }, null, 2)}\n`);
}

function writeSecondPassArtifacts(editDir) {
  const secondPassDir = resolve(editDir, "second_pass");
  const transcriptsDir = resolve(secondPassDir, "analysis", "transcripts");
  mkdirSync(transcriptsDir, { recursive: true });
  writeFileSync(resolve(editDir, "presenter_cut_pass1.mp4"), "fake mp4\n");
  writeFileSync(resolve(secondPassDir, "second_pass_review_packet.md"), "# Second Pass Review Packet\n");
  writeFileSync(resolve(secondPassDir, "pass1_silence_scan.json"), `${JSON.stringify({ events: [] })}\n`);
  writeFileSync(resolve(transcriptsDir, "presenter_cut_pass1.json"), `${JSON.stringify({
    words: [{ text: "ok", start: 0, end: 0.2, type: "word" }],
  })}\n`);
}

function writeReviewScript(editDir) {
  writeFileSync(resolve(editDir, "review_script.md"), [
    "# Review Script",
    "",
    "## Final Script With Output Times",
    "",
    "### 01 test",
    "",
    "- Output: 00:00.00-00:01.00",
    "- Source: source 00:00.00-00:01.00",
    "",
    "ok",
    "",
  ].join("\n"));
}

test("passes when first pass, final EDL, and second-pass QC exist", () => {
  const tmp = makeTempDir();
  try {
    mkdirSync(tmp, { recursive: true });
    writeEdl(resolve(tmp, "edl_v1.json"));
    writeSecondPassArtifacts(tmp);
    writeEdl(resolve(tmp, "edl_final.json"));
    writeReviewScript(tmp);
    writeFileSync(resolve(tmp, "editor_qc.md"), "Second pass review: original source material was reconsidered and review_script.md was checked; no repeated ideas, hidden pauses, or clipped words remain.\n");

    const result = runQc(tmp);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /QC gate passed/);
  } finally {
    cleanup(tmp);
  }
});

test("fails when second-pass QC note is missing", () => {
  const tmp = makeTempDir();
  try {
    mkdirSync(tmp, { recursive: true });
    writeEdl(resolve(tmp, "edl_v1.json"));
    writeSecondPassArtifacts(tmp);
    writeEdl(resolve(tmp, "edl_final.json"));
    writeReviewScript(tmp);
    writeFileSync(resolve(tmp, "editor_qc.md"), "Looks fine.\n");

    const result = runQc(tmp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /second pass/);
  } finally {
    cleanup(tmp);
  }
});

test("fails when first-pass rendered analysis artifacts are missing", () => {
  const tmp = makeTempDir();
  try {
    mkdirSync(tmp, { recursive: true });
    writeEdl(resolve(tmp, "edl_v1.json"));
    writeEdl(resolve(tmp, "edl_final.json"));
    writeReviewScript(tmp);
    writeFileSync(resolve(tmp, "editor_qc.md"), "Second pass review: checked assembled MP4.\n");

    const result = runQc(tmp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /first-pass rendered MP4/);
    assert.match(result.stderr, /second-pass review packet/);
  } finally {
    cleanup(tmp);
  }
});

test("fails when review script is missing", () => {
  const tmp = makeTempDir();
  try {
    mkdirSync(tmp, { recursive: true });
    writeEdl(resolve(tmp, "edl_v1.json"));
    writeSecondPassArtifacts(tmp);
    writeEdl(resolve(tmp, "edl_final.json"));
    writeFileSync(resolve(tmp, "editor_qc.md"), "Second pass review: original source material was reconsidered and review_script.md was checked.\n");

    const result = runQc(tmp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /review script/);
  } finally {
    cleanup(tmp);
  }
});
