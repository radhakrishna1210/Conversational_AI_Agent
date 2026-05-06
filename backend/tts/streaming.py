import asyncio
from typing import AsyncGenerator


class TTSStreamer:
    """
    Splits a fully-synthesised audio buffer into adaptive chunks for streaming.
    Used only by the HTTP endpoints (POST /api/tts, POST /api/tts/preview).

    The WebSocket endpoint bypasses this class entirely and calls
    TTSEngine.generate_audio_stream_async() directly so the first bytes
    are sent before full synthesis finishes.

    Chunk strategy
    ──────────────
    • First INITIAL_CHUNKS_COUNT chunks: INITIAL_CHUNK_SIZE bytes
      → smaller payload = faster first-byte delivery over HTTP
    • Remaining chunks: STABLE_CHUNK_SIZE bytes
      → larger payload = fewer syscalls, better throughput
    • No artificial sleep between chunks — the event loop handles back-pressure
      naturally; adding sleep only delays the client for no benefit.
    """

    INITIAL_CHUNK_SIZE: int = 512    # ~21ms of 24kHz mono 16-bit audio
    STABLE_CHUNK_SIZE: int  = 4096   # ~85ms — good balance of throughput/latency
    INITIAL_CHUNKS_COUNT: int = 3    # first N chunks use the smaller size

    def __init__(self):
        pass

    async def stream_audio(self, audio_bytes: bytes) -> AsyncGenerator[bytes, None]:
        """
        Yields audio_bytes in adaptive chunks.
        First INITIAL_CHUNKS_COUNT chunks are INITIAL_CHUNK_SIZE bytes;
        subsequent chunks are STABLE_CHUNK_SIZE bytes.
        No artificial delays — back-pressure is handled by the event loop.
        """
        if not audio_bytes:
            return

        view = memoryview(audio_bytes)
        offset = 0
        chunks_sent = 0

        while offset < len(view):
            size = (
                self.INITIAL_CHUNK_SIZE
                if chunks_sent < self.INITIAL_CHUNKS_COUNT
                else self.STABLE_CHUNK_SIZE
            )
            chunk = view[offset : offset + size].tobytes()
            yield chunk
            offset += len(chunk)
            chunks_sent += 1

            # Yield control to the event loop so other coroutines can run,
            # but don't sleep — we want the client to receive data ASAP.
            await asyncio.sleep(0)
