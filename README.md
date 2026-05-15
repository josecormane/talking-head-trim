# Talking Head Trim

[![skills.sh](https://skills.sh/b/josecormane/talking-head-trim)](https://skills.sh/josecormane/talking-head-trim)

Free, open-source, local-first skill for cleaning messy talking-head raw recordings into editable first cuts.

Talking Head Trim is a skill you can install and use with Codex, Claude Code, Gemini, Antigravity, or another skill-compatible coding agent. It creates a transcript-aware edit packet, proposes the cleanup cut, serves an interactive trim UI, and renders the final video locally. The source video stays local except when an API transcriber is selected, and then only the extracted audio is sent to that provider.

## See It In Action

The launch demo uses a real iPhone talking-head recording:

- Source: `2:24` raw recording
- Output: `0:52` editable first cut
- Mode: `tight_reel`
- Max duration target: `90s`
- Transcriber: OpenAI

![Animated demo showing the source recording, trim UI, and capabilities](docs/images/05-img3322-timeline-demo.gif)

## What It Looks Like

Review the proposed cut on the original source timeline. Green sections are kept, yellow marks are detected silences, and the red playhead snaps to cut points.

![Talking Head Trim UI showing a 2:24 source reduced to a 0:52 cut](docs/images/01-img3322-trim-ui.png)

Use the side panel to inspect the selected segment, read surrounding transcript, and recover removed text when needed.

![Review panel with selected segment, removed transcript blocks, and export controls](docs/images/02-img3322-review-panel.png)

The interface is built for the cleanup pass before the main edit: adjust segments, remove internal silences, recover phrases, preview the cut, review renders, and export max-res.

![Annotated screenshot explaining the trim UI capabilities](docs/images/03-img3322-interface-capabilities.png)

![Before and after image showing source duration versus clean output duration](docs/images/04-img3322-before-after.png)

## Requirements

- Node.js 20+
- `ffmpeg` and `ffprobe`
- Python 3 with `requests` only when using ElevenLabs Scribe
- Optional API key for one transcription provider:
  - `ELEVENLABS_API_KEY`
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`

## Install

Install the free open-source skill:

```bash
npx skills add josecormane/talking-head-trim
```

Or clone the repo directly:

```bash
git clone https://github.com/josecormane/talking-head-trim.git
cd talking-head-trim
cp .env.example .env
npm test
```

## Use With An Agent

After installing the skill, ask Codex, Claude Code, Gemini, Antigravity, or another skill-compatible coding agent:

```text
Use the talking-head-cleanup skill to clean this raw talking-head recording: /path/to/video.mov
```

## Prepare A Cut Packet

External transcript, no API call:

```bash
npm run talking-head:prepare -- \
  --edit-dir ./runs/demo/presenter_edit \
  --source /path/to/raw-video.mov \
  --mode tight_reel \
  --max-duration none \
  --transcript ./examples/external-transcript.example.json
```

OpenAI Whisper:

```bash
npm run talking-head:prepare -- \
  --edit-dir ./runs/demo/presenter_edit \
  --source /path/to/raw-video.mov \
  --mode tight_reel \
  --max-duration 03:00 \
  --transcriber openai \
  --language es
```

Provider options:

- `external`: import JSON with word timestamps.
- `openai`: uses `whisper-1` with word timestamps.
- `elevenlabs`: uses ElevenLabs Scribe through `tools/video-use/helpers/transcribe.py`.
- `gemini`: uses Gemini segment timestamps and estimates word timings for UI snapping.

Use `--force-transcribe` to replace a cached transcript.

## Review UI

After an EDL exists in the edit folder:

```bash
npm run talking-head:trim-ui -- \
  --edit-dir ./runs/demo/presenter_edit \
  --port 4377
```

Open `http://127.0.0.1:4377/`.

## Render

```bash
npm run talking-head:render-final -- \
  --edit-dir ./runs/demo/presenter_edit
```

## Install As A Skill

```bash
npx skills add josecormane/talking-head-trim
```

If the installer asks for a specific skill, use:

```bash
npx skills add josecormane/talking-head-trim --skill talking-head-cleanup
```

## Development

```bash
npm test
```

The test suite does not call paid transcription APIs. It validates external transcript import, cache behavior, force regeneration, and segment fallback.
