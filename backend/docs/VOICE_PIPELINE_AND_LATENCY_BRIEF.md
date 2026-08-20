# Conversational Voice Agent — Pipeline & Latency Brief

A self-contained description of how the agentic voice pipeline works end to end
(STT → LLM → TTS), how telephony is bolted onto it, where every millisecond
goes, and what has already been measured, fixed, and ruled out. Written to be
handed to someone with no prior context on this codebase.

Stack: Node.js (ESM) + Express + `ws`, Prisma → Supabase Postgres, React client.
Repo: `D:\HB_Data\projects\Conversational_AI_Agent`, backend at `backend/`.

---

## 1. Two completely different engine routes

Every agent has `settings.voiceEngine`, defaulting to `'modular'`. That one
field picks between two architectures that share almost no code on the live
audio path.

### A. Bundled ("speech-to-speech")
`voiceEngine: 'xai' | 'elevenlabs'`. The carrier's media stream is piped
straight into the vendor's own realtime session (xAI Grok Voice, or ElevenLabs
Conversational AI with a "shell" agent). The vendor owns turn detection,
conversation state, barge-in and audio. Our bridge is a dumb pipe.

- `src/services/voice/realtimeEngine.factory.js` → `xaiRealtime.service.js` /
  `elevenLabsRealtime.service.js`
- Bridges: `ws/twilioMediaRealtime.handler.js`, `ws/plivoMediaRealtime.handler.js`,
  `ws/piopiyMediaRealtime.handler.js`, `ws/webCallRealtime.handler.js`
- Engines emit PCM16 @ 24kHz, or `g711_ulaw` when asked (µ-law carriers ask).

**This is the only route that can hit 300–400ms response times.** It is not the
default and not what most agents run.

### B. Modular (STT → LLM → TTS) — the default, and the subject of this brief
We assemble the pipeline ourselves: Deepgram streaming STT → Gemini (or
OpenAI/Groq/Azure) → ElevenLabs/Sarvam/FishAudio TTS. Full control over prompt,
knowledge base, RAG, personality, disfluency — and full ownership of latency.

`resolveCallMode()` in `src/services/outboundCall.service.js` gates it. The
modular route has two hard requirements the bundled one doesn't, and failing
either downgrades the call to "play the welcome message and hang up" rather
than dialling and hoping:

1. **Deepgram must be configured** — it *is* the turn detector. Without it
   nothing can decide the caller stopped talking.
2. **The TTS provider must emit a telephony format.** Every provider defaults to
   MP3, which a carrier cannot play, and decoding MP3 per sentence on a live
   call is a latency cost we refuse to pay silently.

---

## 2. The shared "brain": `voiceTurnStream()`

`src/services/agentRuntime.service.js` (~2000 lines) is the single runtime for
**both** the browser web call and the phone call. That is deliberate — the web
call is how people test what the phone will do, so the two must not diverge.

`voiceTurnStream(workspaceId, agentId, audioBuffer, mimeType, history, opts)`
is an async function that emits events (`transcript`, `audio-start`,
`audio-chunk`, `audio-end`, `done`) to whichever bridge called it.

### One turn, in order

```
[caller stops talking]
  └─ preLlmMs  ── transcript harvest (dg.finalizeTurn), echo discard, silence gate
       └─ prepMs ── loadAgent (5-min cache)
            └─ sttMs ── 0 on the streaming path; a batch STT round-trip on fallback
                 └─ ragMs ── KB chunk existence (cached) + pgvector retrieval if any
                      └─ llmTtftMs ── LLM time to FIRST token
                           └─ [first sentence complete]
                                └─ ttsTtfaMs ── TTS first byte
                                     └─ ttfaMs = total to first audio byte
                                          └─ wireMs = first byte actually on the carrier socket
```

### Prompt construction (`_prepareConverse`)
- History trimmed to **last 12 messages** in voice mode (30 in chat).
- System prompt built from the agent row: persona, conversational flow,
  welcome, `settings`, plus knowledge base.
- **KB is inlined as flat text**, capped at `KB_VOICE_CHARS` (default 48,000
  chars) for voice. Largest real KB today is ~16.5k chars, so not currently
  binding — but see §7, it's the next bottleneck.
- **RAG**: if the agent has chunked+embedded KB files (Gemini embeddings,
  1536-dim, pgvector), similarity search runs *concurrently* with the flat KB
  fetch and LLM resolution so its cost isn't purely additive. Today no agent
  has chunked files, so `ragMs` is 0–1ms.
