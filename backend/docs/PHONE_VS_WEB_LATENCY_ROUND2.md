# Round 2: the phone never learns when the caller stopped talking

Second root-cause audit of the phone-vs-web latency gap, run 12 Sep 2026 after a
side-by-side test (web call, then a real PSTN call on the same agent) showed the
phone still turning around far slower than the browser.

Companion to `PHONE_VS_WEB_LATENCY_ROOT_CAUSE.md` (21 Aug), whose P1–P4 all
shipped. This document does **not** restate those. It answers one question: with
P1–P4 landed, **what is left**, and the answer is a single missing wire.

Everything below is read out of the code, with file:line. Where a number is an
estimate it says *estimate*.

> **Line numbers refer to `feat/plivo-subaccount-lifecycle` as the audit ran
> (12 Sep 2026).** Every file cited is byte-identical to `origin/main` except
> `modularMediaBridge.js`, which is +14/−1 lines ahead — so references into that
> one file shift by up to ~13 lines when read on `main`.

---

## 0. TL;DR

**Two of the old audit's open unknowns are now closed, and both are good news.**

* **The VPS is in Mumbai.** `62.72.12.185` geolocates to Mumbai, Maharashtra,
  Hostinger AS47583 — the same metro Plivo anchors Indian media in. §6 of the
  old audit said to verify this *before anything else* because a box outside
  ap-south-1 would dominate every other cause. It does not apply. Cross-region
  RTT per frame is not the problem.
* **Ambience is not deafening the agent.** Bed-only frames deliberately do not
  count as playout (`modularMediaBridge.js:499-505`), so an agent with an
  ambience preset does not hold `playout.isSpeaking()` true forever.

**The remaining gap is one thing, and it costs 500–750 ms on every phone turn.**

| | web call | phone call |
|---|---|---|
| Local voice-activity detector on the inbound leg | **yes** — `createFrameVad()`, `webCallModularRealtime.handler.js:217` | **no** — `frameVad.js` is never imported by `modularMediaBridge.js` |
| LLM speculation starts at | **~300 ms** after the caller's last voiced frame | **~1.2–1.4 s** after it |
| How much of the model's first-token time is hidden | effectively all of it | only `graceMs` — 400 ms, or **150 ms** on a finished-sounding sentence |

`createFrameVad` is imported in exactly one file. `noteLocalSilence()` — the
method that acts on it — is called from exactly one line,
`webCallModularRealtime.handler.js:846`. Neither appears anywhere in the phone
bridge.

The phone bridge already computes everything the detector needs and throws the
answer away.

---

## 1. What the detector is for

`frameVad.js` is not a nicety; its header states the measurement that justifies
it (`frameVad.js:5-11`):

> The recogniser's `speech_final` is the only end-of-speech signal the turn
> machinery had, and measured with a wire-level harness
> (`scripts/measure-webcall.mjs`) it lands **~1.2-1.4s after the caller's last
> voiced frame** — the configured 300ms `endpointing` plus the recogniser's own
> decode/transport latency, which nothing here can shorten. **That single wait is
> larger than the LLM's first token** and was invisible, because the server never
> knew when the caller actually stopped.

So there is a ~1 second window, on every turn, between *the caller stopping* and
*the server being told they stopped*. The web transport spends that window
running the LLM. The phone transport spends it waiting.

---

## 2. The two timelines, side by side

Default `balanced` profile (`turnEndProfile.js:40-74`): `endpointing` 300 ms,
ordinary grace 400 ms, finished-sounding grace 150 ms, unfinished grace 1100 ms.
Speculation mode defaults to `'candidate'` (`speculativeTurn.js:57`).

`t = 0` is the caller's last voiced frame.

### Web

```
t≈300ms    frameVad.silenceMs() >= endpointingMs
           → speculator.onCandidate(dgSession.turnTextSoFar())
           → LLM REQUEST STARTS                       (handler:843-852)
t≈1.2-1.4s Deepgram speech_final → onEndOfTurnCandidate
           → launch() sees the same words and KEEPS the running request
             ("same words: keep it", speculativeTurn.js:233)
t≈1.6-1.8s grace expires, turn commits, take() hits
           → the model's first token arrived long ago; tokens are already
             buffered → TTS starts immediately
```

The LLM has had **1.05–1.5 s** of head start by the time the turn commits.

### Phone

