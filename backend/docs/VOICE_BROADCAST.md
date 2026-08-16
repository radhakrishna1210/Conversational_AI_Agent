# Voice Broadcast (one-way)

> Built 2026-08-16. A broadcast dials the **same contacts and clusters** bulk calling
> dials, plays **one recording**, and hangs up. Nobody can reply. That single
> difference is what makes it a different product commercially: it costs a carrier
> minute and nothing else.

---

## 1. What it is, in one paragraph

Pick (or record) an audio message. Pick the contact lists — the same
`ContactCluster` rows a bulk campaign uses. Pick the caller IDs. The dispatcher
walks the list, and for each person it asks the carrier to dial them and play the
file. There is no agent, no speech recognition, no language model, no per-call
speech synthesis, and no media socket. The carrier fetches one static file from
us and plays it.

**Sidebar:** Operations & Monitoring → **Voice Broadcast**, directly under Bulk Call.

---

## 2. The cost question, answered

> *"Only telecom charges will be applied for those, right?"*

**Essentially yes.** Per call, a broadcast is a carrier minute. Everything that
makes a conversational call expensive is absent, and the one non-telecom cost is
paid **once per recording**, not once per call.

### 2.1 What a conversational call pays for, and a broadcast does not

| Cost line | Conversational call | Broadcast | Why |
|---|---|---|---|
| Carrier minutes | ✅ | ✅ | the only thing both pay |
| Twilio Media Streams (₹0.38–0.42/min) | ✅ | **₹0** | no media socket is ever opened |
| STT (Deepgram/Scribe, ~₹0.62–0.74/min) | ✅ | **₹0** | nobody is listening to the caller |
| LLM tokens (~₹0.5–1.5/min) | ✅ | **₹0** | there is nothing to think about |
| TTS (₹0.67–4.32/min) | ✅ | **once, ever** | the audio was rendered weeks ago |
| Post-call extraction (Gemini) | ✅ | **₹0** | there is no transcript |
| **Total COGS/min** | **₹2.50 – ₹5.50** | **₹0.60 flat** | |

**₹0.60/min is the whole broadcast COGS.** It is not a range: the Plivo India
local rate is a flat per-minute price, and every other line above is zero. An
earlier draft of this doc quoted "₹0.60–1.10" by folding the ₹250/month number
rental into the per-minute figure. That was wrong twice over — a fixed monthly
cost is not a rate, and the number in question is the *same* one the
conversational product already rents, so charging its rental against broadcast
minutes counts it twice. Number rental is listed separately in §2.2 and belongs
in a fixed-cost line, not in the marginal cost of a call.

Rates carried over from `VOICE_AGENT_COST_MODEL.md` §4 (verified 2026-08-06).

### 2.2 The whole cost of one 30-second broadcast call (India, Plivo)

| Line | Amount | Notes |
|---|---|---|
| Plivo → India local, 30s @ ₹0.60/min | **₹0.30** | ⚠️ see the billing-increment warning below |
| Audio streaming / AudioStream | ₹0.00 | not used at all — `<Play>`, not a socket |
| Bandwidth serving the file | ~₹0.001 | 30s @ 32kbps MP3 ≈ 120 KB, and carriers cache it |
| STT + LLM + TTS | ₹0.00 | — |
| **Per answered call** | **≈ ₹0.30** | |
| Unanswered dial | **₹0.00** | the carrier does not bill it, so neither do we |

**Fixed costs — deliberately NOT folded into the per-minute figure:**

| Line | Amount | Whose cost is it |
|---|---|---|
| One TTS render of the script (300 chars) | ₹0.14 – ₹0.50 | this recording, once — spread over every call it is ever used for |
| Plivo India number rental | ₹250 / month | **the number, not the broadcast.** The workspace rents it for its conversational calls anyway; a broadcast placed from it adds no rental. Amortising it into a broadcast ₹/min charges the same ₹250 twice. |

At 10,000 dials with a 35% pickup rate, that is 3,500 answered calls ≈ 1,750
minutes ≈ **₹1,050 of carrier cost** for the entire send, plus one ₹0.45 render.
Nothing else.

### 2.3 ⚠️ The one number that could double this: the billing increment

Our wallet bills **per second** (`BILLING_INCREMENT_SEC=1`). Carriers frequently
do not — Indian voice termination is commonly sold in **30-second or 60-second
pulses**. If Plivo bills our account in 60s pulses, a 30-second broadcast costs
us **₹0.60, not ₹0.30**, and the COGS in §2.2 doubles.

**This is not verified against a live Plivo invoice.** It is the single largest
unknown in broadcast unit economics, and it has a product consequence:

> If we are paying for a full minute anyway, a **50-second message costs the same
> as a 20-second one**. Either confirm per-second billing, or tell customers to
> use the whole pulse.

**Action:** check one real invoice after the first live broadcast and replace this
section with the measured figure.

### 2.4 Carrier choice matters even more here than on conversational calls

| Route | Per minute | Per 30s call |
|---|---|---|
| **Plivo → India local** ✅ verified | **₹0.60** | ₹0.30 |
| Exotel (indicative) | ~₹0.90 | ~₹0.45 — **but Exotel cannot broadcast, see §5** |
| **Twilio → India mobile** ✅ verified | **₹4.76** | ₹2.38 |
| Twilio outbound (US) | ₹1.34 | ₹0.67 |

Twilio is **~8× Plivo** on Indian traffic. On a broadcast the ratio bites harder
than it does on a conversation, because telephony is no longer 12% of the bill —
**it is ~100% of it**.

### 2.5 What we charge

A separate platform rate: **`__broadcast_rate__`, seeded at ₹3.00/min**, editable
in Super Admin (`PUT /admin/broadcast-rate`), independent of the conversational
wallet rate. See `services/billing/broadcastRate.js`.

| | Rate | 30s call | COGS @ ₹0.60/min | Margin |
|---|---|---|---|---|
| Broadcast @ ₹3.00/min | ₹3.00 | **₹1.50** | ₹0.30 | **80%** |
| *same, if the carrier bills 60s pulses* | ₹3.00 | ₹1.50 | ₹0.60 | 60% |
| *If billed at the conversational ₹11.52/min* | ₹11.52 | ₹5.76 | ₹0.30 | 95% — and uncompetitive |

The only thing that moves the middle column is the **billing increment** (§2.3) —
how much duration the carrier rounds a 30-second call up to. The *rate* is ₹0.60
either way.

Charging a broadcast at the conversational rate is not a margin, it is a reason
to lose the deal: bulk OBD in India is bought on price, per call, against
competitors quoting well under ₹1. ₹3.00/min is a defensible starting point with
room to move down at volume.

**Packaging note (not built):** this market usually buys *per answered call*, not
per minute. The per-minute rate is what the billing engine already understands,
and one rate is one thing to get wrong; a per-call price is a thin layer on top
of it if sales ever needs it.

### 2.6 What is NOT modelled

- **DND / NDNC scrubbing.** No free API exists in India; it is a procurement
  decision with lead time (see `DIALING_HYGIENE_PLAN.md`). Broadcasts to
  unscrubbed lists are the highest-complaint traffic this platform can send.
- **Number rental** still has no home in the pricing model — same gap as the
  conversational product.
- **Per-attempt charges.** Some Indian OBD routes bill unanswered attempts. Plivo
  does not; if a route ever does, `settleBroadcastCall` needs a second branch.

---

## 3. How it works

```
Recording ──┐
            │  (once)  upload MP3/WAV, record in browser (→ 8kHz mono WAV),
            │          or synthesise a script through the agent voices
            ▼
        BroadcastRecording ── served at /api/v1/broadcast-audio/:id?token=HMAC
            │
Clusters ───┼──► Broadcast ──► BroadcastRecipient rows (the frozen list)
            │                        │
            ▼                        ▼
      broadcastRunner ─── per dial ──┴─► carrier: "call this number, play that URL"
                                              │
                                    (async)   ▼
                          Twilio  POST /broadcast/twilio/status?rid=…&token=…
                          Plivo   POST /plivo/hangup?broadcastRecipientId=…
                                              │
                                              ▼
                                    settleBroadcastCall → wallet ledger
```

### Files

| Path | Role |
|---|---|
| `services/broadcast/broadcastRecording.service.js` | audio in (upload/TTS), audio out (signed URL) |
| `services/broadcast/audioDuration.js` | WAV + MP3 duration from the bytes — everything is priced on this |
| `services/broadcast/broadcastCall.service.js` | place one one-way call |
| `services/broadcast/broadcastRunner.service.js` | the dispatcher |
| `services/broadcast/broadcastSettlement.service.js` | the gate and the charge |
| `services/broadcast/signedToken.js` | HMAC capability tokens for the two public endpoints |
| `services/billing/broadcastRate.js` | the platform ₹/min |
| `controllers/broadcast.controller.js` | HTTP surface, including the carrier callbacks |
| `client/src/pages/Broadcast.tsx` + `components/broadcast/*` | the console |

### Data model

Three new tables, **strictly additive** (migration `20260816120000_voice_broadcast`):
`BroadcastRecording`, `Broadcast`, `BroadcastRecipient`. Nothing on `Campaign`,
`Contact` or `AgentCallLog` changed — a broadcast has no agent, so it could not
have used `AgentCallLog` without making `agentId` nullable on the hottest table in
the billing path.

