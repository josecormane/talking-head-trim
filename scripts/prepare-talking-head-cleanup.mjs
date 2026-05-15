#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadDotEnv } from "./lib/env.mjs";
import { defaultTranscribeModel, normalizeTranscriber, transcribeSource } from "./lib/transcribers.mjs";

const DEFAULT_VIDEO_USE_DIR = "tools/video-use";

const STOPWORDS = new Set([
  "a", "al", "algo", "ante", "asi", "aunque", "cada", "como", "con", "contra",
  "cual", "cuando", "de", "del", "desde", "donde", "dos", "el", "ella", "en",
  "entre", "era", "es", "esa", "ese", "eso", "esta", "este", "esto", "fue",
  "ha", "hay", "la", "las", "le", "lo", "los", "mas", "me", "mi", "muy",
  "no", "o", "para", "pero", "por", "porque", "que", "se", "si", "sin",
  "sobre", "son", "su", "sus", "te", "tiene", "un", "una", "uno", "y", "ya",
  "eh", "em", "este", "pues", "digamos", "osea", "tipo",
]);

function usage() {
  return [
    "Usage:",
    "  npm run reel:talking-head:prepare -- --run-root <pipeline_clean_dir> --source <raw.mp4> --mode tight_reel --max-duration 03:00",
    "",
    "Options:",
    "  --source <path>               Raw recording path. Repeat for multiple sources.",
    "  --run-root <path>             Run folder containing presenter_edit/.",
    "  --edit-dir <path>             Override presenter_edit output folder.",
    "  --mode tight_reel|natural_explainer",
    "  --max-duration MM:SS|none     Default: none",
    "  --content-goal <text>         Short goal or script note for the LLM brief.",
    "  --transcriber <provider>      local-whisper|elevenlabs|openai|gemini|external. Default: VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER or local-whisper.",
    "  --transcribe-model <id>       Provider model override. Defaults: medium, scribe_v1, whisper-1, gemini-3-flash-preview.",
    "  --transcript <path>           External word-timestamp transcript JSON. Repeat once per source.",
    "  --language <code>             Passed to the selected transcriber, e.g. es.",
    "  --num-speakers <n>            Passed to ElevenLabs Scribe when provider is elevenlabs.",
    "  --skip-transcribe             Reuse existing transcript JSON files.",
    "  --force-transcribe            Regenerate transcript JSON even if cached files exist.",
    "  --skip-silence                Skip ffmpeg silencedetect scan.",
    "  --video-use-dir <path>        Default: tools/video-use",
    "",
    "Outputs:",
    "  presenter_edit/source_inventory.md",
    "  presenter_edit/silence_scan/*.txt and *.json",
    "  presenter_edit/takes_packed.md",
    "  presenter_edit/pre_scan.md",
    "  presenter_edit/LLM_EDITOR_BRIEF.md",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    sources: [],
    mode: "natural_explainer",
    maxDuration: "none",
    contentGoal: "",
    language: "",
    numSpeakers: "",
    transcriber: process.env.VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER || "local-whisper",
    transcribeModel: "",
    transcripts: [],
    skipTranscribe: false,
    forceTranscribe: false,
    skipSilence: false,
    videoUseDir: DEFAULT_VIDEO_USE_DIR,
    clusterWindowSec: 180,
    silenceNoise: "-35dB",
    silenceMinSec: 0.2,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!key.startsWith("--")) {
      args.sources.push(key);
      continue;
    }
    const name = key.slice(2);
    const hasValue = argv[i + 1] && !argv[i + 1].startsWith("--");
    const value = hasValue ? argv[++i] : "true";

    if (name === "source") args.sources.push(value);
    else if (name === "run-root") args.runRoot = value;
    else if (name === "edit-dir") args.editDir = value;
    else if (name === "mode") args.mode = value;
    else if (name === "max-duration") args.maxDuration = value;
    else if (name === "content-goal") args.contentGoal = value;
    else if (name === "transcriber") args.transcriber = value;
    else if (name === "transcribe-model") args.transcribeModel = value;
    else if (name === "transcript") args.transcripts.push(value);
    else if (name === "language") args.language = value;
    else if (name === "num-speakers") args.numSpeakers = value;
    else if (name === "skip-transcribe") args.skipTranscribe = true;
    else if (name === "force-transcribe") args.forceTranscribe = true;
    else if (name === "skip-silence") args.skipSilence = true;
    else if (name === "video-use-dir") args.videoUseDir = value;
    else if (name === "cluster-window-sec") args.clusterWindowSec = Number(value);
    else if (name === "silence-noise") args.silenceNoise = value;
    else if (name === "silence-min-sec") args.silenceMinSec = Number(value);
    else throw new Error(`Unknown option: --${name}`);
  }

  return args;
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

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function stem(path) {
  return basename(path).replace(/\.[^.]+$/, "");
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(text) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / (left.size + right.size - overlap);
}

