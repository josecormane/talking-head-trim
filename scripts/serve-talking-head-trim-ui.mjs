#!/usr/bin/env node
import { createServer } from "node:http";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cssStyles } from "./trim-ui-parts/styles.css.js";
import { htmlMarkup } from "./trim-ui-parts/markup.html.js";
import { scriptCore } from "./trim-ui-parts/script-core.js";
import { scriptRender } from "./trim-ui-parts/script-render.js";
import { scriptEvents } from "./trim-ui-parts/script-events.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");

function usage() {
  return [
    "Usage:",
    "  npm run reel:talking-head:trim-ui -- --edit-dir <presenter_edit> [--port 4377]",
    "",
    "Options:",
    "  --edit-dir <path>       Folder with edl_final.json and transcripts/.",
    "  --edl <path>            Initial EDL. Default: edl_adjusted.json if present, else edl_final.json.",
    "  --source-name <name>    Default: first source key in EDL.",
    "  --host <host>           Default: 127.0.0.1.",
    "  --port <number>         Default: 4377.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { host: "127.0.0.1", port: 4377 };
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
    else if (name === "source-name") args.sourceName = value;
    else if (name === "host") args.host = value;
    else if (name === "port") args.port = Number(value);
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function roundTime(value) {
  return Math.round(Number(value) * 1000) / 1000;
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

function isPathInside(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + sep);
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!:;])/g, "$1")
    .trim();
}

function mimeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, text, status = 200, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function collectBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024 * 8) {
        rejectBody(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

function streamFile(req, res, path) {
  if (!existsSync(path)) {
    sendJson(res, { error: `File not found: ${path}` }, 404);
    return;
  }

  const stat = statSync(path);
  const range = req.headers.range;
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type": mimeFor(path),
  };

  if (req.method === "HEAD") {
    res.writeHead(200, { ...headers, "content-length": stat.size });
    res.end();
    return;
  }

  if (!range) {
    res.writeHead(200, { ...headers, "content-length": stat.size });
    createReadStream(path).pipe(res);
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start >= stat.size || end >= stat.size || start > end) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    ...headers,
    "content-range": `bytes ${start}-${end}/${stat.size}`,
    "content-length": end - start + 1,
  });
  createReadStream(path, { start, end }).pipe(res);
}

function runCommand(cmd, cmdArgs, cwd = PROJECT_ROOT) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, cmdArgs, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(`Command failed: ${cmd} ${cmdArgs.join(" ")}\n${stderr || stdout}`);
        error.stdout = stdout;
        error.stderr = stderr;
        rejectRun(error);
      } else {
        resolveRun({ stdout, stderr });
      }
    });
  });
}

const renderJobs = new Map();
let activeRenderJobId = "";
let renderJobSeq = 0;

function trimJobStore() {
  const jobs = [...renderJobs.values()];
  if (jobs.length <= 8) return;
  jobs
    .filter((job) => job.status !== "running")
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .slice(0, Math.max(0, jobs.length - 8))
    .forEach((job) => renderJobs.delete(job.id));
}

function publicRenderJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    completed_steps: job.completed_steps,
    total_steps: job.total_steps,
    phase: job.phase,
    output_path: job.output_path,
    media_url: job.media_url,
    started_at: job.started_at,
    finished_at: job.finished_at || "",
    error: job.error || "",
    log_tail: job.log_tail.slice(-40),
    result: job.result || null,
  };
}

function runningRenderJob() {
  const job = activeRenderJobId ? renderJobs.get(activeRenderJobId) : null;
  return job && job.status === "running" ? job : null;
}

function appendRenderJobLog(job, text) {
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .forEach((line) => {
      job.log_tail.push(line);
      if (job.log_tail.length > 120) job.log_tail.shift();
    });
}

function setRenderJobProgress(job, completed, total, phase) {
  if (Number.isFinite(total) && total > 0) job.total_steps = total;
  if (Number.isFinite(completed)) job.completed_steps = Math.max(0, completed);
  if (phase) job.phase = phase;
  if (job.total_steps > 0) {
    const ratio = Math.min(1, Math.max(0, job.completed_steps / job.total_steps));
    job.progress = Math.max(1, Math.min(98, Math.round(ratio * 96)));
  }
}

