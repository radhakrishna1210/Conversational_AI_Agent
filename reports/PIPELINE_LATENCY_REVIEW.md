# Modular Pipeline Latency Review

**Branch:** `release/readiness-audit` · **Date:** 2026-09-03
**Data:** `backend/logs/latency.log`, 17 turns from 2026-09-02 (web, `gemini-3.5-flash-lite`, Sarvam voice, `mode:"split"`), plus 73 flash-lite turns since 2026-08-28 for the streaming check.
**Scope:** how one caller turn moves through STT → LLM → TTS on the web call, where each millisecond goes, and what the phone bridge adds on top.

---

## 1. What a turn actually does

The pipeline is the same runtime for both channels. Only the transport around it differs.

```
caller stops talking
  │
  ├─ [A] ENDPOINTING          Deepgram VAD waits `endpointingMs` (300) of silence → speech_final
  │                            server arms a grace timer (`graceMs` 400, or 1100 if the tail
  │                            "looks unfinished") → commits end-of-turn
  │                            deepgramStream.service.js:609-651, turnEndProfile.js
  │
  ├─ [B] HARVEST              finalizeTurn(): transcript already complete when committed → ~9 ms
  │                            web: webCallModularRealtime.handler.js:320-345
  │                            phone: modularMediaBridge.js:628-660
  │
  ├─ [C] LLM                  converseStream() → Gemini generateContentStream
  │                            first token measured at 932 ms p50
  │                            agentRuntime.service.js:1052, gemini.service.js:464
  │
  ├─ [D] TTS FIRST BYTE       split path: wait for first sentence boundary (≥25 chars),
  │                            POST Sarvam /text-to-speech/stream → first byte 373 ms p50
  │                            agentRuntime.service.js:1998-2100, sarvam.provider.js:289
  │
  ├─ [E] TRANSPORT + PLAY     web: WS binary frames → MediaSource(MP3) → <audio>.playing
  │                            phone: mu-law frames → 20 ms pacer → carrier → PSTN
  │                            EditAgent.tsx:1750-1960, ulawPacer.js
  │
  └─ caller hears the reply
```

Two overlaps that exist in the design and one that does not:

- **Voice resolution, KB read and filler warm-up** run during the caller's speech (`warmVoiceTurn` on `start-turn`). They cost 0 ms on the turn. Confirmed: `prepMs 0`, `voiceWaitMs 0`, `ragMs 0`.
- **Second TTS segment** is requested while segment one plays (`segmentOrder`). The mid-reply gap is gone. Confirmed by `ttsMs` (2.6 s) being hidden behind playback with `totalMs` unaffected.
- **LLM streaming into TTS does not overlap anything today.** See finding 2.

---

## 2. Where the time goes (web, p50 of the 17 most recent turns)

| stage | p50 | p90 | share of server wait | where measured |
|---|---:|---:|---:|---|
| [A] endpointing + grace | 711 | 714 | ~36 % | `endpointMs` |
| [B] harvest | 9 | 16 | <1 % | `preLlmMs` |
| [C] LLM first token | 932 | 1224 | ~47 % | `llmTtftMs` |
| [D] TTS first byte | 373 | 563 | ~19 % | `ttsTtfaMs` |
| misc (filters, buffering) | ~80 | | ~4 % | `ttfaMs − llmTtft − ttsTtfa` |
| **server end-to-end (`waitMs`)** | **1917** | **2369** | | |
| [E] browser transit + decode + play | **unmeasured** | | | 0 `audible` rows in the log |
| perceived (ack clip) | ~400 + transit | | | `VOICE_FILLER_DELAY_MS` |

Three things this table hides:

1. **`endpointMs` is undercounted.** It is computed as `(now − candidateArmedAt) + endpointingMs` when the `speech_final` frame *arrives*. Deepgram is US-hosted; TCP p50 from here is 326 ms (`32_network_rtt.txt`). Audio has to travel there, be judged silent, and the verdict has to travel back. Real silence-to-commit is closer to **900–1000 ms**, not 711.
2. **5 of 17 turns have `endpointMs: null`.** Those turns were ended by the browser's RMS backstop (`SILENCE_MS = endpointCommitMs + 300` = 1700 ms) or by `cancel-turn` override, so the caller waited *longer* on exactly the turns the metric cannot see. Their `waitMs` (~1200) is not the real wait.
3. **The "one second" you hear is the ack clip, not the reply.** `filler: true` on 24 of 73 turns. Actual first reply audio is ~1.9 s at the server plus whatever [E] costs.

