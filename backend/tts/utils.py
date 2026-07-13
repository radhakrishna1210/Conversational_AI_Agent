"""
Audio Validation and Attribute Inference Utilities.
Shared between processing scripts and the live backend.
"""

import os
import librosa
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Constants
TARGET_SAMPLE_RATE = 24_000
IDEAL_MIN_DUR = 5.0
IDEAL_MAX_DUR = 15.0
MIN_RMS = 0.02
MAX_CLIPPING_RATIO = 0.01

def verify_audio_quality(filepath: str) -> tuple[bool, str]:
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
        return False, f"duration {duration:.1f}s outside {IDEAL_MIN_DUR}-{IDEAL_MAX_DUR}s range"

    rms = float(np.sqrt(np.mean(y ** 2)))
    if rms < MIN_RMS:
        return False, f"RMS {rms:.4f} below threshold {MIN_RMS} (too quiet)"

    clipping = float(np.mean(np.abs(y) >= 0.999))
    if clipping > MAX_CLIPPING_RATIO:
        return False, f"clipping {clipping:.2%} exceeds {MAX_CLIPPING_RATIO:.0%} (distorted)"

    return True, ""

def infer_voice_attributes(filepath: str) -> dict[str, str]:
    """
    Guess gender and style based on audio analysis.
    """
    try:
        y, sr = librosa.load(filepath, sr=TARGET_SAMPLE_RATE, mono=True)
        
        # 1. Pitch / Gender
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        avg_pitch = np.mean(pitches[pitches > 0]) if np.any(pitches > 0) else 150
        gender = "male" if avg_pitch < 165 else "female"
        
        # 2. Style
        rms = np.sqrt(np.mean(y**2))
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
    except Exception as e:
        logger.error(f"Attribute inference failed: {e}")
        return {"gender": "unknown", "style": "natural"}
