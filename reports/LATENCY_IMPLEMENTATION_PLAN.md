# Latency Implementation Plan

**Follows:** `reports/PIPELINE_LATENCY_REVIEW.md` (findings F1–F6, recommendations R1–R7)
**Goal:** cut the web server wait (`waitMs`) from ~1.9 s to ~1.2–1.4 s at p50 without cutting callers off, and have a measured phone baseline before phone tuning starts.
**Rule for every item:** ship behind a flag, default off, prove it with the A/B protocol in `LATENCY_REPORT.md` §5 (≥30 warm turns per arm, same agent/prompt/voice, `speechEndToAudibleMs` on web or `wireMs` on phone, plus a correctness guard), then flip the default.

Work is in four phases. Phase 0 costs no code and unblocks the numbers every later decision depends on.

---

## Phase 0 — Measure what is dark (no risk, do first)

### 0.1 Run the browser-side measurement (R3)

The instrumentation exists (`f04cafc`) and has produced zero `audible` rows.

1. Start the branch backend on a spare port against the disposable DB from `OPEN_ISSUES.md` E-1.
2. Place 30 web turns on one named test agent (Sarvam voice, Balanced profile). Mix: 10 short answers, 10 questions, 5 with a mid-sentence pause, 5 numbers/names.
3. `node scripts/latency-report.mjs --out reports/evidence/<date>_phase0 --label baseline`.
4. Record `speechEndToAudibleMs`, `endTurnToAudibleMs`, `perceivedMs` p50/p90, joined by `turnId`.

**Add one field first** (small, no behaviour change): `ackDurationMs` on the `turn-timing` frame, read from the ack segment's `audioEl.duration` at `ended` (`EditAgent.tsx`, `noteFirstAudible` neighbourhood), validated in `ws/turnTiming.js` (+1 test). This answers F5 directly: if `ackDurationMs + ackStart > ttfaMs` the ack is delaying the reply.

**Exit:** a table of browser-leg cost, and a yes/no on whether the ack clip ever holds back real audio.

### 0.2 Re-measure Groq first spoken token (R4)

```
node --env-file=.env scripts/measure-llm-ttft.js   # with GROQ_MODEL=openai/gpt-oss-20b
```
10 consecutive turns, same 2.5k-token prompt used for the Gemini table in `resolveLlmForAgent`. Record first *content* token (not first chunk), since gpt-oss spends early chunks on reasoning. If p50 < 600 ms and p90 < 1.2 s, R4 becomes a config change (agent model picker already exposes Groq); otherwise drop it.

### 0.3 One real phone call (R7)

Prerequisites: a tester-owned number, the Mumbai VPS (not the dev tunnel), carrier spend approved. Ten turns. The bridge already writes `kind:'wire'` rows and `elLagP99Ms`. Read `wireMs − ttfaMs` (pacer queue depth) and `elLagP99Ms`. Nothing in Phase 3 is decided until this row exists.

---

## Phase 1 — Endpointing (server-only, low risk, ~500–600 ms combined)

### 1.1 Punctuation-aware short grace (R2)

**Change.** `deepgramStream.service.js`, `_armEndOfTurnCandidate`:

```js
const unfinished = looksUnfinished(this._tail);
const finished   = !unfinished && looksFinished(this._tail);   // NEW
const graceMs = unfinished ? this.unfinishedGraceMs
              : finished   ? this.finishedGraceMs               // NEW tier
              : this.endpointGraceMs;
```

`looksFinished(text)`: true when the trimmed tail ends in `?`, `!`, `।`, `॥`, or the last token is in `COMPLETE_ONE_WORD`, or it ends in `.` after ≥ 3 tokens. Reuse the tokeniser in `looksUnfinished`. A trailing digit, "and", "so" or a bare comma is never finished (numbers being read out are the cut-off case to protect).

**Profile.** Add `finishedGraceMs` to each entry in `turnEndProfile.js` (`fast` 80, `balanced` 150, `patient` 300) and thread it through both constructors (`webCallModularRealtime.handler.js` `ensureDeepgramSession`, `modularMediaBridge.js` `openDeepgram`). `maxCommitMsFor` is unchanged (worst case is still the unfinished tier), so the browser backstop needs no edit.

**Flag.** `DEEPGRAM_FINISHED_GRACE_MS=0` disables (falls back to `graceMs`).

**Tests.** `deepgramTurns.test.js`: a `?`-tail commits at the short tier; a digit-tail does not; a "yes" one-word tail does; `turnEndProfile.test.js`: every profile exposes the new field, `finished < grace < unfinished`.

**Log.** `_commitEndOfTurn` reason string already carries `:unfinished`; add `:finished` so the report script can split by tier.

