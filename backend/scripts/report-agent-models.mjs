#!/usr/bin/env node
// backend/scripts/report-agent-models.mjs
//
// READ-ONLY. Which AI and transcription model every agent runs, and why.
//
// Clients no longer choose models; Super Admin assigns them
// (services/platform/modelAssignments.js). An agent saved before that keeps the
// model it had, until its client gets an override. Run this before choosing the
// platform defaults and overrides, to see who is on what:
//
//   AGENT     keeps a model it was saved with (ignores the platform default)
//   CLIENT    its client has an override
//   PLATFORM  runs the platform default
//   SERVER    nothing assigned anywhere; runs the deployment's env default
//
// Also flags agents on a bundled conversational engine (xAI / ElevenLabs):
// the editor no longer shows that switch, so only the backend can change it.
//
//   node scripts/report-agent-models.mjs          # table
//   node scripts/report-agent-models.mjs --json   # machine-readable
//
// Reads DATABASE_URL like the app does (backend/.env), which is PRODUCTION on a
// developer machine — this script issues SELECTs only, and prints the host it is
// reading before anything else.
import { PrismaClient } from '@prisma/client';
import { MODEL_ASSIGNMENTS_PLAN, normaliseState, pickAssignedModels } from '../src/services/platform/modelAssignments.js';

const asJson = process.argv.slice(2).includes('--json');
const prisma = new PrismaClient();

const host = (() => {
  try { return new URL(process.env.DATABASE_URL).host; } catch { return '(unparseable DATABASE_URL)'; }
})();

const parse = (s, fallback = {}) => { try { return JSON.parse(s || '') ?? fallback; } catch { return fallback; } };

async function main() {
  if (!asJson) console.error(`Reading ${host} (read-only)…\n`);

  const [agents, row] = await Promise.all([
    prisma.agent.findMany({
      select: {
        id: true, name: true, workspaceId: true, aiModel: true, transcription: true,
        languages: true, voice: true, settings: true, workspace: { select: { name: true } },
      },
      orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }],
    }),
    // findUnique, never the service's reader: that one CREATES the row when it
    // is missing, and this script must not write.
    prisma.plan.findUnique({ where: { name: MODEL_ASSIGNMENTS_PLAN }, select: { features: true } }),
  ]);

  const state = normaliseState(parse(row?.features, {}));

  const rows = agents.map((a) => {
    const settings = parse(a.settings, {});
    const models = pickAssignedModels({ agent: a, client: state.workspaces[a.workspaceId], defaults: state.defaults });
    return {
      workspace: a.workspace?.name ?? a.workspaceId,
      workspaceId: a.workspaceId,
      agent: a.name,
      agentId: a.id,
      languages: parse(a.languages, []),
      llm: models.llm.value ?? '(env default)',
      llmSource: models.llm.source.toUpperCase(),
      stt: models.stt.value,
      sttSource: models.stt.source.toUpperCase(),
      savedSttLanguage: settings.sttLanguage ?? null,
      batchSttFallback: settings.sttProvider || a.transcription || null,
      voiceProvider: typeof a.voice === 'string' && a.voice.includes(' - ') ? a.voice.split(' - ')[0] : null,
      bundledEngine: settings.voiceEngine && settings.voiceEngine !== 'modular' ? settings.voiceEngine : null,
    };
  });

  if (asJson) {
    console.log(JSON.stringify({ host, defaults: state.defaults, clientOverrides: state.workspaces, agents: rows }, null, 2));
    return;
  }

  console.log(`Platform defaults: LLM=${state.defaults.llm ?? '(not set)'}  STT=${state.defaults.stt ?? '(not set)'}`);
  console.log(`Client overrides: ${Object.keys(state.workspaces).length}\n`);

  let current = null;
  for (const r of rows) {
    if (r.workspaceId !== current) {
      current = r.workspaceId;
      console.log(`\n${r.workspace}  (${r.workspaceId})`);
    }
    const flags = [
      r.bundledEngine ? `ENGINE=${r.bundledEngine}` : null,
      r.savedSttLanguage ? `sttLanguage=${r.savedSttLanguage}` : null,
    ].filter(Boolean).join('  ');
    console.log(
      `  ${r.agent.padEnd(40).slice(0, 40)}  LLM ${String(r.llm).padEnd(26).slice(0, 26)} ${r.llmSource.padEnd(8)}`
      + `  STT ${r.stt.padEnd(16)} ${r.sttSource.padEnd(8)}  voice ${r.voiceProvider ?? '-'}${flags ? `  ${flags}` : ''}`,
    );
  }

  const bundled = rows.filter((r) => r.bundledEngine);
  const sources = rows.reduce((m, r) => ({ ...m, [r.llmSource]: (m[r.llmSource] ?? 0) + 1 }), {});
  console.log(`\n${rows.length} agents. LLM source: ${Object.entries(sources).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  if (bundled.length) {
    console.log(`${bundled.length} agent(s) run a bundled conversational engine, which clients can no longer switch off in the editor.`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