function parseFfprobe(path) {
  const result = run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  return JSON.parse(result.stdout);
}

function renderInventory(sources, probeBySource) {
  const lines = ["# Source Inventory", ""];
  for (const source of sources) {
    const probe = probeBySource[source];
    const video = (probe.streams || []).find((s) => s.codec_type === "video") || {};
    const audio = (probe.streams || []).find((s) => s.codec_type === "audio") || {};
    const duration = Number(probe.format?.duration || video.duration || audio.duration || 0);
    lines.push(`## ${basename(source)}`);
    lines.push("");
    lines.push(`- Path: ${source}`);
    lines.push(`- Duration: ${formatTime(duration)} (${duration.toFixed(3)}s)`);
    lines.push(`- Video: ${video.width || "?"}x${video.height || "?"}, ${video.codec_name || "?"}, ${video.r_frame_rate || "?"} fps`);
    lines.push(`- Audio: ${audio.codec_name || "?"}, ${audio.sample_rate || "?"} Hz, ${audio.channels || "?"} channel(s)`);
    lines.push("");
  }
  return lines.join("\n");
}

function parseSilenceDetect(stderr) {
  const events = [];
  let current = null;
  for (const line of stderr.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      current = { start: Number(startMatch[1]) };
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch) {
      const end = Number(endMatch[1]);
      const duration = Number(endMatch[2]);
      events.push({
        start: current?.start ?? Math.max(0, end - duration),
        end,
        duration,
      });
      current = null;
    }
  }
  return events;
}

