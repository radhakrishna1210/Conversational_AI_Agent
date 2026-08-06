# Voice Agent — Per-Minute Cost Model & Pricing Guide

> **Purpose:** Estimate exactly what it costs *us* to run one minute of a live
> conversational voice agent across every engine our platform supports, and
> derive what we should **charge customers** to hold a healthy margin.
>
> **Last updated:** 2026-08-06 · **Rates re-verified against live public sources 2026-07-24** (see [§11.1](#111-2026-07-24-re-verification-log)) · **Telephony lines corrected 2026-08-06** (see [§11.2](#112-2026-08-06-telephony-correction)).
>
> ⚠️ **2026-08-06 correction:** Twilio Media Streams was modelled as free. It is **not** —
> it bills **$0.004/min (US) / $0.0044/min (India)** on top of voice minutes, on 100% of
> our phone traffic. Every scenario total below has been raised accordingly, and
> verified India rates for Twilio and Plivo have been added.
> **FX assumption:** 1 USD = ₹96 (spot ~₹96.36 on 2026-07-21).
> All provider rates are **public list prices as of July 2026** — verify against
> your own invoices before committing to customer pricing (see [Caveats](#11-caveats--how-to-verify)).

---

## 1. TL;DR — the numbers you asked for

**Our cost to run 1 minute of a phone voice agent (all-in, incl. telephony + post-call analysis):**

| Architecture | What it is | Cost / min (US phone) | Cost / min (web call, no phone) |
|---|---|---|---|
| **A. xAI Grok Voice** (bundled) | Grok speech-to-speech (STT+LLM+TTS in one model) | **~$0.068** (₹6.6) | **~$0.050** (₹4.8) |
| **B. ElevenLabs ConvAI** (bundled, premium voice) | ElevenLabs Conversational AI agent | **~$0.108** (₹10.4) | **~$0.090** (₹8.6) |
| **C. Modular pipeline** (Scribe STT + GPT-4o-mini + EL Flash TTS) | Self-assembled | **~$0.048** (₹4.6) | **~$0.030** (₹2.9) |
| **D. Budget India** (Sarvam STT + Sarvam LLM + Sarvam TTS + Plivo) | All-Indic, lowest cost | **~$0.026** (₹2.5) | **~$0.020** (₹1.9) |

**India phone calls — carrier choice dominates everything else** ([§5 Scenario A-IN](#scenario-a-in--xai-grok-voice--india-phone--the-one-that-matters-for-our-market)):

| Route | Cost / min | vs our ₹6.72–11.52 rate card |
|---|---|---|
| xAI + **Twilio** → India mobile | **₹10.01** ($0.104) | 🚨 loss-making on Growth & Early Deployers |
| xAI + **Plivo** → India mobile | **₹5.43** ($0.057) | ✅ healthy margin on every tier |

**What we should charge customers** (≈65% gross margin over cost):

| Tier | Underlying engine | **Charge / min** | Our cost / min | Gross margin |
|---|---|---|---|---|
| **Standard** | xAI Grok Voice or modular-GPT | **$0.15–0.20** (₹14–19) | ~$0.064 | 60–68% |
| **Premium** | ElevenLabs voice | **$0.25–0.35** (₹24–34) | ~$0.104 | 58–70% |
| **India / Budget** | Sarvam all-Indic | **₹6–10** ($0.06–0.10) | ~₹2.7 | 55–70% |

> These are **variable cost of goods (COGS) per minute only.** Layer on fixed
> infra (servers, Redis, Postgres, bandwidth), ~2–3% payment-gateway fees, and
> support/overhead before setting final plan prices. See [§8](#8-recommended-customer-pricing--margin).

---

## 2. What our platform actually runs (from the codebase)

Our agents run in one of two shapes. This matters because the cost model is
completely different for each.

### Shape 1 — Bundled speech-to-speech (S2S) engine
One model does STT + reasoning + TTS over a single WebSocket. Billed **per minute**.

| Engine | Model / config | Where in code |
|---|---|---|
| **xAI Grok Voice** | `grok-voice-latest` @ `wss://api.x.ai/v1/realtime` | `services/voice/xaiRealtime.service.js`, `config/env.js` |
| **ElevenLabs Conversational AI** | shell agent (`ELEVENLABS_CONVAI_AGENT_ID`) | `services/voice/elevenLabsRealtime.service.js` |

### Shape 2 — Modular pipeline (separate STT → LLM → TTS)
We stitch three billed services together. Billed **per audio-hour (STT)**,
**per token (LLM)**, and **per character (TTS)**.

| Stage | Providers we support | Model IDs (from code) |
|---|---|---|
| **STT** | ElevenLabs Scribe, Sarvam Saaras | `scribe_v1`, `saaras:v3` (`services/stt.service.js`) |
| **LLM** | OpenAI, Gemini, Sarvam, custom Llama | `gpt-4o`/`gpt-4o-mini`/`gpt-3.5-turbo`, `gemini-2.5-flash(-lite)`, `sarvam-30b`, `llama-3.3-70b` (`constants/llmModels.js`, `openaiModels.js`) |
| **TTS** | ElevenLabs, Cartesia, Sarvam, Google | `eleven_flash_v2_5` (live) / `eleven_multilingual_v2` (quality), `sonic-english`, `bulbul:v3` (`services/voice/providers/*`) |

### Always-on, both shapes
| Component | Purpose | Model |
|---|---|---|
| **Telephony** | Carries the phone call | Twilio Media Streams (US), Airtel/local carrier (India) |
| **Gemini post-call analysis** | Reads the whole transcript, extracts variables/structured data | `gemini-2.5-flash` (default), `constants/geminiModels.js` |

---

## 3. The conversation math — MEASURED from real transcripts

Every per-minute cost depends on **how much the agent speaks per minute** (TTS bills
per character; that's the money line).

> **✅ VALIDATED against real data (2026-07-22).** Measured across **22 real voice
> calls (~20.9 min)** from `AgentCallLog` (`scratch/analyze_transcripts.mjs`, read-only):
> **agent speech = 451.8 chars/min** — within **0.4%** of the 450 originally assumed.
> Every TTS and LLM-output cost line in this doc **stands unchanged.** Reality
> differs from the first guess in two *harmless* ways: the agent talks **~88%** of
> the time (not 50%), and the **caller speaks far less** (~63 chars/min, not 300).
> Because TTS is agent-only and STT bills by audio-time, neither changes the bill —
> they only make LLM *input* ~20% cheaper than modeled. Full stats in [§3.1](#31-measured-vs-assumed).

| Quantity | **Measured value** | Basis |
|---|---|---|
| **Agent speech (TTS load)** | **~452 chars/min** | **measured 451.8 ✅** (≈75 words/min) |
| Caller speech (STT text) | **~63 chars/min** | measured *(assumed 300)* |
| **Total spoken** | **~515 chars/min** | measured *(assumed 750)* |
| Agent talk share | **~88%** | measured *(assumed 50%)* |
| Avg agent reply | **~126 chars (~32 tokens)** | measured |
| Avg caller message | **~25 chars** | measured |
| Messages/min (both roles) | **~6 (≈3 exchanges)** | measured |
| Chars → tokens | 4 chars ≈ 1 token | `usageTracker.js` |
| System prompt size | ~800 tokens (resent each turn) | **assumed** — biggest un-measured input |
| Modeled call length | 5 minutes | for full-call examples |

### "How many characters in a whole conversation?" (your explicit question)

**Per minute:** ~452 agent chars + ~63 caller chars = **~515 total chars/min.**
The **~452 agent chars/min is the only figure that costs money** (TTS synthesizes
agent speech only). For a **5-minute call** (scale linearly):

| Quantity | Amount (measured basis) |
|---|---|
| Agent spoken characters (TTS billed) | **~2,260 chars** |
| Caller spoken characters | ~315 chars |
| **Full transcript** (what Gemini reads post-call) | **~2,575 chars ≈ 430 words ≈ 645 tokens** |
| LLM context **actually processed** during the call | **~20,300 input tokens (~81,000 chars)** — inflated because the system prompt + growing history is **resent every agent turn** |
| Our Gemini input cap (`geminiModels.js`) | 32,000 tokens → safely covers ~30-min calls |

> **Key insight:** the transcript is tiny (~2,575 chars), but the LLM *processes*
> ~20,000 tokens/call because context is resent each turn. **The system-prompt
> resend (~14,500 of those ~20,300 tokens) is the single biggest lever** — prompt
> caching cuts it 50–90%. See [§9](#9-cost-optimization-levers).

### 3.1 Measured vs assumed

Raw output of the read-only DB analysis (`scratch/analyze_transcripts.mjs`):

| Metric | Assumed (v1) | **Measured** | Verdict |
|---|---|---|---|
| Agent chars/min (TTS billable) | 450 | **451.8** | ✅ exact — no change to any TTS line |
| Caller chars/min | 300 | **63.3** | caller far quieter; STT unaffected (audio-time), LLM input ↓ |
| Total spoken chars/min | 750 | **515** | — |
| Agent talk share | 50% | **87.7%** | agent-led (scripted outbound) |
| Avg agent reply | ~300 | **126 chars** | shorter, snappier replies |
| Messages/min | 8 | **6.1** | ≈3 exchanges/min |
| LLM input tokens / 5-min call | ~25,300 | **~20,300** | ~20% lower → LLM cost slightly *over*stated (conservative) |

**Per-call distribution of agent chars/min** (spread across the 22 calls):
`min 270 · p25 411 · median 596 · p75 671 · p90 900 · max 982`.

> **Planning note:** use the **pooled 452 chars/min** for aggregate monthly cost
> (total chars ÷ total minutes — that's exactly how TTS bills you). For a
> *defensive/worst-case* TTS estimate, use **p75 ≈ 670 chars/min** (~+48% on TTS).
> ⚠️ Sample is small and skews to **short test calls (~0.95 min avg)**; greetings
> are front-loaded, so long production calls may settle a bit lower per minute.
> Re-run the script as real traffic accumulates.

---

## 4. Raw provider rates (public list prices, July 2026)

### 4a. Bundled speech-to-speech engines
| Engine | Rate | Per-minute | What's included |
|---|---|---|---|
| **xAI Grok Voice (realtime)** | $0.05 / min | **$0.050** | STT + LLM + TTS, one model ⚠️ *confirm on invoice* |
| **ElevenLabs Conversational AI** | Standard $0.08 · Turbo $0.10 · Premium $0.12 / min (by model tier) | **$0.08–0.12** | STT + turn-taking + EL TTS. **LLM billed separately** if you bring a premium one; burst up to **$0.16/min** when over concurrency. *Billed on conversation duration — hold/silence still accrues* ⚠️ |

### 4b. Telephony — ✅ verified 2026-08-06

**Read the Media Streams line first.** It was previously modelled as free and is not.
Every phone call we place goes through it (`agent.controller.js:413`), so it applies to
100% of phone traffic.

| Carrier / leg | Rate | Per-minute | ₹ @ 96 |
|---|---|---|---|
| **Twilio Media Streams** (the audio bridge) | **$0.004 (US) / $0.0044 (IN)** | **NOT free — always add** | ₹0.38 / ₹0.42 |
| Twilio inbound (US local) | $0.0085 / min | $0.0085 | ₹0.82 |
| Twilio outbound (US) | $0.014 / min | $0.014 | ₹1.34 |
| **Twilio → India mobile** ✅ verified | **$0.0496 / min** | **$0.0496** | **₹4.76** |
| **Twilio → India local/landline** ✅ verified | **$0.0699 / min** | $0.0699 | ₹6.71 |
| **Plivo → India local** ✅ verified | **₹0.60 / min** | **$0.00625** | **₹0.60** |
| Plivo → India, SIP/browser leg | ₹0.34 / min | $0.00354 | ₹0.34 |
| Plivo **AudioStream** | **included, ₹0 extra** | $0 | ₹0 |
| Exotel (India, indicative — not verified) | ~₹0.80–1.00 / min | ~$0.0083–0.0104 | ~₹0.90 |

**Fixed costs (not per-minute — see note below):**

| Item | Cost |
|---|---|
| Plivo India local number | **₹250 / month** |
| Twilio international number | from **$1.15 / month** (~₹110) |

> ⚠️ **Number rental is a fixed monthly cost with no home in our plan model.**
> `platform.controller.js` plans carry `priceInr`, `perMinuteInr` and `includedMinutes`
> but no per-workspace fixed telephony line. At 500 min/mo a ₹250 Plivo number adds
> **₹0.50/min effective**, nearly doubling the ₹0.60 usage rate. Effective ₹/min on one
> Plivo number: **₹3.10 @ 100 min · ₹1.10 @ 500 · ₹0.85 @ 1,000 · ₹0.63 @ 10,000.**
> The ₹0.60 figure is the floor approached at volume, not the day-one cost.

> **Twilio vs Plivo for India, all-in:** Twilio $0.0496 + $0.0044 = **$0.054/min (₹5.18)**
> vs Plivo ₹0.60 with streaming included = **₹0.60/min**. **Twilio is ~8.6× Plivo on
> Indian traffic.** This is the single largest cost lever in this document.

### 4c. STT (modular)
| Provider / model | Rate | Per-minute |
|---|---|---|
| ElevenLabs Scribe **realtime** | $0.39 / hr (Business-annual $0.28/hr) | **$0.0065** |
| ElevenLabs Scribe (batch) | $0.22 / hr | $0.0037 |
| Sarvam **Saaras** (`saaras:v3`) | ₹30 / hr | **$0.0052** (₹0.50) |
| **Deepgram Nova-3 (streaming)** ⭐ *now in code* | $0.46 / hr ($0.0077/min; Growth $0.0065/min) | **$0.0077** |
| xAI STT (streaming) | $0.20 / hr | $0.0033 |

> ⚠️ **Deepgram is now wired into the pipeline** (`services/stt/deepgramStream.service.js`) but was not in v1 of this model.
> At **$0.0077/min streaming** it sits *above* Scribe realtime ($0.0065) and Sarvam ($0.0052) — use it for latency/accuracy, not to cut STT cost. On a Growth plan ($0.0065/min) it ties Scribe.

### 4d. LLM (modular) — per **million tokens**
| Model | Input | Output | Cost for our 5-min call* | Per-minute* |
|---|---|---|---|---|
| **Sarvam-30b** | $0.042 (₹4) | $0.167 (₹16) | $0.0012 | **$0.0002** |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | $0.0028 | **$0.0006** |
| **GPT-4o-mini** | $0.15 | $0.60 | $0.0041 | **$0.0008** |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | $0.0090 | **$0.0018** |
| **Grok 4.3 (text)** | $1.25 | $2.50 | $0.0330 | **$0.0066** |
| **GPT-4o** | $2.50 | $10.00 | $0.0689 | **$0.0138** |

*Based on ~25,300 input + ~560 output tokens per 5-min call ([§3](#3-the-conversation-math-assumptions-behind-every-number)). **LLM is the *cheapest* slice of a modular pipeline** unless you pick a flagship (GPT-4o / Grok text).

> ⚠️ Gemini 2.5 Flash / Flash-Lite are scheduled for **deprecation on 2026-10-16**.
> Successor **Gemini 3.1 Flash-Lite** is $0.25 in / $1.50 out — budget for a ~2.5×
> rise on the extraction + LLM lines after that date.

### 4e. TTS (modular) — per **million characters**
| Provider / model | Rate | Cost @ 450 chars/min |
|---|---|---|
| **Sarvam Bulbul v2** | ~$15.6 /1M (₹15/10k) | **$0.0070** |
| **Cartesia Sonic** | ~$25 /1M (tier-dependent, $5–37) | **$0.0113** |
| **Sarvam Bulbul v3** | ~$31.3 /1M (₹30/10k) | **$0.0141** |
| **ElevenLabs Flash v2.5** (our live-call model) | $50 /1M ($0.05/1k, PAYG) | **$0.0225** |
| **ElevenLabs Multilingual v2** | $100 /1M ($0.10/1k, PAYG) | **$0.0450** |

> ElevenLabs effective $/char **drops sharply on subscription tiers** (credits).
> The $50/1M PAYG figure is the conservative ceiling; a Business plan lands ~$0.05–0.06/1k effective.

### 4f. Post-call analysis (Gemini)
| Item | Value |
|---|---|
| Model | `gemini-2.5-flash` ($0.30 in / $2.50 out) |
| Tokens per 5-min call | ~2,000 in (transcript + extraction prompt) + ~400 out (JSON vars) |
| **Cost per call** | **~$0.0016** → amortized **~$0.0003/min** over a 5-min call |

This is a **one-time per-call** cost, not per-minute-of-talk. It's negligible (<1% of the bill).

---

## 5. Per-minute cost, fully built up (the core deliverable)

> **All phone scenarios below now include the Twilio Media Streams line** ($0.004/min US,
> $0.0044/min India). Web-call variants exclude both telephony and Media Streams.

### Scenario A — xAI Grok Voice + Twilio US  ⭐ *recommended default (US)*
| Line item | $/min | ₹/min |
|---|---|---|
| xAI realtime S2S (STT+LLM+TTS) | 0.0500 | 4.80 |
| Twilio outbound US | 0.0140 | 1.34 |
| **Twilio Media Streams** ⚠️ *added 2026-08-06* | **0.0040** | **0.38** |
| Gemini post-call (amortized) | 0.0003 | 0.03 |
| **TOTAL** | **$0.0683** | **₹6.56** |
| *Web call (drop telephony + Media Streams)* | *$0.0503* | *₹4.83* |

### Scenario A-IN — xAI Grok Voice + India phone ⚠️ *the one that matters for our market*

Same engine, Indian destination. Shown both ways because the carrier choice dominates:

| Line item | **Twilio** $/min | **Plivo** $/min |
|---|---|---|
| xAI realtime S2S | 0.0500 | 0.0500 |
| Carrier → India mobile | 0.0496 | **0.00625** |
| Media Streams / AudioStream | 0.0044 | **0 (included)** |
| Gemini post-call | 0.0003 | 0.0003 |
| **TOTAL** | **$0.1043 (₹10.01)** | **$0.0566 (₹5.43)** |

> 🚨 **Margin alert.** Our plans charge **₹6.72–11.52/min** (`platform.controller.js:22-26`).
> An Indian phone call served over Twilio costs **₹10.01/min** — above every tier except
> Free. **Growth (₹6.72) and Early Deployers (₹7.20) are served at a loss on Indian phone
> traffic today.** Moving the carrier to Plivo takes it to ₹5.43/min and restores margin
> across all tiers. Telephony is **~52%** of the Twilio-India bill vs ~12% on Plivo.

### Scenario B — ElevenLabs ConvAI + Twilio US (premium voice)
| Line item | $/min | ₹/min |
|---|---|---|
| ElevenLabs ConvAI (mid $0.09) | 0.0900 | 8.64 |
| Twilio outbound US | 0.0140 | 1.34 |
| **Twilio Media Streams** ⚠️ *added 2026-08-06* | **0.0040** | **0.38** |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.1083** | **₹10.40** |
| *+ premium BYO-LLM (GPT-4o-mini)* | *+0.0008* | *+0.08* |

### Scenario C — Modular (Scribe STT + GPT-4o-mini + EL Flash TTS) + Twilio US
| Line item | $/min | ₹/min |
|---|---|---|
| STT — ElevenLabs Scribe realtime | 0.0065 | 0.62 |
| LLM — GPT-4o-mini | 0.0008 | 0.08 |
| TTS — ElevenLabs Flash (450 chars) | 0.0225 | 2.16 |
| Twilio outbound US | 0.0140 | 1.34 |
| **Twilio Media Streams** ⚠️ *added 2026-08-06* | **0.0040** | **0.38** |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.0481** | **₹4.62** |
| *Web call (drop telephony + Media Streams)* | *$0.0301* | *₹2.89* |

### Scenario D — Budget India (all-Sarvam + Plivo) ✅ *carrier rate now verified*
| Line item | $/min | ₹/min |
|---|---|---|
| STT — Sarvam Saaras | 0.0052 | 0.50 |
| LLM — Sarvam-30b | 0.0002 | 0.02 |
| TTS — Sarvam Bulbul v3 | 0.0141 | 1.35 |
| **Telephony — Plivo India** ✅ verified (was ~₹0.75 assumed) | **0.00625** | **0.60** |
| AudioStream | 0 (included) | 0 |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.0261** | **₹2.50** |

> Scenario D got *cheaper* (₹2.65 → ₹2.50): the verified Plivo rate (₹0.60) beats the
> ₹0.75 previously assumed for local carriers, and AudioStream is free where Twilio's
> Media Streams is not. **Excludes the ₹250/mo number rental** — see the §4b note.

> **Read this carefully:** the modular US pipeline (C, $0.044) looks *cheaper* than
> the bundled xAI engine (A, $0.064) — but A buys you **lowest latency (one model,
> no pipeline hops), one bill, and far less engineering/failure surface.** The
> $0.02/min gap is usually worth paying for a production agent. Use modular when
> you need per-stage control (specific voice, specific LLM) or to hit a price floor.

---

## 5A. The models *you assemble* — and the correct billing unit for each

> This section answers the narrow question: for the **modular models we build
> ourselves** (STT + LLM + voice config), plus the **LLM in onboarding** and the
> **LLM that scrapes the transcript for variables** — what do we pay the API
> companies, and **in what unit?** The trap is assuming everything is per-minute.
> It isn't: only the live voice pipeline bills per minute.

### The three units (this is the whole answer)

| What we pay for | Correct unit | Fires… | Typical cost |
|---|---|---|---|
| **Voice model** (STT + LLM + TTS) | **per minute of call** | continuously during a call | **$0.012–0.065 / min** |
| Telephony (Twilio/Airtel) | per minute of call | continuously during a call | $0.008–0.014 / min (US) |
| **Transcript scraping → variable extraction** | **per call** | once, after the call ends | **~$0.0015 / call** |
| **Onboarding / agent-config generation** | **per agent created** (one-time) | once, when a user builds an agent | **~$0.002–0.011 / agent** |

So a customer's recurring bill = **(voice model + telephony) × minutes + $0.0015 × calls**.
Onboarding is a **one-time setup cost** paid once per agent, amortized to ≈$0/min.

### (i) Build-your-own voice model — PER MINUTE (STT + LLM + TTS only, telephony separate)

Pick one from each column; the per-minute cost is their sum. (Uses [§3](#3-the-conversation-math-assumptions-behind-every-number): agent speaks ~450 chars/min, ~25k LLM tokens/5-min call.)

| Combo | STT | LLM | TTS (voice) | **$/min** | **₹/min** |
|---|---|---|---|---|---|
| **Cheapest** (all-Indic) | Sarvam Saaras `$0.0052` | Sarvam-30b `$0.0002` | Bulbul v2 `$0.0070` | **$0.0124** | **₹1.19** |
| **Balanced** | EL Scribe `$0.0065` | GPT-4o-mini `$0.0008` | Cartesia `$0.0113` | **$0.0186** | **₹1.79** |
| **Quality** | EL Scribe `$0.0065` | Gemini 2.5 Flash `$0.0018` | EL Flash v2.5 `$0.0225` | **$0.0308** | **₹2.96** |
| **Premium** | EL Scribe `$0.0065` | GPT-4o `$0.0138` | EL Multilingual v2 `$0.0450` | **$0.0653** | **₹6.27** |

> **The voice model alone costs ~$0.012–0.065/min.** TTS is the swing factor (up to
> 70% of it). LLM is 1–20% depending on model. Add telephony ([§4b](#4b-telephony)) for the phone total.

### (ii) Transcript scraping → variable extraction — PER CALL

`postCallExtraction.service.js` runs the agent's LLM (default `gemini-2.5-flash`)
**once per completed call** to pull structured variables from the whole transcript.

| Item | Value (from code) |
|---|---|
| Model | agent's configured LLM (`resolveLlmForAgent`), default `gemini-2.5-flash` |
| System prompt | ~250 tokens (extraction instructions) |
| Input | system prompt + variable defs (~200) + **full transcript** (~940 for 5-min) ≈ **~1,500 tokens** |
| Output | JSON `{value, evidence}` per variable, cap `maxTokens: 3000` → ~400 tokens typical |
| **Cost per call (Gemini 2.5 Flash)** | 1,500×$0.30/1M + 400×$2.50/1M = **$0.00145** (~₹0.14) |
| Cost per call (GPT-4o-mini) | **$0.00047** (~₹0.05) |
| Cost per call (GPT-4o) | **$0.00775** (~₹0.74) |

Amortized over a 5-min call this is **~$0.0003/min** — under 1% of the bill. `skipCache:true` and `thinkingBudget:0` are already set, so no waste.

### (iii) Onboarding / agent-config generation — PER AGENT (one-time)

`generateAgentFlow` (+ optional `enhancePrompt`) in `llm.controller.js` runs the
LLM (default `gemini-2.5-flash`) **once when a user builds/regenerates an agent**
to emit the whole config JSON (name, welcome, 4–8 flow items, voice, variables).

| Item | Value (from code) |
|---|---|
| Model | `DEFAULT_LLM_MODEL` → `gemini-2.5-flash`, temp 0.2 |
| Input | tiny system prompt + schema + rules + ~48 voice options + user description (≤16k chars) ≈ **~2,500–6,000 tokens** |
| Output | full config JSON, cap `maxTokens: 8000`, `thinkingBudget:0` → **~2,500 tokens** typical |
| **Cost per generation (Gemini 2.5 Flash)** | ~3,000×$0.30/1M + 2,500×$2.50/1M = **$0.0072** (~₹0.69) |
| Cost per generation (GPT-4o-mini) | **$0.0020** (~₹0.19) |
| Heavy generation (6k in / 3.5k out, Flash) | **~$0.0106** (~₹1.02) |
| Optional `enhancePrompt` (per use) | ~200 in / 500 out → **$0.0013** (~₹0.13) |

> **This is not a per-minute or even per-call cost** — it's paid **once per agent
> the customer creates** (plus a few if they regenerate). Spread across every
> minute that agent will ever run, it rounds to **$0/min.** Treat it as a trivial
> one-time onboarding COGS, or absorb it into a signup/setup fee.

### Putting it together — a customer running one agent, 1,000 min/mo over 400 calls

| Cost | Unit rate | Volume | Monthly |
|---|---|---|---|
| Voice model (Balanced combo) | $0.0186/min | 1,000 min | $18.60 |
| Telephony (Twilio US out) | $0.014/min | 1,000 min | $14.00 |
| Variable extraction | $0.00145/call | 400 calls | $0.58 |
| Onboarding (1 agent, one-time) | $0.0072/agent | 1 (amortized) | $0.01 |
| **Total API spend** | | | **≈ $33.19/mo** (~₹3,186) → **$0.033/min effective** |

Charge this customer at $0.15/min → **$150/mo revenue, ~78% gross margin.**

---

## 6. Worked example — one 5-minute US phone call (xAI engine)

| Component | Quantity | Rate | Cost |
|---|---|---|---|
| xAI Grok Voice | 5 min | $0.05/min | $0.2500 |
| Twilio outbound US | 5 min | $0.014/min | $0.0700 |
| **Twilio Media Streams** ⚠️ *added 2026-08-06* | 5 min | $0.004/min | **$0.0200** |
| Gemini transcript analysis | 1 call (~2.4k tokens) | 2.5-flash | $0.0016 |
| **Total cost of the call** | | | **$0.3416** (≈ ₹32.8) |
| **We charge @ $0.18/min** | 5 min | | **$0.90** (≈ ₹86) |
| **Gross profit** | | | **$0.558 (62%)** |

**Same call, but to an Indian mobile** — the comparison that should drive the carrier decision:

| Route | Carrier + streams (5 min) | Total call cost | Profit @ ₹8.16/min (Starter) |
|---|---|---|---|
| **Twilio** → India mobile | ₹25.90 | **₹50.05** | ₹40.80 revenue → **−₹9.25 LOSS** |
| **Plivo** → India mobile | ₹3.00 | **₹27.15** | ₹40.80 revenue → **+₹13.65 (33%)** |

---

## 7. Component share of the bill (where the money goes)

For the **xAI US phone** scenario ($0.068/min):

```
xAI Grok Voice   ██████████████████████████████████     73%
Twilio (US)      ██████████                             21%
Media Streams    ███                                     6%
Gemini analysis  ▏                                      <1%
```

For the **xAI India phone over Twilio** scenario ($0.104/min) — **telephony overtakes the engine**:

```
Twilio (IN mob)  ████████████████████████               48%
xAI Grok Voice   ████████████████████████               48%
Media Streams    ██                                      4%
Gemini analysis  ▏                                      <1%
```

Switch that call to Plivo (₹0.60, AudioStream free) and telephony drops to **12%** of a
$0.057/min bill. **This is the highest-leverage change available to us** — bigger than
any TTS, LLM or prompt-caching optimization in [§9](#9-cost-optimization-levers).

For the **modular US** scenario ($0.044/min), the picture flips — **TTS dominates**:

```
TTS (EL Flash)   ██████████████████████████████████████ 51%
Twilio (US)      ███████████████████████                32%
STT (Scribe)     ████████████                           15%
LLM (4o-mini)    █▌                                      2%
Gemini analysis  ▌                                       <1%
```

**Takeaways:** In bundled mode the **engine** is the cost. In modular mode, **TTS
and telephony** are the cost — the LLM everyone worries about is <3%. Optimize TTS
(cheaper model/tier) and telephony (local carrier) first.

---

## 8. Recommended customer pricing & margin

**Market context (what competitors charge end-customers, 2026):** Vapi, Retell,
Bland, Synthflow etc. land **~$0.07–0.30/min** all-in. Our costs ($0.028–0.104)
leave comfortable room.

### Suggested rate card

| Plan | Engine | **Price/min** | Cost/min | GM% | Positioning |
|---|---|---|---|---|---|
| **Starter / India** | Sarvam or modular | **₹6–10** ($0.06–0.10) | ₹2.7–4.2 | 55–68% | Price-sensitive, Indic languages |
| **Standard** ⭐ | xAI Grok Voice | **$0.15–0.20** (₹14–19) | $0.064 | 60–68% | Default — best value/latency |
| **Premium** | ElevenLabs voice | **$0.25–0.35** (₹24–34) | $0.104 | 58–70% | Best-in-class voice quality |
| **Enterprise** | any + SLA | custom / committed-volume | negotiated | 65%+ | Volume discounts, dedicated concurrency |

### Margin sanity check
| Price/min | Cost/min | Gross margin |
|---|---|---|
| $0.18 | $0.068 (xAI + Twilio US, incl. Media Streams) | **62.2%** |
| $0.30 | $0.108 (ElevenLabs + Twilio US) | **64.0%** |
| ₹8 | ₹2.50 (Sarvam + Plivo India) | **68.8%** |
| **₹8.16** (Starter) | **₹10.01 (xAI + Twilio → India mobile)** | 🚨 **−22.7% LOSS** |
| ₹8.16 (Starter) | ₹5.43 (xAI + Plivo → India mobile) | **33.5%** |

> **The India-over-Twilio row is the finding of the 2026-08-06 review.** Every rate-card
> tier below ₹10.01/min loses money on Indian phone calls routed through Twilio — that is
> Starter (₹8.16), Jump Starter (₹7.68), Early Deployers (₹7.20) and Growth (₹6.72), i.e.
> **every paid tier.** The fix is the carrier, not the price.

### Two ways to package it
1. **Per-minute pay-as-you-go** — simplest; charge the rate-card price, meter actual minutes.
2. **Minute bundles / credits** — e.g. "2,000 min/mo for ₹28,000" (₹14/min). Better cash flow, encourages commitment. Add overage at 1.3–1.5× the bundle rate.

> **Don't forget to add on top of COGS:** fixed infra (~₹X/mo servers + DB + Redis),
> payment-gateway fees (~2–3%), and a buffer for failed-call retries and provider
> price hikes. A 65% *gross* margin typically nets ~35–45% after these.

---

## 9. Cost-optimization levers (ranked by impact)

0. **⭐ Route Indian traffic to Plivo, not Twilio.** ₹5.18/min → ₹0.60/min on the carrier
   line (~8.6×), and it flips every paid tier from loss-making to profitable on Indian
   phone calls. Plivo's AudioStream is free where Twilio's Media Streams is $0.004/min,
   and it speaks μ-law 8kHz — the same format `twilioMediaRealtime.handler.js` already
   handles, so the porting cost is low. **This is now the biggest lever in the document,
   ahead of prompt caching.** Blocked on: no telephony provider abstraction exists.
1. **Prompt-cache the system prompt.** It's ~16,000 of the ~25,000 tokens/call. Caching (Gemini $0.03/1M cached, OpenAI 50% off) cuts LLM cost 50–90%. **Biggest LLM-side lever.**
2. **Use a cheap LLM in modular mode.** GPT-4o-mini / Gemini Flash-Lite / Sarvam are ~$0.0002–0.0008/min. Reserve GPT-4o / Grok-text for hard tasks only — they're 10–20× pricier.
3. **Pick TTS by tier, not headline.** ElevenLabs Flash on a Business subscription ≈ half the PAYG rate. Cartesia mid-tier (~$25/1M) beats EL PAYG. Sarvam Bulbul for Indic.
4. **Use local carriers for India.** Airtel/Exotel/Plivo (₹0.40–1.20/min) vs Twilio→India-mobile ($0.03–0.11/min ≈ ₹3–10). Huge.
5. **Trim agent verbosity.** TTS is per-character. Shorter agent replies = directly lower TTS + LLM output cost. 450→300 chars/min saves ~33% of the TTS line.
6. **Keep post-call analysis on Flash-Lite** where extraction is simple — $0.10/1M vs $0.30/1M, and it's already <1% of the bill.
7. **Cap max call duration.** Runaway calls scale LLM context super-linearly (resends). A 15-min hard cap protects margin.

---

## 10. Reference: per-minute rate for every model we support

| Category | Option | Per-minute (our assumptions) |
|---|---|---|
| **Bundled S2S** | xAI Grok Voice | $0.050 |
| | ElevenLabs ConvAI | $0.080–0.100 |
| **STT** | ElevenLabs Scribe realtime | $0.0065 |
| | ElevenLabs Scribe batch | $0.0037 |
| | Sarvam Saaras | $0.0052 |
| | xAI STT streaming | $0.0033 |
| **LLM** (5-min call basis) | Sarvam-30b | $0.0002 |
| | Gemini 2.5 Flash-Lite | $0.0006 |
| | GPT-4o-mini | $0.0008 |
| | Gemini 2.5 Flash | $0.0018 |
| | Grok 4.3 text | $0.0066 |
| | GPT-4o | $0.0138 |
| **TTS** (450 chars/min) | Sarvam Bulbul v2 | $0.0070 |
| | Cartesia Sonic | $0.0113 |
| | Sarvam Bulbul v3 | $0.0141 |
| | ElevenLabs Flash v2.5 | $0.0225 |
| | ElevenLabs Multilingual v2 | $0.0450 |
| **Telephony** | Twilio inbound US | $0.0085 |
| | Twilio outbound US | $0.0140 |
| | **Twilio Media Streams** (add to every Twilio call) | **$0.0040 US / $0.0044 IN** |
| | **Twilio → India mobile** ✅ verified | **$0.0496** |
| | Twilio → India local/landline ✅ verified | $0.0699 |
| | **Plivo → India local** ✅ verified (AudioStream free) | **$0.00625** |
| | Plivo → India SIP/browser leg | $0.00354 |
| | Exotel India (indicative, unverified) | ~$0.0083–0.0104 |
| **Post-call** | Gemini 2.5 Flash analysis | $0.0003 (amortized) |

---

## 11. Caveats & how to verify

1. **xAI realtime voice ($0.05/min) is the load-bearing figure** for our default
   engine. ✅ **Re-confirmed 2026-07-24** as the base rate (released April 2026 with
   Grok 4.3, $3/hr, 30-min max session, 100 concurrent). ⚠️ **New caveat:** in-call
   **tool invocations** (function calling, web/X search, MCP) are billed *separately
   on top* of the per-minute rate — if our agents use tools mid-call, add that line.
   Still **confirm against a real xAI invoice** before locking Standard-tier pricing.
2. **ElevenLabs ConvAI LLM handling** — the per-minute rate includes an LLM
   allowance; premium bring-your-own LLMs bill separately. Confirm which applies
   to our shell agent.
3. **TTS $/char varies 2× by subscription tier.** PAYG figures here are the ceiling.
4. **Gemini 2.5 Flash/-Lite deprecate 2026-10-16** → migrate to 3.1 Flash-Lite
   ($0.25/$1.50) and re-run the extraction + LLM lines (~2.5× on those).
5. **FX moves.** At ₹96/$ today; every ₹1 move shifts INR costs ~1%.
6. **These are variable COGS only.** Not included: servers/DB/Redis/bandwidth,
   payment fees (~2–3%), free-tier/trial burn, failed-call retries, taxes/GST.
7. **Numbers scale with the [§3](#3-the-conversation-math-assumptions-behind-every-number) assumptions.** A more talkative agent (600+ chars/min) or
   longer calls raise TTS and LLM lines proportionally.

### 11.1 · 2026-07-24 re-verification log

Every load-bearing rate re-checked against live public sources on **2026-07-24**. Verdict: **the model stands.** Changes applied:

| Line | v1 (2026-07-22) | Re-verified (2026-07-24) | Action |
|---|---|---|---|
| **xAI Grok Voice** | $0.05/min | ✅ $0.05/min confirmed | + noted tool calls billed separately |
| **ElevenLabs ConvAI** | $0.08–0.10/min | Standard $0.08 · Turbo $0.10 · **Premium $0.12** · burst $0.16 | ↑ top of range to $0.12 |
| **ElevenLabs Scribe realtime** | $0.39/hr | ✅ $0.39/hr (Business-annual $0.28/hr) | confirmed |
| **Sarvam** Saaras / Bulbul v2 / v3 | ₹30hr / ₹15 / ₹30 per 10k | ✅ all confirmed | none |
| **Cartesia Sonic** | $5–37/1M | ✅ 1 credit/char, $5–37/1M by tier | confirmed |
| **GPT-4o-mini** | $0.15 / $0.60 | ✅ confirmed (cached in $0.075) | none |
| **Twilio outbound US** | $0.014/min | $0.013–0.014/min (slightly conservative) | kept conservative $0.014 |
| **Gemini 2.5 Flash deprecation** | 2026-10-16 | ✅ confirmed. Successors: 3 Flash $0.50/$3.00, **3.1 Flash-Lite $0.25/$1.50**, 3.5 Flash $1.50/$9.00 | Flash-Lite path still ~2.5× — unchanged |
| **Competitors** | $0.07–0.30/min all-in | Vapi $0.05 base · Retell $0.07+ · Bland $0.11–0.12; real all-in $0.14–0.33 | confirmed |
| **Deepgram Nova-3** | *(not modeled)* | $0.0077/min streaming — **now in codebase** | **added** to §4c |

> **Net effect on the four headline scenarios:** none material. The only figure that
> moved is ElevenLabs' Premium tier ($0.10 → $0.12), which nudges Scenario B's ceiling
> up ~$0.02/min at the top tier; the mid-$0.09 basis used in §5B is unchanged.

### 11.2 · 2026-08-06 telephony correction

Telephony was the one block never checked against a live carrier pricing page — §11.1
re-verified the *US outbound* rate only. Checking the rest surfaced one **error** and
several **unverified assumptions that were materially wrong for India**.

| Line | Before | **Verified 2026-08-06** | Impact |
|---|---|---|---|
| **Twilio Media Streams** | ❌ "included, $0 extra" | **$0.004/min US · $0.0044/min IN** | **ERROR.** Applies to 100% of phone calls (`agent.controller.js:413`). +$0.004 on every phone scenario |
| **Twilio → India mobile** | ~$0.03–0.11 (guessed range) | **$0.0496/min** | now exact; was a 3.7× wide guess |
| Twilio → India local/landline | not modelled | **$0.0699/min** | added |
| **Plivo → India local** | folded into "~₹0.40–1.20" | **₹0.60/min** | now exact, and *cheaper* than the ₹0.75 assumed |
| **Plivo AudioStream** | not modelled | **included, ₹0** | Plivo's edge over Twilio is wider than assumed |
| Plivo number rental | ❌ not modelled at all | **₹250/mo** | fixed cost with no home in our plan model |
| Twilio number rental | not modelled | from $1.15/mo | added |
| Exotel India | ~₹0.40–1.20 | ~₹0.80–1.00 **(still unverified)** | Exotel publishes no public rates — sales-gated |
| Airtel IQ | listed as a carrier option | **no public rates, no public streaming docs** | cannot be modelled; see §11.3 |

**Net effect — this one is material, unlike §11.1:**

- Every **US phone** scenario rose **+$0.004/min** (A $0.064→$0.068, B $0.104→$0.108, C $0.044→$0.048).
- **Scenario D fell** ($0.0276→$0.0261) — verified Plivo beats the assumed local-carrier rate.
- **A new India scenario (A-IN) was added, and it is the important one:** Twilio ₹10.01/min
  vs Plivo ₹5.43/min. At ₹10.01 we are **below cost on the Growth (₹6.72) and Early
  Deployers (₹7.20) tiers** for Indian phone traffic.

**Actions this creates (not yet done):**
1. Migrate Indian traffic off Twilio to Plivo — ~8.6× on the carrier line. Requires the
   telephony provider interface (no abstraction exists today; Twilio is called directly
   via `fetch` in 6 places).
2. Decide where the fixed number rental (₹250/mo) lives in the plan model — pooled
   platform number vs. paid per-tenant add-on. Today it is unmodelled and uncharged.
3. Re-verify Media Streams and India rates against a **real invoice**, not the pricing page.

### 11.3 · Airtel IQ — why it is not modelled

Airtel appears in this repo only as `docs/AIRTEL_VERIFIED_CALLING_GUIDE.md` (served at
`GET /config/airtel-verified-calling-guide`). There is **no Airtel call code.** It stays
unmodelled here because:

- **No public per-minute rates.** Enterprise contract, volume-based, account manager only.
- **No public documentation of bidirectional WebSocket audio streaming.** Plivo documents
  μ-law/L16 formats and event schemas; Exotel documents AgentStream to the 320-byte chunk.
  Airtel documents neither publicly. **If Airtel IQ cannot stream bidirectionally it
  cannot run our agent at all** — this is the question to ask before any commercial one.
- **Additional fixed cost:** DLT registration ~₹5,000 + GST one-time, 3–7 working days.

Airtel's value is **not price — it is answer rate.** Verified Business Caller ID shows our
company name + logo + verified badge, versus a number that Airtel's spam filter degrades
within days. Since telephony is only ~12% of a Plivo-routed bill and the engine dominates,
**a pickup-rate collapse costs far more than any carrier rate delta.** Treat Airtel as a
phase-2 answer-rate upgrade, not a cost line. Quantify with real pickup data before paying
an enterprise premium — the "improves dramatically" claim in our guide is unquantified.

---

## 12. Formulas (recompute for any scenario)

```
agent_chars_per_min = talk_rate_wpm × agent_talk_fraction × chars_per_word
                    = 150 × 0.50 × 6 = 450

TTS_cost_per_min    = agent_chars_per_min × (tts_price_per_1M_chars / 1e6)

STT_cost_per_min    = stt_price_per_hour / 60

LLM_input_tokens    ≈ Σ over turns [ system_prompt + accumulated_history + user_msg ]
                    ≈ turns×sys_prompt + history_growth×(turns×(turns-1)/2)
LLM_cost_per_call   = in_tok×(in_price/1e6) + out_tok×(out_price/1e6)
LLM_cost_per_min    = LLM_cost_per_call / call_minutes

telephony_per_min   = carrier_rate

TOTAL_per_min = engine_or_(STT+LLM+TTS) + telephony + (gemini_analysis_per_call / call_minutes)

customer_price = TOTAL_per_min / (1 − target_gross_margin)
              e.g. 0.064 / (1 − 0.65) = $0.183/min
```

---

## Sources

- xAI Grok / realtime voice pricing — [AI Cost Check](https://aicostcheck.com/blog/xai-grok-pricing-guide-2026), [pricepertoken](https://pricepertoken.com/pricing-page/model/xai-grok-4)
- ElevenLabs (ConvAI, TTS, Scribe STT) — [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), [ElevenLabs Agents pricing](https://elevenlabs.io/pricing/agents), [BIGVU breakdown](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- Google Gemini API pricing — [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)
- OpenAI API & Realtime pricing — [CloudZero](https://www.cloudzero.com/blog/openai-pricing/), [Layer3 Realtime guide](https://www.layer3labs.io/guides/openai-realtime-api-pricing)
- Sarvam AI pricing — [docs.sarvam.ai/api-reference-docs/pricing](https://docs.sarvam.ai/api-reference-docs/pricing)
- Cartesia Sonic pricing — [eesel AI](https://www.eesel.ai/blog/cartesia-sonic-3-pricing), [TextToLab](https://texttolab.com/blog/cartesia-pricing)
- Twilio Voice pricing — [twilio.com/en-us/pricing](https://www.twilio.com/en-us/pricing), [Edesy guide](https://edesy.in/blog/twilio-voice-pricing-guide-2026)
- **Twilio India voice rates + Media Streams** ✅ *verified 2026-08-06* — [twilio.com/en-us/voice/pricing/in](https://www.twilio.com/en-us/voice/pricing/in), [Voice Pricing API docs](https://www.twilio.com/docs/voice/pricing)
- **Plivo India voice rates + AudioStream** ✅ *verified 2026-08-06* — [plivo.com/voice/pricing/in](https://www.plivo.com/voice/pricing/in/), [all-country voice pricing](https://www.plivo.com/voice/pricing/), [AudioStream docs](https://www.plivo.com/docs/voice/audio-streaming/overview)
- Exotel — [pricing (sales-gated)](https://exotel.com/pricing/), [Voicebot Applet docs](https://support.exotel.com/support/solutions/articles/3000132302-updated-extension-guide-working-with-the-stream-and-voicebot-applet-beta-)
- Airtel IQ — [API docs portal](https://www.airtel.in/business/b2b/airtel-iq/api-docs/), [Airtel DLT](https://dltconnect.airtel.in) · see also `docs/AIRTEL_VERIFIED_CALLING_GUIDE.md`
- USD→INR — [exchangerates.org.uk](https://www.exchangerates.org.uk/USD-INR-spot-exchange-rates-history-2026.html)
