#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, relative, resolve } from "node:path";

function usage() {
  return [
    "Usage:",
    "  npm run reel:talking-head:review -- --edit-dir <presenter_edit> --video <preview.mp4>",
    "",
    "Options:",
    "  --edit-dir <path>       Folder with edl_final.json and transcripts/.",
    "  --video <path>          Review video, usually presenter_cut_1080x1920.mp4.",
    "  --edl <path>            Default: <edit-dir>/edl_final.json.",
    "  --source-name <name>    Default: first source key in the EDL.",
    "  --silence-log <path>    Default: newest verify/*silencedetect*350ms*.txt.",
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
    else if (name === "video") args.video = value;
    else if (name === "edl") args.edl = value;
    else if (name === "source-name") args.sourceName = value;
    else if (name === "silence-log") args.silenceLog = value;
    else throw new Error(`Unknown option: --${name}`);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!:;])/g, "$1")
    .trim();
}

function transcriptTokens(transcript) {
  return (transcript.words || [])
    .filter((item) => item.type === "word" || item.type === "audio_event")
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .map((item) => ({
      type: item.type,
      start: Number(item.start),
      end: Number(item.end),
      text: cleanText(item.text),
      speaker_id: item.speaker_id || "",
    }))
    .filter((item) => item.text);
}

function groupTokens(tokens, silenceThreshold = 0.5) {
  const groups = [];
  let current = [];

  function flush() {
    if (!current.length) return;
    groups.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: cleanText(current.map((item) => item.text).join(" ")),
      tokens: current,
    });
    current = [];
  }

  for (const token of tokens) {
    const prev = current[current.length - 1];
    if (prev && token.start - prev.end >= silenceThreshold) flush();
    current.push(token);
  }
  flush();
  return groups;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function tokensInRange(tokens, start, end) {
  return tokens.filter((token) => overlaps(token.start, token.end, start, end));
}

function textInRange(tokens, start, end) {
  return cleanText(tokensInRange(tokens, start, end).map((token) => token.text).join(" "));
}

