/**
 * Interactive test script for Mistral AI models (mistral-small-latest, open-mistral-nemo, codestral-latest)
 * Run: node --env-file=backend/.env backend/scratch/test_mistral.js [model]
 */

import { mistralService } from "../src/services/llm/mistral.service.js";

const testModel = process.argv[2] || "mistral-small-latest";
const prompt = "Hello! In 2 short sentences, who are you and how can you help me on a phone call?";

async function main() {
  console.log(`\n=== Testing Mistral AI with model: ${testModel} ===`);
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("❌ MISTRAL_API_KEY is not set in backend/.env!");
    console.log("Please set MISTRAL_API_KEY in backend/.env (Get one from https://console.mistral.ai) and re-run.");
    process.exit(1);
  }

  console.log(`API Key configured: ${apiKey.slice(0, 8)}...`);
  console.log(`Prompt: "${prompt}"\n`);

  try {
    console.log("--- 1. Testing Streaming (Voice Pipeline TTFT) ---");
    const startTime = Date.now();
    let firstTokenTime = null;
    let fullReply = "";

    const stream = mistralService.generateResponseStream(
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
