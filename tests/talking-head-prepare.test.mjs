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
  return mkdtempSync(resolve(tmpdir(), "talking-head-prepare-test-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

function createSourceAudio(path) {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=2",
    "-ac",
    "1",
    "-ar",
    "16000",
    path,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runPrepare(args) {
  return spawnSync(process.execPath, ["scripts/prepare-talking-head-cleanup.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER: "elevenlabs",
    },
    maxBuffer: 1024 * 1024 * 16,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("imports an external word-timestamp transcript and builds prep artifacts", () => {
  const tmp = makeTempDir();
  try {
    const source = resolve(tmp, "source.wav");
    const editDir = resolve(tmp, "edit");
    const transcript = resolve(tmp, "manual-transcript.json");
    createSourceAudio(source);
    writeFileSync(transcript, `${JSON.stringify({
      language_code: "es",
      words: [
        { text: "Hola", start: 0.1, end: 0.32 },
        { word: "mundo", start: 0.36, end: 0.7 },
        { text: "prueba", start: 1.4, end: 1.82 },
      ],
    })}\n`);

    const result = runPrepare([
      "--edit-dir", editDir,
      "--source", source,
      "--mode", "tight_reel",
      "--max-duration", "none",
      "--transcript", transcript,
      "--skip-silence",
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const normalized = readJson(resolve(editDir, "transcripts", "source.json"));
    assert.equal(normalized.transcriber_provider, "external");
    assert.equal(normalized.timing_precision, "word");
    assert.equal(normalized.words.filter((word) => word.type === "word").length, 3);
    assert.ok(normalized.words.some((word) => word.type === "spacing"));

    const packed = readFileSync(resolve(editDir, "takes_packed.md"), "utf8");
    assert.match(packed, /Hola mundo/);
    assert.match(packed, /prueba/);
    assert.ok(existsSync(resolve(editDir, "pre_scan.md")));
    assert.ok(existsSync(resolve(editDir, "LLM_EDITOR_BRIEF.md")));
  } finally {
    cleanup(tmp);
  }
});

test("reuses cached transcripts unless force-transcribe is set", () => {
  const tmp = makeTempDir();
  try {
    const source = resolve(tmp, "source.wav");
    const editDir = resolve(tmp, "edit");
    const transcriptsDir = resolve(editDir, "transcripts");
    const externalTranscript = resolve(tmp, "external.json");
    const cachedPath = resolve(transcriptsDir, "source.json");
    createSourceAudio(source);
    mkdirSync(transcriptsDir, { recursive: true });
    writeFileSync(cachedPath, `${JSON.stringify({
      provider: "cached",
      transcriber_provider: "cached",
      language_code: "es",
      words: [{ text: "Cacheado", start: 0.1, end: 0.4, type: "word", speaker_id: "speaker_0" }],
    })}\n`);
    writeFileSync(externalTranscript, `${JSON.stringify({
      language_code: "es",
      words: [{ text: "Nuevo", start: 0.2, end: 0.5 }],
    })}\n`);

    const cachedRun = runPrepare([
      "--edit-dir", editDir,
      "--source", source,
      "--mode", "natural_explainer",
      "--max-duration", "none",
      "--transcript", externalTranscript,
      "--skip-silence",
    ]);
    assert.equal(cachedRun.status, 0, cachedRun.stderr || cachedRun.stdout);
    assert.equal(readJson(cachedPath).transcriber_provider, "cached");

    const forcedRun = runPrepare([
      "--edit-dir", editDir,
      "--source", source,
      "--mode", "natural_explainer",
      "--max-duration", "none",
      "--transcript", externalTranscript,
      "--force-transcribe",
      "--skip-silence",
    ]);
    assert.equal(forcedRun.status, 0, forcedRun.stderr || forcedRun.stdout);
    const normalized = readJson(cachedPath);
    assert.equal(normalized.transcriber_provider, "external");
    assert.match(normalized.text, /Nuevo/);
  } finally {
    cleanup(tmp);
  }
});

test("accepts segment-only external transcript as estimated word timing fallback", () => {
  const tmp = makeTempDir();
  try {
    const source = resolve(tmp, "source.wav");
    const editDir = resolve(tmp, "edit");
    const transcript = resolve(tmp, "segments.json");
    createSourceAudio(source);
    writeFileSync(transcript, `${JSON.stringify({
      language_code: "es",
      segments: [
        { start_sec: 0, end_sec: 1.2, text: "Hola mundo" },
        { start: "00:01.50", end: "00:02.00", content: "cierre" },
      ],
    })}\n`);

    const result = runPrepare([
      "--edit-dir", editDir,
      "--source", source,
      "--mode", "tight_reel",
      "--max-duration", "none",
      "--transcript", transcript,
      "--skip-silence",
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const normalized = readJson(resolve(editDir, "transcripts", "source.json"));
    assert.equal(normalized.timing_precision, "segment-estimated-word");
    assert.equal(normalized.words.filter((word) => word.type === "word").length, 3);
  } finally {
    cleanup(tmp);
  }
});

test("requires one external transcript per source", () => {
  const tmp = makeTempDir();
  try {
    const sourceA = resolve(tmp, "source-a.wav");
    const sourceB = resolve(tmp, "source-b.wav");
    const transcript = resolve(tmp, "manual.json");
    createSourceAudio(sourceA);
    createSourceAudio(sourceB);
    writeFileSync(transcript, `${JSON.stringify({
      words: [{ text: "Hola", start: 0.1, end: 0.3 }],
    })}\n`);

    const result = runPrepare([
      "--edit-dir", resolve(tmp, "edit"),
      "--source", sourceA,
      "--source", sourceB,
      "--mode", "tight_reel",
      "--max-duration", "none",
      "--transcript", transcript,
      "--skip-silence",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected one --transcript per --source/);
  } finally {
    cleanup(tmp);
  }
});
