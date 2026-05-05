import logging
import os
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from faster_whisper import WhisperModel

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize Whisper Model (Lazy loading or global)
# Using 'base' for a good balance of speed and accuracy
_model = None

def get_model():
    global _model
    if _model is None:
        logger.info("Loading Faster Whisper model ('base')...")
        
        # Auto-detect device
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        
        logger.info(f"Using device: {device} with {compute_type}")
        _model = WhisperModel("base", device=device, compute_type=compute_type)
        logger.info("Whisper model loaded.")
    return _model

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe uploaded audio file using Faster Whisper.
    Supports common formats (wav, webm, mp3).
    """
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    # 1. Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix or ".webm") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        logger.info(f"Transcribing audio: {file.filename}")
        model = get_model()
        
        # 2. Transcribe
        # beam_size=1 is much faster for real-time use cases
        segments, info = model.transcribe(tmp_path, beam_size=1)
        
        # 3. Collect text
        full_text = ""
        for segment in segments:
            full_text += segment.text + " "
        
        transcription = full_text.strip()
        logger.info(f"Transcription complete: '{transcription}'")
        
        return {
            "text": transcription,
            "language": info.language,
            "language_probability": info.language_probability
        }

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to transcribe audio: {str(e)}")
    
    finally:
        # Cleanup
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
