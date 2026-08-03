# Voice Agent — Per-Component Price Sheet (per minute / per call)

> **Purpose:** One flat, à-la-carte price list. Every building block is priced **on
> its own** so you can pick one STT + one LLM + one TTS (or one bundled engine) and
> add up the per-minute cost yourself. This is the "separate measures" companion to
> the full [`VOICE_AGENT_COST_MODEL.md`](./VOICE_AGENT_COST_MODEL.md) (which explains
> the methodology, margins, and rate card).
>
> **Rates:** public list prices, re-verified **2026-07-24**. **FX:** 1 USD = ₹96.
> **Talk basis:** agent speaks **~452 chars/min** (measured from 22 real calls) — this
> is what drives TTS. LLM basis ~5,000 tokens/min processed during the call.

---

## ⚡ The one rule that matters: not everything is per-minute

There are **three different billing units**. Mixing them up is the #1 pricing mistake.

| What you pay for | Billing unit | When it fires |
|---|---|---|
| STT, LLM (live), TTS, bundled engine, telephony | **per MINUTE** | continuously during the call |
| **Scraping / variable extraction LLM** | **per CALL** | once, after the call ends |
| Onboarding / agent-config generation | **per AGENT** | once, when the agent is built |

> A customer's recurring bill = **(voice pipeline + telephony) × minutes  +  extraction × calls.**
> Onboarding is a one-time setup cost, effectively ₹0/min.

---

## 1. STT (Speech-to-Text) — PER MINUTE

*The engine that turns the caller's audio into text. Billed by audio-time.*

| Provider / model | List rate | **$ / min** | **₹ / min** |
|---|---|---|---|
| **Sarvam Saaras** (`saaras:v3`) — cheapest, Indic | ₹30 / hr | **$0.0052** | **₹0.50** |
| ElevenLabs Scribe **realtime** | $0.39 / hr | **$0.0065** | **₹0.62** |
| **Deepgram Nova-3** (streaming) — *now in our code* | $0.46 / hr | **$0.0077** | **₹0.74** |
| xAI STT (streaming) | $0.20 / hr | $0.0033 | ₹0.32 |
| ElevenLabs Scribe (batch, not live) | $0.22 / hr | $0.0037 | ₹0.36 |

> **Cheapest live STT = Sarvam Saaras at ₹0.50/min.** Deepgram costs *more* than
> Scribe — pick it for latency/accuracy, not price (Growth plan drops it to ₹0.62).

---

## 2. LLM (the "brain" during the live call) — PER MINUTE

*Generates the agent's replies in real time. Billed per token; converted to per-minute
using ~5,000 tokens processed per minute of conversation.*

| Model | Input / Output (per 1M tok) | **$ / min** | **₹ / min** |
|---|---|---|---|
| **Sarvam-30b** — cheapest | $0.042 / $0.167 | **$0.0002** | **₹0.02** |
| Gemini 2.5 Flash-Lite | $0.10 / $0.40 | $0.0006 | ₹0.06 |
| **GPT-4o-mini** — best value | $0.15 / $0.60 | **$0.0008** | **₹0.08** |
| Gemini 2.5 Flash | $0.30 / $2.50 | $0.0018 | ₹0.17 |
| Grok (text) | $1.25 / $2.50 | $0.0066 | ₹0.63 |
| GPT-4o — flagship | $2.50 / $10.00 | $0.0138 | ₹1.32 |

> **The LLM is the cheapest part of the pipeline** — a good one (GPT-4o-mini) costs
> **₹0.08/min**. Only flagships (GPT-4o) get expensive. ⚠️ Gemini 2.5 Flash/Lite
> deprecate **2026-10-16** → move to Gemini 3.1 Flash-Lite ($0.25/$1.50, ~2.5× the price).

---

## 3. TTS (Text-to-Speech — the voice) — PER MINUTE

*Speaks the agent's replies. Billed per character. This is usually the **biggest**
line in a modular pipeline. Basis: agent speaks ~452 chars/min.*

