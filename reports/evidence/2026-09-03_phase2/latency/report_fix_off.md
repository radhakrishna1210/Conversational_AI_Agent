# Latency report — fix_off
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 192  ·  turns with turnId: 16  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=16, filler-ack played=2, no-audio turns=0)
grace tiers: finished=12 unfinished=2
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 14 | 971 | 1590 | 1948 | 1948 | 1948 |
| endpointMs | 13 | 457 | 465 | 1402 | 1402 | 1402 |
| dgLastWordToSpeechFinalMs | 14 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 14 | 157 | 1102 | 1102 | 1102 | 1102 |
| dgCommitToTurnMs | 16 | 0 | 7994 | 9600 | 9600 | 9600 |
| preLlmMs | 16 | 2 | 299 | 375 | 375 | 375 |
| prepMs | 16 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 16 | 0 | 0 | 1 | 1 | 1 |
| llmTtftMs | 16 | 898 | 1232 | 4133 | 4133 | 4133 |
| llmTtftAbsMs | 16 | 898 | 1232 | 4133 | 4133 | 4133 |
| llmMs | 16 | 899 | 1234 | 4135 | 4135 | 4135 |
| ttsTtfaMs | 16 | 440 | 607 | 1006 | 1006 | 1006 |
| ttfaMs | 16 | 1391 | 1907 | 4734 | 4734 | 4734 |
| waitMs | 16 | 1862 | 2533 | 5191 | 5191 | 5191 |
| totalMs | 16 | 1753 | 2871 | 4918 | 4918 | 4918 |
| harnessSpeechEndToFirstAudioMs | 16 | 2381 | 5412 | 5709 | 5709 | 5709 |
| harnessSpeechEndToFirstReplyAudioMs | 16 | 2452 | 5709 | 5911 | 5911 | 5911 |
| elLagP99Ms | 15 | 36 | 36 | 37 | 37 | 37 |
| elLagMaxMs | 15 | 38 | 44 | 45 | 45 | 45 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
wrote D:/krishna_thete/HM-Voice-agent/reports/evidence/2026-09-03_phase2/latency/report_fix_off/latency_{rows.jsonl,summary.csv,summary.md}
