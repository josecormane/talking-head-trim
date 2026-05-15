#!/usr/bin/env node
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { renderEdl, timestampSlug } from "./lib/render-edl.mjs";

function usage() {
  return [
    "Usage:",
    "  npm run talking-head:render-review -- --edit-dir <presenter_edit>",
    "  npm run talking-head:render-final -- --edit-dir <presenter_edit> --output <final.mp4>",
    "",
    "Options:",
    "  --edit-dir <path>      Folder with edl_final.json or edl_adjusted.json.",
    "  --edl <path>           Default: <edit-dir>/edl_final.json.",
    "  --stage review|final   Default: final, or review when using render-review. Review renders await user approval.",
    "  --output <path>        Default: timestamped presenter_cut_<stage>_maxres_YYYYMMDD_HHMMSS.mp4.",
    "  --crf <number>         Default: 18.",
    "  --preset <name>        Default: medium.",
  ].join("\n");
}

function parseArgs(argv) {
  const invokedAsReview = String(argv[1] || "").includes("render-review");
  const args = { crf: "18", preset: "medium", stage: invokedAsReview ? "review" : "final" };
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
    else if (name === "stage") args.stage = value;
    else if (name === "crf") args.crf = value;
    else if (name === "preset") args.preset = value;
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function ensureFinalReviewGate(editDir) {
  const required = [
    {
      path: resolve(editDir, "review_script.md"),
      label: "readable review script",
      fix: "npm run talking-head:review-script -- --edit-dir <edit_dir>",
    },
    {
      path: resolve(editDir, "presenter_cut_review_maxres_latest.json"),
      label: "review render manifest",
      fix: "npm run talking-head:render-review -- --edit-dir <edit_dir>",
    },
    {
      path: resolve(editDir, "trim_ui", "handoff.json"),
      label: "trim UI handoff",
      fix: "npm run talking-head:trim-ui -- --edit-dir <edit_dir> --port 4377",
    },
  ];
  const missing = required.filter((item) => !existsSync(item.path));
  if (!missing.length) return;
  throw new Error([
    "Cannot render final before review handoff.",
    "The workflow must first give the user a review MP4, readable script, and editable trim UI.",
    "",
    "Missing:",
    ...missing.map((item) => `- ${item.label}: ${item.path}`),
    "",
    "Run:",
    ...missing.map((item) => `- ${item.fix}`),
  ].join("\n"));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);
  if (!["review", "final"].includes(args.stage)) {
    throw new Error("--stage must be either review or final.");
  }

  const editDir = resolve(args.editDir);
  if (args.stage === "final") ensureFinalReviewGate(editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_final.json"));
  const renderId = timestampSlug();
  const prefix = args.stage === "review" ? "presenter_cut_review_maxres" : "presenter_cut_final_maxres";
  const outPath = resolve(args.output || resolve(editDir, `${prefix}_${renderId}.mp4`));
  const result = renderEdl({
    edlPath,
    outPath,
    crf: args.crf,
    preset: args.preset,
    manifestPath: resolve(editDir, `${prefix}_latest.json`),
  });
  console.log(result.outputPath);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
