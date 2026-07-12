import 'dotenv/config';
import fetch from 'node-fetch';

const systemPrompt = "You are an expert AI architect. Generate highly personalized voice assistant configurations in clean, valid JSON format.";
const name = "info of india";
const prompt = `Generate a personalized conversational flow configuration for a voice assistant.
Assistant Name/Purpose: "${name}"

Keep your chain of thought/reasoning extremely brief (under 5 sentences), then immediately output the raw JSON object inside a \`\`\`json markdown block. Do not waste tokens explaining.

The JSON must have this exact structure:
{
  "welcomeMessage": "A natural, warm vocal welcome greeting tailored to this assistant. E.g. 'Hello, I am [Agent Name], your...', etc.",
  "flowItems": [
    {
      "id": "1",
      "title": "Agent Identity & Purpose",
      "enabled": true,
      "body": "AGENT GLOBAL INSTRUCTIONS\\n# PERSONA\\n- Guidelines..."
    },
    {
      "id": "2",
      "title": "...",
      "enabled": true,
      "body": "..."
    }
  ]
}

Provide 4 to 8 logical, structured conversational steps (flow items) that cover the stages of the assistant's workflow (e.g. Identity & Purpose, Understand User Request, Primary Actions, Out of Scope Handling, next steps, FAQ Examples, Context). Each flow item must be detailed and highly specific to "${name}". Do not use bullet points or formatted text in any sample vocal responses/examples.`;

async function test() {
  const sarvamUrl = process.env.SARVAM_URL || "https://api.sarvam.ai";
  const sarvamModel = process.env.SARVAM_MODEL || "sarvam-30b";
  const apiKey = process.env.SARVAM_API_KEY;

  console.log("Using API Key:", apiKey ? "Key configured" : "NO KEY CONFIGURED");
  console.log("Calling Sarvam...");

  try {
    const res = await fetch(`${sarvamUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: sarvamModel,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    console.log("Status:", res.status);
    if (!res.ok) {
      const errText = await res.text();
      console.error("Error response:", errText);
      return;
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content?.trim() || "";
    const reasoning = data.choices?.[0]?.message?.reasoning_content;

    console.log("--- Content ---");
    console.log(responseText);
    console.log("--- Reasoning ---");
    console.log(reasoning);

    // Let's run the extractJson logic on it
    const hasPlaceholders = (parsed) => {
      if (!parsed || !Array.isArray(parsed.flowItems)) return true;
      return parsed.flowItems.some(item => {
        const title = item.title || "";
        const body = item.body || "";
        return title.includes('...') || 
               body.includes('...') || 
               body.toLowerCase().includes('guidelines...') ||
               body.toLowerCase().includes('placeholder');
      });
    };

    const extractJson = (text) => {
      if (!text || typeof text !== 'string') return null;
      let cleaned = text.trim();
      
      const matches = [...cleaned.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
      // Iterate in reverse to find the latest valid JSON block
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(matches[i][1].trim());
          if (parsed && (parsed.welcomeMessage || parsed.flowItems)) {
            if (!hasPlaceholders(parsed)) {
              return parsed;
            } else {
              console.log(`JSON block ${i} had placeholders.`);
            }
          }
        } catch (e) {
          console.log(`Failed to parse JSON match ${i}:`, e.message);
        }
      }
      return null;
    };

    let parsed = extractJson(responseText);
    if (!parsed && reasoning) {
      console.log("Content parsing failed, trying reasoning_content...");
      parsed = extractJson(reasoning);
    }

    console.log("--- Parsed Result ---");
    console.log(parsed ? JSON.stringify(parsed, null, 2) : "FAILED TO PARSE");

  } catch (err) {
    console.error("Network or execution error:", err);
  }
}

test();