- `maxTokens: 320` for voice, `thinkingBudget: 0` for **all** conversation
  turns. Thinking costs ~2–3s per reply and a KB-grounded persona chat doesn't
  need a reasoning pass. (Note: `gemini-3.5-flash-lite` HTTP 400s on
  `thinkingBudget: 0`, hence the per-model `thinkingConfigFor()` shim.)

### LLM selection (`resolveLlmForAgent`)
Voice turns pass `lowLatency: true`, which overrides the agent's chosen model
with `VOICE_LLM_MODEL` (default **`gemini-3.5-flash-lite`**).

Measured 2026-08-19 from this deployment, same agent, same ~2.5k-token prompt,
thinking off, 10 consecutive turns:

| Model | Time-to-first-token |
|---|---|
| `gemini-3.1-flash-lite` | 1.0s … **20.6s** (p50 ~5s) |
| `gemini-3.5-flash-lite` | 1.0s … 1.2s (p50 **1.05s**) |
| `gemini-3.5-flash` | ~12s |
| `gemini-3.6-flash` | 4.2s … 18.3s |

The old choice wasn't slow on average so much as **unbounded**, and a voice call
is judged on its worst turns. Prompt size barely moved it (a 343-token prompt
also produced an 8.9s first token) — this is capacity on Google's side, not
something prompt trimming fixes.

### Three TTS/LLM overlap modes
Chosen per turn, logged as `mode`:

1. **`ws-overlap`** (`VOICE_TTS_OVERLAP=true`, currently **on**) — LLM tokens are
   pushed straight into a socket-based TTS session (`ttsStreamFactory.js`), so
   **one continuous audio stream** comes back and the agent starts speaking
   before the reply is written. Only ElevenLabs and FishAudio support it.
2. **`split`** — stream LLM tokens; the moment the first sentence is complete
   (≥25 chars, terminator `[.!?…।॥]` followed by whitespace), synthesize it as
   its own audio segment while the rest generates. Two generations, not one per
   sentence — Sarvam's synthesis is stochastic per-request and splitting every
   sentence made the voice audibly drift mid-reply.
3. **`buffered`** — one `converse()` + one TTS call. Fallback only.

> **Historical trap worth knowing:** an earlier attempt synthesized each sentence
> as a separate MP3 and appended them to one MediaSource. Independent MP3s don't
> share frame alignment, so the decoder lost sync at every boundary and played
> fluent non-language noise. Per-segment playback fixed it for HTTP; `ws-overlap`
> sidesteps it entirely by never producing a second file.

### The LLM spike hedge
- `VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS` = **1500ms** (was 2500, tuned down when the
  model changed). On timeout the split path starts a **second stream without
  killing the first** and races them. It is a hedge, not a restart — the old
  restart behaviour is where the `mode:"buffered"` ~6.0s turns came from,
  because the caller paid the full timeout *and* a complete second generation.
- `VOICE_LLM_SPIKE_TIMEOUT_MS` = 4000ms for the buffered path.
- **The hedge fires only on `llm-timeout`, never on an error.** A 429 answered
  with a second request deepens the rate limit that caused the first to fail.
- On a 429 *before the first token*, `converseStream` walks
  `VOICE_MODEL_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']`.
  Free-tier quota is **per model** — measured in the same second, 3.5-flash-lite
  429'd while 3.1-flash-lite returned 200. Once any text has been yielded it
  never switches: the caller may already be hearing it.

### Perceived-latency tricks (not real latency)
- **Audio ack** (`VOICE_FILLER_DELAY_MS` = 400ms): if no real reply audio has
  started in 400ms, play a *pre-synthesized, cached* "Mm-hmm"/"Right" clip.
  Pure memory I/O, warmed at call start by `warmVoiceTurn()`. Moves perceived
  response time to ~400ms without touching real latency. **Not** gated on the
  agent's "Filler Words" toggle — that toggle controls the hesitation *tier* in
  the spoken reply. Suppressed when caller affect is `rushed` or `agitated`
  (hesitation reads as stalling, which is the one thing that makes those worse).
  - *Gotcha that bit hard:* the ack was once cached without an audio format, so
    an MP3 got handed to a G.711 carrier — a burst of static in front of every
    reply, with the real audio queued behind it. `playableWithFormat()` in the
    bridge now refuses any segment whose format doesn't match the carrier's.
- **Affect adaptation**: `classifyCallerAffect()` (`stt/speechGate.js`) reads the
  caller's PCM + transcript and returns `rushed|hesitant|quiet|agitated|null`.
  It appends a "Caller state" block to the system prompt, shifts speaking rate
  (±0.04–0.05 plus ±0.02 per-turn jitter so replies don't land with
  machine-identical rhythm), and suppresses the ack.
