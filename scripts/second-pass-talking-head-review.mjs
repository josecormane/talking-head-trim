#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { renderEdl } from "./lib/render-edl.mjs";
import { defaultTranscribeModel, normalizeTranscriber, transcribeSource } from "./lib/transcribers.mjs";
import { loadDotEnv } from "./lib/env.mjs";

function usage() {
  return [
    "Usage:",
    "  npm run talking-head:second-pass -- --edit-dir <presenter_edit>",
    "",
    "Options:",
    "  --edit-dir <path>              Folder with edl_v1.json.",
    "  --edl <path>                   Default: <edit-dir>/edl_v1.json.",
    "  --output <path>                Default: <edit-dir>/presenter_cut_pass1.mp4.",
    "  --transcriber <provider>       Default: VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER or local-whisper.",
    "  --transcribe-model <id>        Default per provider, local-whisper uses medium.",
    "  --transcript <path>            External transcript JSON for the first-pass MP4.",
    "  --language <code>              Passed to transcriber.",
    "  --force-transcribe             Replace pass1 transcript if it already exists.",
    "  --skip-transcribe              Skip pass1 transcription.",
    "  --skip-silence                 Skip pass1 silence scan.",
    "  --silence-noise <value>        Default: -35dB.",
    "  --silence-min-sec <seconds>    Default: 0.2.",
    "  --crf <number>                 Default: 18.",
    "  --preset <name>                Default: medium.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    crf: "18",
    preset: "medium",
    transcriber: process.env.VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER || "local-whisper",
    transcribeModel: "",
    language: "",
    forceTranscribe: false,
    skipTranscribe: false,
    skipSilence: false,
    silenceNoise: "-35dB",
    silenceMinSec: 0.2,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    if (name === "edit-dir") args.editDir = value;
    else if (name === "edl") args.edl = value;
    else if (name === "output") args.output = value;
    else if (name === "transcriber") args.transcriber = value;
    else if (name === "transcribe-model") args.transcribeModel = value;
    else if (name === "transcript") args.transcript = value;
    else if (name === "language") args.language = value;
    else if (name === "force-transcribe") args.forceTranscribe = true;
    else if (name === "skip-transcribe") args.skipTranscribe = true;
    else if (name === "skip-silence") args.skipSilence = true;
    else if (name === "silence-noise") args.silenceNoise = value;
    else if (name === "silence-min-sec") args.silenceMinSec = Number(value);
    else if (name === "crf") args.crf = value;
    else if (name === "preset") args.preset = value;
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

function runSilenceScan(videoPath, outputPath, args) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", videoPath,
    "-vn",
    "-af", `silencedetect=noise=${args.silenceNoise}:d=${args.silenceMinSec}`,
    "-f", "null",
    "-",
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg silencedetect failed for ${videoPath}\n${(result.stderr || "").slice(-4000)}`);
  }
  const raw = result.stderr || "";
  const events = parseSilenceDetect(raw);
  writeFileSync(outputPath.replace(/\.json$/, ".txt"), raw);
  writeFileSync(outputPath, JSON.stringify({
    source: videoPath,
    noise: args.silenceNoise,
    min_duration: args.silenceMinSec,
    events,
  }, null, 2) + "\n");
  return events;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function transcriptWords(transcript) {
  return (transcript.words || [])
    .filter((word) => word.type === "word" && Number.isFinite(Number(word.start)) && Number.isFinite(Number(word.end)))
    .map((word) => ({ text: String(word.text || "").trim(), start: Number(word.start), end: Number(word.end) }))
    .filter((word) => word.text);
}

function transcriptGaps(words, threshold = 0.25) {
  const gaps = [];
  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1];
    const current = words[index];
    const duration = current.start - previous.end;
    if (duration >= threshold) {
      gaps.push({
        start: previous.end,
        end: current.start,
        duration,
        before: previous.text,
        after: current.text,
      });
    }
  }
  return gaps;
}

function renderReviewPacket({ args, pass1Video, pass1TranscriptPath, silencePath, silenceEvents, gaps, probePath }) {
  const lines = [
    "# Second Pass Review Packet",
    "",
    "This packet exists only after rendering the first cut MP4 from `edl_v1.json`.",
    "The agent must review the already-assembled cut, not just the original source transcript.",
    "",
    "## Required Inputs",
    "",
    `- First-pass MP4: ${pass1Video}`,
    `- First-pass ffprobe: ${probePath}`,
    `- First-pass transcript: ${pass1TranscriptPath || "(skipped)"}`,
    `- First-pass silence scan: ${silencePath || "(skipped)"}`,
    "- First-pass EDL: `edl_v1.json`",
    "- Original prep: `takes_packed.md`, `pre_scan.md`, `silence_scan/*.json`",
    "",
    "## Agent Task",
    "",
    "1. Watch or inspect the first-pass MP4 as the actual assembled cut.",
    "2. Compare its transcript to the intended flow from the first EDL.",
    "3. Review detected output silences and transcript gaps inside the already-cut video.",
    "4. Hunt specifically for logic breaks, repeated ideas, hidden pauses, clipped words, and cuts that read fine but sound wrong.",
    "5. Write `edl_final.json` and `editor_qc.md`.",
    "6. In `editor_qc.md`, explicitly mention `Second pass review` and summarize what changed or why no changes were needed.",
    "",
    "## First-Pass Output Silence Events",
    "",
  ];
  if (!silenceEvents.length) {
    lines.push("- None detected at the configured threshold.");
  } else {
    for (const event of silenceEvents) {
      lines.push(`- ${formatTime(event.start)}-${formatTime(event.end)} (${event.duration.toFixed(2)}s)`);
    }
  }
  lines.push("", "## First-Pass Transcript Gaps", "");
  if (!gaps.length) {
    lines.push("- None detected above 250ms.");
  } else {
    for (const gap of gaps) {
      lines.push(`- ${formatTime(gap.start)}-${formatTime(gap.end)} (${gap.duration.toFixed(2)}s): "${gap.before}" -> "${gap.after}"`);
    }
  }
  lines.push("", "## Command", "", "```bash");
  lines.push(`npm run talking-head:second-pass -- --edit-dir ${args.editDir}`);
  lines.push("```", "");
  return lines.join("\n");
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);

  const editDir = resolve(args.editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_v1.json"));
  const passDir = resolve(editDir, "second_pass");
  const transcriptEditDir = resolve(passDir, "analysis");
  const pass1Video = resolve(args.output || resolve(editDir, "presenter_cut_pass1.mp4"));
  mkdirSync(passDir, { recursive: true });
  mkdirSync(resolve(transcriptEditDir, "transcripts"), { recursive: true });

  const renderResult = renderEdl({
    edlPath,
    outPath: pass1Video,
    crf: args.crf,
    preset: args.preset,
    manifestPath: resolve(passDir, "presenter_cut_pass1_manifest.json"),
  });

  let silenceEvents = [];
  const silencePath = resolve(passDir, "pass1_silence_scan.json");
  if (!args.skipSilence) {
    silenceEvents = runSilenceScan(pass1Video, silencePath, args);
  }

  let pass1TranscriptPath = "";
  let gaps = [];
  if (!args.skipTranscribe) {
    const provider = normalizeTranscriber(args.transcriber);
    const model = args.transcribeModel || defaultTranscribeModel(provider);
    pass1TranscriptPath = await transcribeSource({
      provider,
      source: pass1Video,
      editDir: transcriptEditDir,
      language: args.language,
      model,
      force: args.forceTranscribe,
      python: process.env.PYTHON || "python3",
      helpersDir: resolve("tools/video-use/helpers"),
      externalTranscript: args.transcript || "",
    });
    const transcript = JSON.parse(readFileSync(pass1TranscriptPath, "utf8"));
    gaps = transcriptGaps(transcriptWords(transcript), 0.25);
  }

  const packetPath = resolve(passDir, "second_pass_review_packet.md");
  writeFileSync(packetPath, renderReviewPacket({
    args,
    pass1Video,
    pass1TranscriptPath,
    silencePath: args.skipSilence ? "" : silencePath,
    silenceEvents,
    gaps,
    probePath: renderResult.probePath,
  }));

  console.log(`Second-pass packet: ${packetPath}`);
  console.log("Next: the agent must review this packet and write edl_final.json plus editor_qc.md.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
