// backend/src/services/agentDirection.js
//
// An agent is built for ONE direction of call: it answers calls to a number
// (INBOUND) or it places them (OUTBOUND). Never both.
//
// Its prompt, its flow and its opening line are all written for one side of the
// conversation. A booking desk used for a bulk campaign greeted the people it
// dialled with "welcome to the hotel, how can I help with your booking?", and an
// outbound agent put on a number told the customer who had just rung it that it
// was "calling from" the business. The per-direction greeting tabs fixed the
// first sentence of those calls and none of the rest.
//
// The direction lives in the agent's settings JSON as `callDirection`. The
// editor has saved that key for a long time, but only to pick the default
// greeting — and it defaulted to INBOUND and re-sent it on every save, so on an
// older agent a stored INBOUND says nothing about how the agent is used (the
// hotel agent running bulk campaigns is one). So the restriction reads a
// direction only once it was CHOSEN under this rule, marked by
// `callDirectionLocked: true` beside it. The settings validator sets that flag
// whenever a save carries a direction, and never takes it from the client.
//
//   INBOUND   may answer a rented number; may not dial (test call or campaign)
//   OUTBOUND  may dial; may not be assigned to a number
//   not set   no locked direction: an agent from before the choice existed.
//             Allowed everywhere, exactly as before, until someone picks — a
//             deploy must not stop a live campaign or unroute a live number.
//             scripts/report-agent-directions.mjs lists these with a suggestion.
//
// The greeting runtime still reads the stored `callDirection` as it always did,
// locked or not.
//
// Where it is enforced: setInboundAgent (numbers), placeOutboundCall and the
// test-call endpoint (dialling), the campaign service and runner (campaigns),
// and updateAgent (a direction cannot flip while the agent is in use).

import prisma from '../config/prisma.js';
import { CAMPAIGN_STATUS } from '../constants/campaignStatus.js';
import { VOICE_NUMBER_STATUS } from '../constants/compliance.js';
import { AGENT_DIRECTION, normaliseDirection } from '../constants/callDirection.js';

export { AGENT_DIRECTION, normaliseDirection };

/**
 * Campaigns that will dial, or will dial again once resumed, without anyone
 * choosing an agent again. A DRAFT or FAILED one is re-checked when it is
 * started, with a message that says what to change.
 */
const LIVE_CAMPAIGN_STATUSES = [CAMPAIGN_STATUS.SCHEDULED, CAMPAIGN_STATUS.RUNNING, CAMPAIGN_STATUS.PAUSED];

/**
 * The settings an agent's direction is read from. Accepts a raw Agent row
 * (settings as a JSON string), a row with settings already parsed, or a
 * serialized agent with the settings keys at the top level.
 */
function directionFields(agent) {
  if (!agent) return {};
  if (agent.callDirection !== undefined || agent.callDirectionLocked !== undefined) {
    return { callDirection: agent.callDirection, callDirectionLocked: agent.callDirectionLocked };
  }
  let settings = agent.settings;
  if (typeof settings === 'string') {
    try { settings = JSON.parse(settings || '{}'); } catch { settings = {}; }
  }
  return settings && typeof settings === 'object' ? settings : {};
}

/** The direction an agent was built for, or null when none was chosen under the rule. */
export function agentDirection(agent) {
  const { callDirection, callDirectionLocked } = directionFields(agent);
  return callDirectionLocked === true ? normaliseDirection(callDirection) : null;
}

/** Whatever direction is stored, chosen or not — a suggestion for an older agent, never a rule. */
export function storedDirection(agent) {
  return normaliseDirection(directionFields(agent).callDirection);
}

const label = (direction) => (direction === AGENT_DIRECTION.OUTBOUND ? 'Outbound' : 'Inbound');

/** Why this agent may not answer calls to a number, or null when it may. */
export function inboundRefusal(agent) {
  if (agentDirection(agent) !== AGENT_DIRECTION.OUTBOUND) return null;
  return `"${agent.name}" is an Outbound agent — it places calls and cannot answer a number. `
    + 'Choose an Inbound agent for this number.';
}

/** Why this agent may not place calls, or null when it may. */
export function outboundRefusal(agent) {
  if (agentDirection(agent) !== AGENT_DIRECTION.INBOUND) return null;
  return `"${agent.name}" is an Inbound agent — it answers calls to your number and cannot place calls. `
    + 'Choose an Outbound agent to dial out.';
}

/**
 * Why an agent's direction may not change to `next` right now, or null.
 *
 * Changing it while the agent is in use would leave that use broken: a number
 * whose agent refuses to answer it, or a campaign whose agent refuses to dial.
 * Saying so names exactly what to undo first, instead of the change quietly
 * unassigning a number or failing a campaign on its next batch.
 *
 * Setting a direction on an agent that never had one counts as a change — that
 * is precisely the moment an old agent used both ways has to be split.
 *
 * @param {object} agent  the stored Agent row
 * @param {string} next   the requested direction
 * @param {object} [db]   tests only
 */
export async function directionChangeConflict(agent, next, db = prisma) {
  const target = normaliseDirection(next);
  if (!target || target === agentDirection(agent)) return null;

  if (target === AGENT_DIRECTION.OUTBOUND) {
    const numbers = await db.voiceNumber.findMany({
      where: { workspaceId: agent.workspaceId, inboundAgentId: agent.id, status: { not: VOICE_NUMBER_STATUS.RELEASED } },
      select: { phoneNumber: true },
      take: 5,
    });
    if (numbers.length) {
      const list = numbers.map((n) => n.phoneNumber).join(', ');
      return `This agent answers calls to ${list}. Assign ${numbers.length > 1 ? 'those numbers' : 'that number'} `
        + `to an Inbound agent on the Phone Numbers page before making it ${label(target)}.`;
    }
    return null;
  }

  const campaigns = await db.campaign.findMany({
    where: { workspaceId: agent.workspaceId, botId: agent.id, channel: 'VOICE', status: { in: LIVE_CAMPAIGN_STATUSES } },
    select: { name: true, status: true },
    take: 5,
  });
  if (campaigns.length) {
    const list = campaigns.map((c) => `"${c.name}" (${c.status.toLowerCase()})`).join(', ');
    return `This agent is dialling for ${list}. Cancel ${campaigns.length > 1 ? 'those campaigns' : 'that campaign'} `
      + `before making this agent ${label(target)}.`;
  }
  return null;
}
