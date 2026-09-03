# Latency report — spec_candidate
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 162  ·  turns with turnId: 20  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=17, filler-ack played=3, no-audio turns=0)
speculation: hit=14 miss=3 requests started=43 wasted=29 wasted chars≈1145 · hit rate 82% · extra requests per turn 1.71
grace tiers: finished=13 unfinished=3
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 15 | 1086 | 1765 | 3169 | 3169 | 3169 |
| endpointMs | 14 | 455 | 501 | 1414 | 1414 | 1414 |
| dgLastWordToSpeechFinalMs | 15 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 15 | 155 | 2158 | 2158 | 2158 | 2158 |
| dgCommitToTurnMs | 17 | 1 | 8002 | 8966 | 8966 | 8966 |
| preLlmMs | 17 | 3 | 443 | 497 | 497 | 497 |
| prepMs | 17 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 17 | 0 | 0 | 1 | 1 | 1 |
| llmTtftMs | 17 | 701 | 1235 | 1264 | 1264 | 1264 |
| llmTtftAbsMs | 17 | 891 | 1392 | 1415 | 1415 | 1415 |
| specLeadMs | 14 | 157 | 755 | 2163 | 2163 | 2163 |
| llmMs | 17 | 717 | 1240 | 1265 | 1265 | 1265 |
| ttsTtfaMs | 17 | 405 | 623 | 664 | 664 | 664 |
| ttfaMs | 17 | 1060 | 1704 | 1887 | 1887 | 1887 |
| waitMs | 17 | 1596 | 2163 | 2339 | 2339 | 2339 |
| totalMs | 17 | 1420 | 2213 | 2413 | 2413 | 2413 |
| harnessSpeechEndToFirstAudioMs | 17 | 2393 | 4633 | 5624 | 5624 | 5624 |
| harnessSpeechEndToFirstReplyAudioMs | 17 | 2393 | 5624 | 5649 | 5649 | 5649 |
| elLagP99Ms | 16 | 37 | 41 | 47 | 47 | 47 |
| elLagMaxMs | 16 | 48 | 62 | 66 | 66 | 66 |

## web · gemini-3.1-flash-lite  (turns=3, filler-ack played=1, no-audio turns=0)
speculation: hit=2 miss=1 requests started=7 wasted=5 wasted chars≈349 · hit rate 67% · extra requests per turn 1.67
grace tiers: unfinished=2 finished=1
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 2 | 1072 | 2960 | 2960 | 2960 | 2960 |
| endpointMs | 2 | 451 | 1414 | 1414 | 1414 | 1414 |
| dgLastWordToSpeechFinalMs | 3 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 3 | 2057 | 2057 | 2057 | 2057 | 2057 |
| dgCommitToTurnMs | 3 | 0 | 10083 | 10083 | 10083 | 10083 |
| preLlmMs | 3 | 9 | 384 | 384 | 384 | 384 |
| prepMs | 3 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 3 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 3 | 1435 | 2556 | 2556 | 2556 | 2556 |
| llmTtftAbsMs | 3 | 2712 | 3271 | 3271 | 3271 | 3271 |
| specLeadMs | 2 | 156 | 2065 | 2065 | 2065 | 2065 |
| llmMs | 3 | 1437 | 2560 | 2560 | 2560 | 2560 |
| ttsTtfaMs | 3 | 399 | 432 | 432 | 432 | 432 |
| ttfaMs | 3 | 1835 | 2917 | 2917 | 2917 | 2917 |
| waitMs | 3 | 3063 | 3373 | 3373 | 3373 | 3373 |
| totalMs | 3 | 2196 | 3836 | 3836 | 3836 | 3836 |
| harnessSpeechEndToFirstAudioMs | 3 | 4556 | 4609 | 4609 | 4609 | 4609 |
| harnessSpeechEndToFirstReplyAudioMs | 3 | 4609 | 5986 | 5986 | 5986 | 5986 |
| elLagP99Ms | 3 | 38 | 40 | 40 | 40 | 40 |
| elLagMaxMs | 3 | 49 | 54 | 54 | 54 | 54 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
