# Bug Sheet

Running log of known bugs. Add new bugs at the top of the table, then fill in a
detail section below using the same ID.

| ID | Area | Summary | Severity | Status | Reported |
|----|------|---------|----------|--------|----------|
| BUG-003 | Voice / Realism | No background ambience (office noise) on conversational calls — agent audio sounds unnaturally clean/robotic | Medium | Open | 2026-07-29 |
| BUG-002 | Billing / Platform | Wallet and subscription-based plans are not integrated end-to-end — no payment gateway, no usage deduction, no plan enforcement | High | Open | 2026-07-29 |
| BUG-001 | Voice / Web call | Agent reacts to silence: shows "responding" and/or logs a user message the caller never said | High | Open | 2026-07-29 |

---

## BUG-001 — Agent responds to silence / phantom user transcript

**Area:** Voice runtime — web call (modular realtime pipeline)
**Severity:** High — breaks the conversation flow and pollutes the call transcript
**Status:** Open (not investigated, not fixed)
**Reported:** 2026-07-29

### What happens

During a conversation, when the caller says **nothing at all**, one of two wrong
things happens:

1. The UI flips to the **"responding" / speaking state** even though no user
   speech was sent — the agent starts a turn on its own.
2. A **user message appears in the conversation that the caller never said** —
   the transcript shows words that were not spoken, and the agent answers them.

Both happen intermittently, not on every silent gap.

### Steps to reproduce

1. Start a web call with an agent.
2. After the greeting, stay completely silent for 5–15 seconds. Do not speak.
3. Observe the call UI state and the live/post-call transcript.

**Expected:** agent stays idle/listening. No user turn is created. No agent turn
is triggered. Transcript stays empty for that period.

**Actual:** agent enters the responding state and/or a fabricated user utterance
is added to the transcript and answered.

### Observed variations (to confirm during triage)

- Happens more often with background noise / open mic in a noisy room.
- Sometimes the phantom text looks like filler words or a fragment of the
  agent's own previous sentence (possible echo of agent audio back into the mic).
- Sometimes the state flips with no text at all — UI says responding, then
  settles back with nothing produced.

### Impact

- Agent interrupts the caller or talks over dead air.
- Post-call transcript and any extraction built from it (summary, fields,
  delivery payloads) contain content the caller never said.
- Wasted STT/LLM/TTS spend on turns that should never have started.

### Suspected areas (unverified — for whoever picks this up)

- Client mic VAD / RMS threshold firing on ambient noise
  (`client/src/services/modularCallSocket.ts`).
- Deepgram endpointing / `speech_final` / `UtteranceEnd` handling emitting an
  empty or noise-derived final
  (`backend/src/services/stt/deepgramStream.service.js`).
- Turn-start logic in `backend/src/ws/webCallModularRealtime.handler.js` not
  guarding against empty / whitespace-only transcripts before starting a turn.
- Agent audio echoing into the mic (no echo cancellation / no mic gating while
  the agent is speaking).

### Notes

- Reported after the low-latency streaming pipeline work (`b968d71`).
- No fix attempted yet — logged only.

---

## BUG-003 — No background ambience (office noise) on conversational calls

**Area:** Voice runtime — outbound/inbound calls and web calls
**Severity:** Medium — affects call realism and answer/engagement rates, not function
**Status:** Open (not investigated, not implemented)
**Reported:** 2026-07-29

### What happens

Agent audio is delivered on a completely silent background. Between words and
during pauses there is pure digital silence, which sounds obviously synthetic —
a real person calling from an office always has faint ambience behind them.
Callers pick up on the dead-silent background and identify the call as a bot
sooner.

### What is needed

A configurable background ambience bed mixed under the agent's TTS output for
the duration of the call:

- A small library of ambience tracks — **office / call-centre** (keyboard, muted
  chatter, phones), plus options like quiet room, café, outdoor.
- **Off by default**, selectable per agent, with an **intensity/volume control**
  (very low gain — it must sit under speech, not compete with it).
- Continuous loop for the whole call, seamless (no audible loop seam), **not**
  gated to only play while the agent is speaking — ambience must continue during
  silence, which is the whole point.