function runSilenceScan(source, editDir, args) {
  const scanDir = resolve(editDir, "silence_scan");
  ensureDir(scanDir);
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", source,
    "-vn",
    "-af", `silencedetect=noise=${args.silenceNoise}:d=${args.silenceMinSec}`,
    "-f", "null",
    "-",
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg silencedetect failed for ${source}\n${(result.stderr || "").slice(-4000)}`);
  }

  const raw = result.stderr || "";
  const events = parseSilenceDetect(raw);
  const name = stem(source);
  writeFileSync(resolve(scanDir, `${name}.txt`), raw);
  writeFileSync(resolve(scanDir, `${name}.json`), JSON.stringify({
    source,
    noise: args.silenceNoise,
    min_duration: args.silenceMinSec,
    events,
  }, null, 2));
  return events;
}

function wordEntries(data) {
  return (data.words || [])
    .filter((w) => w.type === "word" && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({
      start: Number(w.start),
      end: Number(w.end),
      text: String(w.text || "").trim(),
      speaker_id: w.speaker_id || "",
    }))
    .filter((w) => w.text);
}

function groupPhrases(words, threshold = 0.5) {
  const phrases = [];
  let current = [];

  function flush() {
    if (!current.length) return;
    const text = current.map((w) => w.text).join(" ")
      .replace(/\s+([,.?!:;])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    phrases.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text,
      speaker_id: current[0].speaker_id || "",
    });
    current = [];
  }

  for (const word of words) {
    const prev = current[current.length - 1];
    if (prev && (word.start - prev.end >= threshold || (word.speaker_id && prev.speaker_id && word.speaker_id !== prev.speaker_id))) {
      flush();
    }
    current.push(word);
  }
  flush();
  return phrases;
}

function loadTranscriptAudits(editDir, inspectThreshold) {
  const files = listTranscriptFiles(editDir);

  const gaps = [];
  const phrases = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const sourceName = stem(file);
    const words = wordEntries(data);
    for (let i = 1; i < words.length; i += 1) {
      const prev = words[i - 1];
      const next = words[i];
      const gap = next.start - prev.end;
      if (gap >= inspectThreshold) {
        gaps.push({
          source: sourceName,
          start: prev.end,
          end: next.start,
          duration: gap,
          before: prev.text,
          after: next.text,
        });
      }
    }
    for (const phrase of groupPhrases(words, 0.5)) {
      phrases.push({ source: sourceName, ...phrase });
    }
  }

  return { gaps, phrases };
}

function listTranscriptFiles(editDir) {
  const transcriptsDir = resolve(editDir, "transcripts");
  if (!existsSync(transcriptsDir)) return [];
  return run("find", [transcriptsDir, "-maxdepth", "1", "-type", "f", "-name", "*.json"]).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function findSimilarPhraseClusters(phrases, windowSec) {
  const candidates = phrases.map((phrase, index) => ({
    ...phrase,
    index,
    tokens: contentTokens(phrase.text),
  })).filter((phrase) => phrase.tokens.length >= 3);

  const used = new Set();
  const clusters = [];

  for (let i = 0; i < candidates.length; i += 1) {
    if (used.has(candidates[i].index)) continue;
    const group = [candidates[i]];
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (used.has(candidates[j].index)) continue;
      if (candidates[i].source !== candidates[j].source) continue;
      if (Math.abs(candidates[j].start - candidates[i].start) > windowSec) continue;
      const score = jaccard(candidates[i].tokens, candidates[j].tokens);
      if (score >= 0.42) {
        group.push({ ...candidates[j], score });
      }
    }
    if (group.length >= 2) {
      group.forEach((item) => used.add(item.index));
      clusters.push(group);
    }
  }

  return clusters;
}

function renderPreScan({ args, gaps, phrases, clusters, silenceBySource }) {
  const modeThreshold = args.mode === "tight_reel" ? 0.25 : 0.45;
  const keepReasonThreshold = args.mode === "tight_reel" ? 0.35 : 0.65;
  const lines = [
    "# Talking Head Pre-Scan",
    "",
    `- Cut mode: ${args.mode}`,
    `- Maximum duration: ${args.maxDuration}`,
    `- Inspect speech gaps over: ${modeThreshold.toFixed(2)}s`,
    `- Kept gaps needing QC reason over: ${keepReasonThreshold.toFixed(2)}s`,
    "",
    "## Transcript Speech Gaps",
    "",
  ];

  const relevantGaps = gaps.filter((gap) => gap.duration >= modeThreshold);
  if (!relevantGaps.length) {
    lines.push("No transcript word gaps above the mode threshold were found.");
  } else {
    for (const gap of relevantGaps.slice(0, 200)) {
      lines.push(`- ${gap.source} ${formatTime(gap.start)}-${formatTime(gap.end)} (${gap.duration.toFixed(2)}s): "${gap.before}" -> "${gap.after}"`);
    }
    if (relevantGaps.length > 200) lines.push(`- ${relevantGaps.length - 200} more gaps omitted from this summary.`);
  }

  lines.push("", "## Audio Silence Events", "");
  for (const [source, events] of Object.entries(silenceBySource)) {
    lines.push(`### ${basename(source)}`);
    const relevant = events.filter((event) => event.duration >= modeThreshold);
    if (!relevant.length) {
      lines.push("");
      lines.push("No audio silence events above the mode threshold were found.");
      lines.push("");
      continue;
    }
    lines.push("");
    for (const event of relevant.slice(0, 120)) {
      lines.push(`- ${formatTime(event.start)}-${formatTime(event.end)} (${event.duration.toFixed(2)}s)`);
    }
    if (relevant.length > 120) lines.push(`- ${relevant.length - 120} more silence events omitted from this summary.`);
    lines.push("");
  }

  lines.push("## Similar Phrase Candidates", "");
  lines.push("These are heuristic candidates only. The LLM/editor must decide whether they are truly the same idea.");
  lines.push("Default editorial prior: when repeated attempts express the same idea, inspect the latest attempt first, because it is often the improved take.");
  lines.push("");

  if (!clusters.length) {
    lines.push("No similar phrase candidates were found by lexical heuristic.");
  } else {
    clusters.slice(0, 80).forEach((cluster, idx) => {
      const latest = cluster.reduce((best, item) => (item.start > best.start ? item : best), cluster[0]);
      lines.push(`### Candidate ${idx + 1}`);
      lines.push("");
      for (const item of cluster) {
        const suffix = item === latest ? " [inspect first: latest attempt]" : "";
        lines.push(`- ${item.source} ${formatTime(item.start)}-${formatTime(item.end)}${suffix}: ${item.text}`);
      }
      lines.push("");
    });
    if (clusters.length > 80) lines.push(`${clusters.length - 80} more candidates omitted from this summary.`);
  }

  lines.push("", "## Phrase Count", "");
  lines.push(`- ${phrases.length} transcript phrases available for editorial review.`);
  lines.push("");
  return lines.join("\n");
}

