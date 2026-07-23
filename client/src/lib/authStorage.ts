/**
 * authStorage — the single source of truth for auth/session state on the client.
 *
 * Fixes two whole classes of bugs:
 *  1. Storage divergence: login could fall back to sessionStorage (Safari/incognito)
 *     while other code read only localStorage. Every read/write now goes through
 *     safeGet/safeSet which try localStorage first and fall back to sessionStorage.
 *  2. JWT decoding: payload segments are base64url (RFC 7515), not plain base64.
 *     Raw atob() fails on '-' / '_' characters and missing padding, silently
 *     breaking workspace recovery. decodeJwtPayload normalizes correctly.
 */

export function safeGet(key: string): string {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* localStorage blocked */ }
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch { /* sessionStorage blocked */ }
  return '';
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    return;
  } catch { /* blocked — fall through */ }
  try { sessionStorage.setItem(key, value); } catch { /* both blocked */ }
}

export function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

/** Decode a JWT payload segment safely (base64url + padding). Returns null on failure. */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const seg = token.split('.')[1];
    if (!seg) return null;
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // Handle UTF-8 payloads correctly
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getToken(): string {
  return safeGet('token');
}

export function getRefreshToken(): string {
  const v = safeGet('refreshToken');
  return v === 'undefined' || v === 'null' ? '' : v;
}

/**
 * Persist a freshly-issued token pair. The backend rotates refresh tokens on
 * every /auth/refresh (the old one is revoked), so we MUST overwrite the stored
 * refresh token each time or the next refresh will fail with the revoked token.
 */
export function setTokens(accessToken: string, refreshToken?: string): void {
  if (accessToken) safeSet('token', accessToken);
  if (refreshToken) safeSet('refreshToken', refreshToken);
}

/** Get workspaceId, recovering it from the JWT and re-caching when missing. */
export function getWorkspaceId(): string {
  let workspaceId = safeGet('workspaceId');
  if (workspaceId === 'undefined' || workspaceId === 'null') workspaceId = '';

  if (!workspaceId) {
    const token = getToken();
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload?.workspaceId) {
        workspaceId = String(payload.workspaceId);
        safeSet('workspaceId', workspaceId);
      }
    }
  }
  return workspaceId;
}

export function getUserRole(): string {
  const stored = safeGet('userRole');
  if (stored) return stored;
  const payload = decodeJwtPayload(getToken());
  return payload?.role ? String(payload.role) : '';
}

/** True only for the platform owner (Superadmin). Gates the /admin panel UI. */
export function isAdminRole(role?: string): boolean {
  const r = String(role ?? getUserRole()).trim().toLowerCase();
  return r === 'superadmin';
}

export function getAuth(): { token: string; workspaceId: string } {
  return { token: getToken(), workspaceId: getWorkspaceId() };
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function clearAuth(): void {
  ['token', 'refreshToken', 'workspaceId', 'userName', 'userEmail', 'userRole'].forEach(safeRemove);
}
