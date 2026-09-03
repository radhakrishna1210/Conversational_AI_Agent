# Latency Report — HM-Voice-agent

**Branch:** `release/readiness-audit` · **Baseline commit:** `ea9008a` · **Instrumentation:** `f04cafc` (phase 1), phase 2 on top of `139f797`
**Phase 1 raw data (the "before" column, preserved):** `reports/evidence/2026-09-03_baseline/latency_baseline/`
**Phase 2 raw data:** `reports/evidence/2026-09-03_phase2/latency/` — `harness_<arm>.jsonl` (one row per turn from the wire harness), `report_<arm>/latency_rows.jsonl` (joined pipeline + harness rows), `report_<arm>.md`, `server_<arm>.log`, `arms_run{1..4}.txt`, `llm_ttft_bakeoff.txt`

---

## 1. Units, definitions, and what "actual" means here

The request said "microseconds". That is physically impossible — one loopback HTTP round trip on this machine is ~3,000 µs, and no LLM or TTS answers in less than several milliseconds — so every number below is **milliseconds**, measured from the **end of the caller's speech to the first audible frame of the agent's meaningful reply**. Perceived latency (the cached "Mm-hmm" ack clip) is reported separately and never counts.

| Term | Definition | Where |
|---|---|---|
| **actual (web, this phase)** | `harnessSpeechEndToFirstReplyAudioMs`: last *voiced* PCM frame sent by the WebSocket client → first binary frame of a **non-filler** reply segment received by the client | wire harness, monotonic clock, same process boundary the browser's socket sits on |
| perceived (web) | `harnessSpeechEndToFirstAudioMs`: same, but the first audio of any kind (ack clip included) | harness |
| `speechEndToEndpointMs` | last voiced frame → server's `endpoint` frame (the turn commit) | harness |
| `endpointMs` | the **server's own estimate** of the same wait (Deepgram's `endpointing` + grace); phase 1 showed it undercounts by ~500 ms because the server could not see when speech stopped | server |
| `llmTtftAbsMs` | LLM request → first token, from the request (a speculative hit makes `llmTtftMs`-from-turn-start read ~0) | server |
| `specLeadMs` | how long the winning speculative request had already run when the turn committed | server |
| `ttsTtfaMs` / `ttfaMs` / `waitMs` | as in phase 1 (TTS first byte; turn start → first TTS byte; endpointMs+preLlm+ttfa) | server |
| browser `speechEndToAudibleMs` | `<audio>` `playing` event (phase 1 instrumentation) | browser — **not exercised** this phase (no browser session; see §7) |

What the harness does *not* include: the browser's MediaSource decode and scheduling (measured at 0 turns so far) and the caller's own device. It **does** include Deepgram, the LLM, TTS, the server's segment ordering, and WebSocket transit on localhost.

## 2. Instrumentation completed this phase

- Server-side **frame VAD** (`services/voice/frameVad.js`) gives the server the caller's real speech end; the Deepgram session keeps a per-turn **timeline** (`firstTranscriptAt`, `speechFinalAt`, `utteranceEndAt`, `candidateAt`, `commitAt`, grace tier, candidates cancelled, local-flush timing) and the pipeline record carries it (`dg*`, `vad*` fields).
- **Speculation accounting** on every record: `speculative` hit|miss|none, `specMode`, `specTrigger`, `specLeadMs`, `specBufferedChars`, `specStarted`, `specWasted`, `specWastedChars`.
- `transfer: marker|regex|null` on the record.
- `scripts/measure-webcall.mjs`: a real WebSocket client that authenticates, streams 24 kHz PCM utterances in real time (Windows SAPI speech: 12 utterances — short yes/no, questions, a number, a spelled name, a mid-sentence "um", a long two-clause sentence, a thank-you-bye, a transfer request and its negation), keeps the "mic" open with silence until the server commits, stops capturing on `endpoint` exactly as the browser does, and records a **mid-sentence cut-off** whenever the commit lands before the utterance is over.
- `scripts/latency-report.mjs --harness <jsonl>` joins harness rows to pipeline rows by `turnId` and restricts the report to that run.
- `reports/scripts/run_latency_arms.sh`: one backend per arm against the disposable database, N turns, report per arm.
- LLM bake-off `scripts/measure-llm-ttft.js` (already existed) run on this account: `llm_ttft_bakeoff.txt`.