| Provider / model | List rate | **$ / min** | **₹ / min** |
|---|---|---|---|
| **Sarvam Bulbul v2** — cheapest | ~$15.6 / 1M (₹15/10k) | **$0.0070** | **₹0.68** |
| Cartesia Sonic | ~$25 / 1M (tier-dependent) | $0.0113 | ₹1.08 |
| **Sarvam Bulbul v3** | ~$31.3 / 1M (₹30/10k) | $0.0141 | ₹1.36 |
| **ElevenLabs Flash v2.5** — our live model | $50 / 1M | **$0.0225** | **₹2.16** |
| ElevenLabs Multilingual v2 — premium | $100 / 1M | $0.0450 | ₹4.32 |

> **Sarvam Bulbul TTS = ₹0.68/min (v2) or ₹1.36/min (v3).** ElevenLabs is 3–6× that.
> A more talkative agent (600+ chars/min) scales these up proportionally.

---

## 4. Bundled speech-to-speech engines — PER MINUTE (all-in: STT + LLM + TTS)

*One model does everything over a single connection. You do **not** add STT/LLM/TTS
on top of these — the per-minute rate already includes all three.*

| Engine | Rate | **$ / min** | **₹ / min** | Notes |
|---|---|---|---|---|
| **xAI Grok Voice** | $0.05 / min | **$0.050** | **₹4.80** | STT+LLM+TTS in one. ⚠️ in-call tool calls billed extra |
| **ElevenLabs ConvAI — Standard** | $0.08 / min | **$0.080** | **₹7.68** | premium voice quality |
| ElevenLabs ConvAI — Turbo | $0.10 / min | $0.100 | ₹9.60 | |
| ElevenLabs ConvAI — Premium | $0.12 / min | $0.120 | ₹11.52 | best voice tier |
| *(burst — when over concurrency)* | $0.16 / min | $0.160 | ₹15.36 | avoid |

> **xAI Grok Voice (₹4.80/min) is the cheapest bundled option** and lowest-latency.
> ElevenLabs ConvAI (₹7.68–11.52/min) buys best-in-class voice. LLM may bill separately
> if you bring a premium one to ElevenLabs.

---

## 5. Telephony (the phone line) — PER MINUTE

*Only for actual phone calls. **Web calls skip this entirely** (₹0).*

| Carrier / leg | **$ / min** | **₹ / min** |
|---|---|---|
| Airtel / Exotel / Plivo (India local) | ~$0.0078 | **~₹0.75** |
| Twilio inbound (US local) | $0.0085 | ₹0.82 |
| **Twilio outbound (US)** | **$0.0140** | **₹1.34** |
| Twilio → India mobile | $0.03–0.11 | ₹3–10 ⚠️ avoid |

> Use **local Indian carriers (₹0.75/min)** for India — Twilio→India is 4–13× pricier.

---

## 6. Scraping / variable-extraction LLM — PER CALL (not per minute!)

*After the call, one LLM pass reads the whole transcript and pulls out the structured
variables. It fires **once per call**, not continuously — so its natural unit is **per
call**. (`postCallExtraction.service.js`.)*

| Model used for extraction | **Cost / CALL** | **₹ / call** | Amortized / min* |
|---|---|---|---|
| **GPT-4o-mini** — cheapest | **$0.00047** | **₹0.05** | ~₹0.01/min |
| **Gemini 2.5 Flash** — our default | **$0.00145** | **₹0.14** | ~₹0.03/min |
| GPT-4o — flagship | $0.00775 | ₹0.74 | ~₹0.14/min |

*Amortized over a 5-minute call. **This is under 1% of the total bill** — a 5-min call
costs ₹0.14 to extract variables with our default Gemini Flash.*

> **Answer to "how much per minute for the scraping LLM":** effectively **~₹0.03/min**
> (₹0.14 per 5-min call) with our default. It's a per-call cost, so shorter calls make
> it a bigger *fraction* per minute, but in absolute terms it's negligible.

---

