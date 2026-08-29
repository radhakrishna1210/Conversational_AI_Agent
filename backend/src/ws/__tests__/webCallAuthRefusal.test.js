// The bug these pin: every way a web call could fail to start closed the socket
// without sending anything first. A WebSocket close code and reason are not
// exposed to page JavaScript in any useful form, so the browser could only fall
// back to one sentence — "The Web Call could not be started" — for an expired
// token, a deleted agent, and a database that was not answering alike.
//
// That is what happened in production: the wallet gate was taking 21.6s against
// a 10s deadline, and finding out required probing the database by hand,
// because the screen said nothing and the log line said "Auth timeout" — which
// blamed the browser for the server's own slowness.
//
// Two things must hold now. Every refusal carries a machine code AND a sentence
// a caller can act on; and the deadline the browser is held to covers only what
// the browser controls.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// The handler reads its deadlines at module load, and ESM hoists every static
// import above the file body — so setting these at the top level would run too
// late and the test would silently measure the 10s production default. Loaded
// dynamically, after the environment is in place.
let handleWebCallModularUpgrade;
before(async () => {
  process.env.WEB_CALL_AUTH_TIMEOUT_MS = '150';
  process.env.WEB_CALL_STARTUP_TIMEOUT_MS = '400';
  ({ handleWebCallModularUpgrade } = await import('../webCallModularRealtime.handler.js'));
});

/** Minimal stand-in for a `ws` socket: records what the server said and did. */
function fakeSocket() {
  const handlers = {};
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    closed: null,
    on(event, fn) { handlers[event] = fn; },
    emit(event, ...args) { return handlers[event]?.(...args); },
    send(raw) { try { this.sent.push(JSON.parse(raw)); } catch { /* binary */ } },
    close(code, reason) {
      if (!this.closed) this.closed = { code, reason };
      this.readyState = 3;
    },
    ping() {},
    terminate() { this.readyState = 3; },
  };
}

const errors = (ws) => ws.sent.filter((m) => m.type === 'error');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('web call refusals always tell the caller why', () => {
  test('a client that never authenticates is told so, not just disconnected', async () => {
    const ws = fakeSocket();
    await handleWebCallModularUpgrade(ws, { workspaceId: 'w1', agentId: 'a1' });

    await wait(400); // past WEB_CALL_AUTH_TIMEOUT_MS

    const [err] = errors(ws);
    assert.ok(err, 'an error frame must precede the close');
    assert.equal(err.code, 'AUTH_TIMEOUT');
    assert.match(err.message, /reload/i, 'the message must say what to do next');
    assert.equal(ws.closed.code, 4001);
  });

  test('a malformed first frame is refused with a reason', async () => {
    const ws = fakeSocket();
    await handleWebCallModularUpgrade(ws, { workspaceId: 'w1', agentId: 'a1' });

    await ws.emit('message', Buffer.from(JSON.stringify({ type: 'hello' })), false);

    const [err] = errors(ws);
    assert.ok(err, 'an error frame must precede the close');
    assert.equal(err.code, 'AUTH_MALFORMED');
    assert.equal(ws.closed.code, 4001);
  });

  test('a bad token says the session expired, and never reaches the database', async () => {
    const ws = fakeSocket();
    await handleWebCallModularUpgrade(ws, { workspaceId: 'w1', agentId: 'a1' });

    await ws.emit('message', Buffer.from(JSON.stringify({ type: 'auth', token: 'not-a-jwt' })), false);

    const [err] = errors(ws);
    assert.ok(err, 'an error frame must precede the close');
    assert.equal(err.code, 'AUTH_INVALID');
    assert.match(err.message, /sign in again/i);
    assert.equal(ws.closed.code, 4001);
  });

  test('the client deadline is released the moment its auth frame lands', async () => {
    // The regression that caused the outage: one timer covered the browser's
    // frame AND the server's own database work, so a browser that authenticated
    // in 40ms was hung up on for the database being slow — and reported as an
    // auth timeout, which sent the investigation the wrong way.
    //
    // A rejected token proves the release: the socket is closed by the token
    // check, and the reason must be the token, never the timer firing later.
    const ws = fakeSocket();
    await handleWebCallModularUpgrade(ws, { workspaceId: 'w1', agentId: 'a1' });

    await ws.emit('message', Buffer.from(JSON.stringify({ type: 'auth', token: 'not-a-jwt' })), false);
    const firstClose = ws.closed;
    assert.equal(firstClose.reason, 'AUTH_INVALID');

    await wait(400); // the old single timer would have fired inside this window

    assert.deepEqual(ws.closed, firstClose, 'the close reason must not be rewritten by the auth timer');
    assert.equal(errors(ws).length, 1, 'a refused socket must not also report a timeout');
  });

  test('every refusal carries both a code and a human sentence', async () => {
    // A code with no sentence leaves the UI with nothing to show; a sentence
    // with no code leaves the client unable to branch (add-funds vs retry).
    for (const frame of [{ type: 'hello' }, { type: 'auth', token: 'bad' }]) {
      const ws = fakeSocket();
      await handleWebCallModularUpgrade(ws, { workspaceId: 'w1', agentId: 'a1' });
      await ws.emit('message', Buffer.from(JSON.stringify(frame)), false);

      const [err] = errors(ws);
      assert.ok(err?.code, `missing code for ${JSON.stringify(frame)}`);
      assert.ok(err?.message?.length > 20, `unhelpful message for ${JSON.stringify(frame)}`);
      assert.ok(!/could not be started/i.test(err.message), 'must beat the client fallback string');
    }
  });
});
