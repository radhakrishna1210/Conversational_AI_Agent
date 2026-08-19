# PIOPIY (TeleCMI) Integration — second India carrier

**Companion to `PLIVO_INTEGRATION.md` and `DLT_COMPLIANCE.md`.** PIOPIY is
added *alongside* Plivo, not instead of it. Both serve India; they fail
differently, and having two means a carrier problem is a routing change rather
than an outage. (Exotel was a third India carrier here until it was removed —
see the note at the end of §1.)

Routing stays **per number** (`VoiceNumber.provider`), so adding this carrier
changes nothing for existing traffic until a number is pointed at it, and any
number can be rolled back by flipping one row.

| | Plivo | **PIOPIY** |
|---|---|---|
| Operator | Carrier partner | **TeleCMI, licensed Indian operator** |
| Call document | XML fetched from an `answer_url` | **JSON "PCMO" array, inline on the dial request** |
| Public endpoint needed | Yes (`/plivo/answer`) | **No** |
| Audio | µ-law 8k (also L16) | **L16 PCM, 8k / 16k only** |
| Resampling | None | **Both directions** |
| Per-call greeting | Yes (`<Speak>`) | **Yes (`speak` action)** |
| Broadcast | Yes | **Yes (`play` action)** |
| Webhook auth | V3 request signature | **None at all — shared token (ours)** |

---

## 1. What this carrier actually is

TeleCMI sells PIOPIY as a CPaaS: programmable voice, +91 DID/local/toll-free
inventory, SMS and OTP. Unlike Twilio it can carry Indian domestic traffic — it
is an Indian operator with its own numbering, so it sits in the India slot in
our stack, a *peer of Plivo*, not of Twilio.

> **On Exotel.** Exotel was wired here as a third India carrier and then removed
> entirely: it capped sessions at 60 minutes, dropped a call when a turn took
> over 10 seconds, could not play a broadcast recording, and never carried live
> traffic. Its provider, controller, routes, media bridge, env vars and doc are
> gone from the repo. PIOPIY is what fills that slot.

Everything below is pinned against two sources, because their public docs stop
short of the wire format in one important place (see §6):

- the published REST/webhook docs at `doc.telecmi.com/piopiy/docs/…`
- **the official Node SDK's own source**, `piopiy@1.2.0`, specifically
  `lib/action/stream.js`, `lib/action/play_stream.js`,
  `lib/action/stream_action.js` and `lib/voice/pcmo_call.js`

We do **not** depend on the SDK at runtime. It is a 136-file package that wraps
one HTTP POST, and taking it as a dependency would put the dial path behind a
vendor release cycle. `piopiy.provider.js` posts the same body directly.

---

## 2. The four structural differences (all absorbed in `piopiy.provider.js`)

**1. The document travels inline, and it is JSON.** Twilio takes TwiML inline,
Plivo fetches XML from an answer URL. PIOPIY takes a
**PCMO array** — PIOPIY Call Management Objects — in the body of the make-call
request itself:

```json
{
  "appid": "…", "secret": "…",
  "from": 912269851741, "to": 919876543210,
  "duration": 4200,
  "pcmo": [{ "action": "stream", "ws_url": "wss://…", "listen_mode": "caller" }],
  "extra_params": { "callLogId": "…" }
}
```

So `deliverDocument` is `'inline'` like Twilio, but every builder returns a JSON
**string** rather than markup. The practical consequence is the good kind: **no
public answer endpoint to serve, sign, or protect, and no per-call latency on
pickup.** One less attack surface than the Plivo path.

**2. `to` and `from` are numbers, not strings.** The API type-checks them and its
CDR echoes them back as JSON numbers. We store E.164 *with* the plus everywhere
above the carrier boundary (`assignNumberSchema` enforces `/^\+91\d{10,}$/`), so
`piopiyNumber()` converts at the boundary — the same place `plivo.provider.js`
strips its leading plus, and for the same reason: `resolveProviderIdForNumber`
matches the caller ID by exact string, so a number stored one way and dialled the
other silently routes to the wrong carrier. Anything that is not a plain phone
number returns `null`, not `NaN`, because `NaN` serializes to JSON `null` and the
carrier then blames the wrong field.

