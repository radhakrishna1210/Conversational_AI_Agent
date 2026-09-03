# Latency report — ep100
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 300  ·  turns with turnId: 12  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=12, filler-ack played=2, no-audio turns=0)
speculation: hit=10 miss=2 requests started=29 wasted=19 wasted chars≈1020 · hit rate 83% · extra requests per turn 1.58
grace tiers: finished=9 unfinished=2
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 11 | 961 | 1564 | 1903 | 1903 | 1903 |
| endpointMs | 10 | 458 | 483 | 1403 | 1403 | 1403 |
| dgLastWordToSpeechFinalMs | 11 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 11 | 159 | 1103 | 1103 | 1103 | 1103 |
| dgCommitToTurnMs | 12 | 0 | 2 | 8985 | 8985 | 8985 |
| preLlmMs | 12 | 2 | 18 | 284 | 284 | 284 |
| prepMs | 12 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 12 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 12 | 727 | 1142 | 3535 | 3535 | 3535 |
| llmTtftAbsMs | 12 | 888 | 1297 | 3696 | 3696 | 3696 |
| specLeadMs | 10 | 161 | 650 | 1105 | 1105 | 1105 |
| llmMs | 12 | 733 | 1143 | 3536 | 3536 | 3536 |
| ttsTtfaMs | 12 | 390 | 700 | 706 | 706 | 706 |
| ttfaMs | 12 | 1112 | 1844 | 4152 | 4152 | 4152 |
| waitMs | 12 | 1567 | 2299 | 4614 | 4614 | 4614 |
| totalMs | 12 | 1565 | 3072 | 4721 | 4721 | 4721 |
| harnessSpeechEndToFirstAudioMs | 12 | 2163 | 4509 | 5115 | 5115 | 5115 |
| harnessSpeechEndToFirstReplyAudioMs | 12 | 2163 | 5115 | 5406 | 5406 | 5406 |
| elLagP99Ms | 11 | 36 | 36 | 37 | 37 | 37 |
| elLagMaxMs | 11 | 38 | 38 | 38 | 38 | 38 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
wrote D:/krishna_thete/HM-Voice-agent/reports/evidence/2026-09-03_phase2/latency/report_ep100/latency_{rows.jsonl,summary.csv,summary.md}
