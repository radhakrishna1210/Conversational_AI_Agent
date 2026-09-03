# Latency report — ep100nova3
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 300  ·  turns with turnId: 12  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=10, filler-ack played=1, no-audio turns=0)
speculation: hit=8 miss=2 requests started=25 wasted=17 wasted chars≈855 · hit rate 80% · extra requests per turn 1.70
grace tiers: finished=7 unfinished=2
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 9 | 1107 | 2849 | 2849 | 2849 | 2849 |
| endpointMs | 8 | 454 | 1402 | 1402 | 1402 | 1402 |
| dgLastWordToSpeechFinalMs | 9 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 9 | 157 | 1102 | 1102 | 1102 | 1102 |
| dgCommitToTurnMs | 10 | 0 | 2 | 9200 | 9200 | 9200 |
| preLlmMs | 10 | 2 | 13 | 320 | 320 | 320 |
| prepMs | 10 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 10 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 10 | 674 | 1005 | 1211 | 1211 | 1211 |
| llmTtftAbsMs | 10 | 847 | 1161 | 1369 | 1369 | 1369 |
| specLeadMs | 8 | 158 | 1109 | 1109 | 1109 | 1109 |
| llmMs | 10 | 683 | 1006 | 1212 | 1212 | 1212 |
| ttsTtfaMs | 10 | 382 | 431 | 478 | 478 | 478 |
| ttfaMs | 10 | 1082 | 1384 | 1596 | 1596 | 1596 |
| waitMs | 10 | 1535 | 1905 | 2054 | 2054 | 2054 |
| totalMs | 10 | 1705 | 2450 | 2456 | 2456 | 2456 |
| harnessSpeechEndToFirstAudioMs | 10 | 2485 | 3933 | 4538 | 4538 | 4538 |
| harnessSpeechEndToFirstReplyAudioMs | 10 | 2485 | 3933 | 5371 | 5371 | 5371 |
| elLagP99Ms | 9 | 36 | 38 | 38 | 38 | 38 |
| elLagMaxMs | 9 | 37 | 43 | 43 | 43 | 43 |

## web · gemini-3.1-flash-lite  (turns=2, filler-ack played=0, no-audio turns=0)
speculation: hit=1 miss=1 requests started=5 wasted=4 wasted chars≈194 · hit rate 50% · extra requests per turn 2.00
grace tiers: finished=1
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 2 | 976 | 1685 | 1685 | 1685 | 1685 |
| endpointMs | 1 | 454 | 454 | 454 | 454 | 454 |
| dgLastWordToSpeechFinalMs | 1 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 1 | 154 | 154 | 154 | 154 | 154 |
| dgCommitToTurnMs | 2 | 0 | 0 | 0 | 0 | 0 |
| preLlmMs | 2 | 3 | 8 | 8 | 8 | 8 |
| prepMs | 2 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 2 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 2 | 1420 | 2534 | 2534 | 2534 | 2534 |
| llmTtftAbsMs | 2 | 1576 | 2534 | 2534 | 2534 | 2534 |
| specLeadMs | 1 | 156 | 156 | 156 | 156 | 156 |
| llmMs | 2 | 1421 | 2536 | 2536 | 2536 | 2536 |
| ttsTtfaMs | 2 | 479 | 509 | 509 | 509 | 509 |
| ttfaMs | 2 | 1932 | 3020 | 3020 | 3020 | 3020 |
| waitMs | 2 | 2389 | 3028 | 3028 | 3028 | 3028 |
| totalMs | 2 | 2190 | 3223 | 3223 | 3223 | 3223 |
| harnessSpeechEndToFirstAudioMs | 2 | 2910 | 4712 | 4712 | 4712 | 4712 |
| harnessSpeechEndToFirstReplyAudioMs | 2 | 2910 | 4712 | 4712 | 4712 | 4712 |
| elLagP99Ms | 2 | 36 | 37 | 37 | 37 | 37 |
| elLagMaxMs | 2 | 40 | 41 | 41 | 41 | 41 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
wrote D:/krishna_thete/HM-Voice-agent/reports/evidence/2026-09-03_phase2/latency/report_ep100nova3/latency_{rows.jsonl,summary.csv,summary.md}