function renderLlmBrief({ args, editDir, sources, gaps, clusters }) {
  const inspectThreshold = args.mode === "tight_reel" ? "250ms" : "450ms";
  const qcThreshold = args.mode === "tight_reel" ? "350ms" : "650ms";
  const lines = [
    "# LLM Editor Brief",
    "",
    "You are the semantic editor for a talking-head cleanup pass.",
    "",
    "## Inputs To Read",
    "",
    "- `source_inventory.md`",
    "- `takes_packed.md`",
    "- `pre_scan.md`",
    "- `silence_scan/*.json` when checking exact audio silence spans",
    "",
    "## Editing Contract",
    "",
    `- Cut mode: ${args.mode}`,
    `- Maximum duration: ${args.maxDuration}`,
    `- Content goal: ${args.contentGoal || "(not provided)"}`,
    "- Editor: Codex internal reasoning from the generated packet.",
    `- Inspect every speech gap over ${inspectThreshold}.`,
    `- Any kept gap over ${qcThreshold} needs a written reason in editor_qc.md.`,
    "- Prefer word-boundary cuts with 30-200ms padding.",
    "- Do not preserve a sentence only because the transcript reads cleanly; listen/check timing for internal pauses.",
    "- When several nearby attempts express the same idea with different wording, inspect the latest attempt first.",
    "- The latest attempt is a prior, not a rule: keep an earlier attempt if it is clearer, more accurate, or better performed.",
    "- Remove repeated setup lines, false starts, abandoned thoughts, and correction takes.",
    "- Preserve the minimum context needed for pronouns, claims, examples, and transitions to make sense.",
    "",
    "## Required Human/LLM Passes",
    "",
    "1. Read `takes_packed.md` and `pre_scan.md`.",
    "2. Build `edl_v1.json` from the best sequence of takes.",
    "3. Render and review the preview.",
    "4. Run the mandatory second pass: logic breaks, repeated ideas, hidden pauses, clipped words.",
    "5. Write `edl_final.json` and `editor_qc.md`.",
    "",
    "## EDL Shape",
    "",
    "Use this JSON shape so `tools/video-use/helpers/render.py` can render it:",
    "",
    "```json",
    JSON.stringify({
      sources: Object.fromEntries(sources.map((source) => [stem(source), source])),
      grade: "",
      ranges: [
        {
          source: stem(sources[0] || "source"),
          start: 0.0,
          end: 1.0,
          beat: "why this range is kept",
        },
      ],
    }, null, 2),
    "```",
    "",
    "## Programmatic Findings To Treat As Required Checks",
    "",
    `- Transcript gaps above mode threshold: ${gaps.length}`,
    `- Similar phrase candidate clusters: ${clusters.length}`,
    "",
    "The final answer from the editor must explain where the hard maximum duration was satisfied or why a tradeoff is required.",
    "",
    `Output folder: ${editDir}`,
    "",
  ];
  return lines.join("\n");
}