- **Disfluency / naturalness** (`voice/disfluency.js`, 700 lines): injects
  openers ("Alright,", "Got it,"), enforces a hesitation ceiling, and inserts
  SSML `<break/>` pauses — but only on providers that parse SSML (ElevenLabs
  yes; Sarvam and Google no, where breaks degrade to commas). Logged per turn as
  the `natural` field so "why does this agent still sound robotic?" is
  answerable from the log alone.

---

## 3. STT: Deepgram streaming (`stt/deepgramStream.service.js`)

Opened in the carrier's own wire format — `encoding: 'mulaw'`, `sampleRate: 8000`
— so caller audio passes through **untranscoded** in both directions. No MP3
decode and no resample anywhere on the live phone path.

Model selection: `language=multi` → `nova-3` (code-switching is a nova-3
capability; nova-2 accepts the param and silently doesn't code-switch);
`encoding=mulaw` → `nova-2-phonecall`; otherwise `nova-2`.

### Turn detection — the part that matters most for latency
Deepgram emits **two** end-of-speech signals and they are not equivalent:

- `speech_final` — after `endpointing` ms of VAD silence. **Fast but wrong a
  lot**: at 500ms it lands squarely inside an ordinary mid-sentence pause
  (people pause 400–700ms before a name, a number, or mid-list).
- `UtteranceEnd` — after `utterance_end_ms` of *word-timing* silence. Slower
  (≥1000ms) but authoritative.

Both were once wired to the same callback. `speech_final` always fires first, so
`UtteranceEnd` was dead code and every turn was cut by the VAD signal — the agent
started replying while the caller was mid-sentence.

Current scheme: `speech_final` **arms a candidate**; any further transcript
(interim *or* final) within a grace window cancels it.

| Knob | Default | Meaning |
|---|---|---|
| `DEEPGRAM_ENDPOINTING_MS` | **300** | VAD silence before `speech_final` |
| `DEEPGRAM_ENDPOINT_GRACE_MS` | **400** | confirmation window for a normal-looking transcript |
| `DEEPGRAM_UNFINISHED_GRACE_MS` | **1100** | longer window when the transcript ends mid-thought (`looksUnfinished()`) — the caller is hunting for a word |
| `DEEPGRAM_UTTERANCE_END_MS` | **1000** | word-timing backstop |

So a normal turn commits at **~700ms** of silence. `maxEndpointCommitMs()`
publishes `endpointing + unfinishedGrace` to the browser client so its RMS-VAD
backstop can sit clear of it — these two timeouts race every turn, and when
maintained independently in two files, raising the server grace silently does
nothing because the client keeps firing first. (That happened.)

### Batch STT fallback
An empty transcript has two very different causes and the bridge used to treat
both as "return":
- **Caller said nothing** (noise, cough, breathing) → discard. Three independent
  proofs, any one sufficient: Deepgram had an open socket the whole segment and
  returned no words; the segment is < 400ms; or acoustic analysis finds no
  voiced speech.
- **The stream wasn't listening** (dead session, TLS handshake in flight) → the
  caller *did* speak and nothing transcribed it. Now falls back to batch STT
  (Sarvam/Groq, capped at 4.5s), spent only on turns that would otherwise have
  been answered with silence.

### Hallucination gate
Batch STT does **not** return an empty string on silence — it returns stock
filler learned from subtitle corpora ("Thank you.", "Thanks for watching!",
"धन्यवाद", "。"). All longer than 2 chars, all previously passed straight to the
LLM as a user turn. `isLikelySttHallucination()` filters those — **batch path
only**; a streaming transcript is trusted because Deepgram returns nothing
rather than inventing filler.

---

## 4. TTS

`streamSynthesizeVoice(voice, text, opts)` in `voice.service.js`, dispatching to
`voice/providers/*`. What matters for telephony is `TELEPHONY_TTS` in
`voice/telephonyAudio.js`:

| Provider | Kind | Format asked for | Notes |
|---|---|---|---|
| ElevenLabs | `native` | `ulaw_8000` | zero transcode; supports token streaming |
| Sarvam | `native` | `mulaw` | verified live: raw headerless G.711, 8000 B/s. **Every Indian-language voice in the product is Sarvam** — without this row those agents could hold a web call but never a phone call |
| FishAudio | `pcm` | `pcm` @ 8000 | raw mono s16le at exactly the line rate, so our converter finishes with no decode/resample. `wav` would also work on paper and must **not** be used — only the first chunk carries the RIFF header |
| Google, Cartesia | — | — | not wired for telephony yet (Cartesia supports it; row not added) |

Anything not in this table is **refused** by the phone bridge rather than
silently MP3-decoded. Design rules, in priority order: (1) never transcode when
the provider can emit telephony format directly; (2) never decode MP3 on the hot
path; (3) resampling is deliberately linear interpolation — the destination is an
8kHz line whose own codec is far lossier than any interpolation artefact.

---

## 5. Telephony

### Carriers
`src/services/telephony/` — one provider contract, three implementations.
Routing is **per-number** (`VoiceNumber.provider`), so India can move tenant by
tenant and any workspace rolls back by flipping one row.
`TELEPHONY_PROVIDER_DEFAULT` covers only numbers we have no record for.

| | Twilio | Plivo | PIOPIY (TeleCMI) |
|---|---|---|---|
| Serves | everything outside India | India | India |
| Doc delivery | `inline` (TwiML in `Twiml` param) | `answer_url` (Plivo GETs it at answer time) | `inline` (PCMO actions in the body) |
| Media verb | `<Connect><Stream>` | bare `<Stream bidirectional>` | `stream` action |
| Wire format | base64 µ-law 8k | base64 µ-law 8k | **PCM16** @ 8k or 16k |
| Play event | `media` + `streamSid` | `playAudio` + explicit contentType/sampleRate | `streamAudio` / `raw` |
| Flush (barge) | `clear` | `clearAudio` | `{"action":"break"}` |
| Per-call params | `<Parameter name="callLogId">` → `start.customParameters` | **none** — id rides the socket URL query string | query string (ours) |
| Sends `stop`? | yes | **never** — socket close is the only end-of-call signal | — |
| Bursting outbound | **absorbs it** | accepts it and plays progressively behind | needs a pacer |
| Modular bridge? | ✅ | ✅ | ❌ **bundled only** |

Twilio **cannot legally carry Indian domestic traffic** (outbound-to-India needs
a non-Indian caller ID and DoT stamps "International Call" on those). That's why
Plivo exists here — compliance, not cost. Exotel was a fourth carrier and was
removed: it capped sessions at 60 minutes and dropped a call if a turn took over
10 seconds.

An unconfigured carrier is registered anyway and refused by `status()` before it
dials. Leaving it unregistered looked more cautious and was worse: an unknown id
falls back to Twilio, so a `+91` number marked PIOPIY dialled out over a carrier
that cannot legally carry it, silently and under the wrong caller ID.

### Call flow (outbound)
```
placeOutboundCall()                       services/outboundCall.service.js
  ├─ resolveProviderIdForNumber(from)     per-number carrier routing
  ├─ resolveCallMode(agent)               conversation vs greeting-only
  ├─ provider.status(from)                refuse before spending anything
  ├─ provider.buildConversationDoc(...)   TwiML | answer URL | PCMO array
  └─ provider.placeCall(...)              → callId (CallSid / call_uuid, normalized)

[callee answers]
  → carrier opens WSS to PUBLIC_BACKEND_WS_URL
      /api/v1/{twilio|plivo|piopiy}-media/:workspaceId/:agentId[?callLogId=&direction=]
  → server.js `upgrade` handler resolves voiceEngine, routes to bundled or modular bridge
```

`direction` on the URL is set **only by the dialler**. Its absence means
"unknown", never "inbound" — campaigns routinely dial out through agents saved
as INBOUND, and the greeting has to stop thanking people "for calling" on a call
we placed.

---

## 6. The modular phone bridge — `ws/modularMediaBridge.js` (~1150 lines)

**One body, one thin adapter per carrier.** The adapter supplies exactly four
things: `readStart`, `sendAudio`, `clearAudio`, `label` (+ `pacedOutbound`).
Everything else is carrier-agnostic. Extracted rather than copied because the
barge-in tuning is hard-won from live PSTN calls and a second copy would drift
silently until one carrier's calls started cutting out.

### Why it has to exist
The browser web-call client owns endpointing, conversation history and barge-in.
**A phone caller has no browser.** The carrier just streams 8kHz µ-law forever
and says nothing about turns. So this file *is* the missing client:

1. **Turn detection** — Deepgram's endpointing replaces the browser's analyser VAD.
2. **Conversation state** — `history[]` lives here for the life of the call.
3. **Barge-in** — an energy gate on the inbound track replaces the browser's
   `barge` message.
4. **Audio format** — Deepgram opened in mulaw/8000, TTS asked for the carrier's
   format. No transcode either direction.

### Barge-in detection — three interlocking pieces
An interruption must stop the agent within a syllable, so it's **energy-based,
not transcript-based** (waiting for a Deepgram word costs 300–600ms).

A false positive is *not* cheap: barge sets `abortTurn` (killing the audio pump
mid-utterance) and sends the carrier a `clear`, discarding everything buffered.
The caller hears one word and then silence for the rest of the turn. On a live
PSTN call that was the observed behaviour — a greeting that reached "Hello" and
stopped.

The cause was an **absolute threshold**. A phone line is never silent; comfort
noise and room tone sit far above the old 900 floor, so the detector fired
within the first 60ms of every call. Three fixes, all required:

| Knob | Default | Purpose |
|---|---|---|
| `PHONE_BARGE_RMS` | 2500 | absolute floor, so a very quiet line can't drive the threshold into its own noise |
| `PHONE_BARGE_MARGIN` | 3 | speech must exceed the **measured** per-call noise floor by this factor (EMA, α=0.05, learned only while the agent is quiet) |
| `PHONE_BARGE_FRAMES` | 5 | consecutive loud frames = 100ms of speech |
| `PHONE_BARGE_GRACE_MS` | 500 | ignore inbound energy after the agent starts talking — handsets and speakerphones echo our own audio back, and its onset is the loudest part |

### `playoutWindow.js` — "is the caller hearing us *right now*?"
All four knobs are downstream of one question a browser answers for itself and a
phone bridge has to infer. Getting it wrong disabled phone barge-in **entirely**
while web calls kept interrupting fine, in two ways:
- a flag that meant "TTS is running" — audio is shipped ~5× faster than it plays,
  so it was false for most of every reply;
- an echo grace re-armed by each **per-sentence** audio-start event.

`playoutWindow` tracks actual wire frames (`noteFrame()`), so `isSpeaking()`,
`speakingForMs()` and `remainingMs()` describe what the caller actually heard.

### `ulawPacer.js` — the outbound clock
Plivo support, 2026-08-16:

> "Our media infrastructure consumes audio from your WebSocket at a fixed 20ms
> frame cadence (160 bytes per frame at 8kHz mu-law). […] Bursting audio faster
> than real-time: audio plays correctly, but **perceived latency grows
> proportionally to how deep the buffer gets**. Do not send audio faster than
> real-time."

We were emitting correctly *sized* 160-byte frames as fast as TTS yielded them —
a whole sentence left in tens of milliseconds. The old code comment asserted the
opposite ("no pacer here… Plivo does not need one"): it conflated frame **size**
with frame **cadence**.

This is why it hid for so long: Exotel *dropped* a burst (loud, ~4s hangup),
Twilio *absorbs* one (harmless), Plivo *accepts* it and quietly plays further and
further behind — indistinguishable from a slow LLM without measuring. We spent a
while blaming the LLM.

Pacer details: 20ms clock, `MAX_FRAMES_PER_TICK = 5` (a hiccup can't become a
burst), resync to wall clock past 500ms drift, `MAX_QUEUE_FRAMES = 500` (~10s)
dropping **oldest** first — the freshest audio is the audio still worth playing.
`carrier.pacedOutbound: true` on Plivo only; Twilio is deliberately untouched.

### `armNextTurn()` — the echo trap
A browser gets acoustic echo cancellation free from `getUserMedia`. **A phone
line has none.** The handset feeds our reply straight back up the inbound leg,
and the bridge forwards every inbound frame to Deepgram unconditionally — on
purpose, so a caller talking *over* the agent isn't lost when the barge lands.

That trade is only safe if the turn boundary sits where the agent stops being
audible. It didn't. `runTurn`'s `finally` runs when `voiceTurnStream` *resolves* —
i.e. when TTS finished *generating* — and with a pacer holding the line to real
time, generation for an 8s reply completes in ~2s. The turn was therefore armed
with **~6s of our own speech still playing**, every word transcribed into the
caller's brand-new turn. Two costs:

1. The transcript opens with the agent's own words. `stripAgentEcho()` trims only
   a bounded *prefix*, so long echo survives it.
2. **End-of-turn never commits.** Deepgram treats any further transcript as proof
   the caller is still talking and cancels the pending `speech_final` candidate.
   Our own echo re-armed the endpointing clock frame after frame, so the turn
   couldn't close until the echo stopped. **The reply is late by however long the
   agent was still audible, and no server-side timing can see it.**

Fix: don't arm the next turn until `playout.isSpeaking()` is false (polled every
20ms, 20s ceiling). Barge-in is not delayed by this — a barge calls
`playout.stop()`, so `isSpeaking()` is already false.

