import fetch from 'node-fetch';

async function testRawApi() {
  // Read from the environment. A live key used to sit here as a literal and
  // shipped to GitHub in the first commit (AUDIT_REPORT A-08) — rotate it.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('Set GEMINI_API_KEY'); process.exit(1); }
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  
  const body = {
    contents: [{
      parts: [{ text: "Say 'Hello'" }]
    }]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.log("Error:", e.message);
  }
}

testRawApi();
