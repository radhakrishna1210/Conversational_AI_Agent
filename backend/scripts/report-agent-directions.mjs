#!/usr/bin/env node
// backend/scripts/report-agent-directions.mjs
//
// READ-ONLY. Which agents still need an Inbound/Outbound direction, and what
// their actual use suggests.
//
// An agent now works for one direction of call (services/agentDirection.js).
// Agents created before that rule have no CHOSEN direction and keep working
// both ways until someone picks one in Edit Agent. Picking is refused while the
// agent is in use the other way, so an agent used both ways has to be split
// into two first. This lists, per workspace:
//
//   OK            direction chosen, and nothing uses the agent the other way
//   CONFLICT      direction chosen, but a number or live campaign predates it
//   SPLIT NEEDED  no direction; used both ways — duplicate it, one per direction
//   SUGGEST       no direction; used one way (or not at all) — pick this one
//
//   node scripts/report-agent-directions.mjs            # table
//   node scripts/report-agent-directions.mjs --json     # machine-readable
//   node scripts/report-agent-directions.mjs --days 60  # call-history window
//
// Reads DATABASE_URL like the app does (backend/.env), which is PRODUCTION on a
// developer machine — this script issues SELECTs only, and prints the host it
// is reading before anything else.
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const daysArg = args.indexOf('--days');
const days = daysArg >= 0 ? Math.max(1, Number(args[daysArg + 1]) || 30) : 30;

const LIVE_CAMPAIGN = new Set(['SCHEDULED', 'RUNNING', 'PAUSED']);

const prisma = new PrismaClient();

const host = (() => {
  try { return new URL(process.env.DATABASE_URL).host; } catch { return '(unparseable DATABASE_URL)'; }
})();

const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const dir = (v) => {
  const u = String(v ?? '').trim().toUpperCase();
  return u === 'INBOUND' || u === 'OUTBOUND' ? u : null;
};

async function main() {
  if (!asJson) console.error(`Reading ${host} (read-only)…\n`);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [agents, numbers, campaigns, calls] = await Promise.all([
    prisma.agent.findMany({
      select: { id: true, name: true, workspaceId: true, settings: true, workspace: { select: { name: true } } },
      orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }],
    }),
    prisma.voiceNumber.findMany({
      where: { inboundAgentId: { not: null }, status: { not: 'RELEASED' } },
      select: { phoneNumber: true, inboundAgentId: true, status: true },
    }),
    prisma.campaign.findMany({
      where: { channel: 'VOICE', botId: { not: null } },
      select: { name: true, status: true, botId: true },
    }),
    prisma.agentCallLog.groupBy({
      by: ['agentId', 'direction'],
      where: { type: 'PHONE_CALL', startedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const rows = agents.map((a) => {
    const settings = parse(a.settings);
    const chosen = settings.callDirectionLocked === true ? dir(settings.callDirection) : null;
    const stored = dir(settings.callDirection);
    const myNumbers = numbers.filter((n) => n.inboundAgentId === a.id);
    const myCampaigns = campaigns.filter((c) => c.botId === a.id);
    const liveCampaigns = myCampaigns.filter((c) => LIVE_CAMPAIGN.has(c.status));
    const count = (d) => calls.find((c) => c.agentId === a.id && c.direction === d)?._count._all ?? 0;
    const inboundCalls = count('INBOUND');
    const outboundCalls = count('OUTBOUND');

    const usedIn = myNumbers.length > 0 || inboundCalls > 0;
    const usedOut = myCampaigns.length > 0 || outboundCalls > 0;

    let verdict;
    let direction;
    let note = '';
    if (chosen) {
      direction = chosen;
      const clash = chosen === 'OUTBOUND' ? myNumbers.length > 0 : liveCampaigns.length > 0;
      verdict = clash ? 'CONFLICT' : 'OK';
      if (clash) {
        note = chosen === 'OUTBOUND'
          ? `still answers ${myNumbers.map((n) => n.phoneNumber).join(', ')} — assign an Inbound agent`
          : `still dialling for ${liveCampaigns.map((c) => `"${c.name}"`).join(', ')} — cancel or move to an Outbound agent`;
      }
    } else if (usedIn && usedOut) {
      verdict = 'SPLIT NEEDED';
      direction = null;
      note = 'used both ways — in Edit Agent choose one direction, then "Create a copy" for the other';
    } else {
      verdict = 'SUGGEST';
      direction = usedIn ? 'INBOUND' : usedOut ? 'OUTBOUND' : stored;
      note = usedIn || usedOut
        ? `from its use (${usedIn ? 'number/inbound calls' : 'campaigns/outbound calls'})`
        : stored ? 'unused; from its stored setting (the old editor defaulted this to INBOUND)' : 'unused; nothing to go on';
    }

    return {
      workspace: a.workspace?.name ?? a.workspaceId,
      workspaceId: a.workspaceId,
      agentId: a.id,
      agent: a.name,
      verdict,
      direction,
      storedDirection: stored,
      numbers: myNumbers.map((n) => `${n.phoneNumber}${n.status === 'ACTIVE' ? '' : ` (${n.status.toLowerCase()})`}`),
      liveCampaigns: liveCampaigns.map((c) => `${c.name} (${c.status.toLowerCase()})`),
      campaignsTotal: myCampaigns.length,
      [`inboundCalls${days}d`]: inboundCalls,
      [`outboundCalls${days}d`]: outboundCalls,
      note,
    };
  });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const order = { CONFLICT: 0, 'SPLIT NEEDED': 1, SUGGEST: 2, OK: 3 };
  let lastWorkspace = null;
  for (const r of [...rows].sort((x, y) => x.workspace.localeCompare(y.workspace) || order[x.verdict] - order[y.verdict])) {
    if (r.workspace !== lastWorkspace) {
      console.log(`\n== ${r.workspace} (${r.workspaceId})`);
      lastWorkspace = r.workspace;
    }
    const use = [
      r.numbers.length ? `numbers: ${r.numbers.join(', ')}` : null,
      r.campaignsTotal ? `campaigns: ${r.campaignsTotal}${r.liveCampaigns.length ? ` (live: ${r.liveCampaigns.join(', ')})` : ''}` : null,
      `phone calls ${days}d: ${r[`inboundCalls${days}d`]} in / ${r[`outboundCalls${days}d`]} out`,
    ].filter(Boolean).join(' · ');
    console.log(`  [${r.verdict}] ${r.agent} — ${r.direction ?? '—'}`);
    console.log(`      ${use}`);
    if (r.note) console.log(`      ${r.note}`);
  }

  const tally = rows.reduce((t, r) => ({ ...t, [r.verdict]: (t[r.verdict] ?? 0) + 1 }), {});
  console.log(`\n${rows.length} agents: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