---

## 3. Findings, ranked by milliseconds on the critical path

### F1. Gemini does not stream, so nothing downstream can overlap it  (~930 ms, the largest stage)

Across 73 flash-lite turns, `llmMs − llmTtftMs` is **7 ms at p50, 71 ms at p90**. The model returns the whole 1–2 sentence reply in a single chunk. Every mechanism built to hide generation behind speech (sentence chunker, socket overlap, first-sentence split) is correct code that has nothing to hide: first token equals last token.

Consequences:
- Time-to-first-audio is strictly `TTFT + TTS first byte`. Prompt trimming and sentence splitting cannot move it.
- The only levers on this stage are a faster first token or starting the request earlier. See recommendations R1 and R4.

### F2. The grace window and the LLM run in series when they could run in parallel  (up to ~400 ms)

At `speech_final` the server already holds the interim transcript (`this._tail`). It then waits 400 ms doing nothing, then harvests, then asks the LLM. Starting `converseStream` at candidate time and discarding it if the caller resumes would hide the grace window inside TTFT. The cancel path already exists (`_handleMessage` clears the timer on any new transcript). Cost: one wasted LLM request on turns where the caller resumes, which the log says is rare (`endpointMs` sits at 711 ± 5 on every measured turn, i.e. the 400 ms grace almost never gets extended).

### F3. Grace is not punctuation-aware  (~250 ms on question turns)

`looksUnfinished()` already classifies the tail. The opposite case is not used: a tail ending in `?` or a complete short clause ("yes", "book it for tomorrow.") still waits the full 400 ms. A third tier at ~100–150 ms for clearly finished tails is a two-line change in `_armEndOfTurnCandidate`.

### F4. TTS first byte waits for a full sentence, and for Sarvam that is the whole reply  (~373 ms, 563 at p90)

The split path needs a terminator followed by whitespace after ≥25 chars. Given F1, that boundary appears only when the reply is complete, so TTS starts ~940 ms after end-of-turn no matter what. Sarvam has no incremental-text socket, so this stage cannot be pre-warmed beyond the keep-alive pool already installed (`httpKeepAlive.js`). What can change: the `ws-overlap` socket path (ElevenLabs/Fish) has **never run in production** — every logged turn is `split`. For an ElevenLabs voice the socket is opened *inside* `voiceTurnStream` after STT, so its ~200 ms TLS handshake sits on the turn. Opening it at `start-turn` removes that.

### F5. The browser leg has never been measured, and the ack clip can delay the real reply

Instrumentation for `speechEndToAudibleMs` exists (commit `f04cafc`) but the log has **zero `audible` rows** — it has not been exercised on a live call. Segments play strictly in order (`activateModular`), so if the ack clip is still playing when the real reply arrives, the reply waits for it. With the ack starting at ~400 ms and real audio at ~1.4 s, any ack clip longer than ~900 ms adds actual latency. Clip lengths need checking.

### F6. The Deepgram round trip is paid on every turn's endpoint  (~150–300 ms hidden)

Deepgram US from an Indian caller: audio out, decision back. This is inside the "711" but not attributed. A closer STT region is not offered by Deepgram for this model; the mitigation is F2/F3 (stop stacking a grace window on top of a round trip that already is one).

---

## 4. What the phone adds on top

The phone bridge runs the same `voiceTurnStream`, so every number above applies unchanged. On top of it, per turn:

