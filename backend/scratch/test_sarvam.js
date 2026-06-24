import 'dotenv/config';
import { generateResponse } from '../src/services/sarvam.service.js';

async function test() {
  try {
    console.log("Testing Sarvam API...");
    const response = await generateResponse("how to book a appointeement", ["English (Indian)"], {
      welcomeMessage: "Hello, I am your appointment coordinator. I am calling to confirm your upcoming appointment or help you manage your booking. How can I help you today?"
    });
    console.log("Response:", response);
  } catch (err) {
    console.error("Error calling Sarvam:", err);
  }
}

test();
