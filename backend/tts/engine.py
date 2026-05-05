import logging
import io
import os
import json
import soundfile as sf
import numpy as np
import time
import asyncio
from collections import OrderedDict
from .selector import select_intelligent_voice
from .cache import TTSCache

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global voice mapping (will be populated dynamically)
VOICE_MAP = {}


class TTSEngine:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TTSEngine, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._cache = TTSCache()  # Professional LRU Cache with byte-limits and SHA-256 keys
            self._initialize()
            self.__class__._initialized = True

    def _initialize(self):
        logger.info("Initializing TTS Engine...")
        
        self.xtts_model = None
        self.kokoro_pipeline = None
        self.voices = {}
        self.voice_metadata = {}
        
        # =========================
        # 📂 LOAD DYNAMIC VOICES
        # =========================
        self._load_voices()

        # =========================
        # 🔥 LOAD XTTS (PRIMARY)
        # =========================
        try:
            from TTS.api import TTS
            import torch

            print("\nTrying to load XTTS...\n")

            device = "cuda" if torch.cuda.is_available() else "cpu"

            self.xtts_model = TTS(
                "tts_models/multilingual/multi-dataset/xtts_v2"
            ).to(device)

            print(f"\n[SUCCESS] XTTS loaded successfully on {device}\n")

        except Exception as e:
            print("\n[ERROR] XTTS LOAD ERROR:\n", e, "\n")
            import traceback
            traceback.print_exc()
            self.xtts_model = None

        # =========================
        # ⚡ LOAD KOKORO (FALLBACK)
        # =========================
        try:
            from kokoro import KPipeline

            logger.info("Loading Kokoro fallback...")
            self.kokoro_pipeline = KPipeline(lang_code='a')
            logger.info("Kokoro loaded successfully.")

        except Exception as e:
            logger.error(f"Kokoro load failed: {e}")
            self.kokoro_pipeline = None

        if not self.xtts_model and not self.kokoro_pipeline:
            raise RuntimeError("No TTS engines available!")

    def refresh_voices(self):
        """
        Re-scans the voice directories and updates the available voices.
        Logs all detected voices.
        """
        # Try multiple common locations for the voices folder
        possible_dirs = ["voices", "backend/voices"]
        voices_dir = None
        
        for d in possible_dirs:
            if os.path.exists(d) and os.path.isdir(d):
                voices_dir = d
                break
        
        if not voices_dir:
            voices_dir = "backend/voices"
            os.makedirs(voices_dir, exist_ok=True)
            logger.warning(f"Voices directory not found. Created '{voices_dir}'.")
            return

        # Clear existing mappings before re-scanning to allow removals
        self.voices.clear()
        self.voice_metadata.clear()
        VOICE_MAP.clear()
        
        logger.info(f"Scanning for voices in '{voices_dir}'...")
        
        # Load optional metadata if exists
        metadata_path = os.path.join(voices_dir, "voices.json")
        disk_metadata = {}
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    disk_metadata = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load voice metadata: {e}")

        found_files = [f for f in os.listdir(voices_dir) if f.endswith(".wav")]
        for file in found_files:
            voice_name = os.path.splitext(file)[0]
            voice_path = os.path.join(voices_dir, file)
            self.voices[voice_name] = voice_path
            VOICE_MAP[voice_name] = voice_path
            
            # Map attributes from disk or use defaults
            self.voice_metadata[voice_name] = disk_metadata.get(voice_name, {
                "gender": "unknown",
                "accent": "unknown",
                "style": "natural"
            })

        if self.voices:
            logger.info(f"[SUCCESS] Detected {len(self.voices)} voices:")
            for name in sorted(self.voices.keys()):
                meta = self.voice_metadata.get(name, {})
                logger.info(f"  - {name} [{meta.get('gender')}, {meta.get('style')}] ({self.voices[name]})")
        else:
            logger.warning(f"No .wav voices found in '{voices_dir}' folder.")

    def _load_voices(self):
        """
        Initial scan for voices.
        """
        self.refresh_voices()

    # =========================
    # 🎧 MAIN GENERATION
    # =========================
    def generate_audio(self, text: str, voice: str = "female") -> bytes:
        if not text.strip():
            raise ValueError("Text cannot be empty")

        audio_bytes = self._cache.get(text, voice)
        if audio_bytes:
            return audio_bytes
            
        logger.info(f"Cache MISS for key: {cache_key}")
        start_time = time.time()
        audio_bytes = None
        engine_used = "None"

        # =========================
        # 🤖 INTELLIGENT SELECTION
        # =========================
        effective_voice = voice
        if voice == "turbo":
            logger.info("Turbo mode enabled: Forcing Kokoro for low latency")
            # Skip XTTS and go straight to Kokoro
            return self._generate_kokoro(text, voice)
            
        if voice == "auto":
            auto_voice = select_intelligent_voice(text, self.voice_metadata)
            if auto_voice:
                effective_voice = auto_voice
                logger.info(f"Auto-selected voice: {effective_voice}")

        # =========================
        # 🔥 XTTS FIRST
        # =========================
        if self.xtts_model:
            try:
                logger.info(f"Using XTTS (voice={effective_voice})")

                # Get voice path with explicit fallback logging
                speaker_wav = self.voices.get(effective_voice)
                if speaker_wav:
                    logger.info(f"Selected voice: '{effective_voice}' -> {speaker_wav}")
                else:
                    fallback_name = "female" if "female" in self.voices else (list(self.voices.keys())[0] if self.voices else "default")
                    speaker_wav = self.voices.get(fallback_name)
                    logger.warning(f"Invalid voice '{effective_voice}' requested. Falling back to '{fallback_name}'.")

                if speaker_wav and os.path.exists(speaker_wav):
                    wav = self.xtts_model.tts(
                        text=text,
                        speaker_wav=speaker_wav,
                        language="en"
                    )
                else:
                    logger.warning("Voice file missing → using default speaker")
                    wav = self.xtts_model.tts(text=text, language="en")

                sample_rate = getattr(
                    self.xtts_model.synthesizer,
                    "output_sample_rate",
                    24000
                )

                audio_bytes = self._numpy_to_wav(wav, sample_rate)
                engine_used = "XTTS"

            except Exception as e:
                logger.warning(f"XTTS failed → {e}")

    def _generate_kokoro(self, text, voice="female"):
        """Internal helper for Kokoro generation to avoid code duplication."""
        if not self.kokoro_pipeline:
            raise RuntimeError("Kokoro engine not available")
            
        try:
            logger.info(f"Using Kokoro (voice={voice})")
            kokoro_voice = "am_adam" if voice == "male" else "af_heart"
            generator = self.kokoro_pipeline(text, voice=kokoro_voice, speed=1)
            audio_chunks = []
            for _, _, audio in generator:
                audio_chunks.append(audio)
            full_audio = np.concatenate(audio_chunks)
            audio_bytes = self._numpy_to_wav(full_audio, 24000)
            return audio_bytes
        except Exception as e:
            logger.error(f"Kokoro failed → {e}")
            raise RuntimeError(f"Kokoro engine failed: {e}")

    def generate_audio(self, text: str, voice: str = "female") -> bytes:
        if not text.strip():
            raise ValueError("Text cannot be empty")

        audio_bytes = self._cache.get(text, voice)
        if audio_bytes:
            return audio_bytes
            
        start_time = time.time()
        audio_bytes = None
        engine_used = "None"

        if not audio_bytes:
            raise RuntimeError("No audio generated")

        latency = time.time() - start_time
        logger.info(f"TTS done ({engine_used}) in {latency:.2f}s")

        # Update LRU Cache
        self._cache.put(text, voice, audio_bytes)
        return audio_bytes

    # =========================
    # 🎧 STREAMING GENERATION
    # =========================
    async def generate_audio_stream_async(self, text: str, voice: str = "female"):
        """
        Generates audio in a streaming fashion.
        Yields chunks as they are ready to minimize first-byte latency.
        """
        if not text.strip():
            raise ValueError("Text cannot be empty")

        # Check cache first
        audio_bytes = self._cache.get(text, voice)
        if audio_bytes:
            # Decode to numpy to allow clean chunking into valid WAV fragments
            audio_np, sr = self._get_numpy_from_wav(audio_bytes)
            
            # Chunking strategy: 
            # First few chunks are very small (~20ms) for instant start.
            # Following chunks are larger (~170ms) for efficiency.
            offset = 0
            chunks_sent = 0
            while offset < len(audio_np):
                size = 512 if chunks_sent < 3 else 4096
                chunk_np = audio_np[offset : offset + size]
                if len(chunk_np) == 0: break
                
                yield self._numpy_to_wav(chunk_np, sr)
                offset += len(chunk_np)
                chunks_sent += 1
            return

        # Handle Selection
        effective_voice = voice
        
        # TURBO MODE: Skip XTTS and use Kokoro immediately for < 200ms latency
        if voice == "turbo":
            logger.info("Turbo mode: Using Kokoro streaming")
            async for chunk in self._stream_kokoro(text, "female"):
                yield chunk
            return

        if voice == "auto":
            auto_voice = select_intelligent_voice(text, self.voice_metadata)
            if auto_voice:
                effective_voice = auto_voice

        # Use primary engine (XTTS) or fallback (Kokoro)
        if self.xtts_model:
            try:
                logger.info(f"Streaming via XTTS (voice={effective_voice})")
                
                # Get voice path with explicit fallback logging
                speaker_wav = self.voices.get(effective_voice)
                if speaker_wav:
                    logger.info(f"Selected voice: '{effective_voice}' -> {speaker_wav}")
                else:
                    fallback_name = "female" if "female" in self.voices else (list(self.voices.keys())[0] if self.voices else "default")
                    speaker_wav = self.voices.get(fallback_name)
                    logger.warning(f"Invalid voice '{effective_voice}' requested. Falling back to '{fallback_name}'.")

                # XTTS v2 supports tts_stream
                # We run the generator in a thread to avoid blocking the event loop
                def get_xtts_stream():
                    return self.xtts_model.tts_stream(
                        text=text,
                        language="en",
                        speaker_wav=speaker_wav if os.path.exists(speaker_wav) else None
                    )

                # For simplicity in this implementation, we use a wrapper to handle the generator
                # Note: Real streaming might require a more complex chunking logic for WAV headers
                # Here we just yield the raw chunks produced by the model
                chunks_sent = 0
                collected_chunks = []
                for chunk in await asyncio.to_thread(get_xtts_stream):
                    collected_chunks.append(chunk)
                    # If the first chunk is large, split it to minimize first-audio latency
                    if chunks_sent == 0 and len(chunk) > 1024:
                        for i in range(0, len(chunk), 1024):
                            sub_chunk = chunk[i : i + 1024]
                            yield self._numpy_to_wav(sub_chunk, 24000)
                    else:
                        yield self._numpy_to_wav(chunk, 24000)
                    chunks_sent += 1
                
                # Save full stream to cache
                if collected_chunks:
                    full_audio = np.concatenate(collected_chunks)
                    full_wav = self._numpy_to_wav(full_audio, 24000)
                    self._cache.put(text, voice, full_wav)
                return

            except Exception as e:
                logger.warning(f"XTTS streaming failed, trying Kokoro → {e}")

        if self.kokoro_pipeline:
            async for chunk in self._stream_kokoro(text, voice):
                yield chunk
            return

        raise RuntimeError("No TTS engines available for streaming")

    async def _stream_kokoro(self, text: str, voice: str):
        """Internal helper for Kokoro streaming."""
        try:
            logger.info(f"Streaming via Kokoro (voice={voice})")
            kokoro_voice = "am_adam" if voice == "male" else "af_heart"
            
            generator = self.kokoro_pipeline(text, voice=kokoro_voice, speed=1)
            
            chunks_sent = 0
            collected_chunks = []
            for _, _, audio in generator:
                collected_chunks.append(audio)
                # Split large first chunk into tiny pieces for ultra-fast start
                if chunks_sent == 0:
                    first_slice = 512
                    yield self._numpy_to_wav(audio[:first_slice], 24000)
                    if len(audio) > first_slice:
                        yield self._numpy_to_wav(audio[first_slice:], 24000)
                else:
                    yield self._numpy_to_wav(audio, 24000)
                chunks_sent += 1
            
            if collected_chunks:
                full_audio = np.concatenate(collected_chunks)
                full_wav = self._numpy_to_wav(full_audio, 24000)
                self._cache.put(text, voice, full_wav)
        except Exception as e:
            logger.error(f"Kokoro streaming failed → {e}")
            raise RuntimeError(f"Kokoro streaming failed: {e}")

        raise RuntimeError("No TTS engines available for streaming")

    # =========================
    # ⚡ ASYNC WRAPPER
    # =========================
    async def generate_audio_async(self, text: str, voice: str = "female"):
        return await asyncio.to_thread(self.generate_audio, text, voice)

    # =========================
    # 🔊 AUDIO HELPERS
    # =========================
    def _get_numpy_from_wav(self, wav_bytes):
        """Converts WAV bytes back to numpy array for re-chunking."""
        buffer = io.BytesIO(wav_bytes)
        data, sr = sf.read(buffer)
        return data, sr

    def _numpy_to_wav(self, audio, sr):
        buffer = io.BytesIO()

        if isinstance(audio, list):
            audio = np.array(audio)

        # Normalize
        max_amp = np.max(np.abs(audio))
        if max_amp > 0:
            audio = audio / max_amp

        sf.write(buffer, audio, sr, format="WAV")
        buffer.seek(0)
        return buffer.read()