# Why the same modular pipeline is slow on the phone and fast on the web

Root-cause audit of the phone-vs-web latency gap, done by reading the live code
paths rather than the existing brief. Companion to
`VOICE_PIPELINE_AND_LATENCY_BRIEF.md`, which describes the pipeline; this one
answers only one question — **where does a phone turn spend time that a web turn
does not** — and what to do about it under the constraint that **the tenant picks
their own STT / LLM / TTS provider, so no fix may depend on a specific vendor.**

Everything below is either read out of the code (file:line given) or a number
already measured in this repo. Where I am estimating, it says *estimate*.

> **Status, 21 Aug 2026:** P1, P2, P3 and P4 are implemented — see §11 for
> exactly what changed. B1 and B2 are still open. Line numbers below refer to
> the code as it was when the audit ran.

---

## 0. TL;DR

The gap is **not** in `voiceTurnStream()`. Both channels run the same brain, the
same endpointing constants, and the same TTS. The phone loses time in five
places the web call structurally never visits, and four of the five are code we
own:

| # | Cause | Cost | Where | Provider-agnostic fix? |
|---|---|---|---|---|
| P1 | Uncached Supabase read **blocking the WebSocket handshake** | 0.5–1.4s dead air, every call | `src/server.js:122,193,221` | **FIXED** |
| P2 | Greeting **synthesized live on every answer** | +0.6–1.5s dead air, every call | `modularMediaBridge.js:1018` | **FIXED** |
| P3 | `finalizeTurn()` round-trip after the turn was **already committed** | +150–450ms **every turn** | `modularMediaBridge.js:437` | **FIXED** |
| P4 | Bridge is **deaf for the whole tail of every reply** (`armNextTurn`) | 0.5–3s of "it didn't hear me", every turn | `modularMediaBridge.js:773` | **FIXED** (rungs 1–2) |
| P5 | PSTN jitter buffer + G.711 narrowband + SIP post-dial | 20–300ms + accuracy loss | carrier | no — structural |

And for **bulk**, two more that dwarf all of them:

| # | Cause | Cost |
|---|---|---|
| B1 | **One Node process** runs the API, the dialler, all 45 media bridges, and one 20ms `setInterval` per call. When the event loop slips, every pacer tick fires late and *every live call's* audio queue deepens simultaneously. | unbounded, correlated across calls |
| B2 | All tenants share **one platform API key per provider** (`process.env.GEMINI_API_KEY` …). One campaign exhausts the RPM bucket for every other tenant. | 429s + `retryDelay` ~34s |

---

## 1. What is provably *not* the difference

Worth stating so nobody re-investigates it:

* **Turn detection is identical.** The web client does not end turns earlier. The
  server sends `{type:'endpoint'}` from the *same* Deepgram commit
  (`webCallModularRealtime.handler.js:506`), and the client's RMS VAD is
  deliberately parked *behind* it at `endpointCommitMs + BACKSTOP_MARGIN_MS`
  (`client/src/pages/EditAgent.tsx:1763`). Both channels turn around at
  `endpointing + grace` ≈ 700ms.
* **The LLM and TTS calls are the same calls**, with the same prompt, the same
  history trim, the same `maxTokens`, the same overlap-mode selection
  (`agentRuntime.service.js:1659`). `audioFormat` differs; the code path does not.
* **No transcode either direction.** Deepgram is opened `mulaw/8000`, TTS is
  asked for the carrier's native format.
* **TCP_NODELAY is already on** — `ws` sets it in `setSocket()`
  (`node_modules/ws/lib/websocket.js:248`, reached from `websocket-server.js:431`).
  I checked because it is the usual suspect. It is not this.

So the delta is entirely in **call setup**, **per-turn overheads unique to the
bridge**, and **scale**.

---

## 2. P1 — a Supabase round trip blocks the WebSocket handshake

```js
// src/server.js:122
async function resolveBundledEngine(workspaceId, agentId) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { settings: true },
  });
  ...
}
// :193 (Twilio) and :221 (Plivo)
resolveBundledEngine(workspaceId, agentId).then((bundled) => {
  plivoMediaWss.handleUpgrade(req, socket, head, (ws) => { ... });
});
```

