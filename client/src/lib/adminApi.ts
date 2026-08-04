import { safeGet } from '@/lib/authStorage';

/**
 * Transport for every /admin call.
 *
 * Extracted from AdminPanel.tsx so the console's pages share one implementation
 * rather than each re-declaring the same fetch wrapper. Intentionally the SAME
 * transport the panel already used — react-query sits on top of this for
 * caching, it does not replace it, so there is only ever one way an admin
 * request is made.
 */
const API = (path: string) => `/api/v1/admin${path}`;

export async function adminFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const token = safeGet('token');
  const res = await fetch(API(path), {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

/** Build a query string, dropping empty values so filters stay out of the URL. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
