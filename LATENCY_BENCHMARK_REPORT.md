# Voice Agent Latency Benchmark Report

> **Goal:** Measure and compare real-world latency across each stage (**VAD → STT → LLM → TTS → Audible Perceived E2E**) for conversational voice agent models.

---

## 1. Test Setup & Architecture

* **STT (Speech-to-Text):** Deepgram Nova-3 / Nova-2 (Streaming WebSocket, `sttMs ≈ 0ms`)
* **TTS (Text-to-Speech):** Fastest Streaming Provider (Cartesia `sonic-preview` / ElevenLabs Flash)
* **Channel:** Live WebRTC / WebSocket Web Call
* **Measurement Source:** `backend/logs/latency.log` (generated via `node scripts/latency-report.mjs`)

---

## 2. LLM Benchmark Matrix (Deepgram STT + Fast Streaming TTS)

| # | LLM Model | Provider | VAD / Endpointing (`endpointMs`) | STT Latency (`sttMs`) | LLM TTFT (`llmTtftMs`) | LLM Total (`llmMs`) | TTS TTFA (`ttsTtfaMs`) | **Perceived E2E (`speechEndToAudibleMs`)** | Quality & Accuracy Notes |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **1** | **GPT-4.1 Nano** | OpenAI | 123 ms | 0 ms | 368 ms | 615 ms | 75 ms | **2,305 ms** (Turn: 806ms) | Fast compact reasoning, ultra-low TTFA with Cartesia |
| **2** | **GPT-4.1 Mini** | OpenAI | 371 ms | 0 ms | 444 ms | 661 ms | 113 ms | **2,389 ms** (Turn: 889ms) | Fast speculative turn execution (80% hit rate), high precision |
| **3** | **GPT-4o Mini** | OpenAI | 372 ms | 0 ms | 725 ms | 968 ms | 77 ms | **3,462 ms** (Turn: 1,962ms) | High reliability, low hallucination rate |
| **4** | **Gemini 3.5 Flash Lite** | Google | 373 ms | 0 ms | 1,058 ms | 1,117 ms | 122 ms | **3,160 ms** (Turn: 1,659ms) | Ultra-low cost, high throughput conversational reasoning |
| **5** | **Gemini 3.1 Flash** | Google | 385 ms | 0 ms | 728 ms | 733 ms | 103 ms | **2,382 ms** (Turn: 1,317ms) | ⚡ Fast TTFT (728ms), highly responsive conversation turns |
| **6** | **Gemini 2.5 Flash Lite** | Google | 373 ms | 0 ms | 1,096 ms | 1,113 ms | 106 ms | **2,339 ms** (Turn: 1,361ms) | Predictable latency bounds, stable grounded voice replies |
| **7** | **Groq Qwen 3.6 27B** | Groq (LPU) | | 0 ms | | | | | |
| **8** | **Groq Allam 2 7B** | Groq (LPU) | | 0 ms | | | | | |
| **9** | **Sarvam Conversational (105B)** | Sarvam AI | 372 ms | 0 ms | 361 ms | 1,260 ms | 378 ms | **2,143 ms** (Turn: 1,199ms) | ⭐ Fast TTFT (361ms), smooth natural Indian English & Hindi |

---

## 3. Dedicated Separate Pipeline: 100% Sarvam Full Stack

| Stage | Component / Model | Measured Latency (ms) | Notes & Dialect Performance |
|---|---|:---:|---|
| **STT** | Sarvam Speech-to-Text (`Sarvam`) | **0 ms** (`endpointMs`: 372ms) | High accuracy Indian accent & regional language streaming transcription |
| **LLM** | Sarvam Conversational 105B (`sarvam-105b-conversations`) | **361 ms** TTFT (Total: 1,260ms) | Multilingual Indian conversational reasoning & dialogue flow |
| **TTS** | Sarvam Bulbul TTS (`Sarvam`) | **378 ms** TTFA (Total: 1,327ms) | Natural Indian voice synthesis (Hindi / Indian English) |
| **E2E Total** | **Full Sarvam Stack (Audible Latency)** | **2,143 ms** (Turn: 1,199ms) | Complete sovereign Indian voice pipeline |

---

## 4. Metric Definitions (Reference for Mentor Review)

* **VAD / Endpointing (`endpointMs`):** Silence buffer after speech ends required to confirm turn completion (~120ms for finished thoughts, ~300ms standard).
* **STT Latency (`sttMs`):** Post-speech transcription wait. With streaming STT, words are transcribed concurrently while speaking, resulting in **0 ms** delay.
* **LLM TTFT (`llmTtftMs`):** Time-To-First-Token — latency until the language model generates the first word.
* **LLM Total (`llmMs`):** Time taken by the LLM to stream the complete reply text.
* **TTS TTFA (`ttsTtfaMs`):** Time-To-First-Audio — latency until the TTS provider begins streaming the first playable audio chunk.
* **Perceived E2E Latency (`speechEndToAudibleMs`):** True human-perceived wall-clock duration from the moment the user stops speaking until audio begins playing in their speaker/earpiece.


