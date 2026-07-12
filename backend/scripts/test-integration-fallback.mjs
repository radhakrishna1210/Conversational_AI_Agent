import { setTimeout as delay } from 'node:timers/promises';

const BASE = 'http://127.0.0.1:4000/api/v1';

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed: ${res.status}`);
  return data;
};

const main = async () => {
  const auth = await login();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
  };

  const res = await fetch(`${BASE}/workspaces/${auth.workspace.id}/integrations/google_calendar/connect-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      integrationName: 'Test Google Calendar',
      accessToken: 'dev-test-token',
      description: 'Fallback integration test',
    }),
  });

  const payload = await res.json().catch(() => ({}));
  console.log('status', res.status);
  console.log(JSON.stringify(payload, null, 2));

  if (!res.ok || payload.connected !== true) {
    throw new Error('Expected Google Calendar connect-token fallback to succeed');
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