function parseSilenceLog(path) {
  if (!path || !existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const events = [];
  let start = null;
  for (const line of text.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      start = Number(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch && start !== null) {
      events.push({
        output_start: start,
        output_end: Number(endMatch[1]),
        duration: Number(endMatch[2]),
      });
      start = null;
    }
  }
  return events;
}

function newestSilenceLog(editDir) {
  const verifyDir = resolve(editDir, "verify");
  if (!existsSync(verifyDir)) return null;
  const files = readdirSync(verifyDir)
    .filter((name) => /silencedetect.*350ms|350ms.*silencedetect/.test(name))
    .map((name) => resolve(verifyDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] || null;
}

function buildOutputSpans(edl) {
  let offset = 0;
  return edl.ranges.map((range, index) => {
    const duration = Number(range.end) - Number(range.start);
    const span = {
      index,
      beat: range.beat || `range_${index + 1}`,
      source: range.source,
      source_start: Number(range.start),
      source_end: Number(range.end),
      output_start: offset,
      output_end: offset + duration,
    };
    offset += duration;
    return span;
  });
}

function mapSilences(events, spans) {
  return events.map((event, index) => {
    const span = spans.find((candidate) => (
      event.output_start >= candidate.output_start &&
      event.output_start < candidate.output_end
    ));
    if (!span) return { ...event, index, beat: "unmapped" };
    const sourceStart = span.source_start + (event.output_start - span.output_start);
    const sourceEnd = span.source_start + (event.output_end - span.output_start);
    return {
      ...event,
      index,
      beat: span.beat,
      source: span.source,
      source_start: sourceStart,
      source_end: sourceEnd,
      feedback: `Recorta mas el silencio en output ${formatTime(event.output_start)}-${formatTime(event.output_end)} (${event.duration.toFixed(2)}s), beat ${span.beat}, source ${formatTime(sourceStart)}-${formatTime(sourceEnd)}.`,
    };
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(data) {
  const inlineData = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Talking Head Review</title>
  <style>
    :root { color-scheme: dark; --bg:#101214; --panel:#181c20; --muted:#9aa4af; --line:#2b333b; --keep:#dff7eb; --drop:#8b949e; --accent:#72d2ff; --warn:#ffd36e; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:#f3f6f8; }
    header { position:sticky; top:0; z-index:10; padding:14px 18px; background:rgba(16,18,20,.94); border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:14px; align-items:center; }
    h1 { font-size:18px; margin:0; letter-spacing:0; }
    main { display:grid; grid-template-columns:minmax(340px, 430px) 1fr; gap:18px; padding:18px; }
    video { width:100%; max-height:78vh; background:#000; border:1px solid var(--line); }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    .stack { display:grid; gap:12px; align-content:start; }
    .tabs { display:flex; gap:8px; flex-wrap:wrap; }
    button { background:#24313a; color:#f3f6f8; border:1px solid #38505e; border-radius:6px; padding:7px 10px; cursor:pointer; }
    button:hover { border-color:var(--accent); }
    .tab.active { background:#0d4960; border-color:var(--accent); }
    .view { display:none; }
    .view.active { display:grid; gap:12px; }
    .card { border:1px solid var(--line); border-radius:8px; padding:12px; background:#12161a; }
    .meta { color:var(--muted); font-size:12px; display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
    .kept { color:var(--keep); font-size:15px; line-height:1.45; }
    .deleted { color:var(--drop); text-decoration: line-through; line-height:1.45; }
    .deleted::before { content:"("; text-decoration:none; }
    .deleted::after { content:")"; text-decoration:none; }
    .reason { color:var(--muted); font-size:13px; margin-top:8px; }
    .warning { color:var(--warn); }
    .small { font-size:12px; color:var(--muted); }
    details { margin-top:8px; }
    summary { cursor:pointer; color:var(--accent); }
    .row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .pill { border:1px solid var(--line); color:var(--muted); border-radius:999px; padding:3px 8px; font-size:12px; }
    @media (max-width: 900px) { main { grid-template-columns:1fr; } video { max-height:62vh; } }
  </style>
</head>
<body>
  <header>
    <h1>Talking Head Review</h1>
    <div class="small">${escapeHtml(data.summary)}</div>
  </header>
  <main>
    <aside class="stack">
      <section class="panel">
        <video id="video" src="${escapeHtml(data.video_src)}" controls preload="metadata"></video>
      </section>
      <section class="panel">
        <div class="row"><strong>Archivos</strong><span class="pill">${escapeHtml(data.duration_label)}</span></div>
        <p class="small">Preview: ${escapeHtml(data.video_path)}</p>
        <p class="small">EDL: ${escapeHtml(data.edl_path)}</p>
      </section>
    </aside>
    <section class="stack">
      <nav class="tabs">
        <button class="tab active" data-tab="timeline">Timeline</button>
        <button class="tab" data-tab="removed">Eliminado</button>
        <button class="tab" data-tab="silences">Silencios</button>
        <button class="tab" data-tab="feedback">Como pedir cambios</button>
      </nav>
      <div id="timeline" class="view active"></div>
      <div id="removed" class="view"></div>
      <div id="silences" class="view"></div>
      <div id="feedback" class="view"></div>
    </section>
  </main>
  <script>window.REVIEW_DATA = ${inlineData};</script>
  <script>
    const data = window.REVIEW_DATA;
    const video = document.getElementById('video');
    const byId = (id) => document.getElementById(id);
    const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const t = (seconds) => {
      seconds = Math.max(0, Number(seconds) || 0);
      const m = Math.floor(seconds / 60);
      const s = (seconds - m * 60).toFixed(2).padStart(5, '0');
      return String(m).padStart(2, '0') + ':' + s;
    };
    function jump(seconds) { video.currentTime = Math.max(0, seconds); video.play(); }
    async function copy(text) { await navigator.clipboard.writeText(text); }

    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.view').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        byId(button.dataset.tab).classList.add('active');
      });
    });

    byId('timeline').innerHTML = data.segments.map((seg) => \`
      <article class="card">
        <div class="row">
          <div class="meta">
            <span>#\${seg.index + 1}</span>
            <span>\${esc(seg.beat)}</span>
            <span>output \${t(seg.output_start)}-\${t(seg.output_end)}</span>
            <span>source \${t(seg.source_start)}-\${t(seg.source_end)}</span>
          </div>
          <button onclick="jump(\${seg.output_start})">Ver</button>
        </div>
        \${seg.deleted_before.length ? \`<details><summary>Texto eliminado antes de este segmento</summary><p class="deleted">\${esc(seg.deleted_before.map(x => x.text).join(' / '))}</p></details>\` : ''}
        <p class="kept">\${esc(seg.text)}</p>
        <p class="reason">\${esc(seg.reason)}</p>
        <button data-copy="\${esc(seg.feedback)}">Copiar pedido de cambio</button>
      </article>
    \`).join('');

    byId('removed').innerHTML = data.removed_chunks.map((chunk, idx) => \`
      <article class="card">
        <div class="row">
          <div class="meta"><span>#\${idx + 1}</span><span>source \${t(chunk.start)}-\${t(chunk.end)}</span><span>\${(chunk.end - chunk.start).toFixed(2)}s</span></div>
          <button data-copy="\${esc(chunk.feedback)}">Pedir agregar</button>
        </div>
        <p class="deleted">\${esc(chunk.text)}</p>
      </article>
    \`).join('') || '<p class="small">No hay chunks eliminados.</p>';

    byId('silences').innerHTML = data.silences.map((event, idx) => \`
      <article class="card">
        <div class="row">
          <div class="meta"><span>#\${idx + 1}</span><span>output \${t(event.output_start)}-\${t(event.output_end)}</span><span>source \${t(event.source_start)}-\${t(event.source_end)}</span><span>\${event.duration.toFixed(2)}s</span><span>\${esc(event.beat)}</span></div>
          <button onclick="jump(\${event.output_start})">Escuchar</button>
        </div>
        <p class="warning">No todos estos eventos son pausas editables: algunos caen dentro de palabras largas o silabas de baja energia.</p>
        <button data-copy="\${esc(event.feedback)}">Pedir recorte puntual</button>
      </article>
    \`).join('') || '<p class="small">No hay silencios marcados.</p>';

    byId('feedback').innerHTML = \`
      <article class="card">
        <p>Ejemplos de feedback util:</p>
        <p><code>Agrega el eliminado source 03:08.72-03:36.68 despues del segmento Colossus.</code></p>
        <p><code>Cambia el segmento #12 por el eliminado source 05:47.57-05:52.40.</code></p>
        <p><code>Recorta mas el silencio output 02:22.01-02:23.20, pero no cambies el umbral global.</code></p>
        <p class="small">El ajuste se aplica editando el EDL, se vuelve a renderizar preview, y solo despues de aprobar se renderiza max-res.</p>
      </article>
    \`;

    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => copy(button.dataset.copy));
    });
  </script>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.editDir || !args.video) throw new Error(`Missing --edit-dir or --video.\n\n${usage()}`);

  const editDir = resolve(args.editDir);
  const edlPath = resolve(args.edl || resolve(editDir, "edl_final.json"));
  const videoPath = resolve(args.video);
  if (!existsSync(edlPath)) throw new Error(`EDL not found: ${edlPath}`);
  if (!existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  const edl = readJson(edlPath);
  const sourceName = args.sourceName || Object.keys(edl.sources || {})[0];
  if (!sourceName) throw new Error("Could not infer source name from EDL.");
  const transcriptPath = resolve(editDir, "transcripts", `${sourceName}.json`);
  if (!existsSync(transcriptPath)) throw new Error(`Transcript not found: ${transcriptPath}`);
  const transcript = readJson(transcriptPath);
  const tokens = transcriptTokens(transcript);
  const chunks = groupTokens(tokens, 0.5);
  const spans = buildOutputSpans(edl);

  const keptRanges = edl.ranges.map((range) => ({
    start: Number(range.start),
    end: Number(range.end),
  }));
  const removedChunks = chunks.filter((chunk) => (
    !keptRanges.some((range) => overlaps(chunk.start, chunk.end, range.start, range.end))
  )).map((chunk) => ({
    ...chunk,
    feedback: `Agrega este segmento eliminado: source ${formatTime(chunk.start)}-${formatTime(chunk.end)}. Texto: ${chunk.text}`,
  }));

  let previousSourceEnd = 0;
  const segments = edl.ranges.map((range, index) => {
    const span = spans[index];
    const deletedBefore = chunks.filter((chunk) => (
      chunk.end > previousSourceEnd &&
      chunk.start < Number(range.start) &&
      !keptRanges.some((kept) => overlaps(chunk.start, chunk.end, kept.start, kept.end))
    ));
    previousSourceEnd = Number(range.end);
    return {
      index,
      beat: range.beat || `range_${index + 1}`,
      reason: range.reason || "",
      source_start: Number(range.start),
      source_end: Number(range.end),
      output_start: span.output_start,
      output_end: span.output_end,
      text: textInRange(tokens, Number(range.start), Number(range.end)),
      deleted_before: deletedBefore,
      feedback: `Cambia el segmento #${index + 1} (${range.beat || `range_${index + 1}`}) por otra toma o ajusta sus bordes. Source ${formatTime(Number(range.start))}-${formatTime(Number(range.end))}; output ${formatTime(span.output_start)}-${formatTime(span.output_end)}.`,
    };
  });

  const silenceLog = args.silenceLog ? resolve(args.silenceLog) : newestSilenceLog(editDir);
  const silenceEvents = mapSilences(parseSilenceLog(silenceLog), spans);
  const reviewDir = resolve(editDir, "review");
  mkdirSync(reviewDir, { recursive: true });

  const totalDuration = spans.at(-1)?.output_end || 0;
  const data = {
    summary: `${segments.length} segmentos, ${formatTime(totalDuration)}, ${removedChunks.length} chunks eliminados, ${silenceEvents.length} silencios marcados`,
    duration_label: formatTime(totalDuration),
    video_path: videoPath,
    video_src: relative(reviewDir, videoPath),
    edl_path: edlPath,
    silence_log: silenceLog || "",
    segments,
    removed_chunks: removedChunks,
    silences: silenceEvents,
  };

  writeFileSync(resolve(reviewDir, "review_data.json"), JSON.stringify(data, null, 2));
  writeFileSync(resolve(reviewDir, "index.html"), renderHtml(data));
  console.log(resolve(reviewDir, "index.html"));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
