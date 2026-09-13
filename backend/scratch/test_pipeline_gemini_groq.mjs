// backend/scratch/test_pipeline_gemini_groq.mjs
import prisma from '../src/config/prisma.js';
import { geminiService } from '../src/services/gemini.service.js';
import { groqService } from '../src/services/groq.service.js';
import { getLLMProvider, getLLMProviderWithFallback } from '../src/services/llm.factory.js';
import { resolveLlmForAgent, converse, converseStream, invalidateAgentRuntimeCaches } from '../src/services/agentRuntime.service.js';
import { mapAgentModel } from '../src/controllers/llm.controller.js';

console.log('====================================================');
console.log('🧪 TESTING GEMINI & GROQ IN CONVERSATIONAL AI PIPELINE');
console.log('====================================================\n');

const results = {
  env: {},
  gemini: {},
  groq: {},
  pipeline_gemini: {},
  pipeline_groq: {},
};

// 1. Check Environment Variables
console.log('--- 1. ENVIRONMENT VARIABLES ---');
results.env.GEMINI_API_KEY = Boolean(process.env.GEMINI_API_KEY);
results.env.GROQ_API_KEY = Boolean(process.env.GROQ_API_KEY);
results.env.GROQ_MODEL = process.env.GROQ_MODEL || '(default: openai/gpt-oss-20b)';
results.env.VOICE_LLM_MODEL = process.env.VOICE_LLM_MODEL || '(default: gemini-3.5-flash-lite)';

console.log(`GEMINI_API_KEY present: ${results.env.GEMINI_API_KEY ? '✅ YES' : '❌ NO'}`);
console.log(`GROQ_API_KEY present:   ${results.env.GROQ_API_KEY ? '✅ YES' : '❌ NO'}`);
console.log(`GROQ_MODEL:             ${results.env.GROQ_MODEL}`);
console.log(`VOICE_LLM_MODEL:        ${results.env.VOICE_LLM_MODEL}\n`);

// 2. Test Gemini Service Directly
console.log('--- 2. GEMINI SERVICE DIRECT TEST ---');
if (!process.env.GEMINI_API_KEY) {
  console.log('❌ GEMINI_API_KEY missing, skipping Gemini direct test');
  results.gemini.status = 'SKIPPED_NO_KEY';
} else {
  const geminiModelsToTest = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'];
  for (const model of geminiModelsToTest) {
    try {
      console.log(`Testing Gemini model "${model}"...`);
      const t0 = performance.now();
      const reply = await geminiService.generateResponse(
        `Hello! Reply with "Gemini [${model}] is operational".`,
        { model, temperature: 0.7 },
        { systemPrompt: 'You are an AI assistant test runner.', maxTokens: 100, thinkingBudget: 0, skipCache: true }
      );
      const latency = Math.round(performance.now() - t0);
      console.log(`  ✅ [${latency}ms] Response: "${reply.trim()}"`);
      results.gemini[model] = { ok: true, latency, reply: reply.trim() };
    } catch (err) {
      console.log(`  ❌ Error for model ${model}: ${err.message}`);
      results.gemini[model] = { ok: false, error: err.message };
    }
  }

  // Test Streaming for Gemini
  try {
    console.log('Testing Gemini Stream (gemini-3.5-flash-lite)...');
    const t0 = performance.now();
    let firstTokenMs = null;
    let chunks = [];
    const stream = geminiService.generateResponseStream(
      'Count 1 to 5.',
      { model: 'gemini-3.5-flash-lite', temperature: 0.7 },
      { systemPrompt: 'Be concise.', maxTokens: 50, thinkingBudget: 0 }
    );
    for await (const chunk of stream) {
      if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
      chunks.push(chunk);
    }
    const totalMs = Math.round(performance.now() - t0);
    const fullText = chunks.join('');
    console.log(`  ✅ Stream OK: TTFT=${firstTokenMs}ms, Total=${totalMs}ms, Chunks=${chunks.length}`);
    console.log(`  Output: "${fullText.trim()}"`);
    results.gemini.stream = { ok: true, ttft: firstTokenMs, totalMs, chunks: chunks.length };
  } catch (err) {
    console.log(`  ❌ Gemini Streaming error: ${err.message}`);
    results.gemini.stream = { ok: false, error: err.message };
  }
}
console.log();

