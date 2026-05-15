#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe audio locally with faster-whisper and write Talking Head Trim JSON.")
    parser.add_argument("--audio", required=True, help="Audio file to transcribe.")
    parser.add_argument("--source", required=True, help="Original source media path for metadata.")
    parser.add_argument("--output", required=True, help="Output transcript JSON path.")
    parser.add_argument("--model", default=os.environ.get("LOCAL_WHISPER_MODEL", "medium"), help="faster-whisper model name or local model directory.")
    parser.add_argument("--language", default="", help="Optional language code such as en or es.")
    parser.add_argument("--device", default=os.environ.get("LOCAL_WHISPER_DEVICE", "auto"), help="faster-whisper device: auto, cpu, cuda.")
    parser.add_argument("--compute-type", default=os.environ.get("LOCAL_WHISPER_COMPUTE_TYPE", "int8"), help="Optional compute type such as int8, float16, int8_float16. Defaults to int8 for practical CPU performance.")
    parser.add_argument("--vad-filter", action="store_true", help="Enable faster-whisper VAD filtering. Off by default for editorial completeness.")
    return parser.parse_args()


def rounded(value):
    return round(float(value), 3)


def with_spacing(words):
    output = []
    previous = None
    for word in sorted(words, key=lambda item: item["start"]):
        if previous and word["start"] - previous["end"] > 0.01:
            output.append({
                "text": " ",
                "start": rounded(previous["end"]),
                "end": rounded(word["start"]),
                "type": "spacing",
                "speaker_id": word.get("speaker_id") or previous.get("speaker_id") or "speaker_0",
            })
        output.append({
            **word,
            "start": rounded(word["start"]),
            "end": rounded(word["end"]),
        })
        previous = output[-1]
    return output


def main():
    args = parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "Missing Python package 'faster-whisper'. Install it with:\n"
            "  python3 -m pip install faster-whisper\n",
            file=sys.stderr,
        )
        return 2

    model_kwargs = {"device": args.device}
    if args.compute_type:
        model_kwargs["compute_type"] = args.compute_type

    print(
        f"Loading faster-whisper model={args.model} device={args.device} compute_type={args.compute_type or 'default'}",
        file=sys.stderr,
        flush=True,
    )
    model = WhisperModel(args.model, **model_kwargs)
    transcribe_kwargs = {
        "beam_size": 5,
        "word_timestamps": True,
        "vad_filter": args.vad_filter,
    }
    if args.language:
        transcribe_kwargs["language"] = args.language

    segments_iter, info = model.transcribe(args.audio, **transcribe_kwargs)
    segments = []
    words = []

    for index, segment in enumerate(segments_iter):
        segments.append({
            "id": index,
            "start": rounded(segment.start),
            "end": rounded(segment.end),
            "text": str(segment.text or "").strip(),
            "speaker_id": "speaker_0",
            "avg_logprob": getattr(segment, "avg_logprob", None),
            "no_speech_prob": getattr(segment, "no_speech_prob", None),
        })
        for word in segment.words or []:
            text = str(getattr(word, "word", "") or "").strip()
            start = getattr(word, "start", None)
            end = getattr(word, "end", None)
            if not text or start is None or end is None:
                continue
            words.append({
                "text": text,
                "start": float(start),
                "end": float(end),
                "type": "word",
                "speaker_id": "speaker_0",
                "probability": getattr(word, "probability", None),
            })
        if index == 0 or (index + 1) % 10 == 0:
            print(
                f"Transcribed segment {index + 1}: {rounded(segment.start)}-{rounded(segment.end)}s, words={len(words)}",
                file=sys.stderr,
                flush=True,
            )

    if not words:
        print("faster-whisper returned no word timestamps; cannot build precise trim handles.", file=sys.stderr)
        return 3

    payload = {
        "provider": "local-whisper",
        "transcriber_provider": "local-whisper",
        "transcriber_model": args.model,
        "timing_precision": "word",
        "source": str(Path(args.source).resolve()),
        "language_code": getattr(info, "language", "") or args.language,
        "language_probability": getattr(info, "language_probability", None),
        "audio_duration_secs": getattr(info, "duration", None) or words[-1]["end"],
        "text": " ".join(segment["text"] for segment in segments if segment["text"]).strip(),
        "segments": segments,
        "words": with_spacing(words),
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  saved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
