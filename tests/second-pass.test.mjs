import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
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
  return mkdtempSync(resolve(tmpdir(), "talking-head-second-pass-test-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

function createSourceVideo(path) {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=black:s=320x240:d=1.2",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=1.2",
    "-shortest",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    path,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("renders and analyzes first-pass MP4 for second-pass review", () => {
  const tmp = makeTempDir();
  try {
    const source = resolve(tmp, "source.mp4");
    const editDir = resolve(tmp, "edit");
    const transcript = resolve(tmp, "pass1-transcript.json");
    createSourceVideo(source);
    writeFileSync(resolve(tmp, "edl_v1.json"), `${JSON.stringify({
      sources: { source },
      ranges: [{ source: "source", start: 0, end: 0.8, beat: "fixture" }],
    }, null, 2)}\n`);
    writeFileSync(transcript, `${JSON.stringify({
      language_code: "en",
      words: [{ text: "test", start: 0.1, end: 0.3 }],
    })}\n`);
    spawnSync("mkdir", ["-p", editDir]);
    spawnSync("cp", [resolve(tmp, "edl_v1.json"), resolve(editDir, "edl_v1.json")]);

    const result = spawnSync(process.execPath, [
      "scripts/second-pass-talking-head-review.mjs",
      "--edit-dir", editDir,
      "--transcriber", "external",
      "--transcript", transcript,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(resolve(editDir, "presenter_cut_pass1.mp4")));
    assert.ok(existsSync(resolve(editDir, "second_pass", "pass1_silence_scan.json")));
    assert.ok(existsSync(resolve(editDir, "second_pass", "analysis", "transcripts", "presenter_cut_pass1.json")));
    const packetPath = resolve(editDir, "second_pass", "second_pass_review_packet.md");
    assert.ok(existsSync(packetPath));
    assert.match(readFileSync(packetPath, "utf8"), /already-cut video/);
  } finally {
    cleanup(tmp);
  }
});
