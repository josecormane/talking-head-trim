# Workflow 01: Raw Talking Head Cleanup

Use this for every recorded presenter clip before weekly news or deep dive assembly.

## Purpose

Produce one trimmed presenter video that does not require obvious editorial fixes later.

This workflow stops at the editorial cut. It does not clean noise, master audio,
remove the presenter background, create alpha, generate captions, or prepare a
HyperFrames audio track. Those are separate downstream workflows.

## Inputs

- Raw recording path.
- Approved script, outline, or plain-language content goal.
- Maximum duration policy:
  - `max_duration: MM:SS` when the video must fit a hard limit.
  - `max_duration: none` when the priority is the best coherent version.
- Cut mode, exactly one:
  - `tight_reel`
  - `natural_explainer`
- Output folder.

If a hard maximum duration is impossible without damaging the logic of the
message, stop and report the tradeoff before calling the cut final.

## Cut Modes

`tight_reel` is the strict mode. It removes almost every restart, filler,
thinking pause, repeated setup, and dead space unless the pause creates emphasis.
Inspect every speech gap over 250ms. Any kept gap over 350ms needs a written QC
reason.

`natural_explainer` is the more relaxed mode. It keeps enough cadence for the
speaker to sound human and clear, but still removes accidental thinking pauses,
false starts, and repetitions. Inspect every speech gap over 450ms. Any kept gap
over 650ms needs a written QC reason.

Both modes must respect the maximum duration policy.

## Required Tools

- `video-use`
- One transcription provider:
  - `local-whisper` for local faster-whisper word timestamps. This is the
    default and uses model `medium` unless overridden,
  - `elevenlabs` for ElevenLabs Scribe word timestamps,
  - `openai` for OpenAI Whisper word timestamps,
  - `gemini` for Gemini segment timestamps with estimated word boundaries,
  - `external` when the user already has a word-timestamp transcript JSON.
- `ffmpeg` / `ffprobe`
- `timeline_view.py`
- `npm run reel:talking-head:prepare`
- `npm run reel:talking-head:review`
- `npm run reel:talking-head:trim-ui`
- `npm run reel:talking-head:render-final`

## Output Folder

```text
<run_root>/presenter_edit/
  TALKING_HEAD_CLEANUP_BRIEF.md
  source_inventory.md
  transcripts/<source>.json
  silence_scan/<source>.txt
  takes_packed.md
  pre_scan.md
  edl_v1.json
  edl_final.json
  presenter_cut.mp4
  presenter_cut_1080x1920.mp4
  presenter_cut_pass1.mp4
  second_pass/
    presenter_cut_pass1_manifest.json
    pass1_silence_scan.txt
    pass1_silence_scan.json
    second_pass_review_packet.md
    analysis/transcripts/presenter_cut_pass1.json
  presenter_cut_final_maxres.mp4
  editor_qc.md
  review/index.html
  edl_adjusted.json
  trim_ui/
  presenter_cut_final_maxres_YYYYMMDD_HHMMSS.mp4
  presenter_cut_final_maxres_YYYYMMDD_HHMMSS.ffprobe.json
  presenter_cut_final_maxres_latest.json
  presenter_cut_final_maxres_YYYYMMDD_HHMMSS_clips/
  verify/
```

## Steps

1. Fill and approve `TALKING_HEAD_CLEANUP_BRIEF.md`.
2. Run the deterministic prep:

   ```bash
   npm run reel:talking-head:prepare -- \
     --run-root <run_root> \
     --source <raw_recording> \
     --mode tight_reel \
     --max-duration 03:00 \
     --transcriber local-whisper \
     --transcribe-model medium \
     --language es
   ```

   `--transcriber` can be `local-whisper`, `elevenlabs`, `openai`, `gemini`,
   or `external`. The default is
   `VIDEO_WORKFLOW_TRANSCRIBE_PROVIDER` from `.env`, falling back to
   `local-whisper`. Local Whisper uses `faster-whisper` with model `medium`
   by default. Use `--force-transcribe` when changing provider for a source that
   already has a cached transcript JSON.

   Remote providers are optional. Gemini defaults to `gemini-3-flash-preview`.
   OpenAI uses `whisper-1` when selected explicitly with `--transcriber openai`.

   If transcription was done outside this workflow, import it instead of
   calling an API:

   ```bash
   npm run reel:talking-head:prepare -- \
     --run-root <run_root> \
     --source <raw_recording> \
     --mode tight_reel \
     --max-duration 03:00 \
     --transcript <word_timestamp_transcript.json>
   ```

   External transcript JSON must include word timings:

   ```json
   {
     "language_code": "es",
     "words": [
       { "text": "Hola", "start": 0.12, "end": 0.34 },
       { "text": "mundo", "start": 0.36, "end": 0.64 }
     ]
   }
   ```

   OpenAI-style `{ "word": "...", "start": 0.12, "end": 0.34 }` entries are
   also accepted. Segment-only JSON is accepted as a fallback, but word timings
   are estimated and handle snapping will be less precise.

   This creates source inventory, provider transcript, silence scan,
   `takes_packed.md`, `pre_scan.md`, and `LLM_EDITOR_BRIEF.md`.