Environment for every phase-2 number: this Windows laptop (home uplink, Node 24.19), backend on `:4100` against embedded Postgres `:5499` / Redis `:6390`, Deepgram `nova-2` (US), Gemini `gemini-3.5-flash-lite`, Sarvam `simran` (HTTP split path, MP3), no KB chunks, no ambience, ack clip on. Not the VPS, not a carrier. The absolute numbers are therefore an upper bound for the Mumbai deployment on the network legs and a fair comparison between arms.

## 3. Before — phase 1 (unchanged, historical, server-side only)

web · `gemini-3.5-flash-lite` (n = 61, 2026-08-28 → 09-02): `endpointMs` p50 706 · `llmTtftMs` p50 1130 · `ttsTtfaMs` p50 528 · `ttfaMs` p50 **1707** · `waitMs` p50 **2245**, p90 3581, p99 12596. Zero audible rows, zero phone rows. The pipeline review of 2026-09-03 (17 turns) put `waitMs` at 1917 p50. Neither number includes Deepgram's real end-of-speech lag, which phase 1 could not see.

## 4. After — phase 2, the clean A/B (run 3: 24 turns per arm, same code, same 12 utterances, same backend build, arms differ only by `VOICE_SPECULATION`)

All three arms: **0 mid-sentence cut-offs, 0 turns without a reply** (runs 1–2 had 7–11 of 24–30, see §6).

### 4.1 Actual latency (web, socket boundary), ms