// 3. Test Groq Service Directly
console.log('--- 3. GROQ SERVICE DIRECT TEST ---');
if (!process.env.GROQ_API_KEY) {
  console.log('❌ GROQ_API_KEY missing, skipping Groq direct test');
  results.groq.status = 'SKIPPED_NO_KEY';
} else {
  // Test Groq models
  const groqModelsToTest = [
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b',
    'allam-2-7b'
  ];
  for (const model of groqModelsToTest) {
    try {
      console.log(`Testing Groq model "${model}"...`);
      const t0 = performance.now();
      const reply = await groqService.generateResponse(
        `Hello! Reply with "Groq is working for ${model} in 5 words".`,
        { model, temperature: 0.7 },
        { systemPrompt: 'You are an AI assistant test runner.', maxTokens: 100 }
      );
      const latency = Math.round(performance.now() - t0);
      console.log(`  ✅ [${latency}ms] Response: "${reply.trim()}"`);
      results.groq[model] = { ok: true, latency, reply: reply.trim() };
    } catch (err) {
      console.log(`  ❌ Error for model ${model}: ${err.message}`);
      results.groq[model] = { ok: false, error: err.message };
    }
  }

  // Test Streaming for Groq
  try {
    console.log('Testing Groq Stream (openai/gpt-oss-20b)...');
    const t0 = performance.now();
    let firstTokenMs = null;
    let chunks = [];
    const stream = groqService.generateResponseStream(
      'Count 1 to 5.',
      { model: 'openai/gpt-oss-20b', temperature: 0.7 },
      { systemPrompt: 'Be concise.', maxTokens: 50 }
    );
    for await (const chunk of stream) {
      if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
      chunks.push(chunk);
    }
    const totalMs = Math.round(performance.now() - t0);
    const fullText = chunks.join('');
    console.log(`  ✅ Stream OK: TTFT=${firstTokenMs}ms, Total=${totalMs}ms, Chunks=${chunks.length}`);
    console.log(`  Output: "${fullText.trim()}"`);
    results.groq.stream = { ok: true, ttft: firstTokenMs, totalMs, chunks: chunks.length };
  } catch (err) {
    console.log(`  ❌ Groq Streaming error: ${err.message}`);
    results.groq.stream = { ok: false, error: err.message };
  }
}
console.log();

// 4. Test Model Mapping and Factory Resolution
console.log('--- 4. MODEL MAPPING & FACTORY RESOLUTION ---');
const mappings = [
  'Gemini 3.5 Flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'Groq Llama 3.3',
  'openai/gpt-oss-20b',
  'Qwen 3.6',
  'Allam 2 7B'
];

for (const label of mappings) {
  const mapped = mapAgentModel(label);
  const resolved = resolveLlmForAgent({ aiModel: label });
  console.log(`Label: "${label}" -> mapped:`, mapped, `-> resolved: provider=${resolved.provider}, model=${resolved.model}`);
}
console.log();

// 5. Test Full Agent Pipeline (converse & converseStream) with Gemini & Groq
console.log('--- 5. FULL PIPELINE TEST (converse & converseStream) ---');

let testAgent = await prisma.agent.findFirst({
  include: { workspace: true }
});