```
t≈1.2-1.4s Deepgram speech_final → onEndOfTurnCandidate
           → LLM REQUEST STARTS                 (modularMediaBridge.js:1046)
           ← this is the FIRST and ONLY trigger on this transport
t≈1.6-1.8s grace expires, turn commits, take() hits
           → the model has had 400ms. Typical first-token is ~900ms.
           → ~500ms of dead air before TTS gets a single token
```

The LLM has had **`graceMs`** of head start — 400 ms, and only **150 ms** when
`looksFinished(this._tail)` picks the fast tier
(`deepgramStream.service.js:826-833`).

In the default `'candidate'` mode `onTranscript` returns immediately
(`speculativeTurn.js:252`: `if (!enabled || mode !== 'interim' || !turnOpen) return;`),
so `onEndOfTurnCandidate` really is the only trigger the phone has.

### The arithmetic

Phone-only penalty per turn ≈ `max(0, llmTtftMs − graceMs)`, against ≈ 0 on web:

| tier | grace | penalty at 900 ms TTFT *(estimate)* |
|---|---|---|
| finished-sounding ("Yes, that's right.") | 150 ms | **~750 ms** |
| ordinary | 400 ms | **~500 ms** |
| unfinished ("…and also") | 1100 ms | ~0 ms |

**Note the inversion.** The `finished` tier exists to make turns *faster*, and on
the web it does. On the phone it is the worst case, because grace is the only
speculation lead the phone has and that tier is the shortest. The better the
caller's sentence sounds, the more the phone loses. This reverses the moment the
detector is wired in.

---

## 3. Why this is cheap to fix: the bridge already has the signal

The detector wants PCM16 frames and is explicitly rate-agnostic
(`frameVad.js:39`: *"informational; the detector is rate-agnostic"*).

The phone bridge already produces exactly that, per inbound frame, and already
echo-cancelled (`modularMediaBridge.js:1983-1994`):

```js
const echo = aec.process(decodeUlaw(frame));
const pcm  = echo.pcm;
...
const rms = pcmRms(pcm);
```

and already maintains a line-calibrated noise floor and barge thresholds off it
(`:2001-2028`, `bargeThreshold.js`). There is no new signal to derive, no new
decode, no added per-frame cost of consequence — `frameVad` is ~2 µs/frame
(`frameVad.js:22`).

What is missing is the ~12 lines that read `silenceMs()` and call the speculator.

### Shipped, 12 Sep 2026

Implemented as described below. `frameVad` gained a `pushRms()` entry point so
the bridge feeds it the RMS it already computes for barge-in rather than walking
the same 160 samples twice, and so nothing has to convert the bridge's
`Int16Array` into a `Buffer` to satisfy `push()`'s signature. `push(buf)` now
delegates to it, so the web path is unchanged by construction.

The endpointing window is cached in `openDeepgram`, next to — and from — the
same `turnEndProfileFor(settings)` call that configures the recogniser, so the
local detector and Deepgram cannot be told different numbers. `armNextTurn`
resets the detector alongside `speculator.beginTurn()`, keeping the learned
noise floor (a property of the line, not the turn, and ~500ms of frames to
relearn).

*Test: `pushRms` decides identically to `push`, frame for frame, across a
room-tone → speech → pause script — because if the two entry points could
disagree, a phone call would endpoint differently from a web call on identical
audio, which is the divergence this whole change exists to remove.*

### Sketch (as implemented)

```js
// modularMediaBridge.js — with the other voice imports
import { createFrameVad } from '../services/voice/frameVad.js';
const callerVad = createFrameVad();
let localSilenceSpeculated = false;
```

In the `media` case, after `const pcm = echo.pcm;`:

```js
callerVad.push(pcm);                       // see the note on buffer type below
if (!playout.isSpeaking() && !turnRunning && !localSilenceSpeculated
    && callerVad.heardSpeech()
    && callerVad.silenceMs() >= turnEndProfileFor(settings).endpointingMs) {
  const soFar = dg?.turnTextSoFar();
  if (soFar) { localSilenceSpeculated = true; speculator.onCandidate(soFar); }
}
```

and reset alongside the existing per-turn state in `armNextTurn`
(`:1163`): `callerVad.resetTurn(); localSilenceSpeculated = false;`

**Two implementation notes, both real:**

