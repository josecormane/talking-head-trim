// trim-ui-parts/script-events.js
// API calls, event wiring, keyboard shortcuts, initialization
export function scriptEvents() {
  return `
    // ── API ──
    async function saveEdl(opts) {
      window.clearTimeout(state.autosaveTimer); opts = opts || {};
      if (state.savePromise) { await state.savePromise; await new Promise(r => setTimeout(r, 0)); if (state.dirty) return saveEdl(opts); return state.lastSaveData; }
      const ver = state.editVersion, auto = Boolean(opts.auto);
      setOperationState(auto ? "Autosaving..." : "Saving...", "busy");
      setTextButtonBusy("saveButton", true, auto ? "Auto..." : "Saving...");
      state.savePromise = (async () => {
        const res = await fetch("/api/save-edl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ranges: state.ranges }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Error"); return data;
      })();
      try {
        const data = await state.savePromise; state.lastSaveData = data; const at = visibleTime();
        if (state.editVersion === ver) { state.dirty = false; $("dirtyState").textContent = (auto ? "auto " : "") + at; setOperationState((auto ? "Auto " : "Saved ") + at, "saved"); }
        else { $("dirtyState").textContent = "pending"; scheduleAutosave(350); }
        setStatus("Changes saved.\\\\nCut duration: " + formatTime(data.output_duration)); return data;
      } catch (e) { $("dirtyState").textContent = "error"; setOperationState("Error", "error"); setStatus(e.message); throw e; }
      finally { state.savePromise = null; if (!state.rendering) setTextButtonBusy("saveButton", false); }
    }
    async function renderPreview() {
      if (state.rendering) return; setRenderBusy("previewButton", true, "Rendering preview...");
      try { await saveEdl(); setOperationState("Rendering preview...", "busy");
        const res = await fetch("/api/render-preview", { method: "POST" }); const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        setOperationState("Preview ready " + visibleTime(), "saved"); setStatus("Preview: " + data.output_path);
      } catch (e) { setOperationState("Preview error", "error"); setStatus(e.message); throw e; }
      finally { setRenderBusy(null, false); }
    }
    async function renderFinal() {
      if (state.rendering) return; setRenderBusy("finalButton", true, "Rendering final...");
      try { await saveEdl(); setOperationState("Rendering final...", "busy");
        const res = await fetch("/api/render-final", { method: "POST" }); const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        await loadFinalRenders({ selectLatest: false });
        setOperationState("Final ready " + visibleTime(), "saved"); setStatus("Final: " + data.output_path); openRenders();
      } catch (e) { setOperationState("Final error", "error"); setStatus(e.message); throw e; }
      finally { setRenderBusy(null, false); }
    }
    function setStatus(t) { $("status").textContent = t; }

    // ── Renders modal ──
    function renderDateLabel(v) {
      if (!v) return "n/a"; const d = new Date(v); if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    function renderDurationLabel(s) { return s != null && Number.isFinite(Number(s)) ? formatTime(Number(s)) : "n/a"; }
    function setRenderLibraryCount(c) { $("renderCountBadge").textContent = String(c || 0); $("rendersSummary").textContent = (c || 0) + " renders"; }
    function renderFinalRenderList() {
      const list = $("renderList");
      if (!state.finalRenders.length) { list.innerHTML = '<div class="empty-state">No final renders yet.</div>'; clearRenderPreview("Render to see results."); return; }
      list.innerHTML = state.finalRenders.map((r, i) => {
        const sel = r.path === state.selectedRenderPath ? " selected" : "";
        const tags = [r.is_latest ? '<span class="tag latest">latest</span>' : "", r.is_backup ? '<span class="tag backup">backup</span>' : "", '<span class="tag">' + escapeHtml(r.size_label || "") + "</span>"].filter(Boolean).join("");
        const detail = [renderDateLabel(r.created_at || r.modified_at), renderDurationLabel(r.duration), r.filename].filter(Boolean).join(" | ");
        return '<button class="render-row' + sel + '" data-render-index="' + i + '"><span class="render-number">#' + r.render_number + '</span><span class="render-copy"><strong>' + escapeHtml(r.title || "Render #" + r.render_number) + '</strong><span>' + escapeHtml(detail) + '</span></span><span class="render-tags">' + tags + '</span></button>';
      }).join("");
      list.querySelectorAll(".render-row").forEach(row => row.addEventListener("click", () => { const r = state.finalRenders[Number(row.dataset.renderIndex)]; if (r) selectFinalRender(r); }));
    }
    function selectFinalRender(r, opts) {
      state.selectedRenderPath = r.path; opts = opts || {};
      $("renderEmptyPreview").hidden = true;
      $("renderPreviewToolbar").hidden = false;
      const v = $("renderPreviewVideo");
      v.pause(); v.controls = false; v.hidden = false; v.src = r.media_url; v.playsInline = true; v.load(); updateRenderPlayButton();
      if (opts.play) v.play().catch(() => {});
      $("renderDetails").innerHTML = '<strong>' + escapeHtml(r.title || "Render #" + r.render_number) + '</strong><span>' + escapeHtml(renderDateLabel(r.created_at || r.modified_at)) + '</span><span>' + escapeHtml(renderDurationLabel(r.duration)) + ' | ' + escapeHtml(r.size_label || "n/a") + '</span><span>' + escapeHtml(r.path) + '</span>';
      renderFinalRenderList();
    }
    function clearRenderPreview(message) {
      state.selectedRenderPath = "";
      const v = $("renderPreviewVideo");
      v.pause(); v.controls = false; v.removeAttribute("src"); v.load(); v.hidden = true; updateRenderPlayButton();
      $("renderEmptyPreview").hidden = false;
      $("renderPreviewToolbar").hidden = true;
      $("renderEmptyPreview").textContent = message || "Select a render from the list.";
      $("renderDetails").textContent = message || "Select a render.";
    }
    function updateRenderPlayButton() {
      const b = $("renderPlayButton"), v = $("renderPreviewVideo");
      if (!b || !v) return;
      const playing = !v.paused && !v.ended;
      b.innerHTML = iconSvg(playing ? "pause" : "play") + '<span>' + (playing ? "Pause" : "Play") + '</span>';
      b.title = playing ? "Pause in panel" : "Play in panel";
      b.setAttribute("aria-label", b.title);
      b.dataset.iconReady = "1";
    }
    function toggleRenderPreviewPlayback() {
      const v = $("renderPreviewVideo");
      if (!state.selectedRenderPath || v.hidden || !v.src) return;
      if (v.paused || v.ended) v.play().catch(e => setStatus(e.message));
      else v.pause();
    }
    function openSelectedRenderFullscreen() {
      const v = $("renderPreviewVideo");
      if (!state.selectedRenderPath || v.hidden || !v.src) return;
      v.controls = true;
      const target = v.requestFullscreen ? v : v.parentElement;
      if (target.requestFullscreen) target.requestFullscreen().catch(e => setStatus(e.message));
    }
    async function loadFinalRenders(opts) {
      opts = opts || {};
      const res = await fetch("/api/final-renders"); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      state.finalRenders = data.renders || []; setRenderLibraryCount(data.total || state.finalRenders.length);
      if (!state.finalRenders.some(r => r.path === state.selectedRenderPath)) state.selectedRenderPath = "";
      renderFinalRenderList();
      if (opts.selectLatest && state.finalRenders.length) { const lat = state.finalRenders.find(r => r.is_latest) || state.finalRenders[0]; selectFinalRender(lat, { play: Boolean(opts.play) }); }
      return data;
    }
    function openProjectInfo() { $("projectInfoModal").hidden = false; $("closeProjectInfoButton").focus(); }
    function closeProjectInfo() { $("projectInfoModal").hidden = true; }
    function openRenders() { $("rendersModal").hidden = false; clearRenderPreview("Select a render from the list."); $("closeRendersButton").focus(); loadFinalRenders({ selectLatest: false }).catch(e => { $("renderList").innerHTML = '<div class="empty-state">' + escapeHtml(e.message) + '</div>'; }); }
    function closeRenders() { $("renderPreviewVideo").pause(); $("rendersModal").hidden = true; }

    // ── Load project ──
    async function loadProject() {
      const res = await fetch("/api/project"); const p = await res.json();
      if (!res.ok) throw new Error(p.error || "Error");
      state.project = p; state.ranges = p.ranges.map(r => ({ ...r }));
      state.primaryRanges = (p.primary_ranges || p.ranges).map(r => ({ ...r }));
      state.selected = 0; state.undoStack = []; state.redoStack = [];
      state.dirty = false; state.editVersion = 0;
      $("dirtyState").textContent = "no changes";
      $("resetButton").disabled = !state.primaryRanges.length;
      $("sourceVideo").src = "/media/source?playback=" + encodeURIComponent(p.playback_path);
      $("summary").textContent = p.ranges.length + " segments | src " + formatTime(p.duration) + " | out " + formatTime(totalOutputDuration());
      renderTimeline(); renderInspector({ focusTranscript: true }); updateHistoryButtons();
      loadFinalRenders().catch(() => setRenderLibraryCount(0));
      setOperationState("Ready", "saved");
      setStatus("Project: " + p.edl_path + "\\\\nSource: " + p.source_path + "\\\\nPlayback: " + p.playback_path + (p.playback_is_proxy ? " (proxy)" : ""));
    }

    // ── Tab switching ──
    function switchTab(tabId) {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.id === tabId));
      const target = document.querySelector("#" + tabId)?.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(p => p.hidden = p.id !== target);
    }

    // ── Events ──
    $("timelineTrack").addEventListener("pointerdown", ev => {
      if (ev.target.id === "playhead") { ev.preventDefault(); state.dragPlayhead = true; return; }
      const handle = ev.target.closest(".handle");
      if (handle) { ev.preventDefault(); stopPlayback(); const di = Number(handle.dataset.index); selectSegment(di); state.drag = { index: di, side: handle.dataset.side, before: editSnapshot("Move handle"), changed: false }; return; }
      const seg = ev.target.closest(".segment");
      if (seg) { selectSegment(Number(seg.dataset.index), false); seekSource(timeFromClientX(ev.clientX), false); return; }
      stopPlayback(); state.dragPlayhead = true; seekSource(timeFromClientX(ev.clientX));
    });
    document.addEventListener("pointermove", ev => {
      if (state.drag) { if (setBoundary(state.drag.index, state.drag.side, timeFromClientX(ev.clientX), { recordHistory: false, autosave: false })) state.drag.changed = true; return; }
      if (state.dragPlayhead) seekSource(timeFromClientX(ev.clientX));
    });
    document.addEventListener("pointerup", () => {
      if (state.drag?.changed) { pushUndoSnapshot(state.drag.before, "Move " + (state.drag.side === "start" ? "start" : "end")); scheduleAutosave(); }
      state.drag = null; state.dragPlayhead = false; state.selectingWords = false;
    });
    function setTimelineZoom(value) {
      const t = state.ranges[state.selected]?.start || $("sourceVideo").currentTime || 0;
      const slider = $("zoomSlider");
      state.scale = clamp(Number(value), Number(slider.min), Number(slider.max));
      slider.value = String(state.scale);
      $("zoomValue").textContent = state.scale + " px/s";
      renderTimeline(); scrollToTime(t);
    }
    $("zoomSlider").addEventListener("input", ev => setTimelineZoom(ev.target.value));
    $("zoomOutButton").addEventListener("click", () => setTimelineZoom(state.scale - 1));
    $("zoomInButton").addEventListener("click", () => setTimelineZoom(state.scale + 1));
    $("sourceVideo").addEventListener("timeupdate", () => {
      updatePlayhead(); continueEditPlayback(); syncSilenceSelectionToPlayhead();
      if (state.stopAt && $("sourceVideo").currentTime >= state.stopAt) { $("sourceVideo").pause(); state.stopAt = null; setPlayMode("paused"); }
    });
    $("sourceVideo").addEventListener("pause", () => { if (state.playMode !== "paused" && !state.stopAt) setPlayMode("paused"); });
    $("startInput").addEventListener("change", ev => setBoundary(state.selected, "start", parseTime(ev.target.value)));
    $("endInput").addEventListener("change", ev => setBoundary(state.selected, "end", parseTime(ev.target.value)));
    document.querySelectorAll("[data-nudge]").forEach(b => b.addEventListener("click", () => { const [s, a] = b.dataset.nudge.split(":"); applyNudge(s, Number(a)); }));
    $("playContext").addEventListener("click", () => { const r = state.ranges[state.selected]; playWindow(Math.max(0, r.start - 1.25), Math.min(state.project.duration, r.end + 1.25)); });
    $("playSegment").addEventListener("click", () => { const r = state.ranges[state.selected]; playWindow(r.start, r.end); });
    $("goPrev").addEventListener("click", () => selectSegment(state.selected - 1, true));
    $("goNext").addEventListener("click", () => selectSegment(state.selected + 1, true));
    $("modeEditButton").addEventListener("click", () => setPlaybackChoice("edit"));
    $("modeSourceButton").addEventListener("click", () => setPlaybackChoice("source"));
    $("playPauseButton").addEventListener("click", () => togglePlayback());
    $("undoButton").addEventListener("click", () => undoEdit());
    $("redoButton").addEventListener("click", () => redoEdit());
    $("resetButton").addEventListener("click", () => resetToPrimaryCut());
    $("addDeletedSelectionButton").addEventListener("click", () => addSelectedDeletedRange());
    $("clearDeletedSelectionButton").addEventListener("click", () => clearDeletedSelection());
    $("projectInfoButton").addEventListener("click", () => openProjectInfo());
    $("closeProjectInfoButton").addEventListener("click", () => closeProjectInfo());
    $("rendersButton").addEventListener("click", () => openRenders());
    $("closeRendersButton").addEventListener("click", () => closeRenders());
    $("refreshRendersButton").addEventListener("click", () => loadFinalRenders({ selectLatest: false }).catch(e => setStatus(e.message)));
    $("renderFullscreenButton").addEventListener("click", () => openSelectedRenderFullscreen());
    $("projectInfoModal").addEventListener("click", ev => { if (ev.target.id === "projectInfoModal") closeProjectInfo(); });
    $("rendersModal").addEventListener("click", ev => { if (ev.target.id === "rendersModal") closeRenders(); });
    $("renderPlayButton").addEventListener("click", () => toggleRenderPreviewPlayback());
    $("renderPreviewVideo").addEventListener("click", () => toggleRenderPreviewPlayback());
    $("renderPreviewVideo").addEventListener("play", () => updateRenderPlayButton());
    $("renderPreviewVideo").addEventListener("pause", () => updateRenderPlayButton());
    $("renderPreviewVideo").addEventListener("ended", () => updateRenderPlayButton());
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) $("renderPreviewVideo").controls = false; });
    $("saveButton").addEventListener("click", () => saveEdl().catch(e => setStatus(e.message)));
    $("previewButton").addEventListener("click", () => renderPreview().catch(e => setStatus(e.message)));
    $("finalButton").addEventListener("click", () => renderFinal().catch(e => setStatus(e.message)));
    if ($("tabSegment")) $("tabSegment").addEventListener("click", () => switchTab("tabSegment"));
    if ($("tabTranscript")) $("tabTranscript").addEventListener("click", () => switchTab("tabTranscript"));

    // ── Keyboard shortcuts ──
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && !$("rendersModal").hidden) { closeRenders(); return; }
      if (ev.key === "Escape" && !$("projectInfoModal").hidden) { closeProjectInfo(); return; }
      const tag = ev.target?.tagName?.toLowerCase();
      const editable = tag === "input" || tag === "textarea" || ev.target?.isContentEditable;
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !editable) {
        const k = ev.key.toLowerCase();
        if (k === "z") { ev.preventDefault(); if (ev.shiftKey) redoEdit(); else undoEdit(); return; }
        if (k === "y") { ev.preventDefault(); redoEdit(); return; }
        if (k === "s") { ev.preventDefault(); saveEdl().catch(e => setStatus(e.message)); return; }
      }
      if (editable) return;
      if (ev.code === "Space") { ev.preventDefault(); togglePlayback(); return; }
      // S = cut selected silence
      if (ev.key === "s" && state.selectedSilence) {
        ev.preventDefault();
        const s = silencesForRange(state.selectedSilence.rangeIndex).find(x => round3(x.start) === state.selectedSilence.start && round3(x.end) === state.selectedSilence.end);
        if (s) cutSilenceFromRange(state.selectedSilence.rangeIndex, s);
        return;
      }
      // [ ] = navigate silences
      if (ev.key === "[" || ev.key === "]") {
        ev.preventDefault();
        const sils = silencesForRange(state.selected);
        if (!sils.length) return;
        const cur = state.selectedSilence;
        let idx = -1;
        if (cur) idx = sils.findIndex(x => round3(x.start) === cur.start && round3(x.end) === cur.end);
        if (ev.key === "]") idx = idx + 1 >= sils.length ? 0 : idx + 1;
        else idx = idx - 1 < 0 ? sils.length - 1 : idx - 1;
        selectSilence(state.selected, sils[idx], true);
        return;
      }
      // Arrow left/right = prev/next segment
      if (ev.key === "ArrowLeft" && !ev.ctrlKey && !ev.metaKey) { selectSegment(state.selected - 1, true); return; }
      if (ev.key === "ArrowRight" && !ev.ctrlKey && !ev.metaKey) { selectSegment(state.selected + 1, true); return; }
    });

    hydrateIconButtons();
    loadProject().catch(e => setStatus(e.message));

    // ── Waveform via Web Audio API ──
    async function generateWaveform() {
      const video = $("sourceVideo"); if (!video.src) return;
      try {
        const resp = await fetch(video.src); const buf = await resp.arrayBuffer();
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const audio = await actx.decodeAudioData(buf);
        const raw = audio.getChannelData(0);
        const dur = audio.duration;
        const samplesPerPx = Math.floor(raw.length / (dur * 18));
        const peaks = [];
        for (let i = 0; i < raw.length; i += samplesPerPx) {
          let max = 0;
          const end = Math.min(i + samplesPerPx, raw.length);
          for (let j = i; j < end; j++) { const v = Math.abs(raw[j]); if (v > max) max = v; }
          peaks.push(max);
        }
        state.waveformPeaks = peaks;
        state.waveformDuration = dur;
        actx.close();
        drawWaveform();
      } catch (e) { console.warn("Waveform generation failed:", e); }
    }
    function drawWaveform() {
      const canvas = $("waveformCanvas"); if (!canvas || !state.waveformPeaks) return;
      const trackW = parseFloat($("timelineTrack").style.width) || canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight - 24;
      canvas.width = trackW; canvas.height = Math.max(h, 100);
      canvas.style.width = trackW + "px";
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const peaks = state.waveformPeaks;
      const pxPerSample = (state.waveformDuration * state.scale) / peaks.length;
      const mid = canvas.height / 2;
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "rgba(96,165,250,.35)");
      grad.addColorStop(0.5, "rgba(96,165,250,.55)");
      grad.addColorStop(1, "rgba(96,165,250,.35)");
      ctx.fillStyle = grad;
      for (let i = 0; i < peaks.length; i++) {
        const x = i * pxPerSample;
        if (x > canvas.width) break;
        const barH = peaks[i] * mid * 0.9;
        ctx.fillRect(x, mid - barH, Math.max(1, pxPerSample - 0.5), barH * 2);
      }
    }
    $("sourceVideo").addEventListener("loadedmetadata", () => { generateWaveform(); });
    const origRenderTimeline = renderTimeline;
    renderTimeline = function() { origRenderTimeline(); drawWaveform(); };
`;
}
