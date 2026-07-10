/**
 * Safe storage helper that reads and writes from localStorage,
 * falling back to sessionStorage if localStorage is blocked or unavailable
 * (e.g., in private/incognito browsing modes).
 */

export function getStorageItem(key: string): string {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
  } catch (_) {}
  try {
    const val = sessionStorage.getItem(key);
    if (val !== null) return val;
  } catch (_) {}
  return '';
}

export function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    return;
  } catch (_) {}
  try {
    sessionStorage.setItem(key, value);
  } catch (_) {}
}

export function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}
