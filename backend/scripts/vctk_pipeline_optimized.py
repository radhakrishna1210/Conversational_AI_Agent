import os
import sys
import json
import time
import logging
import shutil
import concurrent.futures
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
PROJECT_ROOT = Path("Conversational_AI_Agent")
DATASET_PATH = Path("kaggle/VCTK-Corpus/VCTK-Corpus/wav48/")
INFO_FILE = Path("kaggle/VCTK-Corpus/VCTK-Corpus/speaker-info.txt")
VOICES_DIR = PROJECT_ROOT / "backend" / "voices"
TARGET_SAMPLE_RATE = 24000
MIN_DURATION = 5.0
MAX_DURATION = 10.0
SPEAKER_COUNT = 20

# Add scripts dir to path for imports if needed
sys.path.insert(0, str(Path(__file__).resolve().parent))

def get_diverse_speakers(count=SPEAKER_COUNT):
    """Parses speaker-info.txt and selects a diverse subset."""
    if not INFO_FILE.exists():
        logger.error(f"Info file not found: {INFO_FILE}")
        return []

    speakers = []
    with open(INFO_FILE, 'r') as f:
        lines = f.readlines()
    
    for line in lines[1:]:
        parts = line.strip().split()
        if len(parts) >= 4:
            speakers.append({
                'id': f"p{parts[0]}",
                'gender': "male" if parts[2].upper() == 'M' else "female",
                'accent': parts[3]
            })

    # Group by accent and gender for diversity
    groups = {}
    for s in speakers:
        key = (s['accent'], s['gender'])
        if key not in groups: groups[key] = []
        groups[key].append(s)

    selected = []
    import random
    keys = list(groups.keys())
    random.shuffle(keys)
    # First pass: one from each unique (accent, gender) pair
    for key in keys:
        if len(selected) < count:
            selected.append(random.choice(groups[key]))
        else:
            break
            
    # Second pass: if we still need more, take from the remaining pool
    if len(selected) < count:
        already_selected_ids = {s['id'] for s in selected}
        remaining_pool = [s for s in speakers if s['id'] not in already_selected_ids]
        random.shuffle(remaining_pool)
        
        for s in remaining_pool:
            if len(selected) < count:
                selected.append(s)
            else:
                break
    
    return selected

def process_single_audio(args):
    """Worker function for parallel processing."""
    speaker_id, source_path, dest_path = args
    try:
        # Load and process
        y, sr = librosa.load(source_path, sr=TARGET_SAMPLE_RATE, mono=True)
        y_trimmed, _ = librosa.effects.trim(y, top_db=25)
        
        duration = len(y_trimmed) / TARGET_SAMPLE_RATE
        if duration < MIN_DURATION: return False, "Too short"
        
        if duration > MAX_DURATION:
            y_trimmed = y_trimmed[:int(MAX_DURATION * TARGET_SAMPLE_RATE)]
        
        peak = np.max(np.abs(y_trimmed))
        if peak < 0.01: return False, "Low amplitude"
        
        y_norm = y_trimmed * (0.95 / peak)
        
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(dest_path), y_norm, TARGET_SAMPLE_RATE, subtype='PCM_16')
        return True, speaker_id
    except Exception as e:
        return False, str(e)

def run_optimized_pipeline():
    start_time = time.time()
    logger.info("🚀 Starting Optimized VCTK Pipeline...")

    # 1. Select Speakers
    selected_speakers = get_diverse_speakers()
    speaker_ids = [s['id'] for s in selected_speakers]
    logger.info(f"Selected {len(speaker_ids)} diverse speakers.")

    # 2. Targeted Scan (Lazy Loading)
    from vctk_loader import OptimizedVCTKLoader
    loader = OptimizedVCTKLoader(dataset_path=DATASET_PATH)
    speaker_mapping = loader.get_speaker_files(speaker_ids, max_files_per_speaker=20) # Scan more to find a good one

    # 3. Prepare Tasks
    tasks = []
    metadata = {}
    
    for i, speaker in enumerate(selected_speakers, 1):
        sid = speaker['id']
        files = speaker_mapping.get(sid, [])
        if not files: continue
        
        voice_name = f"speaker_{i}"
        dest_path = VOICES_DIR / f"{voice_name}.wav"
        
        # We'll take the first one that passes in the worker, 
        # but for simplicity we queue the first file here.
        # A more robust version would queue multiple and stop on success.
        tasks.append((sid, files[0], dest_path))
        
        metadata[voice_name] = {
            "gender": speaker['gender'],
            "accent": speaker['accent'],
            "style": "natural",
            "original_id": sid
        }

    # 4. Processing with Retry Logic
    logger.info(f"Processing speakers in parallel...")
    success_count = 0
    
    def process_speaker(args):
        sid, files, dest_path = args
        for f in files:
            success, result = process_single_audio((sid, f, dest_path))
            if success:
                return True, sid
        return False, f"No valid clips found for {sid} after checking {len(files)} files"

    # Re-wrap tasks to include all files found for that speaker
    retry_tasks = []
    for i, speaker in enumerate(selected_speakers, 1):
        sid = speaker['id']
        files = speaker_mapping.get(sid, [])
        if not files: continue
        
        voice_name = f"speaker_{i}"
        dest_path = VOICES_DIR / f"{voice_name}.wav"
        retry_tasks.append((sid, files, dest_path))
        
        metadata[voice_name] = {
            "gender": speaker['gender'],
            "accent": speaker['accent'],
            "style": "natural",
            "original_id": sid
        }

    with concurrent.futures.ThreadPoolExecutor() as executor:
        results = list(executor.map(process_speaker, retry_tasks))
    
    for success, msg in results:
        if success: success_count += 1
        else: logger.warning(f"  [!] Speaker {msg}")

    # 5. Save Metadata
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    with open(VOICES_DIR / "voices.json", 'w') as f:
        json.dump(metadata, f, indent=4)

    end_time = time.time()
    logger.info(f"✅ Pipeline complete in {end_time - start_time:.2f}s")
    logger.info(f"Successfully processed {success_count} voices.")

if __name__ == "__main__":
    run_optimized_pipeline()
