"""
Scan the kaggle dataset folder for audio files.

Recursively finds all .mp3, .wav, and .flac files
and reports the total count. No processing is performed.
"""

import os
from pathlib import Path

DATASET_PATH = Path("./kaggle")
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac"}


def scan_audio_files(root: Path) -> list[str]:
    """Recursively collect all audio file paths under `root`."""
    audio_files: list[str] = []
    for dirpath, _, filenames in os.walk(root):
        for fname in filenames:
            if Path(fname).suffix.lower() in AUDIO_EXTENSIONS:
                audio_files.append(os.path.join(dirpath, fname))
    return audio_files


if __name__ == "__main__":
    if not DATASET_PATH.exists():
        print(f"[ERROR] Dataset path not found: {DATASET_PATH.resolve()}")
        raise SystemExit(1)

    audio_files = scan_audio_files(DATASET_PATH)

    print(f"Dataset root : {DATASET_PATH.resolve()}")
    print(f"Extensions   : {', '.join(sorted(AUDIO_EXTENSIONS))}")
    print(f"Total files  : {len(audio_files)}")
