# Latency report — fix2_off
log: D:\krishna_thete\HM-Voice-agent\backend\logs\latency.log  ·  rows: 264  ·  turns with turnId: 24  ·  legacy rows: 0

## web · gemini-3.5-flash-lite  (turns=24, filler-ack played=4, no-audio turns=0)
grace tiers: finished=17 unfinished=4
| stage | n | p50 | p90 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| speechEndToEndpointMs | 22 | 1085 | 1794 | 2002 | 2031 | 2031 |
| endpointMs | 19 | 455 | 1401 | 1412 | 1412 | 1412 |
| dgLastWordToSpeechFinalMs | 21 | 0 | 0 | 0 | 0 | 0 |
| dgSpeechFinalToCommitMs | 21 | 157 | 1101 | 1112 | 1112 | 1112 |
| dgCommitToTurnMs | 24 | 0 | 2 | 9638 | 13218 | 13218 |
| preLlmMs | 24 | 2 | 15 | 388 | 512 | 512 |
| prepMs | 24 | 0 | 0 | 0 | 0 | 0 |
| ragMs | 24 | 0 | 0 | 0 | 0 | 0 |
| llmTtftMs | 24 | 1100 | 4632 | 5093 | 8299 | 8299 |
| llmTtftAbsMs | 24 | 1100 | 4632 | 5093 | 8299 | 8299 |
| llmMs | 24 | 1117 | 4635 | 5097 | 8301 | 8301 |
| ttsTtfaMs | 24 | 414 | 487 | 543 | 685 | 685 |
| ttfaMs | 24 | 1520 | 5025 | 5533 | 8690 | 8690 |
| waitMs | 24 | 1990 | 5838 | 5986 | 9149 | 9149 |
| totalMs | 24 | 2196 | 5391 | 6579 | 9122 | 9122 |
| harnessSpeechEndToFirstAudioMs | 24 | 2854 | 6428 | 6673 | 9710 | 9710 |
| harnessSpeechEndToFirstReplyAudioMs | 24 | 2861 | 6428 | 6673 | 9710 | 9710 |
| elLagP99Ms | 23 | 36 | 37 | 37 | 37 | 37 |
| elLagMaxMs | 23 | 38 | 45 | 45 | 45 | 45 |

Definitions: `ttfaMs` = end-of-speech (server) → first TTS byte at the server. `waitMs` = ttfaMs + preLlmMs + endpointMs (server-side end-to-end).
`wireMs` = phone: end-of-speech → first frame on the carrier socket. `speechEndToAudibleMs` = web: client last-speech → browser <audio> playing (ACTUAL audible latency; `audibleFiller` marks an ack clip).
`elLagP99Ms` = event-loop delay p99 since the previous record. `llmTtftAbsMs` = first token measured from the LLM request (a speculative hit makes `llmTtftMs` from turn start read near 0). `specLeadMs` = how long the winning speculative request had already run when the turn began.
`harnessSpeechEndToFirstAudioMs` = WS harness: last speech byte sent → first reply-audio binary frame received (any segment, filler included); `harnessSpeechEndToFirstReplyAudioMs` = same, first NON-filler segment (ACTUAL).
