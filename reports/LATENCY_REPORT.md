# Latency Report — HM-Voice-agent

**Branch:** `release/readiness-audit` · **Baseline commit:** `ea9008a` · **Instrumentation commit:** `f04cafc`
**Raw data:** `reports/evidence/2026-09-03_baseline/latency_baseline/` (`latency_rows.jsonl`, `latency_summary.csv`, `latency_summary.md`) · `32_network_rtt.txt`

---

## 1. Definitions and units (recorded assumption)

The request said "300–500 microseconds" (web) and "400–700 microseconds" (phone). Those are read as **milliseconds** — see `BASELINE_AUDIT.md` §2 for the physical reasoning (one loopback HTTP round trip on this machine is 3 ms = 3,000 µs). Nothing below is silently relabelled; if literal microseconds are confirmed, the verdict is *infeasible* and §6 shows the measured floors.

| Term | Definition | Where measured |
|---|---|---|
| **Actual latency** | end of the caller's speech → first audible *meaningful* agent audio | browser `<audio>` `playing` event (web); not yet measurable on phone |
| **Perceived latency** | end of speech → first audible *acknowledgement* (the cached "Mm-hmm" ack clip) | same, on a segment tagged `filler` |
| `endpointMs` | silence the recogniser waits before declaring the turn over (VAD timeout + confirmation grace) | server |
| `preLlmMs` | end-of-turn commit → transcript harvested and runtime entered | server |
| `llmTtftMs` | LLM request → first token | server |
| `ttsTtfaMs` | first text handed to TTS → first audio byte | server |
| `ttfaMs` | runtime entry → first TTS byte at the server | server |
| `waitMs` | `endpointMs + preLlmMs + ttfaMs` — server-side end-to-end | server |
| `wireMs` | (phone) end-of-turn → first frame written to the carrier socket; `wireMs − ttfaMs` ≈ pacer queue depth | phone bridge |
| `speechEndToAudibleMs` | (web) client's last VAD-voiced tick → `<audio>` `playing` | browser → server record `kind:'audible'` |
| `elLagP99Ms` | event-loop delay p99 since the previous record | server |

Cached fillers improve perceived latency only. They **do not count** toward the actual target.

## 2. Instrumentation added (commit `f04cafc`)

Before this run the log could say how fast the server was and never what the caller heard. Added, unit-tested, and not yet exercised on a live call:

1. **`turnId`** (`<call>:<turn>`) minted in both bridges; on the pipeline record, on `audio-start` / `done` frames, and on every supplementary record — so pipeline, wire and audible rows for one turn join offline.
2. **Monotonic clocks** for every bridge duration (`performance.now()`); `Date.now()` remains only for wall-clock timeouts.
3. **`kind:'audible'`** — the web client measures `speechEndToAudibleMs`, `endTurnToAudibleMs`, `clientEndpointMs` and (if an ack clip played) `perceivedMs`, and posts a `turn-timing` frame; the server validates it hard (`ws/turnTiming.js`, 5 tests) and files it.
4. **`kind:'wire'`** — the phone bridge files `wireMs` + pacer queue depth/max/dropped into the log instead of only a log line.
5. **Event-loop delay** percentiles on every record (`lib/eventLoopLag.js`, `monitorEventLoopDelay`), the instrument `PHONE_VS_WEB_LATENCY_ROOT_CAUSE.md` §7 asks for before touching B1.
6. **`scripts/latency-report.mjs`** — joins by `turnId`, prints n/p50/p90/p95/p99/max per channel × model × stage, writes JSONL/CSV/MD. Reproducible: `node scripts/latency-report.mjs --out <dir> [--since ISO] [--label ...]`.

Filler ack segments are tagged `filler:true` from the runtime (`agentRuntime.service.js:1650`) through the handler to the browser, which is what keeps perceived and actual apart.

## 3. Baseline — what exists (historical, not fresh)

`backend/logs/latency.log` on this machine: 70 rows, 2026-08-28 → 2026-09-02, **67 web, 0 phone**, all server-side. No row has `turnId`, `wireMs` or any audible timing — by construction, since none existed.

### 3.1 web · `gemini-3.5-flash-lite` (n = 61, filler ack played on 19)

| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| endpointMs | 24 | 706 | 713 | 714 | 717 | 717 |
| preLlmMs | 61 | 8 | 921 | 1162 | 1260 | 1260 |
| llmTtftMs | 61 | 1130 | 2225 | 5995 | 10147 | 10147 |
| ttsTtfaMs | 61 | 528 | 984 | 1186 | 2068 | 2068 |
| **ttfaMs** | 61 | **1707** | 3062 | 6816 | 12918 | 12918 |
| **waitMs** (server end-to-end) | 52 | **2245** | 3581 | 6820 | 12596 | 12596 |
| totalMs | 61 | 3573 | 7102 | 9655 | 15030 | 15030 |

### 3.2 web · `openai/gpt-oss-20b` (n = 6)
`llmTtftMs` p50 6618 / max 31323; `ttfaMs` p50 8116 / max 32411. Six turns, one agent; included for completeness, not as a verdict on the model.

### 3.3 phone
**No phone turn has ever been recorded end-to-end** on this machine or (per the brief) on the previous one. Every phone number in the repository's documents is inferred from code paths.

