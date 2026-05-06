import os
import sys
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add scripts directory to path to import our modules
sys.path.insert(0, str(Path(__file__).resolve().parent))
from vctk_loader import VCTKLoader
from select_vctk_speakers import SpeakerSelector

# Configuration
OUTPUT_DIR = Path("backend/voices/cloning_references")
TARGET_SAMPLE_RATE = 24000
MIN_DURATION = 5.0
MAX_DURATION = 10.0
CLIPS_PER_SPEAKER = 2

# Selected speakers from previous step
SELECTED_SPEAKER_IDS = [
    "p314", "p251", "p248", "p374", "p252", 
    "p297", "p292", "p303", "p347", "p363", 
    "p335", "p315", "p253", "p228", "p245"
]

def process_clip(filepath, speaker_id, clip_index):
    """Load, trim, and save an audio clip."""
    try:
        # Load audio
        y, sr = librosa.load(filepath, sr=TARGET_SAMPLE_RATE)
        
        # Trim silence
        y_trimmed, _ = librosa.effects.trim(y, top_db=20)
        
        duration = len(y_trimmed) / TARGET_SAMPLE_RATE
        
        # Check if it meets our duration requirements
        if duration < MIN_DURATION:
            return False, "Too short"
            
        # If too long, crop to MAX_DURATION
        if duration > MAX_DURATION:
            y_trimmed = y_trimmed[:int(MAX_DURATION * TARGET_SAMPLE_RATE)]
            duration = MAX_DURATION

        # Peak Normalize
        peak = np.max(np.abs(y_trimmed))
        if peak < 0.01:
            return False, "Low amplitude"
        
        y_norm = y_trimmed * (0.95 / peak)
        
        # Save output
        speaker_out_dir = OUTPUT_DIR / speaker_id
        speaker_out_dir.mkdir(parents=True, exist_ok=True)
        
        out_path = speaker_out_dir / f"ref_{clip_index}.wav"
        sf.write(str(out_path), y_norm, TARGET_SAMPLE_RATE, subtype='PCM_16')
        
        return True, out_path
    except Exception as e:
        return False, str(e)

def main():
    # Discover dataset path
    dataset_path = "./kaggle/VCTK-Corpus/VCTK-Corpus/wav48/"
    if not os.path.exists(dataset_path):
        logger.error(f"Dataset not found at {dataset_path}")
        return

    # Load all files
    loader = VCTKLoader(dataset_path=dataset_path)
    mapping = loader.load()

    logger.info(f"Starting extraction for {len(SELECTED_SPEAKER_IDS)} speakers...")
    
    total_extracted = 0
    
    for speaker_id in SELECTED_SPEAKER_IDS:
        if speaker_id not in mapping:
            logger.warning(f"Speaker {speaker_id} not found in dataset mapping.")
            continue
            
        files = mapping[speaker_id]
        extracted_for_speaker = 0
        
        # Try to find CLIPS_PER_SPEAKER good clips
        for i, filepath in enumerate(files):
            if extracted_for_speaker >= CLIPS_PER_SPEAKER:
                break
                
            success, result = process_clip(filepath, speaker_id, extracted_for_speaker + 1)
            
            if success:
                logger.info(f"  [+] Extracted {speaker_id} clip {extracted_for_speaker + 1}: {Path(result).name}")
                extracted_for_speaker += 1
                total_extracted += 1
            else:
                # Silently skip if it doesn't meet requirements, unless we run out of files
                pass
        
        if extracted_for_speaker == 0:
            logger.error(f"  [!] Failed to extract any valid clips for speaker {speaker_id}")

    logger.info(f"Extraction complete. Total clips saved: {total_extracted}")
    logger.info(f"Clips are located in: {OUTPUT_DIR.resolve()}")

if __name__ == "__main__":
    main()
