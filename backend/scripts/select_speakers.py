"""
Select unique speakers from the processed dataset for the XTTS voice library.

Strategy:
    1. If metadata is available (CSV/TSV with a speaker column), use it to
       pick one high-quality clip per speaker.
    2. If subdirectories exist (assumed = one speaker per folder), pick the
       best clip from each folder.
    3. Otherwise fall back to random diverse selection from the flat pool.

The selected clips are copied into  backend/voices/  so the TTS engine
picks them up automatically on next startup.

Requirements:
    pip install librosa numpy soundfile
"""

import csv
import hashlib
import json
import os
import random
import shutil
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROCESSED_DIR = Path("backend/processed_wav")
VOICES_DIR = Path("backend/voices")
DATASET_PATH = Path("./kaggle")

TARGET_SAMPLE_RATE = 24_000
MIN_SPEAKERS = 10
MAX_SPEAKERS = 20

# Duration sweet-spot for XTTS reference clips (seconds)
IDEAL_MIN_DUR = 5.0
IDEAL_MAX_DUR = 10.0

# Quality thresholds for final verification
MIN_RMS = 0.02          # reject near-silent clips
MAX_CLIPPING_RATIO = 0.01  # reject if >1% of samples are clipped

# Re-use the scanner from the sibling module
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan_dataset import scan_audio_files  # noqa: E402


# ---------------------------------------------------------------------------
# Metadata detection
# ---------------------------------------------------------------------------
_METADATA_GLOBS = ["*.csv", "*.tsv", "*.txt", "*.json"]
_SPEAKER_COLUMNS = [
    "speaker", "speaker_id", "speakerid", "spk", "spk_id",
    "client_id", "reader", "reader_id", "author", "name",
]


def _find_metadata(root: Path) -> Path | None:
    """Return the first metadata file found under *root*, or None."""
    for pattern in _METADATA_GLOBS:
        hits = sorted(root.rglob(pattern))
        for h in hits:
            if h.stat().st_size > 100:  # skip tiny files
                return h
    return None


def _detect_delimiter(path: Path) -> str:
    """Guess CSV vs TSV."""
    sample = path.read_text(encoding="utf-8", errors="replace")[:2048]
    return "\t" if sample.count("\t") > sample.count(",") else ","


def _parse_csv_metadata(path: Path) -> dict[str, list[str]] | None:
    """
    Attempt to parse a CSV/TSV and return {speaker_id: [audio_paths]}.
    Returns None if no speaker column is detected.
    """
    delim = _detect_delimiter(path)
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=delim)
        if reader.fieldnames is None:
            return None

        lower_fields = {fn.lower().strip(): fn for fn in reader.fieldnames}
        speaker_col = None
        for candidate in _SPEAKER_COLUMNS:
            if candidate in lower_fields:
                speaker_col = lower_fields[candidate]
                break

        if speaker_col is None:
            return None

        # Also look for a path / filename column
        path_col = None
        for candidate in ["path", "file", "filename", "filepath", "audio",
                          "audio_filepath", "wav_filename"]:
            if candidate in lower_fields:
                path_col = lower_fields[candidate]
                break

        mapping: dict[str, list[str]] = {}
        for row in reader:
            spk = row.get(speaker_col, "").strip()
            if not spk:
                continue
            audio_ref = row.get(path_col, "").strip() if path_col else ""
            mapping.setdefault(spk, []).append(audio_ref)

        return mapping if mapping else None


