"""
Master script to run the full audio preprocessing and voice library generation pipeline.

Workflow:
    1. Scan the raw dataset in ./kaggle/
    2. Preprocess clips (24kHz, mono, trim silence, normalize, duration filter 5-10s)
    3. Select unique speakers and save to backend/voices/ as speaker_N.wav

Usage:
    python backend/scripts/run_pipeline.py
"""

import subprocess
import sys
from pathlib import Path

def run_script(script_name):
    script_path = Path(__file__).parent / script_name
    print(f"\n>>> Running {script_name}...")
    try:
        # Using sys.executable to ensure we use the same python environment
        result = subprocess.run([sys.executable, str(script_path)], check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] {script_name} failed with exit code {e.returncode}")
        return False

def main():
    root_dir = Path(__file__).resolve().parent.parent.parent
    dataset_dir = root_dir / "kaggle"
    
    print("="*60)
    print("  TTS Voice Library Generation Pipeline")
    print("="*60)
    
    if not dataset_dir.exists():
        print(f"\n[ERROR] Dataset directory not found at: {dataset_dir}")
        print("Please place your Kaggle dataset in the 'kaggle/' folder at the project root.")
        sys.exit(1)
        
    # 1. Preprocess audio
    # This script internally calls scan_audio_files
    if not run_script("preprocess_audio.py"):
        print("\nPipeline stopped due to preprocessing error.")
        sys.exit(1)
        
    # 2. Select speakers and save to voices/
    if not run_script("select_speakers.py"):
        print("\nPipeline stopped due to speaker selection error.")
        sys.exit(1)
        
    print("\n" + "="*60)
    print("  PIPELINE COMPLETED SUCCESSFULLY")
    print(f"  Voices are ready in: {root_dir / 'backend' / 'voices'}")
    print("  You can now start the TTS backend.")
    print("="*60)

if __name__ == "__main__":
    main()