3. Run the LLM/editorial pass using `LLM_EDITOR_BRIEF.md`:
   - repeated lines,
   - false starts,
   - abandoned phrases,
   - long speech gaps inside otherwise coherent sentences,
   - clipped final words,
   - content contradictions.

   This step is done by Codex internal reasoning from the generated packet, not
   by a separate LLM API.
4. Build `edl_v1.json`.
5. Render a review preview.
6. Build the review UI:

   ```bash
   npm run reel:talking-head:review -- \
     --edit-dir <run_root>/presenter_edit \
     --video <run_root>/presenter_edit/presenter_cut_1080x1920.mp4
   ```

7. Open the interactive trim UI for precise handle adjustments on the original
   source timeline:

   ```bash
   npm run reel:talking-head:trim-ui -- \
     --edit-dir <run_root>/presenter_edit \
     --port 4377
   ```

   Use this UI to adjust cut starts/ends against the original recording. It
   writes `edl_adjusted.json`; it does not overwrite `edl_final.json`.
8. Materialize the mandatory second-pass review from the already-cut MP4:

   ```bash
   npm run reel:talking-head:second-pass -- \
     --edit-dir <run_root>/presenter_edit
   ```

   This renders `presenter_cut_pass1.mp4` from `edl_v1.json`, transcribes that
   already-cut MP4, scans the output audio for silences, and writes
   `second_pass/second_pass_review_packet.md`.
9. The agent reviews `second_pass/second_pass_review_packet.md` plus
   `presenter_cut_pass1.mp4`, then writes `edl_final.json` and `editor_qc.md`.
10. Run the deterministic QC gate:

   ```bash
   npm run reel:talking-head:qc -- \
     --edit-dir <run_root>/presenter_edit
   ```

   This gate fails if the first-pass MP4, first-pass transcript, first-pass
   silence scan, second-pass packet, `edl_v1.json`, `edl_final.json`, or
   `editor_qc.md` are missing, or if `editor_qc.md` does not explicitly
   document the second pass.
11. Render `presenter_cut.mp4` and review-size `presenter_cut_1080x1920.mp4`
   from `edl_adjusted.json` when that file exists, otherwise from
   `edl_final.json`.
12. After approval, render the max-resolution iPhone cut from the approved EDL:

   ```bash
   npm run reel:talking-head:render-final -- \
     --edit-dir <run_root>/presenter_edit \
     --edl <run_root>/presenter_edit/edl_adjusted.json
   ```

11. Run the finality gate.

## Programmatic vs Editorial Responsibilities

Programmatic responsibilities:

- inventory source media,
- cache provider transcript JSON files,
- pack transcripts,
- detect audio silence spans,
- detect transcript word gaps,
- surface candidate repeated/similar phrases,
- render from EDL,
- verify duration with `ffprobe`.

LLM/editor responsibilities:

- decide whether different wording is actually the same idea,
- prefer the latest successful restatement when repeated takes compete,
- override that preference when an earlier take is clearer or more accurate,
- preserve logical continuity between adjacent kept segments,
- choose what to cut when a maximum duration forces tradeoffs,
- write `editor_qc.md`.

The LLM step is done by this Codex session reading the generated packet. It must
consume the same artifacts and produce the same required outputs:
`edl_v1.json`, `edl_final.json`, and `editor_qc.md`.

## Review And Trim UI

The static review report is a local HTML file generated into:

```text
<run_root>/presenter_edit/review/index.html
```

It shows:

- the review video,
- every kept EDL segment with output and source timestamps,
- deleted transcript chunks around each kept segment,
- full removed-transcript chunks that can be requested back,
- rendered-output silence events mapped back to source time and EDL beat,
- copyable feedback snippets such as "add this deleted segment" or "trim this
  specific silence".

Use this UI for targeted changes instead of changing global silence thresholds
when only one or two pauses feel wrong.