The carrier opens this socket **the instant the callee says "hello?"**. Before
the 101 response is even written, we do an **uncached** `findFirst` against
Supabase. This repo's own measurement, quoted in `modularMediaBridge.js:875`,
is **490–1400ms per Supabase round trip — and a bare `SELECT 1` costs the same**,
so it is network distance, not query cost.

Three things make it worse than it looks:

1. It is **serial with everything else**. The bridge does not exist yet, so
   nothing overlaps it. The careful `Promise.all` work at
   `modularMediaBridge.js:896` starts only *after* this finishes.
2. It is a **raw `findFirst`, not `loadAgent()`**, and it selects only
   `settings`. So it does not populate `agentCache`, and `loadAgent()` inside
   `start` pays a **second** full round trip for the same row.
3. **The web call skips it entirely** — the modular web-call path upgrades
   immediately with no lookup.

This is the single largest phone-only cost in the codebase, it is paid by every
call in a bulk campaign, and it is not mentioned in the existing brief.

**Fix (two options, do both):**

* **Short:** cache it. Route through `loadAgent()` so one read serves the
  handshake, `getRenderedWelcome()` and the first turn, and add an engine-only
  memo with the same 5-minute TTL. Cost: ~10 lines.
* **Correct:** stop looking it up. The dialler already knows the agent and its
  engine at `placeOutboundCall()` time. Put `engine=modular|bundled` on the
  media-stream URL next to `direction` and `callLogId`
  (`plivo.provider.js:153`), and have `server.js` read the query string. Zero DB
  work on the answer path. Keep the lookup only as the fallback for inbound calls
  and for URLs built before the change.

*Expected saving: 0.5–1.4s of dead air on every phone call, plus a second round
trip on the first turn.*

---

## 3. P2 — the greeting is re-synthesized on every single call

```js
// src/ws/modularMediaBridge.js:1018
await speakLine(greeting);   // -> streamSynthesizeVoice(...) live, per call
```

`welcomeCache` (`agentRuntime.service.js:684`) caches the greeting **text**.
Nothing caches the **audio**. Every answered call opens a fresh TTS connection
and waits for first byte before the caller hears anything — measured
`ttsTtfaMs` p50 **581ms**, p90 **1450ms**, and that is *after* P1's DB wait.

The web call pays none of this: the browser fetched and buffered the welcome over
HTTP before the user pressed the button.

For a 500-recipient campaign this is the *same one or two sentences* synthesized
500 times, at the exact moment 45 calls are connecting at once.

**Fix:** cache the greeting's mu-law bytes keyed by
`(voiceId, audioFormat, sampleRate, hash(text))` — the same shape as
`fillerKey()` at `agentRuntime.service.js:1133`, which already proves the pattern
works. Warm it at **dial** time (the dialler already renders the welcome text at
`outboundCall.service.js:293`), so the answer path is memory I/O.

*Not done, deliberately:* the original proposal also moved playback **ahead of
the wallet gate**, so the greeting would overlap the agent read rather than
follow it. That changes what a refused call sounds like — a workspace with an
empty wallet would greet the caller and then hang up on them, rather than never
speaking. With P1 landed the gate is a cache hit anyway, so the ordering change
buys close to nothing and costs a real behaviour change. Left as an option.

*Expected saving: 0.6–1.5s on every call; near-total removal of answer-time dead
air when combined with P1.*

---

## 4. P3 — a Deepgram round trip per turn that harvests nothing

Phone `runTurn()` is entered **from** `onEndOfTurn`, i.e. from
`_commitEndOfTurn()` (`deepgramStream.service.js:539`). By construction that only
fires after a `speech_final` **plus** a grace window during which no further
transcript arrived. At that instant `this.finals` already holds the complete
utterance and Deepgram has nothing buffered.

`runTurn` then does this anyway:

```js
// src/ws/modularMediaBridge.js:437
userText = await dg.finalizeTurn(1200, dgTurnSeq);
```

and `finalizeTurn` (`deepgramStream.service.js:607`) unconditionally sends
`{type:'Finalize'}` and blocks up to 1200ms waiting for `from_finalize`. That is
a **full round trip to Deepgram's US endpoint on every phone turn, to fetch words
we already have** — *estimate* 150–450ms depending on region, and it matches the
observed `preLlmMs` p50 of 450ms.

