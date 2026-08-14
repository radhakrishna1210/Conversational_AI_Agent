// backend/src/config/__tests__/csp.test.js
/**
 * The Content-Security-Policy, asserted as a rendered header.
 *
 * This exists because a CSP mistake is invisible where it is made. The policy
 * only applies in production, where this process serves the SPA; in development
 * Vite serves it from its own origin with no CSP, so every directive here is
 * untested by simply running the app. Wallet top-up shipped with Checkout's
 * script blocked in production and working on every developer's machine.
 *
 * Rendered through helmet rather than inspected as an object, so what is checked
 * is the header a browser actually receives — including helmet's own defaults
 * for directives this app does not name.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import helmet from 'helmet';
import { cspDirectives, RAZORPAY_HOSTS } from '../csp.js';

/** The Content-Security-Policy header helmet would send, as a string. */
function renderCsp() {
  const headers = {};
  const mw = helmet({ contentSecurityPolicy: { directives: cspDirectives() } });
  mw(
    { method: 'GET' },
    { setHeader: (k, v) => { headers[k] = v; }, removeHeader: () => {} },
    (err) => { if (err) throw err; },
  );
  return headers['Content-Security-Policy'] ?? '';
}

/** One directive's source list. */
function directive(csp, name) {
  const found = csp.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `));
  return found ? found.slice(name.length).trim().split(/\s+/).filter(Boolean) : null;
}

test('a policy is actually emitted', () => {
  assert.ok(renderCsp().length > 0, 'no CSP header at all means none of this is enforced');
});

test('Razorpay Checkout can load its script', () => {
  // The exact regression: without this the Pay button opens nothing on the
  // deployed site, while working locally where no CSP is served.
  const scriptSrc = directive(renderCsp(), 'script-src');
  for (const host of RAZORPAY_HOSTS.script) {
    assert.ok(scriptSrc.includes(host), `script-src is missing ${host}`);
  }
});

test('Razorpay Checkout can render its payment iframe', () => {
  // Allowing the script host but not the iframe host is the subtler half of the
  // same bug: Checkout loads and then shows an empty modal.
  const csp = renderCsp();
  for (const name of ['frame-src', 'child-src']) {
    const sources = directive(csp, name);
    assert.ok(sources, `${name} is not set`);
    for (const host of RAZORPAY_HOSTS.frame) {
      assert.ok(sources.includes(host), `${name} is missing ${host}`);
    }
  }
});

test('a bank redirect can post out of the payment form', () => {
  // helmet defaults form-action to 'self'. Left at the default, netbanking dies
  // at the last step — after the customer has entered their details.
  const formAction = directive(renderCsp(), 'form-action');
  assert.ok(formAction, 'form-action is not set, so helmet\'s restrictive default applies');
  assert.ok(formAction.includes('https://api.razorpay.com'));
});

test('the voice call sockets and their audio still work', () => {
  // Guards the directives that were already load-bearing before Razorpay was
  // added, since this file is now the one place they can be broken.
  const csp = renderCsp();
  const connect = directive(csp, 'connect-src');
  assert.ok(connect.includes('wss:') && connect.includes('ws:'), 'web calls need ws/wss');
  assert.ok(directive(csp, 'media-src').includes('blob:'), 'TTS plays back from blob URLs');
  assert.ok(directive(csp, 'worker-src').includes('blob:'));
});

test('the policy is still restrictive where it costs nothing', () => {
  const csp = renderCsp();
  assert.deepEqual(directive(csp, 'default-src'), ["'self'"]);
  assert.deepEqual(directive(csp, 'object-src'), ["'none'"]);
});

test('insecure requests are upgraded only in production', () => {
  // Locally the API is plain http; upgrading would break every request.
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    assert.equal(cspDirectives().upgradeInsecureRequests, null);
  } finally {
    process.env.NODE_ENV = original;
  }
});