**3. The dial endpoint is chosen by the destination's country.**
`/v2/ind_pcmo_make_call` for `+91`, `/v2/global_pcmo_make_call` for everything
else, both on `https://rest.telecmi.com`. The official SDK switches on the
destination and so do we — posting an Indian destination to the global endpoint
is a routing error, not a preference.

**4. HTTP 200 is not success.** PIOPIY answers `200 OK` with its own `cmi_code`
in the body for application-level failures. Read as success, a refused call
leaves its log at `INITIATED` forever and its billing state at `PENDING`.
`placeCall` treats any `cmi_code` other than 200 as a rejection.

### Which API version this speaks, and why — v3 CANNOT run this product

We speak the **v2 appid/secret API** (`rest.telecmi.com`). This is not a
preference or a "newer version not adopted yet" — **v3 is structurally incapable
of carrying a bring-your-own-agent call**, and it is worth writing down because
v3 is the credential the dashboard pushes at you.

PIOPIY's v3 API (`rest.piopiy.com/v3`, `Authorization: Bearer <jwt>`) replaces the
PCMO array with a `pipeline`. Its own SDK enumerates exactly which actions a
pipeline may contain (`lib/voice/validators.js`, `ACTIONS`):

```
connect | play | play_get_input | param | record | hangup | input
```

Three things are missing from that list, and each one is load bearing here:

| Missing in v3 | What it costs us |
|---|---|
| **`stream`** | there is **no way to bridge call audio to our agent at all** — this is the whole integration |
| **`speak`** | no per-call text, so greeting-only calls would be impossible (v3 wants a `prompt`/`say` inside `play_get_input`) |
| **`play` by URL** | v3's `play` takes `file_name` only, not `file_url` — a broadcast would have to be uploaded to PIOPIY rather than served from our signed URL |

v3's answer to "voice AI" is `agent_id`: a **PIOPIY-hosted** AI agent identified
by UUID. That is their agent product, not a transport for ours. Our platform *is*
the agent, so v3 has nothing we can use.

The unknown noted in an earlier revision of this doc — "v3's streaming shape is
not publicly documented" — is now **resolved, negatively**: there is no streaming
shape, because there is no stream action.

**Consequence for setup:** an API token from the dashboard is *not* the
credential that dials. `PIOPIY_API_TOKEN` exists in `.env` so the value has a
home, and `status()` checks for the specific case of "v3 token present, v2
credentials absent" and says so in the error text — because left generic, that
reads as "not configured" and costs an afternoon.

---

## 3. Setup — what to do in the PIOPIY dashboard

You have a KYC-verified account already, so this is the short list.

1. **Buy the number.** Dashboard → Numbers. Buy an Indian DID/virtual number.
   Which series you buy is a compliance decision, not a technical one — read
   `DLT_COMPLIANCE.md` first if this number will carry promotional traffic.
   *This is the one step that costs money and cannot be done from code.*
2. **Create (or open) an app** and copy **App ID** and **App Secret**. They are
   issued together, per app. A secret from a different app fails exactly like a
   wrong one, so copy both from the same screen.
   ⚠️ **Not the API/Bearer token.** The dashboard also issues a v3 JWT; it cannot
   place these calls (§2). If you only have a token, go back for the app id and
   secret.
3. **Attach the number to that app.** A caller ID the app does not hold is the
   most likely first-call rejection.
4. **Register the CDR webhook** (§5): `<public backend>/api/v1/piopiy/cdr?token=…`

Then in `backend/.env`:

```bash
PIOPIY_APP_ID=…
PIOPIY_APP_SECRET=…
PIOPIY_FROM_NUMBER=+91…        # the number you just bought, E.164 with the +
PIOPIY_WEBHOOK_TOKEN=…         # any long random string; see §5
# PIOPIY_SAMPLE_RATE=8000      # 8000 | 16000 only. Default is fine.
# PIOPIY_LISTEN_MODE=caller    # never 'both' for a conversational agent — see §4
# PIOPIY_TIME_LIMIT_SEC=       # optional hard ceiling per call
```