def _parse_json_metadata(path: Path) -> dict[str, list[str]] | None:
    """
    Attempt to parse a JSON metadata file.
    Expects either a list of dicts or a dict of dicts, each with a speaker key.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    records = []
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        records = list(data.values()) if all(isinstance(v, dict) for v in data.values()) else []

    if not records:
        return None

    # Find a speaker key
    sample = records[0] if records else {}
    speaker_key = None
    for candidate in _SPEAKER_COLUMNS:
        if candidate in {k.lower() for k in sample}:
            # get actual key
            speaker_key = next(k for k in sample if k.lower() == candidate)
            break

    if speaker_key is None:
        return None

    mapping: dict[str, list[str]] = {}
    for rec in records:
        spk = str(rec.get(speaker_key, "")).strip()
        if spk:
            audio_ref = str(rec.get("path", rec.get("file", ""))).strip()
            mapping.setdefault(spk, []).append(audio_ref)

    return mapping if mapping else None


# ---------------------------------------------------------------------------
# Clip quality scoring
# ---------------------------------------------------------------------------
def _score_clip(filepath: str) -> float:
    """
    Rate a clip's suitability as an XTTS reference.
    Higher is better.  Considers duration, RMS energy, and signal-to-noise
    proxy (spectral flatness).
    """
    try:
        y, sr = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)
    except Exception:
        return -1.0

    duration = len(y) / sr

    # Duration score – peaks when inside the ideal window
    if IDEAL_MIN_DUR <= duration <= IDEAL_MAX_DUR:
        dur_score = 1.0
    elif duration < IDEAL_MIN_DUR:
        dur_score = max(0, duration / IDEAL_MIN_DUR)
    else:
        dur_score = max(0, 1.0 - (duration - IDEAL_MAX_DUR) / IDEAL_MAX_DUR)

    # RMS energy (prefer louder, cleaner clips)
    rms = float(np.sqrt(np.mean(y ** 2)))
    rms_score = min(rms / 0.1, 1.0)  # normalise around 0.1

    # Spectral flatness – lower = more tonal = better for speech
    sf_vals = librosa.feature.spectral_flatness(y=y)
    sf_mean = float(np.mean(sf_vals))
    tone_score = 1.0 - min(sf_mean / 0.5, 1.0)

    return (dur_score * 0.4) + (rms_score * 0.3) + (tone_score * 0.3)


def _best_clip(candidates: list[str]) -> str | None:
    """Return the highest-scoring clip from *candidates*."""
    if not candidates:
        return None
    scored = [(c, _score_clip(c)) for c in candidates]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_path, best_score = scored[0]
    return best_path if best_score > 0 else None


# ---------------------------------------------------------------------------
# Selection strategies
# ---------------------------------------------------------------------------
def _resolve_audio_ref(ref: str, pool: list[str]) -> str | None:
    """Try to match a metadata audio reference to an actual processed file."""
    if not ref:
        return None
    ref_stem = Path(ref).stem.lower()
    for p in pool:
        if Path(p).stem.lower() == ref_stem:
            return p
    return None


def select_via_metadata(pool: list[str]) -> dict[str, str]:
    """Strategy 1: metadata-driven speaker selection."""
    meta_file = _find_metadata(DATASET_PATH)
    if meta_file is None:
        meta_file = _find_metadata(PROCESSED_DIR)
    if meta_file is None:
        return {}

    print(f"  Found metadata: {meta_file}")

    if meta_file.suffix == ".json":
        mapping = _parse_json_metadata(meta_file)
    else:
        mapping = _parse_csv_metadata(meta_file)

    if not mapping:
        print("  Could not parse speaker info from metadata.")
        return {}

    print(f"  Speakers in metadata: {len(mapping)}")

    # Resolve references to actual processed files
    selected: dict[str, str] = {}
    for spk, refs in mapping.items():
        candidates = []
        for ref in refs:
            resolved = _resolve_audio_ref(ref, pool)
            if resolved:
                candidates.append(resolved)
        if not candidates:
            # Fallback: try matching speaker name in path
            candidates = [p for p in pool if spk.lower() in Path(p).parts[-2].lower()]
        clip = _best_clip(candidates) if candidates else None
        if clip:
            selected[spk] = clip
        if len(selected) >= MAX_SPEAKERS:
            break

    return selected


def select_via_directories(pool: list[str]) -> dict[str, str]:
    """Strategy 2: one speaker per subdirectory."""
    dir_groups: dict[str, list[str]] = {}
    for p in pool:
        parent = Path(p).parent.name
        if parent == PROCESSED_DIR.name:
            continue  # skip files at root level
        dir_groups.setdefault(parent, []).append(p)

    if len(dir_groups) < 2:
        return {}

    print(f"  Found {len(dir_groups)} subdirectories (assumed = speakers)")

    selected: dict[str, str] = {}
    for dirname, clips in sorted(dir_groups.items()):
        clip = _best_clip(clips)
        if clip:
            selected[dirname] = clip
        if len(selected) >= MAX_SPEAKERS:
            break

    return selected


def select_random_diverse(pool: list[str]) -> dict[str, str]:
    """Strategy 3: random diverse selection (no metadata, flat folder)."""
    count = min(MAX_SPEAKERS, len(pool))
    print(f"  No metadata / structure found — randomly selecting {count} diverse clips")

    # Score all clips and take the top ones, spreading evenly across the list
    scored = [(p, _score_clip(p)) for p in pool]
    scored = [(p, s) for p, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Take the top-scoring clips
    selected: dict[str, str] = {}
    for i, (path, _score) in enumerate(scored[:count]):
        voice_name = f"speaker_{i + 1}"  # speaker_1, speaker_2, …
        selected[voice_name] = path

    return selected


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def select_speakers(pool: list[str]) -> dict[str, str]:
    """
    Attempt all strategies in order and return {voice_name: wav_path}.
    """
    print(f"\n{'='*60}")
    print(f"  Speaker Selection Pipeline")
    print(f"  Target: {MIN_SPEAKERS}–{MAX_SPEAKERS} unique speakers")
    print(f"  Pool  : {len(pool)} processed clips")
    print(f"{'='*60}\n")

    # Strategy 1: metadata
    print("[1/3] Checking for metadata...")
    selected = select_via_metadata(pool)
    if len(selected) >= MIN_SPEAKERS:
        print(f"  ✓ Selected {len(selected)} speakers via metadata\n")
        return selected

    # Strategy 2: directory structure
    print("[2/3] Checking directory structure...")
    dir_selected = select_via_directories(pool)
    if len(dir_selected) >= MIN_SPEAKERS:
        print(f"  ✓ Selected {len(dir_selected)} speakers via directories\n")
        return dir_selected

    # Merge what we have so far
    selected.update(dir_selected)

    # Strategy 3: random
    if len(selected) < MIN_SPEAKERS:
        print("[3/3] Falling back to diverse random selection...")
        remaining_pool = [p for p in pool if p not in selected.values()]
        random_selected = select_random_diverse(remaining_pool)
        # Merge, keeping existing named speakers
        for name, path in random_selected.items():
            if len(selected) >= MAX_SPEAKERS:
                break
            if path not in selected.values():
                selected[name] = path

    print(f"\n  ✓ Final selection: {len(selected)} speakers\n")
    return selected


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------
def _audio_fingerprint(filepath: str) -> str:
    """Compute a perceptual fingerprint (SHA-256 of rounded samples)."""
    try:
        y, _ = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)
        # Quantise to 8-bit resolution so near-identical clips collide
        quantised = np.round(y * 127).astype(np.int8).tobytes()
        return hashlib.sha256(quantised).hexdigest()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Quality verification
# ---------------------------------------------------------------------------
def _verify_clip(filepath: str) -> tuple[bool, str]:
    """
    Final quality gate before a clip enters the voice library.

    Returns (passed, reason_if_failed).
    """
    try:
        y, sr = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)
    except Exception as exc:
        return False, f"load error: {exc}"

    duration = len(y) / sr
    if duration < IDEAL_MIN_DUR or duration > IDEAL_MAX_DUR:
        return False, f"duration {duration:.1f}s outside {IDEAL_MIN_DUR}–{IDEAL_MAX_DUR}s"

    rms = float(np.sqrt(np.mean(y ** 2)))
    if rms < MIN_RMS:
        return False, f"RMS {rms:.4f} below threshold {MIN_RMS}"

    clipping = float(np.mean(np.abs(y) >= 0.999))
    if clipping > MAX_CLIPPING_RATIO:
        return False, f"clipping {clipping:.2%} exceeds {MAX_CLIPPING_RATIO:.0%}"

    return True, ""


# ---------------------------------------------------------------------------
# Attribute Inference
# ---------------------------------------------------------------------------
def _infer_attributes(filepath: str) -> dict[str, str]:
    """
    Guess gender and style based on audio analysis.
    Gender: Based on mean fundamental frequency (F0).
    Style: Based on spectral features and RMS.
    """
    try:
        y, sr = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)
        
        # 1. Pitch / Gender
        # F0 estimation (using piptrack as it's faster than pyin for this scale)
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        avg_pitch = np.mean(pitches[pitches > 0]) if np.any(pitches > 0) else 150
        
        # Heuristic: Male < 165Hz, Female > 165Hz
        gender = "male" if avg_pitch < 165 else "female"
        
        # 2. Style
        # RMS for energy
        rms = np.sqrt(np.mean(y**2))
        # Spectral centroids for brightness
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        avg_cent = np.mean(cent)
        
        if avg_pitch < 120:
            style = "deep"
        elif rms < 0.05:
            style = "soft"
        elif avg_cent > 3000:
            style = "bright"
        else:
            style = "clear"
            
        return {"gender": gender, "style": style}
    except Exception:
        return {"gender": "unknown", "style": "natural"}


def copy_to_voices(selected: dict[str, str]) -> None:
    """
    Verify, deduplicate, and copy selected clips into backend/voices/
    with sequential naming:  speaker_1.wav, speaker_2.wav, …

    Generates and saves voices.json metadata.
    """
    VOICES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"{'='*60}")
    print(f"  Saving voice library to {VOICES_DIR.resolve()}")
    print(f"  Naming: speaker_1.wav … speaker_N.wav")
    print(f"{'='*60}\n")

    seen_fingerprints: set[str] = set()
    voice_metadata: dict[str, dict[str, str]] = {}
    speaker_num = 0
    copied = 0
    dup_count = 0
    fail_count = 0

    for _voice_key, src_path in selected.items():
        # --- Duplicate check -----------------------------------------------
        fp = _audio_fingerprint(src_path)
        if fp and fp in seen_fingerprints:
            dup_count += 1
            print(f"  DUP   {Path(src_path).name}  (duplicate audio — skipped)")
            continue
        if fp:
            seen_fingerprints.add(fp)

        # --- Quality verification ------------------------------------------
        passed, reason = _verify_clip(src_path)
        if not passed:
            fail_count += 1
            print(f"  FAIL  {Path(src_path).name}  ({reason})")
            continue

        # --- Attribute Inference -------------------------------------------
        attr = _infer_attributes(src_path)

        # --- Copy with sequential name -------------------------------------
        speaker_num += 1
        dest_name = f"speaker_{speaker_num}"
        dest_file = f"{dest_name}.wav"
        dest_path = VOICES_DIR / dest_file

        if dest_path.exists():
            print(f"  SKIP  {dest_file}  (already exists)")
            copied += 1
            # Keep existing metadata if skipping
            continue

        shutil.copy2(src_path, dest_path)
        voice_metadata[dest_name] = attr
        
        duration = librosa.get_duration(path=src_path, sr=TARGET_SAMPLE_RATE)
        copied += 1
        print(f"  COPY  {dest_file}  ← {Path(src_path).name}  ({duration:.1f}s) [{attr['gender']}, {attr['style']}]")

    # --- Save Metadata JSON ------------------------------------------------
    meta_json_path = VOICES_DIR / "voices.json"
    
    # Merge with existing if any
    all_meta = {}
    if meta_json_path.exists():
        try:
            with open(meta_json_path, 'r') as f:
                all_meta = json.load(f)
        except: pass
    
    all_meta.update(voice_metadata)
    
    with open(meta_json_path, 'w') as f:
        json.dump(all_meta, f, indent=4)

    total_voices = len(list(VOICES_DIR.glob("*.wav")))

    print(f"\n{'='*60}")
    print(f"  Results")
    print(f"    Copied      : {copied}")
    print(f"    Duplicates  : {dup_count}")
    print(f"    Failed QC   : {fail_count}")
    print(f"    Total voices: {total_voices}")
    print(f"    Metadata    : {meta_json_path.name} updated")
    print(f"  Engine will auto-load from: {VOICES_DIR.resolve()}")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Collect processed clips
    if PROCESSED_DIR.exists():
        pool = scan_audio_files(PROCESSED_DIR)
    else:
        print(f"[WARN] Processed dir not found: {PROCESSED_DIR.resolve()}")
        print(f"       Run preprocess_audio.py first, or scanning raw dataset...")
        if not DATASET_PATH.exists():
            print(f"[ERROR] Dataset path not found: {DATASET_PATH.resolve()}")
            raise SystemExit(1)
        pool = scan_audio_files(DATASET_PATH)

    if not pool:
        print("[ERROR] No audio files found in pool — nothing to select from.")
        raise SystemExit(1)

    selected = select_speakers(pool)

    if not selected:
        print("[ERROR] Could not select any speakers.")
        raise SystemExit(1)

    copy_to_voices(selected)
