/**
 * Interactive test script for Groq models (gpt-oss-20b, gpt-oss-120b, qwen3.8-27b, compound-mini)
 * Run: node --env-file=backend/.env backend/scratch/test_groq.js [model]
 */

import { groqService } from "../src/services/groq.service.js";

const testModel = process.argv[2] || "openai/gpt-oss-20b";
const prompt = "Hello! In 2 short sentences, who are you and how can you help me on a phone call?";

async function main() {
  console.log(`\n=== Testing Groq with model: ${testModel} ===`);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("❌ GROQ_API_KEY is not set in backend/.env!");
    console.log("Please set GROQ_API_KEY in backend/.env and re-run this script.");
    process.exit(1);
  }

  console.log(`API Key configured: ${apiKey.slice(0, 8)}...`);
  console.log(`Prompt: "${prompt}"\n`);

  try {
    console.log("--- 1. Testing Streaming (Voice Pipeline TTFT) ---");
    const startTime = Date.now();
    let firstTokenTime = null;
    let fullReply = "";

    const stream = groqService.generateResponseStream(
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
