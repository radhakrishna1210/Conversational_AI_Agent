"""
TTSCache — Thread-safe LRU cache for synthesised audio bytes.

Key design decisions
────────────────────
• Key:  SHA-256(text + "\x00" + voice)
        Collision-free regardless of content; avoids the naive f"{text}_{voice}"
        pattern which breaks when text itself contains underscores.

• Eviction: dual-criterion LRU
    1. Entry count  — never exceed MAX_ENTRIES (prevents unbounded dict growth)
    2. Total bytes  — never exceed MAX_BYTES   (prevents OOM on long texts)
  The oldest entry is evicted until both constraints are satisfied.

• Thread safety: threading.Lock guards all mutations.
  generate_audio() runs in asyncio.to_thread(), so concurrent calls from
  multiple WebSocket clients would race on a bare OrderedDict.

• Stats: hit / miss counters exposed via stats() for the /api/tts/cache/stats
  endpoint so operators can tune MAX_ENTRIES / MAX_BYTES at runtime.
"""

import hashlib
import logging
import threading
from collections import OrderedDict
from typing import Optional

logger = logging.getLogger(__name__)

# ── Defaults (override via TTSCache constructor) ───────────────────────────────
DEFAULT_MAX_ENTRIES: int = 100
DEFAULT_MAX_BYTES: int   = 512 * 1024 * 1024   # 512 MB


def _make_key(text: str, voice: str) -> str:
    """SHA-256 of (text NUL voice) → 64-char hex string used as cache key."""
    raw = f"{text}\x00{voice}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class TTSCache:
    """
    Thread-safe LRU cache mapping (text, voice) → WAV bytes.

    Usage
    ─────
        cache = TTSCache()

        hit = cache.get(text, voice)
        if hit is not None:
            return hit          # serve from cache

        audio = synthesise(text, voice)
        cache.put(text, voice, audio)
        return audio
    """

    def __init__(
        self,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        max_bytes: int   = DEFAULT_MAX_BYTES,
    ) -> None:
        self._store: OrderedDict[str, bytes] = OrderedDict()
        self._total_bytes: int = 0
        self._max_entries = max_entries
        self._max_bytes   = max_bytes
        self._lock        = threading.Lock()

        # Observability counters
        self._hits:   int = 0
        self._misses: int = 0

        logger.info(
            f"[TTSCache] Initialised — max_entries={max_entries}, "
            f"max_bytes={max_bytes // (1024*1024)}MB"
        )

    # ── Public API ─────────────────────────────────────────────────────────────

    def get(self, text: str, voice: str) -> Optional[bytes]:
        """Return cached bytes for (text, voice), or None on a miss."""
        key = _make_key(text, voice)
        with self._lock:
            if key not in self._store:
                self._misses += 1
                return None

            # Move to end → mark as most-recently-used
            self._store.move_to_end(key)
            self._hits += 1
            audio = self._store[key]

        logger.info(
            f"[TTSCache] HIT  voice={voice!r} text_len={len(text)} "
            f"audio={len(audio)//1024}KB "
            f"(hits={self._hits} misses={self._misses})"
        )
        return audio

    def put(self, text: str, voice: str, audio: bytes) -> None:
        """Insert or update an entry, evicting LRU entries as needed."""
        if not audio:
            return

        key        = _make_key(text, voice)
        entry_size = len(audio)

        # Refuse single entries larger than the entire byte budget
        if entry_size > self._max_bytes:
            logger.warning(
                f"[TTSCache] Entry too large to cache "
                f"({entry_size // (1024*1024)}MB > budget). Skipping."
            )
            return

        with self._lock:
            # If the key already exists, subtract its old size before updating
            if key in self._store:
                self._total_bytes -= len(self._store[key])
                del self._store[key]

            self._store[key] = audio
            self._store.move_to_end(key)
            self._total_bytes += entry_size

            # ── Eviction loop ────────────────────────────────────────────────
            while (
                len(self._store) > self._max_entries
                or self._total_bytes > self._max_bytes
            ):
                evicted_key, evicted_val = self._store.popitem(last=False)
                self._total_bytes -= len(evicted_val)
                logger.debug(
                    f"[TTSCache] Evicted LRU entry "
                    f"({len(evicted_val)//1024}KB freed, "
                    f"total now {self._total_bytes//(1024*1024)}MB)"
                )

        logger.info(
            f"[TTSCache] STORE voice={voice!r} text_len={len(text)} "
            f"audio={entry_size//1024}KB "
            f"entries={len(self._store)} "
            f"total={self._total_bytes//(1024*1024)}MB"
        )

    def invalidate(self, text: str, voice: str) -> bool:
        """Remove a specific entry. Returns True if it existed."""
        key = _make_key(text, voice)
        with self._lock:
            if key in self._store:
                self._total_bytes -= len(self._store.pop(key))
                logger.info(f"[TTSCache] Invalidated entry voice={voice!r}")
                return True
        return False

    def clear(self) -> None:
        """Evict all cached entries and reset stats."""
        with self._lock:
            self._store.clear()
            self._total_bytes = 0
            self._hits        = 0
            self._misses      = 0
        logger.info("[TTSCache] Cache cleared.")

    def stats(self) -> dict:
        """Return a snapshot of current cache statistics."""
        with self._lock:
            total = self._hits + self._misses
            return {
                "entries":      len(self._store),
                "max_entries":  self._max_entries,
                "used_mb":      round(self._total_bytes / (1024 * 1024), 2),
                "max_mb":       round(self._max_bytes   / (1024 * 1024), 2),
                "hits":         self._hits,
                "misses":       self._misses,
                "hit_rate_pct": round(self._hits / total * 100, 1) if total else 0.0,
            }
