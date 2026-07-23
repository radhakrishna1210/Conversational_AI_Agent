# Voice Agent — Per-Minute Cost Model & Pricing Guide

> **Purpose:** Estimate exactly what it costs *us* to run one minute of a live
> conversational voice agent across every engine our platform supports, and
> derive what we should **charge customers** to hold a healthy margin.
>
> **Last updated:** 2026-07-22 · **FX assumption:** 1 USD = ₹96 (spot ~₹96.36 on 2026-07-21).
> All provider rates are **public list prices as of July 2026** — verify against
> your own invoices before committing to customer pricing (see [Caveats](#11-caveats--how-to-verify)).

---

## 1. TL;DR — the numbers you asked for

**Our cost to run 1 minute of a phone voice agent (all-in, incl. telephony + post-call analysis):**

| Architecture | What it is | Cost / min (US phone) | Cost / min (web call, no phone) |
|---|---|---|---|
| **A. xAI Grok Voice** (bundled) | Grok speech-to-speech (STT+LLM+TTS in one model) | **~$0.064** (₹6.1) | **~$0.050** (₹4.8) |
| **B. ElevenLabs ConvAI** (bundled, premium voice) | ElevenLabs Conversational AI agent | **~$0.104** (₹10.0) | **~$0.090** (₹8.6) |
| **C. Modular pipeline** (Scribe STT + GPT-4o-mini + EL Flash TTS) | Self-assembled | **~$0.044** (₹4.2) | **~$0.030** (₹2.9) |
| **D. Budget India** (Sarvam STT + Sarvam LLM + Sarvam TTS + local carrier) | All-Indic, lowest cost | **~$0.028** (₹2.7) | **~$0.020** (₹1.9) |

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
| **ElevenLabs Conversational AI** | $0.08 (Business-annual) → $0.10 (Creator/Pro) / min | **$0.08–0.10** | STT + turn-taking + EL TTS. **LLM billed separately** if you bring a premium one; burst/overage up to $0.16/min |

### 4b. Telephony
| Carrier / leg | Rate | Per-minute |
|---|---|---|
| Twilio inbound (US local) | $0.0085 / min | **$0.0085** |
| Twilio outbound (US) | $0.014 / min | **$0.014** |
| Twilio → India mobile | ~$0.03–0.11 / min | pricey — avoid for India |
| Airtel / Exotel / Plivo (India local) | ~₹0.40–1.20 / min | **~$0.004–0.0125** (₹0.75 mid = $0.0078) |
| Twilio Media Streams (the audio bridge) | included | $0 extra |

### 4c. STT (modular)
| Provider / model | Rate | Per-minute |
|---|---|---|
| ElevenLabs Scribe **realtime** | $0.39 / hr | **$0.0065** |
| ElevenLabs Scribe (batch) | $0.22 / hr | $0.0037 |
| Sarvam **Saaras** (`saaras:v3`) | ₹30 / hr | **$0.0052** (₹0.50) |
| xAI STT (streaming) | $0.20 / hr | $0.0033 |

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

### Scenario A — xAI Grok Voice + Twilio US  ⭐ *recommended default*
| Line item | $/min | ₹/min |
|---|---|---|
| xAI realtime S2S (STT+LLM+TTS) | 0.0500 | 4.80 |
| Twilio outbound US | 0.0140 | 1.34 |
| Gemini post-call (amortized) | 0.0003 | 0.03 |
| **TOTAL** | **$0.0643** | **₹6.17** |
| *Web call (drop Twilio)* | *$0.0503* | *₹4.83* |

### Scenario B — ElevenLabs ConvAI + Twilio US (premium voice)
| Line item | $/min | ₹/min |
|---|---|---|
| ElevenLabs ConvAI (mid $0.09) | 0.0900 | 8.64 |
| Twilio outbound US | 0.0140 | 1.34 |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.1043** | **₹10.01** |
| *+ premium BYO-LLM (GPT-4o-mini)* | *+0.0008* | *+0.08* |

### Scenario C — Modular (Scribe STT + GPT-4o-mini + EL Flash TTS) + Twilio US
| Line item | $/min | ₹/min |
|---|---|---|
| STT — ElevenLabs Scribe realtime | 0.0065 | 0.62 |
| LLM — GPT-4o-mini | 0.0008 | 0.08 |
| TTS — ElevenLabs Flash (450 chars) | 0.0225 | 2.16 |
| Twilio outbound US | 0.0140 | 1.34 |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.0441** | **₹4.23** |
| *Web call (drop Twilio)* | *$0.0301* | *₹2.89* |

### Scenario D — Budget India (all-Sarvam + local carrier)
| Line item | $/min | ₹/min |
|---|---|---|
| STT — Sarvam Saaras | 0.0052 | 0.50 |
| LLM — Sarvam-30b | 0.0002 | 0.02 |
| TTS — Sarvam Bulbul v3 | 0.0141 | 1.35 |
| Telephony — Airtel/Exotel (~₹0.75) | 0.0078 | 0.75 |
| Gemini post-call | 0.0003 | 0.03 |
| **TOTAL** | **$0.0276** | **₹2.65** |

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
| Gemini transcript analysis | 1 call (~2.4k tokens) | 2.5-flash | $0.0016 |
| **Total cost of the call** | | | **$0.3216** (≈ ₹30.9) |
| **We charge @ $0.18/min** | 5 min | | **$0.90** (≈ ₹86) |
| **Gross profit** | | | **$0.578 (64%)** |

---

## 7. Component share of the bill (where the money goes)

For the **xAI phone** scenario ($0.064/min):

```
xAI Grok Voice   ████████████████████████████████████  78%
Twilio (US)      █████████████████████                  22%
Gemini analysis  ▏                                       <1%
```

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
| $0.18 | $0.064 (xAI) | **64.4%** |
| $0.30 | $0.104 (ElevenLabs) | **65.3%** |
| ₹8 | ₹2.65 (Sarvam) | **66.9%** |

### Two ways to package it
1. **Per-minute pay-as-you-go** — simplest; charge the rate-card price, meter actual minutes.
2. **Minute bundles / credits** — e.g. "2,000 min/mo for ₹28,000" (₹14/min). Better cash flow, encourages commitment. Add overage at 1.3–1.5× the bundle rate.

> **Don't forget to add on top of COGS:** fixed infra (~₹X/mo servers + DB + Redis),
> payment-gateway fees (~2–3%), and a buffer for failed-call retries and provider
> price hikes. A 65% *gross* margin typically nets ~35–45% after these.

---

## 9. Cost-optimization levers (ranked by impact)

1. **Prompt-cache the system prompt.** It's ~16,000 of the ~25,000 tokens/call. Caching (Gemini $0.03/1M cached, OpenAI 50% off) cuts LLM cost 50–90%. **Biggest single lever.**
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
| | Airtel/Exotel India (local) | ~$0.0078 |
| **Post-call** | Gemini 2.5 Flash analysis | $0.0003 (amortized) |

---

## 11. Caveats & how to verify

1. **xAI realtime voice ($0.05/min) is the load-bearing figure** for our default
   engine. Public sources list it as an all-in S2S rate, but realtime voice APIs
   sometimes bill audio tokens *on top*. **Confirm against a real xAI invoice**
   before locking Standard-tier pricing. (`config/env.js` already flags this.)
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
- USD→INR — [exchangerates.org.uk](https://www.exchangerates.org.uk/USD-INR-spot-exchange-rates-history-2026.html)