function startRenderJob(options) {
  const job = {
    id: `render_${Date.now()}_${++renderJobSeq}`,
    type: options.type,
    status: "running",
    progress: 1,
    completed_steps: 0,
    total_steps: options.totalSteps || 0,
    phase: options.phase || "Starting",
    output_path: options.outputPath,
    media_url: options.mediaUrl,
    started_at: new Date().toISOString(),
    finished_at: "",
    error: "",
    log_tail: [],
    result: null,
  };
  renderJobs.set(job.id, job);
  activeRenderJobId = job.id;
  trimJobStore();

  const child = spawn(options.cmd, options.args, {
    cwd: options.cwd || PROJECT_ROOT,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  job.pid = child.pid;

  const buffers = { stdout: "", stderr: "" };
  const handleLine = (line, stream) => {
    appendRenderJobLog(job, stream === "stderr" ? `[stderr] ${line}` : line);
    if (options.onLine) options.onLine(job, line, stream);
  };
  const handleChunk = (stream, chunk) => {
    buffers[stream] += chunk.toString();
    const parts = buffers[stream].split(/\r?\n/);
    buffers[stream] = parts.pop() || "";
    parts.forEach((line) => handleLine(line, stream));
  };

  child.stdout.on("data", (chunk) => handleChunk("stdout", chunk));
  child.stderr.on("data", (chunk) => handleChunk("stderr", chunk));
  child.on("error", (error) => {
    job.status = "error";
    job.progress = 0;
    job.error = error.message;
    job.finished_at = new Date().toISOString();
    if (activeRenderJobId === job.id) activeRenderJobId = "";
  });
  child.on("close", (code) => {
    for (const stream of ["stdout", "stderr"]) {
      if (buffers[stream]) handleLine(buffers[stream], stream);
    }
    job.finished_at = new Date().toISOString();
    if (code === 0) {
      job.status = "done";
      job.progress = 100;
      job.completed_steps = job.total_steps || job.completed_steps;
      job.phase = "Complete";
      try {
        job.result = options.onSuccess ? options.onSuccess(job) : null;
      } catch (error) {
        job.result = null;
        appendRenderJobLog(job, `[result] ${error.message}`);
      }
    } else {
      job.status = "error";
      job.error = `Render command exited with code ${code}`;
      job.phase = "Error";
    }
    if (activeRenderJobId === job.id) activeRenderJobId = "";
    trimJobStore();
  });

  return job;
}

function buildOutputOffsets(ranges) {
  let offset = 0;
  return ranges.map((range, index) => {
    const duration = Number(range.end) - Number(range.start);
    const span = {
      index,
      output_start: offset,
      output_end: offset + duration,
    };
    offset += duration;
    return span;
  });
}

function transcriptWords(transcript) {
  return (transcript.words || [])
    .filter((item) => item.type === "word")
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .map((item, index) => ({
      index,
      start: roundTime(item.start),
      end: roundTime(item.end),
      text: cleanText(item.text),
    }))
    .filter((item) => item.text);
}

function sourceDurationFromTranscript(transcript, words) {
  const fromTranscript = Number(transcript.audio_duration_secs);
  if (Number.isFinite(fromTranscript) && fromTranscript > 0) return fromTranscript;
  const lastWord = words.at(-1);
  return lastWord ? lastWord.end : 0;
}

function readSilenceEvents(editDir, sourceName) {
  const silencePath = resolve(editDir, "silence_scan", `${sourceName}.json`);
  if (!existsSync(silencePath)) return [];
  const data = readJson(silencePath);
  return (data.events || [])
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end))
    .map((event) => ({
      start: roundTime(event.start),
      end: roundTime(event.end),
      duration: roundTime(event.duration ?? (event.end - event.start)),
    }));
}

function sourceProxyPath(editDir, sourceName) {
  return resolve(editDir, "trim_ui", `${sourceName}_source_proxy.mp4`);
}

const FINAL_RENDER_RE = /^presenter_cut_final_maxres_(\d{8}_\d{6})(?:_backup)?\.mp4$/;

