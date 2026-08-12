// Caller-ID health scoring and the quarantine decision — pure functions.
//
// The point of this file is early warning. By the time a complaint reaches
// TRAI or a carrier sends a notice, the number is already burned and the
// workspace is already exposed. Answer rate and short-hangup ratio move first:
// they degrade within a day or two of a carrier starting to filter a CLI, and
// they are computed from data we already have in AgentCallLog.
//
// Deliberately conservative. Quarantining a healthy number stalls a paying
// customer's campaign, so the thresholds require a real sample and a clear
// signal, not a bad morning.

import {
  HEALTH_MAX_SHORT_RATE,
  HEALTH_MIN_ANSWER_RATE,
  HEALTH_MIN_SAMPLE,
  QUARANTINE_REASON,
  SHORT_CALL_SEC,
} from '../../constants/dialing.js';

/**
 * Reduce a window of call logs to the two ratios that matter.
 *
 * "Answered" means the call reached a real conversation: it completed and
 * lasted longer than a hangup. A call that connects and is cut off at two
 * seconds is a rejection, not an answer, and counting it as one would hide
 * exactly the degradation this is looking for.
 *
 * @param {Array<{status: string, durationSec: number}>} calls
 */
export function summarise(calls = []) {
  const sample = calls.length;
  if (!sample) {
    return { sample: 0, answerRate: null, shortRate: null, answered: 0, short: 0 };
  }

  let answered = 0;
  let short = 0;
  for (const call of calls) {
    const duration = Number(call.durationSec) || 0;
    const connected = call.status === 'COMPLETED' || call.status === 'IN_PROGRESS';
    if (connected && duration > SHORT_CALL_SEC) answered += 1;
    else if (connected && duration > 0) short += 1;
  }

  // shortRate is the share of CONNECTED calls that were hangups, not of all
  // dials. Mixing unanswered dials into the denominator would make the ratio
  // fall whenever answer rate fell, masking the signal.
  const connected = answered + short;
  return {
    sample,
    answered,
    short,
    answerRate: answered / sample,
    shortRate: connected > 0 ? short / connected : null,
  };
}

/**
 * Should this number come out of rotation?
 *
 * Returns a null reason when the sample is too small — an unknown verdict, not
 * a clean bill of health. The caller must not read "no quarantine" as "healthy"
 * for a number that has only made six calls.
 *
 * @returns {{quarantine: boolean, reason: string|null, detail: string|null}}
 */
export function quarantineVerdict(summary, thresholds = {}) {
  const minSample = thresholds.minSample ?? HEALTH_MIN_SAMPLE;
  const minAnswerRate = thresholds.minAnswerRate ?? HEALTH_MIN_ANSWER_RATE;
  const maxShortRate = thresholds.maxShortRate ?? HEALTH_MAX_SHORT_RATE;

  if (!summary || summary.sample < minSample) {
    return { quarantine: false, reason: null, detail: null };
  }

  if (summary.answerRate !== null && summary.answerRate < minAnswerRate) {
    return {
      quarantine: true,
      reason: QUARANTINE_REASON.ANSWER_RATE_COLLAPSE,
      detail: `Answer rate ${(summary.answerRate * 100).toFixed(1)}% over the last `
        + `${summary.sample} calls is below the ${(minAnswerRate * 100).toFixed(0)}% floor. `
        + 'This is the usual signature of carrier-level filtering.',
    };
  }

  if (summary.shortRate !== null && summary.shortRate > maxShortRate) {
    return {
      quarantine: true,
      reason: QUARANTINE_REASON.SHORT_HANGUP_SPIKE,
      detail: `${(summary.shortRate * 100).toFixed(1)}% of connected calls ended within `
        + `${SHORT_CALL_SEC}s over the last ${summary.sample} calls. Recipients are `
        + 'recognising and rejecting this number on sight.',
    };
  }

  return { quarantine: false, reason: null, detail: null };
}

/**
 * A 0–100 score for display only.
 *
 * Never used to make the quarantine decision — that reads the ratios directly,
 * because collapsing two independent signals into one number then thresholding
 * it loses the reason, and the reason is what an operator needs in order to act.
 */
export function healthScore(summary) {
  if (!summary || !summary.sample) return null;
  const answer = summary.answerRate ?? 0;
  const short = summary.shortRate ?? 0;
  const raw = (answer * 70) + ((1 - short) * 30);
  return Math.max(0, Math.min(100, Math.round(raw)));
}
