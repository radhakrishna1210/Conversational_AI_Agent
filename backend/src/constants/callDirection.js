// Which side of a call an agent is built for. See services/agentDirection.js
// for what the choice restricts. Kept free of imports so the settings validator
// can use it without loading Prisma.

export const AGENT_DIRECTION = Object.freeze({ INBOUND: 'INBOUND', OUTBOUND: 'OUTBOUND' });

/** 'inbound' / 'OUTBOUND' / anything else → 'INBOUND' | 'OUTBOUND' | null. */
export function normaliseDirection(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  return v === AGENT_DIRECTION.INBOUND || v === AGENT_DIRECTION.OUTBOUND ? v : null;
}