function safeReadJson(path) {
  try {
    return existsSync(path) ? readJson(path) : null;
  } catch {
    return null;
  }
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

function dateFromRenderSlug(slug) {
  const match = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(slug || "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function probeDurationSeconds(editDir, filename) {
  const probePath = resolve(editDir, filename.replace(/\.mp4$/i, ".ffprobe.json"));
  const probe = safeReadJson(probePath);
  const duration = Number(probe?.format?.duration);
  return Number.isFinite(duration) && duration > 0 ? roundTime(duration) : null;
}

function html() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Talking Head Trim UI</title>
  <style>${cssStyles()}</style>
</head>
<body>
${htmlMarkup()}
  <script>
${scriptCore()}
${scriptRender()}
${scriptEvents()}
  </script>
</body>
</html>`;
}

function createApp(config) {
  const editDir = resolve(config.editDir);
  if (!existsSync(editDir)) throw new Error(`Edit dir not found: ${editDir}`);
  mkdirSync(resolve(editDir, "trim_ui"), { recursive: true });
  const adjustedEdlPath = resolve(editDir, "edl_adjusted.json");
  const finalEdlPath = resolve(editDir, "edl_final.json");

  function activeEdlPath() {
    if (config.edl) return resolve(config.edl);
    return existsSync(adjustedEdlPath) ? adjustedEdlPath : finalEdlPath;
  }

  function projectData() {
    const edlPath = activeEdlPath();
    if (!existsSync(edlPath)) throw new Error(`EDL not found: ${edlPath}`);
    const edl = readJson(edlPath);
    const sourceName = config.sourceName || Object.keys(edl.sources || {})[0];
    if (!sourceName) throw new Error("Could not infer source name from EDL.");
    const sourcePath = resolve(editDir, edl.sources[sourceName]);
    const proxyPath = sourceProxyPath(editDir, sourceName);
    const playbackPath = existsSync(proxyPath) ? proxyPath : sourcePath;
    const transcriptPath = resolve(editDir, "transcripts", `${sourceName}.json`);
    if (!existsSync(sourcePath)) throw new Error(`Source not found: ${sourcePath}`);
    if (!existsSync(transcriptPath)) throw new Error(`Transcript not found: ${transcriptPath}`);
    const transcript = readJson(transcriptPath);
    const words = transcriptWords(transcript);
    const duration = sourceDurationFromTranscript(transcript, words);
    const normalizeRanges = (sourceEdl) => (sourceEdl.ranges || []).map((range, index) => ({
      ...range,
      index,
      start: roundTime(range.start),
      end: roundTime(range.end),
    }));
    const ranges = normalizeRanges(edl);
    const primaryEdl = existsSync(finalEdlPath) ? readJson(finalEdlPath) : edl;
    const primaryRanges = normalizeRanges(primaryEdl);
    const offsets = buildOutputOffsets(ranges);
    return {
      edit_dir: editDir,
      edl_path: edlPath,
      adjusted_edl_path: adjustedEdlPath,
      primary_edl_path: finalEdlPath,
      source_name: sourceName,
      source_path: sourcePath,
      playback_path: playbackPath,
      playback_is_proxy: playbackPath === proxyPath,
      transcript_path: transcriptPath,
      duration: roundTime(duration),
      ranges,
      primary_ranges: primaryRanges,
      output_offsets: offsets,
      output_duration: roundTime(offsets.at(-1)?.output_end || 0),
      words,
      wordStarts: words.map((word) => word.start),
      wordEnds: words.map((word) => word.end),
      silences: readSilenceEvents(editDir, sourceName),
    };
  }

  function validateRanges(project, incomingRanges) {
    if (!Array.isArray(incomingRanges)) throw new Error("ranges must be an array");
    if (!incomingRanges.length) throw new Error("ranges cannot be empty");
    const sorted = incomingRanges
      .map((incoming) => ({ ...incoming }))
      .sort((a, b) => Number(a.start) - Number(b.start));
    return sorted.map((incoming, index) => {
      const previous = sorted[index - 1];
      const next = sorted[index + 1];
      const start = roundTime(incoming.start);
      const end = roundTime(incoming.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Invalid time at range ${index + 1}`);
      if (start < 0 || end > project.duration + 0.25) throw new Error(`Range ${index + 1} is outside source bounds`);
      if (end - start < 0.08) throw new Error(`Range ${index + 1} is shorter than 80ms`);
      if (previous && start < Number(previous.end) - 0.001) throw new Error(`Range ${index + 1} overlaps previous range`);
      if (next && end > Number(next.start) + 0.001) throw new Error(`Range ${index + 1} overlaps next range`);
      const { index: _uiIndex, output_start: _outputStart, output_end: _outputEnd, ...baseRange } = incoming;
      return {
        ...baseRange,
        source: incoming.source || project.source_name,
        start,
        end,
        beat: incoming.beat || `manual_insert_${index + 1}`,
      };
    });
  }

  function finalRendersData() {
    const latestManifestPath = resolve(editDir, "presenter_cut_final_maxres_latest.json");
    const latestManifest = safeReadJson(latestManifestPath);
    const latestOutputPath = latestManifest?.output_path ? resolve(latestManifest.output_path) : "";
    const timestamped = readdirSync(editDir)
      .filter((filename) => FINAL_RENDER_RE.test(filename))
      .filter((filename) => existsSync(resolve(editDir, filename)));
    const filenames = timestamped.length
      ? timestamped
      : ["presenter_cut_final_maxres.mp4"].filter((filename) => existsSync(resolve(editDir, filename)));

    const chronological = filenames
      .map((filename) => {
        const path = resolve(editDir, filename);
        const stat = statSync(path);
        const match = FINAL_RENDER_RE.exec(filename);
        const slug = match?.[1] || "";
        const createdDate = dateFromRenderSlug(slug) || stat.birthtime || stat.mtime;
        const createdMs = createdDate.getTime();
        return {
          filename,
          path,
          created_at: createdDate.toISOString(),
          modified_at: stat.mtime.toISOString(),
          size_bytes: stat.size,
          size_label: formatBytes(stat.size),
          duration: probeDurationSeconds(editDir, filename),
          is_backup: filename.includes("_backup"),
          media_url: "/media/render?path=" + encodeURIComponent(path),
          sort_ms: Number.isFinite(createdMs) ? createdMs : stat.mtime.getTime(),
        };
      })
      .sort((a, b) => a.sort_ms - b.sort_ms || a.filename.localeCompare(b.filename))
      .map((render, index) => ({
        ...render,
        render_number: index + 1,
        title: `Render #${index + 1}${render.is_backup ? " (backup)" : ""}`,
      }));

    const fallbackLatestPath = chronological.at(-1)?.path || "";
    const withLatest = chronological.map((render) => ({
      ...render,
      is_latest: latestOutputPath ? render.path === latestOutputPath : render.path === fallbackLatestPath,
    }));

    return {
      total: withLatest.length,
      latest_path: latestOutputPath || fallbackLatestPath,
      renders: withLatest
        .slice()
        .sort((a, b) => b.sort_ms - a.sort_ms || b.render_number - a.render_number),
    };
  }

  async function handleApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/project") {
      sendJson(res, projectData());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/final-renders") {
      sendJson(res, finalRendersData());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/render-job") {
      const id = url.searchParams.get("id") || activeRenderJobId;
      const job = id ? renderJobs.get(id) : runningRenderJob();
      if (!job) {
        sendJson(res, { error: "Render job not found" }, 404);
        return;
      }
      sendJson(res, { ok: true, job: publicRenderJob(job) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save-edl") {
      const body = JSON.parse(await collectBody(req));
      const project = projectData();
      const baseEdlPath = existsSync(finalEdlPath) ? finalEdlPath : project.edl_path;
      const currentEdl = readJson(baseEdlPath);
      const ranges = validateRanges(project, body.ranges);
      const nextEdl = {
        ...currentEdl,
        version: currentEdl.version || 1,
        ranges,
        trim_ui: {
          source_edl: baseEdlPath,
          saved_at: new Date().toISOString(),
        },
      };
      writeJson(adjustedEdlPath, nextEdl);
      const offsets = buildOutputOffsets(ranges);
      sendJson(res, {
        ok: true,
        edl_path: adjustedEdlPath,
        output_duration: roundTime(offsets.at(-1)?.output_end || 0),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/render-preview") {
      if (!existsSync(adjustedEdlPath)) throw new Error("Save an adjusted EDL before rendering preview.");
      const existingJob = runningRenderJob();
      if (existingJob) {
        sendJson(res, { error: "A render is already running.", job_id: existingJob.id, job: publicRenderJob(existingJob) }, 409);
        return;
      }
      const edl = readJson(adjustedEdlPath);
      const totalSteps = Math.max(1, (edl.ranges || []).length);
      const outPath = resolve(editDir, "presenter_cut_trim_preview.mp4");
      const renderPath = resolve(PROJECT_ROOT, "tools/video-use/helpers/render.py");
      const job = startRenderJob({
        type: "preview",
        outputPath: outPath,
        mediaUrl: "/media/preview",
        totalSteps,
        phase: `Rendering preview 0/${totalSteps}`,
        cmd: "python3",
        args: [
          "-u",
          renderPath,
          adjustedEdlPath,
          "-o",
          outPath,
          "--draft",
          "--no-subtitles",
          "--no-loudnorm",
        ],
        onLine: (activeJob, line) => {
          const segmentMatch = /^\s+\[(\d+)\]\s+/.exec(line);
          if (segmentMatch) {
            const completed = Number(segmentMatch[1]) + 1;
            setRenderJobProgress(activeJob, completed, totalSteps, `Rendering preview ${completed}/${totalSteps}`);
          } else if (/concatenating|concat/i.test(line)) {
            activeJob.progress = Math.max(activeJob.progress, 98);
            activeJob.phase = "Finalizing preview";
          }
        },
        onSuccess: () => ({
          output_path: outPath,
          media_url: "/media/preview",
        }),
      });
      sendJson(res, { ok: true, job_id: job.id, job: publicRenderJob(job) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/render-final") {
      if (!existsSync(adjustedEdlPath)) throw new Error("Save an adjusted EDL before rendering final.");
      const existingJob = runningRenderJob();
      if (existingJob) {
        sendJson(res, { error: "A render is already running.", job_id: existingJob.id, job: publicRenderJob(existingJob) }, 409);
        return;
      }
      const edl = readJson(adjustedEdlPath);
      const totalSteps = Math.max(1, (edl.ranges || []).length);
      const outPath = resolve(editDir, `presenter_cut_final_maxres_${timestampSlug()}.mp4`);
      const scriptPath = resolve(PROJECT_ROOT, "scripts/render-talking-head-final.mjs");
      const job = startRenderJob({
        type: "final",
        outputPath: outPath,
        mediaUrl: "/media/render?path=" + encodeURIComponent(outPath),
        totalSteps,
        phase: `Rendering final 0/${totalSteps}`,
        cmd: "node",
        args: [
          scriptPath,
          "--edit-dir",
          editDir,
          "--edl",
          adjustedEdlPath,
          "--output",
          outPath,
        ],
        onLine: (activeJob, line) => {
          const segmentMatch = /^\[(\d+)\/(\d+)\]\s*(.*)$/.exec(line);
          if (segmentMatch) {
            const completed = Number(segmentMatch[1]);
            const total = Number(segmentMatch[2]);
            const fileLabel = segmentMatch[3] ? ` · ${segmentMatch[3]}` : "";
            setRenderJobProgress(activeJob, completed, total, `Rendering final ${completed}/${total}${fileLabel}`);
          } else if (/concat|ffprobe|manifest|latest/i.test(line)) {
            activeJob.progress = Math.max(activeJob.progress, 98);
            activeJob.phase = "Finalizing final render";
          }
        },
        onSuccess: () => {
          const renders = finalRendersData();
          return {
            output_path: outPath,
            media_url: "/media/render?path=" + encodeURIComponent(outPath),
            render: renders.renders.find((render) => render.path === outPath) || null,
            renders,
          };
        },
      });
      sendJson(res, { ok: true, job_id: job.id, job: publicRenderJob(job) });
      return;
    }

    sendJson(res, { error: "Not found" }, 404);
  }

  function handleMedia(req, res, url) {
    const project = projectData();
    if (url.pathname === "/media/source") {
      streamFile(req, res, project.playback_path);
      return;
    }
    if (url.pathname === "/media/preview") {
      streamFile(req, res, resolve(editDir, "presenter_cut_trim_preview.mp4"));
      return;
    }
    if (url.pathname === "/media/final") {
      const latestPath = resolve(editDir, "presenter_cut_final_maxres_latest.json");
      if (!existsSync(latestPath)) throw new Error("No final render manifest found yet.");
      const latest = readJson(latestPath);
      streamFile(req, res, latest.output_path);
      return;
    }
    if (url.pathname === "/media/render") {
      const requestedPath = url.searchParams.get("path");
      if (!requestedPath) throw new Error("Missing render path.");
      const renderPath = resolve(requestedPath);
      if (!isPathInside(editDir, renderPath)) throw new Error("Render path is outside edit dir.");
      streamFile(req, res, renderPath);
      return;
    }
    sendJson(res, { error: "Not found" }, 404);
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (req.method === "GET" && url.pathname === "/") {
        sendText(res, html(), 200, "text/html; charset=utf-8");
      } else if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else if (url.pathname.startsWith("/media/")) {
        handleMedia(req, res, url);
      } else {
        sendJson(res, { error: "Not found" }, 404);
      }
    } catch (error) {
      sendJson(res, {
        error: error.message,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
      }, 500);
    }
  });
}

try {
  const args = parseArgs(process.argv);
  if (!args.editDir) throw new Error(`Missing --edit-dir.\n\n${usage()}`);
  const server = createApp(args);
  server.listen(args.port, args.host, () => {
    const url = `http://${args.host}:${args.port}/`;
    const editDir = resolve(args.editDir);
    const handoffDir = resolve(editDir, "trim_ui");
    mkdirSync(handoffDir, { recursive: true });
    writeJson(resolve(handoffDir, "handoff.json"), {
      url,
      edit_dir: editDir,
      edl_path: resolve(args.edl || resolve(editDir, existsSync(resolve(editDir, "edl_adjusted.json")) ? "edl_adjusted.json" : "edl_final.json")),
      started_at: new Date().toISOString(),
    });
    console.log(`Talking Head Trim UI: ${url}`);
    console.log(`Edit dir: ${editDir}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
