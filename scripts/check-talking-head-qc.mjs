#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function usage() {
  return [
    "Usage:",
    "  npm run talking-head:qc -- --edit-dir <presenter_edit>",
    "",
    "Checks:",
    "  - edl_v1.json exists and has ranges",
    "  - presenter_cut_pass1.mp4 exists",
    "  - second_pass/second_pass_review_packet.md exists",
    "  - second_pass/pass1_silence_scan.json exists",
    "  - second_pass/analysis/transcripts/presenter_cut_pass1.json exists",
    "  - edl_final.json exists and has ranges",
    "  - editor_qc.md exists",
    "  - editor_qc.md explicitly documents the mandatory second pass",
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
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${path} is not valid JSON: ${error.message}`);
    return null;
  }
}

function hasRanges(edl) {
  return edl && Array.isArray(edl.ranges) && edl.ranges.length > 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);

  const editDir = resolve(args.editDir);
  const errors = [];
  const edlV1Path = resolve(editDir, "edl_v1.json");
  const edlFinalPath = resolve(editDir, "edl_final.json");
  const qcPath = resolve(editDir, "editor_qc.md");
  const pass1VideoPath = resolve(editDir, "presenter_cut_pass1.mp4");
  const secondPassPacketPath = resolve(editDir, "second_pass", "second_pass_review_packet.md");
  const pass1SilencePath = resolve(editDir, "second_pass", "pass1_silence_scan.json");
  const pass1TranscriptPath = resolve(editDir, "second_pass", "analysis", "transcripts", "presenter_cut_pass1.json");

  if (!existsSync(edlV1Path)) errors.push(`Missing first-pass EDL: ${edlV1Path}`);
  if (!existsSync(pass1VideoPath)) errors.push(`Missing first-pass rendered MP4: ${pass1VideoPath}`);
  if (!existsSync(secondPassPacketPath)) errors.push(`Missing second-pass review packet: ${secondPassPacketPath}`);
  if (!existsSync(pass1SilencePath)) errors.push(`Missing first-pass silence scan: ${pass1SilencePath}`);
  if (!existsSync(pass1TranscriptPath)) errors.push(`Missing first-pass transcript: ${pass1TranscriptPath}`);
  if (!existsSync(edlFinalPath)) errors.push(`Missing final EDL after second pass: ${edlFinalPath}`);
  if (!existsSync(qcPath)) errors.push(`Missing editor QC: ${qcPath}`);

  if (existsSync(edlV1Path) && !hasRanges(readJson(edlV1Path, errors))) {
    errors.push("edl_v1.json must contain at least one range.");
  }
  if (existsSync(edlFinalPath) && !hasRanges(readJson(edlFinalPath, errors))) {
    errors.push("edl_final.json must contain at least one range.");
  }
  if (existsSync(pass1SilencePath)) {
    const silence = readJson(pass1SilencePath, errors);
    if (silence && !Array.isArray(silence.events)) errors.push("pass1_silence_scan.json must contain an events array.");
  }
  if (existsSync(pass1TranscriptPath)) {
    const transcript = readJson(pass1TranscriptPath, errors);
    if (transcript && !Array.isArray(transcript.words)) errors.push("presenter_cut_pass1 transcript must contain a words array.");
  }
  if (existsSync(qcPath)) {
    const qc = readFileSync(qcPath, "utf8");
    if (!/(second[- ]pass|second pass review|segunda revisi[oó]n|segunda pasada)/i.test(qc)) {
      errors.push("editor_qc.md must explicitly mention that the mandatory second pass/segunda revisión was run.");
    }
  }

  if (errors.length) {
    console.error(["Talking Head QC gate failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
    process.exit(1);
  }

  console.log(`Talking Head QC gate passed: ${editDir}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