### 3.4 Reading the baseline against the target
- The `endpointMs` floor alone (p50 **706 ms**) exceeds the entire 500 ms web budget before the model is asked anything.
- Server-side `waitMs` p50 is **2245 ms**, ~4.5× the target ceiling, *before* WebSocket transit, browser decode and `<audio>` start.
- The tail is dominated by `llmTtftMs` (p95 ~6 s, p99 ~10 s), consistent with the brief's free-tier/429 findings.

## 4. Network floors measured from this machine (`32_network_rtt.txt`, 5 samples each)

| host | TCP p50 / max (ms) | TLS p50 / max (ms) | note |
|---|---:|---:|---|
| api.deepgram.com | 326 / 1033 | 618 / 2071 | STT socket (US-hosted); `Finalize` round trips pay this |
| generativelanguage.googleapis.com | 67 / 149 | 141 / 441 | LLM |
| api.elevenlabs.io | 89 / 167 | 216 / 835 | TTS |
| api.sarvam.ai | 94 / 145 | 187 / 494 | TTS (all Indian-language voices) |
| api.fish.audio | 84 / 122 | 145 / 345 | TTS |
| api.groq.com | 100 / 147 | 166 / 239 | LLM |
| aws-1-ap-southeast-1.pooler.supabase.com | 127 / 137 | 237 / 479 | **database, Singapore**; `SELECT 1` incl. connect measured 1255 ms via Prisma |
| spandan.mannmate.com (VPS 62.72.12.185) | 50 / 290 | 109 / 990 | **Mumbai** (ipinfo: Hostinger, Maharashtra) — root-cause doc "step 0" answered |
| api.plivo.com / api.twilio.com | 80 / 241 · 79 / 1659 | 160 / 1137 · 152 / 2025 | carriers |

These are dev-machine numbers (home uplink); they bound the *dev* measurements, not production. They do establish that a fresh Deepgram TLS handshake (~0.6 s p50) must never sit on a turn's critical path — the call-long session opened at auth (already in code) is the right design.

## 5. Fresh measurement — status: **NOT RUN (needs approval)**

Every fresh number in this report requires placing calls:

| measurement | requirement | status |
|---|---|---|
| ≥30 warm web turns per route (modular / bundled), cold + warm, short/long/interrupted/silent/noisy/multilingual/KB | Deepgram + Gemini + TTS quota spend; `AgentCallLog` rows written to the **production** DB via the only backend that can run (owner's dev server on `:4000`, old code) — or a disposable DB + my branch on another port | **BLOCKED — approval + isolated DB** |
| phone turns (`wireMs`, first phone `latency.log` row ever) | real number owned by the tester, carrier spend, public host (the dev tunnel adds 213 ms median and is disqualified by the repo's own evidence) | **BLOCKED** |
| concurrency 1/5/10/25/45 | above + Redis (absent) + provider RPM | **BLOCKED** |
| Gemini tier check | one generate call, or the billing console | owner |

The instrumentation is in place so that the first approved run produces `turnId`-joined pipeline/audible/wire rows and the report script yields the §1 numbers directly.

### A/B protocol for Phase 2 (to be executed once unblocked)
Same agent, same prompt, same KB, same voice, same region, same concurrency; ≥30 warm turns per arm; report n/p50/p90/p95/p99/max of `speechEndToAudibleMs` (web) or `wireMs` (phone) **and** a correctness guard per arm (transcript WER on a fixed script, reply relevance spot-check, audible clipping check, barge-in stop time). No optimisation is accepted on server-side `ttfaMs` alone.

## 6. Structural floor and verdict

The repository's own analysis (`VOICE_PIPELINE_AND_LATENCY_BRIEF.md` §7, "The honest ceiling") puts the modular STT → LLM → TTS floor at roughly `endpointing+grace (~700) + LLM TTFT (~1000) + TTS first byte (~500) ≈ 2.2 s`. The baseline above (`waitMs` p50 2245) **reproduces that figure almost exactly**, on the newer model.

Ranked levers, from measured contribution (all still to be A/B'd):
1. **Endpointing (~700 ms, fixed cost on every turn)** — the single biggest controllable item and by itself larger than the web budget. Options: shorter grace with a semantic/interim-transcript confirmer; Deepgram's `UtteranceEnd`/interim-based commit; both need a mid-sentence-cutoff guard measured on natural pauses, numbers and names.
2. **LLM TTFT tail** (p95 6 s) — billing tier / model / hedge; the brief already moved the p50 to ~1.1 s.
3. **TTS first byte** (~0.5 s) — session warm-up / pooling across turns (undici pool keeps sockets ~4 s; turns are 15–60 s apart), native streaming formats.
4. **Phone: pacer queue depth** (`wireMs − ttfaMs`) — now measurable; unknown until a real call is logged.
5. **Event-loop lag under concurrency** — now measurable; unknown.

**Verdict (this run):**
- Web actual target **300–500 ms: NOT PROVEN, and not reachable on the modular route by the repository's own floor (~2.2 s)**. The bundled/realtime route (xAI / ElevenLabs ConvAI, or `gemini-*-live`) is the only path the brief identifies for sub-second, and it has **no measurement in this run**.
- Phone actual target **400–700 ms: NOT PROVEN; no phone turn measured, ever.**
- Perceived latency via the 400 ms ack clip is a UX mitigation and is reported separately; it does not satisfy either target.

Nothing in this report is a fresh end-to-end measurement. The deliverable of this phase is that the next run *can* be one.
