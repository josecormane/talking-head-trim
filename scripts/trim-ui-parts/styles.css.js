// trim-ui-parts/styles.css.js
// Returns the <style> block for Talking Head Trim UI
export function cssStyles() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root {
  color-scheme: dark;
  --bg: #09090b; --s1: #0f0f12; --s2: #18181b; --s3: #1e1e23;
  --b1: #27272a; --b2: #3f3f46;
  --t1: #f4f4f5; --t2: #a1a1aa; --t3: #71717a;
  --green: #34d399; --green-dim: rgba(52,211,153,.12); --green-b: rgba(52,211,153,.5);
  --amber: #fbbf24; --amber-dim: rgba(251,191,36,.10); --amber-b: rgba(251,191,36,.4);
  --red: #f87171; --red-dim: rgba(248,113,113,.12);
  --blue: #60a5fa; --blue-dim: rgba(96,165,250,.14);
  --r: 8px; --r-sm: 5px;
}
*,*::before,*::after { box-sizing: border-box; margin: 0; }
[hidden] { display: none !important; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg); color: var(--t1);
  overflow: hidden; min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  background: radial-gradient(ellipse at 50% 0%, #14141a 0%, var(--bg) 60%);
}

/* ── Header ── */
header {
  height: 52px; display: flex; align-items: center; gap: 12px;
  padding: 0 16px; border-bottom: 1px solid var(--b1);
  background: rgba(15,15,18,.85); backdrop-filter: blur(12px) saturate(1.4);
  z-index: 20; flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.header-left h1 {
  font-size: 13px; font-weight: 600; color: var(--t2);
  letter-spacing: .02em; white-space: nowrap;
}
#summary {
  font-size: 11px; color: var(--t3); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 280px;
}
.header-center { flex: 1; display: flex; justify-content: center; }
.header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.header-group {
  display: flex; align-items: center; gap: 4px;
  padding-left: 8px; border-left: 1px solid var(--b1);
}
.header-group:first-child { padding-left: 0; border-left: 0; }
.project-actions { gap: 6px; }
.export-actions { gap: 6px; }
.secondary-action {
  height: 32px; padding: 0 11px;
  color: var(--t2); background: var(--s2);
}
.secondary-action:hover { color: var(--t1); }
.export-primary {
  height: 32px; padding: 0 13px;
  font-weight: 600;
}
.library-button {
  height: 32px; padding: 0 8px 0 9px;
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--t2); background: var(--s2);
}
.library-button:hover { color: var(--t1); }
.activity-status {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px;
  border: 1px solid var(--b1); border-radius: 999px;
  background: var(--s2); color: var(--t3); font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px;
}
.activity-status::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--t3); flex-shrink: 0;
}
.activity-status.pending::before { background: var(--amber); }
.activity-status.saved::before { background: var(--green); }
.activity-status.error::before { background: var(--red); }
.activity-status.busy::before {
  width: 10px; height: 10px; background: transparent;
  border: 2px solid var(--blue-dim); border-top-color: var(--blue);
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.divider { width: 1px; height: 24px; background: var(--b1); flex-shrink: 0; }

/* ── Buttons ── */
button, input, select {
  font-family: inherit; color: var(--t1);
  border: 1px solid var(--b1); border-radius: var(--r-sm);
  background: var(--s2); font-size: 12px;
  transition: all .12s ease;
}
button {
  height: 30px; padding: 0 10px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  font-weight: 500; white-space: nowrap;
}
button:hover { border-color: var(--b2); background: var(--s3); }
button:active { transform: scale(.97); }
button:disabled { opacity: .35; cursor: not-allowed; transform: none; }
button:disabled:hover { border-color: var(--b1); background: var(--s2); }
button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid var(--blue); outline-offset: 1px;
}
button.primary { background: rgba(96,165,250,.18); border-color: rgba(96,165,250,.4); color: #93c5fd; }
button.primary:hover { background: rgba(96,165,250,.28); }
button.success { background: var(--green-dim); border-color: var(--green-b); color: #6ee7b7; }
button.success:hover { background: rgba(52,211,153,.22); }
button.danger { background: var(--red-dim); border-color: rgba(248,113,113,.35); color: #fca5a5; }
button.danger:hover { background: rgba(248,113,113,.22); }
.icon-btn {
  width: 30px; height: 30px; padding: 0;
  display: inline-grid; place-items: center;
  background: transparent; border-color: transparent;
}
.icon-btn:hover { background: var(--s3); border-color: var(--b2); }
.icon-btn.danger { color: #fca5a5; }
.icon-btn.danger:hover { background: var(--red-dim); border-color: rgba(248,113,113,.35); }
.icon-btn.success { color: #6ee7b7; }
.icon-btn svg, button svg, .tool-toggle svg {
  width: 14px; height: 14px; stroke: currentColor; stroke-width: 2;
  fill: none; stroke-linecap: round; stroke-linejoin: round;
  pointer-events: none; flex-shrink: 0;
}
input[type="text"], input[type="number"] {
  height: 30px; padding: 0 8px; width: 100%;
  background: var(--s1); font-size: 12px;
  font-variant-numeric: tabular-nums;
}
input[type="range"] { width: 120px; accent-color: var(--blue); }
input[type="checkbox"] { accent-color: var(--blue); }
select {
  height: 28px; padding: 0 6px; background: var(--s1);
  font-size: 11px; color: var(--t2);
}
label { color: var(--t3); font-size: 11px; display: flex; align-items: center; gap: 6px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); border: 0;
}

/* ── Editor Shell ── */
.editor-shell {
  display: grid;
  grid-template-columns: 1fr 340px;
  grid-template-rows: 1fr 260px;
  height: calc(100vh - 52px);
}
body.rendering .editor-shell { pointer-events: none; opacity: .8; }

/* ── Video Panel ── */
.viewer-panel {
  grid-column: 1; grid-row: 1;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--b1);
  min-height: 0; min-width: 0;
}
.video-stage {
  flex: 1; min-height: 0; position: relative;
  background: #000; overflow: hidden;
}
.video-stage > video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: contain; background: #000;
}
.transport {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 12px; border-top: 1px solid var(--b1);
  background: var(--s1); flex-wrap: wrap;
}
.transport-left, .transport-right, .transport-controls, .editor-toggles {
  display: flex; align-items: center; gap: 8px;
}
.transport-left { min-width: 0; }
.transport-right { margin-left: auto; }
.transport-controls { padding-left: 2px; }
.segmented {
  display: inline-flex; height: 30px; padding: 2px;
  background: var(--s1); border: 1px solid var(--b1); border-radius: 6px;
}
.mode-switch { flex-shrink: 0; }
.mode-opt {
  height: 26px; padding: 0 10px; border: none; background: transparent;
  color: var(--t3); font-size: 11px; font-weight: 600; border-radius: 4px;
  letter-spacing: 0;
}
.mode-opt.active { background: var(--s3); color: var(--t1); }
.checkline {
  display: inline-flex; align-items: center; gap: 5px;
  color: var(--t3); font-size: 11px; white-space: nowrap; cursor: default;
}
.badge {
  display: inline-flex; align-items: center;
  height: 22px; padding: 0 7px; border-radius: 999px;
  border: 1px solid var(--b1); background: var(--s1);
  color: var(--t3); font-size: 10px; font-weight: 500;
}
.timecode {
  display: inline-flex; align-items: center;
  height: 28px; min-width: 132px; padding: 0 9px; border-radius: 999px;
  border: 1px solid var(--b1); background: var(--bg);
  color: var(--t2); font-variant-numeric: tabular-nums;
  font-size: 11px; font-weight: 600;
}
.timecode[data-mode="edit"] {
  color: var(--green); border-color: rgba(66, 230, 135, .34);
  background: rgba(18, 147, 78, .10);
}
.timecode[data-mode="source"], .timecode[data-mode="context"] {
  color: var(--blue); border-color: rgba(93, 184, 255, .34);
  background: rgba(93, 184, 255, .09);
}
.transport-play {
  width: 34px; height: 30px; padding: 0; justify-content: center;
}
.transport-step {
  width: 30px; height: 30px; border-color: transparent; background: transparent;
}
.transport-step:hover { background: var(--s2); border-color: var(--b1); }
.tool-toggle {
  position: relative;
  height: 30px; display: inline-flex; align-items: center; gap: 6px;
  padding: 0 9px; border: 1px solid transparent; border-radius: 6px;
  color: var(--t3); font-size: 11px; font-weight: 600;
  white-space: nowrap; cursor: pointer; user-select: none;
}
.tool-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.tool-toggle:has(input:checked) {
  color: var(--blue);
  background: rgba(93, 184, 255, .10);
  border-color: rgba(93, 184, 255, .24);
}
.tool-toggle:hover { background: var(--s2); color: var(--t1); border-color: var(--b1); }

/* ── Sidebar ── */
.sidebar {
  grid-column: 2; grid-row: 1 / 3;
  display: flex; flex-direction: column;
  min-height: 0; overflow: hidden;
  background: var(--s1);
}
.edit-panel {
  height: 100%; min-height: 0;
  display: flex; flex-direction: column;
}
.segment-compact {
  flex-shrink: 0;
  display: grid; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--b1);
}
.segment-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}
.segment-title-block { min-width: 0; display: grid; gap: 2px; }
.segment-title-block .section-title { margin-bottom: 0; }
.segment-title-block strong {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; font-weight: 650;
}
.compact-grid { margin-bottom: 0; }
.compact-grid input { height: 28px; font-size: 12px; }
.compact-nudge {
  display: grid;
  grid-template-columns: auto auto 28px 28px auto 28px 28px minmax(64px, auto);
  align-items: center; gap: 4px;
  padding: 0;
}
.compact-nudge .field-label { margin-right: 4px; }
.compact-nudge select { margin-left: auto; width: 100%; }
.micro-label {
  color: var(--t3); font-size: 10px; white-space: nowrap;
}
.compact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center; gap: 6px;
  margin-bottom: 0;
}
.compact-actions button { min-width: 0; }
.compact-actions .checkline { justify-content: flex-end; }
.compact-silences {
  border-top: 1px solid var(--b1);
  padding-top: 8px; margin-top: 0;
}
.compact-silences .silence-header { margin-bottom: 4px; }
.transcript-panel {
  flex: 1; min-height: 0; min-width: 0;
  display: flex; flex-direction: column;
  padding: 10px 12px 12px;
  overflow: hidden;
}
.section-title {
  font-size: 11px; font-weight: 600; color: var(--t3);
  text-transform: uppercase; letter-spacing: .05em;
  margin-bottom: 8px;
}
.inspector-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.inspector-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  margin-bottom: 8px;
}
.inspector-grid label { display: grid; gap: 3px; }
.field-label { font-size: 10px; color: var(--t3); text-transform: uppercase; letter-spacing: .04em; }
.nudge-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 0; flex-wrap: wrap;
}
.nudge-bar .field-label { margin-right: 4px; }
.inline-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.silence-section { border-top: 1px solid var(--b1); padding-top: 10px; margin-top: 6px; }
.nudge-bar.compact-nudge {
  display: grid;
  grid-template-columns: auto auto 28px 28px auto 28px 28px minmax(64px, auto);
  align-items: center; gap: 4px;
  padding: 0; flex-wrap: nowrap;
}
.inline-actions.compact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center; gap: 6px;
  margin-bottom: 0;
}
.silence-section.compact-silences {
  padding-top: 8px; margin-top: 0;
}
.silence-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.silence-count {
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: var(--amber-dim);
  border: 1px solid var(--amber-b); color: var(--amber);
  font-size: 10px; display: inline-grid; place-items: center;
}
.silence-list { display: grid; gap: 3px; max-height: 96px; overflow-y: auto; }
.silence-card {
  display: grid; grid-template-columns: 1fr 28px 28px; gap: 4px;
  align-items: center; padding: 3px 0 3px 8px;
  border-left: 2px solid var(--amber-b); border-radius: 0 4px 4px 0;
}
.silence-card.selected { background: var(--amber-dim); border-left-color: var(--amber); }
.silence-info {
  height: 26px; padding: 0 6px; text-align: left;
  color: var(--amber); background: transparent; border-color: transparent;
  font-size: 11px; font-variant-numeric: tabular-nums;
}
.silence-info:hover { background: var(--amber-dim); border-color: var(--amber-b); }