Two more echo guards: `isEchoOfAgent()` discards a turn that is *entirely*
verbatim agent speech (otherwise the LLM dutifully answers a phantom user turn —
the agent talking to itself, which a caller experiences as being ignored), and
Deepgram's `onEndOfTurn` is ignored while `playout.isSpeaking()`.

### Call start — the dead-air problem
A carrier opens the socket the instant the callee picks up, so **every ms between
that and the first greeting frame is dead air on a live line**. This used to be
four serial remote round trips (agent row, wallet gate, voice resolution, an
awaited status write) plus three more inside the gate. A single Supabase round
trip from this app server measures **~490–1400ms — and a bare `SELECT 1` costs
the same**, so it's pure network distance, not query cost. That was ~3–4s of
silence after "hello?", on every call and every call in a bulk campaign.

A web call pays **none** of it: the browser already has the agent loaded and
fetched its welcome over HTTP before the button was pressed. That asymmetry is a
large part of why the same agent feels responsive on the web and slow on the phone.

Fixed by reordering, not by doing less:
- agent row + wallet gate run concurrently (independent);
- welcome rendering overlaps voice resolution (needs the agent, not the voice);
- the `IN_PROGRESS` status write is fire-and-forget (nothing reads it back);
- `loadAgent()` instead of a raw `findFirst`, so one read populates the cache
  that `getRenderedWelcome()` and `voiceTurnStream()` hit moments later;