| addition | estimate | measured? | where |
|---|---:|---|---|
| Carrier media transit, PSTN → media server → VPS | 100–250 ms in, same out | **no** | Twilio/Plivo, outside the code |
| Deepgram hears 8 kHz mu-law through the echo canceller | same endpointing; AEC is per-frame CPU | lag now logged (`elLagP99Ms`), no data | `modularMediaBridge.js:1740-1760` |
| Pacer: first frame goes out on the next 20 ms tick | ≤20 ms, plus queue depth if TTS bursts | `wireMs − ttfaMs` now logged, 0 rows | `ulawPacer.js`, `frameClock.js` |
| TTS transcode | 0 (ElevenLabs `ulaw_8000` and Sarvam `mulaw` are native); Fish PCM → mu-law in JS | n/a | `telephonyAudio.js:248` |
| Deaf window after each reply | listens again only when `playout` ends; words said over the tail wait an extra `OVERLAP_SETTLE_MS` 700 | no | `armNextTurn`, `modularMediaBridge.js:1055` |
| Greeting after pickup | DB-bound; Supabase Singapore measured 1255 ms via Prisma from the dev machine | logged as "greeting reached the wire" | `modularMediaBridge.js:1676` |

Realistic expectation before any work: **server 1.9 s + carrier ~0.4 s ≈ 2.2–2.5 s actual** at p50, ack heard at ~0.6–0.7 s. No phone turn has ever been logged end to end, so this is arithmetic, not measurement.

---

## 5. Recommended order of work

Ordered by milliseconds saved per unit of risk. Estimates are p50, web; phone inherits each.

| # | change | saves | risk | files |
|---|---|---:|---|---|
| R1 | **Speculative LLM start at `speech_final` candidate.** Expose an `onEndOfTurnCandidate(interimText)` from the Deepgram session; the transport starts `converseStream` immediately; on commit, use it if the final transcript equals the interim (or the interim is a prefix); on cancel, `iterator.return()`. | 300–400 | low: wasted request only when the caller resumes | `deepgramStream.service.js`, both handlers, `agentRuntime.service.js` |
| R2 | **Punctuation-aware grace tier.** `?`-terminated or `COMPLETE_ONE_WORD` tails commit after ~120 ms instead of 400. | ~250 on those turns | low | `deepgramStream.service.js:609` |
| R3 | **Run the audible measurement.** 30 web turns with the client instrumentation on; get `speechEndToAudibleMs`, check ack clip length vs TTFA. | 0, but it tells us what [E] costs | none | already built |
| R4 | **Re-measure Groq first spoken token** with `scripts/measure-llm-ttft.js` (`reasoning_effort: low` was added after the 6.6 s rows in the log). If ~560 ms holds, offer it as the voice LLM. | up to ~370 | medium: model quality, quota | `groq.service.js`, `resolveLlmForAgent` |
| R5 | **Pre-connect the ElevenLabs/Fish TTS socket at `start-turn`** and confirm `ws-overlap` actually runs for a socket-capable voice. | ~200 on those voices | low | `agentRuntime.service.js:1905`, `ttsStreamFactory.js` |
| R6 | **Try `endpointingMs` 300 → 200 on `balanced`**, measuring mid-sentence cut-offs on numbers and names. | ~100 | medium: cut-offs | `turnEndProfile.js` |
| R7 | **Phone: log one real call before tuning anything.** Then read `wireMs − ttfaMs` and `elLagP99Ms`. | unknown | none | needs a number and carrier spend |

After R1, R2 and R6 the endpoint stage drops from ~711 to ~300–400 and overlaps the LLM, which puts the web server wait near **1.2–1.4 s** at p50 with the same providers. That is the floor of this architecture with a ~0.9 s first token. Sub-second actual latency on either channel requires either a sub-500 ms first-token model (R4) or the bundled realtime route, exactly as `LATENCY_REPORT.md` §6 already concluded.

---

## 6. Things checked that are not the problem

- Agent load, voice resolution, KB, filler warm-up: all 0 ms on the turn (cached and overlapped).
- Harvest: 9 ms. The `Finalize` round trip is skipped because the turn was already committed.
- Event-loop lag: not visible at n=1 call; only matters at concurrency (R7).
- Outbound HTTP: keep-alive dispatcher installed at boot; TLS handshakes are off the turn for Sarvam and Gemini.
- Mic capture: 20 ms worklet frames, VAD at 100 ms ticks; the browser's own timer cannot end a turn before the server's commit because its floor is derived from `endpointCommitMs`.
