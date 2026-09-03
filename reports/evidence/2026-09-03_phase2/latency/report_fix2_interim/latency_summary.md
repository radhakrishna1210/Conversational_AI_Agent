# Latency report — fix2_interim
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 264  ·  turns with turnId: 24  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=20, filler-ack played=4, no-audio turns=0)
speculation: hit=16 miss=4 requests started=49 wasted=33 wasted chars≈1606 · hit rate 80% · extra requests per turn 1.65
grace tiers: finished=15 unfinished=3
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 18 | 969 | 1980 | 2154 | 2154 | 2154 |
| endpointMs | 16 | 457 | 470 | 1409 | 1409 | 1409 |
| dgLastWordToSpeechFinalMs | 17 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 17 | 159 | 1109 | 1109 | 1109 | 1109 |
| dgCommitToTurnMs | 20 | 0 | 1 | 9488 | 9852 | 9852 |
| preLlmMs | 20 | 2 | 10 | 324 | 396 | 396 |
| prepMs | 20 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 20 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 20 | 632 | 1026 | 1459 | 1515 | 1515 |
| llmTtftAbsMs | 20 | 831 | 1026 | 1515 | 1614 | 1614 |
| specLeadMs | 16 | 163 | 702 | 1111 | 1111 | 1111 |
| llmMs | 20 | 634 | 1032 | 1460 | 1529 | 1529 |
| ttsTtfaMs | 20 | 428 | 528 | 561 | 714 | 714 |
| ttfaMs | 20 | 1086 | 1475 | 1815 | 2094 | 2094 |
| waitMs | 20 | 1544 | 2097 | 2126 | 2270 | 2270 |
| totalMs | 20 | 1666 | 2157 | 2514 | 2812 | 2812 |
| harnessSpeechEndToFirstAudioMs | 20 | 2056 | 4077 | 4534 | 4590 | 4590 |
| harnessSpeechEndToFirstReplyAudioMs | 20 | 2070 | 4077 | 5580 | 5603 | 5603 |
| elLagP99Ms | 19 | 36 | 37 | 39 | 39 | 39 |
| elLagMaxMs | 19 | 38 | 46 | 80 | 80 | 80 |

## web · gemini-3.1-flash-lite  (turns=4, filler-ack played=0, no-audio turns=0)
speculation: hit=4 miss=0 requests started=12 wasted=8 wasted chars≈361 · hit rate 100% · extra requests per turn 2.00
grace tiers: unfinished=1 finished=3
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 4 | 920 | 2710 | 2710 | 2710 | 2710 |
| endpointMs | 4 | 460 | 1413 | 1413 | 1413 | 1413 |
| dgLastWordToSpeechFinalMs | 3 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 3 | 160 | 161 | 161 | 161 | 161 |
| dgCommitToTurnMs | 4 | 0 | 1 | 1 | 1 | 1 |
| preLlmMs | 4 | 1 | 3 | 3 | 3 | 3 |
| prepMs | 4 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 4 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 4 | 1009 | 1839 | 1839 | 1839 | 1839 |
| llmTtftAbsMs | 4 | 1239 | 2125 | 2125 | 2125 | 2125 |
| specLeadMs | 4 | 162 | 1116 | 1116 | 1116 | 1116 |
| llmMs | 4 | 1010 | 1841 | 1841 | 1841 | 1841 |
| ttsTtfaMs | 4 | 373 | 390 | 390 | 390 | 390 |
| ttfaMs | 4 | 1403 | 2202 | 2202 | 2202 | 2202 |
| waitMs | 4 | 1917 | 2818 | 2818 | 2818 | 2818 |
| totalMs | 4 | 1867 | 2815 | 2815 | 2815 | 2815 |
| harnessSpeechEndToFirstAudioMs | 4 | 2404 | 4115 | 4115 | 4115 | 4115 |
| harnessSpeechEndToFirstReplyAudioMs | 4 | 2404 | 4115 | 4115 | 4115 | 4115 |
| elLagP99Ms | 4 | 36 | 36 | 36 | 36 | 36 |
| elLagMaxMs | 4 | 37 | 38 | 38 | 38 | 38 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
