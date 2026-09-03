# Background voice ambience — Fish Audio native vs pre-rendered bed

**Branch:** `release/readiness-audit` · **Date:** 2026-09-04 · **Evidence:** `reports/evidence/2026-09-03_phase2/ambience/`

## 1. Current state, verified

- `services/voice/ambience.js` synthesizes six noise beds (Quiet Room, Office, Call Center, Static, Cafe, Street) as 24 s, 8 kHz loops at `TARGET_RMS_DBFS = −48`; `ambiencePump.js` mixes them into every 20 ms frame on the phone leg; `client/src/services/ambientSound.ts` reproduces them in Web Audio. "Call Center" is a filtered murmur, not speech.
- Fish Audio is a TTS provider (`providers/fishaudio.provider.js`), configured by `FISH_API_KEY` / `FISH_TTS_MODEL`; this deployment runs **`s2.1-pro-free`**, whose `/tts/live` socket never returns audio (documented in the provider), so Fish voices use the HTTP split path.
- `piopiyMediaRealtime.handler.js` disables ambience (µ-law-only mixer) and logs it once.

## 2. Mode A — Fish Audio native (S2 inline tags)

**Probe:** `scripts/probe-fish-tags.mjs`, voice `maria` (`e9f39f3c…`), model `s2.1-pro-free`, 5 variants × 2 runs, each synthesised as 24 kHz PCM, transcribed with Deepgram prerecorded (`nova-2`) for tag leakage, floor measured as the RMS of the quietest 300 ms windows. Raw: `ambience/fish_tags/probe_fish_tags.json` + WAVs.

