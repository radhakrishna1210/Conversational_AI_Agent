const BASE = '/api/v1';

function getAuth() {
  // Read from localStorage first, fall back to sessionStorage (for mobile private/incognito mode)
  const safeGet = (key: string): string => {
    try { return localStorage.getItem(key) ?? ''; } catch { /* blocked */ }
    try { return sessionStorage.getItem(key) ?? ''; } catch { /* blocked */ }
    return '';
  };

  const token = safeGet('token');
  let workspaceId = safeGet('workspaceId');
  
  if (workspaceId === 'undefined' || workspaceId === 'null') {
    workspaceId = '';
  }
  
  // Auto-recover workspaceId from token if it's missing in storage
  if (!workspaceId && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.workspaceId) {
        workspaceId = payload.workspaceId;
        try { localStorage.setItem('workspaceId', workspaceId); } catch {
          try { sessionStorage.setItem('workspaceId', workspaceId); } catch { /* blocked */ }
        }
      }
    } catch (_) {}
  }

  return { token, workspaceId };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, workspaceId } = getAuth();

  if (!workspaceId) {
    // Don't make a broken request — redirect to login so user can re-authenticate
    window.location.href = '/login';
    throw new Error('No workspace ID found. Please log in again.');
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
      localStorage.removeItem('token');
      localStorage.removeItem('workspaceId');
      window.location.href = '/login';
    }
    
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
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
