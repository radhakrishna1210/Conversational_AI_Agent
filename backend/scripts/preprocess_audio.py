"""
Preprocess dataset audio files to cleaned, uniform .wav format.

Pipeline stages (per file):
    1. Load & resample to 24 000 Hz mono
    2. Trim leading/trailing silence  (librosa.effects.trim)
    3. Reject clips outside the 5–15 s duration window (ideal for XTTS)
    4. Reject clips whose peak amplitude is below a threshold
    5. Peak-normalize volume           (numpy)
    6. Export as 16-bit WAV

Saves output under  backend/processed_wav/  mirroring source structure.
Already-processed files are automatically skipped.

Requirements:
    pip install pydub librosa soundfile numpy
    ffmpeg must be on PATH (pydub uses it for decoding).
"""

import os
import sys
import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATASET_PATH = Path("./kaggle")
OUTPUT_DIR = Path("backend/processed_wav")

TARGET_SAMPLE_RATE = 24_000   # Hz
TARGET_CHANNELS = 1           # mono (librosa loads mono by default)

# Silence trimming – dB below reference to consider as silence
TRIM_TOP_DB = 20

# Minimum peak amplitude (0-1).  Clips quieter than this are rejected as
# near-silent / corrupt.  0.01 ≈ −40 dB.
MIN_PEAK_AMPLITUDE = 0.01

# Peak-normalise target (0-1).  0.95 leaves a tiny headroom margin.
NORMALIZE_PEAK = 0.95

# Duration gate (seconds).  XTTS works best with 5-15 s reference clips.
MIN_DURATION_SEC = 5.0
MAX_DURATION_SEC = 15.0

# Re-use the scanner from the sibling module
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan_dataset import AUDIO_EXTENSIONS, scan_audio_files  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _output_path_for(source: str) -> Path:
    """
    Derive a deterministic output path that mirrors the source's
    relative directory structure inside OUTPUT_DIR.

    Example:
        kaggle/genre/song.mp3  ->  backend/processed_wav/genre/song.wav
    """
    rel = Path(source).relative_to(DATASET_PATH)
    return OUTPUT_DIR / rel.with_suffix(".wav")


def clean_audio(filepath: str) -> tuple[np.ndarray, None] | tuple[None, str]:
    """
    Load, trim, validate, and normalise a single audio file.

    Returns:
        (waveform, None)      – on success
        (None, reject_reason) – if the clip should be discarded
    """
    # 1. Load & resample ------------------------------------------------
    y, _ = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)

    # 2. Trim silence from both ends ------------------------------------
    y_trimmed, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)

    # 3. Duration gate (after trimming) ---------------------------------
    duration = len(y_trimmed) / TARGET_SAMPLE_RATE
    if duration < MIN_DURATION_SEC:
        return None, "TOO_SHORT"
    if duration > MAX_DURATION_SEC:
        return None, "TOO_LONG"

    # 4. Reject near-silent clips ---------------------------------------
    peak = np.max(np.abs(y_trimmed))
    if peak < MIN_PEAK_AMPLITUDE:
        return None, "LOW_AMP"

    # 5. Peak-normalise --------------------------------------------------
    y_norm = y_trimmed * (NORMALIZE_PEAK / peak)

    return y_norm.astype(np.float32), None


def convert_file(source: str, dest: Path) -> str:
    """
    Process a single audio file through the cleaning pipeline.

    Returns a status string:
        "CONVERTED" – file was processed and saved
        "SKIPPED"   – output already exists
        "TOO_SHORT" – clip shorter than MIN_DURATION_SEC after trimming
        "TOO_LONG"  – clip longer  than MAX_DURATION_SEC after trimming
        "LOW_AMP"   – clip below minimum amplitude threshold
    """
    if dest.exists():
        return "SKIPPED"

    cleaned, reject_reason = clean_audio(source)

    if cleaned is None:
        return reject_reason  # type: ignore[return-value]

    dest.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dest), cleaned, TARGET_SAMPLE_RATE, subtype="PCM_16")

    return "CONVERTED"


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def preprocess(audio_files: list[str]) -> None:
    """Run the full cleaning pipeline over every file."""
    total = len(audio_files)
    counters = {
        "CONVERTED": 0,
        "SKIPPED": 0,
        "TOO_SHORT": 0,
        "TOO_LONG": 0,
        "LOW_AMP": 0,
        "ERROR": 0,
    }

    print(f"{'='*60}")
    print(f"  Audio Preprocessing Pipeline  (Enhanced)")
    print(f"  Target      : {TARGET_SAMPLE_RATE} Hz | mono | 16-bit WAV")
    print(f"  Duration    : {MIN_DURATION_SEC}–{MAX_DURATION_SEC} s")
    print(f"  Trim dB     : {TRIM_TOP_DB} dB")
    print(f"  Min peak    : {MIN_PEAK_AMPLITUDE}")
    print(f"  Norm peak   : {NORMALIZE_PEAK}")
    print(f"  Output      : {OUTPUT_DIR.resolve()}")
    print(f"  Files queued: {total}")
    print(f"{'='*60}\n")

    start = time.perf_counter()

    for idx, fpath in enumerate(audio_files, 1):
        dest = _output_path_for(fpath)
        try:
            status = convert_file(fpath, dest)
        except Exception as exc:
            status = "ERROR"
            print(f"  [{idx:>{len(str(total))}}/{total}]  ERROR     {fpath}")
            print(f"           └─ {exc}")
            counters["ERROR"] += 1
            continue

        counters[status] += 1
        label = f"{status:<9}"
        print(f"  [{idx:>{len(str(total))}}/{total}]  {label}  {Path(fpath).name}")

    elapsed = time.perf_counter() - start
    rejected_total = counters["TOO_SHORT"] + counters["TOO_LONG"] + counters["LOW_AMP"]

    print(f"\n{'='*60}")
    print(f"  Completed in {elapsed:.1f}s")
    print(f"  Converted : {counters['CONVERTED']}")
    print(f"  Skipped   : {counters['SKIPPED']}")
    print(f"  Rejected  : {rejected_total}")
    print(f"      ├─ Too short (<{MIN_DURATION_SEC}s) : {counters['TOO_SHORT']}")
    print(f"      ├─ Too long  (>{MAX_DURATION_SEC}s) : {counters['TOO_LONG']}")
    print(f"      └─ Low amplitude          : {counters['LOW_AMP']}")
    print(f"  Errors    : {counters['ERROR']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    if not DATASET_PATH.exists():
        print(f"[ERROR] Dataset path not found: {DATASET_PATH.resolve()}")
        raise SystemExit(1)

    audio_files = scan_audio_files(DATASET_PATH)

    if not audio_files:
        print("[INFO] No audio files found — nothing to preprocess.")
        raise SystemExit(0)

    preprocess(audio_files)