- `warmVoiceTurn()` fires while the greeting is still playing, pre-resolving the
  KB, the voice, and the ack clip in this call's audio format.

Also fixed here: `resolveDgLanguage()` used to read `agent.transcription`, which
holds an STT **provider** name (default "Azure"), not a language — so Deepgram
defaulted to English on every call that hadn't set `sttLanguage` explicitly. A
Hindi agent's callers were transcribed as English on the phone while the *same
agent* transcribed them correctly on a web call. The LLM was answering a question
the caller never asked.

---

## 7. Latency: what's measured, and what the numbers say

### Instrumentation
- `backend/logs/latency.log` — one JSON line per turn, written by
  `lib/latencyLog.js`. Fields: `channel` (`web`/`phone`), `sttProvider`,
  `llmProvider`, `model`, `prepMs`, `preLlmMs`, `sttMs`, `voiceWaitMs`, `ragMs`,
  `llmMs`, `llmTtftMs`, `ttsMs`, `ttsTtfaMs`, `ttfaMs`, `totalMs`, `mode`,
  `filler`, `natural`.
- **`wireMs`** — logged to the server log (grep `wireMs=`), *not* to latency.log.
  This is end-of-speech → first byte actually **written to the carrier socket**.
  `ttfaMs` stops the clock when TTS hands us a byte; `wireMs` covers the frame
  splitter and the pacer queue too. **On a paced carrier those differ by the
  whole queue depth, and nothing inside `voiceTurnStream` can see it.** If the
  queue is still draining the previous utterance, the new turn's first frame
  waits behind it.
