import 'dotenv/config';
import fetch from 'node-fetch';
import { env } from '../src/config/env.js';

const token = env.META_SYSTEM_USER_TOKEN;
const wabaId = env.META_WABA_ID;

async function run() {
  if (!token || !wabaId) {
    console.error('Missing Meta token or Waba ID');
    return;
  }
  try {
    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error listing WABA templates:', err);
  }
}

run();
