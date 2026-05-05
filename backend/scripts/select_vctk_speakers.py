import os
import random
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SpeakerSelector:
    def __init__(self, info_path):
        self.info_path = info_path
        self.speakers = []

    def parse_info(self):
        """Parses the speaker-info.txt file."""
        if not os.path.exists(self.info_path):
            logger.warning(f"Speaker info file not found at {self.info_path}")
            return False

        with open(self.info_path, 'r') as f:
            lines = f.readlines()
            
        # Skip header
        for line in lines[1:]:
            parts = line.strip().split()
            if len(parts) >= 4:
                # Basic extraction: ID, AGE, GENDER, ACCENT
                # Note: ACCENT might be multiple words in some formats, but we'll take the 4th part
                speaker = {
                    'id': f"p{parts[0]}",
                    'age': parts[1],
                    'gender': parts[2],
                    'accent': parts[3],
                    'region': " ".join(parts[4:]) if len(parts) > 4 else ""
                }
                self.speakers.append(speaker)
        
        logger.info(f"Parsed {len(self.speakers)} speakers from info file.")
        return True

    def select_diverse_subset(self, count=15):
        """Selects a diverse subset of speakers based on accent and gender."""
        if not self.speakers:
            logger.error("No speakers available to select from.")
            return []

        # Group by accent and gender
        diversity_map = {}
        for s in self.speakers:
            key = (s['accent'], s['gender'])
            if key not in diversity_map:
                diversity_map[key] = []
            diversity_map[key].append(s)

        selected = []
        keys = list(diversity_map.keys())
        random.shuffle(keys)

        # First pass: take one from each unique (accent, gender) pair
        for key in keys:
            if len(selected) < count:
                selected.append(random.choice(diversity_map[key]))
            else:
                break

        # Second pass: if we still need more, fill up randomly from remaining
        if len(selected) < count:
            remaining = [s for s in self.speakers if s not in selected]
            random.shuffle(remaining)
            selected.extend(remaining[:count - len(selected)])

        return selected

if __name__ == "__main__":
    # Path to the speaker-info.txt
    info_file = "./kaggle/VCTK-Corpus/VCTK-Corpus/speaker-info.txt"
    
    # Check if path exists or adjust
    if not os.path.exists(info_file):
        # Fallback to local discovery logic if needed
        pass

    selector = SpeakerSelector(info_file)
    if selector.parse_info():
        subset = selector.select_diverse_subset(count=15)
        
        print("\n--- Selected Speakers for Voice Cloning ---\n")
        print(f"{'ID':<6} | {'Gender':<8} | {'Accent':<15} | {'Region'}")
        print("-" * 50)
        for s in subset:
            print(f"{s['id']:<6} | {s['gender']:<8} | {s['accent']:<15} | {s['region']}")
        
        print(f"\nTotal selected: {len(subset)}")
    else:
        print("Failed to parse speaker info. Selecting randomly is not implemented in this demo but could be.")
