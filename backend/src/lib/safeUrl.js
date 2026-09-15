// backend/src/lib/safeUrl.js
/**
 * SSRF guard for URLs a tenant types in — custom API endpoints, webhooks,
 * self-hosted model servers.
 *
 * `z.string().url()` accepts `http://127.0.0.1:6379/`, `http://localhost:4000/
 * api/v1/admin/...`, `http://169.254.169.254/latest/meta-data/` and
 * `http://10.0.0.5/`. Every one of those is a request this server would make
 * on the tenant's behalf, with the tenant's chosen headers, to something only
 * this server can reach. This module refuses them.
 *
 * Two layers, because a hostname is not an address:
 *   1. `assertPublicHttpUrlSync` — scheme, credentials, and the hostname /
 *      literal-IP shape. Cheap; use it in validators at save time.
 *   2. `assertPublicHttpUrl` — the above, then resolves the hostname and
 *      checks EVERY address it maps to. Use it immediately before `fetch`.
 *
 * Known limit, stated plainly: a resolver that answers with a public address
 * now and a private one on the next lookup (DNS rebinding) is not caught,
 * because `fetch` performs its own lookup. Closing that needs a custom
 * dispatcher that pins the checked address; it is not done here.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const FORBIDDEN_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa'];
const FORBIDDEN_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata']);

/** @param {string} ip dotted IPv4 */
function ipv4IsPrivate(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;          // this-net, RFC1918, loopback
  if (a === 100 && b >= 64 && b <= 127) return true;         // CGNAT 100.64/10
  if (a === 169 && b === 254) return true;                   // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;          // RFC1918
  if (a === 192 && b === 168) return true;                   // RFC1918
  if (a === 192 && b === 0) return true;                     // 192.0.0.0/24 + 192.0.2.0/24 (TEST-NET)
  if (a === 198 && (b === 18 || b === 19)) return true;      // benchmarking
  if (a >= 224) return true;                                 // multicast + reserved + broadcast
  return false;
}

/** @param {string} ip IPv6 text form */
function ipv6IsPrivate(ip) {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;                // unspecified, loopback
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique-local fc00::/7
  if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true; // link-local fe80::/10
  if (s.startsWith('ff')) return true;                       // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms
  const m = s.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return ipv4IsPrivate(m[1]);
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16); const lo = parseInt(hex[2], 16);
    return ipv4IsPrivate(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

/** True when the address must never be fetched on a tenant's behalf. */
export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return ipv4IsPrivate(ip);
  if (v === 6) return ipv6IsPrivate(ip);
  return true; // not an address at all — treat as unsafe
}

/** True when the hostname is a local/internal name or a private literal. */
export function isForbiddenHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (FORBIDDEN_HOSTS.has(h)) return true;
  if (FORBIDDEN_HOST_SUFFIXES.some((suf) => h.endsWith(suf))) return true;
  // URL.hostname wraps IPv6 literals in brackets.
  const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (net.isIP(bare)) return isPrivateAddress(bare);
  // A bare-number or hex/octal host ("2130706433", "0x7f000001", "0177.0.0.1")
  // is how a literal 127.0.0.1 sneaks past a string check. WHATWG URL parsing
  // normalises these to dotted form for http(s), so anything still numeric
  // here is malformed — refuse it.
  if (/^[0-9x.]+$/i.test(bare)) return true;
  return false;
}

const refuse = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'URL_NOT_ALLOWED' });

/**
 * Scheme / credentials / hostname-shape check. Throws with statusCode 400.
 * @param {string} input
 * @returns {URL}
 */
export function assertPublicHttpUrlSync(input) {
  let url;
  try { url = new URL(String(input)); } catch { throw refuse('Not a valid URL'); }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw refuse('Only http and https URLs are allowed');
  if (url.username || url.password) throw refuse('Credentials in the URL are not allowed');
  if (isForbiddenHost(url.hostname)) throw refuse('URLs pointing at local or private network addresses are not allowed');
  return url;
}

/**
 * Full check: shape, then every resolved address. Throws with statusCode 400.
 * @param {string} input
 * @param {{ lookup?: typeof dnsLookup }} [deps] test seam
 * @returns {Promise<URL>}
 */
export async function assertPublicHttpUrl(input, { lookup = dnsLookup } = {}) {
  const url = assertPublicHttpUrlSync(input);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return url; // literal already judged above
  let addrs;
  try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw refuse('The URL host could not be resolved'); }
  if (!addrs?.length) throw refuse('The URL host could not be resolved');
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) throw refuse('URLs pointing at local or private network addresses are not allowed');
  }
  return url;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
/** Never carried to a different origin: the tenant gave them to the first host, not the next. */
const CREDENTIAL_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'x-api-key'];

/**
 * `fetch` for a URL a tenant typed, with EVERY hop checked, not just the first.
 *
 * Checking the URL and then calling a plain `fetch` let the check be walked
 * around with one redirect: a public host answering `302 Location:
 * http://169.254.169.254/...` was followed straight to the metadata service,
 * and the custom-API tester handed the response body back to the tenant.
 * Redirects are followed by hand here instead, each target re-checked
 * (including DNS) before it is requested.
 *
 * Follows fetch's own rules for the method: 303, and 301/302 after a POST,
 * continue as a bodiless GET. Credential headers are dropped when the origin
 * changes.
 *
 * @param {string} input
 * @param {RequestInit} [init] `redirect` is ignored — this function owns it
 * @param {{ lookup?: typeof dnsLookup, fetchImpl?: typeof fetch, maxRedirects?: number }} [deps] test seams
 * @returns {Promise<Response>}
 */
export async function fetchPublicUrl(input, init = {}, { lookup = dnsLookup, fetchImpl = fetch, maxRedirects = MAX_REDIRECTS } = {}) {
  let url = await assertPublicHttpUrl(input, { lookup });
  let method = String(init.method || 'GET').toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers ?? {});

  for (let hop = 0; ; hop += 1) {
    const res = await fetchImpl(url.toString(), { ...init, method, body, headers, redirect: 'manual' });
    const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get('location') : null;
    if (!location) return res;
    if (hop >= maxRedirects) throw refuse('Too many redirects');

    const next = await assertPublicHttpUrl(new URL(location, url).toString(), { lookup });
    await res.body?.cancel().catch(() => {});

    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    if (next.origin !== url.origin) CREDENTIAL_HEADERS.forEach((h) => headers.delete(h));
    url = next;
  }
}
