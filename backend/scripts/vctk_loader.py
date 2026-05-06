import os
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OptimizedVCTKLoader:
    def __init__(self, dataset_path="./kaggle/VCTK-Corpus/VCTK-Corpus/wav48/"):
        self.dataset_path = Path(dataset_path)

    def get_speaker_files(self, speaker_ids, max_files_per_speaker=2):
        """
        Targeted scan: Only look for specific speakers and stop after finding enough files.
        """
        if not self.dataset_path.exists():
            logger.error(f"Dataset path not found: {self.dataset_path}")
            return {}

        logger.info(f"Targeted scan for {len(speaker_ids)} speakers...")
        mapping = {}
        
        for speaker_id in speaker_ids:
            speaker_dir = self.dataset_path / speaker_id
            if speaker_dir.is_dir():
                # Lazy/Targeted file collection
                files = []
                # Use a generator to stop as soon as we hit the limit
                for entry in os.scandir(speaker_dir):
                    if entry.is_file() and entry.name.lower().endswith('.wav'):
                        files.append(entry.path)
                        if len(files) >= max_files_per_speaker:
                            break
                mapping[speaker_id] = files
                logger.info(f"  [Progress] Found {len(files)} files for {speaker_id}")
            else:
                logger.warning(f"  [!] Speaker folder not found: {speaker_id}")
                
        return mapping

if __name__ == "__main__":
    # Test targeted loading
    loader = OptimizedVCTKLoader()
    # Test with a subset
    test_ids = ["p225", "p226"]
    res = loader.get_speaker_files(test_ids)
    print(res)
