// trim-ui-parts/script-render.js
// Timeline rendering, inspector, transcript, silence cutting
export function scriptRender() {
  return `
    // ── Timeline rendering ──
    function renderTimeline() {
      const d = state.project.duration;
      $("timelineTrack").style.width = Math.max($("timelineViewport").clientWidth, px(d)) + "px";
      renderRuler(); renderSilences(); renderEdges(); renderSegments(); updatePlayhead();
    }
    function renderRuler() {
      const ruler = $("ruler"); ruler.innerHTML = "";
      const step = state.scale < 4 ? 60 : state.scale < 9 ? 30 : state.scale < 24 ? 10 : state.scale < 60 ? 5 : 1;
      for (let t = 0; t <= state.project.duration; t += step) {
        const tick = document.createElement("div"); tick.className = "tick"; tick.style.left = px(t) + "px";
        const lbl = document.createElement("span"); lbl.textContent = formatTime(t);
        tick.appendChild(lbl); ruler.appendChild(tick);
      }
    }
    function renderSilences() {
      const layer = $("silenceLayer"); layer.innerHTML = "";
      for (const s of state.project.silences) {
        if (s.duration < 0.25) continue;
        const ri = rangeIndexForSilence(s);
        const cl = ri !== -1 ? clippedSilenceForRange(s, state.ranges[ri], ri) : s;
        const el = document.createElement("div");
        el.className = "silence-overlay" + (ri !== -1 ? " removable" : "") + (isSelectedSilence(cl, ri) ? " selected-silence" : "");
        el.style.left = px(s.start) + "px"; el.style.width = Math.max(2, px(s.end - s.start)) + "px";
        el.title = formatTime(s.start) + "-" + formatTime(s.end) + " (" + s.duration.toFixed(2) + "s)";
        if (ri !== -1) el.addEventListener("click", (ev) => { ev.stopPropagation(); selectSilence(ri, cl, true); });
        layer.appendChild(el);
      }
    }
    function renderEdges() {
      const layer = $("edgeLayer"); layer.innerHTML = "";
      state.ranges.forEach(r => {
        const s = document.createElement("div"); s.className = "edge-marker start"; s.style.left = px(r.start) + "px";
        const e = document.createElement("div"); e.className = "edge-marker end"; e.style.left = px(r.end) + "px";
        layer.append(s, e);
      });
    }
    function renderSegments() {
      const layer = $("segmentLayer"); layer.innerHTML = "";
      state.ranges.forEach((r, i) => {
        const el = document.createElement("div");
        el.className = "segment" + (i === state.selected ? " selected" : "");
        el.dataset.index = String(i);
        el.style.left = px(r.start) + "px"; el.style.width = Math.max(6, px(r.end - r.start)) + "px";
        const lh = document.createElement("div"); lh.className = "handle left"; lh.dataset.index = String(i); lh.dataset.side = "start";
        const rh = document.createElement("div"); rh.className = "handle right"; rh.dataset.index = String(i); rh.dataset.side = "end";
        const lbl = document.createElement("div"); lbl.className = "segment-label"; lbl.textContent = "#" + (i + 1) + " " + (r.beat || "");
        const tm = document.createElement("div"); tm.className = "segment-time"; tm.textContent = formatTime(r.start) + "-" + formatTime(r.end);
        el.append(lh, rh, lbl, tm); layer.appendChild(el);
      });
    }
    function updateTimelinePositions() {
      renderSilences(); renderEdges();
      document.querySelectorAll(".segment").forEach(el => {
        const i = Number(el.dataset.index), r = state.ranges[i];
        el.classList.toggle("selected", i === state.selected);
        el.style.left = px(r.start) + "px"; el.style.width = Math.max(6, px(r.end - r.start)) + "px";
        const tm = el.querySelector(".segment-time"); if (tm) tm.textContent = formatTime(r.start) + "-" + formatTime(r.end);
      });
      $("summary").textContent = state.ranges.length + " segments | src " + formatTime(state.project.duration) + " | out " + formatTime(totalOutputDuration());
      updatePlayhead();
    }
    function updatePlayhead() {
      if (!state.project) return;
      const ct = $("sourceVideo").currentTime || 0;
      $("playhead").style.left = px(ct) + "px"; $("playheadLabel").textContent = formatTime(ct);
      updateTransportTimecode();
    }

    // ── Inspector ──
    function renderSegmentSilences() {
      const list = $("segmentSilences"); list.innerHTML = "";
      const sils = silencesForRange(state.selected);
      $("segmentSilenceCount").textContent = String(sils.length);
      if (!sils.length) { list.innerHTML = '<div style="color:var(--t3);font-size:11px;padding:4px 0;">No silences in this segment.</div>'; return; }
      for (const s of sils) {
        const card = document.createElement("div");
        card.className = "silence-card" + (isSelectedSilence(s, state.selected) ? " selected" : "");
        const info = document.createElement("button"); info.type = "button"; info.className = "silence-info";
        info.textContent = formatTime(s.start) + "-" + formatTime(s.end) + " | " + s.duration.toFixed(2) + "s";
        info.addEventListener("click", () => selectSilence(state.selected, s, true));
        const prev = document.createElement("button"); prev.type = "button";
        setIconButton(prev, "eye", "Preview");
        prev.addEventListener("click", () => { selectSilence(state.selected, s, false); const r = state.ranges[state.selected]; playWindow(Math.max(r.start, s.start - 0.35), Math.min(r.end, s.end + 0.35)); });
        const cut = document.createElement("button"); cut.type = "button";
        setIconButton(cut, "scissors", "Cut silence", "icon-btn danger");
        cut.addEventListener("click", () => cutSilenceFromRange(state.selected, s));
        card.append(info, prev, cut); list.appendChild(card);
      }
    }
    function renderInspector(opts) {
      if (!state.project) return; opts = opts || {};
      const ts = $("transcriptScroll"), prevScroll = ts ? ts.scrollTop : 0;
      const i = state.selected, r = state.ranges[i], spans = outputOffsets(), sp = spans[i] || { output_start: 0, output_end: 0 };
      $("selectedTitle").textContent = "#" + (i + 1) + " " + (r.beat || "segment");
      $("selectedOutput").textContent = formatTime(sp.output_start) + " - " + formatTime(sp.output_end);
      $("startInput").value = formatTime(r.start); $("endInput").value = formatTime(r.end);
      renderSegmentSilences(); renderTranscriptFlow();
      if (opts.focusTranscript) focusSelectedTranscriptBlock();
      else if (ts) ts.scrollTop = prevScroll;
    }

    // ── Transcript ──
    function transcriptBlocks() {
      if (!state.project) return [];
      const blocks = [], sorted = state.ranges.map((r, i) => ({ ...r, index: i })).sort((a, b) => a.start - b.start);
      let cursor = 0, dn = 1;
      const addDrop = (s, e, lbl) => {
        for (const g of groupWordsIntoChunks(wordsBetween(s, e))) {
          blocks.push({ type: "drop", context: "drop_" + dn + "_" + round3(g.start) + "_" + round3(g.end), number: dn, label: lbl, start: g.start, end: g.end, words: g.words, text: g.text }); dn++;
        }
      };
      sorted.forEach((r, pos) => {
        if (r.start > cursor + 0.02) addDrop(cursor, r.start, "Removed #" + (pos + 1));
        blocks.push({ type: "keep", context: "keep_" + r.index, index: r.index, number: r.index + 1, label: r.beat || "segment", start: round3(r.start), end: round3(r.end), words: wordsBetween(r.start, r.end), text: textBetween(r.start, r.end) || "(no words)" });
        cursor = Math.max(cursor, r.end);
      });
      if (state.project.duration > cursor + 0.02) addDrop(cursor, state.project.duration, "Final");
      return blocks;
    }
    function focusSelectedTranscriptBlock() {
      const sc = $("transcriptScroll"); if (!sc) return;
      const tgt = sc.querySelector('[data-range-index="' + state.selected + '"]');
      if (tgt) sc.scrollTop = Math.max(0, tgt.offsetTop - sc.offsetTop - sc.clientHeight * 0.35);
    }
    function renderTranscriptFlow() {
      const flow = $("transcriptFlow"); flow.innerHTML = "";
      const blocks = transcriptBlocks();
      $("transcriptDropCount").textContent = blocks.filter(b => b.type === "drop").length + " removed";
      if (!blocks.length) { flow.innerHTML = '<div class="text-block">No transcript.</div>'; return; }
      for (const b of blocks) {
        const sec = document.createElement("section");
        sec.className = "t-block " + b.type + (b.index === state.selected ? " current" : "");
        if (b.type === "keep") sec.dataset.rangeIndex = String(b.index);
        const head = document.createElement("div"); head.className = "t-block-head";
        const title = document.createElement("div"); title.className = "t-block-title";
        title.textContent = "#" + b.number + " " + b.label;
        const acts = document.createElement("div"); acts.className = "t-block-actions";
        const time = document.createElement("span"); time.className = "badge"; time.textContent = formatTime(b.start) + "-" + formatTime(b.end);
        acts.appendChild(time);
        const viewBtn = document.createElement("button"); viewBtn.type = "button";
        setIconButton(viewBtn, "eye", b.type === "keep" ? "Go" : "View");
        viewBtn.addEventListener("click", () => { stopPlayback(); if (b.type === "keep") selectSegment(b.index, true); else { seekSource(b.start, false); scrollToTime(b.start); } });
        acts.appendChild(viewBtn);
        if (b.type === "drop") {
          const addBtn = document.createElement("button"); addBtn.type = "button";
          setIconButton(addBtn, "plus", "Add as segment", "icon-btn success");
          addBtn.addEventListener("click", () => insertWordsAsRange(b.words, "Inserted deleted block."));
          acts.appendChild(addBtn);
        }
        head.append(title, acts);
        const txt = document.createElement("div"); txt.className = "text-block " + (b.type === "keep" ? "keep" : "drop");
        if (b.type === "drop") renderDeletedWordsElement(txt, b.words, b.context); else txt.textContent = b.text;
        sec.append(head, txt); flow.appendChild(sec);
      }
    }

    // ── Word selection ──
    function selectionBounds() {
      if (!state.wordSelection) return null;
      const s = Math.min(state.wordSelection.anchor, state.wordSelection.focus), e = Math.max(state.wordSelection.anchor, state.wordSelection.focus);
      return { start: s, end: e, context: state.wordSelection.context };
    }
    function isSelectedWord(i, ctx) { const b = selectionBounds(); return Boolean(b && b.context === ctx && i >= b.start && i <= b.end); }
    function selectedWords() { const b = selectionBounds(); if (!b) return []; return state.project.words.filter(w => w.index >= b.start && w.index <= b.end); }
    function updateDeletedSelectionUi() {
      document.querySelectorAll(".word-chip").forEach(c => c.classList.toggle("selected", isSelectedWord(Number(c.dataset.wordIndex), c.dataset.context)));
      const ws = selectedWords();
      $("deletedSelectionLabel").textContent = ws.length ? formatTime(ws[0].start) + "-" + formatTime(ws.at(-1).end) + " (" + ws.length + ")" : "no selection";
    }
    function setWordSelection(ctx, wi, ext) {
      if (!ext || !state.wordSelection || state.wordSelection.context !== ctx) state.wordSelection = { context: ctx, anchor: wi, focus: wi };
      else state.wordSelection.focus = wi;
      updateDeletedSelectionUi();
    }
    function renderDeletedWordsElement(container, words, ctx) {
      container.innerHTML = ""; container.classList.add("word-list");
      if (!words.length) { container.textContent = "(no text)"; return; }
      for (const w of words) {
        const c = document.createElement("button"); c.type = "button"; c.className = "word-chip";
        c.dataset.wordIndex = String(w.index); c.dataset.context = ctx; c.textContent = w.text;
        c.title = formatTime(w.start) + "-" + formatTime(w.end);
        c.addEventListener("pointerdown", ev => { ev.preventDefault(); state.selectingWords = true; setWordSelection(ctx, w.index, ev.shiftKey); });
        c.addEventListener("pointerenter", () => { if (state.selectingWords) setWordSelection(ctx, w.index, true); });
        c.addEventListener("click", ev => ev.preventDefault());
        container.appendChild(c);
      }
      updateDeletedSelectionUi();
    }

    // ── Cutting & inserting ──
    function cutSilenceFromRange(ri, s) {
      stopPlayback(); const r = state.ranges[ri]; if (!r) return;
      const cs = round3(clamp(s.start, r.start, r.end)), ce = round3(clamp(s.end, r.start, r.end));
      if (ce - cs < 0.08) { setStatus("Silence too short."); return; }
      const note = "Removed silence " + formatTime(cs) + "-" + formatTime(ce);
      const frags = [];
      if (cs - r.start >= 0.08) frags.push({ ...r, end: cs, quote: textBetween(r.start, cs) || r.quote || "", reason: [r.reason, note].filter(Boolean).join(" ") });
      if (r.end - ce >= 0.08) frags.push({ ...r, start: ce, beat: (r.beat || "segment") + "_after_" + (ri + 1), quote: textBetween(ce, r.end) || r.quote || "", reason: [r.reason, note].filter(Boolean).join(" ") });
      if (!frags.length) { setStatus("Cutting would remove the whole segment."); return; }
      const before = editSnapshot("Cut silence");
      const target = frags.length > 1 ? frags[1] : frags[0];
      state.ranges.splice(ri, 1, ...frags); state.ranges.sort((a, b) => a.start - b.start);
      const ni = state.ranges.findIndex(x => x === target);
      state.selected = ni === -1 ? clamp(ri, 0, state.ranges.length - 1) : ni;
      state.selectedSilence = null;
      pushUndoSnapshot(before, "Cut silence"); markDirty();
      renderTimeline(); renderInspector({ focusTranscript: true });
      seekSource(target.start, false); scrollToTime(target.start);
    }
    function insertWordsAsRange(raw, reason) {
      const words = [...raw].sort((a, b) => a.start - b.start);
      if (!words.length) { setStatus("No words to add."); return; }
      const s = round3(words[0].start), e = round3(words.at(-1).end);
      if (e - s < 0.08) { setStatus("Selection too short."); return; }
      if (state.ranges.some(r => s < r.end && e > r.start)) { setStatus("Overlaps an existing segment."); return; }
      const nr = { source: state.project.source_name, start: s, end: e, beat: "insert_" + (state.ranges.length + 1), quote: cleanText(words.map(w => w.text).join(" ")), reason };
      const before = editSnapshot("Add segment");
      state.ranges.push(nr); state.ranges.sort((a, b) => a.start - b.start);
      const ni = state.ranges.findIndex(r => r === nr);
      state.selected = ni === -1 ? 0 : ni; state.wordSelection = null; state.selectedSilence = null;
      pushUndoSnapshot(before, "Add segment"); markDirty();
      renderTimeline(); renderInspector({ focusTranscript: true }); seekSource(s, false);
    }
    function addSelectedDeletedRange() { const ws = selectedWords(); if (!ws.length) { setStatus("Select words first."); return; } insertWordsAsRange(ws, "Inserted selected words."); }
    function clearDeletedSelection() { state.wordSelection = null; updateDeletedSelectionUi(); }
    function resetToPrimaryCut() {
      if (state.rendering) return;
      if (!state.primaryRanges.length) { setOperationState("No primary cut", "error"); return; }
      if (sameRanges(state.ranges, state.primaryRanges)) { setOperationState("Already at primary cut", "saved"); return; }
      const before = editSnapshot("Reset");
      state.ranges = cloneRanges(state.primaryRanges); state.selected = 0; state.wordSelection = null; state.selectedSilence = null;
      pushUndoSnapshot(before, "Reset"); markDirty();
      renderTimeline(); renderInspector({ focusTranscript: true });
      seekSource(state.ranges[0]?.start || 0, false); scrollToTime(state.ranges[0]?.start || 0);
      setOperationState("Reset applied", "pending");
    }
`;
}
