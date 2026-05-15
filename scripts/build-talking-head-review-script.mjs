#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function usage() {
  return [
    "Usage:",
    "  npm run talking-head:review-script -- --edit-dir <presenter_edit>",
    "",
    "Options:",
    "  --edit-dir <path>      Folder with edl_final.json and transcripts/.",
    "  --edl <path>           Default: <edit-dir>/edl_final.json.",
    "  --output <path>        Default: <edit-dir>/review_script.md.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
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
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stem(path) {
  return basename(path).replace(/\.[^.]+$/, "");
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function transcriptWords(transcript) {
  return (transcript.words || [])
    .filter((word) => word.type !== "spacing" && Number.isFinite(Number(word.start)) && Number.isFinite(Number(word.end)))
    .map((word) => ({
      text: String(word.text || word.word || "").trim(),
      start: Number(word.start),
      end: Number(word.end),
    }))
    .filter((word) => word.text);
}

function wordsInRange(words, start, end) {
  const left = Number(start);
  const right = Number(end);
  return words.filter((word) => word.end > left && word.start < right);
}

function normalizeToken(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, "")
    .trim();
}

function phraseText(words) {
  return words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
}

function repeatedWordFlags(segments) {
  const flags = [];
  for (const segment of segments) {
    const words = segment.words;
    for (let index = 1; index < words.length; index += 1) {
      const previous = normalizeToken(words[index - 1].text);
      const current = normalizeToken(words[index].text);
      if (previous && current && previous === current) {
        flags.push({
          output: `${formatTime(segment.outputStart + words[index - 1].start - segment.sourceStart)}-${formatTime(segment.outputStart + words[index].end - segment.sourceStart)}`,
          source: `${formatTime(words[index - 1].start)}-${formatTime(words[index].end)}`,
          text: `${words[index - 1].text} ${words[index].text}`,
          segment: segment.index,
        });
      }
    }
  }
  return flags;
}

function repeatedPhraseFlags(segments) {
  const seen = new Map();
  const flags = [];
  for (const segment of segments) {
    const tokens = segment.words.map((word) => normalizeToken(word.text)).filter(Boolean);
    for (let size = 4; size >= 3; size -= 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const phrase = tokens.slice(index, index + size).join(" ");
        if (phrase.length < 12) continue;
        const previous = seen.get(phrase);
        const key = `${segment.index}:${index}:${size}`;
        if (previous && previous.segment !== segment.index) {
          flags.push({
            phrase,
            first: `segment ${previous.segment}`,
            again: `segment ${segment.index}`,
          });
        } else if (!previous) {
          seen.set(phrase, { segment: segment.index, key });
        }
      }
    }
  }
  return flags.slice(0, 20);
}

function transcriptPathForSource(editDir, sourcePath) {
  return resolve(editDir, "transcripts", `${stem(sourcePath)}.json`);
}

function buildReviewScript({ editDir, edlPath }) {
  const edl = readJson(edlPath);
  if (!Array.isArray(edl.ranges) || !edl.ranges.length) {
    throw new Error(`EDL has no ranges: ${edlPath}`);
  }

  const transcripts = new Map();
  for (const sourcePath of Object.values(edl.sources || {})) {
    const transcriptPath = transcriptPathForSource(editDir, sourcePath);
    if (!existsSync(transcriptPath)) {
      throw new Error(`Missing source transcript for review script: ${transcriptPath}`);
    }
    transcripts.set(sourcePath, transcriptWords(readJson(transcriptPath)));
  }

  let cursor = 0;
  const segments = edl.ranges.map((range, index) => {
    const sourcePath = edl.sources?.[range.source];
    if (!sourcePath) throw new Error(`Missing source for range ${index}: ${range.source}`);
    const sourceWords = transcripts.get(sourcePath) || [];
    const start = Number(range.start);
    const end = Number(range.end);
    const duration = Math.max(0, end - start);
    const outputStart = cursor;
    const outputEnd = outputStart + duration;
    cursor = outputEnd;
    return {
      index: index + 1,
      beat: range.beat || range.id || `segment_${index + 1}`,
      source: range.source,
      sourcePath,
      sourceStart: start,
      sourceEnd: end,
      outputStart,
      outputEnd,
      words: wordsInRange(sourceWords, start, end),
    };
  });

  const duplicateWords = repeatedWordFlags(segments);
  const duplicatePhrases = repeatedPhraseFlags(segments);
  const lines = [
    "# Review Script",
    "",
    "This is the readable script reconstructed from the current review EDL. The agent and user should read it before accepting the cut.",
    "",
    "## Summary",
    "",
    `- EDL: ${edlPath}`,
    `- Segments: ${segments.length}`,
    `- Output duration: ${formatTime(cursor)} (${cursor.toFixed(2)}s)`,
    "",
    "## Possible Repetition Flags",
    "",
  ];

  if (!duplicateWords.length && !duplicatePhrases.length) {
    lines.push("- No adjacent duplicate words or repeated short phrases detected by the deterministic text check.");
  } else {
    for (const flag of duplicateWords) {
      lines.push(`- Adjacent duplicate in segment ${flag.segment}: "${flag.text}" at output ${flag.output}, source ${flag.source}.`);
    }
    for (const flag of duplicatePhrases) {
      lines.push(`- Repeated phrase candidate "${flag.phrase}" appears in ${flag.first} and ${flag.again}.`);
    }
  }

  lines.push("", "## Final Script With Output Times", "");
  for (const segment of segments) {
    lines.push(`### ${String(segment.index).padStart(2, "0")} ${segment.beat}`);
    lines.push("");
    lines.push(`- Output: ${formatTime(segment.outputStart)}-${formatTime(segment.outputEnd)}`);
    lines.push(`- Source: ${segment.source} ${formatTime(segment.sourceStart)}-${formatTime(segment.sourceEnd)}`);
    lines.push("");
    lines.push(phraseText(segment.words) || "(No transcript words found inside this EDL range.)");
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);
  const editDir = resolve(args.editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_final.json"));
  const outputPath = resolve(args.output || resolve(editDir, "review_script.md"));
  writeFileSync(outputPath, `${buildReviewScript({ editDir, edlPath })}\n`);
  console.log(outputPath);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