- Also logged: `pacerQueued`, `pacerMaxQueueMs`, `dropped`, and how long after
  answer the greeting reached the wire.

### Current log contents (418 turns, through 2026-08-18)

| Stage | p50 | p90 | max |
|---|---|---|---|
| `preLlmMs` | 450 | 730 | 1022 |
| `sttMs` | 0 | 726 | 2672 |
| `ragMs` | 0 | 1 | 1 |
| **`llmTtftMs`** | **1421** | **5327** | **16047** |
| `llmMs` | 1391 | 4075 | 37740 |
| `ttsTtfaMs` | 581 | 1450 | 2491 |
| `ttsMs` | 2775 | 5070 | 17365 |
| **`ttfaMs`** | **2423** | **5967** | **38347** |
| `totalMs` | 4557 | 8953 | 41516 |

By mode: `split` ttfa p50 2312 / p90 6119 · `buffered` p50 **5967** / p90 7223.

**Three caveats that matter a lot:**
1. **Every row is `gemini-3.1-flash-lite`.** The log predates the 3.5-flash-lite
   switch (2026-08-19). These p90/max numbers are the *old* model's tail.
2. **There is not a single `channel:"phone"` row** — `grep -c '"channel":"phone"'`
   returns 0. The instrumentation is wired; it means no phone turn has ever
   completed on this machine's backend. **Phone latency has never been measured
   end-to-end here.** It must be read from wherever the tunnel actually points.