The web path is different and the round trip is *justified* there: the client's
`end-turn` can arrive from its RMS backstop before any commit, so words really
may still be in flight.

**Fix:** have `_commitEndOfTurn` mark the turn as flushed
(`this._committed = true`, cleared by `beginTurn()`), and let `finalizeTurn`
return `takeTranscript()` immediately when that flag is set. Keep the flush for
every other caller. ~6 lines.

*Expected saving: 150–450ms on **every** phone turn — the cheapest win on this
list per line of code.*

---

## 5. P4 — the bridge goes deaf for the tail of every reply

`armNextTurn()` (`modularMediaBridge.js:773`) refuses to call `dg.beginTurn()`
until `playout.isSpeaking()` is false, and `captureTurnAudio` is likewise gated
(`:1075`). This is **correct** — a phone line has no AEC and our own voice comes
back up the inbound leg — but the consequences are large, and they are the most
likely explanation for "the phone agent feels slow" that no server timing shows:

* The pacer holds the outbound leg to real time, so `playout.isSpeaking()` stays
  true for the **entire duration of the reply** — 5, 10, 15 seconds.
* Anything the caller says in that window is fed to Deepgram (`:1064`,
  deliberately) but is then **discarded**, because `beginTurn()` clears `finals`
  and `_tail` when the turn is finally armed.
* `playoutWindow` models frames written to the socket, not the carrier's
  **20–300ms jitter buffer**, so the real deaf window is longer still.

Real callers answer before the agent finishes — "yes", "no", "correct", a phone
number. On web, AEC means the client listens throughout and those land. On the
phone they vanish, the caller repeats themselves, and the turn takes two
attempts. **That reads as latency and is invisible in `latency.log`.**

Barge-in only partly covers it: it needs 5 consecutive frames above
`max(2500, noiseFloor × 3)` and is suppressed for `PHONE_BARGE_GRACE_MS = 500`
after speech onset — a quiet "mm-hm" or a soft-spoken caller never clears it.

**Fixes, cheapest first:**

1. **Keep a pre-arm ring buffer.** Don't throw away the ~1.5s of inbound audio
   immediately preceding the arm; replay it into the newly-armed turn. Recovers
   the short answers with no new dependency.
2. **Lower the barge bar for *short* utterances** by pairing energy with
   Deepgram's interim transcript — if a word arrives while we are speaking and
   the energy is above the noise floor at all, treat it as a barge. Transcript is
   too slow to be the *only* trigger (300–600ms), but it is an excellent
   *confirmer* for a marginal energy reading.
3. **Real AEC on the inbound leg.** We already have both signals with exact wire
   timing — the outbound frames (`sendFrameNow` → `playout.noteFrame()`) and the
   inbound frames. A short adaptive (NLMS) canceller over 8kHz mu-law is cheap
   and would let the bridge listen *through* its own speech, closing the last
   structural gap with the browser. This is the real fix; the other two are
   mitigations.

---

## 6. P5 — what will never close

* Plivo confirmed a **non-configurable adaptive jitter buffer of ~20–300ms** on
  the inbound leg. WebRTC has no equivalent.
* **G.711 8kHz narrowband** versus the browser's 16–48kHz Opus. Same STT engine,
  measurably worse word error rate — which costs turns to clarification rather
  than milliseconds.
* SIP post-dial delay and media anchoring. India media anchors in **Mumbai**; a
  backend outside ap-south-1 pays that cross-region RTT on *every 20ms frame in
  both directions*. The current VPS (`62.72.12.185`, Hostinger) is
  **region-unverified** — verify it before anything else on this list, because if
  it is not in India it dominates everything above.
* On the dev box specifically, the ngrok tunnel is on the phone path only:
  measured **3ms localhost vs 213ms median / 619ms max through the tunnel**, both
  ways, per frame. **No phone latency number taken on the dev box means anything.**

---

## 7. Bulk calls: B1 — one process, one event loop, 45 real-time clocks

```js
// ecosystem.config.cjs
exec_mode: 'fork',
instances: 1,
```

One Node process runs the HTTP API, the campaign dialler, the in-process
concurrency table, and every media bridge. At the ceiling of 45 concurrent calls
(`concurrency.js`: carrier 50 − buffer 5), that single event loop carries:

