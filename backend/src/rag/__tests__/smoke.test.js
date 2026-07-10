/**
 * RAG Unit Smoke-Tests
 * Run with: node --env-file=backend/.env backend/src/rag/__tests__/smoke.test.js
 */

import { chunkDocuments }                         from '../chunker.js';
import { InMemoryVectorStore, BaseVectorStore }   from '../vectorStore.js';
import { buildSystemPrompt, REFUSAL_PHRASE }      from '../promptBuilder.js';
import { loadDocuments }                          from '../documentLoader.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─── 1. Chunker ─────────────────────────────────────────────────────────────
console.log('\n[1] Chunker');

const sampleDoc = {
  title: 'Test Page',
  route: '/test',
  category: 'Test',
  relativePath: 'test.md',
  content: [
    '## Overview',
    'This section describes the overview.',
    '',
    '## Getting Started',
    'Follow these steps to get started.',
    '',
    '```javascript',
    'const x = 1;',
    'const y = 2;',
    '```',
    '',
    '## Billing',
    'Plans start at $15 per month.',
    '',
    '| Plan | Price |',
    '|------|-------|',
    '| Starter | $15 |',
  ].join('\n'),
};

const chunks = chunkDocuments([sampleDoc]);
assert('Produces at least 2 chunks', chunks.length >= 2);
assert('Every chunk has text',       chunks.every(c => c.text && c.text.length > 0));
assert('Every chunk has heading',    chunks.every(c => c.heading));
assert('Every chunk has source',     chunks.every(c => c.source));
assert('Every chunk has relativePath', chunks.every(c => c.relativePath === 'test.md'));

// Verify code blocks are not split mid-fence
const codeChunk = chunks.find(c => c.text.includes('```javascript'));
if (codeChunk) {
  assert('Code block preserved intact', codeChunk.text.includes('const y = 2;'));
} else {
  // Code block may have been merged with the heading chunk — acceptable
  assert('Code content present somewhere', chunks.some(c => c.text.includes('const x = 1;')));
}

// ─── 2. VectorStore abstraction ─────────────────────────────────────────────
console.log('\n[2] VectorStore abstraction');

const base = new BaseVectorStore();
let threw = false;
try { await base.add({}, []); } catch { threw = true; }
assert('BaseVectorStore.add() throws not-implemented', threw);

threw = false;
try { await base.search([], 5); } catch { threw = true; }
assert('BaseVectorStore.search() throws not-implemented', threw);

// ─── 3. InMemoryVectorStore ──────────────────────────────────────────────────
console.log('\n[3] InMemoryVectorStore');

const store = new InMemoryVectorStore();
await store.add({ heading: 'Agents',   source: 'docs.md > Agents',   text: 'Agent setup' }, [1, 0, 0]);
await store.add({ heading: 'Billing',  source: 'billing.md',          text: 'Billing plans' }, [0, 1, 0]);
await store.add({ heading: 'WhatsApp', source: 'whatsapp.md',         text: 'WhatsApp setup' }, [0, 0, 1]);

assert('size() returns 3',   store.size() === 3);

const results = await store.search([1, 0, 0], 3);
assert('search returns results', results.length > 0);
assert('Top result is Agents',   results[0].chunk.heading === 'Agents');
assert('Score is ~1 for perfect match', Math.abs(results[0].score - 1.0) < 0.001);
assert('Results sorted descending', results[0].score >= results[1].score);

// Test export/load round-trip
const exported = store.exportEntries();
assert('exportEntries returns array', Array.isArray(exported));
assert('Exported has 3 entries',      exported.length === 3);

const store2 = new InMemoryVectorStore();
store2.loadEntries(exported);
assert('loadEntries restores size',   store2.size() === 3);
const r2 = await store2.search([0, 1, 0], 1);
assert('Restored store finds Billing', r2[0].chunk.heading === 'Billing');

// Test clear
await store.clear();
assert('clear() empties the store', store.size() === 0);

// ─── 4. PromptBuilder ────────────────────────────────────────────────────────
console.log('\n[4] PromptBuilder');

const fakeChunks = [
  { chunk: { text: 'Create an agent by clicking Create.', heading: 'Create Agent', relativePath: 'dashboard.md', source: 'Dashboard > Create Agent' }, score: 0.87 },
  { chunk: { text: 'Billing starts at $15/month.',        heading: 'Billing',       relativePath: 'billing.md',   source: 'Billing' },                   score: 0.72 },
];

const prompt = buildSystemPrompt(fakeChunks);
assert('Prompt contains STRICT RULES',     prompt.includes('STRICT RULES'));
assert('Prompt contains SOURCE tag',       prompt.includes('[SOURCE:'));
assert('Prompt contains chunk text',       prompt.includes('Create an agent by clicking Create.'));
assert('Prompt forbids outside knowledge', prompt.includes('outside knowledge') || prompt.includes('outside'));
assert('REFUSAL_PHRASE is a non-empty string', typeof REFUSAL_PHRASE === 'string' && REFUSAL_PHRASE.length > 20);
assert('Prompt mentions refusal phrase',   prompt.includes(REFUSAL_PHRASE));

// ─── 5. DocumentLoader (real files) ─────────────────────────────────────────
console.log('\n[5] DocumentLoader');

const docs = loadDocuments();
assert('Loads at least 10 documents',         docs.length >= 10);
assert('Every doc has content',               docs.every(d => d.content && d.content.length > 0));
assert('Every doc has relativePath',          docs.every(d => d.relativePath));
assert('Every doc has mtimeMs',               docs.every(d => d.mtimeMs > 0));
assert('No README.md loaded',                 !docs.some(d => d.relativePath.toLowerCase() === 'readme.md'));
assert('No REPORT files loaded',              !docs.some(d => d.relativePath.toUpperCase().includes('REPORT')));
assert('Dashboard docs included',             docs.some(d => d.relativePath.includes('dashboard')));

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Some tests FAILED');
  process.exit(1);
} else {
  console.log('All tests PASSED ✓');
}
