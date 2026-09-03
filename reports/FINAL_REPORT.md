# FINAL REPORT — HM-Voice-agent, phase 2 (latency, transfer, ambience, audit items)

## NOT DONE — OPEN OR BLOCKED ITEMS REMAIN

**Release recommendation: NO-GO** for the latency target and for a production deploy of this branch as a whole; the security and correctness fixes on it are safe to take ahead (§8).

---

## 1. Exactly what was tested

| | |
|---|---|
| Branch | `release/readiness-audit` |
| **Commit tested in the final session** | `f98298e6c56fb83d9043ca9c4d1f124f1b56a3f8` (feature work `8b206b1`, lint clean-ups `924a77f`, `f98298e`; this report and the gate evidence are committed on top and change no code) |
| Final verification session | 2026-09-04 01:03:56 → 01:06:14 IST, one sitting, `reports/scripts/rerun_static_gates.sh` → `reports/evidence/2026-09-04_gates/` (`00_session.txt`) |
| Environment | Windows 11 10.0.26200 · Node v24.19.0 · npm 11.17.0 · embedded Postgres 17 on `:5499` (no pgvector) · portable Redis 5 on `:6390` · no Docker |
| Configuration fingerprint | 60 vars in `backend/.env` (never committed, values not recorded); `DATABASE_URL` → Supabase `ap-southeast-1` (**production**) — every phase-2 backend ran with it **overridden** to `:5499`; `PUBLIC_BACKEND_WS_URL` → ngrok dev tunnel (no evidence taken through it) |
| Not touched | the owner's backend on `:4000` (production DB), production data, Redis `:6379`, git history, remotes (nothing pushed) |

Latency runs: `reports/evidence/2026-09-03_phase2/latency/` (commit `139f797` + the phase-2 working tree at the time, recorded in `arms_session.txt`; the code that ran is what `8b206b1` contains).

## 2. Latency — achieved numbers (milliseconds; the "microseconds" wording is physically impossible and was read as ms, stated once in `LATENCY_REPORT.md` §1)

**Web, actual** — end of caller speech → first non-filler reply audio at the WebSocket boundary (`scripts/measure-webcall.mjs`, real Deepgram/Gemini/Sarvam, 24 turns per arm, same 12 utterances, 0 cut-offs, 0 failures):

| arm | n | p50 | p90 | p95 | p99 | max | kind |
|---|---:|---:|---:|---:|---:|---:|---|
| **before** (phase 1, server-side `waitMs`, historical) | 52 | 2245 | 3581 | 6820 | 12596 | 12596 | actual, server-side, undercounts end-of-speech |
| **before** (this harness, speculation off) | 24 | **2861** | 6428 | 6673 | 9710 | 9710 | actual |
| **after** — speculation on pause (new default) | 24 | **2136** | 6223 | 7986 | 9337 | 9337 | actual |
| after — speculation while speaking | 24 | **2113** | 4115 | 5580 | 5603 | 5603 | actual |
| perceived (ack clip), default arm | 24 | 2116 | 4537 | 4758 | 9337 | 9337 | perceived (clip rarely beats the reply on this arm) |

**Phone:** 0 turns measured, ever — **BLOCKED** (no number, no call approval).

**Verdict:** web 300–500 ms **NOT MET** (p50 2,136 ms, −725 ms / −25 %); phone 400–700 ms **NOT MEASURED**.

## 3. Where the remaining milliseconds live (default arm, p50 / p90)