* **45 × `setInterval(tick, 20)`** — one `ulawPacer` per Plivo call
  (`modularMediaBridge.js:857`), i.e. 2,250 timer callbacks/sec whose *only job
  is to be on time*;
* **~2,250 inbound frames/sec**, each costing a `JSON.parse`, a base64 decode, a
  µ-law → PCM decode and an RMS loop (`modularMediaBridge.js:1060–1130`);
* **~2,250 outbound frames/sec**, each a `JSON.stringify` + base64 encode
  (`plivoMediaModular.handler.js` `sendAudio`);
* 45 Deepgram WebSockets, up to 45 TTS WebSockets, plus all the API traffic;
* on a **shared Hostinger box with 17 other PM2 processes** competing for CPU.

The failure mode is specific and nasty: when the loop slips, **every pacer tick
fires late at once**, so every live call's queue deepens together. The pacer can
only drain at 5× real time (`MAX_FRAMES_PER_TICK = 5`) *and only if ticks are on
time*; if ticks arrive every 100ms it never catches up and `wireMs` grows without
bound across the whole campaign. `RESYNC_THRESHOLD_MS = 500` stops the burst but
does not recover the delay.

This is why bulk feels worse than a single call, and it is **not** the LLM.

**Fixes:**

1. **Measure it first.** Add `perf_hooks.monitorEventLoopDelay()` and log
   p50/p99 lag alongside `pacerMaxQueueMs`. If p99 lag > 20ms during a campaign,
   this is the bottleneck and nothing else on this list matters yet.
2. **Split the process.** Media bridges belong in N workers (`instances: N`,
   `exec_mode: 'cluster'`), sharded by call id. There is a blocker, and it is
   called out in `concurrency.js`' own header: the concurrency table and the
   dialler are in-process singletons. Move the counter to Postgres or Redis
   first — that is the stated tripwire, and it has now been tripped.
3. **One clock, not 45.** Replace per-call `setInterval` with a single 20ms
   process-wide ticker that drains every active call's queue. 45 timers become 1;
   the per-frame work is unchanged but the scheduling jitter collapses.
4. **Get per-frame work off the JS hot path.** The RMS loop runs on every inbound
   frame of every call purely to arm barge-in — it can run on 1-in-2 frames
   without changing behaviour.
5. `CAMPAIGN_DIAL_SPACING_MS = 1000` with 45 concurrent slots means the campaign
   ramps to full load in 45s and holds it. Consider scaling the spacing with
   observed event-loop lag — a self-limiting dialler is better than a fast one
   that degrades every call it already placed.

---

## 8. Bulk calls: B2 — one API key for every tenant

`resolveLlmForAgent()` (`agentRuntime.service.js:426`) reads
`process.env.GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY`. There is no
per-workspace credential anywhere in the schema. So:

* every tenant's calls draw on **one** rate-limit bucket per provider;
* the key is still **free tier** (15 requests/minute/model, Google's own
  `retryDelay` ≈ 34s — an eternity on a live call);
* a live call issues ~6–12 LLM requests/minute, so **one conversation nearly
  saturates the quota** and a campaign is guaranteed to 429;
* `VOICE_MODEL_FALLBACKS` (`:983`) softens it, but a fallback stacks a second
  model's first-token latency on top of the first one's failure.

For a SaaS where clients choose providers by price, this is also a product
problem, not only a latency one: one tenant's campaign degrades everyone.

**Fixes:** enable billing today; then add per-workspace provider credentials
(BYOK) with the platform key as fallback, and a per-workspace token bucket in
front of each provider so one campaign cannot starve another.

---

## 9. Staying fast while the tenant picks the provider

The constraint rules out "just use model X". What it does not rule out is making
provider choice **safe**:

* **Publish a latency SLO per provider option in the UI.** The instrument already
  exists (`lib/latencyLog.js`). Roll up `llmTtftMs` / `ttsTtfaMs` p50 and p95 per
  `model` and per TTS provider over the last 24h and show it next to the price in
  the picker. Tenants choose on price *because price is the only number shown*.
* **Enforce a floor; don't pick a default.** Refuse — or loudly warn on — a
  provider combination whose measured p95 TTFT exceeds a voice-specific
  threshold, exactly the way the pipeline already refuses a TTS provider that
  cannot emit a telephony format (`telephonyAudio.js` `TELEPHONY_TTS`). That
  precedent is right and should extend from format to latency.
