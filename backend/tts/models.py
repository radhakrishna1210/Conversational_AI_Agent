from typing import Optional
from pydantic import BaseModel

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = 1.0

class VoicePreviewRequest(BaseModel):
    voice: str
