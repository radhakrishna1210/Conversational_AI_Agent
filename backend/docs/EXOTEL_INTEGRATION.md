# Exotel Integration — second India carrier

**Companion to `PLIVO_INTEGRATION.md` and `DLT_COMPLIANCE.md`.** Exotel is added
*alongside* Plivo, not instead of it. Both serve India; they fail differently,
and having both means a carrier problem is a routing change rather than an outage.

| | Plivo | Exotel |
|---|---|---|
| Signup | Self-serve, but gated on an India-region org | Self-serve trial: ₹1000 credits, 15 days, no card |
| Licence | Carrier partner | UL-VNO, strongest DLT operations of the Indian providers |
| Rates | Published (~₹0.60/min + streaming) | Not published; sales-quoted |
| Call document | XML fetched from an `answer_url` | **None** — a `StreamUrl` dial param, or a dashboard flow |
| Audio | µ-law 8k (also L16) | **L16 PCM only**, 8k / 16k / 24k |
| Session limits | — | **60 min max, 10s timeout fails the session** |

## The three structural differences (all absorbed in `exotel.provider.js`)

**1. No per-call document — but there are two ways to route without one.**
Twilio takes TwiML inline; Plivo fetches XML from a URL we serve. Exotel takes
neither, and which of its two alternatives you use is `EXOTEL_DIAL_MODE`:

- **`stream` (the default).** *Connect Voice AI*: `StreamUrl` +
  `StreamType=bidirectional` go on the dial request itself, so the per-call
  `wss://` address — including the call log id — is something we control end to
  end. No dashboard object is involved at all. **This must be enabled on the
  Exotel account; it is off by default.** A first stream-mode call rejected with
  a 400/403 almost always means that, which is why the provider says so in the
  error text rather than making you guess.
- **`app`.** The original path: the call is pointed at an App (flow) built in the
  Exotel dashboard (`EXOTEL_APP_ID`), and per-call data can only ride in
  `CustomField`. Per-agent routing then needs the flow's Voicebot applet pointed
  at an HTTP endpoint that answers `{"url": "wss://…"}` per call — that endpoint
  is `GET|POST /api/v1/exotel/voicebot-stream`.

Kept both because they fail differently: `stream` depends on an account feature
flag, `app` depends on dashboard state nobody can diff or review.

**2. `From`/`To` are inverted.** In the connect-to-app flow, Exotel's `From` is
the person being **dialled** and `CallerId` is our ExoPhone. Passing our own
number as `From` — the Twilio habit — rings us instead of the lead. Pinned by a
test, because it fails in a way that looks like a carrier fault.

**3. No per-agent greeting.** Greeting-only calls need arbitrary text spoken on a
specific call. Exotel's greeting lives in a static dashboard flow, so the
provider sets `supportsGreetingMode: false` and `outboundCall.service` refuses
the call with a 400 **before creating a log or spending a carrier leg**. The
alternative — dialling a lead and playing whatever the flow happens to contain —
is worse than an error. Exotel is therefore **conversational-engine only**
(xAI / ElevenLabs).

## Audio: better news than expected

Exotel streams **16-bit linear PCM, not µ-law**. The earlier assumption was that
this needs a transcode layer. It does not: `twilioMediaRealtime.handler.js`
requests the format *from* the engine (`audioFormat: 'g711_ulaw'`), and
`webCallRealtime.handler.js` already passes `'pcm16'`. The bundled engines speak
both — for Exotel we ask for PCM16 and no transcoding happens.

Better still, **the default is `?sample-rate=24000`**, because that is what the
bundled engines emit natively (`client/src/services/xaiCallSocket.ts` runs its
audio contexts at 24kHz). Nothing is resampled in either direction. The PSTN leg
is 8kHz regardless, so this is a CPU decision, not an audio-quality one; 8000 and
16000 also work and anything else falls back to 8000, Exotel's own default.

