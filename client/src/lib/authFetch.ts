/**
 * authFetch — the one authenticated transport for calls that are NOT scoped to a
 * workspace (the admin console, mostly). Workspace calls go through whapi, which
 * shares this module's refresh so there is exactly ONE refresh path in the app.
 *
 * Why this exists: access tokens live ~15 min (JWT_ACCESS_EXPIRES_IN). whapi has
 * always refreshed-and-replayed on 401, so the customer dashboard survives it.
 * The admin console called fetch() directly with a bearer token and no refresh,
 * so once that 15-min token expired every panel request started failing and the
 * operator had to log in again — while the 7-day refresh token sat unused in
 * storage. Every admin call must go through here.
 */
import { getRefreshToken, setTokens, clearAuth, safeGet } from './authStorage';

const BASE = '/api/v1';

/**
 * Single in-flight refresh promise, module-level so ALL callers (whapi + admin)
 * share it. The backend ROTATES refresh tokens — it revokes the old one on every
 * /auth/refresh — so two concurrent refreshes mean the second presents a token
 * the first just revoked and the session dies. Serializing is not an
 * optimisation here; it is what keeps the session alive.
 */
let refreshInFlight: Promise<string | null> | null = null;

/** Mint a new access token from the stored refresh token. Returns the new access
 *  token, or null if refresh is impossible/failed. */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data?.accessToken) return null;
      // Persist the rotated pair (new access + new refresh token).
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Session is genuinely dead — drop both storages and bounce to login once. */
function endSession(): void {
  clearAuth();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

/**
 * fetch() with the bearer token attached, one transparent refresh-and-replay on
 * 401, and a real logout when that refresh also fails. Returns the raw Response
 * so callers keep control of body parsing and non-401 error handling.
 */
export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const send = (token: string) => {
    const headers = new Headers(opts.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    // FormData must keep the browser-generated multipart boundary.
    if (opts.body && !(opts.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(url, { ...opts, headers });
  };

  const res = await send(safeGet('token'));
  if (res.status !== 401) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) {
    endSession();
    return res;
  }

  const replayed = await send(newToken);
  if (replayed.status === 401) endSession();
  return replayed;
}
