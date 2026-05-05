import os
import shutil
import json
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Paths
SOURCE_DIR = Path("backend/voices/cloning_references_cleaned")
DEST_DIR = Path("Conversational_AI_Agent/backend/voices")
METADATA_FILE = DEST_DIR / "voice_metadata.json"

# List of selected speakers for consistent ordering if needed, or just use what's found
# We'll use the IDs to pull the first clip from each
SPEAKER_IDS = [
    "p314", "p251", "p248", "p374", "p252", 
    "p297", "p292", "p303", "p347", "p363", 
    "p335", "p315", "p253", "p228", "p245"
]

def finalize():
    if not SOURCE_DIR.exists():
        logger.error(f"Source directory {SOURCE_DIR} not found.")
        return

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    
    metadata = {}
    
    logger.info(f"Finalizing voices into {DEST_DIR}...")
    
    for i, speaker_id in enumerate(SPEAKER_IDS, 1):
        speaker_dir = SOURCE_DIR / speaker_id
        if not speaker_dir.exists():
            logger.warning(f"Clips for {speaker_id} not found in source.")
            continue
            
        # Get the first clip
        clips = sorted(list(speaker_dir.glob("*.wav")))
        if not clips:
            logger.warning(f"No .wav files found for {speaker_id}.")
            continue
            
        best_clip = clips[0]
        new_name = f"speaker_{i}.wav"
        dest_path = DEST_DIR / new_name
        
        # Copy and rename
        shutil.copy2(best_clip, dest_path)
        
        # Track metadata
        metadata[new_name] = {
            "original_id": speaker_id,
            "vctk_path": str(best_clip)
        }
        
        logger.info(f"  [+] Saved {new_name} (from {speaker_id})")

    # Save metadata for future reference
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=4)
        
    logger.info(f"Metadata saved to {METADATA_FILE}")
    logger.info("Finalization complete.")

if __name__ == "__main__":
    finalize()