| variant | TTFB run0 / run1 (ms) | floor p10 (dBFS) run0 / run1 | tag words in transcript |
|---|---:|---:|---|
| plain | 1942 (cold) / 617 | −32.0 / −29.8 | — |
| `[office chatter in the background]` | 373 / 588 | **−23.2 / −25.1** | none |
| `[busy call centre background, many people talking indistinctly]` | 357 / 353 | −28.0 / −29.0 | none |
| mid-sentence `[crowd murmur]` | 929 / 436 | −27.0 / −30.3 | none |
| `[rustling sound]` (Fish's own example) | 384 / 379 | −33.7 / −29.2 | none |

Findings:
1. **Tag leak: 0 of 8 tagged utterances** had any tag word transcribed; every transcript was the sentence alone. Guarded in code anyway: `applyAmbienceTag()` refuses non-bracketed or too-short tags and any non-S2 model; the tag exists only in the synthesis request body (never in reply text, transcript, history, or filler) — `fishAmbienceTag.test.js`.
2. **Effect is unreliable.** Only the "office chatter" tag raised the floor consistently (+6–7 dB); "call centre" and "crowd murmur" did nothing measurable; the vendor's own "rustling" example did nothing. The level it produces (≈ −23 dBFS) is **25 dB louder** than the bed target and cannot be set.
3. **Latency:** no systematic TTFB cost (tagged runs 353–929 ms vs plain 617 ms warm; the 1942 ms is the first, cold request).
4. **Structural:** the room exists only while the agent speaks and restarts on every turn; it falls silent during the caller's turn and between replies. On a live call that is worse than no bed.
5. **Cost:** ~+40 characters per synthesis request (≈ 8–10 % of a typical reply), on every turn, for an effect the model may or may not produce.

**Verdict:** Mode A is implemented as an option (`ambientMode: 'native'`, Fish S2 voices only, the UI disables it and says why otherwise) but is **not recommended and not the default**. It did not leak tags on this model in this probe, so it is not disabled outright; it is unreliable and uncontrollable.

Voice models trained with `enhance_audio_quality: false` (the other Mode A mechanism) were **not evaluated**: it needs reference audio recorded in a busy room and a paid model slot; the free tier in use cannot create such a model. Noted as an option if the owner upgrades.

## 3. Mode B — pre-rendered chatter bed (implemented, recommended)

**Build:** `scripts/build-chatter-bed.mjs` — 12 innocuous workplace sentences (no names, numbers, addresses or anything customer-like) × 3 Fish voices = 36 clips (92 s of speech), rendered **once**, layered at seeded random offsets so no sentence is ever in the clear (≈2 voices at once for Office, ≈3.5 for Call Center), high-passed at 250 Hz, double low-passed at 1.4/1.6 kHz (removes the consonants that make words recoverable), levelled to **−48 dBFS** (the existing bed target, ≈42 dB under speech peaks, no ducking), wrap-around layering so the 24 s loop has no seam, two variants per preset. Output: `backend/assets/ambience/*.8k.pcm` (phone mixer) and `*.24k.wav` (browser), `manifest.json`.

| bed | placements | RMS 8k / 24k (dBFS) |
|---|---:|---:|
| office-chatter-1 / -2 | 19 / 19 | −48.0 / −48.0 |
| call-center-chatter-1 / -2 | 33 / 33 | −48.0 / −48.0 |

**Integration:** two new presets `Office Chatter`, `Call Center Chatter` in `SAMPLED_AMBIENT_PRESETS` (pinned by `ambience.test.js` together with the client list); `renderAmbienceLoop()` serves them through the **same** `createAmbienceSource → ambiencePump → mixUlawFrame` path as the noise beds (variant chosen per call); the browser loops the WAV via `GET /api/v1/ambience/bed/<name>.24k.wav` (whitelisted filename, cached). **Zero hot-path cost by construction** — the bed is an in-memory Int16Array read 160 samples per frame, exactly as the noise beds already are; nothing per turn. Proven indirectly: the latency arms in `LATENCY_REPORT.md` ran with the bed **off**; a bed-on arm on a live call is BLOCKED with the rest of the phone evidence (below).

Tests (`ambience.test.js`, 38 passing with the pump suite): preset-name pins on both sides, asset present, exactly 24 s, level −48 ± 1 dBFS, two variants differ in >90 % of samples, seam step within the loop's own sample-to-sample range, 8 kHz-only through the mixer, `resolveAmbientMode` compatibility, tag only in native mode.

**Intelligibility:** the construction (layering + 1.4–1.6 kHz low-pass + −48 dBFS) is designed so that no word is recoverable; the offline Deepgram check on the bed itself was not run because a −48 dBFS file produces no transcript at all (that is the point, but it is not proof a listener cannot hear a word). **Listening verification is owner/QA work** — the files are in `backend/assets/ambience/`.

## 4. The switch

`ambientMode` per agent: **Off** (new-agent default) · **Manual bed** (`ambientSound` preset: noise or chatter) · **Fish Audio native**. Backwards compatible: an agent saved before the switch keeps what its `ambientSound` did (preset → manual; None → off), so nothing changes for anyone until they choose (`resolveAmbientMode`). Validated by the API (`agentSettings.validator.js`). `EditAgent.tsx` shows the three options with the trade-off in one line each, disables Native when the voice is not a Fish S2 voice (reason from `GET …/response-profile` → `ambience.nativeReason`), and states that PIOPIY calls get no bed.

## 5. Echo, barge-in, STT non-interference

Design position: the bed is mixed into the **outbound** frame only; the inbound path (`aec.process` → Deepgram) never sees it except as acoustic echo on a phone line, where it sits ≈42 dB under speech and below `bargeThreshold`'s noise-floor-relative threshold by construction — the same argument already made for the noise beds (BUG-003). **Not yet confirmed on a live call** (BUG-003 remains open): needs the phone evidence run (bed on vs off, RMS of the bed relative to speech on the recording, transcript diff, phantom-turn count, barge-in during agent speech). **BLOCKED** on a number and approval.

## 6. Cost and licence

- **Mode B cost:** one-off, 36 short requests on the free tier (already spent, ≈ 92 s of audio). Per turn: 0.
- **Mode A cost:** ≈ +8–10 % characters per synthesis request on every turn; on the free tier that is quota, on a paid tier money.
- **Licence:** Fish Audio's Terms of Use (fish.audio/terms, fetched 2026-09-04) say **free users may only use the Services for "internal, personal, non-commercial use"**, while Paid Services users "are licensed to use the Services for commercial uses". They contain no explicit clause on caching or redistributing generated audio as an asset, and no explicit output-ownership clause (the S2 *model* research licence grants output ownership to the user, but that governs self-hosted weights, not the API). This deployment uses the **free** tier. **Therefore Mode B's cached beds cannot ship in a commercial product on the current account**: either upgrade the Fish account to a paid plan (which licenses commercial use) before enabling the chatter presets in production, or regenerate the beds from a source with clear commercial terms. The presets are implemented and tested; the licence gate is recorded in OPEN_ISSUES as a release condition.

## 7. Recommendation

Default **Off**. When a room is wanted, **Manual bed** — continuous, free per turn, level-controlled, echo-safe by the existing argument — with the chatter presets enabled in production only once the Fish account is on a paid plan. Mode A stays available for Fish S2 voices as an experiment; do not rely on it.