/* ── Transcript ── */
.transcript-meta {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 6px;
}
.transcript-actions { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.transcript-scroll { overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; flex: 1; }
.transcript-flow { display: grid; gap: 4px; min-width: 0; max-width: 100%; }
.t-block {
  padding: 8px 10px; border-left: 3px solid var(--b1);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  transition: background .15s, border-color .15s, box-shadow .15s;
  min-width: 0; max-width: 100%; overflow: hidden;
}
.t-block.keep { border-left-color: var(--green-b); }
.t-block.drop { border-left-color: var(--amber-b); opacity: .7; }
.t-block.current {
  background: rgba(52,211,153,.08); border-left-color: var(--green);
  box-shadow: inset 0 0 0 1px rgba(52,211,153,.15), 0 0 12px rgba(52,211,153,.06);
}
.t-block.current .t-block-title { color: var(--green); font-weight: 600; }
.t-block.current .text-block { border: 1px solid rgba(52,211,153,.2); }
.t-block-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; margin-bottom: 4px;
  min-width: 0; max-width: 100%; flex-wrap: wrap;
}
.t-block-title {
  color: var(--t3); font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 100%;
  overflow-wrap: anywhere; word-break: break-word;
}
.t-block-actions { display: flex; gap: 3px; flex-shrink: 1; min-width: 0; max-width: 100%; flex-wrap: wrap; justify-content: flex-end; }
.t-block-actions .badge { max-width: 100%; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; }
.text-block {
  font-size: 12px; line-height: 1.5; padding: 6px 8px;
  background: var(--s2); border-radius: var(--r-sm);
  color: var(--t2); min-height: 32px;
  min-width: 0; max-width: 100%; overflow: hidden;
  white-space: normal; overflow-wrap: anywhere; word-break: break-word;
}
.text-block.keep { color: #d1fae5; }
.text-block.drop { color: var(--t3); text-decoration: line-through; }
.word-list {
  display: flex; flex-wrap: wrap; gap: 2px; text-decoration: none; user-select: none;
  min-width: 0; max-width: 100%; overflow: hidden; overflow-wrap: anywhere;
}
.word-chip {
  min-height: 22px; height: auto; max-width: 100%; padding: 2px 4px; border-radius: 3px;
  border: 1px solid transparent; background: transparent;
  color: var(--t3); text-decoration: line-through;
  cursor: pointer; font-size: 11px; touch-action: none;
  white-space: normal; overflow-wrap: anywhere; word-break: break-word;
}
.word-chip:hover { color: var(--t2); background: var(--s3); border-color: var(--b2); }
.word-chip.selected {
  color: var(--bg); background: var(--green);
  border-color: #6ee7b7; text-decoration: none;
}

/* ── Timeline ── */
.timeline-panel {
  grid-column: 1; grid-row: 2;
  display: flex; flex-direction: column;
  border-top: 1px solid var(--b1);
  min-width: 0;
}
.timeline-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 7px 12px; flex-shrink: 0;
  background: var(--s1); border-bottom: 1px solid var(--b1);
}
.timeline-bar-left, .timeline-bar-right { display: flex; align-items: center; gap: 8px; }
.zoom-control { color: var(--t3); }
.zoom-button {
  width: 24px; height: 24px; border-color: transparent; background: transparent;
}
.zoom-button:hover { border-color: var(--b1); background: var(--s2); }
.zoom-value {
  min-width: 46px; color: var(--t3); font-size: 10px;
  font-variant-numeric: tabular-nums; text-align: right;
}
#timelineViewport {
  flex: 1; overflow-x: auto; overflow-y: hidden;
  background: var(--bg); position: relative; min-height: 0;
}
#timelineTrack { position: relative; height: 100%; min-width: 100%; }
#waveformCanvas {
  position: absolute; top: 24px; left: 0; width: 100%; height: calc(100% - 24px);
  pointer-events: none; z-index: 1; opacity: .45;
}
.ruler {
  position: absolute; top: 0; left: 0; right: 0;
  height: 24px; border-bottom: 1px solid var(--b1);
  color: var(--t3); font-size: 10px;
}
.tick { position: absolute; top: 0; width: 1px; height: 100%; background: rgba(255,255,255,.06); }
.tick span { position: absolute; top: 4px; left: 4px; white-space: nowrap; }
.silence-overlay {
  position: absolute; top: 30px; bottom: 36px;
  background: var(--amber-dim);
  border-left: 1px solid var(--amber-b); border-right: 1px solid rgba(251,191,36,.2);
  pointer-events: none;
}
.silence-overlay.removable { cursor: pointer; pointer-events: auto; z-index: 4; }
.silence-overlay.removable:hover, .silence-overlay.selected-silence {
  background: rgba(251,191,36,.22); box-shadow: inset 0 0 0 1px rgba(251,191,36,.5);
}
.edge-marker {
  position: absolute; top: 24px; bottom: 30px;
  width: 1px; z-index: 3; pointer-events: none;
}
.edge-marker.start { background: rgba(52,211,153,.6); }
.edge-marker.end { background: rgba(96,165,250,.5); }
.segment {
  position: absolute; top: 50px; height: calc(100% - 90px);
  min-width: 6px;
  border: 1px solid var(--green-b); background: var(--green-dim);
  border-radius: 4px; cursor: pointer;
  transition: background .08s;
}
.segment.selected { background: var(--blue-dim); border-color: var(--blue); }
.segment-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 6px 6px 0; font-size: 10px; color: rgba(255,255,255,.7);
  pointer-events: none;
}
.segment-time {
  padding: 2px 6px; color: var(--t3); font-size: 9px;
  pointer-events: none; font-variant-numeric: tabular-nums;
}
.handle {
  position: absolute; top: -4px; width: 8px; height: calc(100% + 8px);
  background: var(--green); border: 1px solid #6ee7b7;
  border-radius: 3px; cursor: ew-resize; z-index: 5;
  opacity: 0; transition: opacity .12s;
}
.segment:hover .handle, .segment.selected .handle { opacity: 1; }
.handle.left { left: -4px; }
.handle.right { right: -4px; }
#playhead {
  position: absolute; top: 24px; bottom: 0;
  width: 2px; background: var(--red); z-index: 8;
  pointer-events: auto; cursor: ew-resize;
  box-shadow: 0 0 8px rgba(248,113,113,.3);
}
#playhead::before {
  content: ''; position: absolute; top: -5px; left: -5px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--red); border: 1px solid #fca5a5;
}
#playheadLabel {
  position: absolute; left: 8px; bottom: 4px;
  padding: 2px 5px; border-radius: 3px;
  background: rgba(9,9,11,.9); border: 1px solid rgba(248,113,113,.4);
  color: #fca5a5; font-size: 10px; font-variant-numeric: tabular-nums;
  white-space: nowrap; pointer-events: none;
}

