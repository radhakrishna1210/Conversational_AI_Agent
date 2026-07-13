import os
import json
from pathlib import Path

# Paths
VOICES_DIR = Path("Conversational_AI_Agent/backend/voices")
INFO_FILE = Path("kaggle/VCTK-Corpus/VCTK-Corpus/speaker-info.txt")
TEMP_META_FILE = VOICES_DIR / "voice_metadata.json"
FINAL_META_FILE = VOICES_DIR / "voices.json"

def get_speaker_info():
    """Parses the speaker-info.txt file into a dict."""
    info = {}
    if not INFO_FILE.exists():
        print(f"Error: {INFO_FILE} not found.")
        return info

    with open(INFO_FILE, 'r') as f:
        lines = f.readlines()
        
    for line in lines[1:]: # Skip header
        parts = line.strip().split()
        if len(parts) >= 4:
            speaker_id = f"p{parts[0]}"
            gender = "male" if parts[2].upper() == 'M' else "female"
            accent = parts[3]
            info[speaker_id] = {
                "gender": gender,
                "accent": accent
            }
    return info

def enrich():
    if not TEMP_META_FILE.exists():
        print(f"Error: {TEMP_META_FILE} not found.")
        return

    with open(TEMP_META_FILE, 'r') as f:
        voice_mapping = json.load(f)

    speaker_info = get_speaker_info()
    
    enriched_metadata = {}
    
    for voice_name, data in voice_mapping.items():
        original_id = data.get("original_id")
        if original_id in speaker_info:
            info = speaker_info[original_id]
            enriched_metadata[voice_name.replace(".wav", "")] = {
                "gender": info["gender"],
                "accent": info["accent"],
                "style": "natural",
                "original_id": original_id
            }
        else:
            enriched_metadata[voice_name.replace(".wav", "")] = {
                "gender": "unknown",
                "accent": "unknown",
                "style": "natural"
            }

    with open(FINAL_META_FILE, 'w') as f:
        json.dump(enriched_metadata, f, indent=4)
        
    print(f"Enriched metadata saved to {FINAL_META_FILE}")
    
    # Optionally remove the temp file
    # os.remove(TEMP_META_FILE)

if __name__ == "__main__":
    enrich()
