import os
import asyncio
import logging
import re
from typing import AsyncGenerator
from groq import AsyncGroq

logger = logging.getLogger(__name__)

class ChatBrain:
    def __init__(self):
        # Prefer Groq for ultra-low latency (< 500ms TTFT)
        self.api_key = os.getenv("GROQ_API_KEY", "gsk_vF08h4iV7rVvG3M6fL7rWGdyb3FYoI5I08h4iV7rVvG3M6fL7r") # Placeholder
        self.client = None
        if self.api_key and not self.api_key.startswith("gsk_placeholder"):
            try:
                self.client = AsyncGroq(api_key=self.api_key)
                logger.info("ChatBrain: Groq client initialized.")
            except Exception as e:
                logger.error(f"ChatBrain: Failed to initialize Groq client: {e}")

    async def generate_answer_stream(self, prompt: str) -> AsyncGenerator[str, None]:
        """
        Streams text response from the LLM, yielding full sentences
        to ensure natural TTS phrasing while maintaining low latency.
        """
        if not self.client:
            logger.warning("ChatBrain: No LLM client configured. Returning fallback.")
            yield "I'm sorry, I don't have an AI brain configured yet. Please add your GROQ_API_KEY to the environment."
            return

        try:
            stream = await self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a helpful, concise AI voice assistant. Give brief, natural-sounding answers suitable for TTS."},
                    {"role": "user", "content": prompt}
                ],
                stream=True,
                max_tokens=500,
            )

            buffer = ""
            async for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                buffer += token
                
                # Split by sentence boundaries but keep punctuation
                # This ensures the TTS gets a full thought to speak with proper intonation
                if any(buffer.endswith(p) for p in [".", "!", "?", "\n"]):
                    # Handle multiple sentences in one chunk if they happen
                    sentences = re.split(r'(?<=[.!?])\s+', buffer)
                    if len(sentences) > 1:
                        for s in sentences[:-1]:
                            if s.strip():
                                yield s.strip()
                        buffer = sentences[-1]
                    else:
                        if buffer.strip():
                            yield buffer.strip()
                        buffer = ""

            # Yield remaining text
            if buffer.strip():
                yield buffer.strip()

        except Exception as e:
            logger.error(f"ChatBrain: LLM Error: {e}")
            yield "I encountered an error while thinking of an answer."
