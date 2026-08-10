/**
 * Read-only diff of prisma/schema.prisma against the live database.
 *
 * Strictly SELECTs against information_schema — this runs against a live
 * Supabase instance and must not modify anything.
 *
 *   node --env-file=.env scripts/inspect-db-drift.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/config/prisma.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(here, '..', 'prisma', 'schema.prisma'), 'utf8');

/**
 * model Name { ...scalar fields... } → { Name: [field, ...] }
 *
 * Only these types become columns. Testing for a leading capital instead would
 * discard String, Int, Boolean and DateTime along with the relations — which
 * silently reports zero drift.
 */
const SCALARS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes',
]);

const models = {};
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = m;
  const fields = [];
  for (const line of body.split('\n')) {
    const f = line.trim().match(/^(\w+)\s+(\w+)(\[\])?/);
    if (!f) continue;
    const [, field, type, isList] = f;
    // A list is never a column; enums are, but they are not scalars by name,
    // so they show up as drift only if genuinely absent — which is what we want.
    if (isList || !SCALARS.has(type)) continue;
    fields.push(field);
  }
  models[name] = fields;
}

const dbTables = (await prisma.$queryRawUnsafe(`
  SELECT table_name FROM information_schema.tables WHERE table_schema='public'
`)).map((t) => t.table_name);

const dbCols = {};
for (const row of await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'
`)) {
  (dbCols[row.table_name] ??= []).push(row.column_name);
}

const missingTables = [];
const driftedTables = [];

for (const [name, fields] of Object.entries(models)) {
  if (!dbTables.includes(name)) {
    missingTables.push(name);
    continue;
  }
  const missing = fields.filter((f) => !dbCols[name].includes(f));
  if (missing.length) driftedTables.push([name, missing]);
}

console.log(`\nSchema declares ${Object.keys(models).length} models; DB has ${dbTables.length} tables.\n`);

console.log(`MODELS WITH NO TABLE IN THE DB (${missingTables.length}) — every query against these 500s:`);
missingTables.forEach((t) => console.log(`   ${t}`));

console.log(`\nTABLES MISSING COLUMNS (${driftedTables.length}) — a bare findMany() on these 500s:`);
driftedTables.forEach(([t, cols]) => console.log(`   ${t}: ${cols.join(', ')}`));

const orphanTables = dbTables.filter((t) => !models[t] && !t.startsWith('_') && t !== 'documents');
console.log(`\nTABLES IN DB WITH NO MODEL (${orphanTables.length}):`);
console.log('   ' + (orphanTables.join(', ') || 'none'));

await prisma.$disconnect();