The primary fine-adjustment tool is the interactive trim UI:

```bash
npm run reel:talking-head:trim-ui -- --edit-dir <run_root>/presenter_edit
```

It serves a local browser UI with:

- the full original source video,
- a video-first editor layout with the timeline directly under the viewer,
- a separate `Corte`/`Source` playback selector plus one Play/Stop button,
- spacebar Play/Stop while focus is not inside a text input,
- `Corte` mode to simulate the final cut by playing only the green EDL ranges,
- a web playback proxy in `trim_ui/` when the original phone MOV has rotation
  metadata that the browser displays unreliably,
- source-timeline bars for every kept EDL segment,
- draggable start/end handles,
- undo/redo history for EDL edits through header buttons, `Ctrl+Z`, and
  `Ctrl+Shift+Z`,
- visible save/render state in the header, including autosave feedback and
  disabled/busy render buttons,
- automatic saving of EDL edits to `edl_adjusted.json`, with a reset control
  that restores the primary `edl_final.json` cut while still allowing undo,
- detected silence markers inside kept segments that can be selected and cut,
- a scrollable deleted-transcript bank split into reusable blocks,
- full-block insertion from the local before/after context or from the global
  deleted bank,
- selectable deleted transcript words for finer manual insertion as new green
  EDL segments,
- word-boundary snapping from the provider transcript,
- playhead snapping to existing EDL cut boundaries,
- source silence markers,
- chronological transcript flow for the full source, mixing kept green segments
  with removed transcript blocks so the editor can scroll to previous or next
  cuts from the same panel,
- save to `edl_adjusted.json`,
- render-preview and render-final buttons.
- timestamped final exports so a new max-resolution render does not overwrite
  a previous render; the small `presenter_cut_final_maxres_latest.json`
  manifest points to the newest output.

The UI edits the EDL, not the video file. The approved render is still produced
from the original iPhone source by `ffmpeg`, so preview adjustments do not
degrade the final max-resolution output.

## Silence Handling

Do not decide pauses only from the rendered transcript text. A phrase can read
correctly while the speaker stops mid-sentence to think.

For every source, compare:

- word-level transcript timing, using previous word `end` to next word `start`,
- audio silence spans from `ffmpeg` or waveform analysis,
- timeline views around ambiguous cuts.

Speech gaps inside a sentence are cut candidates even when the written sentence
is grammatically coherent. A kept pause must be intentional: emphasis, a useful
beat, laughter, or a natural transition. Otherwise it is removed according to
the selected cut mode.

## Mandatory Second-Pass Review

After `edl_v1.json` exists, render `presenter_cut_pass1.mp4` and analyze that
already-cut MP4 before final render. The second pass is not a general reread;
it hunts specifically for misses that have survived previous projects:

- logic breaks between adjacent kept segments,
- unnecessary repeated ideas or repeated setup lines,
- hidden pauses inside a sentence,
- false starts that sound acceptable in text but awkward in audio,
- clipped words or endings,
- cuts that fit the transcript but feel wrong when listened to normally.

If the second pass finds issues, write the fixes into `editor_qc.md`, produce
`edl_final.json`, and render again. If it finds no issues, `editor_qc.md` must
say that the second pass was run and no EDL changes were needed.

## Finality Gate

Do not call the cut approved until `editor_qc.md` explicitly answers:

- The selected maximum duration policy is satisfied, or the documented tradeoff
  was approved.
- All speech gaps above the cut-mode threshold were inspected.
- No accidental pauses above the allowed mode threshold remain.
- No repeated setup lines remain.
- Adjacent cuts make sense as spoken text.
- The first two seconds start cleanly.
- The last sentence finishes naturally.
- No word is clipped at a cut.
- `ffprobe` duration matches expected runtime.

## Acceptance Output

`RUN_STATE.md` must point to:

- approved trimmed presenter video,
- transcript,
- final EDL,
- `editor_qc.md`,
- any unresolved editorial caveat.

If one of the gate checks cannot be run, the output is a preview, not a final cut.

The user-facing review deliverable before approval is usually:

```text
<run_root>/presenter_edit/presenter_cut_1080x1920.mp4
```

If the trim UI was used, the approved cut list is:

```text
<run_root>/presenter_edit/edl_adjusted.json
```

After approval, the user-facing final deliverable is:

```text
<run_root>/presenter_edit/presenter_cut_final_maxres_YYYYMMDD_HHMMSS.mp4
```

That final file is rendered from the original recording at the maximum source
resolution available from the iPhone recording, without using the scaled review
preview as an intermediate.