3. `llmTtftMs ≈ llmMs` on nearly every row is **normal, not a streaming bug** —
   Gemini returns a short voice reply in 1–3 chunks, so sentence-splitting buys
   nothing once the first token is fast.

### Root causes found so far, in order of discovery

| # | Cause | Status |
|---|---|---|
| 1 | `hasKbChunks()` called **uncached on every turn**, blocking before the LLM call. ~1s of dead air per turn on both channels, for a query that always answered "no". Regression from the RAG commit. | Fixed — `kbChunkCache`, 5-min TTL, warmed |
| 2 | **Outbound audio not paced to Plivo** — burst → their buffer deepens → perceived latency grows. | Fixed — `ulawPacer.js` |
| 3 | **The model.** `gemini-3.1-flash-lite` TTFT 1.0–20.6s. Every other stage already in budget. | Fixed — `gemini-3.5-flash-lite`, hedge 2500→1500ms |
| 4 | **Four serial Supabase round trips before the greeting**, phone-only. ~3–4s after "hello?". | Fixed — concurrency + fire-and-forget |

### Two things that are *not* the pipeline and still dominate today

**(a) The dev ngrok tunnel is on the phone path only.**
`PUBLIC_BACKEND_WS_URL=wss://relearn-math-outflank.ngrok-free.dev`. Measured live:
localhost health round-trip **3ms median**; the same endpoint through the tunnel
**213ms median, 619ms max**. A web call is browser→localhost (loopback); a phone
call sends every 20ms frame **both ways** through the tunnel and back over the
developer's own uplink. The ngrok edge resolves to AWS ap-south-1 (Mumbai), so
the edge isn't the problem — the last hop is. **Deploy to a real public host
before judging phone latency.**

**(b) Free-tier Gemini is 15 requests per MINUTE per model.**
(`GenerateRequestsPerMinutePerProjectPerModel-FreeTier limit=15`, Google's own
`retryDelay` ~34s — an eternity on a live call.) A live call issues one LLM
request per turn, ~6–12/min, so **one conversation nearly saturates it**, and
`CAMPAIGN_WORKER_CONCURRENCY=2` exceeds it by construction. That is the bulk-call
slowness. The model-fallback list softens it (measured 20/20 turns answered where
a single model failed 3); **the fix is billing.**

### Structural floor that will never close
Plivo also confirmed PSTN adds a **non-configurable adaptive jitter buffer of
~20–300ms** on the inbound leg that WebRTC simply does not have, plus SIP
post-dial delay. India media is anchored in **Mumbai** — a backend in Mumbai gets
<5ms media-server RTT; anything in US/EU adds that full cross-region RTT to
every single turn. Current VPS is `spandan.mannmate.com` = 62.72.12.185
(Hostinger), **region unverified**.

### Remaining levers, in priority order
1. **Deploy off the ngrok tunnel** to a Mumbai-region host. Biggest single win
   and it costs no code.
2. **Enable Gemini billing.** The key is still free tier (re-confirmed
   2026-08-19 via a 429 on `gemini-2.5-flash`, `…PerDayPerProject… limit=20`).
3. Endpoint grace 400 → 250ms (buys 150ms on every turn, costs some mid-sentence
   cutoffs).
4. Deepgram / TTS region co-location.
5. Watch `KB_VOICE_CHARS`. Measured: a 6-turn call with a 48k-char KB ran median
   **3738ms** TTFT *even with ~82% tokens cached*, vs **1399ms** at 12k chars.
   Largest real KB today is ~16.5k chars so it isn't binding — but it's the next
   bottleneck the moment anyone uploads a big one. (Note: Gemini never caches
   `systemInstruction`.)

### The honest ceiling
**300–400ms is not reachable on STT→LLM→TTS.** The floor is roughly
endpointing+grace (~700ms) + LLM TTFT (~1.0s) + TTS first byte (~0.5s) ≈ **2.2s**,
before any network. Realistic target for the modular pipeline after the deploy
and billing fixes: **~1.8–2.2s** time-to-first-audio, with the 400ms cached ack
covering the perceived gap.

Sub-second needs a **speech-to-speech model**. Options already on the table:
`gemini-3.1-flash-live-preview` (same API key, via `bidiGenerateContent`), or the
bundled xAI / ElevenLabs Conversational engines that are already wired here.

---

## 8. Config quick reference

