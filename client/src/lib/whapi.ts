const BASE = '/api/v1';

import { getAuth, clearAuth } from './authStorage';
export { getAuth };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    const err = await res.json().catch(() => ({}));
    let errMsg = (err as any).message ?? (err as any).error ?? `Request failed: ${res.status}`;
    if ((err as any).debug) {
      errMsg += ` [DEBUG: ${JSON.stringify((err as any).debug)}]`;
    }
    
    if (res.status === 401) {
      // Session genuinely expired/invalid — centralized logout is correct here
      // (unlike the removed pre-request workspace redirect, which fired on
      // transient storage misses). Clear BOTH storages, not just localStorage.
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
