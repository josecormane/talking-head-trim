// trim-ui-parts/script-core.js
// Core state, utilities, history, playback, data functions
export function scriptCore() {
  return `
    const $ = (id) => document.getElementById(id);
    const state = {
      project: null, ranges: [], selected: 0, scale: 6,
      dirty: false, drag: null, dragPlayhead: false,
      stopAt: null, playMode: "paused", playbackChoice: "edit",
      editPlaybackIndex: 0, wordSelection: null, selectingWords: false,
      selectedSilence: null, undoStack: [], redoStack: [],
      isRestoringHistory: false, primaryRanges: [],
      autosaveTimer: null, savePromise: null, lastSaveData: null,
      editVersion: 0, rendering: false,
      finalRenders: [], selectedRenderPath: "",
    };
    const HISTORY_LIMIT = 80;

    function formatTime(s) {
      s = Math.max(0, Number(s) || 0);
      const m = Math.floor(s / 60);
      return String(m).padStart(2, "0") + ":" + (s - m * 60).toFixed(2).padStart(5, "0");
    }
    function parseTime(v) {
      const t = String(v || "").trim();
      if (!t) return 0;
      if (!t.includes(":")) return Number(t);
      const p = t.split(":").map(Number);
      if (p.length === 2) return p[0] * 60 + p[1];
      if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      return Number.NaN;
    }
    function round3(v) { return Math.round(Number(v) * 1000) / 1000; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function cleanText(t) { return String(t || "").replace(/\\\\s+/g, " ").replace(/\\\\s+([,.?!:;])/g, "$1").trim(); }
    function cloneRanges(r) { return (r || state.ranges).map(x => ({ ...x })); }
    function editSnapshot(label) { return { ranges: cloneRanges(), selected: state.selected, label }; }
    function sameRanges(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }
    function visibleTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

    function setOperationState(msg, tone) {
      const el = $("operationStatus");
      if (!el) return;
      el.textContent = msg;
      el.className = "activity-status" + (tone && tone !== "idle" ? " " + tone : "");
    }
    function setTextButtonBusy(id, busy, busyLabel) {
      const b = $(id); if (!b) return;
      if (!b.dataset.idleText) b.dataset.idleText = b.textContent;
      b.disabled = busy; b.textContent = busy ? busyLabel : b.dataset.idleText;
    }
    function setRenderBusy(activeId, busy, busyLabel) {
      state.rendering = busy;
      document.body.classList.toggle("rendering", busy);
      setTextButtonBusy("saveButton", busy, "Saving...");
      setTextButtonBusy("previewButton", busy, activeId === "previewButton" ? (busyLabel || "Rendering preview...") : "Render preview");
      setTextButtonBusy("finalButton", busy, activeId === "finalButton" ? (busyLabel || "Rendering final...") : "Render final");
      $("resetButton").disabled = busy || !state.primaryRanges.length;
      updateHistoryButtons();
    }
    function updateHistoryButtons() {
      const u = $("undoButton"), r = $("redoButton"); if (!u || !r) return;
      u.disabled = state.rendering || !state.undoStack.length;
      r.disabled = state.rendering || !state.redoStack.length;
      u.title = state.undoStack.length ? "Undo: " + (state.undoStack.at(-1)?.label || "") + " (Ctrl+Z)" : "Undo (Ctrl+Z)";
      r.title = state.redoStack.length ? "Redo: " + (state.redoStack.at(-1)?.label || "") + " (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)";
    }
    function pushUndoSnapshot(snap, label) {
      if (!snap || state.isRestoringHistory || sameRanges(snap.ranges, state.ranges)) return;
      const entry = { ranges: cloneRanges(snap.ranges), selected: snap.selected, label: label || snap.label || "Change" };
      const last = state.undoStack.at(-1);
      if (!last || !sameRanges(last.ranges, entry.ranges)) {
        state.undoStack.push(entry);
        if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
      }
      state.redoStack = [];
      updateHistoryButtons();
    }
    function restoreSnapshot(snap, prefix) {
      if (!snap) return;
      state.isRestoringHistory = true;
      stopPlayback();
      state.ranges = cloneRanges(snap.ranges);
      state.selected = clamp(snap.selected ?? state.selected, 0, Math.max(0, state.ranges.length - 1));
      state.selectedSilence = null; state.wordSelection = null;
      markDirty();
      renderTimeline(); renderInspector({ focusTranscript: true });
      if (state.ranges[state.selected]) {
        seekSource(state.ranges[state.selected].start, false);
        scrollToTime(state.ranges[state.selected].start);
      }
      state.isRestoringHistory = false;
      updateHistoryButtons();
      setStatus(prefix + ": " + (snap.label || "change"));
    }
    function undoEdit() {
      const s = state.undoStack.pop(); if (!s) return;
      state.redoStack.push(editSnapshot(s.label));
      if (state.redoStack.length > HISTORY_LIMIT) state.redoStack.shift();
      restoreSnapshot(s, "Undone");
    }
    function redoEdit() {
      const s = state.redoStack.pop(); if (!s) return;
      state.undoStack.push(editSnapshot(s.label));
      if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
      restoreSnapshot(s, "Redone");
    }

    // ── Icons ──
    function iconSvg(name) {
      const icons = {
        play: '<polygon points="8 5 19 12 8 19 8 5"></polygon>',
        pause: '<path d="M10 5v14"></path><path d="M14 5v14"></path>',
        "play-circle": '<circle cx="12" cy="12" r="9"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>',
        scissors: '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M20 4 8.5 15.5"></path><path d="M14 14 20 20"></path><path d="M8.5 8.5 12 12"></path>',
        plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
        trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>',
        info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path>',
        x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
        undo: '<path d="M9 14 4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
        redo: '<path d="m15 14 5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h3"></path>',
        reset: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path>',
        film: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 5v14"></path><path d="M17 5v14"></path><path d="M3 9h4"></path><path d="M3 15h4"></path><path d="M17 9h4"></path><path d="M17 15h4"></path>',
        refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2"></path><path d="M4 5v4h4"></path><path d="M4 13a8.1 8.1 0 0 0 15.5 2"></path><path d="M20 19v-4h-4"></path>',
        "step-left": '<path d="M19 12H5"></path><path d="M12 5l-7 7 7 7"></path>',
        "step-right": '<path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>',
        "skip-left": '<path d="M5 19V5"></path><path d="m19 5-10 7 10 7V5Z"></path>',
        "skip-right": '<path d="M19 5v14"></path><path d="m5 19 10-7L5 5v14Z"></path>',
        magnet: '<path d="M6 15V7a6 6 0 0 1 12 0v8"></path><path d="M6 15a6 6 0 0 0 12 0"></path><path d="M6 11h4"></path><path d="M14 11h4"></path>',
        "zoom-in": '<circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>',
        "zoom-out": '<circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path><path d="M8 11h6"></path>',
        maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>',
      };
      return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (icons[name] || icons.play) + '</svg>';
    }
    function escapeHtml(t) {
      return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function setIconButton(btn, icon, label, cls) {
      if (!btn) return;
      btn.className = cls || "icon-btn";
      btn.title = label; btn.setAttribute("aria-label", label);
      btn.innerHTML = iconSvg(icon) + '<span class="sr-only">' + escapeHtml(label) + '</span>';
    }
    function hydrateIconButtons() {
      document.querySelectorAll("[data-icon]").forEach(btn => {
        if (btn.dataset.iconReady === "1") return;
        btn.insertAdjacentHTML("afterbegin", iconSvg(btn.dataset.icon));
        btn.dataset.iconReady = "1";
      });
    }

    // ── Data helpers ──
    function textBetween(s, e) {
      if (!state.project || e <= s) return "";
      return cleanText(state.project.words.filter(w => w.end > s && w.start < e).map(w => w.text).join(" "));
    }
    function wordsBetween(s, e) {
      if (!state.project || e <= s) return [];
      return state.project.words.filter(w => w.end > s && w.start < e);
    }
    function wordsToText(words) { return cleanText(words.map(w => w.text).join(" ")); }
    function groupWordsIntoChunks(words, gap, max) {
      gap = gap || 0.55; max = max || 42;
      const chunks = []; let cur = [];
      const flush = () => { if (!cur.length) return; chunks.push({ words: cur, start: round3(cur[0].start), end: round3(cur.at(-1).end), text: wordsToText(cur) }); cur = []; };
      for (const w of words) { const prev = cur.at(-1); if (prev && (w.start - prev.end >= gap || cur.length >= max)) flush(); cur.push(w); }
      flush(); return chunks;
    }

    function outputOffsets() {
      let off = 0;
      return state.ranges.map(r => { const d = r.end - r.start; const s = { output_start: off, output_end: off + d }; off += d; return s; });
    }
    function totalOutputDuration() { return state.ranges.reduce((s, r) => s + Math.max(0, r.end - r.start), 0); }

    // ── Silence helpers ──
    function silenceKey(s) { return round3(s.start) + ":" + round3(s.end); }
    function clippedSilenceForRange(s, r, i) {
      const st = round3(clamp(s.start, r.start, r.end)), en = round3(clamp(s.end, r.start, r.end));
      return { sourceStart: round3(s.start), sourceEnd: round3(s.end), start: st, end: en, duration: round3(en - st), rangeIndex: i };
    }
    function silencesForRange(i) {
      const r = state.ranges[i]; if (!state.project || !r) return [];
      return state.project.silences.map(s => clippedSilenceForRange(s, r, i)).filter(s => s.duration >= 0.18).filter(s => s.end > r.start + 0.04 && s.start < r.end - 0.04);
    }
    function rangeIndexForSilence(s) { return state.ranges.findIndex((r, i) => clippedSilenceForRange(s, r, i).duration >= 0.18); }
    function isSelectedSilence(s, ri) {
      return Boolean(state.selectedSilence && state.selectedSilence.rangeIndex === (ri ?? state.selected) && state.selectedSilence.start === round3(s.start) && state.selectedSilence.end === round3(s.end));
    }
    function selectSilence(ri, s, jump) {
      const next = clamp(ri, 0, state.ranges.length - 1);
      if (next !== state.selected) state.wordSelection = null;
      state.selected = next;
      state.selectedSilence = { rangeIndex: next, start: round3(s.start), end: round3(s.end) };
      updateTimelinePositions(); renderInspector({ focusTranscript: false });
      if (jump) { $("sourceVideo").currentTime = Math.max(0, s.start - 0.2); scrollToTime(s.start); }
    }
    function silenceAtTime(t) {
      const ri = rangeIndexAtTime(t); if (ri === -1) return null;
      const s = silencesForRange(ri).find(x => t >= x.start && t <= x.end);
      return s ? { rangeIndex: ri, silence: s } : null;
    }
    function syncSilenceSelectionToPlayhead() {
      const hit = silenceAtTime($("sourceVideo").currentTime || 0);
      if (!hit || isSelectedSilence(hit.silence, hit.rangeIndex)) return;
      state.selected = hit.rangeIndex;
      state.selectedSilence = { rangeIndex: hit.rangeIndex, start: round3(hit.silence.start), end: round3(hit.silence.end) };
      updateTimelinePositions(); renderInspector();
    }

    // ── Timeline math ──
    function px(t) { return t * state.scale; }
    function timeFromClientX(cx) { const rect = $("timelineTrack").getBoundingClientRect(); return clamp((cx - rect.left) / state.scale, 0, state.project.duration); }
    function nearest(sorted, t) {
      if (!sorted.length) return t;
      let lo = 0, hi = sorted.length - 1;
      while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (sorted[mid] < t) lo = mid + 1; else hi = mid; }
      const r = sorted[lo], l = sorted[Math.max(0, lo - 1)];
      return Math.abs(l - t) <= Math.abs(r - t) ? l : r;
    }
    function editBoundaries() { const v = []; for (const r of state.ranges) { v.push(r.start, r.end); } return v.sort((a, b) => a - b); }
    function rangeIndexAtTime(t) { return state.ranges.findIndex(r => t >= r.start && t < r.end); }
    function nextRangeIndexAfter(t) { const n = state.ranges.findIndex(r => r.end > t + 0.03); return n === -1 ? state.ranges.length : n; }

    function snapSeekTime(t) {
      if (!$("playheadSnapToggle").checked) return round3(t);
      const b = editBoundaries(), s = nearest(b, t), th = Math.min(0.25, Math.max(0.05, 6 / state.scale));
      if (Math.abs(s - t) <= th) return round3(s);
      return round3(t);
    }
    function seekSource(t, sel) {
      const nt = snapSeekTime(t); $("sourceVideo").currentTime = nt;
      if (sel !== false) { const i = rangeIndexAtTime(nt); if (i !== -1) selectSegment(i, false); }
      updatePlayhead();
    }
    function snapTime(t, side) {
      if (!$("snapToggle").checked) return round3(t);
      return round3(nearest(side === "start" ? state.project.wordStarts : state.project.wordEnds, t));
    }
    function boundsFor(i, side) {
      const c = state.ranges[i], p = state.ranges[i - 1], n = state.ranges[i + 1];
      if (side === "start") return { min: p ? p.end + 0.02 : 0, max: c.end - 0.08 };
      return { min: c.start + 0.08, max: n ? n.start - 0.02 : state.project.duration };
    }
    function setBoundaryValue(i, side, raw, opts) {
      opts = opts || {};
      const b = boundsFor(i, side);
      const clipped = clamp(raw, b.min, b.max);
      let nt = opts.snap === false ? clipped : clamp(snapTime(clipped, side), b.min, b.max);
      const prev = state.ranges[i][side]; state.ranges[i][side] = round3(nt);
      return prev !== state.ranges[i][side];
    }
    function setBoundary(i, side, raw, opts) {
      opts = typeof opts === "object" ? opts : { recordHistory: Boolean(opts) };
      const before = opts.recordHistory === false ? null : editSnapshot(opts.historyLabel);
      const changed = setBoundaryValue(i, side, raw, opts);
      state.selectedSilence = null;
      if (changed) {
        if (opts.recordHistory !== false) pushUndoSnapshot(before, opts.historyLabel || "Adjust " + (side === "start" ? "start" : "end"));
        markDirty({ autosave: opts.autosave !== false });
      }
      updateTimelinePositions(); renderInspector({ focusTranscript: Boolean(opts.focusTranscript) });
      return changed;
    }
    function applyNudge(side, amount) {
      const scope = $("nudgeScope").value;
      const label = "Move " + (side === "start" ? "start" : "end") + " " + Math.abs(amount * 1000).toFixed(0) + " ms";
      if (scope !== "all") { setBoundary(state.selected, side, state.ranges[state.selected][side] + amount, { historyLabel: label, snap: false }); return; }
      const before = editSnapshot(label + " for all"); let changed = 0;
      state.ranges.forEach((r, i) => { if (setBoundaryValue(i, side, r[side] + amount, { snap: false })) changed++; });
      state.selectedSilence = null;
      if (changed) { pushUndoSnapshot(before, label + " for all"); markDirty(); }
      updateTimelinePositions(); renderInspector();
    }

    // ── Autosave ──
    function scheduleAutosave(delay) {
      if (!state.project || state.rendering) return;
      window.clearTimeout(state.autosaveTimer);
      setOperationState("Unsaved changes...", "pending");
      state.autosaveTimer = window.setTimeout(() => {
        saveEdl({ auto: true }).catch(e => { $("dirtyState").textContent = "error"; setOperationState("Error", "error"); setStatus(e.message); });
      }, delay || 900);
    }
    function markDirty(opts) {
      state.dirty = true; state.editVersion++;
      $("dirtyState").textContent = "unsaved";
      if (!opts || opts.autosave !== false) scheduleAutosave();
    }

    // ── Segment selection ──
    function selectSegment(i, jump) {
      const next = clamp(i, 0, state.ranges.length - 1);
      if (next !== state.selected) { state.wordSelection = null; state.selectedSilence = null; }
      state.selected = next;
      updateTimelinePositions(); renderInspector({ focusTranscript: true });
      scrollToTime(state.ranges[state.selected].start);
      if (jump) $("sourceVideo").currentTime = state.ranges[state.selected].start;
    }
    function scrollToTime(t) {
      const vp = $("timelineViewport");
      vp.scrollLeft = Math.max(0, px(t) - vp.clientWidth * 0.35);
    }

    // ── Playback ──
    function updateTransportTimecode() {
      const el = $("playModeLabel"), v = $("sourceVideo");
      if (!el || !v) return;
      const duration = (state.project && state.project.duration) || v.duration || 0;
      const mode = state.playMode === "paused" ? state.playbackChoice : state.playMode;
      el.dataset.mode = state.playMode === "paused" ? "" : state.playMode;
      el.title = mode === "edit" ? "Source time during cut playback" : mode === "source" ? "Source time" : mode === "context" ? "Source time with context" : "Source time";
      el.textContent = formatTime(v.currentTime || 0) + " / " + formatTime(duration);
    }
    function playWindow(s, e) { setPlayMode("context"); state.stopAt = e; $("sourceVideo").currentTime = Math.max(0, s); $("sourceVideo").play(); }
    function setPlayMode(mode) {
      state.playMode = mode;
      const playing = mode !== "paused";
      setIconButton($("playPauseButton"), playing ? "pause" : "play", playing ? "Pause (Space)" : "Play (Space)", "transport-play " + (playing ? "danger" : "success"));
      updateTransportTimecode();
    }
    function setPlaybackChoice(c) {
      state.playbackChoice = c;
      $("modeEditButton").classList.toggle("active", c === "edit");
      $("modeSourceButton").classList.toggle("active", c === "source");
      if ($("greenOnlyToggle")) $("greenOnlyToggle").checked = c === "edit";
      if (state.playMode !== "paused") stopPlayback();
      updateTransportTimecode();
    }
    function togglePlayback() { if (state.playMode !== "paused") { stopPlayback(); return; } if (state.playbackChoice === "source") startSourcePlayback(); else startEditPlayback(false); }
    function stopPlayback() { $("sourceVideo").pause(); state.stopAt = null; setPlayMode("paused"); }
    function startSourcePlayback() { state.stopAt = null; setPlayMode("source"); $("sourceVideo").play(); }
    function startEditPlayback(fromSel) {
      if (!state.ranges.length) return;
      const ct = $("sourceVideo").currentTime || 0;
      let i = fromSel ? state.selected : rangeIndexAtTime(ct);
      let startAt = ct;
      if (i === -1) {
        i = nextRangeIndexAfter(ct);
        startAt = state.ranges[i]?.start || 0;
      }
      if (i >= state.ranges.length) i = 0;
      if (fromSel) startAt = state.ranges[i].start;
      state.editPlaybackIndex = i; selectSegment(i, false); setPlayMode("edit");
      $("sourceVideo").currentTime = clamp(startAt, state.ranges[i].start, state.ranges[i].end); $("sourceVideo").play(); scrollToTime($("sourceVideo").currentTime);
    }
    function continueEditPlayback() {
      if (state.playMode !== "edit") return;
      const v = $("sourceVideo"), c = state.ranges[state.editPlaybackIndex];
      if (!c) { stopPlayback(); return; }
      if (v.currentTime < c.end - 0.035) return;
      const ni = state.editPlaybackIndex + 1;
      if (ni >= state.ranges.length) { v.pause(); v.currentTime = c.end; setPlayMode("paused"); return; }
      state.editPlaybackIndex = ni; selectSegment(ni, false);
      v.currentTime = state.ranges[ni].start; v.play(); scrollToTime(state.ranges[ni].start);
    }
`;
}
