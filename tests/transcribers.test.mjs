import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSCRIBERS,
  defaultTranscribeModel,
  normalizeTranscriber,
} from "../scripts/lib/transcribers.mjs";

test("defaults transcription to local faster-whisper medium", () => {
  assert.equal(normalizeTranscriber(""), "local-whisper");
  assert.equal(normalizeTranscriber("default"), "local-whisper");
  assert.equal(defaultTranscribeModel("local-whisper"), process.env.LOCAL_WHISPER_MODEL || "medium");
});

test("accepts local-whisper aliases while keeping OpenAI explicit", () => {
  assert.ok(TRANSCRIBERS.has("local-whisper"));
  assert.equal(normalizeTranscriber("local"), "local-whisper");
  assert.equal(normalizeTranscriber("whisper"), "local-whisper");
  assert.equal(normalizeTranscriber("faster-whisper"), "local-whisper");
  assert.equal(normalizeTranscriber("openai"), "openai");
  assert.equal(normalizeTranscriber("whisper-1"), "openai");
});