**Prove.** `endpointMs` p50 on question turns drops from ~711 to ~450; cut-off rate (turns whose transcript ends mid-word or mid-number, checked by hand on the 30-turn script) does not rise.

### 1.2 Shorter VAD timeout on Balanced (R6)

`turnEndProfile.js`: `balanced.endpointingMs` 300 → 200 behind `DEEPGRAM_ENDPOINTING_MS` (already honoured for agents with no explicit profile). Run the 30-turn script twice (300 vs 200) with the numbers/names subset doubled. Accept only if mid-number cut-offs stay at zero. If not, keep 300 and let 1.1 carry the saving.

---

## Phase 2 — Speculative LLM start (R1, the largest win, ~300–400 ms)

**Idea.** At `speech_final` the server holds the complete transcript so far. Start the LLM then. If the caller stays quiet through the grace window, the reply is already ~400 ms into generation when the turn commits. If they resume, throw the request away.

### 2.1 Deepgram session: expose the candidate

`deepgramStream.service.js`:

- `peekTranscript()` — `this.finals.join(' ').trim()`, no side effects.
- New callbacks in the constructor: `onEndOfTurnCandidate(text, reason)` fired from `_armEndOfTurnCandidate` **only when not unfinished** (a dangling tail is by definition not the whole request), and `onCandidateCancelled()` fired where `_handleMessage` clears the timer on new transcript. Both optional; nothing changes for callers that do not pass them.
- Tests: candidate fires with the joined finals; cancelled fires on resumed speech; no candidate on an unfinished tail; `beginTurn` fires cancelled if one is pending.

### 2.2 Runtime: a reply that can be started early

`agentRuntime.service.js`:

```js
export function startSpeculativeReply(workspaceId, agentId, history, userText, { affect = null } = {}) {
  const messages = [...history, { role: 'user', content: userText }];
  const iterator = converseStream(workspaceId, agentId, messages, { voiceMode: true, affect });
  const first = iterator.next();            // request leaves now
  first.catch(() => {});                    // failure is judged at consume time
  return {
    userText, iterator, first, startedAt: performance.now(),
    cancel() { iterator.return?.().catch(() => {}); },
  };
}
```

`voiceTurnStream` gets a new option `speculative`. Right after `userText` is settled (after echo trim and the silence gate):

```js
if (speculative) {
  if (normalize(speculative.userText) === normalize(userText)) {
    primary = speculative;                  // reuse iterator + first promise
    llmStartedAt = speculative.startedAt;   // llmTtftMs stays honest
  } else {
    speculative.cancel();                   // transcript changed: pay full price, as today
  }
}
```

Both the `ws-overlap` and `split` branches currently do `converseStream(...)` then `withTimeout(iterator.next(), …)`. Factor that into `const { iterator, first } = primary ?? startFresh()` so the hedge logic is untouched. `normalize` = lower-case, strip trailing punctuation and whitespace runs. A speculative iterator that has already rejected (rate limit) is treated as absent — `converseStream`'s model fallback already ran inside it.

**Affect.** Speculation starts with `affect: null` (the PCM classifier runs at commit). Accept the mismatch: affect only tweaks the prompt note and TTS settings, and TTS settings are still applied at commit. Log `speculative: 'used' | 'discarded' | 'none'` on the latency record so the discard rate is visible.

**Filler ack.** Unchanged; the 400 ms ack timer still starts at runtime entry. With speculation, real audio will often beat it, which is the point.

### 2.3 Web handler

`webCallModularRealtime.handler.js`, inside `ensureDeepgramSession`:

```js
onEndOfTurnCandidate: (text) => {
  if (!capturing || turnActive || segmentHistory === undefined || !text) return;
  speculation?.cancel();
  speculation = startSpeculativeReply(workspaceId, agentId, segmentHistory, text);
},
onCandidateCancelled: () => { speculation?.cancel(); speculation = null; },
```

`runTurn` passes `speculative: speculation` (then nulls it). Cancel on `cancel-turn`, `barge`, `stop`, socket close, and in `start-turn` (a new segment). Older clients that send no history on `start-turn` never speculate (`segmentHistory === undefined`), exactly like today's early-commit path.

### 2.4 Phone bridge

`modularMediaBridge.js`, `openDeepgram`: same two callbacks. Guard with `!turnRunning && !playout.isSpeaking()` (a candidate raised while the agent is still audible is echo). `runTurn` passes the speculation; `carriedUserText` (overlap harvest) invalidates it because the final text will be prefixed — cancel when `carriedUserText` is non-empty.

### 2.5 Cost control