/* ── Modals ── */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  display: grid; place-items: center; padding: 16px;
  background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
}
.modal-backdrop[hidden] { display: none; }
.modal-card {
  width: min(700px, calc(100vw - 32px));
  max-height: min(80vh, 700px); overflow: auto;
  border: 1px solid var(--b2); border-radius: var(--r);
  background: var(--s1); box-shadow: 0 24px 80px rgba(0,0,0,.5);
  padding: 16px; display: grid; gap: 12px;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.modal-head strong { font-size: 14px; font-weight: 600; }
.modal-subtitle { margin-top: 2px; color: var(--t3); font-size: 11px; }
.renders-modal {
  width: min(980px, calc(100vw - 32px));
  max-height: min(82vh, 760px); overflow: hidden;
  grid-template-rows: auto minmax(0,1fr);
}
.renders-layout {
  display: grid; grid-template-columns: minmax(340px, 1fr) minmax(280px, 320px);
  gap: 12px; min-height: 0;
}
.render-list-pane, .render-preview-pane {
  min-height: 0; display: grid; gap: 8px; align-content: start;
}
.render-preview-pane {
  border-left: 1px solid var(--b1);
  padding-left: 12px;
}
.render-list {
  min-height: 0; max-height: calc(85vh - 140px);
  overflow-y: auto; display: grid; gap: 3px;
}
.render-row {
  width: 100%; height: 48px; padding: 6px 8px;
  display: grid; grid-template-columns: auto 1fr auto; gap: 8px;
  align-items: center; text-align: left;
  background: transparent; border-color: transparent;
  border-left: 2px solid transparent;
}
.render-row:hover { background: var(--s2); border-left-color: rgba(96,165,250,.5); }
.render-row.selected { background: var(--blue-dim); border-color: rgba(96,165,250,.3); border-left-color: var(--blue); }
.render-number {
  display: inline-grid; place-items: center;
  min-width: 30px; height: 24px; border-radius: 999px;
  background: var(--blue-dim); border: 1px solid rgba(96,165,250,.3);
  color: #93c5fd; font-size: 11px;
}
.render-copy { display: grid; gap: 1px; min-width: 0; }
.render-copy strong { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.render-copy span { font-size: 10px; color: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.render-tags { display: flex; gap: 3px; }
.tag {
  height: 18px; padding: 0 5px; border-radius: 999px;
  border: 1px solid var(--b1); color: var(--t3); font-size: 10px;
  display: inline-flex; align-items: center;
}
.tag.latest { color: #6ee7b7; border-color: var(--green-b); background: var(--green-dim); }
.tag.backup { color: var(--amber); border-color: var(--amber-b); background: var(--amber-dim); }
.render-player {
  width: min(100%, 300px); aspect-ratio: 9/16;
  max-height: calc(82vh - 220px); min-height: 0;
  justify-self: center;
  border: 1px solid var(--b1); border-radius: var(--r);
  background: #000; object-fit: contain; cursor: pointer;
}
.render-preview-toolbar {
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.render-preview-toolbar[hidden] { display: none; }
.render-preview-toolbar button { height: 30px; }
.render-empty-preview {
  width: min(100%, 300px); aspect-ratio: 9/16;
  max-height: calc(82vh - 220px); min-height: 280px;
  justify-self: center;
  border: 1px dashed var(--b1); border-radius: var(--r);
  display: grid; place-items: center; padding: 18px;
  color: var(--t3); background: rgba(255,255,255,.015);
  text-align: center; font-size: 12px;
}
.render-details { display: grid; gap: 3px; color: var(--t3); font-size: 11px; word-break: break-word; }
.render-count {
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: var(--blue-dim);
  border: 1px solid rgba(96,165,250,.35);
  color: #93c5fd; font-size: 10px;
  display: inline-grid; place-items: center;
}
.empty-state {
  padding: 16px; border: 1px dashed var(--b1); border-radius: var(--r);
  color: var(--t3); text-align: center; font-size: 12px;
}
.status {
  color: var(--t3); font-size: 12px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
}

/* ── Responsive ── */
@media (max-width: 1100px) {
  body { overflow: auto; }
  .editor-shell {
    height: auto; min-height: calc(100vh - 52px);
    grid-template-columns: 1fr;
    grid-template-rows: minmax(280px, 55vh) auto auto;
  }
  .viewer-panel { border-right: none; border-bottom: 1px solid var(--b1); }
  .viewer-panel, .timeline-panel, .sidebar { grid-column: 1; grid-row: auto; }
  .sidebar { max-height: 50vh; }
  .renders-layout { grid-template-columns: 1fr; }
  .render-player { aspect-ratio: 16/9; max-height: 40vh; min-height: 200px; }
}
`;
}
