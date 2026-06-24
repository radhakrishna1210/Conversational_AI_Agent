import 'dotenv/config';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

console.log('Using Account SID:', accountSid);
console.log('Using Auth Token length:', authToken ? authToken.length : 0);

if (!accountSid || !authToken) {
  console.error('Twilio credentials missing in environment!');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function run() {
  try {
    console.log('Fetching incoming phone numbers...');
    const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 10 });
    console.log('Found phone numbers:');
    if (incomingNumbers.length === 0) {
      console.log('No phone numbers found on this account.');
    } else {
      incomingNumbers.forEach(num => {
        console.log(`- ${num.phoneNumber} (Sid: ${num.sid}, FriendlyName: ${num.friendlyName})`);
      });
    }

    console.log('\nFetching account details...');
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log(`Account Status: ${account.status}, Type: ${account.type}`);

    console.log('\nSending test message to +919373229862...');
    // Try sending with a magic number or first number if available
    const fromNum = incomingNumbers.length > 0 ? incomingNumbers[0].phoneNumber : '+15005550006';
    console.log(`Using 'from' number: ${fromNum}`);
    
    try {
      const msg = await client.messages.create({
        body: 'Twilio test message from Whabridge local diagnostic.',
        from: fromNum,
        to: '+919373229862'
      });
      console.log('Test message sent successfully! Message SID:', msg.sid);
    } catch (err) {
      console.error('Failed to send test message:', err.message);
      if (err.code) {
        console.error(`Twilio Error Code: ${err.code} - ${err.moreInfo}`);
      }
    }
  } catch (err) {
    console.error('Twilio API request failed:', err.message);
  }
}

run();
