/**
 * Interactive test script for OpenAI models (gpt-4o-mini, gpt-4o, gpt-4.1-mini, etc.)
 * Run: node --env-file=backend/.env backend/scratch/test_openai.js [model]
 */

import { openaiService } from "../src/services/llm/openai.service.js";

const testModel = process.argv[2] || "gpt-4o-mini";
const prompt = "Hello! In 1 short sentence, who are you and how can you help me on a phone call?";

async function main() {
  console.log(`\n=== Testing OpenAI with model: ${testModel} ===`);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY is not set in backend/.env!");
    console.log("Please set OPENAI_API_KEY in backend/.env and re-run this script.");
    process.exit(1);
  }

  console.log(`API Key configured: ${apiKey.slice(0, 7)}...`);
  console.log(`Prompt: "${prompt}"\n`);

  try {
    console.log("--- 1. Testing Streaming (Voice Pipeline TTFT) ---");
    const startTime = Date.now();
    let firstTokenTime = null;
    let fullReply = "";

    const stream = openaiService.generateResponseStream(
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
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error during generation: ${err.message}`);
    process.exit(1);
  }
}

main();