**Currently set (backend/.env, non-secret):**
```
PUBLIC_BACKEND_WS_URL=wss://relearn-math-outflank.ngrok-free.dev   # ← dev tunnel
VOICE_TTS_OVERLAP=true
DEEPGRAM_MODEL=nova-2   DEEPGRAM_MODEL_MULTI=nova-3
DEEPGRAM_ENDPOINTING_MS=300   DEEPGRAM_UTTERANCE_END_MS=1000
FISH_TTS_MODEL=s2.1-pro-free
CAMPAIGN_WORKER_CONCURRENCY=2   CAMPAIGN_BATCH_SIZE=50
ELEVENLABS_CONVAI_AGENT_ID=agent_4001ky2g6gwjfhws7fgfa606k3dd
```

**Defaults applied in code (not in .env):**
```
VOICE_LLM_MODEL=gemini-3.5-flash-lite
VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS=1500    VOICE_LLM_SPIKE_TIMEOUT_MS=4000
VOICE_FILLER_DELAY_MS=400                VOICE_SENTENCE_SPLIT=true
DEEPGRAM_ENDPOINT_GRACE_MS=400           DEEPGRAM_UNFINISHED_GRACE_MS=1100
PHONE_BARGE_RMS=2500  PHONE_BARGE_MARGIN=3  PHONE_BARGE_FRAMES=5  PHONE_BARGE_GRACE_MS=500
KB_VOICE_CHARS=48000  KB_PER_FILE_CHARS=48000  KB_TOTAL_CHARS=96000
AGENT_TTL_MS / KB_TTL_MS = 5 min
```

Cache TTLs must outlast the **gap between turns** (caller listens + thinks ≈
15–60s), not just one turn. The old 15s/30s TTLs expired between turns, so
nearly every turn re-paid the remote DB round trip — that was the "unaccounted"
0.5–2s gaps in early logs.

---

## 9. File map

| Path | Role |
|---|---|
| `src/services/agentRuntime.service.js` | The brain. Prompt, KB, RAG, LLM, `voiceTurnStream`, latency record |
| `src/services/stt/deepgramStream.service.js` | Streaming STT + turn detection |
| `src/services/stt/speechGate.js` | `analyzeSpeech`, `classifyCallerAffect`, `isEchoOfAgent`, `stripAgentEcho`, hallucination filter |
| `src/services/voice.service.js` + `voice/providers/*` | TTS dispatch |
| `src/services/voice/telephonyAudio.js` | µ-law codec, frame splitter, resample, `TELEPHONY_TTS` |
| `src/services/voice/ttsStreamFactory.js` | Token-streaming TTS session picker |
| `src/services/voice/ulawPacer.js` | 20ms outbound clock (Plivo) |
| `src/services/voice/playoutWindow.js` | "is the caller hearing us right now" |
| `src/services/voice/disfluency.js` | Naturalness, openers, SSML breaks, filler budget |
| `src/ws/modularMediaBridge.js` | **The phone bridge.** Turn detection, barge-in, history, format |
| `src/ws/{twilio,plivo}MediaModular.handler.js` | ~40-line carrier adapters |
| `src/ws/{twilio,plivo,piopiy}MediaRealtime.handler.js` | Bundled-engine bridges |
| `src/ws/webCallModularRealtime.handler.js` | Browser equivalent of the phone bridge |
| `src/services/telephony/*` | Provider contract + Twilio/Plivo/PIOPIY |
| `src/services/outboundCall.service.js` | `resolveCallMode`, dial path |
| `src/server.js` | WS upgrade routing → bundled vs modular |
| `backend/logs/latency.log` | Per-turn JSON latency records |
| `backend/docs/PLIVO_INTEGRATION.md`, `PIOPIY_INTEGRATION.md` | Carrier specifics |

---

## 10. Open questions worth discussing

1. **Should the modular pipeline stay the default at all**, or should phone calls
   route to a speech-to-speech engine (`gemini-3.1-flash-live-preview` /
   ElevenLabs ConvAI) and modular stay for web/chat where 2s is fine? The
   trade-off is control: modular owns the prompt, KB, RAG, disfluency and
   per-turn affect; the bundled engines own none of that.
2. **How much of the current gap is measurement vs reality?** No phone turn has
   ever been logged. Everything about phone latency above is inferred from code
   paths, web-call rows, and carrier support answers.
3. **`wireMs` vs `ttfaMs` divergence is unmeasured.** With a paced carrier, a
   queue that's deep when a new turn starts means every following turn is served
   late no matter how fast the model answers. That's the number to look at first
   on a real deployed call.
4. **Endpointing is the single biggest fixed cost we control** (~700ms of every
   turn). Is a semantic/LLM-based turn predictor worth it, or does that just move
   the latency around?
5. **PIOPIY has no modular bridge.** If India traffic moves there, the modular
   pipeline can't serve it at all.
