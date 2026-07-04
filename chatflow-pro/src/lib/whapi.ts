const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

function decodeJwtPayload(token: string) {
  try {
    const [, payload] = token.split('.');
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(decoded.split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join(''))));
  } catch {
    return null;
  }
}

function getAuth() {
  const token = localStorage.getItem('token') ?? '';
  let workspaceId = localStorage.getItem('workspaceId') ?? '';

  if (workspaceId === 'undefined' || workspaceId === 'null') {
    workspaceId = '';
    localStorage.removeItem('workspaceId');
  }

  if (!workspaceId && token) {
    const jwtPayload = decodeJwtPayload(token);
    if (jwtPayload?.workspaceId) {
      workspaceId = jwtPayload.workspaceId;
      localStorage.setItem('workspaceId', workspaceId);
    }
  }

  return {
    token,
    workspaceId,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, workspaceId } = getAuth();
  if (!workspaceId) {
    throw new Error('Missing workspaceId. Please sign in again to reestablish your workspace context.');
  }

  const url = `${BASE}/workspaces/${workspaceId}${path}`;
  // eslint-disable-next-line no-console
  console.debug('whapi request', { method: options.method ?? 'GET', url, workspaceId, body: options.body });
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
    throw new Error((err as any).message ?? (err as any).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const whapi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
