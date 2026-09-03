# Latency report — fix2_candidate
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 264  ·  turns with turnId: 24  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=20, filler-ack played=4, no-audio turns=0)
speculation: hit=18 miss=2 requests started=51 wasted=33 wasted chars≈1205 · hit rate 90% · extra requests per turn 1.65
grace tiers: finished=16 unfinished=4
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 18 | 950 | 1921 | 1931 | 1931 | 1931 |
| endpointMs | 18 | 455 | 1406 | 1410 | 1410 | 1410 |
| dgLastWordToSpeechFinalMs | 20 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 20 | 155 | 1106 | 1109 | 1109 | 1109 |
| dgCommitToTurnMs | 20 | 0 | 1 | 8752 | 8918 | 8918 |
| preLlmMs | 20 | 1 | 14 | 329 | 340 | 340 |
| prepMs | 20 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 20 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 20 | 658 | 2483 | 3378 | 3519 | 3519 |
| llmTtftAbsMs | 20 | 885 | 3142 | 3519 | 3559 | 3559 |
| specLeadMs | 18 | 162 | 1108 | 1110 | 1110 | 1110 |
| llmMs | 20 | 658 | 2484 | 3394 | 3521 | 3521 |
| ttsTtfaMs | 20 | 420 | 477 | 506 | 777 | 777 |
| ttfaMs | 20 | 1030 | 3261 | 3792 | 3855 | 3855 |
| waitMs | 20 | 1586 | 3718 | 4184 | 4276 | 4276 |
| totalMs | 20 | 1365 | 3644 | 4223 | 5257 | 5257 |
| harnessSpeechEndToFirstAudioMs | 20 | 2011 | 4537 | 4537 | 4758 | 4758 |
| harnessSpeechEndToFirstReplyAudioMs | 20 | 2070 | 4758 | 6223 | 7986 | 7986 |
| elLagP99Ms | 19 | 36 | 37 | 40 | 40 | 40 |
| elLagMaxMs | 19 | 39 | 45 | 59 | 59 | 59 |

## web · gemini-3.1-flash-lite  (turns=4, filler-ack played=0, no-audio turns=0)
speculation: hit=3 miss=1 requests started=10 wasted=7 wasted chars≈291 · hit rate 75% · extra requests per turn 1.75
grace tiers: finished=3
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 4 | 969 | 1598 | 1598 | 1598 | 1598 |
| endpointMs | 3 | 462 | 465 | 465 | 465 | 465 |
| dgLastWordToSpeechFinalMs | 3 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 3 | 162 | 165 | 165 | 165 | 165 |
| dgCommitToTurnMs | 4 | 0 | 1 | 1 | 1 | 1 |
| preLlmMs | 4 | 1 | 8 | 8 | 8 | 8 |
| prepMs | 4 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 4 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 4 | 1939 | 7253 | 7253 | 7253 | 7253 |
| llmTtftAbsMs | 4 | 2103 | 7253 | 7253 | 7253 | 7253 |
| specLeadMs | 3 | 164 | 165 | 165 | 165 | 165 |
| llmMs | 4 | 1946 | 7255 | 7255 | 7255 | 7255 |
| ttsTtfaMs | 4 | 393 | 480 | 480 | 480 | 480 |
| ttfaMs | 4 | 2341 | 7735 | 7735 | 7735 | 7735 |
| waitMs | 4 | 2804 | 7739 | 7739 | 7739 | 7739 |
| totalMs | 4 | 3141 | 7909 | 7909 | 7909 | 7909 |
| harnessSpeechEndToFirstAudioMs | 4 | 3311 | 9337 | 9337 | 9337 | 9337 |
| harnessSpeechEndToFirstReplyAudioMs | 4 | 3311 | 9337 | 9337 | 9337 | 9337 |
| elLagP99Ms | 4 | 36 | 37 | 37 | 37 | 37 |
| elLagMaxMs | 4 | 41 | 45 | 45 | 45 | 45 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
wrote D:/krishna_thete/HM-Voice-agent/reports/evidence/2026-09-03_phase2/latency/report_fix2_candidate/latency_{rows.jsonl,summary.csv,summary.md}