| stage | p50 | p90 | who owns it |
|---|---:|---:|---|
| caller stops → server commits (Deepgram `speech_final` delivery, incl. 300 ms endpointing + 150–400 ms grace) | **950** | 1921 | Deepgram (US) from India; `endpointing=100`, `nova-3`, and a server-side local-VAD commit were all tried — no gain / cut callers off |
| commit → runtime | 5 | | fixed in phase 1 |
| LLM first token seen by the turn (speculation already ran 162 ms p50 / 1108 ms p90 of it) | 658 | 2483 | Gemini 3.5 flash-lite on this account: p50 1.3 s, p90 5.3 s (bake-off); Groq p50 9.8 s (rate-limited) |
| TTS first byte (Sarvam HTTP, first sentence) | 420 | 477 | provider; socket TTS voices not on this account's free tiers |
| ordering + WebSocket transit | ≈100 | | |
| **total at the socket** | **2136** | 6223 | |

Speculation hit rate 90 % (default) / 80 % (aggressive); **1.65 discarded LLM requests per turn** (≈300 wasted tokens/turn) — the cost of the 725 ms, chosen per agent (`speculation` off|candidate|interim) and platform-wide (`VOICE_SPECULATION`).

## 4. Transfer — status per carrier

| carrier | implementation | happy path | failure paths (busy / no-answer / invalid / carrier refuses / caller hangs up / no number / out of hours) | evidence |
|---|---|---|---|---|
| Twilio | REST call update → `<Dial timeout callerId action>` + status callback; resume via `<Connect><Stream>` with `transferOutcome` | code + HTTP tests | all mapped to an honest spoken line + `CallTransfer` status; HTTP tests for every outcome | unit 17 + HTTP 9; **live BLOCKED** |
| Plivo | Transfer API `aleg_url` → served `<Dial … redirect="true">`; resume via `<Stream>` URL | same | same | same; **live BLOCKED** |
| PIOPIY | **unsupported** (no live redirect on PCMO stream; modular bridge does not run there) | prompt tells the caller honestly | `UNAVAILABLE` | unit |
| Web | no phone leg → honest refusal + callback offer, `WEB_CALLBACK` row | measured on the harness turn "Can I speak to a real person" → "I can't connect you to someone directly on this call…" | | harness console |

Intent: regex pre-filter (EN/HI/Hinglish, negation and reported speech scoped to the clause) + `[[TRANSFER]]` marker from the model, stripped before TTS in every fragmentation (11 tests). Both legs billed once (controller finalises after the human leg). Details: `CALL_TRANSFER.md`.

## 5. Background voice ambience — both modes

| mode | result | tag leak | intelligibility | non-interference (echo/barge/STT) | latency | cost / licence |
|---|---|---|---|---|---|---|
| **A: Fish native (S2 inline tag)** | implemented, opt-in, Fish S2 voices only | **0 / 8** tagged utterances leaked on `s2.1-pro-free` (Deepgram transcript check) | n/a | n/a (exists only while the agent speaks) | no measurable TTFB cost | +8–10 % chars/turn; effect unreliable (only "office chatter" raised the floor, to an uncontrollable −23 dBFS) → **not default** |
| **B: pre-rendered bed** | implemented: `Office Chatter`, `Call Center Chatter`, 2 variants each, 24 s, −48 dBFS, seam-free, through the existing mixer + browser loop | n/a (no tag) | by construction (layering + 1.4–1.6 kHz low-pass + −48 dBFS); **listening check not done** | design argument same as the noise beds; **live BLOCKED** (BUG-003 still open) | **0 ms** per turn by construction (in-memory loop, same path as the noise beds) | one-off; **Fish free tier is non-commercial → beds must not ship commercially until the plan is upgraded (E-7)** |

**Recommended default: Off; when a room is wanted, Manual bed** (after the licence step). Switch `ambientMode` off|manual|native is persisted, validated, and honest in the editor. Details: `AMBIENCE_VOICE.md`.

## 6. Consolidated table (key items; every row in `QA_FINAL_MATRIX.md` / `.csv`)

