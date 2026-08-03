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

/** Inject the Checkout script once; concurrent callers share one load. */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load the payment form')));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null; // allow a retry after a transient network failure
      reject(new Error('Could not load the payment form. Check your connection and try again.'));
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
