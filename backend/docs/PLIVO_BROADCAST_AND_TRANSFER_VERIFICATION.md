# Verify Plivo Bulk One-Way Calls & Human Transfer End-to-End

## Context

The ask was to figure out how one-way bulk calls and call-transfer-to-a-human are possible on Plivo, how to integrate them, and what they cost. Codebase exploration found **both features are already fully built**, not missing:

- **One-way bulk calls** = the existing **Broadcast** system (`Broadcast`/`BroadcastRecipient`/`BroadcastRecording` Prisma models, `backend/src/services/broadcast/broadcastRunner.service.js`, `broadcastCall.service.js`). It's deliberately a separate system from `Campaign` because it does the one thing a two-way AI campaign can't: dial a number, play a fixed recording (`<Play>`/`<Speak>` via Plivo's `buildBroadcastDoc()` in `backend/src/services/telephony/plivo.provider.js:210-233`), and hang up — no agent, no STT, no LLM. Billing, routes (`backend/src/routes/broadcast.routes.js`), and a UI-facing API already exist. See also `VOICE_BROADCAST.md` in this folder for the product-level writeup.
- **Transfer to a human** = the existing **announced-transfer-with-automatic-return** system (`backend/src/services/telephony/transfer.service.js`, `backend/src/services/voice/transferIntent.js`). Mid-call, the AI detects transfer intent (an LLM marker token `[[TRANSFER]]`, backed by an English/Hindi/Hinglish keyword regex fallback), announces the handover via TTS, then calls Plivo's Transfer API (`POST /v1/Account/{id}/Call/{call_uuid}/` with `aleg_url`) to redirect the live call into a `<Dial>` to the agent's configured `transferNumber`. If the human doesn't answer, the call automatically resumes into the AI bridge. This matches "cold transfer, single fixed number" — exactly what's needed here — with no new logic required.

**Decision from discussion**: don't build anything new. A single fixed `transferNumber` per agent (already how it works) is sufficient — no agent pool/round-robin needed. The only real gap is that internal docs (`backend/docs/PLIVO_INTEGRATION.md` Phase 5 table) flag the Plivo broadcast/media path as **"unverified against a live call."** So the actual next step isn't more code, it's placing real test calls and confirming both features behave correctly end-to-end, and correcting the plan (or filing a small fix) based on what that reveals.

## How each works on Plivo (mechanics)

**Broadcast (one-way):**
1. `broadcastRunner.service.js` dispatches recipients at a paced rate (`BROADCAST_DIALS_PER_MINUTE`, default 60).
2. `placeBroadcastCall()` calls Plivo's Calls API (`POST /v1/Account/{authId}/Call/`) with an `answer_url` carrying `mode=broadcast` + the recipient/recording identity in the query string (Plivo call bodies can't carry custom parameters).
3. When Plivo connects the call, it fetches that `answer_url`; `plivo.controller.js#answer()` (lines 190-213) sees `mode=broadcast`, looks up the `BroadcastRecording`, mints a signed public audio URL, and returns `<Response><Play loop="N">url</Play></Response>` — pure one-way playback, no media WebSocket ever opens.
4. Plivo's `hangup_url` callback is the only completion signal (Plivo never sends a mid-call "stop" event, unlike Twilio) — `settleBroadcastCall()` uses `CallStatus`/`Duration` to mark the recipient `answered`/`no_answer`/`failed` and updates billing.
5. **Known limitation, not a gap to fix under this plan's scope**: no Answering Machine Detection is used anywhere in the codebase, so a voicemail pickup counts as "answered" and gets billed like a real answer.

**Transfer (cold, single number):**
1. Mid-conversation, the LLM either emits `[[TRANSFER]]` or the keyword detector (`transferIntent.js`) flags high-confidence intent.
2. The AI announces the handover via TTS, then `transferLiveCall()` calls Plivo's Transfer API to redirect the live call's A-leg to a new document.
3. That document is a `<Dial timeout action method redirect="true"><Number>...</Number></Dial>` built by `buildDialDocument()`, targeting the agent's configured `transferNumber`.
4. On answer: Plivo bridges the caller directly to the human number. Per Plivo's docs this **bridges, it does not end, the original leg** — both legs stay up and billed independently while connected.
5. On failure (busy/no-answer/timeout): the `action` callback fires, `buildResumeDocument()` rebuilds the media-stream `<Connect><Stream>` document with `transferOutcome` so the call resumes into the AI bridge, which is told the handover failed and can react honestly.
6. `finalizeWholeCall()` combines agent-leg + human-leg duration (`humanLegSec` on `CallTransfer`) for billing once the whole call ends.

## Cost (Plivo India pricing, verified live via plivo.com — treat as directional, confirm before committing spend)