| Item | Baseline evidence | Fix | Final evidence | Status |
|---|---|---|---|---|
| Web actual latency | harness off-arm p50 2861 | speculation + timeline + Deepgram fixes | p50 2136 (`report_fix2_candidate.md`) | **FAIL vs target, improved** |
| Phone latency | 0 rows | instrumentation present | 0 rows | **BLOCKED** |
| Turn cut at first word (2 Deepgram bugs) | 7–11 / 24–30 turns (runs 1–2) | `deepgramStream.service.js` guards + tests | 0 / 72 (run 3) | **PASS** |
| Transfer is prompt-only (P1) | `git grep` | full path, 3 carriers' truth, DB table, UI | 37 tests green; live BLOCKED | **PASS (code) / BLOCKED (live)** |
| Ambience has no voices | `ambience.js` | Mode B beds + Mode A option + switch | 38 tests; probe 0/8 leaks | **PASS (unit/probe)**; licence BLOCKED |
| No isolated DB | prod only | embedded Postgres + Redis, seed guard | harness ran with no prod writes | **PARTIAL** (billing suites still read `DATABASE_URL`) |
| Repo cannot build DB / orphans / no lock file | B17/B23/B24 | baseline + seed + call_transfer migrations, archive, lock | rehearsed resolve+deploy on a clone (`db/rehearsal_existing_db.txt`) | **PASS (repo)** — production `migrate resolve` pending approval |
| Fixture contamination | 131/182 | cleanup script now covers `__test__`, guarded | not run on prod | **FAIL (owner)** |
| Hourly renewal failures | B33 | `SUBSCRIPTION_RENEWAL_ENABLED` switch | decision pending | **FAIL (owner)** |
| Client lint | 87 errors | 10 `any` fixed properly, 5 other errors fixed, ratchet + baseline 76 | ratchet exit 0; full lint still lists 76 | **FAIL (rule) / PASS (ratchet)** |
| WS tests time out | reported | did not reproduce | 50/50 in 2 s; import 429–511 ms | **PASS** |
| Backend high advisories | 0 high | — | 3 moderate (`qs`, no effective fix) | **FAIL (moderate)** |
| Client advisories | 0 high | — | 2 moderate (react-router 7 major) | **FAIL (moderate)** |
| Keys in git history | present | — | rotation unconfirmed | **OPEN (owner)** |
| Issue C, legacy subscriptions, A-15 | no spec | asked, not invented | — | **BLOCKED (spec)** |

## 7. Summary counts (`QA_FINAL_MATRIX.csv`, 124 rows; the brief's 314-case sheet does not exist in this repository — E-8)

| PASS (fresh executed) | PASS (code/unit/probe/design) | FAIL | BLOCKED | OPEN | UNVERIFIED | PARTIAL | N/A |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 36 | 40 | 11 | 21 | 4 | 10 | 2 | 0 |

## 8. Commands executed in the final session (exit → evidence)

| command | exit | evidence |
|---|---|---|
| `npm test` (backend) — 1074 tests, 1017 pass, 0 fail, 57 skipped (DB suites) | 0 | `2026-09-04_gates/01_backend_npm_test.log` |
| `npm run test:ws` — 50/50 | 0 | `02_backend_test_ws.log` |
| `npm run test:voice` — 352/352 | 0 | `03_backend_test_voice.log` |
| `npm run test:stt` — 132/132 | 0 | `04_backend_test_stt.log` |
| `npx tsc --noEmit` (client) | 0 | `05_client_tsc.log` |
| `node scripts/lint-ratchet.mjs` — 76 `any` at baseline, 0 other errors | 0 | `06_client_lint_ratchet.log` |
| `npm run build` (client) | 0 | `07_client_build.log` |
| `npm audit --omit=dev` (backend) — 3 moderate | **1** | `08_backend_audit_prod.log` |
| `npm audit --omit=dev` (client) — 2 moderate | **1** | `09_client_audit_prod.log` |
| `npx prisma validate` | 0 | `10_prisma_validate.log` |
| `node --check` over every backend source/script | 0 | `11_backend_syntax.log` |
| secret scan (tracked tree) — 0 hits | 0 | `12_secret_scan.log` |
| `import('./src/ws/modularMediaBridge.js')` — 511 ms | 0 | `13_import_time_bridge.log` |
| `npm run lint` (client, unfiltered) — 76 errors (all baselined `any`) + 22 warnings | 1 (expected) | `14_client_lint_full.log` |