1. **Buffer type.** `frameVad.push` does `buf.readInt16LE(i)`, i.e. it wants a
   `Buffer`; `decodeUlaw()` returns an `Int16Array` (that is what `encodeUlaw`
   and `resamplePcm16` consume). Either wrap it, or — cleaner — give `frameVad`
   an entry point that takes an already-computed RMS, since the bridge computes
   `pcmRms(pcm)` on the very next line and has a better-calibrated noise floor
   than the detector's own. Reusing the bridge's floor is the better shape: it
   is tuned per line and already survives the AEC.
2. **Gate on `!playout.isSpeaking()`**, exactly like the existing hooks at
   `:1045-1046`. Words heard while the agent is audible are echo or over-talk,
   and neither is worth pre-answering.

### Why this cannot make things worse

The speculation contract already guarantees it (`speculativeTurn.js:20-31`):
nothing speculative reaches the caller, and a speculation is used **only** when
its text matches the committed transcript. A wrong early guess is discarded and
the ordinary path runs — identical to today. The cost of a miss is one wasted
LLM request, already counted and logged (`specStarted` / `specWasted` in the
latency record). Same argument the greeting cache shipped on: it can be
unhelpful, never wrong.

---

## 4. The other phone-only costs, ranked below it

These are real but smaller, or structural.

**A. The deaf window is still there for over-talk.** `armNextTurn` still refuses
to `dg.beginTurn()` until playout drains (`:1126-1131`), and the pacer holds the
outbound leg to real time, so that is the full duration of the reply. P4's
`harvestOverlap()` + the NLMS canceller recover the *words*, but a caller who
answers mid-reply still waits out `OVERLAP_SETTLE_MS = 700` (`:196-206`) before
the agent reacts. The browser, with AEC, listens throughout and has no
equivalent. Removing the wait entirely is the rung the old audit deliberately
left undone pending a real call's numbers — and it now runs on echo-free audio,
so the numbers should be taken.

**B. The pacer adds ~20 ms to the first frame, and that is all.** Worth stating
because it looks like a suspect and is not one. At a normal turn boundary the
previous reply has fully drained (that is what `armNextTurn` waited for), so the
queue is empty and the first frame waits at most one 20 ms tick
(`ulawPacer.js:88-130`). Its real cost is indirect — holding playout to real
time is what makes (A) last as long as the reply does. It is also no longer 45
timers: `ulawPacer` now subscribes to one shared process ticker
(`frameClock.js:53-70`), which closes part of the old audit's B1.

**C. Different STT model.** Phone gets `nova-2-phonecall`, web gets `nova-2`
(`deepgramStream.service.js:363-382`). Deliberate and correct for G.711, but it
is a different model with its own `speech_final` timing — worth measuring rather
than assuming it matches the 1.2–1.4 s figure, which was taken on the web path.

**D. Structural, unchanged from §6 of the old audit.** Plivo's non-configurable
20–300 ms adaptive jitter buffer; G.711 8 kHz narrowband versus the browser's
48 kHz, which costs accuracy and therefore clarification turns rather than
milliseconds.

**E. Still open from round 1:** B2, the single shared platform API key per
provider. On a *single* test call this is invisible; under a campaign it
dominates.

---

## 5. Before trusting any phone number, check how it was measured

Two traps, both of which make a phone measurement meaningless:

1. **A dev tunnel on the phone leg.** The old audit measured ngrok at **213 ms
   median / 619 ms max per frame, both directions**. If the backend under test
   was a laptop behind a tunnel rather than `spandan.mannmate.com`, that alone
   explains a large gap and no fix will show. The phone leg needs a public URL
   (`PUBLIC_BACKEND_WS_URL`, `lib/publicUrl.js`); the web leg does not — which is
   precisely why the asymmetry is easy to introduce without noticing.
2. **`latency.log` is per-process and local.** There is no phone turn in any
   local copy. The records live on whichever box served the call.

The instrumentation asked for in round 1 now exists and is the fastest way to
settle this:

* pipeline record per turn — `llmTtftMs`, `ttfaMs`, `preLlmMs`, `endpointMs`,
  `speculative` / `specLeadMs` / `specWasted`, `mode` (`agentRuntime.service.js:2243-2255`)
* `kind:'wire'`, `channel:'phone'` — `wireMs` and `pacerMaxQueueMs`
  (`modularMediaBridge.js:962-978`). `wireMs − ttfaMs` is queue depth, which is
  what separates "slow model" from "deep buffer".
* `elLag*` event-loop percentiles on every record (`lib/latencyLog.js:18-20`).
* `scripts/latency-report.mjs` joins them by `turnId`.

