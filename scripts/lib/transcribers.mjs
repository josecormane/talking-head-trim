import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireEnv } from "./env.mjs";

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const LOCAL_WHISPER_HELPER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "local-whisper-transcribe.py");

export const TRANSCRIBERS = new Set(["local-whisper", "elevenlabs", "openai", "gemini", "external"]);

export function normalizeTranscriber(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "default") return "local-whisper";
  if (["local", "local-whisper", "whisper", "whisper-local", "faster-whisper", "fasterwhisper"].includes(normalized)) return "local-whisper";
  if (["eleven", "elevenlab", "elevenlabs", "elenlabs", "scribe"].includes(normalized)) return "elevenlabs";
  if (["openai", "openai-whisper", "whisper-api", "whisper-1"].includes(normalized)) return "openai";
  if (["gemini", "google"].includes(normalized)) return "gemini";
  if (["external", "manual", "import", "file"].includes(normalized)) return "external";
  throw new Error(`Unknown transcriber: ${value}. Use local-whisper, elevenlabs, openai, gemini, or external.`);
}

export function defaultTranscribeModel(provider) {
  if (provider === "local-whisper") return process.env.LOCAL_WHISPER_MODEL || "medium";
  if (provider === "openai") return process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  if (provider === "gemini") return process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3-flash-preview";
  if (provider === "external") return "external-json";
  return process.env.ELEVENLABS_TRANSCRIBE_MODEL || "scribe_v1";
}

export async function transcribeSource({
  provider,
  source,
  editDir,
  language = "",
  numSpeakers = "",
  model = "",
  force = false,
  python = "python3",
  helpersDir = "",
  externalTranscript = "",
}) {
  const selected = normalizeTranscriber(provider);
  const transcriptPath = resolve(editDir, "transcripts", `${stem(source)}.json`);

  if (force && existsSync(transcriptPath)) {
    rmSync(transcriptPath);
  }

  if (existsSync(transcriptPath)) {
    console.log(`cached: ${transcriptPath}`);
    return transcriptPath;
  }

  if (selected === "external") {
    if (!externalTranscript) {
      throw new Error("--transcriber external requires --transcript <path> for each source.");
    }
    return importExternalTranscript({ source, inputPath: externalTranscript, transcriptPath });
  }
  if (selected === "elevenlabs") {
    return transcribeWithElevenLabs({ source, editDir, language, numSpeakers, python, helpersDir });
  }
  if (selected === "local-whisper") {
    return transcribeWithLocalWhisper({ source, transcriptPath, language, model: model || defaultTranscribeModel("local-whisper"), python });
  }
  if (selected === "openai") {
    return transcribeWithOpenAI({ source, transcriptPath, language, model: model || defaultTranscribeModel("openai") });
  }
  if (selected === "gemini") {
    return transcribeWithGemini({ source, transcriptPath, language, model: model || defaultTranscribeModel("gemini") });
  }

  throw new Error(`Unsupported transcriber: ${selected}`);
}

