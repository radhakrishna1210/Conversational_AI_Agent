import asyncio
import logging
import os
import shutil
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.responses import StreamingResponse, Response

from tts.models import TTSRequest, VoicePreviewRequest
from tts.engine import TTSEngine
from tts.streaming import TTSStreamer
from tts.utils import verify_audio_quality, infer_voice_attributes
from tts.brain import ChatBrain

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize components
tts_engine = TTSEngine()
tts_streamer = TTSStreamer()
chat_brain = ChatBrain()

@router.get("/voices")
async def get_voices(gender: str = None, style: str = None):
    """
    Get the list of available voices with their metadata.
    Supports filtering by gender and style via query parameters.
    Returns: { "voices": [ { "name": "speaker_1", "gender": "male", "style": "deep" }, ... ] }
    """
    tts_engine.refresh_voices()
    
    voices_list = []
    for name, meta in tts_engine.voice_metadata.items():
        # Apply filters if provided
        if gender and meta.get("gender") != gender.lower():
            continue
        if style and meta.get("style") != style.lower():
            continue
            
        voices_list.append({
            "name": name,
            **meta
        })
        
    return {"voices": voices_list}
    
@router.get("/cache/stats")
async def get_cache_stats():
    """
    Get statistics for the TTS caching layer.
    Returns hit rate, memory usage, and entry count.
    """
    return tts_engine._cache.stats()

@router.post("/cache/clear")
async def clear_cache():
    """
    Clear all entries from the TTS caching layer.
    """
    tts_engine._cache.clear()
    return {"status": "success", "message": "Cache cleared."}

