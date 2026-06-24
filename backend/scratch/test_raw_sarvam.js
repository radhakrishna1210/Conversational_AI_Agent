import fetch from 'node-fetch';
import { env } from '../src/config/env.js';

const SARVAM_API_KEY = env.SARVAM_API_KEY;
const SARVAM_BASE_URL = env.SARVAM_URL || 'https://api.sarvam.ai';
const DEFAULT_MODEL = env.SARVAM_MODEL || 'sarvam-30b';

async function test() {
  try {
    const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SARVAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful mathematical assistant.',
          },
          {
            role: 'user',
            content: 'how to book a appointeement',
          },
        ],
        temperature: 0.5,
        top_p: 0.8,
        max_tokens: 256,
      }),
    });

    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Raw Response:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