## The protocol is nearly Twilio's — the framing is not

Events: `connected`, `start` (with `streamSid`/`callSid`), `media`, `mark`,
`clear`, `stop`. Our existing bridge already handles those, so *event handling*
is a parameterisation of the Twilio one. **Outbound framing is not**, and this is
the part that will silently eat a live call. From Exotel's own reference bridge
([exotel/Agent-Stream](https://github.com/exotel/Agent-Stream),
`integrations/agents/_shared/`):

- frames must be **multiples of 320 bytes**;
- a payload dumped in one message (a whole greeting) or blasted with no delay
  **correlates with the call hanging up after ~4 seconds**, and payloads over
  100KB risk a timeout;
- `chunk`, `timestamp` and `sequenceNumber` on the media event are load bearing —
  "omit them and some Connect streams drop / end early".

A realtime engine emits a whole sentence in a few hundred milliseconds, so
forwarding it the way the Twilio bridge does *is* the burst Exotel drops. That is
what `services/voice/pcmStreamPacer.js` exists for: a wall-clock frame pump that
emits aligned frames at realtime with the sequence metadata attached. It is not
the optional extra that the ambience pump is on Twilio — without it the
integration does not work at all. `EXOTEL_FRAME_MS` defaults to 100 (Exotel's
documented figure); 20ms is a clean 320-byte multiple at every supported rate and
gives the latency back, but is worth trying only once live calls are stable.

Ambience is off on Exotel: the mixer is µ-law-specific (logarithmic, 160-byte
frames). Mixing PCM16 is a different implementation, not a config change. An
agent with a preset selected still calls fine, it just has no bed.

## The 10-second timeout is a product risk, not a config detail

Exotel fails the session if the bot does not respond within 10 seconds, and caps
sessions at 60 minutes. A slow LLM turn does not degrade the call — it drops it.
Before committing volume to Exotel, measure worst-case turn latency, not median.

## Environment

```bash
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_SID=
EXOTEL_SUBDOMAIN=api.in.exotel.com   # Mumbai. Singapore (api.exotel.com) breaks
                                     # India's in-country media requirement.
EXOTEL_CALLER_ID=                    # ExoPhone / virtual number
EXOTEL_DIAL_MODE=stream              # stream (Connect Voice AI) | app (flow)
EXOTEL_APP_ID=                       # app mode only
EXOTEL_SAMPLE_RATE=24000             # 8000 | 16000 | 24000
EXOTEL_FRAME_MS=100                  # outbound frame size; 20 once proven
EXOTEL_STATUS_CALLBACK=              # derived from PUBLIC_BACKEND_WS_URL; set
                                     # only if the public host differs
EXOTEL_WEBHOOK_TOKEN=                # ?token=… shared secret on both endpoints
EXOTEL_TIME_LIMIT_SEC=               # optional hard ceiling on one call
PUBLIC_BACKEND_WS_URL=wss://…        # must be India-hosted (media anchoring)
```

`status()` demands `EXOTEL_APP_ID` **only in app mode** — in stream mode the wss
URL travels on the dial request, so requiring a dashboard App there would block a
correctly configured account.

## What we expose to Exotel

| Endpoint | Who calls it | Why it exists |
|---|---|---|
| `wss://…/api/v1/exotel-media/:workspaceId/:agentId` | Exotel media stream | The bridge. Query string carries `sample-rate` and, in stream mode, `callLogId`. |
| `GET\|POST /api/v1/exotel/voicebot-stream` | Voicebot applet, app mode only | Answers `{"url": "wss://…"}` for this call — the only way one flow serves many agents. |
| `GET\|POST /api/v1/exotel/status` | Exotel status callback | Terminal call events. |

All three are public: a carrier cannot hold a session token. `EXOTEL_WEBHOOK_TOKEN`
is the only authentication available on the two HTTP endpoints, and it is
optional — unset means open, which is a warning in the log, not a silent failure.

**The status callback is not optional bookkeeping.** HTTP 200 from
`connect.json` means *accepted*, not *connected*; anything reading it as "the
call happened" is wrong. Its real job is the calls the media bridge never
saw — busy, no-answer, rejected — which would otherwise sit at `INITIATED`
forever with their billing state never closed out. It deliberately never bills:
a call the bridge never handled is marked `SKIPPED`, and a call that *completed*
without reaching the bridge is logged at error level, because that means the
stream URL or the flow is misconfigured.

## Exotel is bundled-engine only, in both directions

`supportsGreetingMode: false` (no per-call speech text) and
`supportsModularEngine: false` (the modular STT→LLM→TTS pipeline is µ-law-native
end to end — Deepgram is opened in `mulaw/8000`, TTS is asked for a telephony
format — and has no PCM16 bridge). `outboundCall.service` refuses both **before**
creating a call log or spending a carrier leg. Exotel agents must use xAI or
ElevenLabs.

ElevenLabs has one trap: its output format is fixed on the dashboard agent, not
per session, so an ElevenLabs agent used on Exotel must be configured for PCM at
`EXOTEL_SAMPLE_RATE`. A mismatch is audible as wrong speed/pitch, not silence.

## Bringing up a first live call

1. Ask Exotel to enable **Connect Voice AI (bidirectional streaming)** on the
   account. Everything below assumes stream mode.
2. Deploy with `PUBLIC_BACKEND_WS_URL` pointing at **India-hosted** infra, and
   `EXOTEL_STATUS_CALLBACK` at `/api/v1/exotel/status`.
3. Point a `VoiceNumber` row at `provider = 'EXOTEL'`, or set
   `TELEPHONY_PROVIDER_DEFAULT=EXOTEL` for a throwaway test. Routing is
   per-number on purpose: one row rolls a tenant back.
4. Place a test call to an agent on xAI or ElevenLabs and watch for, in order:
   the `Exotel voicebot-stream issued a per-call stream URL` line (app mode only),
   the socket upgrade, then `Exotel stream ended after Ns` with the pacer stats.
5. If the call drops after ~4 seconds, the framing is the suspect, not the LLM.
   If it drops around 10 seconds of agent silence, that is Exotel's response
   timeout — see below.

## Still to build

- Number/DLT provisioning, which is Exotel-side paperwork, same shape as Plivo's.
- Per-call carrier cost on the call log, so margin is reportable per call
  (`billing/money.js` says this is the intent). Needs a real invoice first.
- `connect.json` vs `connect`: Connect Voice AI is documented on `/Calls/connect`
  while this code posts to `/Calls/connect.json` (the Exotel convention for a
  JSON response, and what the app-mode path already used). If the first live
  stream-mode call returns a non-JSON body, `callId` will come back undefined —
  that is the thing to check, and it is a one-line fix.

## Sources

- [Connect Voice AI API](https://docs.exotel.com/exotel-agentstream/connect-voice-ai-api)
- [exotel/Agent-Stream — `docs/AGENTSTREAM_WSS_PROTOCOL.md` and `integrations/agents/_shared/`](https://github.com/exotel/Agent-Stream)
- [Bidirectional Streaming — Exotel AgentStream](https://docs.exotel.com/exotel-agentstream/bidirectional-streaming)
- [VoiceBot Applet — Exotel AgentStream](https://docs.exotel.com/exotel-agentstream/voicebot-applet)
- [Outgoing call to connect two numbers — Exotel Developer Docs](https://developer.exotel.com/api/make-a-call-api)
- [Stream and Voicebot Applet guide — Exotel Support](https://support.exotel.com/support/solutions/articles/3000132302-updated-extension-guide-working-with-the-stream-and-voicebot-applet-beta-)
- [exotel/Agent-Stream sample bot](https://github.com/exotel/Agent-Stream)
