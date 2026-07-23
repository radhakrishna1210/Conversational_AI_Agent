const BASE = '/api/v1';

import { getAuth, clearAuth, getRefreshToken, setTokens } from './authStorage';
export { getAuth };

/**
 * Single in-flight refresh promise. Access tokens expire after ~15 min; without
 * this, a burst of API calls hitting 401 at once would each fire /auth/refresh
 * in parallel. Because the backend ROTATES refresh tokens (revoking the old on
 * every refresh), only the first call would succeed and the rest would fail with
 * a now-revoked token — force-logging the user out. Serializing means one
 * refresh happens and every waiter reuses its result.
 */
let refreshInFlight: Promise<string | null> | null = null;

/** Attempt to mint a new access token from the stored refresh token. Returns the
 *  new access token on success, or null if refresh is impossible/failed. */
async function refreshAccessToken(): Promise<string | null> {
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

async function request<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const { token, workspaceId } = getAuth();

  if (!workspaceId) {
    // No hard navigation from inside a library call (a transient storage miss
    // used to bounce logged-in users to /login mid-page). If there is no token
    // at all the route guard will redirect; here we just fail the request
    // with a clear, catchable error.
    if (!token) {
      const err = new Error('Not logged in.');
      (err as any).code = 'NO_AUTH';
      throw err;
    }
    const err = new Error('Your session is missing workspace context. Please log out and back in.');
    (err as any).code = 'NO_WORKSPACE';
    throw err;
  }

  const url = `${BASE}/workspaces/${workspaceId}${path}`;
  const headers: Record<string, string> = {};

  if (options.headers) {
    const incomingHeaders = new Headers(options.headers);
    incomingHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await safeFetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 && !_retried) {
      // Access token likely just expired. Try once to mint a new one from the
      // refresh token and replay the request. Only if that fails do we treat the
      // session as genuinely dead and log out. This is what keeps users from
      // being bounced to /login every ~15 min mid-session.
      const newToken = await refreshAccessToken();
      if (newToken) {
        return request<T>(path, options, true);
      }
    }

    const err = await res.json().catch(() => ({}));
    let errMsg = (err as any).message ?? (err as any).error ?? `Request failed: ${res.status}`;
    if ((err as any).debug) {
      errMsg += ` [DEBUG: ${JSON.stringify((err as any).debug)}]`;
    }

    if (res.status === 401) {
      // Refresh was impossible or also rejected — session is genuinely
      // expired/invalid. Clear BOTH storages, not just localStorage.
      clearAuth();
      window.location.href = '/login';
    }

    throw new Error(errMsg);
  }
  // 204 No Content (e.g. DELETE) and other empty bodies have no JSON to
  // parse — res.json() would throw "Unexpected end of JSON input" on an
  // otherwise successful request.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// Improve network error messages for easier debugging
async function safeFetch(url: string, opts: RequestInit) {
  try {
    return await fetch(url, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling ${url}: ${msg}`);
  }
}

// Replace direct fetch usage with safeFetch to provide clearer errors
// (keeps request above unchanged for successful paths)

export const whapi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
