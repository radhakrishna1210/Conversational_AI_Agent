import 'dotenv/config';
import fetch from 'node-fetch';

async function test() {
  console.log('Sending test KYC OTP request to backend...');
  try {
    const res = await fetch('http://localhost:4000/api/v1/kyc/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: '9373229862',
        type: 'mobile'
      })
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Request failed:', err);
  }
}

test();