* **Keep the hedge, make it provider-agnostic.**
  `VOICE_LLM_FIRST_TOKEN_TIMEOUT_MS` (1500ms) currently races a second Gemini
  stream. Generalise it to "race the tenant's chosen model against the platform's
  fastest model, first token wins" — the tenant keeps their choice on every
  normal turn and never eats a 15s tail.
* **Warm the sockets.** `createTokenTtsStream()` opens a **new** WebSocket to the
  TTS provider per turn, and undici's default pool keeps HTTP connections for
  only ~4s while the gap between turns is 15–60s. So most turns pay a fresh TLS
  handshake to whichever provider the tenant picked. A per-(workspace, provider)
  warm connection pool, held for the life of the call, removes 100–400ms per turn
  *regardless of which provider they chose*. **This is the single most valuable
  provider-agnostic optimisation available.**
* **Co-locate.** Whatever they pick, the round trip is shortest from ap-south-1.
  Region is a platform decision, not a tenant one.

---

## 10. Do these in this order

**Before writing any code:**

0. **Verify the VPS region**, and get a phone turn into `latency.log` — there are
   **418 turns logged and zero with `"channel":"phone"`**. Every phone number in
   the existing brief is inferred. Also log `wireMs` *and* event-loop lag; on a
   paced carrier `wireMs − ttfaMs` is the queue depth, and that is the number
   that separates "slow model" from "deep buffer".

**Then, by value per unit of work:**

1. **P3** — skip `Finalize` after a committed turn. ~6 lines, 150–450ms/turn.
2. **P1** — engine on the stream URL / cached lookup. ~20 lines, 0.5–1.4s/call.
3. **P2** — cache greeting audio, play it before the DB work. ~40 lines,
   0.6–1.5s/call, and it makes P1 non-blocking.
4. **B2** — enable Gemini billing. No code. Removes the 429 / 34s tail.
5. **§9 warm socket pool** for TTS/LLM. Provider-agnostic, ~100–400ms/turn.
6. **B1** — event-loop instrumentation, then one shared pacer clock, then split
   the process (needs the concurrency counter moved out of process first).
7. **P4** — pre-arm ring buffer, then transcript-confirmed barge, then real AEC.

Items 1–3 alone should remove **~1.5–3s of the phone-only gap on the first turn
and ~0.2–0.5s on every turn after it**, without touching anybody's provider
choice.

---

## Appendix: smaller things found on the way

* `agentRuntime.service.js:692` — the persisted-welcome hit path writes
  `welcomeCache.set(agentId, …)` but every read uses
  `` `${agentId}:${callDirection || ''}` ``. That memo write is dead; the lookup
  never hits it.
* `getRenderedWelcome()` persists its render only when
  `!direction || direction === configuredDirection`. A campaign dialling
  `OUTBOUND` through an agent saved as `INBOUND` therefore **never** persists,
  so every process restart re-pays the LLM rewrite. It is warmed at dial time
  (`outboundCall.service.js:293`) so it is not on the answer path today — but it
  is one refactor away from being so.
* The persist path ends with `agentCache.delete(...)`, which forces the very next
  turn to re-pay a 490–1400ms Supabase read.
* There is no in-flight dedupe on `welcomeCache`. If the dial-time warm is ever
  removed, the first wave of a campaign would fire N concurrent identical LLM
  rewrites into a 15 RPM quota.


---

## 11. What shipped (21 Aug 2026)

P1, P2 and P3 are implemented on the working tree. Full suite green: 42 test
files, 0 failures, 21 new tests added.

### P3 — `deepgramStream.service.js`

`_commitEndOfTurn()` now sets `this._committed`, cleared by `beginTurn()`.
`finalizeTurn()` returns `takeTranscript()` immediately when it is set.

The Finalize frame is **not sent at all** on that path, rather than sent
un-awaited: firing it and not waiting would let a `from_finalize` result land
after the next `beginTurn()` and pollute the following turn, which is exactly
what the `_flushTarget` machinery exists to prevent.

The web path is untouched by construction — its `end-turn` comes from the
browser's RMS backstop, which can beat the commit, so `_committed` is false
there and the flush still runs.

