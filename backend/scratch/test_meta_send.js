import 'dotenv/config';
import fetch from 'node-fetch';
import { env } from '../src/config/env.js';

const token = env.META_SYSTEM_USER_TOKEN;
const phoneNumberId = '1031627060036391';
const toMobile = '919373229862';

async function run() {
  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toMobile,
        type: 'template',
        template: {
          name: 'welcome_new_customer',
          language: {
            code: 'en_US'
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: '123456'
                },
                {
                  type: 'text',
                  text: 'OmniDimension KYC'
                }
              ]
            }
          ]
        }
      })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

run();
