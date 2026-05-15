#!/usr/bin/env node
import { resolve } from "node:path";
import { renderEdl, timestampSlug } from "./lib/render-edl.mjs";

function usage() {
  return [
    "Usage:",
    "  npm run reel:talking-head:render-final -- --edit-dir <presenter_edit> --output <final.mp4>",
    "",
    "Options:",
    "  --edit-dir <path>      Folder with edl_final.json.",
    "  --edl <path>           Default: <edit-dir>/edl_final.json.",
    "  --output <path>        Default: timestamped presenter_cut_final_maxres_YYYYMMDD_HHMMSS.mp4.",
    "  --crf <number>         Default: 18.",
    "  --preset <name>        Default: medium.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { crf: "18", preset: "medium" };
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
    else if (name === "crf") args.crf = value;
    else if (name === "preset") args.preset = value;
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);

  const editDir = resolve(args.editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_final.json"));
  const renderId = timestampSlug();
  const outPath = resolve(args.output || resolve(editDir, `presenter_cut_final_maxres_${renderId}.mp4`));
  const result = renderEdl({
    edlPath,
    outPath,
    crf: args.crf,
    preset: args.preset,
    manifestPath: resolve(editDir, "presenter_cut_final_maxres_latest.json"),
  });
  console.log(result.outputPath);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
