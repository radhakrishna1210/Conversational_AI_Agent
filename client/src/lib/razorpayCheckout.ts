/**
 * Razorpay Checkout loader (BUG-002).
 *
 * The wallet is credited by the server-side webhook, NOT by anything here.
 * This module's only job is to open Checkout and report the outcome so the UI
 * can stop spinning. `verify` confirms the signature server-side purely so we
 * can show "paid" honestly — a client claiming success can never move money.
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }
}

let loader: Promise<void> | null = null;

/**
 * Nothing about loading a 100KB script should take this long. The timeout is
 * not really about slow networks — it is the guarantee that this promise ALWAYS
 * settles, because the caller disables the Pay button until it does and a
 * promise that never settles leaves that button reading "Opening payment…"
 * forever, with no error and nothing to retry.
 */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Inject the Checkout script once; concurrent callers share one load.
 *
 * WHY THIS IS NOT A THREE-LINE SCRIPT LOADER
 * ------------------------------------------
 * The previous version, on finding an existing <script> for this src, attached
 * load/error listeners to it and waited. Those events had ALREADY fired — a DOM
 * event does not replay for a listener that arrives late — so the promise never
 * settled. That turned the ordinary "first attempt failed, user clicks again"
 * path into a permanent hang: attempt one reported an error honestly, and every
 * attempt after it spun forever on the dead element attempt one left behind.
 *
 * So a previous attempt's element is REMOVED rather than adopted. Reaching this
 * point means no load is in flight (an in-flight one is held in `loader` and
 * returned above), so there is nothing to interrupt.
 */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    // Whatever is there is finished and failed, or `window.Razorpay` would exist.
    document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)?.remove();

    const script = document.createElement('script');
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      loader = null;  // a retry must re-inject, not wait on this dead element
      reject(new Error(message));
    };

    const timer = setTimeout(
      () => fail('The payment form is taking too long to load. Check your connection and try again.'),
      LOAD_TIMEOUT_MS,
    );

    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (settled) return;
      // Loaded but the global is missing: the response was not the script we
      // asked for (a captive portal, a proxy error page). Treating that as
      // success just moves the failure to `new window.Razorpay(...)`.
      if (!window.Razorpay) {
        fail('The payment form loaded incorrectly. Please reload the page and try again.');
        return;
      }
      settled = true;
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      // Also how a Content-Security-Policy block surfaces — which is what made
      // this fail on the deployed site while working on every dev machine, where
      // the Vite dev server sends no CSP at all. See RAZORPAY_CSP in app.js.
      fail('Could not load the payment form. An ad blocker, browser extension, or network restriction may be blocking checkout.razorpay.com.');
    };
    document.body.appendChild(script);
  });
  return loader;
}

export interface CheckoutParams {
  orderId: string;
  amountCents: number;
  currency: string;
  razorpayKeyId: string;
  workspaceName?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export interface CheckoutResult {
  orderId: string;
  paymentId: string;
  signature: string;
}

/**
 * Open Checkout and resolve when the customer completes payment.
 *
 * Rejects with `code: 'DISMISSED'` if they close the modal — that is a normal
 * outcome, not an error, and the caller should not show a failure message for
 * it. A dismissed modal also does NOT mean the payment failed: it may already
 * be in flight, which is why the caller re-reads the balance either way.
 */
export function openCheckout(params: CheckoutParams): Promise<CheckoutResult> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Payment form is not loaded'));
      return;
    }
    const rzp = new window.Razorpay({
      key: params.razorpayKeyId,
      order_id: params.orderId,
      amount: params.amountCents,
      currency: params.currency,
      name: params.workspaceName || 'Wallet top-up',
      description: 'Add credits to your workspace wallet',
      prefill: params.prefill ?? {},
      handler: (response: Record<string, string>) => {
        resolve({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          const err = new Error('Payment cancelled') as Error & { code?: string };
          err.code = 'DISMISSED';
          reject(err);
        },
      },
    });
    rzp.open();
  });
}