if (!testAgent) {
  console.log('No agents found in DB, skipping DB pipeline test');
} else {
  console.log(`Using DB Agent: "${testAgent.name}" (ID: ${testAgent.id}, Workspace: ${testAgent.workspaceId})`);
  const testWorkspaceId = testAgent.workspaceId;
  const testAgentId = testAgent.id;
  const originalModel = testAgent.aiModel;

  // 5A. Pipeline with Gemini
  console.log('\n--- 5A. PIPELINE WITH GEMINI ---');
  try {
    await prisma.agent.update({
      where: { id: testAgentId },
      data: { aiModel: 'gemini-3.5-flash-lite' }
    });
    invalidateAgentRuntimeCaches(testWorkspaceId, testAgentId);

    const messages = [
      { role: 'user', content: 'Tell me in one sentence how Gemini handles customer inquiries.' }
    ];

    console.log('Running converse() [Single-call turn] with Gemini...');
    const t0 = performance.now();
    const convRes = await converse(testWorkspaceId, testAgentId, messages, { voiceMode: true });
    const latency = Math.round(performance.now() - t0);
    console.log(`  ✅ converse() succeeded in ${latency}ms`);
    console.log(`     Provider: ${convRes.provider}, Model: ${convRes.model}`);
    console.log(`     Reply: "${convRes.reply}"`);
    results.pipeline_gemini.converse = { ok: true, latency, reply: convRes.reply, provider: convRes.provider, model: convRes.model };

    console.log('Running converseStream() [Streaming turn] with Gemini...');
    const t1 = performance.now();
    let firstDelta = null;
    const streamChunks = [];
    const generator = converseStream(testWorkspaceId, testAgentId, [{ role: 'user', content: 'What are your working hours?' }], { voiceMode: true });
    for await (const delta of generator) {
      if (firstDelta === null) firstDelta = Math.round(performance.now() - t1);
      streamChunks.push(delta);
    }
    const streamTotal = Math.round(performance.now() - t1);
    console.log(`  ✅ converseStream() succeeded: TTFT=${firstDelta}ms, Total=${streamTotal}ms`);
    console.log(`     Streamed Text: "${streamChunks.join('')}"`);
    results.pipeline_gemini.converseStream = { ok: true, ttft: firstDelta, totalMs: streamTotal };
  } catch (err) {
    console.log(`  ❌ Pipeline Gemini error: ${err.message}`);
    results.pipeline_gemini.error = err.message;
  }

  // 5B. Pipeline with Groq
  console.log('\n--- 5B. PIPELINE WITH GROQ ---');
  try {
    await prisma.agent.update({
      where: { id: testAgentId },
      data: { aiModel: 'openai/gpt-oss-20b' }
    });
    invalidateAgentRuntimeCaches(testWorkspaceId, testAgentId);

    const messages = [
      { role: 'user', content: 'Tell me in one sentence how Groq handles fast response generation.' }
    ];

    console.log('Running converse() [Single-call turn] with Groq...');
    const t0 = performance.now();
    const convRes = await converse(testWorkspaceId, testAgentId, messages, { voiceMode: true });
    const latency = Math.round(performance.now() - t0);
    console.log(`  ✅ converse() succeeded in ${latency}ms`);
    console.log(`     Provider: ${convRes.provider}, Model: ${convRes.model}`);
    console.log(`     Reply: "${convRes.reply}"`);
    results.pipeline_groq.converse = { ok: true, latency, reply: convRes.reply, provider: convRes.provider, model: convRes.model };

    console.log('Running converseStream() [Streaming turn] with Groq...');
    const t1 = performance.now();
    let firstDelta = null;
    const streamChunks = [];
    const generator = converseStream(testWorkspaceId, testAgentId, [{ role: 'user', content: 'Can I book a consultation call?' }], { voiceMode: true });
    for await (const delta of generator) {
      if (firstDelta === null) firstDelta = Math.round(performance.now() - t1);
      streamChunks.push(delta);
    }
    const streamTotal = Math.round(performance.now() - t1);
    console.log(`  ✅ converseStream() succeeded: TTFT=${firstDelta}ms, Total=${streamTotal}ms`);
    console.log(`     Streamed Text: "${streamChunks.join('')}"`);
    results.pipeline_groq.converseStream = { ok: true, ttft: firstDelta, totalMs: streamTotal };
  } catch (err) {
    console.log(`  ❌ Pipeline Groq error: ${err.message}`);
    results.pipeline_groq.error = err.message;
  }

  // Restore original model
  await prisma.agent.update({
    where: { id: testAgentId },
    data: { aiModel: originalModel }
  });
  invalidateAgentRuntimeCaches(testWorkspaceId, testAgentId);
}

await prisma.$disconnect();

console.log('\n====================================================');
console.log('🏁 TEST SUMMARY COMPLETED');
console.log('====================================================');
