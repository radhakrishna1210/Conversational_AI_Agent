# Latency report — fix_candidate
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 192  ·  turns with turnId: 14  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=13, filler-ack played=1, no-audio turns=0)
speculation: hit=11 miss=2 requests started=26 wasted=15 wasted chars≈476 · hit rate 85% · extra requests per turn 1.15
grace tiers: finished=10 unfinished=1
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 12 | 953 | 1616 | 1903 | 1903 | 1903 |
| endpointMs | 11 | 457 | 468 | 1404 | 1404 | 1404 |
| dgLastWordToSpeechFinalMs | 11 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 11 | 157 | 168 | 1104 | 1104 | 1104 |
| dgCommitToTurnMs | 13 | 0 | 1 | 8004 | 8004 | 8004 |
| preLlmMs | 13 | 2 | 13 | 382 | 382 | 382 |
| prepMs | 13 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 13 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 13 | 775 | 22052 | 23056 | 23056 | 23056 |
| llmTtftAbsMs | 13 | 1015 | 22220 | 23211 | 23211 | 23211 |
| specLeadMs | 11 | 654 | 967 | 1106 | 1106 | 1106 |
| llmMs | 13 | 789 | 22060 | 23058 | 23058 | 23058 |
| ttsTtfaMs | 13 | 391 | 498 | 578 | 578 | 578 |
| ttfaMs | 13 | 1180 | 22406 | 23448 | 23448 | 23448 |
| waitMs | 13 | 1730 | 22875 | 23904 | 23904 | 23904 |
| totalMs | 13 | 1840 | 23284 | 23742 | 23742 | 23742 |
| harnessSpeechEndToFirstAudioMs | 13 | 2229 | 23327 | 24368 | 24368 | 24368 |
| harnessSpeechEndToFirstReplyAudioMs | 13 | 2229 | 23327 | 24368 | 24368 | 24368 |
| elLagP99Ms | 12 | 36 | 37 | 39 | 39 | 39 |
| elLagMaxMs | 12 | 40 | 43 | 46 | 46 | 46 |

## web · gemini-3.1-flash-lite  (turns=1, filler-ack played=0, no-audio turns=0)
speculation: hit=1 miss=0 requests started=3 wasted=2 wasted chars≈109 · hit rate 100% · extra requests per turn 2.00
grace tiers: finished=1
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 1 | 895 | 895 | 895 | 895 | 895 |
| endpointMs | 1 | 451 | 451 | 451 | 451 | 451 |
| dgLastWordToSpeechFinalMs | 1 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 1 | 151 | 151 | 151 | 151 | 151 |
| dgCommitToTurnMs | 1 | 0 | 0 | 0 | 0 | 0 |
| preLlmMs | 1 | 3 | 3 | 3 | 3 | 3 |
| prepMs | 1 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 1 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 1 | 1239 | 1239 | 1239 | 1239 | 1239 |
| llmTtftAbsMs | 1 | 1393 | 1393 | 1393 | 1393 | 1393 |
| specLeadMs | 1 | 154 | 154 | 154 | 154 | 154 |
| llmMs | 1 | 1241 | 1241 | 1241 | 1241 | 1241 |
| ttsTtfaMs | 1 | 454 | 454 | 454 | 454 | 454 |
| ttfaMs | 1 | 1694 | 1694 | 1694 | 1694 | 1694 |
| waitMs | 1 | 2148 | 2148 | 2148 | 2148 | 2148 |
| totalMs | 1 | 1941 | 1941 | 1941 | 1941 | 1941 |
| harnessSpeechEndToFirstAudioMs | 1 | 2593 | 2593 | 2593 | 2593 | 2593 |
| harnessSpeechEndToFirstReplyAudioMs | 1 | 2593 | 2593 | 2593 | 2593 | 2593 |
| elLagP99Ms | 1 | 36 | 36 | 36 | 36 | 36 |
| elLagMaxMs | 1 | 40 | 40 | 40 | 40 | 40 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
