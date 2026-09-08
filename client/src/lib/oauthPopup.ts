/**
 * Run an OAuth connect in a popup, falling back to a full-page redirect.
 *
 * Why both: a popup is much better for someone who already has an account —
 * the page they were working on stays exactly where it was, with whatever they
 * had half-configured still on screen. But a first-time user has to sign up,
 * and signing up means leaving for an email inbox to fetch a verification code.
 * A small popup is a bad place to be doing that: people close it, or the link in
 * the email opens a new tab and orphans it.
 *
 * So the popup is the optimistic path and it *escalates*. The provider tells us
 * when it cannot finish without a full signup, and we take over the whole window
 * at that point. The user never has to know which case they were in, and never
 * has to declare up front whether they already have an account — which they
 * should not have to, and which we have no way to know.
 *
 * ── The message contract ─────────────────────────────────────────────────────
 * The popup ends its life on OUR origin: the provider redirects to our backend
 * callback, which redirects to `${CLIENT_URL}/integrations?connected=1&…`. That
 * page detects it is in a popup and posts the result back (see Integrations.tsx).
 * So the success and denial paths need nothing from the provider at all.
 *
 * Escalation is the one case that does. A provider's consent page, on finding no
 * session to consent with, posts:
 *
 *   { source: 'spandan-oauth', status: 'escalate' }
 *
 * to `window.opener`, and closes itself. Anything else — a provider that does
 * not know about this — simply shows its own login inside the popup, which still
 * works; it is just a smaller window than we would have liked.
 */

export type OAuthPopupResult =
  | { status: 'success' }
  | { status: 'error'; message: string }
  /** The provider cannot finish here; the caller should do a full-page redirect. */
  | { status: 'escalate' }
  /** The user closed the popup, or it never opened. Not an error to report loudly. */
  | { status: 'dismissed' }
  /** A popup blocker stopped us; the caller must redirect instead. */
  | { status: 'blocked' };

const POPUP_W = 520;
const POPUP_H = 700;

/** Centre on the window the user is actually looking at, not on screen 0. */
function popupFeatures(): string {
  const dualLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualTop = window.screenTop ?? window.screenY ?? 0;
  const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
  const left = Math.round(dualLeft + (width - POPUP_W) / 2);
  const top = Math.round(dualTop + (height - POPUP_H) / 2);
  return `scrollbars=yes,resizable=yes,width=${POPUP_W},height=${POPUP_H},top=${top},left=${left}`;
}

/**
 * @param authorizationUrl where the provider wants the user sent
 * @param providerOrigin   the provider's origin, so a message from anywhere else
 *                         is ignored. Derived from authorizationUrl by default.
 */
export function openOAuthPopup(authorizationUrl: string, providerOrigin?: string): Promise<OAuthPopupResult> {
  // Must be called synchronously inside the click handler or every popup blocker
  // refuses it. The caller is responsible for not awaiting anything first.
  const popup = window.open(authorizationUrl, 'spandan-oauth', popupFeatures());
  if (!popup || popup.closed) return Promise.resolve({ status: 'blocked' });

  let expectedProviderOrigin = providerOrigin;
  if (!expectedProviderOrigin) {
    try { expectedProviderOrigin = new URL(authorizationUrl).origin; } catch { expectedProviderOrigin = ''; }
  }

  return new Promise<OAuthPopupResult>((resolve) => {
    let settled = false;

    const finish = (result: OAuthPopupResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closeWatch);
      try { popup.close(); } catch { /* already gone, or cross-origin at this instant */ }
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      // Two checks, and both matter. Origin, so a page in another tab cannot
      // fake a successful connection; and source, so only the window we opened
      // is heard. Our own origin is accepted because the popup finishes on it.
      const trusted = event.origin === window.location.origin || (!!expectedProviderOrigin && event.origin === expectedProviderOrigin);
      if (!trusted || event.source !== popup) return;

      const data = event.data as { source?: string; status?: string; message?: string } | null;
      if (!data || data.source !== 'spandan-oauth') return;

      if (data.status === 'success') return finish({ status: 'success' });
      if (data.status === 'escalate') return finish({ status: 'escalate' });
      if (data.status === 'error') return finish({ status: 'error', message: data.message || 'Connection failed.' });
    };

    window.addEventListener('message', onMessage);

    // The user can always just close it. There is no event for that, so poll —
    // without this the promise never settles and the button spins forever.
    const closeWatch = window.setInterval(() => {
      if (popup.closed) finish({ status: 'dismissed' });
    }, 400);
  });
}

/**
 * Called by the page the popup lands on. Reports the outcome to the opener and
 * closes. Returns false when not in a popup, so the caller renders normally.
 */
export function reportOAuthResultToOpener(result: { status: 'success' | 'error'; message?: string }): boolean {
  const opener = window.opener as Window | null;
  if (!opener || opener === window) return false;
  try {
    opener.postMessage({ source: 'spandan-oauth', ...result }, window.location.origin);
    window.close();
    return true;
  } catch {
    // Opened from another origin, or the opener is gone. Fall back to rendering
    // the page normally rather than leaving a blank popup sitting there.
    return false;
  }
}