| arm | n | p50 | p90 | p95 | p99 | max | fail | perceived p50 (ack) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| speculation **off** (yesterday's behaviour) | 24 | **2861** | 6428 | 6673 | 9710 | 9710 | 0 | 2854 |
| **candidate** (start the LLM when the caller pauses — new default) | 24 | **2136** | 6223 | 7986 | 9337 | 9337 | 0 | 2116 |
| **interim** (also restart during speech) | 24 | **2113** | 4115 | 5580 | 5603 | 5603 | 0 | 2074 |

p50 improves by **725 ms** with the default and the tail tightens only in the aggressive mode; the p90+ is the LLM's tail (§4.3), which speculation cannot hide when the model itself takes 4–8 s.

### 4.2 Stage waterfall (candidate arm, p50 / p90, ms; n in brackets)

| stage | p50 | p90 | note |
|---|---:|---:|---|
| caller stops → server commits turn (`speechEndToEndpointMs`) [18] | **950** | 1921 | the floor: Deepgram `endpointing` 300 + grace 150–400 = ~460 (`endpointMs` [18] 455), the remaining ~500 is the recogniser's own delivery lag (India → US) |
| commit → runtime entry (`preLlmMs`) | ≈5 | | `Finalize` round trip skipped on committed turns (phase-1 fix, confirmed: `dgLastWordToSpeechFinalMs` = 0) |
| LLM first token from the **request** (`llmTtftAbsMs`) [20] | 885 | 3142 | of which `specLeadMs` [18] 162 p50 / 1108 p90 was already spent before commit |
| LLM first token seen **by the turn** (`llmTtftMs`) [20] | 658 | 2483 | |
| TTS first byte (`ttsTtfaMs`) [20] | 420 | 477 | Sarvam HTTP; first sentence only |
| server end-to-end (`waitMs`) [20] | 1586 | 3718 | uses the undercounted `endpointMs` |
| **actual at the socket** [24] | **2136** | 6223 | = commit (950) + LLM (658) + TTS (420) + ~100 ordering/transit |
| event-loop p99 (`elLagP99Ms`) | 36 | 40 | one call, idle box |

Speculation on that arm: **hit rate 90 %** (18 hits, 2 misses); 51 requests started for 20 real turns → **1.65 discarded requests per turn** (≈1,200 wasted characters ≈ 300 tokens). Interim arm: 80 % hit, 1.65 wasted per turn. Cost multiplier for the LLM is therefore ≈ 2.5–2.7× requests per turn in either mode; on a per-token paid tier that is the price of the 725 ms. The owner sets it per agent (`speculation` off|candidate|interim) and platform-wide (`VOICE_SPECULATION`).

### 4.3 The LLM on this account (bake-off, 8 runs each, voice-sized prompt)

| model | min | p50 | p90 | max |
|---|---:|---:|---:|---:|
| gemini-3.5-flash-lite | 820 | **1320** | 5306 | 9329 |
| gemini-3.1-flash-lite | 1117 | 2039 | 2947 | 3772 |
| gemini-2.5-flash | error (not served to this key) | | | |
| groq openai/gpt-oss-20b | 492 | **9845** | 16943 | 18841 |

Groq's floor (492 ms) is the best first token seen, but 6 of 8 runs took 5–19 s: this key is rate-limited. No credible fast model exists on this account today; that is a billing/tier decision, not a code change.

## 5. Turn-end experiments (§3.2)

| experiment | commit p50 (ms) | cut-offs | verdict |
|---|---:|---:|---|
| Deepgram `endpointing=100` (run 4, 12 turns) | 961 | 0 | no gain: the floor is not the parameter |
| Deepgram `nova-3` | 1049 | 0 | no gain |
| both | 1107 | 0 | no gain |
| **server local-VAD commit** (`VOICE_LOCAL_ENDPOINTING=commit`: ask Deepgram to `Finalize` after 300 ms of local silence, then the tiered grace) | ~920 (`local_vad:finished`) | **many** — mid-sentence pauses cut, because the resumed caller's next interim arrives later than the grace window; `Finalize` itself round-trips 360–510 ms | kept as opt-in, **off by default** |
| server local-VAD → **speculate only** (default) | unchanged | 0 | the local silence starts the LLM ~1 s before Deepgram confirms; `specLeadMs` p90 1108 |
| finished-grace tier (150 ms on questions / one-word answers, commit `139f797`) | in all arms; 16–17 of 24 turns took it | 0 | kept |

Conclusion: on this route the caller-silence → commit wait is **~950 ms and is the recogniser's** (Deepgram, US-hosted, from India), not the grace window. Neither a shorter `endpointing` nor `nova-3` moves it, and committing on local silence cuts callers off. Getting under ~700 ms total needs an STT with sub-300 ms finals close to the caller (a provider/region decision), or the bundled realtime route — which was **not** benchmarked this phase (the harness drives only the modular WebSocket).

## 6. Two turn-boundary bugs found by the harness and fixed (pre-existing, both channels)

Runs 1–2 (`arms_run1/2.txt`, `harness_spec_*`, `harness_fix_*`) showed 7–11 of 24–30 turns **cut off at their first word** — the server committed a turn ~0–400 ms into the caller's next sentence and the browser would have stopped capturing. Traced with the new timeline fields:

1. Deepgram flags `speech_final` on **empty** results at the end of a silent stretch — including the silence right after a committed turn — and the session armed a candidate on it, committing an empty turn ~400 ms into the next sentence ("discarding silent 360 ms turn" in the server log). Fixed: no words this turn → no candidate. Test `deepgramInterimHooks.test.js` "empty speech_final".
2. Deepgram's `UtteranceEnd` for the *previous* turn's last word arrived while the new turn only had an **interim**, and committed it. Fixed: an `UtteranceEnd` needs a **final** this turn and (when Deepgram states `last_word_end`) a word that ends after this turn's audio began. Test "stale UtteranceEnd".

Run 3 (§4) is after both fixes: 0 cut-offs in 72 turns. The harness measures this explicitly (`cutOff` in every summary) and it belongs in every future run.

## 7. Phone, browser, concurrency — unmeasured, stated plainly

- **Phone: 0 turns, ever.** The bridge carries the same speculation/timeline instrumentation and the same Deepgram fixes; nothing here was measured on a carrier. **BLOCKED** on a number and call approval.
- **Browser `speechEndToAudibleMs`: 1 row** (from the owner's own call at 14:56 UTC, 12,449 ms, on the old code). No browser session was driven this phase.
- **Concurrency:** single-call `elLagP99Ms` 36–40 ms; 5/10/25/45 not run.
- The cached-ack (perceived) figure is a UX mitigation and is not a target.

## 8. Verdict

- **Web actual 300–500 ms: NOT MET.** p50 2,861 → **2,136 ms** (−25 %), p90 ≈ 6 s, on this route from this machine. The remaining p50 is roughly: recogniser end-of-speech 950 + LLM 660 + TTS 420 + transit 100.
- **Phone actual 400–700 ms: NOT MEASURED.**
- What would move it, in order, all outside this codebase's control: an STT with fast finals near the caller (−500 to −700 ms), a paid/fast LLM tier (−300 ms p50, −4 s p90), a socket-streaming TTS voice (−200 ms). The speculative and turn-end machinery is in place to exploit each of them; on the providers this account has, the target is not reachable, and the report says so rather than substituting the ack clip.