## 7. Onboarding / agent-config generation — PER AGENT (one-time)

*Runs once when a customer builds an agent (generates the whole config JSON). Paid once,
amortized across every minute that agent ever runs → effectively **₹0/min**.*

| Model | **Cost per agent built** | ₹ |
|---|---|---|
| GPT-4o-mini | $0.0020 | ₹0.19 |
| Gemini 2.5 Flash (default) | $0.0072 | ₹0.69 |
| Heavy generation (Flash) | ~$0.0106 | ₹1.02 |

> Treat as a trivial one-time setup cost, or fold into a signup fee. Not per-minute.

---

## 8. Putting it together — pick one from each, add them up

**Formula:**
`per-minute cost = STT + LLM + TTS + telephony  (+ extraction÷call-minutes)`
…**or** if using a bundled engine: `bundled engine + telephony (+ extraction÷minutes)`.

### Example modular stacks (phone call, Twilio US out ₹1.34 + extraction ₹0.03)

| Stack | STT | LLM | TTS | Pipeline | **+ phone + extract = TOTAL/min** |
|---|---|---|---|---|---|
| **Cheapest India** (all-Sarvam) | Saaras ₹0.50 | Sarvam-30b ₹0.02 | Bulbul v2 ₹0.68 | **₹1.20** | *(Airtel ₹0.75 + ₹0.03)* → **₹1.98/min** |
| **Balanced** | Scribe ₹0.62 | GPT-4o-mini ₹0.08 | Cartesia ₹1.08 | **₹1.78** | + ₹1.34 + ₹0.03 → **₹3.15/min** |
| **Quality** | Scribe ₹0.62 | Gemini Flash ₹0.17 | EL Flash ₹2.16 | **₹2.95** | + ₹1.34 + ₹0.03 → **₹4.32/min** |
| **Premium** | Scribe ₹0.62 | GPT-4o ₹1.32 | EL Multi ₹4.32 | **₹6.26** | + ₹1.34 + ₹0.03 → **₹7.63/min** |

### Example bundled stacks (phone call)

| Engine | Engine/min | + phone (Twilio US) | + extraction | **TOTAL / min** |
|---|---|---|---|---|
| **xAI Grok Voice** ⭐ | ₹4.80 | ₹1.34 | ₹0.03 | **₹6.17/min** ($0.064) |
| ElevenLabs ConvAI (Standard) | ₹7.68 | ₹1.34 | ₹0.03 | **₹9.05/min** ($0.094) |
| ElevenLabs ConvAI (Premium) | ₹11.52 | ₹1.34 | ₹0.03 | **₹12.89/min** ($0.134) |

> **For web calls, drop the telephony line** (₹1.34) — every total above falls by that much.

---

## Quick-reference: everything on one line

| Component | Cheapest option | Our default | Premium option |
|---|---|---|---|
| **STT** /min | Sarvam Saaras ₹0.50 | Scribe/Deepgram ₹0.62–0.74 | — |
| **LLM (live)** /min | Sarvam-30b ₹0.02 | GPT-4o-mini ₹0.08 | GPT-4o ₹1.32 |
| **TTS** /min | Bulbul v2 ₹0.68 | EL Flash ₹2.16 | EL Multilingual ₹4.32 |
| **Bundled S2S** /min | xAI Grok ₹4.80 | — | EL ConvAI ₹7.68–11.52 |
| **Telephony** /min | Airtel ₹0.75 | Twilio US ₹1.34 | — |
| **Extraction** /call | GPT-4o-mini ₹0.05 | Gemini Flash ₹0.14 | GPT-4o ₹0.74 |
| **Onboarding** /agent | GPT-4o-mini ₹0.19 | Gemini Flash ₹0.69 | — |

---

*Methodology, margin analysis, and recommended customer rate card:
see [`VOICE_AGENT_COST_MODEL.md`](./VOICE_AGENT_COST_MODEL.md). Rates re-verified 2026-07-24; verify against real invoices before locking customer pricing.*
