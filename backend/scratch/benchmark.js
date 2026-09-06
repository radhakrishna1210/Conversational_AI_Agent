/**
 * Complete Voice AI LLM Benchmark Runner
 * Runs latency & token tests across all 10 top models.
 * Run: node --env-file=backend/.env backend/scratch/benchmark.js [optional-filter]
 */

import { groqService } from "../src/services/groq.service.js";
import { openaiService } from "../src/services/llm/openai.service.js";
import { openrouterService } from "../src/services/llm/openrouter.service.js";

const prompt = "Hello! In 1 short sentence, who are you and how can you help me on a phone call?";

export const MODELS_TO_TEST = [
  { id: 1, name: "Groq GPT-OSS 20B (Ultra-Fast)", provider: "Groq", model: "openai/gpt-oss-20b", runner: groqService },
  { id: 2, name: "Groq GPT-OSS 120B (High Reasoning)", provider: "Groq", model: "openai/gpt-oss-120b", runner: groqService },
  { id: 3, name: "Groq Qwen 3.8 27B (Multilingual Voice)", provider: "Groq", model: "qwen/qwen3.8-27b", runner: groqService },
  { id: 4, name: "Groq Compound Mini", provider: "Groq", model: "groq/compound-mini", runner: groqService },
  { id: 5, name: "OpenAI GPT-4o (Flagship)", provider: "OpenAI", model: "gpt-4o", runner: openaiService },
  { id: 6, name: "OpenAI GPT-4o Mini (Fast Voice)", provider: "OpenAI", model: "gpt-4o-mini", runner: openaiService },
  { id: 7, name: "OpenAI GPT-4.1 Mini", provider: "OpenAI", model: "gpt-4.1-mini", runner: openaiService },
  { id: 8, name: "OpenRouter Ling 3.0 Flash (Free ⚡)", provider: "OpenRouter", model: "inclusionai/ling-3.0-flash-fin:free", runner: openrouterService },
  { id: 9, name: "OpenRouter MiniMax M2.7 (Free)", provider: "OpenRouter", model: "minimax/minimax-m2.7:free", runner: openrouterService },
  { id: 10, name: "OpenRouter Nemotron 3.5 Lightning (Free)", provider: "OpenRouter", model: "nvidia/nemotron-3.5-lightning:free", runner: openrouterService },
];

async function main() {
  const filter = process.argv[2];
  let targets = MODELS_TO_TEST;

  if (filter) {
    if (!isNaN(filter)) {
      targets = targets.filter(t => t.id === parseInt(filter, 10));
    } else {
      targets = targets.filter(t => t.model.toLowerCase().includes(filter.toLowerCase()) || t.provider.toLowerCase().includes(filter.toLowerCase()));
    }
  }

  console.log("==================================================================================");
  console.log("                       VOICE AI MODEL BENCHMARK RUNNER                            ");
  console.log(` Testing ${targets.length} model(s)`);
  console.log(` Prompt: "${prompt}"`);
  console.log("==================================================================================\n");

  const results = [];

  for (const item of targets) {
    process.stdout.write(`[#${item.id}] Testing ${item.provider} -> ${item.model}... `);
    try {
      const start = Date.now();
      let firstToken = null;
      let reply = "";

      const stream = item.runner.generateResponseStream(
        prompt,
        { model: item.model, temperature: 0.7 },
        { systemPrompt: "You are a professional voice receptionist." }
      );

      for await (const chunk of stream) {
        if (firstToken === null) firstToken = Date.now() - start;
        reply += chunk;
      }

      const total = Date.now() - start;
      console.log(`✅ TTFT: ${firstToken}ms | Total: ${total}ms`);
      results.push({
        "#": item.id,
        "Provider": item.provider,
        "Model": item.model,
        "TTFT (ms)": firstToken,
        "Total (ms)": total,
        "Sample": reply.trim().replace(/\n/g, " ").slice(0, 65)
      });
    } catch (err) {
      console.log(`❌ FAILED: ${err.message.split("\n")[0]}`);
      results.push({
        "#": item.id,
        "Provider": item.provider,
        "Model": item.model,
        "TTFT (ms)": "FAIL",
        "Total (ms)": "FAIL",
        "Sample": err.message.split("\n")[0].slice(0, 45)
      });
    }
  }

  console.log("\n==================================================================================");
  console.log("                               RESULTS SUMMARY                                    ");
  console.log("==================================================================================");
  console.table(results);
  process.exit(0);
}

main();