| Item | Rate | Applies to |
|---|---|---|
| Outbound domestic voice | ₹0.38/min | Broadcast calls (no AudioStream needed — it's just `<Play>`), and the new B-leg dialed to the human during a transfer |
| Inbound domestic voice | ₹0.38/min | The caller's original leg, if the AI call started as inbound |
| AudioStream (real-time bidirectional media) | ~₹0.85–0.95/min all-in (per this repo's own internal cost-correction note in `PLIVO_INTEGRATION.md §11` — higher than the base voice rate) | The AI-conversation portion of any call, *before* a transfer happens. **Broadcast never uses this**, which is why broadcast calls are meaningfully cheaper per-minute than a live AI conversation |
| Phone number rental | ₹200/month per number | Any dedicated outbound/inbound number used for broadcasts or transfers |
| Answering Machine Detection | Free (if enabled) | Not currently used — flagged above as a known gap, not in scope here |
| Call recording | Free | N/A for broadcast (nothing to record); applies to the AI-conversation leg as already used |
| Call transcription | ₹0.81/min | Only relevant if transcription is turned on for a leg |

**Transfer-specific cost note**: because `<Dial>` bridges rather than replaces the original leg, a transfer likely means paying for **two concurrent legs** for the duration of the bridge — the original leg (billed at whatever rate applied to it) plus the new outbound leg to the human (₹0.38/min). Plivo's own documentation doesn't explicitly confirm concurrent-leg billing, so this should be confirmed against actual Plivo CDRs/invoices during the live test below, not assumed.

## Verification plan (the actual next step — no new code)

**Broadcast:**
1. Create one `BroadcastRecording` (upload a short test audio file or synthesize via the existing TTS path) through the existing routes in `broadcast.routes.js`.
2. Create a `Broadcast` with 1-2 real, reachable test phone numbers (e.g., team members' own phones) as recipients, using a Plivo-provisioned number already set up in this workspace.
3. `start`/`launch` it, then confirm:
   - The call is actually placed (check Plivo's console/CDR for the call).
   - On answer, the correct recording plays at correct volume/quality, honors `repeat`/loop count, then hangs up cleanly (no dead air, no premature cutoff).
   - The `hangup_url` callback arrives and `settleBroadcastCall()` correctly updates `BroadcastRecipient.status` and `Broadcast.progress`/`answered`/`failed` counts.
   - Billing fields (`billingStatus`, `billedCents`, `ratePerMinuteCents`) populate correctly on the recipient row.
   - Deliberately test a no-answer and a busy/rejected case, confirm status lands correctly (`no_answer`/`failed`), not just the happy path.
   - Note (don't need to fix): if a call goes to voicemail and it picks up, confirm today's actual behavior — is it billed as "answered"? This confirms the known AMD gap in practice rather than just in theory.

**Transfer:**
1. Configure a test Agent's `settings.transferNumber` to a real, reachable test number; set `transferMode: 'announce'`, a reasonable `transferTimeoutSec`, and (if testing out-of-hours behavior matters) a narrow `transferHours` window.
2. Place a real inbound or outbound test call to that agent through Plivo.
3. Say something during the call designed to trigger transfer intent — both a phrasing that should hit the keyword/regex detector and, separately, a scenario that should make the LLM emit the `[[TRANSFER]]` marker — confirm both paths actually fire.
4. Confirm: the AI announces the handover via TTS, the human number actually rings, and on answer the caller and human are bridged with the AI's media stream cleanly exiting (true cold transfer — no AI relay after the announcement).
5. Confirm the failure path separately: let the transfer target go unanswered/busy, confirm the call resumes into the AI bridge with `transferOutcome` set, and the AI reacts appropriately instead of silently dropping the caller.
6. Check the `CallTransfer` row's status transitions (`REQUESTED → DIALING → CONNECTED` or `NO_ANSWER`/`BUSY`/`FAILED`) match what actually happened, and that `humanLegSec` is populated correctly once the call ends.
7. Pull the actual Plivo CDR/invoice line items for this test call to settle the "two concurrent legs" cost question above with real numbers instead of an assumption.

## Explicitly out of scope (per this discussion, not because they're hard)

- Transfer to a pool/round-robin of human agents — single fixed number confirmed sufficient for now.
- Warm/attended transfer (context relay to the human before connecting) — only announced cold transfer is needed.
- Answering Machine Detection for broadcasts — noted as a known limitation, not being closed here.
- Any UI/dashboard-triggered manual transfer (today it's caller-request-driven only, via AI intent detection) — not requested.

## Verification

Success criteria for this plan is entirely the live-test checklist above: both features observed working end-to-end on real Plivo calls (happy path + at least one failure path each), with actual cost confirmed against a real Plivo CDR rather than the rate-card estimate above.