Earlier in the phase (not in the sitting, all under `2026-09-03_phase2/`): latency arms runs 1–4 (`arms_run*.txt`, 8 arms, 216 turns), LLM bake-off, Fish tag probe (10 syntheses), chatter-bed build (36 syntheses), migration rehearsal, full suites after each feature (`02_`, `03_`, `05_`, `06_`). Provider quota was spent for these (Deepgram, Gemini, Groq, Sarvam, Fish); no database other than the disposable ones was written.

**Not run, deliberately or because blocked:** anything writing to production; phone calls; browser sessions (Playwright / the in-page `turn-timing` measurement); concurrency/load; the 57 billing integration suites; the bundled speech-to-speech route; `git filter-repo`; pushing.

## 9. Open / blocking items and the precise action required (full list: `OPEN_ISSUES.md`)

1. **Phone evidence** (owner): approve N calls from a number you own on the Mumbai VPS, with a human on the transfer target. Unblocks L-2, transfer live paths, BUG-001/003 live, ambience non-interference.
2. **Sub-second latency is a provider decision** (owner): the floor is Deepgram's ~950 ms end-of-speech from India plus a rate-limited LLM tier. Options: STT with fast finals near the caller; paid Gemini/Groq tier; a socket-streaming TTS voice; or benchmark the bundled realtime route. The speculative/turn-end machinery is in place for any of them.
3. **Production migration step** (owner, once, before the next deploy): `npx prisma migrate resolve --applied 0000000000000_baseline` then `npx prisma migrate deploy`.
4. **Fixture cleanup** (owner): backup → `node --env-file=.env scripts/clean-test-data.js --dry-run` on a restored copy → real run with `--i-have-a-fresh-backup-of-production`.
5. **Renewal sweep** (owner): set `SUBSCRIPTION_RENEWAL_ENABLED=false` or clean fixtures; decide the legacy-subscription treatment.
6. **Fish Audio plan** (owner): upgrade before enabling the chatter presets commercially.
7. **Rotate Google and Groq keys; decide on history purge** (owner).
8. **Issue C, A-15, legacy subscriptions**: supply the specifications.
9. **Billing integration suites**: point at `TEST_DATABASE_URL` with a refuse-production guard (engineering, small).
10. **react-router 7 upgrade** behind a browser regression pass (engineering).
11. Say whether the pre-session working-tree revert of `139f797` was deliberate (D-13).

## 10. Changed files, migrations, configuration, deployment, rollback