@router.post("")
async def generate_tts(request: TTSRequest):
    """
    Generate and stream TTS audio from text.
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text content is required.")
            
        logger.info(f"Processing TTS request, text length: {len(request.text)}, voice: {request.voice}")
        
        # Use default voice if not provided
        voice = request.voice if request.voice else "female"
        
        # Defensive refresh if the requested voice isn't currently known
        if voice not in tts_engine.voices:
            logger.info(f"Requested voice '{voice}' not found in memory. Refreshing voices...")
            tts_engine.refresh_voices()
            
        # Synthesize audio bytes asynchronously to avoid blocking
        audio_bytes = await tts_engine.generate_audio_async(request.text, voice)
        
        # Stream the audio response
        return StreamingResponse(
            tts_streamer.stream_audio(audio_bytes),
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'attachment; filename="tts_output.wav"'
            }
        )
    except ValueError as ve:
        logger.warning(f"Validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"TTS Synthesis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to synthesize audio.")

@router.post("/preview")
async def preview_voice(request: VoicePreviewRequest):
    """
    Generate a short audio sample for a specific voice.
    Returns a personalized sample sentence rendered in the requested voice.
    """
    # Sample sentences keyed loosely on voice name fragments for personality;
    # falls back to a neutral sentence for unknown voices.
    PREVIEW_SENTENCES = [
        "Hi there! This is how I sound when I speak to you.",
        "Hello! I'm ready to assist you with clear, natural speech.",
        "Greetings! Let me show you the quality of my voice.",
        "Hey! I'll be your AI voice assistant today.",
        "Welcome! I hope my voice is a good fit for your needs.",
    ]

    try:
        voice = request.voice

        # Defensive refresh if unknown
        if voice not in tts_engine.voices:
            tts_engine.refresh_voices()

        if voice not in tts_engine.voices:
            raise HTTPException(status_code=404, detail=f"Voice '{voice}' not found.")

        # Pick a deterministic sentence per voice so repeated clicks sound consistent
        sentence_index = hash(voice) % len(PREVIEW_SENTENCES)
        preview_text = PREVIEW_SENTENCES[sentence_index]

        logger.info(f"Generating preview for voice '{voice}': \"{preview_text}\"")
        audio_bytes = await tts_engine.generate_audio_async(preview_text, voice)

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                # Exact size lets the browser show progress on short clips
                "Content-Length": str(len(audio_bytes)),
                # Cache for 10 minutes — same voice/sentence always produces the same audio
                "Cache-Control": "public, max-age=600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview error for voice '{request.voice}': {e}")
        raise HTTPException(status_code=500, detail="Failed to generate preview.")

@router.post("/upload-voice")
async def upload_voice(file: UploadFile = File(...)):
    """
    Upload a custom voice .wav file.
    Validates quality and adds to the dynamic voice library.
    """
    if not file.filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only .wav files are supported.")
        
    # 1. Save temp file for validation
    temp_dir = Path("backend/uploads/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / file.filename
    
    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Validate Quality
        passed, reason = verify_audio_quality(str(temp_path))
        if not passed:
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"Quality check failed: {reason}")
            
        # 3. Infer Attributes
        attr = infer_voice_attributes(str(temp_path))
        
        # 4. Move to permanent voices directory
        voices_dir = Path("backend/voices")
        voices_dir.mkdir(parents=True, exist_ok=True)
        final_path = voices_dir / file.filename
        
        if final_path.exists():
             os.remove(temp_path)
             raise HTTPException(status_code=400, detail="Voice with this name already exists.")
             
        shutil.move(str(temp_path), str(final_path))
        
        # 5. Update voices.json metadata
        meta_path = voices_dir / "voices.json"
        voice_name = final_path.stem
        all_meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, 'r') as f:
                    all_meta = json.load(f)
            except: pass
            
        all_meta[voice_name] = attr
        with open(meta_path, 'w') as f:
            json.dump(all_meta, f, indent=4)
            
        # 6. Refresh Engine
        tts_engine.refresh_voices()
        
        return {
            "status": "success",
            "voice_name": voice_name,
            "metadata": attr
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        if temp_path.exists(): os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to upload voice: {str(e)}")

@router.websocket("/ws/tts")
async def websocket_tts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time TTS streaming.
    Supports persistent connections and immediate interruption.
    """
    await websocket.accept()
    logger.info("WebSocket connection established for TTS.")
    
    active_task = None
    
    async def process_and_stream(text: str, voice: str):
        try:
            t_start = asyncio.get_event_loop().time()
            logger.info(f"[WS] Stream request: voice='{voice}', text={len(text)} chars")

            # Signal to client that synthesis has started (optional UI feedback)
            await websocket.send_json({"event": "stream_start"})

            chunks_sent = 0
            bytes_sent = 0

            # ── True streaming: first chunk sent as soon as engine yields it ──
            # generate_audio_stream_async yields WAV bytes per sentence/chunk
            # without waiting for full synthesis to complete.
            async for chunk in tts_engine.generate_audio_stream_async(text, voice):
                if not chunk:
                    continue

                await websocket.send_bytes(chunk)
                bytes_sent += len(chunk)
                chunks_sent += 1

                if chunks_sent == 1:
                    first_chunk_latency = asyncio.get_event_loop().time() - t_start
                    logger.info(
                        f"[WS] First chunk sent → {len(chunk)} bytes, "
                        f"latency: {first_chunk_latency*1000:.0f}ms"
                    )

            total_latency = asyncio.get_event_loop().time() - t_start
            logger.info(
                f"[WS] Stream complete → {chunks_sent} chunks, "
                f"{bytes_sent} bytes, {total_latency:.2f}s total"
            )
            await websocket.send_json({"event": "stream_end"})

        except asyncio.CancelledError:
            logger.info("[WS] Stream interrupted by new request.")
        except Exception as e:
            logger.error(f"[WS] Streaming error: {e}")
            try:
                await websocket.send_json({"error": "Failed to generate speech."})
            except:
                pass

    async def process_chat_and_stream(text: str, voice: str):
        """
        First gets an answer from the Brain (LLM), then streams it through TTS.
        Everything happens in parallel: as soon as the Brain yields a sentence,
        it starts being synthesized and streamed.
        """
        try:
            t_start = asyncio.get_event_loop().time()
            logger.info(f"[WS] Chat request: voice='{voice}', prompt='{text[:50]}...'")

            await websocket.send_json({"event": "brain_start"})
            
            # 1. Stream sentences from Brain
            async for sentence in chat_brain.generate_answer_stream(text):
                if not sentence: continue
                
                # Send the text back to client so they can display it immediately
                await websocket.send_json({
                    "event": "brain_chunk",
                    "text": sentence
                })
                
                # 2. Stream audio for THIS sentence
                # We don't wait for the full response; we stream sentence-by-sentence
                async for audio_chunk in tts_engine.generate_audio_stream_async(sentence, voice):
                    if audio_chunk:
                        await websocket.send_bytes(audio_chunk)

            logger.info(f"[WS] Chat complete in {asyncio.get_event_loop().time() - t_start:.2f}s")
            await websocket.send_json({"event": "stream_end"})

        except asyncio.CancelledError:
            logger.info("[WS] Chat interrupted.")
        except Exception as e:
            logger.error(f"[WS] Chat error: {e}")
            await websocket.send_json({"error": "Assistant brain failed."})

    try:
        while True:
            # 1. Wait for next request
            try:
                data = await websocket.receive_json()
            except Exception:
                # Likely disconnect or invalid JSON
                break

            text = data.get("text", "")
            voice = data.get("voice", "female")
            event = data.get("event")

            # Handle Heartbeat
            if event == "ping":
                await websocket.send_json({"event": "pong"})
                continue
            
            if not text.strip():
                continue

            # 2. Interrupt any ongoing task
            if active_task and not active_task.done():
                active_task.cancel()
                try:
                    await active_task
                except asyncio.CancelledError:
                    pass

            # 3. Start new task
            if data.get("is_chat", False):
                active_task = asyncio.create_task(process_chat_and_stream(text, voice))
            else:
                active_task = asyncio.create_task(process_and_stream(text, voice))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        if active_task and not active_task.done():
            active_task.cancel()
        try:
            await websocket.close()
            logger.info("WebSocket connection closed.")
        except: pass
