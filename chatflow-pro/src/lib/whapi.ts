const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

function getAuth() {
  return {
    token: localStorage.getItem('token') ?? '',
    workspaceId: localStorage.getItem('workspaceId') ?? '',
  };
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
