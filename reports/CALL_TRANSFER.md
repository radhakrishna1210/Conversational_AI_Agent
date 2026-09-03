# Live human call transfer — design, implementation, failure matrix, evidence

**Branch:** `release/readiness-audit` · **Date:** 2026-09-04 · **Evidence:** `reports/evidence/2026-09-03_phase2/`

## 1. Finding, confirmed

The request (§4) said transfer existed only as prompt text. Verified by reading the code before changing anything:

- `agentRuntime.service.js:425–428` injected: *"let them know warmly that you'll connect them to a team member and are transferring them now."*
- `transferNumber` / `transferCondition` were packed into `Agent.settings` by `agent.controller.js:47` with no validation.
- `git grep -i transfer backend/src` (evidence `00_*`): no `<Dial>`, no SIP REFER, no Twilio call update, no Plivo Transfer API, nothing in `modularMediaBridge.js` or the telephony providers.

So the agent told callers it was transferring them and kept talking. **P1, correctness and trust.** Fixed on this branch; the honest failure path is the larger part of the fix.

## 2. Design

### 2.1 Intent — two signals, combined

| Signal | Where | Role |
|---|---|---|
| Regex pre-filter | `services/voice/transferIntent.js` `detectTransferRequest()` | English, Hindi (Devanagari), Hinglish. HIGH = explicit, unnegated request in the clause; MEDIUM = a human-word or action-word alone (informative only). Negation and reported speech are judged on the clause that carries the request, so *"kisi se baat karao, mujhe samajh nahi aa rahi"* fires and *"my manager told me to book"* does not. |
| Model marker | prompt section `transferPromptSection()`; scanner `createTransferMarkerScanner()` | The model begins its reply with the exact token `[[TRANSFER]]` when it decides the handover should happen (caller asks in any wording, or the configured `transferCondition` is met). The streaming scanner strips the token in every fragmentation (`[[`, `TRANS`, `FER]]`) **before** it reaches the reply filter or TTS; a mid-reply marker is also caught. |

The marker is authoritative; a HIGH pre-filter match is honoured on its own so a model that forgets the protocol cannot strand a caller who plainly asked. MEDIUM never triggers.

Why a marker token rather than a provider tool call: four provider SDKs (Gemini, Groq, OpenAI, Azure) stream tokens straight into TTS, plus a speculative path that starts requests before the turn commits and must cancel them. A tool-call round trip would need implementing and cancelling correctly in each; the decision is one bit and arrives with the first delta at zero extra latency through the single text path every provider already exercises.

### 2.2 Carrier mechanism — announced transfer with automatic return

Both carriers run the conversation as a bidirectional media stream. Nothing can be dialled from inside it; the live call is **redirected** by REST to a document that dials the human:

| Carrier | Redirect | Document | Outcome callback | Resume document |
|---|---|---|---|---|
| Twilio | `POST /2010-04-01/Accounts/{sid}/Calls/{CallSid}.json` `Twiml=…&StatusCallback=…` | `<Response><Dial timeout callerId action method="POST"><Number>+E164</Number></Dial></Response>` | `POST /api/v1/telephony/transfer/twilio/dial` (`DialCallStatus`, `DialCallDuration`); `/status` (call-level) | `<Connect><Stream url=…><Parameter name="callLogId"/><Parameter name="transferOutcome"/></Stream></Connect>` |
| Plivo | `POST /v1/Account/{auth}/Call/{uuid}/` `{legs:'aleg', aleg_url, aleg_method:'POST'}` | served by `/api/v1/telephony/transfer/plivo/xml`: `<Dial timeout callerId action redirect="true"><Number>` | `/plivo/dial` (`DialStatus`, `DialBLegDuration`) | `<Stream bidirectional keepCallAlive>wss://…?callLogId&transferOutcome</Stream>` |
| PIOPIY | **unsupported** — no live-call redirect for a PCMO stream call; the modular bridge does not run on it | — | — | prompt tells the caller honestly; `CallTransfer.status = UNAVAILABLE` |
| Web (browser) | **no phone leg** | — | — | prompt offers name + number for a callback; `CallTransfer.status = WEB_CALLBACK` |

Sequence on a phone call: the model's own sentence ("Sure, connecting you to a team member now") is spoken through the normal pipeline → `waitForPlayoutDrain()` → `transferLiveCall()` → carrier tears the media socket down and rings the human → `cleanup()` sees `transferPending` and leaves the call log **open** (transcript persisted, nothing settled) → the `<Dial>` ends → callback finalises (success) or reconnects the agent (failure) with `transferOutcome`, and the resumed bridge skips the greeting, reloads the transcript, and speaks `failureLineFor(outcome)`.

**Why not a true attended transfer or a conference.** Both carriers can, but only by holding the agent leg in a conference room to brief the human — a second media path the bridge would have to mix and leave at the right moment. The announced-with-return shape gives the caller the same experience on the happy path and a strictly better one on every failure path, with one document and one callback per carrier. The setting is `transferMode` (`announce` default, `immediate`) so an attended variant can be added without a rename.

### 2.3 Money, logging, recording