*3 tests: a committed turn sends no Finalize and resolves from the buffer; an
uncommitted turn still flushes; `beginTurn()` re-arms the flush.*

### P1 — `server.js`, both providers, `plivo.controller.js`, `outboundCall.service.js`

Two layers, fast one first:

1. **`engine=bundled|modular` on the media-stream URL.** The dialler already
   resolved it (`resolveCallMode`) before asking the carrier to dial, so it
   simply says so — alongside `direction` and `callLogId`. `server.js` reads it
   off the query string and does **zero** database work. An unrecognised value
   falls through to the lookup, so a stale or hand-edited URL degrades to slow,
   never to wrong.
2. **`loadAgent()` instead of a raw `findFirst`** for everything else (inbound
   calls, older in-flight calls). Same row, behind the 5-minute agent cache, and
   it now *populates* that cache — so the `loadAgent()` the bridge runs moments
   later inside `start` is a hit rather than a second identical round trip.

Two supporting changes:

* `withStreamParams()` in `provider.interface.js` builds the query string with
  `URLSearchParams`. The old `direction ? url + '?direction=…' : url` form emits
  a second `?` the moment there are two parameters and silently loses one.
* `isBundledEngine()` is exported from `outboundCall.service.js` and used by
  `server.js`, which previously carried its own inline
  `engine === 'xai' || engine === 'elevenlabs'`. Two copies of that list is how
  a third bundled engine ends up dialled through the modular bridge.

`plivo.controller.js` gets the same treatment twice over: its own answer-path
`findFirst` (also on the live-line critical path — Plivo fetches the answer URL
*after* the callee picks up) is now `loadAgent()`, and because it is already
holding the agent row it derives `engine` itself. That covers **inbound** Plivo
calls, which have no dialler to have stamped the URL.

*6 tests: engine absent unless supplied, lower-cased when supplied, coexists
with `direction` under exactly one `?`, survives `callLogId` being appended, and
survives into both the Plivo stream XML and the TwiML with every `&` escaped.*

### P2 — `services/voice/greetingAudio.js` (new)

An LRU of synthesized greeting audio keyed by
`(voiceId, audioFormat, sampleRate, pace, sha1(text))`.

* **The format and rate are in the key.** This is the trap `fillerKey()` already
  paid for once — the ack clip was cached without a format, an MP3 reached a
  G.711 carrier as if it were mu-law, and every reply opened with static.
* **No TTL, deliberately.** The text *is* the key, so a changed welcome cannot
  be served stale; it lands on a new entry and the old one falls out of the LRU.
* **Truncated greetings are never stored.** `pumpAudio()` now returns whether
  the whole stream reached the wire, and only a complete pump is cached —
  otherwise a single barge-in or hangup becomes a permanent regression for that
  agent.
* `greetingSynthesisOpts()` is shared by the warm path and the read path so the
  two cannot key differently, which would warm an entry nothing looks up.

Wired in two places: `speakLine()` in the bridge reads the cache and populates
it on a miss, and `placeOutboundCall()` calls `warmPhoneGreeting()`
fire-and-forget **while the phone is ringing** — which also pre-pays
`getRenderedWelcome()`'s first-use LLM rewrite. Ringing is the one stretch of a
phone call with nobody waiting on it. A miss costs exactly what today costs, so
this can never be wrong, only unhelpful.

*10 tests: hit/miss, format · rate · pace · voice · text all keyed, empty and
oversized buffers refused, LRU evicts least-recently-**used** rather than oldest,
and `greetingSynthesisOpts` states a rate for PCM only.*

### P4 — `speechGate.js`, `modularMediaBridge.js`

The bridge still cannot listen and speak at once — that needs real echo
cancellation (rung 3, not done). What changed is that the words it *did* hear
are no longer thrown away.

The key realisation: Deepgram **already transcribes** everything the caller says
during playout. The inbound leg is fed unconditionally, on purpose. Those words
land in `finals` and are then wiped by `beginTurn()` when the turn finally arms.
So this needed no audio buffering at all — just harvesting `finals` *before*
the wipe, and deciding whether it is the caller or our own echo.

`harvestOverlap()` requires **two independent signals**, neither sufficient
alone, because a faithful transcription of the wrong speaker passes every test
built to catch a bad transcription:

1. **Energy** — at least `PHONE_OVERLAP_FRAMES` (3) inbound frames cleared the
   barge threshold, i.e. a multiple of *this line's* measured noise floor. Not
   required to be consecutive, which is the whole point: a one-word "yes" makes
   two or three loud frames and never trips barge-in's run of five.
2. **Text** — something real survives removing the agent's own words.

For (2), `stripAgentEcho()` could not be reused. It deliberately only strips a
verbatim **suffix** of the agent's utterance, and its docstring is right to: at
a normal turn boundary the echo *is* the tail of what was playing. But here we
listen through the **entire** reply, so the echo is a contiguous run from
anywhere in it — usually most of it. The real shape is
`"<the whole reply> yes"`, which a suffix rule strips nothing from, and
`isEchoOfAgent()` then discards wholesale. That is precisely how the "yes" was
being lost.

So `stripOverlapEcho()` (new, next to its sibling, with the difference
documented) strips the longest leading run of caller tokens occurring
contiguously **anywhere** in the agent's text, then `isEchoOfAgent()` rejects
any remainder still substantially agent speech.

Recovered text is **carried, not answered immediately**. The caller may be
mid-sentence ("yes, and also…"), and answering the "yes" alone would be the
mid-sentence cut-off this bridge spends four hundred lines avoiding. So a
`PHONE_OVERLAP_SETTLE_MS` (700ms) timer arms; any new speech cancels it and the
normal end-of-turn path takes over, with the carried text **prepended** in
`runTurn` so nothing is lost either way. The timer only ever fires for a caller
who has genuinely stopped — for whom no end-of-turn would otherwise ever fire,
which is why their answer used to vanish.

Barge-in gets fixed by the same mechanism for free: a barge stops playout, arms
immediately, and the harvest picks up the caller's opening syllables that
`beginTurn()` used to discard.

*Found while testing:* a standalone punctuation token (an em-dash left by
`smart_format`) normalized to an empty key, halted the match run, and then
leaked to the front of the result — where it also counted toward the
"is anything left?" length check. Punctuation-only tokens are now dropped from
both sides.

*10 tests: whole-reply echo, mid-reply echo, pure echo, no overlap, the
one-shared-word coincidence guard, case/punctuation, single-token input, null
and empty inputs, agreement between the two gates, and a stall bound.*

**Residual risk, stated plainly:** both gates can miss the same thing — echo
garbled enough that Deepgram transcribes it as *different words*, on a line
reflective enough to clear the energy bar. That carries a phantom user turn,
the exact failure the blanket discard prevented. Judged the better trade
because the failure it replaces is *certain* rather than occasional, and an LLM
handles one garbled turn far better than a caller handles being ignored. Every
drop is logged with the raw transcript so the two cases stay distinguishable,
and `PHONE_OVERLAP_FRAMES` is the blunt fix — raised high enough it degrades
cleanly back to the old behaviour.

**Rung 3, real AEC — DONE (21 Aug 2026).** `services/voice/echoCanceller.js`.
Bulk delay by energy-envelope cross-correlation (100-400ms, per call, re-checked
every 500ms) followed by a 128-tap NLMS filter centred on it. The bridge feeds
it every outbound frame as reference in `sendFrameNow` and runs every inbound
frame through it before Deepgram, the barge detector, the noise floor or the
turn buffer see the audio.

Measured on a synthetic hybrid (120ms delay, 0.55 coupling): echo RMS 1795 ->
215, about 18dB, converging in ~1s of speech, 0 divergences. Cost 0.153ms per
20ms frame — 0.76% of one call's realtime budget, and a pure passthrough while
the agent is silent, which is most of a call.

Two things it does NOT do yet, deliberately. `armNextTurn()` still waits for
playout to drain before `beginTurn()`, and `harvestOverlap()` still applies its
text heuristic — both now operate on echo-free audio, so they succeed far more
often, but the structure is unchanged. Removing the deaf window entirely is the
next step and wants a real call's numbers first.

### Still open

B1 (one process, 45 clocks), B2 (shared API key), and step 0 —
**verify the VPS region and get a phone turn into `latency.log`**. Nothing above
has been measured on a real call yet; the expected savings are still arithmetic
on the numbers in §0.