function maybeWriteBriefTemplate(editDir, args, sources) {
  const briefPath = resolve(editDir, "TALKING_HEAD_CLEANUP_BRIEF.md");
  if (existsSync(briefPath)) return;
  const lines = [
    "# Talking Head Cleanup Brief",
    "",
    "## Required Before Editing",
    "",
    `- Raw recording: ${sources.join(", ")}`,
    `- Approved script or content goal: ${args.contentGoal || ""}`,
    `- Maximum duration: ${args.maxDuration}`,
    `- Cut mode: ${args.mode}`,
    "- Must keep:",
    "- Must remove:",
    "- Approved by:",
    `- Approved date: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
  writeFileSync(briefPath, lines.join("\n"));
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv);
  if (!args.sources.length) {
    throw new Error(`Missing --source.\n\n${usage()}`);
  }
  if (!["tight_reel", "natural_explainer"].includes(args.mode)) {
    throw new Error("--mode must be tight_reel or natural_explainer");
  }
  if (args.transcripts.length) {
    args.transcriber = "external";
  }
  args.transcriber = normalizeTranscriber(args.transcriber);
  args.transcribeModel = args.transcribeModel || defaultTranscribeModel(args.transcriber);
  if (!args.editDir && !args.runRoot) {
    throw new Error(`Missing --run-root or --edit-dir.\n\n${usage()}`);
  }

  const sources = args.sources.map((source) => resolve(source));
  for (const source of sources) {
    if (!existsSync(source)) throw new Error(`Source not found: ${source}`);
  }
  if (args.transcripts.length && args.transcripts.length !== sources.length) {
    throw new Error(`Expected one --transcript per --source. Got ${args.transcripts.length} transcript(s) for ${sources.length} source(s).`);
  }

  const runRoot = args.runRoot ? resolve(args.runRoot) : dirname(resolve(args.editDir));
  const editDir = resolve(args.editDir || resolve(runRoot, "presenter_edit"));
  const videoUseDir = resolve(args.videoUseDir);
  const helpersDir = resolve(videoUseDir, "helpers");
  const python = process.env.PYTHON || "python3";

  ensureDir(editDir);
  ensureDir(resolve(editDir, "transcripts"));
  ensureDir(resolve(editDir, "silence_scan"));
  ensureDir(resolve(editDir, "verify"));
  maybeWriteBriefTemplate(editDir, args, sources);

  const probeBySource = {};
  for (const source of sources) {
    probeBySource[source] = parseFfprobe(source);
  }
  writeFileSync(resolve(editDir, "source_inventory.md"), renderInventory(sources, probeBySource));

  const silenceBySource = {};
  if (!args.skipSilence) {
    for (const source of sources) {
      silenceBySource[source] = runSilenceScan(source, editDir, args);
    }
  }

  if (!args.skipTranscribe) {
    console.log(`Transcriber: ${args.transcriber} (${args.transcribeModel})`);
    for (const [index, source] of sources.entries()) {
      await transcribeSource({
        provider: args.transcriber,
        source,
        editDir,
        language: args.language,
        numSpeakers: args.numSpeakers,
        model: args.transcribeModel,
        force: args.forceTranscribe,
        python,
        helpersDir,
        externalTranscript: args.transcripts[index] || "",
      });
    }
  }

  const packPy = resolve(helpersDir, "pack_transcripts.py");
  const transcriptFiles = listTranscriptFiles(editDir);
  if (existsSync(packPy) && transcriptFiles.length) {
    run(python, [packPy, "--edit-dir", editDir, "--silence-threshold", "0.5"], { stdio: "inherit" });
  } else if (!transcriptFiles.length) {
    console.warn("No transcript JSON files found; skipping takes_packed.md generation.");
  }

  const inspectThreshold = args.mode === "tight_reel" ? 0.25 : 0.45;
  const { gaps, phrases } = loadTranscriptAudits(editDir, inspectThreshold);
  const clusters = findSimilarPhraseClusters(phrases, args.clusterWindowSec);

  writeFileSync(resolve(editDir, "pre_scan.md"), renderPreScan({
    args,
    gaps,
    phrases,
    clusters,
    silenceBySource,
  }));

  writeFileSync(resolve(editDir, "LLM_EDITOR_BRIEF.md"), renderLlmBrief({
    args,
    editDir,
    sources,
    gaps: gaps.filter((gap) => gap.duration >= inspectThreshold),
    clusters,
  }));

  console.log(`Prepared talking-head cleanup packet: ${editDir}`);
  console.log(`Next: read ${resolve(editDir, "LLM_EDITOR_BRIEF.md")} and draft edl_v1.json.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
