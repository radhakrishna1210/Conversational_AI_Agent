# Caller's "hello" cuts off the welcome message

**Reported 2026-09-15:** a caller who says "hello" while the agent is still
speaking the welcome message gets the welcome cut off. The agent then carries
on with the next stage of the conversational flow, so the caller never hears
who is calling or why.

People say "hello?" when they pick up the phone, so on outbound calls this
happens all the time.

## Root cause

It takes two things together.

### 1. Barge-in treats every sound the same, including during the welcome

| Transport | Detector | What cuts the agent off |
|---|---|---|
| Phone (`ws/modularMediaBridge.js`, 'media' case) | energy on the inbound leg | `BARGE_FRAMES` = 5 consecutive loud 20 ms frames — **100 ms** of sound |
| Web test call (`EditAgent.tsx`, barge timer) | mic RMS every 80 ms | `CUT_MS` = **800 ms** of sustained sound (a duck at 240 ms comes first) |

Both limits were tuned for replies in the middle of a call. Neither one knows
the welcome is playing. On the phone a single "hello?" is far longer than
100 ms. On a laptop's speakers, the welcome's own echo plus a "hello" easily
stays loud for 800 ms.

### 2. After the cut, the history claims the whole welcome was delivered

- Phone: `speakLine()` pushes the **full** welcome text into `history` and
  `transcript`. A cached greeting is pushed to the pacer almost instantly, so
  `speakLine` has already returned by the time the barge happens.
  `armNextTurn()` → `harvestOverlap()` then recovers the caller's "hello" as
  `carriedUserText`. Deepgram usually closed that utterance during playout, so
  `runTurn()` starts **immediately**.
- Web: `call.history = [{ assistant: welcome }]` is set before playback and
  never changed.
- The system prompt says *"Welcome message already delivered at call start:
  "…". Do not repeat it, and do not greet or re-introduce yourself again"*.

So the model sees a full greeting followed by `user: hello` and is told not to
repeat it. It answers by moving to the next stage of the flow. That is exactly
what was reported.

A smaller version of this happens even when the welcome is **not** cut: the
"hello" said over it is carried and answered as soon as playout ends, right when
the caller starts answering the welcome's own question.

## How other platforms handle it

| Platform | Mechanism |
|---|---|
| Vapi | `firstMessageInterruptionsEnabled` (the first message can be made non-interruptible); `stopSpeakingPlan.numWords` / `acknowledgementPhrases` |
| LiveKit Agents | `say(..., allow_interruptions=False)`; `min_interruption_words`; `resume_false_interruption` |
| Pipecat | `STTMuteFilter` with `MUTE_UNTIL_FIRST_BOT_COMPLETE`; `MinWordsInterruptionStrategy` |
| Retell | `interruption_sensitivity`, backchannel handling |
| OpenAI Realtime | on interruption, truncate the assistant item to the audio actually played |

Three ideas carry over: **protect the first message**, **require words and not
just sound**, and **truncate history to what was actually heard**.

## Plan

### Phone bridge

1. **Words, not sound, cut the welcome.** While the welcome is playing, the
   energy detector can only *propose* a barge. It goes through only if the
   transcript heard so far has at least `PHONE_WELCOME_BARGE_WORDS` (default 2)
   words that are neither pickup phrases (hello / hi / haan / ji / bolo / kaun
   / who's this …, in English, Hindi, Marathi and the Indic scripts) nor words
   of the welcome itself (echo). The proposal stays open for
   `PHONE_WELCOME_BARGE_HOLD_MS` (1200 ms), because Deepgram's words can arrive
   after the caller's sound. All the existing gates still apply (noise floor
   measured, echo grace, AEC veto, `interruptibleEnabled`). This can only cut
   less often than today, never more.
2. **A "hello" over the welcome is not a turn.** If everything the caller said
   over the welcome is pickup words, it is not answered straight away. The
   caller gets `PHONE_WELCOME_REPLY_MS` (2500 ms) to answer the welcome. If they
   stay silent, the carried "hello" is answered then, so there is no dead air.
3. **If the welcome really is cut, the model knows.** The history and call-log
   entry are truncated to roughly what was heard. The estimate is weighted by
   characters: time played ÷ (played + unplayed + still queued in the pacer).
   `spokenWelcome` becomes `{ text, heard, interrupted: true }`, and the prompt
   rule switches to "your welcome was cut off after '…'; answer them, then get
   across who you are and why you are calling in one short sentence — don't
   restart it, don't skip ahead".
4. Housekeeping found along the way:
   - An end of turn that Deepgram commits **before the welcome has been
     spoken** (a pickup "hello" during setup) is held, not run. Otherwise a
     turn could run next to the greeting.
   - `speakLine()` clears a stale `abortTurn`. After a barge that no turn
     followed, the no-input prompt used to be silently dropped.

### Web test call

1. `WELCOME_CUT_MS` = 1600 ms of sustained sound while the welcome plays,
   instead of 800 ms. The duck still happens, so the caller still gets the
   "I heard you" cue. A "hello" (~0.5 s) or "hello? hello?" (the gap resets the
   count) can't reach it.
2. On a real cut, `history[0]` is truncated to the heard portion using the
   `<audio>` element's `currentTime / duration`. The browser sends
   `{ type: 'welcome-heard', text, heard, interrupted }` so the server's prompt
   uses the interrupted rule.

### Not in scope (follow-ups)

- The bundled xAI / ElevenLabs engines use their provider's own VAD for
  interruptions. They are not covered here.
- The web barge timer ignores the agent's **Interruptible** toggle; only the
  phone honours it.
- The resume-after-failed-handover path pushes its line into history twice.

## Tuning knobs

| Env | Default | Effect |
|---|---|---|
| `PHONE_WELCOME_BARGE_WORDS` | 2 | real words needed to cut the welcome; raise to protect it more |
| `PHONE_WELCOME_BARGE_HOLD_MS` | 1200 | how long an energy barge waits for its words |
| `PHONE_WELCOME_REPLY_MS` | 2500 | how long a "hello" over the welcome waits before being answered |

Every decision is logged: `welcome barge held` and `welcome cut by the caller`
from the barge block, and `caller greeted over the welcome` from the harvest.

## Tests

- `services/voice/__tests__/welcomeBarge.test.js` covers the decision: the
  pickup lexicon, echo words, the hold window and the heard-portion estimate.
- `services/__tests__/welcomeInterrupted.test.js` covers the interrupted prompt
  rule.
- `ws/__tests__/welcomeBargeBridge.test.js` drives the **real** phone bridge
  with a fake carrier and a fake Deepgram:
  - "hello" doesn't cut the welcome and isn't answered straight away
  - an answer that follows it wins
  - a real interruption still cuts, and the model is told what was heard
  - "yes" over the welcome's last words is carried as before

  On the pre-fix bridge the first case fails with the welcome cut. It needs
  module mocks, so `npm run test:ws` skips it. Run it with
  `node --test --experimental-test-module-mocks src/ws/__tests__/welcomeBargeBridge.test.js`.