### Current state

No ambient/background audio support exists anywhere in the voice layer — no
mixing stage, no asset library, no config field. Confirmed absent across
`backend/src/services/voice/`.

### Things to work out during implementation (unverified)

- **Where to mix.** Server-side into the outgoing audio stream (works for
  telephony too) vs client-side playback layer (simpler, but web-call only).
  Telephony calls need the server-side path.
- **Interaction with BUG-001.** Ambience must not leak into the mic path or feed
  the STT/VAD — that would make the phantom-transcript problem worse. Mix it
  strictly into the outbound leg.
- **Codec/format.** Must match the pipeline sample rate and encoding; needs
  resampling for the telephony path.
- **Barge-in.** Confirm ambience does not interfere with interrupt detection.
- **Latency/CPU cost.** Mixing adds per-frame work to a pipeline that was just
  tuned for low latency (`b968d71`).
- **Licensing.** Ambience assets must be royalty-free / cleared for commercial use.
- **Disclosure.** Check whether making a bot sound more human conflicts with any
  regional AI-disclosure requirements for the markets in use.

### Notes

- Feature gap, not a regression — this was never built.
- Requested for conversational-call realism (parity with what OmniDimension and
  similar products do).
- No implementation attempted yet — logged only.

---

## BUG-002 — Wallet & subscription plans not integrated

**Area:** Billing / Platform (`Billing.tsx`, `Pricing.tsx`, `platform.controller.js`)
**Severity:** High — the product cannot actually charge or limit anyone
**Status:** Open (not investigated, not fixed)
**Reported:** 2026-07-29

### What happens

The wallet and subscription-plan feature exists only as scaffolding. The data
model and the read-only screens are there, but nothing connects them to real
money or to real usage, so plans are effectively decorative.

### Current state (what already exists)

- Schema: `Wallet`, `WalletTransaction`, `Plan`, `Invoice` models plus
  `planName` fields on workspace/user (`backend/prisma/schema.prisma`).
- API: `GET /wallet` returns balance + last 50 transactions
  (`backend/src/controllers/platform.controller.js`).
- Admin-only manual credit endpoint (`type: 'admin_credit'`) — the only way a
  balance ever changes today.
- UI: Balance & Plans screen (`client/src/pages/Billing.tsx`) and public pricing
  page (`client/src/pages/Pricing.tsx`).

### What is missing

1. **No payment gateway.** `topUpAvailable` is hard-coded `false`; the UI shows
   "Online payments are not configured yet." No UPI / Stripe / Razorpay
   integration, no checkout, no webhook handler, no payment verification.
2. **No usage deduction.** Calls, STT/LLM/TTS spend, and minutes are never
   debited from the wallet. Balance only moves via manual admin credit, so the
   "~ N minutes left" figure on the Billing page is an estimate against a
   balance that never decreases with use.
3. **No subscription lifecycle.** `Plan` / `planName` is a static string. There
   is no subscribe, upgrade, downgrade, renewal, proration, or cancellation
   flow, and no billing period tracking.
4. **No plan enforcement.** Nothing gates features, concurrency, agent count, or
   minutes by plan. A Free workspace has the same access as any paid tier.
5. **No low-balance / zero-balance handling.** Calls are not blocked when the
   balance hits zero, and there are no warnings, alerts, or auto top-up.
6. **No invoicing.** The `Invoice` model is unused — nothing generates, stores,
   or emails invoices or receipts.

### Impact

- Cannot monetize: no customer can self-serve a payment or a subscription.
- Unlimited free usage — every call burns real provider spend with no revenue
  and no cap.
- Billing screens shows numbers that do not reflect actual consumption, which is
  misleading if shown to customers.

### Notes

- This is a missing-integration bug, not a regression — the feature was never
  wired up.
- Per-minute rates for any metering work should come from
  `backend/docs/VOICE_AGENT_PRICE_PER_MINUTE.md` and the COGS model in
  `backend/docs/VOICE_AGENT_COST_MODEL.md`.
- No fix attempted yet — logged only.
