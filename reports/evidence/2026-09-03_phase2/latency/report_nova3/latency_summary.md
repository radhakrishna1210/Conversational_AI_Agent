# Latency report — nova3
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 300  ·  turns with turnId: 12  ·  legacy rows: 0

## web · gemini-3.1-flash-lite  (turns=1, filler-ack played=0, no-audio turns=0)
speculation: hit=1 miss=0 requests started=3 wasted=2 wasted chars≈71 · hit rate 100% · extra requests per turn 2.00
grace tiers: finished=1
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 1 | 1168 | 1168 | 1168 | 1168 | 1168 |
| endpointMs | 1 | 462 | 462 | 462 | 462 | 462 |
| dgLastWordToSpeechFinalMs | 1 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 1 | 162 | 162 | 162 | 162 | 162 |
| dgCommitToTurnMs | 1 | 1 | 1 | 1 | 1 | 1 |
| preLlmMs | 1 | 16 | 16 | 16 | 16 | 16 |
| prepMs | 1 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 1 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 1 | 1618 | 1618 | 1618 | 1618 | 1618 |
| llmTtftAbsMs | 1 | 1790 | 1790 | 1790 | 1790 | 1790 |
| specLeadMs | 1 | 172 | 172 | 172 | 172 | 172 |
| llmMs | 1 | 1627 | 1627 | 1627 | 1627 | 1627 |
| ttsTtfaMs | 1 | 361 | 361 | 361 | 361 | 361 |
| ttfaMs | 1 | 1997 | 1997 | 1997 | 1997 | 1997 |
| waitMs | 1 | 2475 | 2475 | 2475 | 2475 | 2475 |
| totalMs | 1 | 2902 | 2902 | 2902 | 2902 | 2902 |
| harnessSpeechEndToFirstAudioMs | 1 | 3184 | 3184 | 3184 | 3184 | 3184 |
| harnessSpeechEndToFirstReplyAudioMs | 1 | 3184 | 3184 | 3184 | 3184 | 3184 |

## web · gemini-3.5-flash-lite  (turns=11, filler-ack played=2, no-audio turns=0)
speculation: hit=8 miss=3 requests started=24 wasted=16 wasted chars≈686 · hit rate 73% · extra requests per turn 1.45
grace tiers: ordinary=1 finished=7
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 9 | 1049 | 1780 | 1780 | 1780 | 1780 |
| endpointMs | 7 | 457 | 461 | 461 | 461 | 461 |
| dgLastWordToSpeechFinalMs | 8 | 0 | 1511 | 1511 | 1511 | 1511 |
| dgSpeechFinalToCommitMs | 8 | 157 | 399 | 399 | 399 | 399 |
| dgCommitToTurnMs | 11 | 0 | 8398 | 9734 | 9734 | 9734 |
| preLlmMs | 11 | 2 | 375 | 479 | 479 | 479 |
| prepMs | 11 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 11 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 11 | 616 | 865 | 939 | 939 | 939 |
| llmTtftAbsMs | 11 | 839 | 939 | 986 | 986 | 986 |
| specLeadMs | 8 | 160 | 2523 | 2523 | 2523 | 2523 |
| llmMs | 11 | 621 | 901 | 943 | 943 | 943 |
| ttsTtfaMs | 11 | 423 | 550 | 554 | 554 | 554 |
| ttfaMs | 11 | 1140 | 1351 | 1497 | 1497 | 1497 |
| waitMs | 11 | 1500 | 1774 | 1830 | 1830 | 1830 |
| totalMs | 11 | 1653 | 2062 | 2529 | 2529 | 2529 |
| harnessSpeechEndToFirstAudioMs | 11 | 2268 | 4686 | 4734 | 4734 | 4734 |
| harnessSpeechEndToFirstReplyAudioMs | 11 | 2268 | 4734 | 5632 | 5632 | 5632 |
| elLagP99Ms | 11 | 36 | 36 | 36 | 36 | 36 |
| elLagMaxMs | 11 | 39 | 44 | 47 | 47 | 47 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