```bash
ssh root@62.72.12.185
# place one phone call and one web call on the SAME agent, then:
node backend/scripts/latency-report.mjs backend/logs/latency.log
```

**The number that confirms or refutes this document:** `specLeadMs` on a phone
turn. If it is ≈ `graceMs` (150–400 ms) while the web's is ≈ 1000 ms+, §2 is
correct as written.

---

## 5b. The configuration half — why it was fast once and is not now

§1–§4 explain why the **phone** is slower than the **browser**. They do not
explain why the whole pipeline was faster when telephony was first integrated
and is slower now. That is a separate regression, it is in configuration, and it
hits both channels equally.

**The knowledge-base prompt budget was raised 8×.** `agentRuntime.service.js:261-263`:

```js
const KB_PER_FILE_CHARS = Number(process.env.KB_PER_FILE_CHARS || 48_000);
const KB_TOTAL_CHARS    = Number(process.env.KB_TOTAL_CHARS    || 96_000);
const KB_VOICE_CHARS    = Number(process.env.KB_VOICE_CHARS    || 48_000);
```

The comment above them records that these **were 6,000 / 24,000**, raised
because a 140 KB knowledge base was contributing 4% of itself and the agent was
answering "I don't have that information" about documented facts. The cost of
the cure is written down two hundred lines later, at `:888`: **prompt size
drives TTFT hard on this pipeline — measured, 12k chars → 1399 ms, 48k chars →
3738 ms.**

Nothing set them, so every voice turn pasted up to 48,000 chars. An agent with
no KB pays nothing, which is exactly why this was invisible at integration time
and appeared later, with no commit that looks like a latency change. Implicit
caching absorbs it from turn 2, so the symptom is *the first reply of a call is
slow* — and on a short test call that is most of the impression.

Also found, and now fixed in `.env.vps.example`:

* **ElevenLabs was pinned to its slowest tier** on the deployed box —
  `eleven_multilingual_v2`, which is *also* the code's fallback
  (`elevenlabs.provider.js:22`), while the dev box has run `eleven_turbo_v2_5`
  all along. A web call measured locally was being compared against a phone call
  synthesized by a slower model. Now `eleven_turbo_v2_5` +
  `ELEVENLABS_STREAMING_LATENCY=3`.
* **`DEEPGRAM_ENDPOINTING_MS` / `DEEPGRAM_UNFINISHED_GRACE_MS` were dead config.**
  `turnEndProfile.js:106` returns before the env overrides apply for any agent
  that picked a response speed in the editor — and both were set to exactly the
  Balanced values such an agent would get anyway. They read like live tuning
  knobs and did nothing. Commented out, with the profile numbers written next to
  them instead.
* **A `-free` Fish model id disables token streaming entirely**
  (`fishaudio.provider.js:57`), dropping every Fish voice onto per-sentence HTTP
  with nothing in the logs naming it. The dev box carries `s2.1-pro-free` and the
  template says `<COPY_FROM_LOCAL>`, so this was one copy-paste away. Warned
  against in place.

**`.env.vps.example` is a template, not the running config.** PM2 starts the API
with `--env-file=.env`, a symlink to `${APP_ROOT}/shared/.env`. Editing the
template changes nothing until those values are put into the live file.

## 6. Do these in this order

1. **Take the measurement above.** One phone turn and one web turn on the same
   agent, from the Mumbai box, not a tunnel. Everything below is arithmetic until
   this exists — the same caveat round 1 ended on, and it is still the honest
   statement.
2. **Wire `frameVad` into the phone bridge** (§3) — **DONE**. Provider-agnostic,
   cannot regress correctness. *Expected: 500–750 ms off every phone turn.*
2b. **Put §5b's values into the VPS's live `shared/.env`** — the KB budget first;
   it is the larger number and it is not phone-specific.
3. **Re-measure.** Confirm `specLeadMs` moved and `specWasted` did not explode.
4. **Then reconsider the deaf window** (§4A) with real numbers, now that the AEC
   makes listening-through-speech viable.
5. **B2** — per-workspace provider credentials. Not a single-call problem; the
   first thing that will bite a campaign.

Explicitly **not** recommended: `VOICE_LOCAL_ENDPOINTING='commit'`. It is ~300 ms
faster to commit, but the web handler's own note says a resumed caller's next
interim arrives after the grace window and mid-sentence pauses get cut
(`webCallModularRealtime.handler.js:233-237`). `'speculate'` takes the latency
without the behaviour change, which is the whole point.
