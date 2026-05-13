#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

function run(cmd, args, quiet = false) {
  if (!quiet) console.log(`$ ${cmd} ${args.slice(0, 8).join(" ")}${args.length > 8 ? " ..." : ""}`);
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd}\n${(result.stderr || result.stdout || "").slice(-4000)}`);
  }
  return result;
}

function timestampSlug(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function withoutExt(path) {
  return basename(path, extname(path));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);

  const editDir = resolve(args.editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_final.json"));
  const renderId = timestampSlug();
  const outPath = resolve(args.output || resolve(editDir, `presenter_cut_final_maxres_${renderId}.mp4`));
  if (!existsSync(edlPath)) throw new Error(`EDL not found: ${edlPath}`);
  const edl = JSON.parse(readFileSync(edlPath, "utf8"));

  const outputStem = withoutExt(outPath);
  const clipsDir = resolve(dirname(outPath), `${outputStem}_clips`);
  mkdirSync(clipsDir, { recursive: true });

  const clips = [];
  for (const [index, range] of edl.ranges.entries()) {
    const sourcePath = edl.sources?.[range.source];
    if (!sourcePath || !existsSync(sourcePath)) throw new Error(`Source not found for ${range.source}: ${sourcePath}`);
    const start = Number(range.start);
    const end = Number(range.end);
    const duration = end - start;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid range at index ${index}`);
    const clipPath = resolve(clipsDir, `seg_${String(index).padStart(3, "0")}.mp4`);
    const fadeOutStart = Math.max(0, duration - 0.03);
    run("ffmpeg", [
      "-y",
      "-ss", start.toFixed(3),
      "-i", sourcePath,
      "-t", duration.toFixed(3),
      "-vf", "format=yuv420p,setsar=1",
      "-af", `afade=t=in:st=0:d=0.03,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.03`,
      "-c:v", "libx264",
      "-preset", args.preset,
      "-crf", String(args.crf),
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      clipPath,
    ], true);
    clips.push(clipPath);
    console.log(`[${index + 1}/${edl.ranges.length}] ${range.beat || range.source} ${duration.toFixed(2)}s`);
  }

  const concatPath = resolve(dirname(outPath), `${outputStem}_concat.txt`);
  writeFileSync(concatPath, clips.map((clip) => `file '${clip}'`).join("\n") + "\n");
  run("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outPath,
  ]);

  const probe = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate",
    "-of", "json",
    outPath,
  ], true);
  const probePath = resolve(dirname(outPath), `${outputStem}.ffprobe.json`);
  writeFileSync(probePath, probe.stdout);
  writeFileSync(resolve(editDir, "presenter_cut_final_maxres_latest.json"), JSON.stringify({
    output_path: outPath,
    probe_path: probePath,
    clips_dir: clipsDir,
    concat_path: concatPath,
    rendered_at: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log(outPath);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
