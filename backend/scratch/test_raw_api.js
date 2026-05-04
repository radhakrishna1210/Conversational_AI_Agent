import fetch from 'node-fetch';

async function testRawApi() {
  const apiKey = 'AIzaSyDAhaGWpmOymLtg7YVvRylorgbmZ8tHKtw';
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
