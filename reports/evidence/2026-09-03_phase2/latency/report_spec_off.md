# Latency report — spec_off
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 162  ·  turns with turnId: 24  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=24, filler-ack played=5, no-audio turns=0)
grace tiers: finished=16 unfinished=8
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 21 | 1104 | 2072 | 2997 | 3070 | 3070 |
| endpointMs | 19 | 459 | 1409 | 1411 | 1411 | 1411 |
| dgLastWordToSpeechFinalMs | 20 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 20 | 159 | 2006 | 2006 | 2165 | 2165 |
| dgCommitToTurnMs | 24 | 1 | 10471 | 10584 | 21652 | 21652 |
| preLlmMs | 24 | 2 | 18 | 428 | 482 | 482 |
| prepMs | 24 | 0 | 0 | 0 | 1 | 1 |
| ragMs | 24 | 0 | 0 | 0 | 1 | 1 |
| llmTtftMs | 24 | 868 | 1338 | 2348 | 4285 | 4285 |
| llmTtftAbsMs | 24 | 868 | 1338 | 2348 | 4285 | 4285 |
| llmMs | 24 | 885 | 1342 | 2350 | 4287 | 4287 |
| ttsTtfaMs | 24 | 514 | 763 | 826 | 862 | 862 |
| ttfaMs | 24 | 1419 | 2051 | 2715 | 4846 | 4846 |
| waitMs | 24 | 1924 | 3173 | 3242 | 5306 | 5306 |
| totalMs | 24 | 2105 | 3231 | 3354 | 4972 | 4972 |
| harnessSpeechEndToFirstAudioMs | 24 | 2678 | 4672 | 4907 | 5849 | 5849 |
| harnessSpeechEndToFirstReplyAudioMs | 24 | 2934 | 5535 | 5612 | 5849 | 5849 |
| elLagP99Ms | 23 | 37 | 44 | 45 | 47 | 47 |
| elLagMaxMs | 23 | 47 | 56 | 60 | 62 | 62 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
wrote D:/krishna_thete/HM-Voice-agent/reports/evidence/2026-09-03_phase2/latency/report_spec_off/latency_{rows.jsonl,summary.csv,summary.md}