function importExternalTranscript({ source, inputPath, transcriptPath }) {
  const absoluteInput = resolve(inputPath);
  if (!existsSync(absoluteInput)) throw new Error(`Transcript file not found: ${absoluteInput}`);

  const payload = JSON.parse(readFileSync(absoluteInput, "utf8"));
  const normalized = normalizeExternalTranscript(payload, { source, inputPath: absoluteInput });
  writeFileSync(transcriptPath, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(`  imported transcript: ${absoluteInput}`);
  console.log(`  saved: ${transcriptPath}`);
  return transcriptPath;
}

function transcribeWithElevenLabs({ source, editDir, language, numSpeakers, python, helpersDir }) {
  const transcribePy = resolve(helpersDir, "transcribe.py");
  if (!existsSync(transcribePy)) throw new Error(`Missing helper: ${transcribePy}`);

  const cmdArgs = [transcribePy, source, "--edit-dir", editDir];
  if (language) cmdArgs.push("--language", language);
  if (numSpeakers) cmdArgs.push("--num-speakers", String(numSpeakers));
  run(python, cmdArgs, { stdio: "inherit" });
  return resolve(editDir, "transcripts", `${stem(source)}.json`);
}

function transcribeWithLocalWhisper({ source, transcriptPath, language, model, python }) {
  if (!existsSync(LOCAL_WHISPER_HELPER)) throw new Error(`Missing helper: ${LOCAL_WHISPER_HELPER}`);

  const tmp = mkdtempSync(resolve(tmpdir(), "talking-head-local-whisper-"));
  try {
    const audioPath = resolve(tmp, `${stem(source)}.wav`);
    extractWav(source, audioPath);
    console.log(`  transcribing locally with faster-whisper ${model} (${formatMb(audioPath)} MB wav)`);

    const cmdArgs = [
      LOCAL_WHISPER_HELPER,
      "--audio", audioPath,
      "--source", source,
      "--output", transcriptPath,
      "--model", model,
    ];
    if (language) cmdArgs.push("--language", language);
    if (process.env.LOCAL_WHISPER_DEVICE) cmdArgs.push("--device", process.env.LOCAL_WHISPER_DEVICE);
    if (process.env.LOCAL_WHISPER_COMPUTE_TYPE) cmdArgs.push("--compute-type", process.env.LOCAL_WHISPER_COMPUTE_TYPE);
    if (/^(1|true|yes)$/i.test(process.env.LOCAL_WHISPER_VAD || "")) cmdArgs.push("--vad-filter");

    run(python, cmdArgs, { stdio: "inherit" });
    return transcriptPath;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function transcribeWithOpenAI({ source, transcriptPath, language, model }) {
  const apiKey = requireEnv("OPENAI_API_KEY", "Set it in .env or export it before running OpenAI transcription.");
  if (model !== "whisper-1") {
    console.warn(`OpenAI model ${model} may not return word timestamps. Use whisper-1 for precise trim handles.`);
  }

  const tmp = mkdtempSync(resolve(tmpdir(), "talking-head-openai-"));
  try {
    const audioPath = resolve(tmp, `${stem(source)}.m4a`);
    extractAudio(source, audioPath);
    console.log(`  uploading ${basename(audioPath)} to OpenAI (${formatMb(audioPath)} MB)`);

    const form = new FormData();
    form.append("file", new Blob([readFileSync(audioPath)], { type: "audio/mp4" }), basename(audioPath));
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (language) form.append("language", normalizeLanguageForOpenAI(language));

    const response = await fetchWithRetry(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    }, "OpenAI transcription request");
    const payload = await readJsonResponse(response, "OpenAI transcription failed");
    const normalized = normalizeOpenAITranscript(payload, { source, model });

    writeFileSync(transcriptPath, `${JSON.stringify(normalized, null, 2)}\n`);
    console.log(`  saved: ${transcriptPath}`);
    return transcriptPath;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function transcribeWithGemini({ source, transcriptPath, language, model }) {
  const apiKey = requireEnv("GEMINI_API_KEY", "Set it in .env or export it before running Gemini transcription.");

  const tmp = mkdtempSync(resolve(tmpdir(), "talking-head-gemini-"));
  try {
    const audioPath = resolve(tmp, `${stem(source)}.m4a`);
    extractAudio(source, audioPath);
    console.log(`  sending ${basename(audioPath)} to Gemini (${formatMb(audioPath)} MB)`);

    const body = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "audio/mp4",
              data: readFileSync(audioPath).toString("base64"),
            },
          },
          { text: geminiTranscriptionPrompt(language) },
        ],
      }],
      generation_config: {
        response_mime_type: "application/json",
        response_schema: geminiTranscriptionSchema(),
      },
    };

    const response = await fetchWithRetry(`${GEMINI_GENERATE_URL}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "Gemini transcription request");
    const payload = await readJsonResponse(response, "Gemini transcription failed");
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) {
      throw new Error(`Gemini did not return JSON text. Response: ${JSON.stringify(payload).slice(0, 1000)}`);
    }

    const parsed = JSON.parse(stripJsonFence(text));
    const normalized = normalizeGeminiTranscript(parsed, { source, model });
    writeFileSync(transcriptPath, `${JSON.stringify(normalized, null, 2)}\n`);
    console.log(`  saved: ${transcriptPath}`);
    console.warn("  Gemini timestamps are segment-based; word timings are estimated for trim snapping.");
    return transcriptPath;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function normalizeOpenAITranscript(payload, { source, model }) {
  const words = (payload.words || [])
    .map((item) => ({
      text: String(item.word || "").trim(),
      start: Number(item.start),
      end: Number(item.end),
      type: "word",
      speaker_id: "speaker_0",
    }))
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end));

  if (!words.length) {
    throw new Error("OpenAI response did not include word timestamps. Use model whisper-1 with verbose_json.");
  }

  return {
    provider: "openai",
    transcriber_provider: "openai",
    transcriber_model: model,
    timing_precision: "word",
    source: source,
    language_code: payload.language || "",
    audio_duration_secs: Number(payload.duration || words.at(-1)?.end || 0),
    text: payload.text || words.map((item) => item.text).join(" "),
    segments: payload.segments || [],
    words: withSpacing(words),
  };
}

function normalizeGeminiTranscript(payload, { source, model }) {
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const segments = rawSegments
    .map((segment) => ({
      start: parseSeconds(segment.start_sec ?? segment.start ?? segment.timestamp_start ?? segment.timestamp),
      end: parseSeconds(segment.end_sec ?? segment.end ?? segment.timestamp_end),
      text: String(segment.text || segment.content || "").trim(),
      speaker_id: normalizeSpeaker(segment.speaker),
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  if (!segments.length) {
    throw new Error("Gemini response did not include usable timestamped segments.");
  }

  const estimatedWords = segments.flatMap((segment) => estimateWordsForSegment(segment));
  return {
    provider: "gemini",
    transcriber_provider: "gemini",
    transcriber_model: model,
    timing_precision: "segment-estimated-word",
    source: source,
    language_code: payload.language_code || payload.language || "",
    audio_duration_secs: Number(segments.at(-1)?.end || 0),
    text: payload.text || segments.map((segment) => segment.text).join(" "),
    segments,
    words: withSpacing(estimatedWords),
  };
}

function normalizeExternalTranscript(payload, { source, inputPath }) {
  const words = externalWordEntries(payload);
  if (words.length) {
    return {
      provider: "external",
      transcriber_provider: "external",
      transcriber_model: basename(inputPath),
      timing_precision: "word",
      source,
      language_code: payload.language_code || payload.language || "",
      audio_duration_secs: Number(payload.audio_duration_secs || payload.duration || words.at(-1)?.end || 0),
      text: payload.text || words.map((item) => item.text).join(" "),
      segments: payload.segments || [],
      words: withSpacing(words),
    };
  }

  const segments = externalSegments(payload);
  if (segments.length) {
    const estimatedWords = segments.flatMap((segment) => estimateWordsForSegment(segment));
    return {
      provider: "external",
      transcriber_provider: "external",
      transcriber_model: basename(inputPath),
      timing_precision: "segment-estimated-word",
      source,
      language_code: payload.language_code || payload.language || "",
      audio_duration_secs: Number(payload.audio_duration_secs || payload.duration || segments.at(-1)?.end || 0),
      text: payload.text || segments.map((segment) => segment.text).join(" "),
      segments,
      words: withSpacing(estimatedWords),
    };
  }

  throw new Error([
    `External transcript has no usable word timestamps: ${inputPath}`,
    "Expected JSON with words: [{ text|word, start|start_sec, end|end_sec }].",
    "Segment JSON is also accepted, but word timings will be estimated.",
  ].join(" "));
}

function externalWordEntries(payload) {
  const rawWords = Array.isArray(payload) ? payload : payload.words || payload.tokens || [];
  if (!Array.isArray(rawWords)) return [];
  return rawWords
    .filter((item) => item && item.type !== "spacing")
    .map((item) => ({
      text: String(item.text ?? item.word ?? item.token ?? "").trim(),
      start: parseSeconds(item.start ?? item.start_sec ?? item.begin ?? item.from),
      end: parseSeconds(item.end ?? item.end_sec ?? item.finish ?? item.to),
      type: "word",
      speaker_id: normalizeSpeaker(item.speaker_id ?? item.speaker),
    }))
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start)
    .sort((a, b) => a.start - b.start);
}

function externalSegments(payload) {
  const rawSegments = payload?.segments || payload?.phrases || [];
  if (!Array.isArray(rawSegments)) return [];
  return rawSegments
    .map((segment) => ({
      start: parseSeconds(segment.start ?? segment.start_sec ?? segment.timestamp_start ?? segment.timestamp),
      end: parseSeconds(segment.end ?? segment.end_sec ?? segment.timestamp_end),
      text: String(segment.text || segment.content || "").trim(),
      speaker_id: normalizeSpeaker(segment.speaker_id ?? segment.speaker),
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);
}

function estimateWordsForSegment(segment) {
  const tokens = segment.text.match(/\S+/g) || [];
  if (!tokens.length) return [];

  const duration = segment.end - segment.start;
  return tokens.map((token, index) => {
    const start = segment.start + (duration * index) / tokens.length;
    const end = segment.start + (duration * (index + 1)) / tokens.length;
    return {
      text: token,
      start: roundTime(start),
      end: roundTime(end),
      type: "word",
      speaker_id: segment.speaker_id || "speaker_0",
    };
  });
}

function withSpacing(words) {
  const sorted = words
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start)
    .sort((a, b) => a.start - b.start);
  const output = [];

  for (const word of sorted) {
    const prev = output.at(-1);
    if (prev && Number.isFinite(prev.end) && word.start - prev.end > 0.01) {
      output.push({
        text: " ",
        start: roundTime(prev.end),
        end: roundTime(word.start),
        type: "spacing",
        speaker_id: word.speaker_id || prev.speaker_id || "speaker_0",
      });
    }
    output.push({ ...word, start: roundTime(word.start), end: roundTime(word.end) });
  }

  return output;
}

function geminiTranscriptionPrompt(language) {
  const languageLine = language
    ? `The likely language code is ${language}. Keep the transcript in that language.`
    : "Detect the spoken language and keep the transcript in the original language.";

  return [
    "Transcribe this talking-head audio for video editing.",
    languageLine,
    "Return JSON only.",
    "Split the speech into short chronological segments with start_sec and end_sec in seconds from the beginning of the audio.",
    "Do not summarize, rewrite, clean up, or remove repetitions. Preserve false starts and repeated attempts.",
    "Use speaker labels only if there is more than one speaker.",
  ].join("\n");
}

function geminiTranscriptionSchema() {
  return {
    type: "OBJECT",
    properties: {
      language_code: { type: "STRING" },
      text: { type: "STRING" },
      segments: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            start_sec: { type: "NUMBER" },
            end_sec: { type: "NUMBER" },
            speaker: { type: "STRING" },
            text: { type: "STRING" },
          },
          required: ["start_sec", "end_sec", "text"],
        },
      },
    },
    required: ["text", "segments"],
  };
}

function extractAudio(source, audioPath) {
  run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    audioPath,
  ], { stdio: "ignore" });
}

function extractWav(source, audioPath) {
  run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    audioPath,
  ], { stdio: "ignore" });
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label}: ${response.status} ${text.slice(0, 1000)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: non-JSON response (${error.message}): ${text.slice(0, 1000)}`);
  }
}

async function fetchWithRetry(url, options, label, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw new Error(`${label}: network error after ${retries + 1} attempts (${lastError?.message || lastError})`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    ...opts,
  });
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || "").slice(-4000);
    throw new Error(`Command failed: ${cmd} ${cmdArgs.join(" ")}\n${tail}`);
  }
  return result;
}

function parseSeconds(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return Number.NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}

function normalizeSpeaker(value) {
  const raw = String(value || "speaker_0").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "speaker_0";
  if (raw.startsWith("speaker_")) return raw;
  return `speaker_${raw.replace(/^speaker_?/, "")}`;
}

function normalizeLanguageForOpenAI(language) {
  const map = { spa: "es", eng: "en", fra: "fr", fre: "fr", deu: "de", ger: "de", por: "pt" };
  return map[String(language).toLowerCase()] || language;
}

function stripJsonFence(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function formatMb(path) {
  return (statSync(path).size / (1024 * 1024)).toFixed(1);
}

function roundTime(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function stem(path) {
  return basename(path).replace(/\.[^.]+$/, "");
}