`PUBLIC_BACKEND_WS_URL` must already be set and reachable — it is what the media
stream URL is built from, and for India it must resolve to India-hosted
infrastructure or the call fails the media-anchoring rule.

Finally, point a number at the carrier. Numbers are bound by the super-admin
compliance API, not the client UI:

```
POST /api/v1/compliance/numbers
{ "phoneNumber": "+91…", "provider": "PIOPIY", "providerNumberId": "…" }
```

Until a `VoiceNumber` row says `PIOPIY`, nothing routes here.
`TELEPHONY_PROVIDER_DEFAULT` stays `TWILIO` — India moves per number, so a
mistake in one env var cannot reroute existing traffic.

---

## 4. `listen_mode` — the one setting that will bite

`listen_mode` decides which leg of the call is streamed to us: `caller`,
`callee`, or `both`. On an **outbound** PCMO call the destination is leg A, so
`caller` is the customer — which is what PIOPIY's own outbound AI-streaming
example uses, and what we default to.

**Do not set `both` for a conversational agent.** It feeds our own synthesized
speech back into the socket, and the engines treat inbound audio as the customer
talking, so the agent interrupts itself in a loop. This is the same failure class
as the web-call self-ducking bug (`0cc8f37`), and it is much harder to recognise
over a phone line.

---

## 5. Webhooks — PIOPIY signs nothing

Plivo has a V3 request signature. Twilio has `X-Twilio-Signature`. **PIOPIY has
no signature, token or mTLS scheme of any kind** — its webhook documentation
covers URL configuration and nothing else.

So the only authentication available is a shared secret *we* put on the URL:

```
POST /api/v1/piopiy/cdr?token=<PIOPIY_WEBHOOK_TOKEN>
```

Stated plainly: **unset, this endpoint is open**, and anyone who learns a call
log id can close out a call. The handler is idempotent against double-finalizing
(a log already past `INITIATED`/`IN_PROGRESS` is left alone), so the blast radius
is a call finalized early rather than corrupted state — but **set the token**,
and register the URL in the dashboard *with* the token on it.

### Why the CDR matters even though the media bridge exists

For a two-way conversation the media socket closing is the end-of-call signal and
the CDR is belt and braces. For the two call shapes that **open no socket at
all** — greeting-only and broadcast — the CDR is the *only* signal there is:

| CDR field | Used for |
|---|---|
| `extra_params` | the per-call identity we set on the dial request — arrives as a **JSON string**, not an object |
| `status` | `answered` vs `missed`/`busy`/`failed` |
| `duration` | seconds, and the basis of the charge |
| `cmiuuid` | the carrier's own call id, recorded against the settlement |

`duration > 0` is checked alongside `status`, because a 0-second "answered" call
is a carrier artefact, not a conversation.

---

## 6. The media socket — and the one thing that is NOT documented

Mounted at `/api/v1/piopiy-media/:workspaceId/:agentId?sample-rate=8000&callLogId=…`,
bridged in `ws/piopiyMediaRealtime.handler.js`.

### Outbound (us → PIOPIY): exact, verified against the SDK

```json
{"type":"streamAudio",
 "data":{"audioDataType":"raw","sampleRate":8000,"audioData":"<base64>"}}
```

`audioDataType` accepts `raw|mp3|wav|ogg` and `sampleRate` accepts **8000 or
16000 and nothing else** — the SDK's validator rejects anything else outright,
and a rejected frame is *silent*: the call connects and the agent never speaks.
Control actions are bare objects: `{"action":"break"}` (barge-in interrupt), plus
`pause`, `resume`, `stop`.

Barge-in flushes **our** pacer before sending `break`: `break` only drops what
PIOPIY already holds, so anything still queued here would be emitted afterwards
and resurrect the sentence the customer just interrupted.

### Inbound (PIOPIY → us): **not published anywhere**

PIOPIY documents the send side and its CDR/live-event payloads, but nothing that
states what it pushes *down* this socket. Rather than guess one shape and ship a
call that connects, bills, and hears nothing, `readInboundAudio()` accepts the
plausible envelopes — `data.audioData`, `audioData`, `media.payload`,
`media.audioData`, a string `payload`/`data`, and raw binary frames — and **the
first frame of every call is logged with its key names**:

