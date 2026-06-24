import fetch from 'node-fetch';

async function test() {
  try {
    console.log("Calling local backend chat endpoint...");
    const response = await fetch('http://localhost:4000/api/v1/agents/131000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'how to book a appointeement',
        selectedLanguages: ['English (Indian)'],
        welcomeMessage: 'Hello, I am your appointment coordinator. I am calling to confirm your upcoming appointment or help you manage your booking. How can I help you today?'
      }),
    });

    console.log("Status:", response.status);
    console.log("Headers:", response.headers.raw());
    const text = await response.text();
    console.log("Raw Body:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