---

## 4. The properties that were not optional

Carried over from the campaign dispatcher, for the same reasons:

- **Resumable from row state.** Progress lives in `BroadcastRecipient`, never in a
  counter. A crash or a deploy mid-send continues from pending rows; the unique
  index on `(broadcastId, phoneNumber)` means it cannot re-dial anyone.
- **Opt-outs honoured mid-flight**, re-checked once per batch. Someone who opts
  out on call 300 is not dialled at 3,000.
- **DLT gate before the first dial**, re-checked per batch.
- **Caller-ID rotation**, so one number does not absorb the whole send's spam
  scoring.
- **The wallet is the pacer.** Each dial is gated on one call's worth of balance;
  running out **pauses** the broadcast rather than failing every remaining row.

New here, because the outcome is asynchronous:

- **A dial does not end at "sent."** It ends at `calling`, and the carrier's
  webhook resolves it to `answered` / `no_answer` and charges it. Claiming
  success at dispatch would report every send as delivered and bill nothing.
- **`reapStalledDials`** closes rows whose webhook never arrived (15 min),
  unbilled — the duration is unknown and charging a guess is worse than not
  charging.
- **Scheduled sends are re-armed at boot** (`sweepDueBroadcasts`), so a deploy
  between scheduling and the fire time does not silently drop the send.

---

## 5. Carrier support

| Carrier | Broadcast? | Why |
|---|---|---|
| **Plivo** | ✅ | answer URL returns `<Play loop="n">` |
| **Twilio** | ✅ | inline TwiML `<Play loop="n">`, `StatusCallback` for the outcome |
| **Exotel** | ❌ | no per-call document at all. Its audio lives in a dashboard applet, so a broadcast would play whatever that flow contains — not the recording the customer chose. The wizard refuses the number and says so. |

Both supported carriers accept **MP3 and PCM WAV only**. Browser recordings
(WebM/Opus, MP4/AAC) are converted to 8 kHz mono WAV **in the browser** before
upload — a phone call *is* 8 kHz mono, so nothing is lost and the file is ~20×
smaller.

---

## 6. Compliance (India)

A pre-recorded promotional voice call is the most heavily regulated thing this
platform can send. The existing DLT gate applies unchanged, and:

- **140 / 1600 series** caller IDs for promotional and transactional traffic
  respectively — enforced by `WorkspaceCompliance` / `VoiceNumber.series`.
- **DLT header + template registration.** The recording's script should match a
  registered template. *Not enforced in code yet* — the `DltVoiceTemplate` link
  exists on `Agent`, not on `BroadcastRecording`. Worth closing before volume.
- **9am–9pm calling window.** The wizard says so; it is not enforced.
  `services/compliance/callWindow.js` exists (written, unimported) and is the
  natural place to enforce it — see `DIALING_HYGIENE_PLAN.md` Phase 0.
- **TCCCPR: 5 complaints in 10 days** attaches to the *entity*, not the number.
  Rotating caller IDs does nothing for that exposure. Consent quality is the only
  control that changes the outcome.

---

## 7. Configuration

| Variable | Default | What it does |
|---|---|---|
| `PUBLIC_BACKEND_WS_URL` / `PUBLIC_BACKEND_URL` | — | **Required.** Without a public address the carrier has nowhere to fetch the audio, and every call connects to silence. Checked before a broadcast starts. |
| `BROADCAST_AUDIO_SECRET` | `JWT_ACCESS_SECRET` | signs the audio + status URLs |
| `BROADCAST_DIALS_PER_MINUTE` | `60` | the pacer |
| `BROADCAST_RING_TIMEOUT_SEC` | `30` | stop ringing numbers nobody will answer |
| `BROADCAST_STALLED_DIAL_MS` | `900000` | when a missing webhook is presumed lost |
| `BROADCAST_BATCH_SIZE` | `50` | rows per dispatch batch |

---

## 8. Known gaps

1. **Billing increment unverified** (§2.3) — the top item.
2. **No answering-machine detection.** A voicemail that picks up is billed as an
   answered call, by us and by the carrier. Plivo and Twilio both sell AMD; it
   costs extra and adds ~2–4s of dead air before the message, which is its own
   drop-off. Worth measuring before buying.
3. **No retry pass** for `no_answer`. The rows are there and statuses are honest,
   so this is a query and a button, not a redesign.
4. **No DLT template link** on recordings (§6).
5. **Broadcasts do not appear in Call Logs.** They are not `AgentCallLog` rows;
   the delivery report is on the broadcast's own detail view.