```
INFO  PIOPIY first inbound frame  { binary: false, keys: [...], nested: [...], audioBytes: 320 }
```

Keys only, never the payload — it is somebody's phone call.

**One live test call turns this from a guess into a fact.** Make the call, read
that line, and if `audioBytes` is 0 the `keys` it printed are exactly what
`readInboundAudio` needs to accept. Trim the function to the real shape once it
is known.

### Why both directions are resampled

The bundled engines emit PCM16 at **24 kHz**. PIOPIY accepts only 8 k or 16 k,
so engine audio is down-converted on the way out and caller audio is
up-converted on the way in,
using the existing `resamplePcm16` (linear interpolation). This restores nothing
— the far leg is an 8 kHz phone either way — it only keeps the rates matched,
which is what keeps pitch and speed correct. This is **inherent to the carrier,
not a misconfiguration**.

---

## 7. Capabilities and deliberate limits

| Capability | PIOPIY | Why |
|---|---|---|
| Two-way conversation | ✅ bundled engines (xAI, ElevenLabs) | `stream` action + PCM16 bridge |
| Modular STT→LLM→TTS | ❌ refused before dialling | that pipeline is µ-law end to end; PIOPIY has **no µ-law option at all**, so routing it here means µ-law→PCM→µ-law per frame both ways |
| Greeting-only calls | ✅ | PCMO has a `speak` action |
| One-way broadcast | ✅ | PCMO has a `play` action; no socket opens, so a broadcast costs the carrier minute and nothing else |
| Ambience bed | ❌ | the mixer is µ-law-only; logged once per call, not per frame |

A broadcast `repeat` is **repeated `play` actions** — PCMO has no `loop`
attribute the way Plivo's `<Play>` does — so PIOPIY re-fetches the file once per
repetition. That is why the ceiling is 5.

---

## 8. Costs — unverified, do not put in the rate card yet

`VOICE_AGENT_COST_MODEL.md` cannot be updated from public sources: **TeleCMI does
not publish per-minute voice rates.** Two things must come from your account
manager in writing before this carrier appears in any pricing:

1. **The per-minute outbound rate** for the number series you bought.
2. **The billing increment.** Per-second vs 60-second pulse changes broadcast
   COGS by more than the rate does — the same unknown flagged in
   `VOICE_BROADCAST.md`. A 20-second broadcast billed as a full minute is 3× the
   modelled cost.

Also unconfirmed: **the concurrency ceiling.** `services/telephony/concurrency.js`
is currently calibrated to Plivo India's 50-call limit, and that number is
carrier-specific. Until PIOPIY confirms theirs, the existing global ceiling
applies to PIOPIY traffic too, which is safe (it can only be too low) but may
throttle a campaign unnecessarily.

---

## 9. First-call checklist

1. Number bought, attached to the app, credentials in `.env`, backend restarted.
2. `VoiceNumber` row created with `provider: "PIOPIY"`.
3. Place one test call to your own mobile from a bundled-engine agent.
4. **Read the log for `PIOPIY first inbound frame`** (§6). This is the point of
   the test call.
5. Confirm the CDR arrived: the `AgentCallLog` should leave `INITIATED`.

Failure modes, in order of likelihood:

| Symptom | Cause |
|---|---|
| Dial rejected, mentions caller ID | number not attached to this app, or KYC not approved for the destination |
| Refused before dialling, mentions "v3 API token" | `PIOPIY_API_TOKEN` is set but `PIOPIY_APP_ID`/`PIOPIY_APP_SECRET` are not — see §2 |
| Dial rejected, 401-ish | app id and secret from different apps |
| Call connects, agent never speaks | outbound frame rejected — check `PIOPIY_SAMPLE_RATE` is 8000 or 16000 |
| Call connects, agent never *hears* | inbound envelope unrecognised — §6, read the first-frame log |
| Agent interrupts itself constantly | `PIOPIY_LISTEN_MODE=both` — §4 |
| Call runs but leaves no log | CDR webhook URL or token wrong — §5 |