- One extra LLM request per discarded speculation. Measured resume-inside-grace rate is near zero (every logged commit sits at 711 ± 5), so expected waste is small; the `speculative` field on the record proves it.
- Flag: `VOICE_SPECULATIVE_LLM=true` to enable; ships off. Per-agent override later if a KB-heavy agent's RAG call makes discards expensive.
- Never speculate on the unfinished tier (2.1), and never more than one in flight per call.

**Tests.** Runtime: `voiceTurnStream` with a matching speculation does not call `converseStream` again (stub the module); with a mismatched one it cancels and starts fresh; a rejected speculation is ignored. Handler: candidate → cancel → candidate leaves exactly one live iterator.

**Prove.** `llmTtftMs` measured from commit drops by ~the grace window; `waitMs` p50 from ~1.9 s to ~1.5 s; discard rate < 10 %; transcript/reply spot-check shows no reply answering a superseded transcript.

---

## Phase 3 — TTS socket path (R5, ~200 ms, only for ElevenLabs/Fish voices)

Two facts from the review: the socket path has never run in production (every row is `split`), and when it does run the socket is opened after STT.

### 3.1 Make it run

Configure one test agent with an ElevenLabs voice and `ttsDelivery: 'socket'`. Confirm a `mode:"ws-overlap"` row appears. If not, the factory or `supportsTokenStreaming` is refusing — fix that first; nothing below matters until this row exists.

### 3.2 Pre-connect at start-turn

- `agentRuntime.service.js`: `warmVoiceTurn` returns (or stores per call) a connected `createTokenTtsStream(voice, { pace: basePace, audioFormat, sampleRate })`. The bridges hold it in a per-call slot `warmTts`.
- `voiceTurnStream` option `ttsSession`: if present, open and unused, use it in the `canOverlap` branch instead of creating one; else fall through to today's code.
- ElevenLabs closes an idle `stream-input` socket after ~20 s. Handle `close` before use by discarding the slot; the runtime then connects fresh (today's behaviour). Reconnect on `start-turn` of the next segment.
- Voice settings go in the BOS frame, so the per-turn `affect`/jitter pace cannot be applied to a pre-connected socket. Accept: base pace at connect; affect still shapes the prompt. Log `ttsPreconnected: true|false`.

**Prove.** `ttsTtfaMs` on socket-voice turns drops by the handshake (~200 ms from this network); no rise in `audio-end`-before-`audio-start` errors.

---

## Phase 4 — Phone-specific (after 0.3 has data)

Decide from the first real rows, in this order:

1. If `wireMs − ttfaMs` > 100 ms: TTS is bursting faster than the pacer drains, or the frame clock is late. Check `elLagP99Ms` on the same rows; if lag is high, move AEC (`echoCanceller.js`) off the hot path per frame (batch every 2 frames) before touching the pacer.
2. If turns after a long reply are slow: `OVERLAP_SETTLE_MS` 700 → 400, measured on "yes, and…" style overlaps.
3. Greeting-after-answer: already parallelised; remaining cost is one DB round trip Mumbai → Singapore. Prefetch the agent row at dial time for outbound (`outboundCall.service.js`) so `loadAgent` hits cache on `start`.

---

## Sequencing and ownership

| order | item | effort | flag | ships when |
|---|---|---|---|---|
| 1 | 0.1 browser measurement + `ackDurationMs` | ½ day | — | first |
| 2 | 0.2 Groq re-measure | 1 h | — | with 1 |
| 3 | 1.1 finished-tail grace | ½ day | `DEEPGRAM_FINISHED_GRACE_MS` | after 0.1 baseline |
| 4 | 2.1–2.5 speculative LLM | 2 days | `VOICE_SPECULATIVE_LLM` | after 3 is proven |
| 5 | 1.2 endpointing 200 | 1 h + A/B | `DEEPGRAM_ENDPOINTING_MS` | after 4 (so the A/B isolates one change) |
| 6 | 3.1–3.2 TTS pre-connect | 1 day | agent `ttsDelivery` | any time after 3.1 |
| 7 | 0.3 phone call, then Phase 4 | needs approval | — | when a number and budget exist |

Each step is its own commit and its own A/B run; never two flags flipped in one run. Expected end state on web: `waitMs` p50 ≈ 1.2–1.4 s, ack still ~400 ms, no measured rise in cut-offs.

## Explicitly out of scope

- Switching to the bundled realtime route (xAI / ElevenLabs ConvAI / Gemini Live). That is the sub-second path and an architecture decision (`OPEN_ISSUES.md` L-3), not a fix.
- Changing Deepgram region or model. No closer region exists for nova-2/3.
- Prompt trimming for TTFT. The runtime's own measurement shows a 343-token prompt still produced multi-second first tokens; capacity, not size.
