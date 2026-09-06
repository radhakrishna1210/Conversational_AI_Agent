/**
 * Interactive test script for Together AI models (Llama 3.3 70B, Qwen 2.5 72B, DeepSeek V3)
 * Run: node --env-file=backend/.env backend/scratch/test_together.js [model]
 */

import { togetherService } from "../src/services/llm/together.service.js";

const testModel = process.argv[2] || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
const prompt = "Hello! In 2 short sentences, who are you and how can you help me on a phone call?";

async function main() {
  console.log(`\n=== Testing Together AI with model: ${testModel} ===`);
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    console.error("❌ TOGETHER_API_KEY is not set in backend/.env!");
    console.log("Please set TOGETHER_API_KEY in backend/.env (Get one from https://api.together.ai) and re-run.");
    process.exit(1);
  }

  console.log(`API Key configured: ${apiKey.slice(0, 8)}...`);
  console.log(`Prompt: "${prompt}"\n`);

  try {
    console.log("--- 1. Testing Streaming (Voice Pipeline TTFT) ---");
    const startTime = Date.now();
    let firstTokenTime = null;
    let fullReply = "";

    const stream = togetherService.generateResponseStream(
      prompt,
      { model: testModel, temperature: 0.7 },
      { systemPrompt: "You are a professional voice receptionist." }
    );

    for await (const chunk of stream) {
      if (firstTokenTime === null) {
        firstTokenTime = Date.now() - startTime;
        console.log(`⚡ Time to First Token (TTFT): ${firstTokenTime}ms`);
      }
      process.stdout.write(chunk);
      fullReply += chunk;
    }

    const totalTime = Date.now() - startTime;
    console.log(`\n\n✅ Stream completed in ${totalTime}ms.`);
    console.log(`Total text length: ${fullReply.length} characters.\n`);
  } catch (err) {
    console.error(`\n❌ Error during generation: ${err.message}`);
  }
}

main();
