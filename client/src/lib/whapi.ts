const BASE = '/api/v1';

function getAuth() {
  const token = localStorage.getItem('token') ?? '';
  let workspaceId = localStorage.getItem('workspaceId') ?? '';
  
  if (workspaceId === 'undefined' || workspaceId === 'null') {
    workspaceId = '';
  }
  
  // Auto-recover workspaceId from token if it's missing in localStorage
  if (!workspaceId && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.workspaceId) {
        workspaceId = payload.workspaceId;
        localStorage.setItem('workspaceId', workspaceId);
      }
    } catch (_) {}
  }

  return { token, workspaceId };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, workspaceId } = getAuth();
  const url = `${BASE}/workspaces/${workspaceId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
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

export const whapi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
