import os
import librosa
import numpy as np
import soundfile as sf
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class XTTSCleaner:
    def __init__(self, target_sr=24000, top_db=30, norm_level=0.95):
        """
        Initialize the XTTS Audio Cleaner.
        
        Args:
            target_sr (int): Sample rate required by XTTS (default 24000).
            top_db (int): The threshold (in decibels) below reference to consider as silence.
            norm_level (float): Peak normalization level (0.0 to 1.0).
        """
        self.target_sr = target_sr
        self.top_db = top_db
        self.norm_level = norm_level

    def clean(self, input_path, output_path):
        """
        Clean an audio file: resample, mono, trim, and normalize.
        """
        try:
            # 1. Load, resample to 24kHz and convert to mono
            # librosa.load does mono=True by default
            y, sr = librosa.load(input_path, sr=self.target_sr, mono=True)
            
            if len(y) == 0:
                return False, "Empty audio file"

            # 2. Trim silence from start and end
            # Using a slightly more aggressive top_db for "high clarity"
            y_trimmed, _ = librosa.effects.trim(y, top_db=self.top_db)

            # 3. Normalize volume
            peak = np.max(np.abs(y_trimmed))
            if peak > 0:
                y_final = y_trimmed * (self.norm_level / peak)
            else:
                y_final = y_trimmed

            # 4. Save as 16-bit PCM WAV (Standard for XTTS)
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            sf.write(str(output_path), y_final, self.target_sr, subtype='PCM_16')
            
            return True, f"Cleaned: {output_path.name}"
        
        except Exception as e:
            return False, str(e)

def process_directory(input_dir, output_dir):
    """Clean all audio files in a directory."""
    cleaner = XTTSCleaner()
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    supported_ext = ('.wav', '.mp3', '.flac', '.ogg', '.m4a')
    files = [f for f in input_path.rglob('*') if f.suffix.lower() in supported_ext]
    
    logger.info(f"Found {len(files)} files to clean.")
    
    success_count = 0
    for f in files:
        # Maintain directory structure
        rel_path = f.relative_to(input_path)
        dest_path = output_path / rel_path.with_suffix('.wav')
        
        success, msg = cleaner.clean(f, dest_path)
        if success:
            success_count += 1
            logger.info(f"[OK] {msg}")
        else:
            logger.error(f"[ERROR] Failed to process {f.name}: {msg}")
            
    logger.info(f"Cleanup finished. Successfully processed {success_count}/{len(files)} files.")

if __name__ == "__main__":
    # Example: Clean the cloning references we just extracted to ensure they are perfect
    source = "backend/voices/cloning_references"
    destination = "backend/voices/cloning_references_cleaned"
    
    if os.path.exists(source):
        process_directory(source, destination)
    else:
        print(f"Source directory {source} not found. Please provide an input path.")