- **Billing.** The call log is finalised only once the whole call has ended: Twilio via the `/status` callback or the `/dial` `completed` outcome; Plivo via its existing `hangup_url` (which already computes `startedAt = now − Duration`) or `/dial` completed. `settleCall()` therefore charges **both legs** at the workspace rate. On a failed handover the resumed bridge finalises as usual. Carrier COGS for the human leg is not captured (A-13, unchanged).
- **Logging.** New table `CallTransfer` (migration `20260904000000_call_transfer`): channel, carrier, carrierCallId, target, mode, source (`marker`|`regex`), reason (caller's words), status `REQUESTED → DIALING → CONNECTED | NO_ANSWER | BUSY | FAILED | CANCELED | REJECTED | UNAVAILABLE | WEB_CALLBACK`, error, timestamps, `humanLegSec`. Also a `system` line in the transcript and `transfer: marker|regex` on the latency record.
- **Recording.** The agent leg's recording is saved at socket close (`recording.save`) exactly as before; the human leg is **not** recorded (the bridge is not on it). Consent language for the human leg is a product decision — flagged in OPEN_ISSUES.
- **Compliance.** The `<Dial>` uses the call's own number as caller id (looked up from the carrier when the start event lacks it), so no new outbound identity is presented; DLT rules apply to campaign dialling and are untouched.
- **Security.** Every callback URL carries an HMAC of the call log id (`signTransferToken`, secret `TRANSFER_CALLBACK_SECRET` or `JWT_ACCESS_SECRET`); a bad token gets `<Hangup/>` and no state change (tested).

### 2.4 Configuration and UI

Settings (validated by `validators/agentSettings.validator.js`, tests in `validators/__tests__`): `transferNumber` (E.164, normalised), `transferLabel`, `transferCondition`, `transferMode` (`announce|immediate`), `transferTimeoutSec` (5–60), `transferHours` (`{enabled,start,end,days,timezone}`), `transferOutOfHours` (`callback|attempt|decline`). `EditAgent.tsx` "Transfer & Routing" section exposes all of them with a one-paragraph statement of what actually happens, and `GET …/response-profile` returns `transfer.{configured,number,mode,timeoutSec,outOfHours,hours,carriers}`.

## 3. Failure matrix

| Situation | Detection | Caller hears | Records |
|---|---|---|---|
| No number configured / invalid | `transferAvailability` → unavailable | prompt variant: honest "I can't connect you on this call", offers message/callback | `UNAVAILABLE` |
| Web call | channel ≠ phone | same honest line + callback offer | `WEB_CALLBACK` |
| PIOPIY | carrier unsupported | same | `UNAVAILABLE` |
| Outside transfer hours, `callback`/`decline` | `isWithinTransferHours` | honest line (callback / decline wording via prompt) | `UNAVAILABLE` (reason "outside transfer hours") |
| Outside hours, `attempt` | — | announced, dialled anyway | normal path |
| Carrier call id unknown | bridge | "the handover didn't go through… message or callback?" | `REJECTED` |
| Carrier refuses redirect (4xx/5xx, network) | `transferLiveCall` `ok:false` | same, spoken by `speakLine` | `REJECTED` + error text |
| Human busy | `DialCallStatus/DialStatus = busy` | agent resumes: "…line is busy right now. Message or callback?" | `BUSY` |
| No answer / ring timeout | `no-answer` / `timeout` | "…couldn't reach X just now. Take your number and a message?" | `NO_ANSWER` |
| Number fails / invalid at carrier | `failed` | "…didn't go through…" | `FAILED` |
| Caller hangs up while ringing | `canceled` (and no resume socket) | — | `CANCELED`; Plivo hangup / Twilio status finalises the log |
| Human answers, talks, hangs up | `completed` + duration | `<Hangup/>` | `CONNECTED`, `humanLegSec`; log finalised with both legs |
| Resume document cannot be built (no public URL) | controller | call ends cleanly (`<Hangup/>`), logged as error | log finalised |
| Callback forged / wrong token | HMAC | `<Hangup/>` 403 | nothing changes |

The agent never says a transfer succeeded: the only success wording is the `[[TRANSFER]]` announcement ("connecting you now"), and every failure returns to the caller as words.

## 4. Tests and evidence

| Suite | Tests | Result |
|---|---|---|
| `voice/__tests__/transferIntent.test.js` | 11 (positive EN/HI/Hinglish, negatives, marker scanner fragmentation, prompt variants) | pass |
| `telephony/__tests__/transfer.service.test.js` | 17 (E.164, config defaults/clamps, hours incl. overnight, availability by carrier/channel/hours, signed URLs, Twilio/Plivo documents, outcome parsing, failure lines, REST bodies with fake fetch, refusals) | pass |
| `ws/__tests__/transferCallbacks.test.js` | 9 (HTTP-level: bad token, completed → hangup + CONNECTED, every failure → resume doc with outcome, Plivo xml from registry, no-pending → hangup, already-settled idempotence) | pass |
| `validators/__tests__/agentSettings.validator.test.js` | 4 | pass |
| Full backend `npm test` | 1074 tests, 1016 pass, 57 skipped (DB suites), 1 pre-existing fixture updated | `05_npm_test_all_features.log` |

**Live carrier evidence: BLOCKED.** No phone number owned by the tester, no approval to place paid calls, and this machine's public URL is a dev tunnel (disqualified as evidence by the repository's own rule). Unblock: a Twilio or Plivo number on the Mumbai VPS + a human on the target number; then one call each of: answer, busy, no-answer, invalid number, caller hangs up while ringing, with `CallTransfer` rows and the two `latency.log` records as evidence.

## 5. Not done / open

- Attended (warm-with-briefing) transfer and three-party conference: not implemented (see §2.2 for why).
- Human-leg recording and consent wording: product decision.
- A `transferCondition` written as free text is honoured through the model (prompt), not evaluated mechanically.
- "Repeated failure to answer" and "explicit frustration" as triggers: the affect classifier already exists (`classifyCallerAffect`), but wiring it as a trigger was not done — the owner has not said they want it.
