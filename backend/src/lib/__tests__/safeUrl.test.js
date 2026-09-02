import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, isForbiddenHost, assertPublicHttpUrlSync, assertPublicHttpUrl } from '../safeUrl.js';

const rejects400 = async (p, re) => {
  await assert.rejects(p, (e) => { assert.equal(e.statusCode, 400); assert.equal(e.code, 'URL_NOT_ALLOWED'); if (re) assert.match(e.message, re); return true; });
};
const throws400 = (fn, re) => assert.throws(fn, (e) => { assert.equal(e.statusCode, 400); if (re) assert.match(e.message, re); return true; });

describe('address classification', () => {
  test('private, loopback, link-local, CGNAT, metadata and reserved v4 ranges are private', () => {
    for (const ip of ['127.0.0.1', '127.255.255.254', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.18.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
  });
  test('ordinary public v4 addresses are not', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '100.128.0.1', '203.0.114.1', '52.1.2.3']) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });
  test('v6 loopback, unique-local, link-local, multicast and v4-mapped private are private', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    assert.equal(isPrivateAddress('2606:4700::1111'), false);
    assert.equal(isPrivateAddress('::ffff:8.8.8.8'), false);
  });
  test('a non-address is treated as unsafe', () => {
    assert.equal(isPrivateAddress('not-an-ip'), true);
  });
});

describe('hostname shape', () => {
  test('local names and internal suffixes are forbidden', () => {
    for (const h of ['localhost', 'LOCALHOST', 'localhost.', 'api.localhost', 'printer.local', 'db.internal', 'metadata.google.internal', 'metadata', '']) {
      assert.equal(isForbiddenHost(h), true, h);
    }
  });
  test('literal private IPs in host position are forbidden, bracketed v6 included', () => {
    for (const h of ['127.0.0.1', '10.1.2.3', '[::1]', '[fe80::1]', '169.254.169.254']) assert.equal(isForbiddenHost(h), true, h);
  });
  test('public names and public literals pass', () => {
    for (const h of ['api.example.com', 'hooks.zapier.com', '8.8.8.8', '[2606:4700::1111]']) assert.equal(isForbiddenHost(h), false, h);
  });
});

describe('assertPublicHttpUrlSync', () => {
  test('accepts a plain public https URL and returns the parsed URL', () => {
    const u = assertPublicHttpUrlSync('https://api.example.com/v1/hook?x=1');
    assert.equal(u.hostname, 'api.example.com');
  });
  test('refuses non-http schemes', () => {
    for (const s of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://x', 'javascript:alert(1)', 'redis://127.0.0.1:6379']) {
      throws400(() => assertPublicHttpUrlSync(s), /http and https/);
    }
  });
  test('refuses embedded credentials', () => {
    throws400(() => assertPublicHttpUrlSync('https://user:pw@api.example.com/'), /Credentials/);
  });
  test('refuses the classic SSRF targets, including obfuscated literal forms', () => {
    for (const s of [
      'http://localhost:4000/api/v1/admin/users',
      'http://127.0.0.1:6379/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://[::1]:4000/',
      'http://2130706433/',         // decimal 127.0.0.1 — WHATWG normalises to 127.0.0.1
      'http://0x7f000001/',         // hex
      'http://0177.0.0.1/',         // octal
      'http://127.1/',              // shorthand
    ]) {
      throws400(() => assertPublicHttpUrlSync(s), /local or private/);
    }
  });
  test('refuses garbage', () => {
    throws400(() => assertPublicHttpUrlSync('not a url'), /valid URL/);
  });
});

describe('assertPublicHttpUrl (with resolution)', () => {
  const resolving = (map) => async (host) => {
    if (!(host in map)) throw new Error('ENOTFOUND');
    return map[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };

  test('passes when every resolved address is public', async () => {
    const u = await assertPublicHttpUrl('https://api.example.com/', { lookup: resolving({ 'api.example.com': ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'] }) });
    assert.equal(u.hostname, 'api.example.com');
  });
  test('refuses when ANY resolved address is private (split-horizon / rebinding setup)', async () => {
    await rejects400(assertPublicHttpUrl('https://evil.example/', { lookup: resolving({ 'evil.example': ['93.184.216.34', '10.0.0.1'] }) }), /local or private/);
    await rejects400(assertPublicHttpUrl('https://evil.example/', { lookup: resolving({ 'evil.example': ['169.254.169.254'] }) }), /local or private/);
  });
  test('refuses an unresolvable host rather than letting fetch decide', async () => {
    await rejects400(assertPublicHttpUrl('https://nope.invalid/', { lookup: resolving({}) }), /could not be resolved/);
  });
  test('a public literal IP skips resolution', async () => {
    const u = await assertPublicHttpUrl('http://8.8.8.8/', { lookup: async () => { throw new Error('should not be called'); } });
    assert.equal(u.hostname, '8.8.8.8');
  });
});