**Backend, new:** `services/voice/{speculativeTurn,frameVad,transferIntent}.js`, `services/telephony/transfer.service.js`, `controllers/transfer.controller.js`, `routes/transfer.routes.js`, `validators/agentSettings.validator.js`, `scripts/{measure-webcall,seed-test-db,probe-fish-tags,build-chatter-bed}.mjs`, `assets/ambience/*` (4 beds + manifest), tests: `speculativeTurn`, `frameVad`, `transferIntent`, `transfer.service`, `transferCallbacks`, `deepgramInterimHooks`, `fishAmbienceTag`, `agentSettings.validator`.
**Backend, changed:** `stt/deepgramStream.service.js` (interim hooks, timeline, local flush, two guards), `agentRuntime.service.js` (speculation handoff, transfer marker/prompt/event, ambience tag, log fields), `ws/webCallModularRealtime.handler.js`, `ws/modularMediaBridge.js` (speculation, transfer, resume, ambient mode), `ws/{twilio,plivo}MediaModular.handler.js` (carrier ids, outcome), `server.js` (transfer outcome param, renewal switch), `gemini/groq/openai` services (AbortSignal), `voice/ambience.js`, `voice/greetingAudio.js`, `providers/fishaudio.provider.js`, `controllers/{agent,agentRuntime}.controller.js`, `routes/index.js`, `scripts/{latency-report,clean-test-data}`, `package.json` (test glob), `.env.example`, `prisma/schema.prisma`.
**Client:** `pages/EditAgent.tsx` (transfer, speculation, ambience-mode controls), `services/ambientSound.ts`, `lib/whapi.ts`, `services/{audioPlayer,ttsSocket}.ts`, `components/{DashboardLayout,VoiceConfigModal,ui/chart,broadcast/RecordingStudio}.tsx`, `scripts/lint-ratchet.mjs`, `lint-baseline.json`, `package.json`.
**Reports:** `LATENCY_REPORT.md`, `CALL_TRANSFER.md`, `AMBIENCE_VOICE.md`, `QA_FINAL_MATRIX.md/.csv`, `OPEN_ISSUES.md`, `REGRESSION_CROSSCHECK.md` §7, `BASELINE_AUDIT.md` §10, `reports/scripts/{run_latency_arms.sh,rerun_static_gates.sh,matrix_to_csv.mjs}`, evidence dirs `2026-09-03_phase2/`, `2026-09-04_gates/`.

**Migrations:** `0000000000000_baseline` (full schema + `CREATE EXTENSION IF NOT EXISTS vector`), `0000000000001_seed_pricing_bands` (idempotent), `20260904000000_call_transfer` (new table `CallTransfer`, two indexes); 17 previous directories moved to `prisma/migrations_archive/`; `migration_lock.toml` added. **Existing databases must be resolved once (§9.3) or the next `migrate deploy` will try to create every table.**

**Configuration (all optional, defaults preserve behaviour):** `VOICE_SPECULATION`, `VOICE_LOCAL_ENDPOINTING`, `DEEPGRAM_LOCAL_FLUSH_TIMEOUT_MS`, `VOICE_SPECULATION_DEBOUNCE_MS`, `VOICE_SPECULATION_MIN_DELTA`, `TRANSFER_CALLBACK_SECRET`, `PUBLIC_BACKEND_HTTP_URL`, `AMBIENCE_ASSET_DIR`, `SUBSCRIPTION_RENEWAL_ENABLED`. New per-agent settings: `speculation`, `transferLabel/Mode/TimeoutSec/OutOfHours/Hours`, `ambientMode`. Protocol: new server→client `transfer` frame (ignored by old clients); `latency.log` gains fields only.

**Deploy:** merge → `npm ci` in `backend/` and `client/` → `npm run build` (client) → **production `prisma migrate resolve --applied 0000000000000_baseline`** → `pm2 startOrReload ecosystem.config.cjs --only convai-voice-api` (runs `migrate deploy` via `prestart`). Nginx must expose `/api/v1/telephony/transfer/*` and `/api/v1/ambience/bed/*` (same `/api/v1` prefix as everything else).

**Rollback:** `git revert f98298e 924a77f 8b206b1` (the `CallTransfer` table can stay; it is additive), `npm ci`, redeploy. If the baseline was already resolved on production, keep `prisma/migrations` as it is after the revert or re-add `migration_lock.toml`; the archived directories are history only.

## 11. What this phase did not do, stated plainly

It did not place a phone call, did not drive a browser, did not load-test, did not touch production data, did not benchmark the bundled realtime route, did not prove either latency target. It measured the web route honestly for the first time (and found it slower than every prior estimate), cut its median by a quarter, fixed two turn-boundary bugs that were silently dropping a third of harness turns, replaced a fake transfer with a real one whose failure paths are tested, built the voice ambience with its licence and its limits stated, baselined the migrations and rehearsed the production step, and left every remaining item with a named owner and action.
