# Latency report — final session, pre-existing log
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 70  ·  turns with turnId: 0  ·  legacy rows: 70

## web · gemini-3.5-flash-lite  (turns=61, filler-ack played=19, no-audio turns=0)
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| endpointMs | 24 | 706 | 713 | 714 | 717 | 717 |
| preLlmMs | 61 | 8 | 921 | 1162 | 1260 | 1260 |
| prepMs | 61 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 61 | 0 | 1 | 3 | 4 | 4 |
| llmTtftMs | 61 | 1130 | 2225 | 5995 | 10147 | 10147 |
| llmMs | 61 | 1137 | 2507 | 5998 | 10163 | 10163 |
| ttsTtfaMs | 61 | 528 | 984 | 1186 | 2068 | 2068 |
| ttfaMs | 61 | 1707 | 3062 | 6816 | 12918 | 12918 |
| waitMs | 52 | 2245 | 3581 | 6820 | 12596 | 12596 |
| totalMs | 61 | 3573 | 7102 | 9655 | 15030 | 15030 |

## unknown  (turns=3, filler-ack played=0, no-audio turns=3)
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|

## web · openai/gpt-oss-20b  (turns=6, filler-ack played=1, no-audio turns=0)
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| preLlmMs | 6 | 526 | 697 | 697 | 697 | 697 |
| prepMs | 6 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 6 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 6 | 6618 | 31323 | 31323 | 31323 | 31323 |
| llmMs | 6 | 6710 | 31388 | 31388 | 31388 | 31388 |
| ttsTtfaMs | 6 | 1208 | 1622 | 1622 | 1622 | 1622 |
| ttfaMs | 6 | 8116 | 32411 | 32411 | 32411 | 32411 |
| totalMs | 6 | 8382 | 32980 | 32980 | 32980 | 32980 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record.
wrote reports/evidence/2026-09-03_final/latency/latency_{rows.jsonl,summary.csv,summary.md}
