import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function run(cmd, args, quiet = false) {
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

export function timestampSlug(date = new Date()) {
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

export function renderEdl({
  edlPath,
  outPath,
  crf = "18",
  preset = "medium",
  manifestPath = "",
  quiet = false,
}) {
  const absoluteEdlPath = resolve(edlPath);
  const absoluteOutPath = resolve(outPath);
  if (!existsSync(absoluteEdlPath)) throw new Error(`EDL not found: ${absoluteEdlPath}`);
  const edl = JSON.parse(readFileSync(absoluteEdlPath, "utf8"));

  const outputStem = withoutExt(absoluteOutPath);
  const clipsDir = resolve(dirname(absoluteOutPath), `${outputStem}_clips`);
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
      "-preset", preset,
      "-crf", String(crf),
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      clipPath,
    ], true);
    clips.push(clipPath);
    if (!quiet) console.log(`[${index + 1}/${edl.ranges.length}] ${range.beat || range.source} ${duration.toFixed(2)}s`);
  }

  const concatPath = resolve(dirname(absoluteOutPath), `${outputStem}_concat.txt`);
  writeFileSync(concatPath, clips.map((clip) => `file '${clip}'`).join("\n") + "\n");
  run("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-c", "copy",
    "-movflags", "+faststart",
    absoluteOutPath,
  ], quiet);

  const probe = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate",
    "-of", "json",
    absoluteOutPath,
  ], true);
  const probePath = resolve(dirname(absoluteOutPath), `${outputStem}.ffprobe.json`);
  writeFileSync(probePath, probe.stdout);
  if (manifestPath) {
    writeFileSync(resolve(manifestPath), JSON.stringify({
      output_path: absoluteOutPath,
      probe_path: probePath,
      clips_dir: clipsDir,
      concat_path: concatPath,
      rendered_at: new Date().toISOString(),
    }, null, 2) + "\n");
  }
  return {
    outputPath: absoluteOutPath,
    probePath,
    clipsDir,
    concatPath,
    edl,
  };
}
