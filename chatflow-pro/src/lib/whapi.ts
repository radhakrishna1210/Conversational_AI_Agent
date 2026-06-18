const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

function getAuth() {
  return {
    token: localStorage.getItem('token') ?? '',
    // default to public workspace when not set to avoid malformed URLs
    workspaceId: localStorage.getItem('workspaceId') ?? 'public',
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, workspaceId } = getAuth();
  const url = `${BASE}/workspaces/${workspaceId}${path}`;
  // debug log to help track 404s
  // eslint-disable-next-line no-console
  console.debug('whapi request', { url, options });
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error('whapi error', { status: res.status, url, body: text });
    const err = (() => {
      try { return JSON.parse(text); } catch { return null; }
    })();
    throw new Error((err as any)?.message ?? (err as any)?.error ?? `Request failed: ${res.status}`);
  }
  // Some endpoints return empty body (204 No Content) — handle gracefully
  if (res.status === 204) return Promise.resolve({} as T);
  const text = await res.text().catch(() => '');
  if (!text) return Promise.resolve({} as T);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // Fallback: return empty object when JSON parse fails
    // eslint-disable-next-line no-console
    console.warn('whapi: failed to parse JSON response, returning empty object', { url, status: res.status });
    return Promise.resolve({} as T);
  }
}

export const whapi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
