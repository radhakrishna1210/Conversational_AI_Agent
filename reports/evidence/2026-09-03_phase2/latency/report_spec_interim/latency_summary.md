# Latency report — spec_interim
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 162  ·  turns with turnId: 19  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=17, filler-ack played=4, no-audio turns=0)
speculation: hit=13 miss=4 requests started=39 wasted=26 wasted chars≈1556 · hit rate 76% · extra requests per turn 1.53
grace tiers: finished=12 unfinished=2
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 14 | 1004 | 1780 | 1884 | 1884 | 1884 |
| endpointMs | 13 | 458 | 466 | 1402 | 1402 | 1402 |
| dgLastWordToSpeechFinalMs | 14 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 14 | 158 | 1102 | 2220 | 2220 | 2220 |
| dgCommitToTurnMs | 17 | 0 | 7975 | 7998 | 7998 | 7998 |
| preLlmMs | 17 | 2 | 364 | 415 | 415 | 415 |
| prepMs | 17 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 17 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 17 | 777 | 1413 | 1560 | 1560 | 1560 |
| llmTtftAbsMs | 17 | 898 | 1712 | 1910 | 1910 | 1910 |
| specLeadMs | 13 | 165 | 849 | 1104 | 1104 | 1104 |
| llmMs | 17 | 778 | 1415 | 1562 | 1562 | 1562 |
| ttsTtfaMs | 17 | 429 | 544 | 591 | 591 | 591 |
| ttfaMs | 17 | 1230 | 1896 | 1917 | 1917 | 1917 |
| waitMs | 17 | 1708 | 2332 | 2348 | 2348 | 2348 |
| totalMs | 17 | 1672 | 2545 | 2637 | 2637 | 2637 |
| harnessSpeechEndToFirstAudioMs | 17 | 2249 | 4573 | 6119 | 6119 | 6119 |
| harnessSpeechEndToFirstReplyAudioMs | 17 | 2337 | 5532 | 6119 | 6119 | 6119 |
| elLagP99Ms | 16 | 36 | 36 | 37 | 37 | 37 |
| elLagMaxMs | 16 | 40 | 44 | 47 | 47 | 47 |

## web · gemini-3.1-flash-lite  (turns=2, filler-ack played=0, no-audio turns=0)
speculation: hit=2 miss=0 requests started=5 wasted=3 wasted chars≈135 · hit rate 100% · extra requests per turn 1.50
grace tiers: finished=2
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 2 | 917 | 918 | 918 | 918 | 918 |
| endpointMs | 2 | 457 | 457 | 457 | 457 | 457 |
| dgLastWordToSpeechFinalMs | 2 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 2 | 157 | 157 | 157 | 157 | 157 |
| dgCommitToTurnMs | 2 | 0 | 0 | 0 | 0 | 0 |
| preLlmMs | 2 | 1 | 5 | 5 | 5 | 5 |
| prepMs | 2 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 2 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 2 | 845 | 3731 | 3731 | 3731 | 3731 |
| llmTtftAbsMs | 2 | 1002 | 3892 | 3892 | 3892 | 3892 |
| specLeadMs | 2 | 157 | 161 | 161 | 161 | 161 |
| llmMs | 2 | 846 | 3733 | 3733 | 3733 | 3733 |
| ttsTtfaMs | 2 | 328 | 544 | 544 | 544 | 544 |
| ttfaMs | 2 | 1174 | 4276 | 4276 | 4276 | 4276 |
| waitMs | 2 | 1632 | 4738 | 4738 | 4738 | 4738 |
| totalMs | 2 | 1973 | 4745 | 4745 | 4745 | 4745 |
| harnessSpeechEndToFirstAudioMs | 2 | 2093 | 5197 | 5197 | 5197 | 5197 |
| harnessSpeechEndToFirstReplyAudioMs | 2 | 2093 | 5197 | 5197 | 5197 | 5197 |
| elLagP99Ms | 2 | 36 | 36 | 36 | 36 | 36 |
| elLagMaxMs | 2 | 38 | 44 | 44 | 44 | 44 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
