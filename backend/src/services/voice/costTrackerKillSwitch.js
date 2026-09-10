// backend/src/services/voice/costTrackerKillSwitch.js
/**
 * Multi-Tenant Cost Tracking & Fraud Kill-Switches
 *
 * Tracks per-call millisecond audio processing, token usage, and costs.
 * Enforces hard auto-disconnect kill-switches when call duration or cost exceed safety ceilings.
 */

export const DEFAULT_COST_RATES = {
  sttPerMinuteUsd: 0.0043,    // Deepgram Nova-3 (~$0.0043/min)
  llmInputPer1kTokensUsd: 0.00015,  // e.g. Llama 3.1 / GPT-4o-mini
  llmOutputPer1kTokensUsd: 0.0006,
  ttsPer1kCharsUsd: 0.015,    // Cartesia / ElevenLabs Flash (~$0.015 - $0.030 / 1k chars)
  telephonyPerMinuteUsd: 0.0085, // SIP/Twilio standard trunking
};

export function createCallCostTracker(options = {}) {
  const rates = { ...DEFAULT_COST_RATES, ...(options.rates || {}) };
  const maxDurationSeconds = options.maxDurationSeconds || 1800; // 30 minutes default cap
  const maxCostUsd = options.maxCostUsd || 3.00;                 // $3.00 safety ceiling per call
  const maxTokens = options.maxTokens || 10000;

  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTtsChars = 0;
  let terminated = false;
  let terminationReason = null;

  function recordLlmTokens(promptTokens = 0, completionTokens = 0) {
    totalInputTokens += Number(promptTokens) || 0;
    totalOutputTokens += Number(completionTokens) || 0;
    checkKillSwitch();
  }

  function recordTtsChars(charCount = 0) {
    totalTtsChars += Number(charCount) || 0;
    checkKillSwitch();
  }

  function getMetrics() {
    const durationSeconds = (Date.now() - startedAt) / 1000;
    const durationMinutes = durationSeconds / 60;

    const telephonyCost = durationMinutes * rates.telephonyPerMinuteUsd;
    const sttCost = durationMinutes * rates.sttPerMinuteUsd;
    const llmCost = (totalInputTokens / 1000 * rates.llmInputPer1kTokensUsd) +
                    (totalOutputTokens / 1000 * rates.llmOutputPer1kTokensUsd);
    const ttsCost = (totalTtsChars / 1000) * rates.ttsPer1kCharsUsd;
    const totalCostUsd = telephonyCost + sttCost + llmCost + ttsCost;

    return {
      durationSeconds: Math.round(durationSeconds),
      totalTokens: totalInputTokens + totalOutputTokens,
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      ttsChars: totalTtsChars,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      isTerminated: terminated,
      terminationReason,
    };
  }

  function checkKillSwitch() {
    if (terminated) return true;

    const metrics = getMetrics();

    if (metrics.durationSeconds >= maxDurationSeconds) {
      terminated = true;
      terminationReason = 'max_duration_exceeded';
      return true;
    }

    if (metrics.totalCostUsd >= maxCostUsd) {
      terminated = true;
      terminationReason = 'max_cost_exceeded';
      return true;
    }

    if (metrics.totalTokens >= maxTokens) {
      terminated = true;
      terminationReason = 'max_tokens_exceeded';
      return true;
    }

    return false;
  }

  return {
    recordLlmTokens,
    recordTtsChars,
    getMetrics,
    checkKillSwitch,
    isTerminated: () => terminated,
  };
}
