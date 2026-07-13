from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import tts, stt

app = FastAPI(title="TTS Service", description="Text-to-Speech Service API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])
app.include_router(stt.router, prefix="/api/stt", tags=["STT"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/voices")
async def get_voices_root(gender: str = None, style: str = None):
    """Alias for /api/tts/voices to match user requirements."""
    return await tts.get_voices(gender, style)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
