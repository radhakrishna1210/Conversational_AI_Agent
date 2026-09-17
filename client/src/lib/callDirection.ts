/**
 * Which side of a call an agent is built for.
 *
 * An agent either answers calls to a number (INBOUND) or places them
 * (OUTBOUND) — never both. The backend enforces it (services/agentDirection.js):
 * an Outbound agent cannot be put on a number, an Inbound agent cannot dial.
 *
 * Only a direction CHOSEN under that rule counts, which the server marks with
 * `callDirectionLocked`. Older agents also store a `callDirection`, but the old
 * editor saved INBOUND by default, so there it is only a suggestion: those
 * agents show "Direction not set" and still work everywhere until someone picks.
 */
export type CallDirection = 'INBOUND' | 'OUTBOUND';

type WithDirection = { callDirection?: unknown; callDirectionLocked?: unknown } | null | undefined;

export function normaliseDirection(raw: unknown): CallDirection | null {
  const v = String(raw ?? '').trim().toUpperCase();
  return v === 'INBOUND' || v === 'OUTBOUND' ? v : null;
}

/** The direction an agent is restricted to, as the API returns it (settings spread to the top level). */
export function directionOf(agent: WithDirection): CallDirection | null {
  return agent?.callDirectionLocked === true ? normaliseDirection(agent.callDirection) : null;
}

/** Whatever direction is stored, chosen or not — a pre-selection for an older agent, never a rule. */
export function suggestedDirectionOf(agent: WithDirection): CallDirection | null {
  return normaliseDirection(agent?.callDirection);
}

export const DIRECTION_LABEL: Record<CallDirection, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
};

export const DIRECTION_SUMMARY: Record<CallDirection, string> = {
  INBOUND: 'Customers call this agent on your number',
  OUTBOUND: 'This agent calls your customers',
};

/** May this agent answer a number? Agents with no chosen direction still may. */
export const canAnswerNumber = (agent: WithDirection) => directionOf(agent) !== 'OUTBOUND';

/** May this agent place calls? Agents with no chosen direction still may. */
export const canPlaceCalls = (agent: WithDirection) => directionOf(agent) !== 'INBOUND';
