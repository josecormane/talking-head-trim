---
name: talking-head-cleanup
description: Use when cleaning raw talking-head video recordings into an editorially trimmed cut with the free open-source Talking Head Trim workflow. Defaults to local Whisper transcription with faster-whisper medium, and also supports external word-timestamp transcripts, OpenAI Whisper, ElevenLabs Scribe, Gemini transcription, silence scans, transcript packing, trim UI review, EDL adjustment, and final render.
license: MIT
compatibility: Requires Node.js 20+, ffmpeg/ffprobe, and optional transcription provider keys.
metadata:
  version: "0.1.0"
---

# Talking Head Cleanup

Use this free open-source skill to prepare and trim raw presenter recordings before short-form video assembly. It runs locally with Codex, Claude Code, Gemini, Antigravity, or another skill-compatible coding agent.

## Inputs To Ask For

- Raw video path.
- Output/edit folder, or permission to create one under `runs/`.
- Cut mode: `tight_reel` or `natural_explainer`.
- Maximum duration: `MM:SS` or `none`.
- Transcription source:
  - local Whisper via `faster-whisper` (default, model `medium`),
  - external JSON with word timestamps,
  - OpenAI,
  - ElevenLabs,
  - Gemini.

Prefer `local-whisper`, `external`, or `openai` when precise word-level edit handles matter.

## Workflow

1. Confirm `ffmpeg`, `ffprobe`, Node, Python, and `faster-whisper` are available for the default local path.
2. Prepare the edit packet:

   ```bash
   npm run talking-head:prepare -- \
     --edit-dir <edit_dir> \
     --source <raw_video> \
     --mode tight_reel \
     --max-duration none \
     --transcript <word_timestamp_transcript.json>
   ```

   Or use an API provider:

   ```bash
   npm run talking-head:prepare -- \
     --edit-dir <edit_dir> \
     --source <raw_video> \
     --mode tight_reel \
     --max-duration 03:00 \
     --transcriber local-whisper \
     --transcribe-model medium \
     --language es
   ```

3. Read the generated `LLM_EDITOR_BRIEF.md` and `takes_packed.md`.
4. Create or refine the EDL according to the editorial rules in `workflows/talking-head-cleanup.md`.
5. Materialize the mandatory second-pass review from the first EDL:

   ```bash
   npm run talking-head:second-pass -- --edit-dir <edit_dir>
   ```

   This renders `presenter_cut_pass1.mp4`, transcribes that already-cut MP4, scans its output audio for silences, and writes `second_pass/second_pass_review_packet.md`.
6. The agent must review `second_pass/second_pass_review_packet.md` and the first-pass MP4 before showing the cut as final: check logic breaks, repeated ideas, hidden pauses, clipped words, and awkward audio-only artifacts. Write `edl_final.json` and `editor_qc.md` with an explicit second-pass note.
7. Start the trim UI:

   ```bash
   npm run talking-head:trim-ui -- --edit-dir <edit_dir> --port 4377
   ```

8. Use the UI to adjust handles, add removed transcript blocks, cut internal silences, undo/redo, save, and render.
9. Before final render, run:

   ```bash
   npm run talking-head:qc -- --edit-dir <edit_dir>
   ```

10. Render the final max-resolution cut from the accepted EDL.

## Transcript Contract

External transcript JSON should contain word timestamps:

```json
{
  "language_code": "es",
  "words": [
    { "text": "Hola", "start": 0.12, "end": 0.34 },
    { "text": "mundo", "start": 0.36, "end": 0.64 }
  ]
}
```

OpenAI-style entries using `word` instead of `text` are accepted. Segment-only JSON is accepted as a fallback, but word timings are estimated and UI snapping is less precise.

## Validation

Run:

```bash
npm test
```

The tests avoid paid API calls and validate the external transcript path, cache behavior, forced regeneration, and segment fallback.
